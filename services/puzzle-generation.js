const OpenAI = require('openai');
const fs = require('fs').promises;
const path = require('path');
const S3Service = require('./s3-service');

class PuzzleGenerationService {
    constructor(dbService) {
        this.dbService = dbService;
        this.openai = null;
        this.isGenerating = false;
        this.generationQueue = [];
        this.s3Service = new S3Service();
    }

    // Initialize OpenAI client
    getOpenAI() {
        if (!this.openai) {
            if (!process.env.OPENAI_API_KEY) {
                throw new Error('OPENAI_API_KEY environment variable is required');
            }
            this.openai = new OpenAI({
                apiKey: process.env.OPENAI_API_KEY
            });
        }
        return this.openai;
    }

    // Generate ID
    generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }

    // Main puzzle generation method
    async generatePuzzleForBoard(boardTypeId, targetDate = null) {
        try {
            console.log(`🎯 Starting puzzle generation for board type: ${boardTypeId}`);
            
            // Get board type configuration
            const boardTypes = await this.dbService.getBoardTypes();
            const boardType = boardTypes.find(bt => bt.id === boardTypeId);
            
            if (!boardType) {
                throw new Error(`Board type ${boardTypeId} not found`);
            }

            const puzzleDate = targetDate || new Date().toISOString().split('T')[0];
            
            // Check if puzzle already exists for this date and board type
            const existingPuzzle = await this.checkExistingDailyPuzzle(boardTypeId, puzzleDate);
            if (existingPuzzle) {
                console.log(`⏭️  Puzzle already exists for ${boardTypeId} on ${puzzleDate}`);
                return existingPuzzle;
            }

            // Generate puzzle content using AI
            console.log(`🤖 Generating AI content for ${boardType.name}...`);
            const puzzleData = await this.generatePuzzleContent(boardType);
            
            // Validate the generated content
            await this.validatePuzzleContent(puzzleData);
            
            // Generate images for each group
            console.log(`🎨 Generating images for ${puzzleData.groups.length} groups...`);
            const groupsWithImages = await this.generateImagesForGroups(puzzleData.groups);
            
            // Create and save the board
            const boardId = await this.createBoardFromPuzzle(boardType, groupsWithImages, puzzleDate);
            
            // Schedule as daily puzzle if this is for daily generation
            if (targetDate) {
                await this.scheduleDailyPuzzle(boardTypeId, puzzleDate, boardId);
            }

            console.log(`✅ Successfully generated puzzle ${boardId} for ${boardTypeId} on ${puzzleDate}`);
            
            return {
                boardId,
                boardTypeId,
                puzzleDate,
                success: true,
                groupCount: groupsWithImages.length,
                wordCount: groupsWithImages.reduce((total, group) => total + group.words.length, 0)
            };

        } catch (error) {
            console.error(`❌ Failed to generate puzzle for ${boardTypeId}:`, error);
            
            // Log the failure in database
            await this.logGenerationFailure(boardTypeId, targetDate, error);
            
            throw error;
        }
    }

    // Generate puzzle content using OpenAI with prompt caching
    async generatePuzzleContent(boardType, retryCount = 0) {
        const { commonPrompt, boardSpecificPrompt } = this.buildCachedPrompt(boardType, retryCount > 0);
        
        const completion = await this.getOpenAI().chat.completions.create({
            model: "gpt-4o", // Using latest model for better quality
            messages: [
                {
                    role: "system",
                    content: commonPrompt,
                    cache_control: { type: "ephemeral" } // Cache the common part
                },
                {
                    role: "user",
                    content: boardSpecificPrompt
                }
            ],
            temperature: 0.8,
            max_tokens: 2000,
            response_format: { type: "json_object" }
        });

        const result = JSON.parse(completion.choices[0].message.content);
        console.log(`📝 Generated ${result.groups.length} word groups (attempt ${retryCount + 1})`);
        
        // Check for duplicate words
        const allWords = [];
        result.groups.forEach(group => {
            group.words.forEach(word => {
                allWords.push(word.text.toLowerCase());
            });
        });
        
        const uniqueWords = [...new Set(allWords)];
        if (uniqueWords.length !== allWords.length) {
            console.log(`⚠️ Duplicate words detected: ${allWords.length - uniqueWords.length} duplicates`);
            
            if (retryCount < 2) { // Retry up to 2 times
                console.log(`🔄 Retrying puzzle generation (attempt ${retryCount + 2})`);
                return await this.generatePuzzleContent(boardType, retryCount + 1);
            } else {
                throw new Error(`Failed to generate unique words after ${retryCount + 1} attempts. Found ${allWords.length - uniqueWords.length} duplicate words.`);
            }
        }
        
        return result;
    }

    // Build cached prompt structure
    buildCachedPrompt(boardType, isRetry = false) {
        const commonPrompt = `You are an expert puzzle creator for WORDSNPICS, a family-friendly word-image matching game.

WORD DISTRIBUTION REQUIREMENTS:
- Image 1: exactly 6 words
- Image 2: exactly 5 words  
- Image 3: exactly 4 words
- Image 4: exactly 3 words
- Image 5: exactly 2 words
Total: 20 distinct words

DIFFICULTY DISTRIBUTION:
- 9 words: Easy (familiar to ages 10+)
- 7 words: Medium (requires some knowledge)
- 4 words: Hard (challenging but fair)
Randomly distribute difficulties across all 5 images.

IMAGE STYLE:
Soft, whimsical children's book illustration style with gentle brush strokes, pastel watercolor colors, rounded shapes, and expressive friendly characters. Warm, family-friendly, imaginative storytelling feel. Include: soft brush textures, pastel tones, hand-drawn feel, expressive rounded forms, storybook illustration, gentle lighting. Medium resolution, full bleed (no borders/framing).

RESPONSE FORMAT - Return valid JSON exactly like this:
{
  "groups": [
    {
      "id": "group1",
      "theme": "Brief theme name (2-4 words)",
      "narrative": "Clear explanation of how these 6 words connect (2-3 sentences)",
      "scene": "Detailed scene description for image generation that symbolically represents the connection (3-4 sentences, focus on visual metaphors not literal word representation)",
      "words": [
        {"text": "word1", "difficulty": "Easy"},
        {"text": "word2", "difficulty": "Medium"},
        {"text": "word3", "difficulty": "Hard"},
        {"text": "word4", "difficulty": "Easy"},
        {"text": "word5", "difficulty": "Easy"},
        {"text": "word6", "difficulty": "Medium"}
      ]
    },
    {
      "id": "group2", 
      "theme": "Brief theme name",
      "narrative": "Clear explanation of how these 5 words connect",
      "scene": "Detailed scene description for image generation",
      "words": [
        {"text": "word7", "difficulty": "Easy"},
        {"text": "word8", "difficulty": "Medium"},
        {"text": "word9", "difficulty": "Hard"},
        {"text": "word10", "difficulty": "Easy"},
        {"text": "word11", "difficulty": "Medium"}
      ]
    },
    {
      "id": "group3",
      "theme": "Brief theme name", 
      "narrative": "Clear explanation of how these 4 words connect",
      "scene": "Detailed scene description for image generation",
      "words": [
        {"text": "word12", "difficulty": "Easy"},
        {"text": "word13", "difficulty": "Medium"},
        {"text": "word14", "difficulty": "Hard"},
        {"text": "word15", "difficulty": "Easy"}
      ]
    },
    {
      "id": "group4",
      "theme": "Brief theme name",
      "narrative": "Clear explanation of how these 3 words connect", 
      "scene": "Detailed scene description for image generation",
      "words": [
        {"text": "word16", "difficulty": "Easy"},
        {"text": "word17", "difficulty": "Medium"},
        {"text": "word18", "difficulty": "Hard"}
      ]
    },
    {
      "id": "group5",
      "theme": "Brief theme name",
      "narrative": "Clear explanation of how these 2 words connect",
      "scene": "Detailed scene description for image generation", 
      "words": [
        {"text": "word19", "difficulty": "Easy"},
        {"text": "word20", "difficulty": "Medium"}
      ]
    }
  ]
}

VALIDATION CHECKLIST before submitting your JSON response:
1. ✓ Exactly 20 unique words total
2. ✓ Exactly 5 groups with 6,5,4,3,2 words respectively  
3. ✓ All words are completely different (no duplicates)
4. ✓ Difficulty distribution: 9 Easy, 7 Medium, 4 Hard
5. ✓ Each group has a clear thematic connection
6. ✓ Scene descriptions are detailed and visual
7. ✓ All words are family-friendly

Return the response as valid JSON format.`;

        const duplicateWarning = isRetry ? `

⚠️ IMPORTANT: The previous response contained duplicate words. You MUST ensure all 20 words are completely unique and different. Check carefully that no word appears twice across all groups.` : '';

        const boardSpecificPrompt = `Create a ${boardType.name} themed puzzle following the above requirements.

BOARD-SPECIFIC GUIDANCE:
${boardType.prompt}${duplicateWarning}

Generate 5 thematic groups with the exact word counts specified (6,5,4,3,2) and distribute the difficulties randomly across all groups. Return your response in JSON format.`;

        return { commonPrompt, boardSpecificPrompt };
    }

    // Build the generation prompt based on board type (legacy method)
    buildGenerationPrompt(boardType) {
        return `Create a ${boardType.name} themed WORDSNPICS puzzle with exactly 20 words divided into 5 groups of 4 words each.

CRITICAL REQUIREMENTS:
- EXACTLY 20 unique words total (4 words per group × 5 groups)
- Every word must be completely different - NO DUPLICATES anywhere
- All words must be family-friendly and suitable for ages 8+
- Clear thematic connections within each group, but not obvious at first glance

BOARD TYPE CONTEXT:
Name: ${boardType.name}
Description: ${boardType.description || ''}
One-liner: ${boardType.one_liner || ''}
${boardType.prompt ? `Specific Requirements: ${boardType.prompt}` : ''}

DIFFICULTY DISTRIBUTION (across all 20 words):
- 8 Easy words (common, well-known)
- 8 Medium words (require some thinking)
- 4 Hard words (challenging but solvable)

Each group should have a mix of difficulties, NOT grouped by difficulty level.

RESPONSE FORMAT - Return valid JSON exactly like this:
{
  "puzzleTitle": "Descriptive title for this specific puzzle",
  "puzzleDate": "${new Date().toISOString().split('T')[0]}",
  "groups": [
    {
      "id": "group1",
      "theme": "Brief theme name (2-4 words)",
      "narrative": "Clear explanation of how these 4 words connect (2-3 sentences)",
      "scene": "Detailed scene description for image generation that symbolically represents the connection (3-4 sentences, focus on visual metaphors not literal word representation)",
      "words": [
        {"text": "word1", "difficulty": "Easy"},
        {"text": "word2", "difficulty": "Medium"},
        {"text": "word3", "difficulty": "Medium"},
        {"text": "word4", "difficulty": "Hard"}
      ]
    },
    {
      "id": "group2",
      "theme": "Brief theme name",
      "narrative": "Clear explanation of how these 4 words connect",
      "scene": "Detailed scene description for image generation",
      "words": [
        {"text": "word5", "difficulty": "Easy"},
        {"text": "word6", "difficulty": "Easy"},
        {"text": "word7", "difficulty": "Medium"},
        {"text": "word8", "difficulty": "Hard"}
      ]
    },
    {
      "id": "group3",
      "theme": "Brief theme name",
      "narrative": "Clear explanation of how these 4 words connect",
      "scene": "Detailed scene description for image generation",
      "words": [
        {"text": "word9", "difficulty": "Easy"},
        {"text": "word10", "difficulty": "Medium"},
        {"text": "word11", "difficulty": "Medium"},
        {"text": "word12", "difficulty": "Hard"}
      ]
    },
    {
      "id": "group4",
      "theme": "Brief theme name",
      "narrative": "Clear explanation of how these 4 words connect",
      "scene": "Detailed scene description for image generation",
      "words": [
        {"text": "word13", "difficulty": "Easy"},
        {"text": "word14", "difficulty": "Easy"},
        {"text": "word15", "difficulty": "Medium"},
        {"text": "word16", "difficulty": "Medium"}
      ]
    },
    {
      "id": "group5",
      "theme": "Brief theme name",
      "narrative": "Clear explanation of how these 4 words connect",
      "scene": "Detailed scene description for image generation",
      "words": [
        {"text": "word17", "difficulty": "Easy"},
        {"text": "word18", "difficulty": "Easy"},
        {"text": "word19", "difficulty": "Medium"},
        {"text": "word20", "difficulty": "Hard"}
      ]
    }
  ]
}

VALIDATION CHECKLIST before submitting:
1. ✓ Exactly 20 unique words total
2. ✓ Exactly 5 groups with 4 words each
3. ✓ All words are completely different (no duplicates)
4. ✓ Difficulty distribution: 8 Easy, 8 Medium, 4 Hard
5. ✓ Each group has a clear thematic connection
6. ✓ Scene descriptions are detailed and visual
7. ✓ All words are family-friendly`;
    }

    // Validate generated puzzle content
    async validatePuzzleContent(puzzleData) {
        const errors = [];

        // Check structure
        if (!puzzleData.groups || !Array.isArray(puzzleData.groups)) {
            errors.push('Missing or invalid groups array');
        }

        if (puzzleData.groups.length !== 5) {
            errors.push(`Expected 5 groups, got ${puzzleData.groups.length}`);
        }

        // Collect all words to check for duplicates
        const allWords = [];
        let totalWordCount = 0;
        const difficultyCount = { Easy: 0, Medium: 0, Hard: 0 };

        const expectedCounts = [6, 5, 4, 3, 2]; // Expected word counts for each group

        puzzleData.groups.forEach((group, index) => {
            if (!group.words || !Array.isArray(group.words)) {
                errors.push(`Group ${index + 1} missing words array`);
                return;
            }

            const expectedCount = expectedCounts[index];
            if (group.words.length !== expectedCount) {
                errors.push(`Group ${index + 1} has ${group.words.length} words, expected ${expectedCount}`);
            }

            group.words.forEach(word => {
                if (!word.text || !word.difficulty) {
                    errors.push(`Invalid word structure in group ${index + 1}`);
                    return;
                }

                allWords.push(word.text.toLowerCase());
                totalWordCount++;
                
                if (difficultyCount.hasOwnProperty(word.difficulty)) {
                    difficultyCount[word.difficulty]++;
                } else {
                    errors.push(`Invalid difficulty "${word.difficulty}" in group ${index + 1}`);
                }
            });

            // Check required fields
            if (!group.theme || !group.narrative || !group.scene) {
                errors.push(`Group ${index + 1} missing required fields (theme, narrative, or scene)`);
            }
        });

        // Check for duplicates
        const uniqueWords = [...new Set(allWords)];
        if (uniqueWords.length !== allWords.length) {
            errors.push(`Duplicate words detected. Found ${allWords.length - uniqueWords.length} duplicates`);
        }

        // Check total word count
        if (totalWordCount !== 20) {
            errors.push(`Expected 20 total words, got ${totalWordCount}`);
        }

        // Check difficulty distribution: 9 Easy, 7 Medium, 4 Hard
        if (difficultyCount.Easy !== 9) {
            errors.push(`Expected 9 Easy words, got ${difficultyCount.Easy}`);
        }
        if (difficultyCount.Medium !== 7) {
            errors.push(`Expected 7 Medium words, got ${difficultyCount.Medium}`);
        }
        if (difficultyCount.Hard !== 4) {
            errors.push(`Expected 4 Hard words, got ${difficultyCount.Hard}`);
        }

        if (errors.length > 0) {
            throw new Error(`Puzzle validation failed:\n${errors.join('\n')}`);
        }

        console.log(`✅ Puzzle validation passed: ${totalWordCount} words, difficulties: Easy(${difficultyCount.Easy}) Medium(${difficultyCount.Medium}) Hard(${difficultyCount.Hard})`);
    }

    // Generate images for all groups
    async generateImagesForGroups(groups) {
        const groupsWithImages = [];

        for (let i = 0; i < groups.length; i++) {
            const group = groups[i];
            console.log(`🎨 Generating image ${i + 1}/5 for theme: ${group.theme}`);
            
            try {
                const imageUrl = await this.generateImageForGroup(group, i);
                groupsWithImages.push({
                    ...group,
                    imageUrl: imageUrl
                });
                
                // Small delay between image generations to avoid rate limits
                if (i < groups.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            } catch (error) {
                console.error(`Failed to generate image for group ${i + 1}:`, error);
                throw new Error(`Image generation failed for group "${group.theme}": ${error.message}`);
            }
        }

        return groupsWithImages;
    }

    // Generate image for a single group
    async generateImageForGroup(group, groupIndex) {
        const imagePrompt = this.buildImagePrompt(group);
        
        const response = await this.getOpenAI().images.generate({
            model: "dall-e-3",
            prompt: imagePrompt,
            n: 1,
            size: "1792x1024",
            response_format: "b64_json"
        });

        if (response.data[0] && response.data[0].b64_json) {
            const imageB64 = response.data[0].b64_json;
            const imageBuffer = Buffer.from(imageB64, "base64");
            const fileName = `daily-${group.id}-${Date.now()}.png`;
            
            // Upload to S3 or local storage
            const imageUrl = await this.s3Service.uploadImage(imageBuffer, fileName);
            console.log(`🎨 Image uploaded: ${imageUrl}`);
            
            return imageUrl;
        } else {
            throw new Error('Failed to generate image - no data received from DALL-E');
        }
    }

    // Build image generation prompt
    buildImagePrompt(group) {
        return `Create a children's book illustration in soft, whimsical style for a word puzzle game.

STYLE REQUIREMENTS:
- Soft, whimsical children's picture book illustration style
- Gentle brush strokes with pastel or watercolor-like colors
- Rounded shapes and expressive but friendly characters
- Warm, family-friendly, imaginative storytelling feel
- Soft brush textures with hand-drawn feel
- Pastel tones or watercolor wash effect
- Expressive, rounded forms with gentle lighting
- Medium resolution, full bleed (no borders or framing)
- Landscape format (1792x1024) taking up entire carousel width
- NO text, letters, or readable words anywhere in the image
- Avoid sharp contrast or hyperrealism

SCENE TO ILLUSTRATE:
${group.scene}

THEME CONTEXT: ${group.theme}
Connection: ${group.narrative}

VISUAL APPROACH:
- Focus on symbolic/metaphorical representation of the theme
- Abstract or conceptual rather than literal word depiction
- Sophisticated artistic composition suitable for puzzle solving
- Clear central focus with supporting atmospheric elements
- Vintage illustration techniques with cross-hatching and stippling`;
    }

    // Create board from generated puzzle
    async createBoardFromPuzzle(boardType, groupsWithImages, puzzleDate) {
        const boardId = this.generateId();
        const title = groupsWithImages[0]?.puzzleTitle || 
                     `${boardType.name} Puzzle - ${puzzleDate}`;
        
        // Create board record
        const boardData = {
            id: boardId,
            boardTypeId: boardType.id,
            title: title,
            date: puzzleDate,
            difficulty: 'medium',
            isPublished: true,
            isDaily: true,
            scheduledDate: puzzleDate
        };
        
        await this.dbService.createBoard(boardData);
        
        // Create images and words
        let wordIdCounter = 1;
        
        for (let groupIndex = 0; groupIndex < groupsWithImages.length; groupIndex++) {
            const group = groupsWithImages[groupIndex];
            const imageId = `${boardId}_img${groupIndex + 1}`;
            
            // Create image record
            await this.dbService.createPuzzleImage({
                id: imageId,
                boardId: boardId,
                theme: group.theme,
                narrative: group.narrative,
                matchCount: group.words.length,
                url: group.imageUrl,
                sortOrder: groupIndex
            });
            
            // Create word records
            for (let wordIndex = 0; wordIndex < group.words.length; wordIndex++) {
                const word = group.words[wordIndex];
                await this.dbService.createPuzzleWord({
                    id: `${boardId}_w${wordIdCounter++}`,
                    boardId: boardId,
                    imageId: imageId,
                    text: word.text,
                    difficulty: word.difficulty,
                    sortOrder: wordIndex
                });
            }
        }
        
        console.log(`💾 Board ${boardId} saved with ${groupsWithImages.length} images and ${wordIdCounter - 1} words`);
        return boardId;
    }

    // Check if daily puzzle already exists
    async checkExistingDailyPuzzle(boardTypeId, puzzleDate) {
        try {
            // Check daily_puzzles table first
            const query = `
                SELECT dp.*, b.title, b.id as board_id
                FROM daily_puzzles dp
                JOIN boards b ON dp.board_id = b.id
                WHERE dp.board_type_id = ? AND dp.puzzle_date = ?
            `;
            
            // Since we're using sql.js, we need to implement this check differently
            // For now, we'll check if a board exists for this date and type
            const boards = await this.dbService.getAllBoards(boardTypeId);
            const existingBoard = boards.find(board => 
                board.scheduled_date === puzzleDate && board.is_daily
            );
            
            return existingBoard ? { boardId: existingBoard.id, exists: true } : null;
        } catch (error) {
            console.error('Error checking existing puzzle:', error);
            return null;
        }
    }

    // Schedule daily puzzle
    async scheduleDailyPuzzle(boardTypeId, puzzleDate, boardId) {
        try {
            // Add to daily_puzzles table
            const releaseTime = this.calculateReleaseTime(puzzleDate);
            
            // Note: This would need to be implemented in the database service
            console.log(`📅 Scheduled daily puzzle: ${boardId} for ${boardTypeId} on ${puzzleDate} at ${releaseTime}`);
            
            // For now, we'll just log this. In a full implementation, this would insert into daily_puzzles table
        } catch (error) {
            console.error('Error scheduling daily puzzle:', error);
        }
    }

    // Calculate UTC release time for puzzle
    calculateReleaseTime(puzzleDate) {
        const date = new Date(puzzleDate);
        date.setUTCHours(12, 0, 0, 0); // 12:00 UTC release time
        return date.toISOString();
    }

    // Log generation failure
    async logGenerationFailure(boardTypeId, targetDate, error) {
        try {
            // In a full implementation, this would log to puzzle_generation_queue table
            console.error(`📝 Logged generation failure: ${boardTypeId} on ${targetDate}`, error.message);
        } catch (logError) {
            console.error('Failed to log generation failure:', logError);
        }
    }

    // Generate puzzles for all active board types (daily automation)
    async generateDailyPuzzles(targetDate = null) {
        const puzzleDate = targetDate || new Date().toISOString().split('T')[0];
        console.log(`🌅 Starting daily puzzle generation for ${puzzleDate}`);
        
        try {
            const boardTypes = await this.dbService.getBoardTypes();
            const activeBoardTypes = boardTypes.filter(bt => bt.is_active);
            
            console.log(`Found ${activeBoardTypes.length} active board types`);
            
            const results = [];
            
            for (const boardType of activeBoardTypes) {
                try {
                    console.log(`🎯 Generating daily puzzle for ${boardType.name}...`);
                    const result = await this.generatePuzzleForBoard(boardType.id, puzzleDate);
                    results.push({ boardType: boardType.name, ...result });
                } catch (error) {
                    console.error(`❌ Failed to generate puzzle for ${boardType.name}:`, error);
                    results.push({ 
                        boardType: boardType.name, 
                        success: false, 
                        error: error.message 
                    });
                }
                
                // Delay between board types to avoid rate limits
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
            
            const successCount = results.filter(r => r.success).length;
            console.log(`✅ Daily generation complete: ${successCount}/${activeBoardTypes.length} puzzles generated successfully`);
            
            return results;
        } catch (error) {
            console.error('❌ Daily puzzle generation failed:', error);
            throw error;
        }
    }
}

module.exports = PuzzleGenerationService;