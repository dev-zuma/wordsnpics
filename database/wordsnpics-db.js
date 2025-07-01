const initSqlJs = require('sql.js');
const fs = require('fs').promises;
const path = require('path');

class WordsnpicsDatabaseService {
    constructor() {
        this.db = null;
        this.SQL = null;
        // Use persistent disk in production, local directory in development
        let dbDir = __dirname;
        if (process.env.NODE_ENV === 'production') {
            // Use Render persistent disk mounted at /db
            dbDir = '/db';
        }
        this.dbPath = path.join(dbDir, 'wordsnpics.db');
        console.log('Database path:', this.dbPath);
    }

    async initialize(forceSchema = false) {
        try {
            // Initialize sql.js
            this.SQL = await initSqlJs();
            
            // Create database directory if it doesn't exist
            try {
                await fs.mkdir(path.dirname(this.dbPath), { recursive: true });
                console.log('✅ Database directory ready:', path.dirname(this.dbPath));
            } catch (mkdirError) {
                console.log('⚠️  Directory creation warning:', mkdirError.message);
                // Continue anyway - directory might already exist
            }

            // Try to load existing database file
            let data;
            try {
                const buffer = await fs.readFile(this.dbPath);
                data = new Uint8Array(buffer);
                console.log('📂 Loaded existing database file');
            } catch (error) {
                // Database file doesn't exist, create new one
                data = null;
                console.log('🆕 Creating new database file');
            }

            // Create database instance
            this.db = new this.SQL.Database(data);

            // Enable foreign keys
            this.db.run('PRAGMA foreign_keys = ON');

            // Only run schema during explicit initialization (forceSchema=true) or if database file doesn't exist
            if (forceSchema || !data) {
                console.log('🗂️  Running database schema...');
                const schemaPath = path.join(__dirname, 'wordsnpics-schema.sql');
                const schema = await fs.readFile(schemaPath, 'utf8');
                this.db.run(schema);
                
                // Save database to file after schema creation
                await this.saveDatabase();
                console.log('✅ Database schema applied');
            } else {
                console.log('✅ Connected to existing database (no schema changes)');
            }

            console.log('WORDSNPICS database initialized successfully');
            
            // Only run board cleanup during explicit initialization
            if (forceSchema) {
                const { ensureBoards } = require('./ensure-boards');
                await ensureBoards(this);
            }
        } catch (error) {
            console.error('Database initialization failed:', error);
            throw error;
        }
    }

    async saveDatabase() {
        try {
            const data = this.db.export();
            await fs.writeFile(this.dbPath, Buffer.from(data));
        } catch (error) {
            console.error('Error saving database:', error);
        }
    }

    // User methods
    async createUser(userData) {
        const { id, provider, providerId, name, email, avatar } = userData;
        
        try {
            this.db.run(`
                INSERT INTO users (id, provider, provider_id, name, email, avatar)
                VALUES (?, ?, ?, ?, ?, ?)
            `, [id, provider, providerId, name, email, avatar]);
            
            await this.saveDatabase();
            const user = await this.getUserById(id);
            
            // Create default profile for parent
            await this.createProfile({
                userId: id,
                username: name.toLowerCase().replace(/[^a-z0-9]/g, '') + '_parent',
                displayName: name,
                avatarColor: '#2c3e50',
                avatarIcon: 'user',
                isDefault: true,
                isChild: false
            });
            
            return user;
        } catch (error) {
            console.error('Error creating user:', error);
            throw error;
        }
    }

    async getUserById(id) {
        try {
            const stmt = this.db.prepare('SELECT * FROM users WHERE id = ?');
            stmt.bind([id]);
            const result = stmt.step() ? stmt.getAsObject() : null;
            stmt.free();
            return result;
        } catch (error) {
            console.error('Error getting user by ID:', error);
            throw error;
        }
    }

