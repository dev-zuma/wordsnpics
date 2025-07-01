const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const path = require('path');
const OpenAI = require('openai');
const PuzzleGenerationService = require('../services/puzzle-generation');
const dbService = require('../database/wordsnpics-db');

// Admin authorization middleware
function requireAdmin(req, res, next) {
  // Check if user is authenticated
  if (!req.isAuthenticated()) {
    return res.status(401).json({ 
      error: 'Authentication required',
      message: 'You must be logged in to access admin features',
      redirectUrl: '/auth/google'
    });
  }

  // Check if user is the authorized admin
  if (req.user.email !== 'adnanzuma@gmail.com') {
    return res.status(403).json({ 
      error: 'Access denied',
      message: 'You do not have permission to access admin features',
      userEmail: req.user.email
    });
  }

  // User is authenticated and authorized
  next();
}
// Simple ID generator
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// Initialize OpenAI (only when needed)
let openai = null;
function getOpenAI() {
  if (!openai) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY environment variable is required for AI features');
    }
    openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
  }
  return openai;
}

// Serve admin pages
router.get('/', requireAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'admin', 'index.html'));
});

router.get('/generate-games', requireAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'admin', 'generate-games.html'));
});

// Keep old route for backward compatibility, redirect to new one
router.get('/generate', requireAdmin, (req, res) => {
  res.redirect('/admin/generate-games');
});

router.get('/view', requireAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'admin', 'view.html'));
});

router.get('/manage-boards', requireAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'admin', 'manage-boards.html'));
});

router.get('/daily-puzzles', requireAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'admin', 'daily-puzzles.html'));
});

// Apply admin middleware to all API routes
router.use('/generate-words', requireAdmin);
router.use('/generate-image', requireAdmin);
router.use('/save-board', requireAdmin);
router.use('/board', requireAdmin);
router.use('/boards', requireAdmin);
router.use('/generate-daily-puzzle', requireAdmin);
router.use('/daily-puzzle-status', requireAdmin);
router.use('/daily-puzzle', requireAdmin);

