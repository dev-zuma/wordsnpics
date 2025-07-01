const express = require('express');
const router = express.Router();
const LeagueService = require('../services/league-service');

// Middleware to ensure user is authenticated
function requireAuth(req, res, next) {
    if (!req.isAuthenticated()) {
        return res.status(401).json({ error: 'Authentication required' });
    }
    next();
}

// Middleware to ensure user has active profile
function requireProfile(req, res, next) {
    if (!req.session.activeProfile || !req.session.activeProfile.id) {
        return res.status(400).json({ 
            error: 'Active profile required',
            message: 'Please select a profile before accessing leagues'
        });
    }
    next();
}

// Initialize league service
let leagueService = null;
function getLeagueService() {
    if (!leagueService) {
        const dbService = require('../database/wordsnpics-db');
        leagueService = new LeagueService(dbService);
    }
    return leagueService;
}

// Create new league
router.post('/', requireAuth, requireProfile, async (req, res) => {
    try {
        const { name, description, scoringMethod, competitionType, boardTypeId, maxMembers, isPublic } = req.body;
        
        if (!name || name.trim().length < 3) {
            return res.status(400).json({ error: 'League name must be at least 3 characters' });
        }

        const leagueData = {
            name: name.trim(),
            description: description?.trim() || '',
            creatorUserId: req.user.id,
            creatorProfileId: req.session.activeProfile.id,
            scoringMethod: scoringMethod || 'standard',
            competitionType: competitionType || 'ongoing',
            boardTypeId: boardTypeId || null,
            maxMembers: parseInt(maxMembers) || 50,
            isPublic: !!isPublic
        };

        const league = await getLeagueService().createLeague(leagueData);
        
        res.json({
            success: true,
            league: league,
            message: `League "${league.name}" created successfully!`
        });

    } catch (error) {
        console.error('Error creating league:', error);
        res.status(500).json({ error: 'Failed to create league', message: error.message });
    }
});

// Join league by code
router.post('/join', requireAuth, requireProfile, async (req, res) => {
    try {
        const { leagueCode, nickname } = req.body;
        
        if (!leagueCode || leagueCode.length !== 6) {
            return res.status(400).json({ error: 'Valid 6-character league code required' });
        }

        const league = await getLeagueService().getLeagueByCode(leagueCode.toUpperCase());
        if (!league) {
            return res.status(404).json({ error: 'League not found with that code' });
        }

        const membership = await getLeagueService().joinLeague(
            league.id, 
            req.user.id, 
            req.session.activeProfile.id,
            { nickname: nickname?.trim() || null }
        );

        res.json({
            success: true,
            league: league,
            membership: membership,
            message: `Successfully joined "${league.name}"!`
        });

    } catch (error) {
        console.error('Error joining league:', error);
        res.status(500).json({ error: 'Failed to join league', message: error.message });
    }
});

// Leave league
router.post('/:leagueId/leave', requireAuth, requireProfile, async (req, res) => {
    try {
        const { leagueId } = req.params;
        
        await getLeagueService().leaveLeague(leagueId, req.user.id, req.session.activeProfile.id);
        
        res.json({
            success: true,
            message: 'Successfully left the league'
        });

    } catch (error) {
        console.error('Error leaving league:', error);
        res.status(500).json({ error: 'Failed to leave league', message: error.message });
    }
});

// Get league by code (for authenticated details view)
router.get('/by-code/:leagueCode', requireAuth, requireProfile, async (req, res) => {
    try {
        const { leagueCode } = req.params;
        
        if (!leagueCode || leagueCode.length !== 6) {
            return res.status(400).json({ error: 'Invalid league code format' });
        }
        
        const league = await getLeagueService().getLeagueByCode(leagueCode);
        
        if (!league) {
            return res.status(404).json({ error: 'League not found' });
        }
        
        // Check if user is a member
        const membership = await getLeagueService().getLeagueMembership(
            league.id, 
            req.user.id, 
            req.session.activeProfile.id
        );
        
        if (!membership) {
            return res.status(403).json({ error: 'You are not a member of this league' });
        }
        
        // Add member count to response
        const memberCount = await getLeagueService().getLeagueMemberCount(league.id);
        
        res.json({
            ...league,
            member_count: memberCount
        });
        
    } catch (error) {
        console.error('Error getting league by code:', error);
        res.status(500).json({ error: 'Failed to get league information' });
    }
});