    async getUserByProvider(provider, providerId) {
        try {
            const stmt = this.db.prepare('SELECT * FROM users WHERE provider = ? AND provider_id = ?');
            stmt.bind([provider, providerId]);
            const result = stmt.step() ? stmt.getAsObject() : null;
            stmt.free();
            return result;
        } catch (error) {
            console.error('Error getting user by provider:', error);
            throw error;
        }
    }

    // Profile methods
    async createProfile(profileData) {
        const { userId, username, displayName, avatarColor, avatarIcon, birthYear, isDefault, isChild } = profileData;
        
        try {
            const stmt = this.db.prepare(`
                INSERT INTO profiles (user_id, username, display_name, avatar_color, avatar_icon, birth_year, is_default, is_child)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `);
            
            stmt.run([userId, username, displayName, avatarColor || '#3498db', avatarIcon || 'star', birthYear, isDefault || false, isChild !== false]);
            stmt.free();

            await this.saveDatabase();
            
            // Get the created profile
            const profile = await this.getProfileByUsername(username);
            
            // Create initial stats record
            if (profile) {
                await this.initializeProfileStats(profile.id);
            }
            
            return profile;
        } catch (error) {
            console.error('Error creating profile:', error);
            throw error;
        }
    }

    async getProfilesByUserId(userId) {
        try {
            const stmt = this.db.prepare(`
                SELECT p.*, ps.games_played, ps.games_won, ps.current_streak
                FROM profiles p
                LEFT JOIN profile_stats ps ON p.id = ps.profile_id
                WHERE p.user_id = ?
                ORDER BY p.is_default DESC, p.created_at ASC
            `);
            
            const profiles = [];
            stmt.bind([userId]);
            while (stmt.step()) {
                profiles.push(stmt.getAsObject());
            }
            stmt.free();
            
            return profiles;
        } catch (error) {
            console.error('Error getting profiles by user ID:', error);
            throw error;
        }
    }

    async getProfileById(profileId) {
        try {
            const stmt = this.db.prepare(`
                SELECT p.*, ps.*
                FROM profiles p
                LEFT JOIN profile_stats ps ON p.id = ps.profile_id
                WHERE p.id = ?
            `);
            stmt.bind([profileId]);
            const result = stmt.step() ? stmt.getAsObject() : null;
            stmt.free();
            return result;
        } catch (error) {
            console.error('Error getting profile by ID:', error);
            throw error;
        }
    }

    async getProfileByUsername(username) {
        try {
            const stmt = this.db.prepare(`
                SELECT p.*, ps.*
                FROM profiles p
                LEFT JOIN profile_stats ps ON p.id = ps.profile_id
                WHERE p.username = ?
            `);
            stmt.bind([username]);
            const result = stmt.step() ? stmt.getAsObject() : null;
            stmt.free();
            return result;
        } catch (error) {
            console.error('Error getting profile by username:', error);
            throw error;
        }
    }

    async updateProfile(profileId, updates) {
        try {
            const setClause = Object.keys(updates).map(key => `${key} = ?`).join(', ');
            const values = Object.values(updates);
            
            this.db.run(`
                UPDATE profiles 
                SET ${setClause}, updated_at = CURRENT_TIMESTAMP 
                WHERE id = ?
            `, [...values, profileId]);
            
            await this.saveDatabase();
            return await this.getProfileById(profileId);
        } catch (error) {
            console.error('Error updating profile:', error);
            throw error;
        }
    }

    async deleteProfile(profileId) {
        try {
            // Check if this is the default profile
            const profile = await this.getProfileById(profileId);
            if (profile?.is_default) {
                throw new Error('Cannot delete default profile');
            }
            
            this.db.run('DELETE FROM profiles WHERE id = ?', [profileId]);
            await this.saveDatabase();
            return true;
        } catch (error) {
            console.error('Error deleting profile:', error);
            throw error;
        }
    }

    async initializeProfileStats(profileId) {
        try {
            this.db.run(`
                INSERT OR IGNORE INTO profile_stats (profile_id)
                VALUES (?)
            `, [profileId]);
            
            await this.saveDatabase();
        } catch (error) {
            console.error('Error initializing profile stats:', error);
            throw error;
        }
    }

