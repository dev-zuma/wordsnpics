const express = require('express');
const router = express.Router();
const dbService = require('../database/wordsnpics-db');
const wordsnpicsDb = require('../database/wordsnpics-db');

// Get today's daily puzzle
router.get('/puzzle/daily', async (req, res) => {
  try {
    // Add cache-busting headers
    res.set({
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    });
    
    // Get today's daily board from database
    const board = await dbService.getDailyBoard();
    
    if (!board) {
      return res.status(404).json({ error: 'No daily puzzle available' });
    }
    
    // Shuffle words to randomize board layout
    const shuffleArray = (array) => {
      const shuffled = [...array];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      return shuffled;
    };
    
    // Return puzzle without the narratives for gameplay (security)
    const gamePuzzle = {
      boardId: board.id,
      date: board.date,
      images: board.images.map(img => ({
        id: img.id,
        theme: img.theme,
        matchCount: img.match_count,
        url: img.url
      })),
      words: shuffleArray(board.words).map(word => ({
        id: word.id,
        text: word.text
        // image_id removed for security
      }))
    };
    
    res.json(gamePuzzle);
  } catch (error) {
    console.error('Error loading daily puzzle:', error);
    res.status(500).json({ error: 'Failed to load daily puzzle' });
  }
});

// Get random puzzle (for backwards compatibility with demo endpoint)
router.get('/puzzle/demo', async (req, res) => {
  try {
    
    // Add cache-busting headers
    res.set({
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    });
    
    // Get board type from query parameter, default to 'daily' for WordLinks Daily
    const boardTypeId = req.query.boardType || 'daily';
    
    // Get a random published board from database for the selected board type
    const allBoards = await dbService.getAllBoards(boardTypeId, true);
    
    if (allBoards.length === 0) {
      return res.status(404).json({ error: `No puzzles available for board type: ${boardTypeId}` });
    }
    
    // Select random board
    const randomIndex = Math.floor(Math.random() * allBoards.length);
    const selectedBoard = allBoards[randomIndex];
    
    // Get full board content
    const board = await dbService.getBoardById(selectedBoard.id, true);
    
    // Shuffle words to randomize board layout
    const shuffleArray = (array) => {
      const shuffled = [...array];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      return shuffled;
    };

    // Return puzzle without the narratives for gameplay (security)
    const gamePuzzle = {
      boardId: board.id,
      date: board.date,
      images: board.images.map(img => ({
        id: img.id,
        theme: img.theme,
        matchCount: img.match_count,
        url: img.url
      })),
      words: shuffleArray(board.words).map(word => ({
        id: word.id,
        text: word.text
        // image_id removed for security
      }))
    };
    
    res.json(gamePuzzle);
  } catch (error) {
    console.error('Error loading random puzzle:', error);
    res.status(500).json({ error: 'Failed to load random puzzle', details: error.message });
  }
});

// Get a puzzle by ID
router.get('/puzzle/:id', async (req, res) => {
  try {
    const puzzleId = req.params.id;
    
    // Add cache-busting headers
    res.set({
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    });
    
    // Get board from database
    const board = await dbService.getBoardById(puzzleId, true);
    
    if (!board) {
      return res.status(404).json({ error: 'Puzzle not found' });
    }
    
    // Shuffle words to randomize board layout
    const shuffleArray = (array) => {
      const shuffled = [...array];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      return shuffled;
    };
    
    // Return puzzle without the narratives for gameplay (security)
    const gamePuzzle = {
      boardId: board.id,
      date: board.date,
      images: board.images.map(img => ({
        id: img.id,
        theme: img.theme,
        matchCount: img.match_count,
        url: img.url
      })),
      words: shuffleArray(board.words).map(word => ({
        id: word.id,
        text: word.text
        // image_id removed for security
      }))
    };
    
    res.json(gamePuzzle);
  } catch (error) {
    console.error('Error loading puzzle:', error);
    res.status(404).json({ error: 'Puzzle not found' });
  }
});