// Generate words with OpenAI
router.post('/generate-words', async (req, res) => {
  try {
    console.log('Generating words request received');
    console.log('Request body:', req.body);
    console.log('OpenAI API Key present:', !!process.env.OPENAI_API_KEY);
    
    const { boardTypeId } = req.body;
    
    // Get board type to use its specific prompt
    let boardTypePrompt = '';
    if (boardTypeId) {
      const boardTypes = await dbService.getBoardTypes();
      const boardType = boardTypes.find(bt => bt.id === boardTypeId);
      if (boardType && boardType.prompt) {
        boardTypePrompt = `\n\nBOARD-SPECIFIC REQUIREMENTS:\n${boardType.prompt}`;
        console.log('Using board-specific prompt for:', boardType.name);
      }
    }
    
    const prompt = `Generate a word puzzle with exactly 20 DISTINCT words divided into 5 groups for a logic puzzle game. The groups should have 6, 5, 4, 3, and 2 words respectively.

CRITICAL REQUIREMENT - NO DUPLICATE WORDS:
- You MUST generate exactly 20 completely different words
- Every single word must be unique across ALL groups
- Check your output: no word should appear twice anywhere
- If you accidentally repeat a word, you MUST replace it with a different word
- Count carefully: Group 1 (6 words) + Group 2 (5 words) + Group 3 (4 words) + Group 4 (3 words) + Group 5 (2 words) = 20 total DISTINCT words

Additional Requirements:
1. Words should not have obvious relationships at first glance
2. Most words should be well-known (suitable for ages 10+), with only 2-3 less common words total
3. Difficulty distribution across ALL groups: 9 easy, 5 medium, 4 difficult, 2 extremely difficult to match
4. DO NOT make the smallest group automatically the hardest - sprinkle difficulty across all groups
5. Each group should have a specific, clever connection that's not immediately obvious
6. Groups should be themed but in unexpected ways (avoid obvious categories like "animals" or "colors")

For each group, provide:
- A list of words that belong together
- A narrative explanation of how the words are related
- A scene description for a comic book panel that symbolically represents the connection (NOT just showing the words as objects)

The scene should be metaphorical or symbolic, showing the underlying concept that connects the words rather than literally depicting the words themselves.

You MUST return a valid JSON response in this exact format with ALL required fields:
{
  "groups": [
    {
      "id": "group1",
      "wordCount": 6,
      "theme": "Brief theme name",
      "narrative": "Detailed explanation of why these words are connected (2-3 sentences)",
      "scene": "Comic book panel scene description showing a symbolic/metaphorical scene that represents the underlying connection between these words. Do NOT just show the words as objects. Show the concept or process that links them (2-3 sentences)",
      "words": [
        {"text": "word1", "difficulty": "Easy"},
        {"text": "word2", "difficulty": "Easy"},
        {"text": "word3", "difficulty": "Medium"},
        {"text": "word4", "difficulty": "Medium"},
        {"text": "word5", "difficulty": "Hard"},
        {"text": "word6", "difficulty": "Hard"}
      ]
    },
    {
      "id": "group2",
      "wordCount": 5,
      "theme": "Brief theme name",
      "narrative": "Detailed explanation of why these words are connected (2-3 sentences)",
      "scene": "Comic book panel scene description showing a symbolic/metaphorical scene that represents the underlying connection between these words. Do NOT just show the words as objects. Show the concept or process that links them (2-3 sentences)",
      "words": [
        {"text": "word7", "difficulty": "Easy"},
        {"text": "word8", "difficulty": "Easy"},
        {"text": "word9", "difficulty": "Medium"},
        {"text": "word10", "difficulty": "Medium"},
        {"text": "word11", "difficulty": "Hard"}
      ]
    },
    {
      "id": "group3",
      "wordCount": 4,
      "theme": "Brief theme name",
      "narrative": "Detailed explanation of why these words are connected (2-3 sentences)",
      "scene": "Comic book panel scene description showing a symbolic/metaphorical scene that represents the underlying connection between these words. Do NOT just show the words as objects. Show the concept or process that links them (2-3 sentences)",
      "words": [
        {"text": "word12", "difficulty": "Easy"},
        {"text": "word13", "difficulty": "Medium"},
        {"text": "word14", "difficulty": "Medium"},
        {"text": "word15", "difficulty": "Hard"}
      ]
    },
    {
      "id": "group4",
      "wordCount": 3,
      "theme": "Brief theme name",
      "narrative": "Detailed explanation of why these words are connected (2-3 sentences)",
      "scene": "Comic book panel scene description showing a symbolic/metaphorical scene that represents the underlying connection between these words. Do NOT just show the words as objects. Show the concept or process that links them (2-3 sentences)",
      "words": [
        {"text": "word16", "difficulty": "Easy"},
        {"text": "word17", "difficulty": "Medium"},
        {"text": "word18", "difficulty": "Hard"}
      ]
    },
    {
      "id": "group5",
      "wordCount": 2,
      "theme": "Brief theme name",
      "narrative": "Detailed explanation of why these words are connected (2-3 sentences)",
      "scene": "Comic book panel scene description showing a symbolic/metaphorical scene that represents the underlying connection between these words. Do NOT just show the words as objects. Show the concept or process that links them (2-3 sentences)",
      "words": [
        {"text": "word19", "difficulty": "Medium"},
        {"text": "word20", "difficulty": "Hard"}
      ]
    }
  ]
}

CRITICAL VALIDATION CHECKLIST:
1. You must include the "scene" field for every group. Do not omit it. The scene should be symbolic/metaphorical, not literal.
2. Each word must be an object with "text" and "difficulty" fields: {"text": "word", "difficulty": "Easy|Medium|Hard"}
3. Use exactly these difficulty values: "Easy", "Medium", "Hard" (no other spellings)
4. Distribute difficulties: 9-10 Easy, 6-7 Medium, 4-5 Hard across all groups
5. MOST IMPORTANT: Verify all 20 words are completely unique - no word appears twice anywhere in your response.
6. Double-check word count: exactly 6+5+4+3+2=20 distinct words total.

Before submitting your response, scan through all words to ensure zero duplicates and proper difficulty format.${boardTypePrompt}`;

    const completion = await getOpenAI().chat.completions.create({
      model: "gpt-4.1-nano",
      messages: [
        {
          role: "system",
          content: "You are a creative puzzle designer specializing in word association games. Create clever, non-obvious groupings that will challenge players."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.8,
      max_tokens: 1500,
      response_format: { type: "json_object" }
    });

    const result = JSON.parse(completion.choices[0].message.content);
    console.log('Generated words successfully');
    res.json(result);
  } catch (error) {
    console.error('Error generating words:', error);
    res.status(500).json({ error: 'Failed to generate words', details: error.message });
  }
});

// Generate image for a group
router.post('/generate-image', async (req, res) => {
  try {
    console.log('Image generation request received:', req.body);
    const { narrative, theme, groupId, scene } = req.body;
    
    // Common prompt parts for caching
    const commonPrompt = `Create a vintage ink and watercolor wash illustration in storybook/encyclopedia style with the following specifications:

Style Requirements:
- Ink and wash drawing technique with fine line art throughout the composition
- Vintage book illustration aesthetic reminiscent of historical encyclopedias
- Hand-drawn black ink linework as the foundation with delicate precision
- Soft watercolor overlay providing subtle color washes and transparency
- Historical/encyclopedia style that feels academic and scholarly
- Elegant, family-friendly presentation with slightly aged character
- Rectangular format (landscape orientation 1792x1024)
- Game-optimized design suitable for word puzzle display
- No text, letters, or readable words anywhere in the image
- No borders or decorative frames around the illustration

Visual Elements:
- Fine black ink linework defining shapes and details with precision
- Subtle watercolor washes layered over the ink foundation
- Abstract or symbolic rendering of concepts rather than literal representation
- Hand-drawn quality with organic, natural line variations
- Vintage illustration techniques with cross-hatching and stippling where appropriate
- Elegant composition suitable for educational or reference materials
- Sophisticated artistic approach with scholarly feel

Color Palette:
- Muted, sophisticated colors: sepia tones, sage greens, dusty blues, warm ochres
- Soft watercolor overlay effects with natural transparency
- Subtle color washes that complement rather than overpower the ink work
- Vintage color palette reminiscent of aged book illustrations
- Natural color bleeding and organic wash effects
- Earthy, academic tones with slightly weathered appearance

Technical Specifications:
- Fine line art as primary structure with watercolor as secondary element
- Vintage book illustration quality with historical authenticity
- Hand-drawn aesthetic with natural artistic imperfections
- Soft watercolor overlay creating depth and visual interest
- Academic/encyclopedia style suitable for educational content
- Slightly aged feel without being overly distressed

CRITICAL FULL BLEED REQUIREMENTS:
- Image must completely fill the entire 1792x1024 canvas edge-to-edge
- NO white borders, frames, margins, or empty space anywhere
- NO decorative frames around the image
- Artwork should extend to all four edges of the canvas
- Background elements must reach the very edges of the image
- Think "encyclopedia page spread" not "framed artwork" - complete coverage

Scene to illustrate: ${scene || narrative}`;

    console.log('Generating image with DALL-E 3...');
    const response = await getOpenAI().images.generate({
      model: "dall-e-3",
      prompt: commonPrompt,
      n: 1,
      size: "1792x1024",
      response_format: "b64_json"
    });

    console.log('DALL-E 3 response received');
    
    // Check if we got actual image data
    if (response.data[0] && response.data[0].b64_json) {
      const imageB64 = response.data[0].b64_json;
      const fileName = `${groupId}-${Date.now()}.png`;
      const filePath = path.join(__dirname, '..', 'public', 'images', 'generated', fileName);
      
      // Ensure the generated images directory exists
      const generatedDir = path.join(__dirname, '..', 'public', 'images', 'generated');
      await fs.mkdir(generatedDir, { recursive: true });
      
      // Save the base64 image data as PNG
      await fs.writeFile(filePath, Buffer.from(imageB64, "base64"));
      console.log('Image saved to:', filePath);
      
      res.json({ 
        url: `/images/generated/${fileName}`,
        originalUrl: `data:image/png;base64,${imageB64}`
      });
    } else if (response.data[0] && response.data[0].url) {
      // Handle URL response
      const imageUrl = response.data[0].url;
      console.log('Got image URL:', imageUrl);
      res.json({ 
        url: imageUrl,
        originalUrl: imageUrl
      });
    } else {
      // DALL-E returned text instead of image - this shouldn't happen with b64_json format
      console.error('DALL-E returned unexpected format. Retrying with simpler prompt...');
      
      // Retry with simplified scene description while keeping cached common parts
      const simpleRetryPrompt = `Create a vintage ink and watercolor wash illustration in storybook/encyclopedia style with the following specifications:

Style Requirements:
- Ink and wash drawing technique with fine line art throughout the composition
- Vintage book illustration aesthetic reminiscent of historical encyclopedias
- Hand-drawn black ink linework as the foundation with delicate precision
- Soft watercolor overlay providing subtle color washes and transparency
- Historical/encyclopedia style that feels academic and scholarly
- Elegant, family-friendly presentation with slightly aged character
- Rectangular format (landscape orientation 1792x1024)
- Game-optimized design suitable for word puzzle display
- No text, letters, or readable words anywhere in the image
- No borders or decorative frames around the illustration

Visual Elements:
- Fine black ink linework defining shapes and details with precision
- Subtle watercolor washes layered over the ink foundation
- Abstract or symbolic rendering of concepts rather than literal representation
- Hand-drawn quality with organic, natural line variations
- Vintage illustration techniques with cross-hatching and stippling where appropriate
- Elegant composition suitable for educational or reference materials
- Sophisticated artistic approach with scholarly feel

Color Palette:
- Muted, sophisticated colors: sepia tones, sage greens, dusty blues, warm ochres
- Soft watercolor overlay effects with natural transparency
- Subtle color washes that complement rather than overpower the ink work
- Vintage color palette reminiscent of aged book illustrations
- Natural color bleeding and organic wash effects
- Earthy, academic tones with slightly weathered appearance

Technical Specifications:
- Fine line art as primary structure with watercolor as secondary element
- Vintage book illustration quality with historical authenticity
- Hand-drawn aesthetic with natural artistic imperfections
- Soft watercolor overlay creating depth and visual interest
- Academic/encyclopedia style suitable for educational content
- Slightly aged feel without being overly distressed

CRITICAL FULL BLEED REQUIREMENTS:
- Image must completely fill the entire 1792x1024 canvas edge-to-edge
- NO white borders, frames, margins, or empty space anywhere
- NO decorative frames around the image
- Artwork should extend to all four edges of the canvas
- Background elements must reach the very edges of the image
- Think "encyclopedia page spread" not "framed artwork" - complete coverage

Scene to illustrate: Vintage ink and wash illustration representing ${theme}`;

      const retryResponse = await getOpenAI().images.generate({
        model: "dall-e-3",
        prompt: simpleRetryPrompt,
        n: 1,
        size: "1792x1024",
        response_format: "b64_json"
      });
      
      if (retryResponse.data[0] && retryResponse.data[0].b64_json) {
        const imageB64 = retryResponse.data[0].b64_json;
        const fileName = `${groupId}-${Date.now()}.png`;
        const filePath = path.join(__dirname, '..', 'public', 'images', 'generated', fileName);
        
        const generatedDir = path.join(__dirname, '..', 'public', 'images', 'generated');
        await fs.mkdir(generatedDir, { recursive: true });
        
        await fs.writeFile(filePath, Buffer.from(imageB64, "base64"));
        console.log('Retry image saved to:', filePath);
        
        res.json({ 
          url: `/images/generated/${fileName}`,
          originalUrl: `data:image/png;base64,${imageB64}`
        });
      } else {
        throw new Error('Failed to generate image even with simplified prompt');
      }
    }
  } catch (error) {
    console.error('Error generating image:', error);
    console.error('Full error details:', JSON.stringify(error, null, 2));
    
    // Save error details for debugging
    const errorFileName = `${groupId}-${Date.now()}.txt`;
    const errorFilePath = path.join(__dirname, '..', 'public', 'images', 'generated', errorFileName);
    await fs.writeFile(errorFilePath, `Error: ${error.message}\n\nFull error: ${JSON.stringify(error, null, 2)}\n\nPrompt used: ${imagePrompt}`);
    
    res.status(500).json({ error: 'Failed to generate image', details: error.message });
  }
});

// Save a complete board
router.post('/save-board', async (req, res) => {
  try {
    const { title, groups, boardTypeId } = req.body;
    const boardId = generateId();
    const date = new Date().toISOString().split('T')[0];
    
    // Create board in database
    const boardData = {
      id: boardId,
      boardTypeId: boardTypeId || 'wordlinks-daily',
      title: title,
      date: date,
      difficulty: 'medium',
      isPublished: true,
      isDaily: false,
      scheduledDate: null
    };
    
    await dbService.createBoard(boardData);
    
    // Transform and save images and words
    let wordIdCounter = 1;
    
    for (let groupIndex = 0; groupIndex < groups.length; groupIndex++) {
      const group = groups[groupIndex];
      const imageId = `${boardId}_img${groupIndex + 1}`;
      
      // Create image record
      await dbService.createPuzzleImage({
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
        await dbService.createPuzzleWord({
          id: `${boardId}_w${wordIdCounter++}`,
          boardId: boardId,
          imageId: imageId,
          text: word.text,
          difficulty: word.difficulty || 'Medium',
          sortOrder: wordIndex
        });
      }
    }
    
    console.log(`Board ${boardId} saved to database successfully`);
    res.json({ success: true, boardId: boardId });
  } catch (error) {
    console.error('Error saving board:', error);
    res.status(500).json({ error: 'Failed to save board', details: error.message });
  }
});

// Get full board details (for admin view)
router.get('/board/:id', async (req, res) => {
  try {
    const boardId = req.params.id;
    
    // Get board from database with full content
    const board = await dbService.getBoardById(boardId, true);
    
    if (!board) {
      return res.status(404).json({ error: 'Board not found' });
    }
    
    // Transform to match old JSON format for admin UI compatibility
    const adminBoard = {
      id: board.id,
      date: board.date,
      title: board.title,
      difficulty: board.difficulty,
      isPublished: board.is_published,
      isDaily: board.is_daily,
      images: board.images.map(img => ({
        id: img.id,
        theme: img.theme,
        narrative: img.narrative,
        matchCount: img.match_count,
        url: img.url
      })),
      words: board.words.map(word => ({
        id: word.id,
        text: word.text,
        correctImageId: word.image_id,
        difficulty: word.difficulty || 'Medium'
      }))
    };
    
    res.json(adminBoard);
  } catch (error) {
    console.error('Error loading board:', error);
    res.status(404).json({ error: 'Board not found' });
  }
});

// Delete a board and its associated images
router.delete('/board/:id', async (req, res) => {
  try {
    const boardId = req.params.id;
    
    // First, load the board to get image URLs
    const board = await dbService.getBoardById(boardId, true);
    if (!board) {
      return res.status(404).json({ error: 'Board not found' });
    }
    
    // Delete associated images from filesystem
    const deletedImages = [];
    for (const image of board.images) {
      if (image.url && image.url.startsWith('/images/generated/')) {
        const imagePath = path.join(__dirname, '..', 'public', image.url);
        try {
          await fs.unlink(imagePath);
          deletedImages.push(image.url);
          console.log(`Deleted image: ${imagePath}`);
        } catch (error) {
          console.warn(`Could not delete image ${imagePath}:`, error.message);
        }
      }
    }
    
    // Delete the board from database (CASCADE will delete images and words)
    await dbService.deleteBoard(boardId);
    console.log(`Deleted board: ${boardId}`);
    
    res.json({ 
      success: true, 
      boardId: boardId,
      deletedImages: deletedImages.length,
      message: `Board ${boardId} and ${deletedImages.length} associated images deleted successfully`
    });
  } catch (error) {
    console.error('Error deleting board:', error);
    res.status(500).json({ error: 'Failed to delete board', details: error.message });
  }
});

// Get board types
router.get('/board-types', async (req, res) => {
  try {
    const boardTypes = await dbService.getBoardTypes();
    res.json(boardTypes);
  } catch (error) {
    console.error('Error loading board types:', error);
    res.status(500).json({ error: 'Failed to load board types' });
  }
});

// Get all boards (for admin list view)
router.get('/boards', async (req, res) => {
  try {
    const { boardType } = req.query;
    const boards = await dbService.getAllBoards(boardType);
    
    // Transform to match admin UI expectations
    const adminBoards = boards.map(board => ({
      id: board.id,
      date: board.date,
      title: board.title,
      boardTypeId: board.board_type_id,
      difficulty: board.difficulty,
      isPublished: board.is_published,
      isDaily: board.is_daily,
      scheduledDate: board.scheduled_date,
      createdAt: board.created_at
    }));
    
    res.json(adminBoards);
  } catch (error) {
    console.error('Error loading boards:', error);
    res.status(500).json({ error: 'Failed to load boards' });
  }
});

// Update board metadata
router.put('/board/:id', async (req, res) => {
  try {
    const boardId = req.params.id;
    const { title, difficulty, isPublished, isDaily, scheduledDate } = req.body;
    
    const updates = {};
    if (title !== undefined) updates.title = title;
    if (difficulty !== undefined) updates.difficulty = difficulty;
    if (isPublished !== undefined) updates.is_published = isPublished;
    if (isDaily !== undefined) updates.is_daily = isDaily;
    if (scheduledDate !== undefined) updates.scheduled_date = scheduledDate;
    
    const updatedBoard = await dbService.updateBoard(boardId, updates);
    
    if (!updatedBoard) {
      return res.status(404).json({ error: 'Board not found' });
    }
    
    res.json({ success: true, board: updatedBoard });
  } catch (error) {
    console.error('Error updating board:', error);
    res.status(500).json({ error: 'Failed to update board', details: error.message });
  }
});

// Create new board type
router.post('/board-type', async (req, res) => {
  try {
    const boardTypeData = req.body;
    
    // Validate required fields
    if (!boardTypeData.id || !boardTypeData.name || !boardTypeData.icon || 
        !boardTypeData.one_liner || !boardTypeData.prompt) {
      return res.status(400).json({ 
        error: 'Missing required fields',
        message: 'All fields (id, name, icon, one_liner, prompt) are required' 
      });
    }
    
    // Check if board type already exists
    const existingBoardTypes = await dbService.getBoardTypes();
    if (existingBoardTypes.find(bt => bt.id === boardTypeData.id)) {
      return res.status(400).json({ 
        error: 'Board type already exists',
        message: `Board type with ID '${boardTypeData.id}' already exists` 
      });
    }
    
    // Create the board type
    await dbService.createBoardType(boardTypeData);
    
    res.json({ success: true, boardType: boardTypeData });
  } catch (error) {
    console.error('Error creating board type:', error);
    res.status(500).json({ error: 'Failed to create board type', details: error.message });
  }
});

// Update board type
router.put('/board-type/:id', async (req, res) => {
  try {
    const boardTypeId = req.params.id;
    const updates = req.body;
    
    // Get existing board type
    const boardTypes = await dbService.getBoardTypes();
    const boardType = boardTypes.find(bt => bt.id === boardTypeId);
    
    if (!boardType) {
      return res.status(404).json({ error: 'Board type not found' });
    }
    
    // Update the board type
    await dbService.updateBoardType(boardTypeId, updates);
    
    res.json({ success: true, boardType: { ...boardType, ...updates } });
  } catch (error) {
    console.error('Error updating board type:', error);
    res.status(500).json({ error: 'Failed to update board type', details: error.message });
  }
});

// Initialize puzzle generation service
let puzzleGenerationService = null;
function getPuzzleService() {
  if (!puzzleGenerationService) {
    const dbService = require('../database/wordsnpics-db');
    puzzleGenerationService = new PuzzleGenerationService(dbService);
  }
  return puzzleGenerationService;
}

// Generate daily puzzle for specific board type and date
router.post('/generate-daily-puzzle', async (req, res) => {
  try {
    const { boardTypeId, targetDate } = req.body;
    
    if (!boardTypeId) {
      return res.status(400).json({ error: 'Board type ID is required' });
    }
    
    console.log(`🎯 Admin request: Generate daily puzzle for ${boardTypeId} on ${targetDate || 'today'}`);
    
    const puzzleService = getPuzzleService();
    const result = await puzzleService.generatePuzzleForBoard(boardTypeId, targetDate);
    
    res.json({
      success: true,
      message: `Daily puzzle generated successfully for ${boardTypeId}`,
      ...result
    });
    
  } catch (error) {
    console.error('Error generating daily puzzle:', error);
    res.status(500).json({ 
      error: 'Failed to generate daily puzzle', 
      message: error.message 
    });
  }
});

// Check daily puzzle status for specific board type and date (path params)
router.get('/daily-puzzle-status/:boardTypeId/:date', async (req, res) => {
  try {
    const { boardTypeId, date } = req.params;
    
    const dbService = require('../database/wordsnpics-db');
    
    // Check if puzzle exists for this date and board type
    const boards = await dbService.getAllBoards(boardTypeId);
    const existingBoard = boards.find(board => 
      board.scheduled_date === date && board.is_daily
    );
    
    if (existingBoard) {
      res.json({
        status: 'generated',
        boardId: existingBoard.id,
        title: existingBoard.title,
        createdAt: existingBoard.created_at,
        isPublished: existingBoard.is_published
      });
    } else {
      res.status(404).json({
        status: 'not_found',
        message: `No daily puzzle found for ${boardTypeId} on ${date}`
      });
    }
    
  } catch (error) {
    console.error('Error checking puzzle status:', error);
    res.status(500).json({ 
      error: 'Failed to check puzzle status', 
      message: error.message 
    });
  }
});

// Check daily puzzle status for specific board type and date (query params)
router.get('/daily-puzzle-status', async (req, res) => {
  try {
    const { boardTypeId, date } = req.query;
    
    if (!boardTypeId || !date) {
      return res.status(400).json({ 
        error: 'Missing required parameters',
        message: 'Both boardTypeId and date are required' 
      });
    }
    
    const dbService = require('../database/wordsnpics-db');
    
    // Check if puzzle exists for this date and board type
    const boards = await dbService.getAllBoards(boardTypeId);
    const existingBoard = boards.find(board => 
      board.scheduled_date === date && board.is_daily
    );
    
    if (existingBoard) {
      res.json({
        exists: true,
        status: 'generated',
        boardId: existingBoard.id,
        title: existingBoard.title,
        createdAt: existingBoard.created_at,
        isPublished: existingBoard.is_published
      });
    } else {
      res.status(404).json({
        exists: false,
        status: 'not_found',
        message: `No daily puzzle found for ${boardTypeId} on ${date}`
      });
    }
    
  } catch (error) {
    console.error('Error checking puzzle status:', error);
    res.status(500).json({ 
      error: 'Failed to check puzzle status', 
      message: error.message 
    });
  }
});

// Get daily puzzle details for specific board type and date (path params)
router.get('/daily-puzzle/:boardTypeId/:date', async (req, res) => {
  try {
    const { boardTypeId, date } = req.params;
    
    const dbService = require('../database/wordsnpics-db');
    
    // Find the board for this date and type
    const boards = await dbService.getAllBoards(boardTypeId);
    const board = boards.find(board => 
      board.scheduled_date === date && board.is_daily
    );
    
    if (!board) {
      return res.status(404).json({
        error: 'Puzzle not found',
        message: `No daily puzzle found for ${boardTypeId} on ${date}`
      });
    }
    
    // Get full board details with images and words
    const fullBoard = await dbService.getBoardById(board.id, true);
    
    if (!fullBoard) {
      return res.status(404).json({ error: 'Board details not found' });
    }
    
    // Get board type info
    const boardTypes = await dbService.getBoardTypes();
    const boardType = boardTypes.find(bt => bt.id === boardTypeId);
    
    // Transform to admin format
    const adminBoard = {
      id: fullBoard.id,
      date: fullBoard.date,
      title: fullBoard.title,
      boardType: boardType ? boardType.name : boardTypeId,
      difficulty: fullBoard.difficulty,
      isPublished: fullBoard.is_published,
      isDaily: fullBoard.is_daily,
      createdAt: fullBoard.created_at,
      scheduled_date: fullBoard.scheduled_date,
      images: fullBoard.images.map(img => ({
        id: img.id,
        theme: img.theme,
        narrative: img.narrative,
        matchCount: img.match_count,
        url: img.url
      })),
      words: fullBoard.words.map(word => ({
        id: word.id,
        text: word.text,
        correct_image_id: word.image_id,
        difficulty: word.difficulty || 'Medium'
      }))
    };
    
    res.json(adminBoard);
    
  } catch (error) {
    console.error('Error getting daily puzzle:', error);
    res.status(500).json({ 
      error: 'Failed to get puzzle details', 
      message: error.message 
    });
  }
});

// Get daily puzzle details for specific board type and date (query params)
router.get('/daily-puzzle', async (req, res) => {
  try {
    const { boardTypeId, date } = req.query;
    
    if (!boardTypeId || !date) {
      return res.status(400).json({ 
        error: 'Missing required parameters',
        message: 'Both boardTypeId and date are required' 
      });
    }
    
    const dbService = require('../database/wordsnpics-db');
    
    // Find the board for this date and type
    const boards = await dbService.getAllBoards(boardTypeId);
    const board = boards.find(board => 
      board.scheduled_date === date && board.is_daily
    );
    
    if (!board) {
      return res.status(404).json({
        error: 'Puzzle not found',
        message: `No daily puzzle found for ${boardTypeId} on ${date}`
      });
    }
    
    // Get full board details with images and words
    const fullBoard = await dbService.getBoardById(board.id, true);
    
    if (!fullBoard) {
      return res.status(404).json({ error: 'Board details not found' });
    }
    
    // Get board type info
    const boardTypes = await dbService.getBoardTypes();
    const boardType = boardTypes.find(bt => bt.id === boardTypeId);
    
    // Transform to admin format
    const adminBoard = {
      id: fullBoard.id,
      date: fullBoard.date,
      title: fullBoard.title,
      boardType: boardType ? boardType.name : boardTypeId,
      difficulty: fullBoard.difficulty,
      is_published: fullBoard.is_published,
      isDaily: fullBoard.is_daily,
      createdAt: fullBoard.created_at,
      scheduled_date: fullBoard.scheduled_date,
      images: fullBoard.images.map(img => ({
        id: img.id,
        theme: img.theme,
        narrative: img.narrative,
        matchCount: img.match_count,
        url: img.url
      })),
      words: fullBoard.words.map(word => ({
        id: word.id,
        text: word.text,
        correct_image_id: word.image_id,
        difficulty: word.difficulty || 'Medium'
      }))
    };
    
    res.json(adminBoard);
    
  } catch (error) {
    console.error('Error getting daily puzzle:', error);
    res.status(500).json({ 
      error: 'Failed to get puzzle details', 
      message: error.message 
    });
  }
});

// Run board migration (one-time setup)
router.post('/migrate-boards', async (req, res) => {
  try {
    console.log('🔄 Running board migration from admin panel...');
    
    const initSqlJs = require('sql.js');
    const fs = require('fs').promises;
    const path = require('path');
    
    // Load old database
    const oldDbPath = path.join(__dirname, '..', 'database', 'wordlinks.db');
    const oldDbBuffer = await fs.readFile(oldDbPath);
    const SQL = await initSqlJs();
    const oldDb = new SQL.Database(new Uint8Array(oldDbBuffer));
    
    // Get existing board types from old database
    const oldBoardTypes = [];
    const stmt = oldDb.prepare('SELECT * FROM board_types ORDER BY name');
    while (stmt.step()) {
        oldBoardTypes.push(stmt.getAsObject());
    }
    stmt.free();
    oldDb.close();
    
    // Apply modifications
    const modifiedBoardTypes = oldBoardTypes.map(bt => {
        const newBoardType = { ...bt };
        
        // Update Americana to be harder
        if (bt.id === 'americana' || bt.name.toLowerCase().includes('americana')) {
            newBoardType.prompt = `Create challenging Americana-themed puzzle groups that require deeper knowledge of American culture, history, and society. Focus on:

- Historical events, figures, and periods that shaped America
- Cultural movements, traditions, and regional characteristics
- Political systems, founding principles, and constitutional concepts
- American innovations, landmarks, and symbols with cultural significance
- Entertainment, sports, and artistic contributions that define American identity

Make the connections more sophisticated and require cultural knowledge beyond surface-level recognition. Include some lesser-known but important elements alongside well-known ones. Each group should test understanding of American heritage rather than just recognition of American things.

Difficulty should be elevated with connections that require historical context, cultural awareness, or deeper knowledge of American society and values.`;
        }
        
        // Change Internet of Things to The Download
        if (bt.id === 'iot' || bt.name.toLowerCase().includes('internet of things')) {
            newBoardType.id = 'the-download';
            newBoardType.name = 'The Download';
            newBoardType.icon = '📥';
            newBoardType.one_liner = 'Today\'s top tech decoded into words.';
            newBoardType.prompt = `For this topic, select themes based on current technology trends, innovations, and digital culture. This includes artificial intelligence, emerging hardware, futuristic transportation, social platforms, data privacy, Web3, software tools, robotics, and other fast-evolving ideas shaping the tech world. Aim for a fun, accessible blend of terms — some widely known, some surprising — that reflect the pace and impact of modern tech.`;
        }
        
        return newBoardType;
    });
    
    // Add the new World Watch board
    modifiedBoardTypes.push({
        id: 'world-watch',
        name: 'World Watch',
        description: 'Politics, pop culture, and global events',
        icon: '🌍',
        one_liner: 'Politics, pop culture, and global events — stay sharp with what\'s shaping the world.',
        prompt: `For this topic, select themes inspired by current events, international affairs, cultural moments, political shifts, viral stories, public movements, global crises, or breakthrough moments in entertainment or society. Keep the concepts broad, interesting, and understandable to a general audience aged 10+. Avoid hyper-local references and ensure each theme reflects something timely or widely discussed.`,
        is_premium: 0,
        is_active: 1
    });
    
    // Clear existing non-default board types and insert new ones
    await dbService.run('DELETE FROM board_types WHERE id NOT IN (?, ?, ?, ?, ?)', 
        ['daily', 'travel', 'food', 'sports', 'animals']);
    
    for (const boardType of modifiedBoardTypes) {
        // Skip if it's one of the basic default types
        if (['daily', 'travel', 'food', 'sports', 'animals'].includes(boardType.id)) {
            continue;
        }
        
        await dbService.run(`
            INSERT OR REPLACE INTO board_types 
            (id, name, description, icon, one_liner, prompt, is_premium, is_active)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            boardType.id,
            boardType.name,
            boardType.description || boardType.one_liner,
            boardType.icon || '🎯',
            boardType.one_liner || boardType.description,
            boardType.prompt || '',
            boardType.is_premium || 0,
            boardType.is_active !== undefined ? boardType.is_active : 1
        ]);
    }
    
    // Convert Internet Things to The Download if it exists
    await dbService.run(`
        UPDATE board_types 
        SET 
            id = 'the-download',
            name = 'The Download',
            description = 'Today''s top tech decoded into words',
            icon = '📥',
            one_liner = 'Today''s top tech decoded into words.',
            prompt = 'For this topic, select themes based on current technology trends, innovations, and digital culture. This includes artificial intelligence, emerging hardware, futuristic transportation, social platforms, data privacy, Web3, software tools, robotics, and other fast-evolving ideas shaping the tech world. Aim for a fun, accessible blend of terms — some widely known, some surprising — that reflect the pace and impact of modern tech.'
        WHERE id = 'internet-things'
    `);
    
    console.log('✅ Board migration completed successfully!');
    
    // Get updated board types to return
    const boardTypes = await dbService.getBoardTypes();
    
    res.json({
      success: true,
      message: `Board migration completed! Found ${boardTypes.length} board types.`,
      boardTypes: boardTypes.map(bt => ({ id: bt.id, name: bt.name, icon: bt.icon }))
    });
    
  } catch (error) {
    console.error('❌ Board migration failed:', error);
    res.status(500).json({ 
      error: 'Failed to migrate boards', 
      message: error.message 
    });
  }
});

// Generate all daily puzzles for today
router.post('/generate-all-daily', async (req, res) => {
  try {
    const { targetDate } = req.body;
    
    console.log(`🌅 Admin request: Generate all daily puzzles for ${targetDate || 'today'}`);
    
    const puzzleService = getPuzzleService();
    const results = await puzzleService.generateDailyPuzzles(targetDate);
    
    const successCount = results.filter(r => r.success).length;
    
    res.json({
      success: true,
      message: `Generated ${successCount}/${results.length} daily puzzles successfully`,
      results: results
    });
    
  } catch (error) {
    console.error('Error generating all daily puzzles:', error);
    res.status(500).json({ 
      error: 'Failed to generate daily puzzles', 
      message: error.message 
    });
  }
});

module.exports = router;