    // Game session methods (updated for profiles)
    async createGameSession(gameData) {
        const {
            userId,
            profileId,
            sessionId,
            boardId,
            puzzleDate,
            puzzleTitle,
            correctWords,
            totalWords,
            turnsUsed,
            maxTurns,
            timeElapsed,
            isWin,
            wordTurns,
            turnHistory
        } = gameData;

        try {
            const stmt = this.db.prepare(`
                INSERT INTO game_sessions (
                    user_id, profile_id, session_id, board_id, puzzle_date, puzzle_title,
                    correct_words, total_words, turns_used, max_turns, time_elapsed,
                    is_win, word_turns, turn_history
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);
            
            stmt.run([
                userId, profileId, sessionId, boardId, puzzleDate, puzzleTitle,
                correctWords, totalWords, turnsUsed, maxTurns, timeElapsed,
                isWin, JSON.stringify(wordTurns), JSON.stringify(turnHistory)
            ]);
            stmt.free();

            await this.saveDatabase();
            
            // Get the last inserted row ID
            const lastIdStmt = this.db.prepare('SELECT last_insert_rowid() as id');
            const result = lastIdStmt.step() ? lastIdStmt.getAsObject() : { id: null };
            lastIdStmt.free();
            
            // Update profile stats if profileId provided
            if (profileId) {
                await this.updateProfileStats(profileId, { correctWords, isWin, timeElapsed, turnsUsed });
            }
            
            return result.id;
        } catch (error) {
            console.error('Error creating game session:', error);
            throw error;
        }
    }

    async getGameSessionById(gameSessionId) {
        try {
            const stmt = this.db.prepare('SELECT * FROM game_sessions WHERE id = ?');
            stmt.bind([gameSessionId]);
            const result = stmt.step() ? stmt.getAsObject() : null;
            stmt.free();
            return result;
        } catch (error) {
            console.error('Error getting game session by ID:', error);
            throw error;
        }
    }

    // Game progress methods for mid-game state persistence
    
    /**
     * Save or update game progress in database
     * Allows players to resume games after page reload
     */
    async saveGameProgress(progressData) {
        const {
            userId, profileId, sessionId, boardId, currentTurn,
            correctWords, wordTurns, turnHistory, currentPlacements, startTime
        } = progressData;

        try {
            // Check if progress already exists
            const checkStmt = this.db.prepare('SELECT id FROM game_progress WHERE session_id = ?');
            checkStmt.bind([sessionId]);
            const existing = checkStmt.step() ? checkStmt.getAsObject() : null;
            checkStmt.free();
            
            if (existing) {
                // Update existing progress
                const updateStmt = this.db.prepare(`
                    UPDATE game_progress 
                    SET current_turn = ?, correct_words = ?, word_turns = ?, 
                        turn_history = ?, current_placements = ?, last_saved = CURRENT_TIMESTAMP
                    WHERE session_id = ?
                `);
                
                updateStmt.run([
                    currentTurn,
                    JSON.stringify(correctWords),
                    JSON.stringify(wordTurns),
                    JSON.stringify(turnHistory),
                    JSON.stringify(currentPlacements),
                    sessionId
                ]);
                updateStmt.free();
            } else {
                // Insert new progress record
                const insertStmt = this.db.prepare(`
                    INSERT INTO game_progress (
                        user_id, profile_id, session_id, board_id, current_turn,
                        correct_words, word_turns, turn_history, current_placements, start_time
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `);
                
                insertStmt.run([
                    userId, profileId, sessionId, boardId, currentTurn,
                    JSON.stringify(correctWords),
                    JSON.stringify(wordTurns),
                    JSON.stringify(turnHistory),
                    JSON.stringify(currentPlacements),
                    startTime
                ]);
                insertStmt.free();
            }
            
            await this.saveDatabase();
            console.log(`💾 Game progress saved for session ${sessionId}, turn ${currentTurn}`);
            return true;
        } catch (error) {
            console.error('Error saving game progress:', error);
            throw error;
        }
    }

    /**
     * Load saved game progress by session ID
     */
    async loadGameProgress(sessionId) {
        try {
            const stmt = this.db.prepare('SELECT * FROM game_progress WHERE session_id = ?');
            stmt.bind([sessionId]);
            const result = stmt.step() ? stmt.getAsObject() : null;
            stmt.free();
            
            if (result) {
                // Parse JSON fields
                return {
                    ...result,
                    correctWords: result.correct_words ? JSON.parse(result.correct_words) : [],
                    wordTurns: result.word_turns ? JSON.parse(result.word_turns) : {},
                    turnHistory: result.turn_history ? JSON.parse(result.turn_history) : [],
                    currentPlacements: result.current_placements ? JSON.parse(result.current_placements) : {}
                };
            }
            return null;
        } catch (error) {
            console.error('Error loading game progress:', error);
            throw error;
        }
    }

    /**
     * Delete game progress when game completes
     */
    async clearGameProgress(sessionId) {
        try {
            // Check if record exists first
            const checkStmt = this.db.prepare('SELECT id FROM game_progress WHERE session_id = ?');
            checkStmt.bind([sessionId]);
            const exists = checkStmt.step() ? checkStmt.getAsObject() : null;
            checkStmt.free();
            
            if (exists) {
                const stmt = this.db.prepare('DELETE FROM game_progress WHERE session_id = ?');
                stmt.run([sessionId]);
                stmt.free();
                
                await this.saveDatabase();
                console.log(`🗑️ Cleared game progress for session ${sessionId}`);
                return true;
            }
            
            return false;
        } catch (error) {
            console.error('Error clearing game progress:', error);
            throw error;
        }
    }

    /**
     * Find existing game progress for a user on specific board
     */
    async findGameProgressByUser(userId, profileId, boardId) {
        try {
            const stmt = this.db.prepare(`
                SELECT * FROM game_progress 
                WHERE user_id = ? AND profile_id = ? AND board_id = ?
                ORDER BY last_saved DESC
                LIMIT 1
            `);
            stmt.bind([userId, profileId, boardId]);
            const result = stmt.step() ? stmt.getAsObject() : null;
            stmt.free();
            
            if (result) {
                return {
                    ...result,
                    correctWords: result.correct_words ? JSON.parse(result.correct_words) : [],
                    wordTurns: result.word_turns ? JSON.parse(result.word_turns) : {},
                    turnHistory: result.turn_history ? JSON.parse(result.turn_history) : [],
                    currentPlacements: result.current_placements ? JSON.parse(result.current_placements) : {}
                };
            }
            return null;
        } catch (error) {
            console.error('Error finding game progress by user:', error);
            throw error;
        }
    }

    async updateProfileStats(profileId, gameData) {
        try {
            const { correctWords, isWin, timeElapsed, turnsUsed } = gameData;
            
            // Parse time elapsed to seconds
            const timeInSeconds = this.parseTimeToSeconds(timeElapsed);
            
            // Get current stats
            const currentStats = await this.getProfileById(profileId);
            
            // Calculate new stats
            const gamesPlayed = (currentStats?.games_played || 0) + 1;
            const gamesWon = (currentStats?.games_won || 0) + (isWin ? 1 : 0);
            const totalPlayTime = (currentStats?.total_play_time || 0) + timeInSeconds;
            const newCurrentStreak = isWin ? (currentStats?.current_streak || 0) + 1 : 0;
            const longestStreak = Math.max(currentStats?.longest_streak || 0, newCurrentStreak);
            
            // Update best records
            const bestTurnCount = Math.min(currentStats?.best_turn_count || 4, isWin ? turnsUsed : 4);
            const bestTime = this.updateBestTime(currentStats?.best_time, timeElapsed, isWin);
            
            // Calculate average accuracy
            const totalCorrectWords = ((currentStats?.average_accuracy || 0) * (gamesPlayed - 1)) + correctWords;
            const averageAccuracy = totalCorrectWords / gamesPlayed;
            
            this.db.run(`
                UPDATE profile_stats 
                SET games_played = ?, games_won = ?, best_time = ?, best_turn_count = ?,
                    average_accuracy = ?, total_play_time = ?, current_streak = ?,
                    longest_streak = ?, last_played = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
                WHERE profile_id = ?
            `, [gamesPlayed, gamesWon, bestTime, bestTurnCount, averageAccuracy, 
                totalPlayTime, newCurrentStreak, longestStreak, profileId]);
            
            await this.saveDatabase();
        } catch (error) {
            console.error('Error updating profile stats:', error);
            throw error;
        }
    }

    parseTimeToSeconds(timeString) {
        if (!timeString) return 0;
        
        // Parse formats like "2m 30s" or "45s"
        const parts = timeString.split(' ');
        let seconds = 0;
        
        for (const part of parts) {
            if (part.includes('m')) {
                seconds += parseInt(part.replace('m', '')) * 60;
            } else if (part.includes('s')) {
                seconds += parseInt(part.replace('s', ''));
            }
        }
        
        return seconds;
    }

    updateBestTime(currentBest, newTime, isWin) {
        if (!isWin) return currentBest;
        if (!currentBest) return newTime;
        
        const currentSeconds = this.parseTimeToSeconds(currentBest);
        const newSeconds = this.parseTimeToSeconds(newTime);
        
        return newSeconds < currentSeconds ? newTime : currentBest;
    }

    async getProfileGameHistory(profileId, limit = 50) {
        try {
            const stmt = this.db.prepare(`
                SELECT gs.*, 
                       (SELECT sg.id 
                        FROM shareable_graphics sg 
                        WHERE sg.profile_id = gs.profile_id
                        AND sg.game_session_id = gs.id
                        ORDER BY sg.created_at DESC 
                        LIMIT 1) as shareableGraphicId
                FROM game_sessions gs
                WHERE gs.profile_id = ? 
                ORDER BY gs.completed_at DESC 
                LIMIT ?
            `);
            
            const games = [];
            stmt.bind([profileId, limit]);
            while (stmt.step()) {
                const game = stmt.getAsObject();
                // Parse JSON fields
                game.wordTurns = game.word_turns ? JSON.parse(game.word_turns) : {};
                game.turnHistory = game.turn_history ? JSON.parse(game.turn_history) : [];
                games.push(game);
            }
            stmt.free();
            
            return games;
        } catch (error) {
            console.error('Error getting profile game history:', error);
            throw error;
        }
    }

    // Board management methods (implementing the missing ones)
    async getBoardById(id, includeContent = false) {
        try {
            const stmt = this.db.prepare('SELECT * FROM boards WHERE id = ?');
            stmt.bind([id]);
            const board = stmt.step() ? stmt.getAsObject() : null;
            stmt.free();
            
            if (!board || !includeContent) {
                return board;
            }

            // Get images and words
            const [images, words] = await Promise.all([
                this.getPuzzleImagesByBoardId(id),
                this.getPuzzleWordsByBoardId(id)
            ]);

            return {
                ...board,
                images,
                words
            };
        } catch (error) {
            console.error('Error getting board by ID:', error);
            throw error;
        }
    }

    async getPuzzleImagesByBoardId(boardId) {
        try {
            const stmt = this.db.prepare('SELECT * FROM puzzle_images WHERE board_id = ? ORDER BY sort_order, created_at');
            const images = [];
            stmt.bind([boardId]);
            while (stmt.step()) {
                images.push(stmt.getAsObject());
            }
            stmt.free();
            return images;
        } catch (error) {
            console.error('Error getting puzzle images:', error);
            throw error;
        }
    }

    async getPuzzleWordsByBoardId(boardId) {
        try {
            const stmt = this.db.prepare('SELECT * FROM puzzle_words WHERE board_id = ? ORDER BY sort_order, created_at');
            const words = [];
            stmt.bind([boardId]);
            while (stmt.step()) {
                words.push(stmt.getAsObject());
            }
            stmt.free();
            return words;
        } catch (error) {
            console.error('Error getting puzzle words:', error);
            throw error;
        }
    }

    async getBoardTypes() {
        try {
            const stmt = this.db.prepare('SELECT * FROM board_types ORDER BY name');
            const types = [];
            while (stmt.step()) {
                types.push(stmt.getAsObject());
            }
            stmt.free();
            return types;
        } catch (error) {
            console.error('Error getting board types:', error);
            throw error;
        }
    }

    async createBoardType(boardTypeData) {
        const { id, name, icon, one_liner, prompt, description, is_premium, is_active } = boardTypeData;
        
        try {
            this.db.run(`
                INSERT INTO board_types (id, name, icon, one_liner, prompt, description, is_premium, is_active)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                id, 
                name, 
                icon, 
                one_liner, 
                prompt, 
                description || one_liner, 
                is_premium || 0, 
                is_active !== undefined ? is_active : 1
            ]);
            
            await this.saveDatabase();
            return await this.getBoardTypeById(id);
        } catch (error) {
            console.error('Error creating board type:', error);
            throw error;
        }
    }