// Get list of all puzzles
router.get('/puzzles', async (req, res) => {
  try {
    // Get all published boards from database
    const boards = await dbService.getAllBoards(null, true);
    
    const puzzles = boards.map(board => ({
      id: board.id,
      date: board.date,
      title: board.title,
      difficulty: board.difficulty,
      isDaily: board.is_daily
    }));
    
    res.json(puzzles);
  } catch (error) {
    console.error('Error listing puzzles:', error);
    res.status(500).json({ error: 'Failed to list puzzles' });
  }
});

// Submit game turn for validation
router.post('/game/submit-turn', async (req, res) => {
  try {
    
    const { boardId, placements, turnNumber } = req.body;
    
    if (!boardId || !placements || !turnNumber) {
      return res.status(400).json({ error: 'Missing required fields: boardId, placements, turnNumber' });
    }
    
    // Get the full board data with answers from database
    const board = await dbService.getBoardById(boardId, true);
    
    if (!board) {
      return res.status(404).json({ error: 'Board not found' });
    }
    
    
    // Validate each placement
    const results = { correct: [], incorrect: [] };
    
    Object.entries(placements).forEach(([wordId, imageId]) => {
      const word = board.words.find(w => w.id === wordId);
      if (!word) {
        results.incorrect.push(wordId);
        return;
      }
      
      if (word.image_id === imageId) {
        results.correct.push(wordId);
      } else {
        results.incorrect.push(wordId);
      }
    });
    
    // Return validation results
    res.json({
      success: true,
      turn: turnNumber,
      results: results,
      correctCount: results.correct.length,
      incorrectCount: results.incorrect.length
    });
    
  } catch (error) {
    console.error('Error validating game turn:', error);
    res.status(500).json({ error: 'Failed to validate turn' });
  }
});

// Submit complete game for final scoring
router.post('/game/submit-game', async (req, res) => {
  try {
    const { boardId, gameData, sessionId } = req.body;
    
    if (!boardId || !gameData) {
      return res.status(400).json({ error: 'Missing required fields: boardId, gameData' });
    }
    
    // Get the full board data for final validation
    const board = await dbService.getBoardById(boardId, true);
    
    if (!board) {
      return res.status(404).json({ error: 'Board not found' });
    }
    
    
    // Validate final results
    const finalCorrectWords = new Set();
    const wordTurns = {};
    
    // Process each turn's data
    if (!gameData.turnHistory || gameData.turnHistory.length === 0) {
      // No turn history provided
    }
    
    gameData.turnHistory.forEach(turn => {
      // Handle both field names for backward compatibility
      const turnNumber = turn.turnNumber || turn.turn;
      
      if (turn.placements) {
        Object.entries(turn.placements).forEach(([wordId, imageId]) => {
          const word = board.words.find(w => w.id === wordId);
          if (!word) {
            return;
          }
          
          
          // Database stores the correct image ID in the image_id field
          const expectedImageId = word.image_id;
          if (expectedImageId === imageId) {
            finalCorrectWords.add(wordId);
            if (!wordTurns[wordId]) {
              wordTurns[wordId] = turnNumber;
            }
          } else {
          }
        });
      }
    });
    
    
    const finalScore = {
      boardId: boardId,
      correctWords: finalCorrectWords.size,
      totalWords: board.words.length,
      turns: gameData.turnHistory.length,
      maxTurns: 4,
      timeElapsed: gameData.timeElapsed,
      isWin: finalCorrectWords.size === board.words.length,
      wordTurns: wordTurns,
      sessionId: sessionId || 'anonymous',
      completedAt: new Date().toISOString()
    };
    
    // Store game result in database
    let gameSessionId = null;
    try {
      // Debug: Log session data for game submission
      if (req.isAuthenticated() && !req.session.activeProfile) {
        console.log('WARNING: Authenticated user has no active profile in session');
      }
      
      const gameSessionData = {
        userId: req.isAuthenticated() ? req.user.id : null,
        profileId: req.session.activeProfile ? req.session.activeProfile.id : null,
        sessionId: sessionId || 'anonymous',
        boardId: boardId,
        puzzleDate: board.date,
        puzzleTitle: board.title,
        correctWords: finalScore.correctWords,
        totalWords: finalScore.totalWords,
        turnsUsed: finalScore.turns,
        maxTurns: finalScore.maxTurns,
        timeElapsed: finalScore.timeElapsed,
        isWin: finalScore.isWin,
        wordTurns: finalScore.wordTurns,
        turnHistory: gameData.turnHistory
      };
      
      gameSessionId = await dbService.createGameSession(gameSessionData);
      finalScore.gameSessionId = gameSessionId;

      // Submit game to leagues if user is authenticated and has active profile
      if (req.isAuthenticated() && req.session.activeProfile && gameSessionId) {
        try {
          const LeagueService = require('../services/league-service');
          const leagueService = new LeagueService(dbService);
          await leagueService.submitGameToLeagues(gameSessionId, req.session.activeProfile.id);
        } catch (leagueError) {
          console.error('Error submitting game to leagues:', leagueError);
          // Don't fail the request if league submission fails
        }
      }
      
      // Game session saved successfully
    } catch (dbError) {
      console.error('Error saving game to database:', dbError);
      // Continue without failing the request
    }
    
    res.json({
      success: true,
      score: finalScore,
      message: finalScore.isWin ? 'Congratulations! You solved the puzzle!' : 'Good effort! Try again for a perfect score.'
    });
    
  } catch (error) {
    console.error('Error submitting game:', error);
    res.status(500).json({ error: 'Failed to submit game' });
  }
});