// Get league rankings
router.get('/:leagueId/rankings', requireAuth, requireProfile, async (req, res) => {
    try {
        const { leagueId } = req.params;
        
        // Check if user is a member
        const membership = await getLeagueService().getLeagueMembership(
            leagueId, 
            req.user.id, 
            req.session.activeProfile.id
        );
        
        if (!membership) {
            return res.status(403).json({ error: 'You are not a member of this league' });
        }
        
        // Get overall rankings
        const overallRankings = await getLeagueService().getLeagueRankings(leagueId);
        
        // Get board-specific rankings
        const boardRankings = await getLeagueService().getBoardSpecificRankings(leagueId);
        
        res.json({
            overall: overallRankings,
            boards: boardRankings
        });
        
    } catch (error) {
        console.error('Error getting league rankings:', error);
        res.status(500).json({ error: 'Failed to get league rankings' });
    }
});

// Get public league info by code (for join flow)
router.get('/public/:leagueCode', async (req, res) => {
    try {
        const { leagueCode } = req.params;
        
        if (!leagueCode || leagueCode.length !== 6) {
            return res.status(400).json({ error: 'Invalid league code format' });
        }
        
        const league = await getLeagueService().getLeagueByCode(leagueCode);
        
        if (!league) {
            return res.status(404).json({ error: 'League not found' });
        }
        
        // Return public information only
        res.json({
            id: league.id,
            name: league.name,
            description: league.description,
            league_code: league.league_code,
            is_public: league.is_public,
            member_count: league.member_count,
            scoring_method: league.scoring_method,
            max_members: league.max_members
        });
        
    } catch (error) {
        console.error('Error getting public league info:', error);
        res.status(500).json({ error: 'Failed to get league information' });
    }
});

// Get user's leagues
router.get('/my-leagues', requireAuth, requireProfile, async (req, res) => {
    try {
        const leagues = await getLeagueService().getUserLeagues(req.user.id, req.session.activeProfile.id);
        
        // Add user rank for each league
        for (const league of leagues) {
            try {
                const leaderboard = await getLeagueService().getLeagueLeaderboard(league.id, { limit: 100 });
                const userRank = leaderboard.findIndex(member => 
                    member.user_id === req.user.id && member.profile_id === req.session.activeProfile.id
                );
                league.user_rank = userRank >= 0 ? userRank + 1 : null;
                league.recent_activity = leaderboard.filter(member => {
                    const lastPlayed = new Date(member.last_played);
                    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
                    return lastPlayed > threeDaysAgo;
                }).length;
            } catch (error) {
                console.warn(`Error getting rank for league ${league.id}:`, error);
                league.user_rank = null;
                league.recent_activity = 0;
            }
        }

        res.json({
            success: true,
            leagues: leagues
        });

    } catch (error) {
        console.error('Error getting user leagues:', error);
        res.status(500).json({ error: 'Failed to load leagues' });
    }
});

// Get league details with leaderboard
router.get('/:leagueId', requireAuth, requireProfile, async (req, res) => {
    try {
        const { leagueId } = req.params;
        const { timeFrame = 'all', boardType } = req.query;
        
        const leagueDetails = await getLeagueService().getLeagueDetails(
            leagueId, 
            req.user.id, 
            req.session.activeProfile.id
        );

        // Get leaderboard with filters
        const leaderboard = await getLeagueService().getLeagueLeaderboard(leagueId, {
            timeFrame: timeFrame,
            boardTypeId: boardType
        });

        res.json({
            success: true,
            ...leagueDetails,
            leaderboard: leaderboard
        });

    } catch (error) {
        console.error('Error getting league details:', error);
        res.status(500).json({ error: 'Failed to load league details', message: error.message });
    }
});