    async updateBoardType(boardTypeId, updates) {
        try {
            const updateFields = [];
            const updateValues = [];
            
            // Build dynamic update query
            const allowedFields = ['name', 'icon', 'one_liner', 'prompt', 'description', 'is_premium', 'is_active'];
            
            for (const [key, value] of Object.entries(updates)) {
                if (allowedFields.includes(key)) {
                    updateFields.push(`${key} = ?`);
                    updateValues.push(value);
                }
            }
            
            if (updateFields.length === 0) {
                throw new Error('No valid fields to update');
            }
            
            updateValues.push(boardTypeId);
            
            this.db.run(`
                UPDATE board_types 
                SET ${updateFields.join(', ')}
                WHERE id = ?
            `, updateValues);
            
            await this.saveDatabase();
            return await this.getBoardTypeById(boardTypeId);
        } catch (error) {
            console.error('Error updating board type:', error);
            throw error;
        }
    }

    async getBoardTypeById(id) {
        try {
            const stmt = this.db.prepare('SELECT * FROM board_types WHERE id = ?');
            stmt.bind([id]);
            
            let boardType = null;
            if (stmt.step()) {
                boardType = stmt.getAsObject();
            }
            stmt.free();
            
            return boardType;
        } catch (error) {
            console.error('Error getting board type by ID:', error);
            throw error;
        }
    }