// Create shareable graphic
router.post('/game/create-shareable', async (req, res) => {
    console.log('🔥 CREATE-SHAREABLE ENDPOINT HIT - New version loaded!');
    try {
        const { gameSessionId, imageData, gameResults } = req.body;
        console.log('📝 Request data:', {
            gameSessionId,
            hasImageData: !!imageData,
            hasGameResults: !!gameResults,
            gameResultsKeys: gameResults ? Object.keys(gameResults) : []
        });
        
        if (!imageData || !gameResults) {
            return res.status(400).json({ error: 'Missing required fields: imageData and gameResults are required' });
        }
        
        // If we have a game session string, try to find the database ID
        let actualGameSessionId = gameSessionId;
        
        if (gameSessionId && typeof gameSessionId === 'string' && !gameSessionId.startsWith('temp_')) {
            try {
                // Try to find the game session by session_id string
                const sessionStmt = dbService.db.prepare(`
                    SELECT id FROM game_sessions WHERE session_id = ? ORDER BY completed_at DESC LIMIT 1
                `);
                sessionStmt.bind([gameSessionId]);
                const sessionResult = sessionStmt.step() ? sessionStmt.getAsObject() : null;
                sessionStmt.free();
                
                if (sessionResult) {
                    actualGameSessionId = sessionResult.id;
                    console.log(`Mapped session string ${gameSessionId} to database ID ${actualGameSessionId}`);
                }
            } catch (error) {
                console.error('Error mapping session string to database ID:', error);
            }
        }
        
        // If still no valid ID, create temporary one
        if (!actualGameSessionId) {
            actualGameSessionId = 'temp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        }
        
        // Generate unique ID for shareable graphic
        const shareableId = 'share_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        
        const graphicData = {
            id: shareableId,
            gameSessionId: actualGameSessionId,
            userId: req.isAuthenticated() ? req.user.id : null,
            profileId: req.session.activeProfile ? req.session.activeProfile.id : null,
            boardId: gameResults.boardId,
            graphicData: gameResults,
            imageData: imageData
        };
        
        console.log('Creating shareable graphic with session ID:', actualGameSessionId);
        const shareable = await dbService.createShareableGraphic(graphicData);
        
        res.json({
            success: true,
            shareableId: shareableId,
            shareUrl: `${req.protocol}://${req.get('host')}/share/${shareableId}`
        });
        
    } catch (error) {
        console.error('Error creating shareable graphic:', error);
        console.error('Request data:', { 
            gameSessionId: req.body.gameSessionId, 
            hasImageData: !!req.body.imageData, 
            hasGameResults: !!req.body.gameResults 
        });
        res.status(500).json({ error: 'Failed to create shareable graphic', details: error.message });
    }
});

// Get full board data (for results explanations)
router.get('/board/:id', async (req, res) => {
    try {
        const boardId = req.params.id;
        const board = await dbService.getBoardById(boardId, true);
        
        if (!board) {
            return res.status(404).json({ error: 'Board not found' });
        }
        
        res.json(board);
        
    } catch (error) {
        console.error('Error getting board data:', error);
        res.status(500).json({ error: 'Failed to get board data' });
    }
});

// Clear profile data (development/testing endpoint)
router.post('/clear-profile-data', async (req, res) => {
    try {
        const { userId } = req.body;
        
        // For security, only allow in development or for specific user
        if (process.env.NODE_ENV === 'production' && !userId) {
            return res.status(403).json({ error: 'Not allowed in production' });
        }
        
        await dbService.clearUserProfileData(userId);
        
        res.json({ 
            success: true, 
            message: userId ? `Cleared data for user ${userId}` : 'Cleared all profile data' 
        });
        
    } catch (error) {
        console.error('Error clearing profile data:', error);
        res.status(500).json({ error: 'Failed to clear profile data' });
    }
});

// Clean up duplicate game sessions
router.post('/cleanup-duplicates', async (req, res) => {
    try {
        const userId = req.isAuthenticated() ? req.user.id : req.body.userId;
        
        if (!userId) {
            return res.status(400).json({ error: 'User ID required' });
        }
        
        const duplicatesRemoved = await dbService.cleanupDuplicateGameSessions(userId);
        
        res.json({ 
            success: true, 
            message: `Cleaned up ${duplicatesRemoved} duplicate game sessions`,
            duplicatesRemoved 
        });
        
    } catch (error) {
        console.error('Error cleaning up duplicates:', error);
        res.status(500).json({ error: 'Failed to cleanup duplicates' });
    }
});

// Get available board types
router.get('/board-types', async (req, res) => {
    try {
        const allBoardTypes = await dbService.getBoardTypes();
        
        // Filter to only active board types
        const activeBoardTypes = allBoardTypes.filter(bt => bt.is_active);
        
        // Sort to put WordsNPics Daily first, then others
        const sortedBoardTypes = activeBoardTypes.sort((a, b) => {
            // Check for both possible IDs for WordsNPics Daily
            if (a.id === 'wordsnpicsdaily' || a.id === 'wordsnpics-daily') return -1;
            if (b.id === 'wordsnpicsdaily' || b.id === 'wordsnpics-daily') return 1;
            return a.name.localeCompare(b.name);
        });
        
        res.json(sortedBoardTypes);
    } catch (error) {
        console.error('Error getting board types:', error);
        res.status(500).json({ error: 'Failed to get board types' });
    }
});

// Get daily puzzle for specific board type
router.get('/daily-puzzle/:boardType', async (req, res) => {
  try {
    const { boardType } = req.params;
    const currentDate = new Date().toISOString().split('T')[0];
    
    console.log(`🎮 Daily puzzle request: boardType="${boardType}", date="${currentDate}"`);
    
    // Add cache headers for proper timing
    res.set({
      'Cache-Control': 'public, max-age=300', // 5 minute cache
      'Pragma': 'cache',
      'Last-Modified': new Date().toUTCString()
    });
    
    // Use new database service for daily puzzles
    const wordsnpicsDb = require('../database/wordsnpics-db');
    
    // Get the daily puzzle for today
    const boards = await wordsnpicsDb.getAllBoards(boardType, true);
    console.log(`   Found ${boards.length} boards for boardType="${boardType}"`);
    
    // Find today's daily puzzle
    const dailyBoard = boards.find(board => 
      board.is_daily && 
      board.scheduled_date === currentDate &&
      board.is_published
    );
    
    if (!dailyBoard) {
      console.log(`   ❌ No daily board found for ${boardType} on ${currentDate}`);
      console.log(`   Available boards:`, boards.map(b => ({
        id: b.id,
        scheduled_date: b.scheduled_date,
        is_daily: b.is_daily,
        is_published: b.is_published
      })));
      return res.status(404).json({ 
        error: 'No daily puzzle available',
        message: `No daily puzzle found for ${boardType} on ${currentDate}`,
        availableDate: null
      });
    }
    
    console.log(`   ✅ Found daily board: ${dailyBoard.title} (${dailyBoard.id})`);
    
    // Get full board content
    const fullBoard = await wordsnpicsDb.getBoardById(dailyBoard.id, true);
    
    if (!fullBoard) {
      console.log(`   ❌ Board content not found for ID: ${dailyBoard.id}`);
      return res.status(404).json({ error: 'Board content not found' });
    }
    
    console.log(`   Board has ${fullBoard.images?.length || 0} images and ${fullBoard.words?.length || 0} words`);
    
    // Check if this puzzle should be released yet (12 PM UTC)
    const releaseTime = new Date(`${currentDate}T12:00:00.000Z`);
    const now = new Date();
    
    if (now < releaseTime) {
      const timeUntilRelease = releaseTime.getTime() - now.getTime();
      return res.json({
        available: false,
        releaseTime: releaseTime.toISOString(),
        timeUntilRelease: timeUntilRelease,
        message: 'Today\'s puzzle will be available at 12:00 PM UTC',
        boardType: boardType
      });
    }
    
    // Shuffle words for gameplay
    const shuffleArray = (array) => {
      const shuffled = [...array];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      return shuffled;
    };
    
    // Transform to game format
    const gameBoard = {
      boardId: fullBoard.id,
      date: fullBoard.date,
      title: fullBoard.title,
      scheduledDate: fullBoard.scheduled_date,
      boardType: boardType,
      isDaily: true,
      images: fullBoard.images.map(img => ({
        id: img.id,
        theme: img.theme,
        matchCount: img.match_count,
        url: img.url
      })),
      words: shuffleArray(fullBoard.words).map(word => ({
        id: word.id,
        text: word.text
        // correctImageId removed for security
      }))
    };
    
    res.json({
      available: true,
      releaseTime: releaseTime.toISOString(),
      puzzle: gameBoard
    });
    
  } catch (error) {
    console.error('Error getting daily puzzle:', error);
    res.status(500).json({ error: 'Failed to load daily puzzle' });
  }
});

// Get release schedule for board type
router.get('/daily-schedule/:boardType', async (req, res) => {
  try {
    const { boardType } = req.params;
    const { days = 7 } = req.query; // Default to next 7 days
    
    const wordsnpicsDb = require('../database/wordsnpics-db');
    
    // Get upcoming daily puzzles
    const boards = await wordsnpicsDb.getAllBoards(boardType, true);
    const dailyBoards = boards.filter(board => board.is_daily && board.is_published);
    
    // Create schedule for next N days
    const schedule = [];
    const startDate = new Date();
    
    for (let i = 0; i < parseInt(days); i++) {
      const date = new Date(startDate);
      date.setDate(startDate.getDate() + i);
      const dateStr = date.toISOString().split('T')[0];
      
      const board = dailyBoards.find(b => b.scheduled_date === dateStr);
      const releaseTime = new Date(`${dateStr}T06:00:00.000Z`);
      const now = new Date();
      
      schedule.push({
        date: dateStr,
        releaseTime: releaseTime.toISOString(),
        available: now >= releaseTime,
        hasContent: !!board,
        title: board?.title || null,
        timeUntilRelease: now < releaseTime ? releaseTime.getTime() - now.getTime() : 0
      });
    }
    
    res.json({
      boardType,
      schedule,
      timezone: 'UTC',
      releaseHour: 6
    });
    
  } catch (error) {
    console.error('Error getting daily schedule:', error);
    res.status(500).json({ error: 'Failed to load schedule' });
  }
});

// Get global puzzle timing info
router.get('/puzzle-timing', async (req, res) => {
  try {
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const todayRelease = new Date(`${today}T12:00:00.000Z`);
    
    // Calculate next release
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowDate = tomorrow.toISOString().split('T')[0];
    const nextRelease = new Date(`${tomorrowDate}T12:00:00.000Z`);
    
    const currentPuzzleAvailable = now >= todayRelease;
    
    res.json({
      serverTime: now.toISOString(),
      timezone: 'UTC',
      releaseHour: 12,
      today: {
        date: today,
        releaseTime: todayRelease.toISOString(),
        available: currentPuzzleAvailable,
        timeUntilRelease: currentPuzzleAvailable ? 0 : todayRelease.getTime() - now.getTime()
      },
      next: {
        date: tomorrowDate,
        releaseTime: nextRelease.toISOString(),
        timeUntilRelease: nextRelease.getTime() - now.getTime()
      }
    });
    
  } catch (error) {
    console.error('Error getting puzzle timing:', error);
    res.status(500).json({ error: 'Failed to get timing info' });
  }
});

// Get game results by session ID
router.get('/game/session/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    // Try to find the game session by session_id string
    const stmt = dbService.db.prepare(`
      SELECT gs.*, b.title as puzzle_title
      FROM game_sessions gs
      LEFT JOIN boards b ON gs.board_id = b.id
      WHERE gs.session_id = ?
      ORDER BY gs.completed_at DESC
      LIMIT 1
    `);
    
    stmt.bind([sessionId]);
    const gameSession = stmt.step() ? stmt.getAsObject() : null;
    stmt.free();
    
    if (!gameSession) {
      return res.status(404).json({ error: 'Game session not found' });
    }
    
    // Parse JSON fields
    const wordTurns = gameSession.word_turns ? JSON.parse(gameSession.word_turns) : {};
    const turnHistory = gameSession.turn_history ? JSON.parse(gameSession.turn_history) : [];
    
    // Build results data for the results page
    const results = {
      boardId: gameSession.board_id,
      correct: gameSession.correct_words,
      totalWords: gameSession.total_words,
      turns: gameSession.turns_used,
      maxTurns: gameSession.max_turns,
      time: gameSession.time_elapsed,
      date: gameSession.puzzle_date,
      title: gameSession.puzzle_title,
      wordTurns: wordTurns,
      turnHistory: turnHistory,
      sessionId: gameSession.session_id,
      isWin: gameSession.is_win,
      completedAt: gameSession.completed_at
    };
    
    res.json(results);
    
  } catch (error) {
    console.error('Error fetching game session:', error);
    res.status(500).json({ error: 'Failed to fetch game results' });
  }
});

