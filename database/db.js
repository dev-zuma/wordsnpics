const initSqlJs = require('sql.js');
const fs = require('fs').promises;
const path = require('path');

class DatabaseService {
    constructor() {
        this.db = null;
        this.SQL = null;
        this.dbPath = path.join(__dirname, 'wordlinks.db');
    }

    async initialize() {
        try {
            // Initialize sql.js
            this.SQL = await initSqlJs();
            
            // Create database directory if it doesn't exist
            await fs.mkdir(path.dirname(this.dbPath), { recursive: true });

            // Try to load existing database file
            let data;
            try {
                const buffer = await fs.readFile(this.dbPath);
                data = new Uint8Array(buffer);
            } catch (error) {
                // Database file doesn't exist, create new one
                data = null;
            }

            // Create database instance
            this.db = new this.SQL.Database(data);

            // Enable foreign keys
            this.db.run('PRAGMA foreign_keys = ON');

            // Run schema
            const schemaPath = path.join(__dirname, 'schema.sql');
            const schema = await fs.readFile(schemaPath, 'utf8');
            this.db.run(schema);

            // Save database to file
            await this.saveDatabase();

            console.log('Database initialized successfully');
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
            return await this.getUserById(id);
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

    async updateUser(id, updates) {
        try {
            const setClause = Object.keys(updates).map(key => `${key} = ?`).join(', ');
            const values = Object.values(updates);
            
            this.db.run(`
                UPDATE users 
                SET ${setClause}, updated_at = CURRENT_TIMESTAMP 
                WHERE id = ?
            `, [...values, id]);
            
            await this.saveDatabase();
            return await this.getUserById(id);
        } catch (error) {
            console.error('Error updating user:', error);
            throw error;
        }
    }

    // Game session methods
    async createGameSession(gameData) {
        const {
            userId,
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
                    user_id, session_id, board_id, puzzle_date, puzzle_title,
                    correct_words, total_words, turns_used, max_turns, time_elapsed,
                    is_win, word_turns, turn_history
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);
            
            stmt.run([
                userId, sessionId, boardId, puzzleDate, puzzleTitle,
                correctWords, totalWords, turnsUsed, maxTurns, timeElapsed,
                isWin, JSON.stringify(wordTurns), JSON.stringify(turnHistory)
            ]);
            stmt.free();

            await this.saveDatabase();
            
            // Get the last inserted row ID
            const lastIdStmt = this.db.prepare('SELECT last_insert_rowid() as id');
            const result = lastIdStmt.step() ? lastIdStmt.getAsObject() : { id: null };
            lastIdStmt.free();
            
            return result.id;
        } catch (error) {
            console.error('Error creating game session:', error);
            throw error;
        }
    }

    async getUserGameHistory(userId, limit = 50) {
        try {
            const stmt = this.db.prepare(`
                SELECT gs.*, 
                       (SELECT sg.id 
                        FROM shareable_graphics sg 
                        WHERE ((CAST(gs.id AS TEXT) = sg.game_session_id) 
                               OR (gs.session_id = sg.game_session_id))
                        AND sg.user_id = gs.user_id
                        AND sg.board_id = gs.board_id
                        AND ABS(julianday(sg.created_at) - julianday(gs.completed_at)) < 0.1
                        ORDER BY sg.created_at DESC 
                        LIMIT 1) as shareableGraphicId
                FROM game_sessions gs
                WHERE gs.user_id = ? 
                ORDER BY gs.completed_at DESC 
                LIMIT ?
            `);
            
            const games = [];
            stmt.bind([userId, limit]);
            while (stmt.step()) {
                const game = stmt.getAsObject();
                // Parse JSON fields
                game.wordTurns = game.word_turns ? JSON.parse(game.word_turns) : {};
                game.turnHistory = game.turn_history ? JSON.parse(game.turn_history) : [];
                games.push(game);
            }
            stmt.free();
            
            console.log(`Retrieved ${games.length} games for user ${userId}, ${games.filter(g => g.shareableGraphicId).length} with graphics`);
            
            // Debug: Show what graphics are being matched to what games
            games.forEach((game, index) => {
                console.log(`Game ${index + 1}: ID=${game.id}, Session=${game.session_id}, Board=${game.board_id}, Graphic=${game.shareableGraphicId}`);
            });
            
            return games;
        } catch (error) {
            console.error('Error getting user game history:', error);
            throw error;
        }
    }

    async getUserStats(userId) {
        try {
            const stmt = this.db.prepare(`
                SELECT 
                    COUNT(*) as total_games,
                    SUM(CASE WHEN is_win = 1 THEN 1 ELSE 0 END) as completed_games,
                    AVG(correct_words) as average_score,
                    MAX(correct_words) as best_score,
                    MIN(turns_used) as best_turns
                FROM game_sessions 
                WHERE user_id = ?
            `);
            
            stmt.bind([userId]);
            const result = stmt.step() ? stmt.getAsObject() : {};
            stmt.free();

            return {
                totalGames: result.total_games || 0,
                completedGames: result.completed_games || 0,
                averageScore: Math.round(result.average_score || 0),
                bestScore: result.best_score || 0,
                bestTurns: result.best_turns || 0,
                winRate: result.total_games > 0 ? Math.round((result.completed_games / result.total_games) * 100) : 0
            };
        } catch (error) {
            console.error('Error getting user stats:', error);
            throw error;
        }
    }

    async getGameSessionById(id) {
        try {
            const stmt = this.db.prepare('SELECT * FROM game_sessions WHERE id = ?');
            stmt.bind([id]);
            const game = stmt.step() ? stmt.getAsObject() : null;
            stmt.free();
            
            if (game) {
                game.wordTurns = game.word_turns ? JSON.parse(game.word_turns) : {};
                game.turnHistory = game.turn_history ? JSON.parse(game.turn_history) : [];
                return game;
            }
            return null;
        } catch (error) {
            console.error('Error getting game session:', error);
            throw error;
        }
    }

    // Board management methods
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

    async getDailyBoard(date = null) {
        try {
            const targetDate = date || new Date().toISOString().split('T')[0];
            
            const stmt = this.db.prepare(`
                SELECT * FROM boards 
                WHERE is_daily = 1 
                AND is_published = 1 
                AND (scheduled_date = ? OR scheduled_date IS NULL)
                ORDER BY created_at DESC 
                LIMIT 1
            `);
            
            stmt.bind([targetDate]);
            const board = stmt.step() ? stmt.getAsObject() : null;
            stmt.free();

            if (board) {
                return await this.getBoardById(board.id, true);
            }
            
            return null;
        } catch (error) {
            console.error('Error getting daily board:', error);
            throw error;
        }
    }

    async updateBoard(id, updates) {
        try {
            const setClause = Object.keys(updates).map(key => `${key} = ?`).join(', ');
            const values = Object.values(updates);
            
            this.db.run(`
                UPDATE boards 
                SET ${setClause}, updated_at = CURRENT_TIMESTAMP 
                WHERE id = ?
            `, [...values, id]);
            
            await this.saveDatabase();
            return await this.getBoardById(id);
        } catch (error) {
            console.error('Error updating board:', error);
            throw error;
        }
    }

    async deleteBoard(id) {
        try {
            // Delete images and words (CASCADE should handle this, but being explicit)
            this.db.run('DELETE FROM puzzle_words WHERE board_id = ?', [id]);
            this.db.run('DELETE FROM puzzle_images WHERE board_id = ?', [id]);
            this.db.run('DELETE FROM boards WHERE id = ?', [id]);
            
            await this.saveDatabase();
            return true;
        } catch (error) {
            console.error('Error deleting board:', error);
            throw error;
        }
    }

    // Puzzle images methods
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

    // Puzzle words methods
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

    async getPuzzleWordsByImageId(imageId) {
        try {
            const stmt = this.db.prepare('SELECT * FROM puzzle_words WHERE image_id = ? ORDER BY sort_order, created_at');
            const words = [];
            stmt.bind([imageId]);
            while (stmt.step()) {
                words.push(stmt.getAsObject());
            }
            stmt.free();
            return words;
        } catch (error) {
            console.error('Error getting words by image ID:', error);
            throw error;
        }
    }

    // Board type methods
    async getBoardTypes() {
        try {
            const stmt = this.db.prepare('SELECT * FROM board_types WHERE is_active = 1 ORDER BY name');
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

    async createBoardType(typeData) {
        const { id, name, icon, one_liner, prompt, description, isPremium, isActive } = typeData;
        
        try {
            this.db.run(`
                INSERT INTO board_types (id, name, icon, one_liner, prompt, description, is_premium, is_active)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `, [id, name, icon, one_liner, prompt, description, isPremium || 0, isActive !== false ? 1 : 0]);
            
            await this.saveDatabase();
            
            const stmt = this.db.prepare('SELECT * FROM board_types WHERE id = ?');
            stmt.bind([id]);
            const result = stmt.step() ? stmt.getAsObject() : null;
            stmt.free();
            return result;
        } catch (error) {
            console.error('Error creating board type:', error);
            throw error;
        }
    }

    async updateBoardType(id, updates) {
        try {
            // Build the SET clause dynamically based on what fields are being updated
            const validFields = ['name', 'icon', 'one_liner', 'prompt', 'description', 'is_premium', 'is_active'];
            const updateFields = [];
            const values = [];
            
            for (const [key, value] of Object.entries(updates)) {
                if (validFields.includes(key)) {
                    updateFields.push(`${key} = ?`);
                    values.push(value);
                }
            }
            
            if (updateFields.length === 0) {
                throw new Error('No valid fields to update');
            }
            
            values.push(id); // Add id for WHERE clause
            
            this.db.run(`
                UPDATE board_types 
                SET ${updateFields.join(', ')}
                WHERE id = ?
            `, values);
            
            await this.saveDatabase();
            
            // Return the updated board type
            const stmt = this.db.prepare('SELECT * FROM board_types WHERE id = ?');
            stmt.bind([id]);
            const result = stmt.step() ? stmt.getAsObject() : null;
            stmt.free();
            return result;
        } catch (error) {
            console.error('Error updating board type:', error);
            throw error;
        }
    }

    // Analytics methods
    async getGlobalStats() {
        try {
            const stmt = this.db.prepare(`
                SELECT 
                    COUNT(*) as total_games,
                    COUNT(DISTINCT user_id) as total_users,
                    SUM(CASE WHEN is_win = 1 THEN 1 ELSE 0 END) as total_wins,
                    AVG(correct_words) as average_score
                FROM game_sessions
            `);
            
            const stats = stmt.step() ? stmt.getAsObject() : {};
            stmt.free();

            return {
                totalGames: stats.total_games || 0,
                totalUsers: stats.total_users || 0,
                totalWins: stats.total_wins || 0,
                averageScore: Math.round(stats.average_score || 0),
                winRate: stats.total_games > 0 ? Math.round((stats.total_wins / stats.total_games) * 100) : 0
            };
        } catch (error) {
            console.error('Error getting global stats:', error);
            throw error;
        }
    }

    async associateGameSessionWithUser(gameSessionId, userId) {
        try {
            // Update the game session to link it with the authenticated user
            this.db.run(`
                UPDATE game_sessions 
                SET user_id = ? 
                WHERE (session_id = ? OR id = ?) AND user_id IS NULL
            `, [userId, gameSessionId, gameSessionId]);
            
            await this.saveDatabase();
            console.log('Associated game session', gameSessionId, 'with user', userId);
            return true;
        } catch (error) {
            console.error('Error associating game session with user:', error);
            throw error;
        }
    }

    async clearUserProfileData(userId = null) {
        try {
            if (userId) {
                // Clear data for specific user
                this.db.run('DELETE FROM game_sessions WHERE user_id = ?', [userId]);
                this.db.run('DELETE FROM shareable_graphics WHERE user_id = ?', [userId]);
                console.log('Cleared profile data for user:', userId);
            } else {
                // Clear all profile data (for development/testing)
                this.db.run('DELETE FROM game_sessions');
                this.db.run('DELETE FROM shareable_graphics');
                console.log('Cleared all profile data');
            }
            
            await this.saveDatabase();
            return true;
        } catch (error) {
            console.error('Error clearing profile data:', error);
            throw error;
        }
    }

    // Clean up duplicate game sessions for a user
    async cleanupDuplicateGameSessions(userId) {
        try {
            console.log(`🧹 Cleaning up duplicate game sessions for user ${userId}`);
            
            // Find groups of games that are potential duplicates
            // (same user, board, and within 5 minutes of each other)
            const stmt = this.db.prepare(`
                SELECT id, board_id, completed_at, correct_words, turns_used, session_id
                FROM game_sessions 
                WHERE user_id = ? 
                ORDER BY board_id, completed_at
            `);
            
            const games = [];
            stmt.bind([userId]);
            while (stmt.step()) {
                games.push(stmt.getAsObject());
            }
            stmt.free();
            
            console.log(`Found ${games.length} total game sessions`);
            
            // Group by board and find duplicates within 5 minutes
            const groups = {};
            games.forEach(game => {
                const key = game.board_id;
                if (!groups[key]) groups[key] = [];
                groups[key].push(game);
            });
            
            let duplicatesRemoved = 0;
            
            for (const [boardId, boardGames] of Object.entries(groups)) {
                if (boardGames.length > 1) {
                    console.log(`Board ${boardId} has ${boardGames.length} games, checking for duplicates...`);
                    
                    // Sort by completion time
                    boardGames.sort((a, b) => new Date(a.completed_at) - new Date(b.completed_at));
                    
                    // Keep the first game, remove others that are within 5 minutes and have similar scores
                    for (let i = 1; i < boardGames.length; i++) {
                        const currentGame = boardGames[i];
                        const prevGame = boardGames[i-1];
                        
                        const timeDiff = (new Date(currentGame.completed_at) - new Date(prevGame.completed_at)) / 1000 / 60; // minutes
                        
                        if (timeDiff <= 5 && currentGame.correct_words === prevGame.correct_words) {
                            console.log(`Removing duplicate game ${currentGame.id} (similar to ${prevGame.id})`);
                            
                            // Remove the duplicate game session
                            this.db.run('DELETE FROM game_sessions WHERE id = ?', [currentGame.id]);
                            duplicatesRemoved++;
                        }
                    }
                }
            }
            
            await this.saveDatabase();
            console.log(`✅ Cleanup complete. Removed ${duplicatesRemoved} duplicate game sessions.`);
            
            return duplicatesRemoved;
        } catch (error) {
            console.error('Error cleaning up duplicate game sessions:', error);
            throw error;
        }
    }

    // Shareable graphics methods
    async createShareableGraphic(graphicData) {
        const { id, gameSessionId, userId, boardId, graphicData: data, imageData } = graphicData;
        
        try {
            console.log('Creating shareable graphic in database:', {
                id,
                gameSessionId,
                userId,
                boardId
            });
            
            this.db.run(`
                INSERT INTO shareable_graphics (id, game_session_id, user_id, board_id, graphic_data, image_data)
                VALUES (?, ?, ?, ?, ?, ?)
            `, [id, gameSessionId, userId, boardId, JSON.stringify(data), imageData]);
            
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
                SELECT sg.*, gs.puzzle_title, gs.puzzle_date, u.name as user_name
                FROM shareable_graphics sg
                LEFT JOIN game_sessions gs ON sg.game_session_id = gs.id
                LEFT JOIN users u ON sg.user_id = u.id
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
            this.db.run('UPDATE shareable_graphics SET view_count = view_count + 1 WHERE id = ?', [id]);
            await this.saveDatabase();
        } catch (error) {
            console.error('Error incrementing graphic views:', error);
            throw error;
        }
    }

    async getShareableGraphicsByUserId(userId, limit = 10) {
        try {
            const stmt = this.db.prepare(`
                SELECT sg.id, sg.board_id, sg.view_count, sg.created_at, gs.puzzle_title, gs.correct_words, gs.total_words
                FROM shareable_graphics sg
                LEFT JOIN game_sessions gs ON sg.game_session_id = gs.id
                WHERE sg.user_id = ?
                ORDER BY sg.created_at DESC
                LIMIT ?
            `);
            const graphics = [];
            stmt.bind([userId, limit]);
            while (stmt.step()) {
                graphics.push(stmt.getAsObject());
            }
            stmt.free();
            return graphics;
        } catch (error) {
            console.error('Error getting user shareable graphics:', error);
            throw error;
        }
    }

    // Close database connection
    async close() {
        if (this.db) {
            await this.saveDatabase();
            this.db.close();
            console.log('Database connection closed');
        }
    }
}

// Create and export singleton instance
const dbService = new DatabaseService();

module.exports = dbService;