    // Board creation and management
    async createBoard(boardData) {
        const { id, boardTypeId, title, date, difficulty, isPublished, isDaily, scheduledDate } = boardData;
        
        try {
            this.db.run(`
                INSERT INTO boards (id, board_type_id, title, date, difficulty, is_published, is_daily, scheduled_date)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `, [id, boardTypeId, title, date, difficulty || 'medium', isPublished || 0, isDaily || 0, scheduledDate]);
            
            await this.saveDatabase();
            return await this.getBoardById(id);
        } catch (error) {
            console.error('Error creating board:', error);
            throw error;
        }
    }

    async createPuzzleImage(imageData) {
        const { id, boardId, theme, narrative, matchCount, url, sortOrder } = imageData;
        
        try {
            this.db.run(`
                INSERT INTO puzzle_images (id, board_id, theme, narrative, match_count, url, sort_order)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `, [id, boardId, theme, narrative, matchCount, url, sortOrder || 0]);
            
            await this.saveDatabase();
            return await this.getPuzzleImageById(id);
        } catch (error) {
            console.error('Error creating puzzle image:', error);
            throw error;
        }
    }

    async createPuzzleWord(wordData) {
        const { id, boardId, imageId, text, difficulty, sortOrder } = wordData;
        
        try {
            this.db.run(`
                INSERT INTO puzzle_words (id, board_id, image_id, text, difficulty, sort_order)
                VALUES (?, ?, ?, ?, ?, ?)
            `, [id, boardId, imageId, text, difficulty || 'Medium', sortOrder || 0]);
            
            await this.saveDatabase();
            return await this.getPuzzleWordById(id);
        } catch (error) {
            console.error('Error creating puzzle word:', error);
            throw error;
        }
    }