// Generate results URL from game session ID
router.get('/game/session/:sessionId/results-url', async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    // Get game session
    const stmt = dbService.db.prepare(`
      SELECT gs.*, b.title as puzzle_title
      FROM game_sessions gs
      LEFT JOIN boards b ON gs.board_id = b.id
      WHERE gs.session_id = ?
      ORDER BY gs.completed_at DESC
      LIMIT 1
    `);
    
    stmt.bind([sessionId]);
    const gameSession = stmt.step() ? stmt.getAsObject() : null;
    stmt.free();
    
    if (!gameSession) {
      return res.status(404).json({ error: 'Game session not found' });
    }
    
    // Get board data
    const board = await dbService.getBoardById(gameSession.board_id, true);
    if (!board) {
      return res.status(404).json({ error: 'Board not found' });
    }
    
    // Parse JSON fields
    const wordTurns = gameSession.word_turns ? JSON.parse(gameSession.word_turns) : {};
    const turnHistory = gameSession.turn_history ? JSON.parse(gameSession.turn_history) : [];
    
    // Build URL parameters
    const urlParams = new URLSearchParams();
    urlParams.set('correct', gameSession.correct_words.toString());
    urlParams.set('turns', gameSession.turns_used.toString());
    urlParams.set('time', gameSession.time_elapsed);
    urlParams.set('date', board.date);
    urlParams.set('progress', JSON.stringify(turnHistory));
    urlParams.set('images', JSON.stringify(board.images.map(img => ({
      id: img.id,
      theme: img.theme,
      matchCount: img.match_count,
      url: img.url
    }))));
    urlParams.set('words', JSON.stringify(board.words.map(word => ({
      id: word.id,
      text: word.text
    }))));
    urlParams.set('wordTurns', JSON.stringify(wordTurns));
    urlParams.set('boardId', gameSession.board_id);
    urlParams.set('sessionId', gameSession.session_id);
    urlParams.set('validated', 'true');
    
    const resultsUrl = `/results?${urlParams.toString()}`;
    
    res.json({ 
      resultsUrl,
      gameSession: {
        id: gameSession.id,
        sessionId: gameSession.session_id,
        score: `${gameSession.correct_words}/${gameSession.total_words}`,
        isWin: gameSession.is_win
      }
    });
    
  } catch (error) {
    console.error('Error generating results URL:', error);
    res.status(500).json({ error: 'Failed to generate results URL' });
  }
});

