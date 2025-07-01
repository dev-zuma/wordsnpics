/**
 * League Management Service for WORDSNPICS
 * Handles league creation, membership, scoring, and competition
 */

class LeagueService {
    constructor(dbService) {
        this.dbService = dbService;
    }

    // Generate unique league code
    generateLeagueCode() {
        const chars = 'ABCDEFGHIJKLMNPQRSTUVWXYZ123456789'; // No O, 0 to avoid confusion
        let code = '';
        for (let i = 0; i < 6; i++) {
            code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return code;
    }

    async createLeague(leagueData) {
        const { name, description, creatorUserId, creatorProfileId, scoringMethod = 'standard', competitionType = 'ongoing', boardTypeId, maxMembers = 50, isPublic = false } = leagueData;

        try {
            // Generate unique league code
            let leagueCode;
            let codeExists = true;
            let attempts = 0;
            
            while (codeExists && attempts < 10) {
                leagueCode = this.generateLeagueCode();
                const existing = await this.getLeagueByCode(leagueCode);
                codeExists = !!existing;
                attempts++;
            }

            if (codeExists) {
                throw new Error('Failed to generate unique league code');
            }

            const leagueId = 'league_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            
            // Create league
            this.dbService.db.run(`
                INSERT INTO leagues (id, name, description, creator_user_id, league_code, is_public, scoring_method, competition_type, board_type_id, max_members)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [leagueId, name, description, creatorUserId, leagueCode, isPublic, scoringMethod, competitionType, boardTypeId, maxMembers]);

            // Add creator as first member and admin
            await this.joinLeague(leagueId, creatorUserId, creatorProfileId, { isAdmin: true });

            await this.dbService.saveDatabase();

            return await this.getLeagueById(leagueId);
        } catch (error) {
            console.error('Error creating league:', error);
            throw error;
        }
    }

    async getLeagueByCode(leagueCode) {
        try {
            const stmt = this.dbService.db.prepare('SELECT * FROM leagues WHERE league_code = ? AND is_active = 1');
            stmt.bind([leagueCode]);
            const result = stmt.step() ? stmt.getAsObject() : null;
            stmt.free();
            return result;
        } catch (error) {
            console.error('Error getting league by code:', error);
            throw error;
        }
    }

    async getLeagueById(leagueId) {
        try {
            const stmt = this.dbService.db.prepare('SELECT * FROM leagues WHERE id = ? AND is_active = 1');
            stmt.bind([leagueId]);
            const result = stmt.step() ? stmt.getAsObject() : null;
            stmt.free();
            return result;
        } catch (error) {
            console.error('Error getting league by ID:', error);
            throw error;
        }
    }

    async joinLeague(leagueId, userId, profileId, options = {}) {
        const { isAdmin = false, nickname = null } = options;

        try {
            // Check if league exists and has space
            const league = await this.getLeagueById(leagueId);
            if (!league) {
                throw new Error('League not found');
            }

            // Check current member count
            const memberCount = await this.getLeagueMemberCount(leagueId);
            if (memberCount >= league.max_members) {
                throw new Error('League is full');
            }

            // Check if already a member
            const existingMembership = await this.getLeagueMembership(leagueId, userId, profileId);
            if (existingMembership) {
                if (existingMembership.is_active) {
                    throw new Error('Already a member of this league');
                } else {
                    // Reactivate membership
                    this.dbService.db.run(`
                        UPDATE league_members 
                        SET is_active = 1, joined_at = CURRENT_TIMESTAMP
                        WHERE league_id = ? AND user_id = ? AND profile_id = ?
                    `, [leagueId, userId, profileId]);
                }
            } else {
                // Create new membership
                this.dbService.db.run(`
                    INSERT INTO league_members (league_id, user_id, profile_id, is_admin, nickname)
                    VALUES (?, ?, ?, ?, ?)
                `, [leagueId, userId, profileId, isAdmin, nickname]);
            }

            await this.dbService.saveDatabase();
            return await this.getLeagueMembership(leagueId, userId, profileId);
        } catch (error) {
            console.error('Error joining league:', error);
            throw error;
        }
    }

    async leaveLeague(leagueId, userId, profileId) {
        try {
            // Check if user is the creator and only admin
            const league = await this.getLeagueById(leagueId);
            if (league.creator_user_id === userId) {
                const adminCount = await this.getLeagueAdminCount(leagueId);
                if (adminCount <= 1) {
                    throw new Error('Cannot leave league as the only admin. Please promote another member to admin first.');
                }
            }

            this.dbService.db.run(`
                UPDATE league_members 
                SET is_active = 0 
                WHERE league_id = ? AND user_id = ? AND profile_id = ?
            `, [leagueId, userId, profileId]);

            await this.dbService.saveDatabase();
            return true;
        } catch (error) {
            console.error('Error leaving league:', error);
            throw error;
        }
    }

    async getLeagueMembership(leagueId, userId, profileId) {
        try {
            const stmt = this.dbService.db.prepare(`
                SELECT lm.*, p.display_name, p.avatar_color, p.avatar_icon
                FROM league_members lm
                LEFT JOIN profiles p ON lm.profile_id = p.id
                WHERE lm.league_id = ? AND lm.user_id = ? AND lm.profile_id = ?
            `);
            stmt.bind([leagueId, userId, profileId]);
            const result = stmt.step() ? stmt.getAsObject() : null;
            stmt.free();
            return result;
        } catch (error) {
            console.error('Error getting league membership:', error);
            throw error;
        }
    }

    async getLeagueMemberCount(leagueId) {
        try {
            const stmt = this.dbService.db.prepare('SELECT COUNT(*) as count FROM league_members WHERE league_id = ? AND is_active = 1');
            stmt.bind([leagueId]);
            const result = stmt.step() ? stmt.getAsObject() : { count: 0 };
            stmt.free();
            return result.count;
        } catch (error) {
            console.error('Error getting league member count:', error);
            throw error;
        }
    }

    async getLeagueAdminCount(leagueId) {
        try {
            const stmt = this.dbService.db.prepare('SELECT COUNT(*) as count FROM league_members WHERE league_id = ? AND is_admin = 1 AND is_active = 1');
            stmt.bind([leagueId]);
            const result = stmt.step() ? stmt.getAsObject() : { count: 0 };
            stmt.free();
            return result.count;
        } catch (error) {
            console.error('Error getting league admin count:', error);
            throw error;
        }
    }

    async getUserLeagues(userId, profileId = null) {
        try {
            let query = `
                SELECT l.*, lm.is_admin, lm.joined_at, lm.nickname,
                       (SELECT COUNT(*) FROM league_members WHERE league_id = l.id AND is_active = 1) as member_count
                FROM leagues l
                JOIN league_members lm ON l.id = lm.league_id
                WHERE lm.user_id = ? AND lm.is_active = 1 AND l.is_active = 1
            `;
            let params = [userId];

            if (profileId) {
                query += ' AND lm.profile_id = ?';
                params.push(profileId);
            }

            query += ' ORDER BY lm.joined_at DESC';

            const stmt = this.dbService.db.prepare(query);
            const leagues = [];
            stmt.bind(params);
            while (stmt.step()) {
                leagues.push(stmt.getAsObject());
            }
            stmt.free();

            return leagues;
        } catch (error) {
            console.error('Error getting user leagues:', error);
            throw error;
        }
    }

    async getLeagueLeaderboard(leagueId, options = {}) {
        const { limit = 50, boardTypeId = null, timeFrame = 'all' } = options;

        try {
            // Build time filter
            let timeFilter = '';
            let timeParams = [];
            
            if (timeFrame === 'weekly') {
                timeFilter = 'AND gs.completed_at >= datetime("now", "-7 days")';
            } else if (timeFrame === 'monthly') {
                timeFilter = 'AND gs.completed_at >= datetime("now", "-30 days")';
            }

            // Build board type filter
            let boardTypeFilter = '';
            if (boardTypeId) {
                boardTypeFilter = 'AND b.board_type_id = ?';
                timeParams.push(boardTypeId);
            }

            const query = `
                SELECT 
                    lm.user_id,
                    lm.profile_id,
                    lm.nickname,
                    p.display_name,
                    p.avatar_color,
                    p.avatar_icon,
                    COUNT(gs.id) as games_played,
                    SUM(CASE WHEN gs.is_win = 1 THEN 1 ELSE 0 END) as games_won,
                    ROUND(
                        CASE 
                            WHEN COUNT(gs.id) > 0 
                            THEN (SUM(CASE WHEN gs.is_win = 1 THEN 1 ELSE 0 END) * 100.0 / COUNT(gs.id))
                            ELSE 0 
                        END, 1
                    ) as win_percentage,
                    (COUNT(gs.id) * 20) as words_played,
                    SUM(CASE WHEN gs.correct_words IS NOT NULL THEN gs.correct_words ELSE 0 END) as words_correct,
                    ROUND(
                        CASE 
                            WHEN (COUNT(gs.id) * 20) > 0 
                            THEN (SUM(CASE WHEN gs.correct_words IS NOT NULL THEN gs.correct_words ELSE 0 END) * 100.0 / (COUNT(gs.id) * 20))
                            ELSE 0 
                        END, 1
                    ) as word_percentage,
                    AVG(CASE WHEN gs.time_elapsed IS NOT NULL THEN gs.time_elapsed ELSE NULL END) as avg_time_seconds,
                    MAX(gs.completed_at) as last_played
                FROM league_members lm
                JOIN profiles p ON lm.profile_id = p.id
                LEFT JOIN game_sessions gs ON lm.profile_id = gs.profile_id
                LEFT JOIN boards b ON gs.board_id = b.id
                WHERE lm.league_id = ? AND lm.is_active = 1
                ${timeFilter}
                ${boardTypeFilter}
                GROUP BY lm.user_id, lm.profile_id
                ORDER BY games_won DESC, win_percentage DESC, word_percentage DESC
                LIMIT ?
            `;

            const stmt = this.dbService.db.prepare(query);
            const params = [leagueId, ...timeParams, limit];
            const leaderboard = [];
            
            stmt.bind(params);
            let rank = 1;
            while (stmt.step()) {
                const member = stmt.getAsObject();
                member.rank = rank++;
                member.score = this.calculateMemberScore(member, 'standard'); // Default to standard scoring
                
                // Format average time to mm:ss
                if (member.avg_time_seconds && member.avg_time_seconds > 0) {
                    const minutes = Math.floor(member.avg_time_seconds / 60);
                    const seconds = Math.round(member.avg_time_seconds % 60);
                    member.avg_time = `${minutes}:${seconds.toString().padStart(2, '0')}`;
                } else {
                    member.avg_time = '-';
                }
                
                leaderboard.push(member);
            }
            stmt.free();

            return leaderboard;
        } catch (error) {
            console.error('Error getting league leaderboard:', error);
            throw error;
        }
    }

    calculateMemberScore(memberStats, scoringMethod) {
        switch (scoringMethod) {
            case 'speed':
                return this.calculateSpeedScore(memberStats);
            case 'consistency':
                return this.calculateConsistencyScore(memberStats);
            case 'standard':
            default:
                return this.calculateStandardScore(memberStats);
        }
    }

    calculateStandardScore(memberStats) {
        const { games_won = 0, avg_correct_words = 0, best_turns = 4 } = memberStats;
        
        // Base score: 100 points per win
        const baseScore = games_won * 100;
        
        // Bonus for accuracy (average correct words)
        const accuracyBonus = Math.floor(avg_correct_words * 10);
        
        // Bonus for efficiency (fewer turns)
        const turnBonus = Math.max(0, (5 - (best_turns || 4)) * 25);
        
        return baseScore + accuracyBonus + turnBonus;
    }

    calculateSpeedScore(memberStats) {
        // Speed-based scoring would need time data from game sessions
        // For now, return standard score as placeholder
        return this.calculateStandardScore(memberStats);
    }

    calculateConsistencyScore(memberStats) {
        // Consistency scoring would need variance calculation
        // For now, return standard score as placeholder
        return this.calculateStandardScore(memberStats);
    }

    async submitGameToLeagues(gameSessionId, profileId) {
        try {
            // Get user leagues for this profile
            const gameSession = await this.dbService.getGameSessionById(gameSessionId);
            if (!gameSession) {
                throw new Error('Game session not found');
            }

            const userLeagues = await this.getUserLeagues(gameSession.user_id, profileId);
            
            // Update league scores for each league the user is in
            for (const league of userLeagues) {
                // League scores are calculated dynamically in leaderboard queries
                // No need to store individual game submissions unless we want detailed league history
                console.log(`Game ${gameSessionId} counts for league ${league.name}`);
            }

            return true;
        } catch (error) {
            console.error('Error submitting game to leagues:', error);
            throw error;
        }
    }

    async getLeagueDetails(leagueId, requestingUserId, requestingProfileId) {
        try {
            const league = await this.getLeagueById(leagueId);
            if (!league) {
                throw new Error('League not found');
            }

            const leaderboard = await this.getLeagueLeaderboard(leagueId);
            const userMembership = await this.getLeagueMembership(leagueId, requestingUserId, requestingProfileId);
            const memberCount = await this.getLeagueMemberCount(leagueId);

            return {
                league: {
                    ...league,
                    member_count: memberCount
                },
                leaderboard,
                userMembership,
                canJoin: !userMembership && memberCount < league.max_members
            };
        } catch (error) {
            console.error('Error getting league details:', error);
            throw error;
        }
    }

    async updateLeague(leagueId, updates, requestingUserId) {
        try {
            const league = await this.getLeagueById(leagueId);
            if (!league) {
                throw new Error('League not found');
            }

            // Check if user has permission to update
            if (league.creator_user_id !== requestingUserId) {
                // Check if user is admin
                const membership = await this.getLeagueMembership(leagueId, requestingUserId);
                if (!membership || !membership.is_admin) {
                    throw new Error('Permission denied');
                }
            }

            const allowedUpdates = ['name', 'description', 'is_public', 'max_members'];
            const filteredUpdates = {};
            
            Object.keys(updates).forEach(key => {
                if (allowedUpdates.includes(key)) {
                    filteredUpdates[key] = updates[key];
                }
            });

            if (Object.keys(filteredUpdates).length === 0) {
                throw new Error('No valid updates provided');
            }

            const setClause = Object.keys(filteredUpdates).map(key => `${key} = ?`).join(', ');
            const values = Object.values(filteredUpdates);

            this.dbService.db.run(`
                UPDATE leagues 
                SET ${setClause}, updated_at = CURRENT_TIMESTAMP 
                WHERE id = ?
            `, [...values, leagueId]);

            await this.dbService.saveDatabase();
            return await this.getLeagueById(leagueId);
        } catch (error) {
            console.error('Error updating league:', error);
            throw error;
        }
    }

    async deleteLeague(leagueId, requestingUserId) {
        try {
            const league = await this.getLeagueById(leagueId);
            if (!league) {
                throw new Error('League not found');
            }

            // Only creator can delete league
            if (league.creator_user_id !== requestingUserId) {
                throw new Error('Only the league creator can delete this league');
            }

            // Soft delete
            this.dbService.db.run('UPDATE leagues SET is_active = 0 WHERE id = ?', [leagueId]);
            this.dbService.db.run('UPDATE league_members SET is_active = 0 WHERE league_id = ?', [leagueId]);

            await this.dbService.saveDatabase();
            return true;
        } catch (error) {
            console.error('Error deleting league:', error);
            throw error;
        }
    }

    // Alias for getLeagueLeaderboard for backward compatibility
    async getLeagueRankings(leagueId, options = {}) {
        return this.getLeagueLeaderboard(leagueId, options);
    }

    async getBoardSpecificRankings(leagueId) {
        try {
            // Get all board types
            const boardTypes = await this.dbService.getBoardTypes();
            const boardRankings = {};

            for (const boardType of boardTypes) {
                const rankings = await this.getLeagueLeaderboard(leagueId, {
                    boardTypeId: boardType.id,
                    limit: 50
                });

                if (rankings.length > 0) {
                    boardRankings[boardType.id] = rankings;
                }
            }

            return boardRankings;
        } catch (error) {
            console.error('Error getting board-specific rankings:', error);
            throw error;
        }
    }
}

module.exports = LeagueService;