// Update league settings
router.put('/:leagueId', requireAuth, requireProfile, async (req, res) => {
    try {
        const { leagueId } = req.params;
        const updates = req.body;
        
        const updatedLeague = await getLeagueService().updateLeague(leagueId, updates, req.user.id);
        
        res.json({
            success: true,
            league: updatedLeague,
            message: 'League updated successfully'
        });

    } catch (error) {
        console.error('Error updating league:', error);
        res.status(500).json({ error: 'Failed to update league', message: error.message });
    }
});

// Delete league
router.delete('/:leagueId', requireAuth, requireProfile, async (req, res) => {
    try {
        const { leagueId } = req.params;
        
        await getLeagueService().deleteLeague(leagueId, req.user.id);
        
        res.json({
            success: true,
            message: 'League deleted successfully'
        });

    } catch (error) {
        console.error('Error deleting league:', error);
        res.status(500).json({ error: 'Failed to delete league', message: error.message });
    }
});

// Submit game score to leagues (called automatically after game completion)
router.post('/:leagueId/submit-score', requireAuth, requireProfile, async (req, res) => {
    try {
        const { leagueId } = req.params;
        const { gameSessionId } = req.body;
        
        if (!gameSessionId) {
            return res.status(400).json({ error: 'Game session ID required' });
        }

        await getLeagueService().submitGameToLeagues(gameSessionId, req.session.activeProfile.id);
        
        res.json({
            success: true,
            message: 'Score submitted to league'
        });

    } catch (error) {
        console.error('Error submitting score to league:', error);
        res.status(500).json({ error: 'Failed to submit score to league', message: error.message });
    }
});

// Generate invite link
router.post('/:leagueId/invite', requireAuth, requireProfile, async (req, res) => {
    try {
        const { leagueId } = req.params;
        const { inviteMethod } = req.body;
        
        const league = await getLeagueService().getLeagueById(leagueId);
        if (!league) {
            return res.status(404).json({ error: 'League not found' });
        }

        // Check if user is member of league
        const membership = await getLeagueService().getLeagueMembership(leagueId, req.user.id, req.session.activeProfile.id);
        if (!membership) {
            return res.status(403).json({ error: 'You must be a member to invite others' });
        }

        const inviteLink = `${req.protocol}://${req.get('host')}/join/${league.league_code}`;
        const shareText = `Join our WORDSNPICS league "${league.name}"! Use code ${league.league_code} or click: ${inviteLink}`;

        res.json({
            success: true,
            league_code: league.league_code,
            invite_link: inviteLink,
            share_text: shareText,
            qr_code_url: `${req.protocol}://${req.get('host')}/api/qr/${league.league_code}` // Future implementation
        });

    } catch (error) {
        console.error('Error generating invite:', error);
        res.status(500).json({ error: 'Failed to generate invite', message: error.message });
    }
});

// Search/discover public leagues
router.get('/discover/public', requireAuth, async (req, res) => {
    try {
        const { search, boardType, limit = 20 } = req.query;
        
        let query = `
            SELECT l.*, 
                   (SELECT COUNT(*) FROM league_members WHERE league_id = l.id AND is_active = 1) as member_count,
                   (SELECT display_name FROM profiles p JOIN users u ON p.user_id = u.id WHERE u.id = l.creator_user_id LIMIT 1) as creator_name
            FROM leagues l 
            WHERE l.is_public = 1 AND l.is_active = 1
        `;
        
        const params = [];
        
        if (search) {
            query += ' AND (l.name LIKE ? OR l.description LIKE ?)';
            params.push(`%${search}%`, `%${search}%`);
        }
        
        if (boardType) {
            query += ' AND l.board_type_id = ?';
            params.push(boardType);
        }
        
        query += ' ORDER BY member_count DESC, l.created_at DESC LIMIT ?';
        params.push(parseInt(limit));

        const dbService = require('../database/wordsnpics-db');
        const stmt = dbService.db.prepare(query);
        const leagues = [];
        stmt.bind(params);
        while (stmt.step()) {
            leagues.push(stmt.getAsObject());
        }
        stmt.free();

        res.json({
            success: true,
            leagues: leagues
        });

    } catch (error) {
        console.error('Error discovering leagues:', error);
        res.status(500).json({ error: 'Failed to discover leagues' });
    }
});

module.exports = router;