// Get daily completion status for a specific board type
router.get('/daily-status/:boardType', async (req, res) => {
  try {
    const { boardType } = req.params;
    
    // Check if user is authenticated
    if (!req.isAuthenticated() || !req.session.activeProfile) {
      return res.json({
        hasCompleted: false,
        gameSession: null,
        userAuthenticated: false
      });
    }
    
    const userId = req.user.id;
    const profileId = req.session.activeProfile.id;
    
    // Check completion status for this board type
    const completion = await dbService.hasUserCompletedTodaysPuzzle(userId, profileId, boardType);
    
    res.json({
      ...completion,
      userAuthenticated: true,
      boardType: boardType
    });
    
  } catch (error) {
    console.error('Error getting daily status:', error);
    res.status(500).json({ error: 'Failed to get daily status' });
  }
});

// Get daily completion status for all board types
router.get('/daily-status', async (req, res) => {
  try {
    // Check if user is authenticated
    if (!req.isAuthenticated() || !req.session.activeProfile) {
      return res.json({
        userAuthenticated: false,
        completionStatus: {}
      });
    }
    
    const userId = req.user.id;
    const profileId = req.session.activeProfile.id;
    
    // Get completion status for all board types
    const completionStatus = await dbService.getUserDailyCompletionStatus(userId, profileId);
    
    res.json({
      userAuthenticated: true,
      completionStatus: completionStatus
    });
    
  } catch (error) {
    console.error('Error getting daily completion status:', error);
    res.status(500).json({ error: 'Failed to get daily completion status' });
  }
});

// Get shareable graphics for a profile
router.get('/profile-graphics/:profileId', async (req, res) => {
  try {
    const { profileId } = req.params;
    
    const stmt = dbService.db.prepare(`
      SELECT sg.id, sg.game_session_id, gs.session_id, gs.correct_words, gs.total_words, gs.completed_at
      FROM shareable_graphics sg
      LEFT JOIN game_sessions gs ON sg.game_session_id = gs.id
      WHERE sg.profile_id = ?
      ORDER BY sg.created_at DESC
    `);
    
    stmt.bind([profileId]);
    const graphics = [];
    while (stmt.step()) {
      graphics.push(stmt.getAsObject());
    }
    stmt.free();
    
    res.json(graphics);
    
  } catch (error) {
    console.error('Error fetching profile graphics:', error);
    res.status(500).json({ error: 'Failed to fetch graphics' });
  }
});

module.exports = router;