    async getPuzzleImageById(id) {
        try {
            const stmt = this.db.prepare('SELECT * FROM puzzle_images WHERE id = ?');
            stmt.bind([id]);
            const result = stmt.step() ? stmt.getAsObject() : null;
            stmt.free();
            return result;
        } catch (error) {
            console.error('Error getting puzzle image:', error);
            throw error;
        }
    }

    async getPuzzleWordById(id) {
        try {
            const stmt = this.db.prepare('SELECT * FROM puzzle_words WHERE id = ?');
            stmt.bind([id]);
            const result = stmt.step() ? stmt.getAsObject() : null;
            stmt.free();
            return result;
        } catch (error) {
            console.error('Error getting puzzle word:', error);
            throw error;
        }
    }

    async getAllBoards(boardTypeId = null, publishedOnly = false) {
        try {
            let query = 'SELECT * FROM boards';
            let params = [];
            
            const conditions = [];
            if (boardTypeId) {
                conditions.push('board_type_id = ?');
                params.push(boardTypeId);
            }
            if (publishedOnly) {
                conditions.push('is_published = 1');
            }
            
            if (conditions.length > 0) {
                query += ' WHERE ' + conditions.join(' AND ');
            }
            
            query += ' ORDER BY created_at DESC';
            
            const stmt = this.db.prepare(query);
            const boards = [];
            stmt.bind(params);
            while (stmt.step()) {
                boards.push(stmt.getAsObject());
            }
            stmt.free();
            
            return boards;
        } catch (error) {
            console.error('Error getting all boards:', error);
            throw error;
        }
    }

    async updateBoard(boardId, updates) {
        try {
            const setClause = Object.keys(updates).map(key => `${key} = ?`).join(', ');
            const values = Object.values(updates);
            
            this.db.run(`
                UPDATE boards 
                SET ${setClause}, updated_at = CURRENT_TIMESTAMP 
                WHERE id = ?
            `, [...values, boardId]);
            
            await this.saveDatabase();
            return await this.getBoardById(boardId);
        } catch (error) {
            console.error('Error updating board:', error);
            throw error;
        }
    }

    async deleteBoard(boardId) {
        try {
            // Delete in correct order due to foreign key constraints
            this.db.run('DELETE FROM puzzle_words WHERE board_id = ?', [boardId]);
            this.db.run('DELETE FROM puzzle_images WHERE board_id = ?', [boardId]);
            this.db.run('DELETE FROM boards WHERE id = ?', [boardId]);
            
            await this.saveDatabase();
            return true;
        } catch (error) {
            console.error('Error deleting board:', error);
            throw error;
        }
    }

    // Shareable graphics methods
    async createShareableGraphic(graphicData) {
        const { id, gameSessionId, userId, profileId, boardId, graphicData: data, imageData } = graphicData;
        
        try {
            console.log('Creating shareable graphic in WORDSNPICS database:', {
                id,
                gameSessionId,
                userId,
                profileId,
                boardId
            });
            
            this.db.run(`
                INSERT INTO shareable_graphics (id, game_session_id, user_id, profile_id, board_id, graphic_data, image_data)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `, [id, gameSessionId, userId, profileId, boardId, JSON.stringify(data), imageData]);
            
            await this.saveDatabase();
            console.log('Shareable graphic created successfully');
            return await this.getShareableGraphicById(id);
        } catch (error) {
            console.error('Error creating shareable graphic:', error);
            throw error;
        }
    }

    async getShareableGraphicById(id) {
        try {
            const stmt = this.db.prepare(`
                SELECT sg.*, gs.puzzle_title, gs.puzzle_date, u.name as user_name, p.display_name as profile_name
                FROM shareable_graphics sg
                LEFT JOIN game_sessions gs ON sg.game_session_id = gs.id
                LEFT JOIN users u ON sg.user_id = u.id
                LEFT JOIN profiles p ON sg.profile_id = p.id
                WHERE sg.id = ?
            `);
            stmt.bind([id]);
            const result = stmt.step() ? stmt.getAsObject() : null;
            stmt.free();
            
            if (result && result.graphic_data) {
                result.graphic_data = JSON.parse(result.graphic_data);
            }
            
            return result;
        } catch (error) {
            console.error('Error getting shareable graphic:', error);
            throw error;
        }
    }

    async incrementShareableGraphicViews(id) {
        try {
            this.db.run(`
                UPDATE shareable_graphics 
                SET view_count = COALESCE(view_count, 0) + 1 
                WHERE id = ?
            `, [id]);
            
            await this.saveDatabase();
            return true;
        } catch (error) {
            console.error('Error incrementing shareable graphic views:', error);
            throw error;
        }
    }

    // Check if user has completed today's puzzle for a specific board type
    async hasUserCompletedTodaysPuzzle(userId, profileId, boardType) {
        try {
            const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
            
            const stmt = this.db.prepare(`
                SELECT gs.*, b.board_type_id, b.title as puzzle_title
                FROM game_sessions gs
                JOIN boards b ON gs.board_id = b.id
                WHERE (gs.user_id = ? OR gs.profile_id = ?)
                AND b.board_type_id = ?
                AND b.is_daily = 1
                AND DATE(gs.completed_at) = ?
                ORDER BY gs.completed_at DESC
                LIMIT 1
            `);
            
            stmt.bind([userId, profileId, boardType, today]);
            const result = stmt.step() ? stmt.getAsObject() : null;
            stmt.free();
            
            if (result) {
                // Parse JSON fields
                const wordTurns = result.word_turns ? JSON.parse(result.word_turns) : {};
                const turnHistory = result.turn_history ? JSON.parse(result.turn_history) : [];
                
                return {
                    hasCompleted: true,
                    gameSession: {
                        id: result.id,
                        sessionId: result.session_id,
                        boardId: result.board_id,
                        puzzleTitle: result.puzzle_title,
                        correctWords: result.correct_words,
                        totalWords: result.total_words,
                        turnsUsed: result.turns_used,
                        timeElapsed: result.time_elapsed,
                        isWin: result.is_win,
                        completedAt: result.completed_at,
                        wordTurns: wordTurns,
                        turnHistory: turnHistory
                    }
                };
            }
            
            return { hasCompleted: false, gameSession: null };
            
        } catch (error) {
            console.error('Error checking user completion status:', error);
            throw error;
        }
    }

    // Get completion status for all board types for a user
    async getUserDailyCompletionStatus(userId, profileId) {
        try {
            const today = new Date().toISOString().split('T')[0];
            
            // Get all board types
            const boardTypes = await this.getBoardTypes();
            const completionStatus = {};
            
            // Check completion for each board type
            for (const boardType of boardTypes) {
                if (boardType.is_active) {
                    const completion = await this.hasUserCompletedTodaysPuzzle(userId, profileId, boardType.id);
                    completionStatus[boardType.id] = {
                        boardType: boardType,
                        ...completion
                    };
                }
            }
            
            return completionStatus;
            
        } catch (error) {
            console.error('Error getting user daily completion status:', error);
            throw error;
        }
    }

    // Close database connection
    async close() {
        if (this.db) {
            await this.saveDatabase();
            this.db.close();
            console.log('WORDSNPICS database connection closed');
        }
    }
}

// Create and export singleton instance
const wordsnpicsDbService = new WordsnpicsDatabaseService();

module.exports = wordsnpicsDbService;