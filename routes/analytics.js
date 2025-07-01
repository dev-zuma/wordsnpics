const express = require('express');
const { dbService } = require('../config/auth');
const router = express.Router();

// Get global analytics (no auth required for basic stats)
router.get('/global', async (req, res) => {
    try {
        const stats = await dbService.getGlobalStats();
        res.json(stats);
    } catch (error) {
        console.error('Error fetching global stats:', error);
        res.status(500).json({ error: 'Failed to fetch global statistics' });
    }
});

// Get recent games (anonymous data)
router.get('/recent-games', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 20;
        
        const recentGames = await dbService.db.all(`
            SELECT 
                correct_words,
                total_words,
                turns_used,
                time_elapsed,
                is_win,
                completed_at,
                puzzle_title
            FROM game_sessions 
            ORDER BY completed_at DESC 
            LIMIT ?
        `, [limit]);

        res.json(recentGames);
    } catch (error) {
        console.error('Error fetching recent games:', error);
        res.status(500).json({ error: 'Failed to fetch recent games' });
    }
});

// Get leaderboard (top scores)
router.get('/leaderboard', async (req, res) => {
    try {
        const period = req.query.period || 'all'; // 'today', 'week', 'month', 'all'
        let dateFilter = '';
        
        switch (period) {
            case 'today':
                dateFilter = "AND date(completed_at) = date('now')";
                break;
            case 'week':
                dateFilter = "AND completed_at >= date('now', '-7 days')";
                break;
            case 'month':
                dateFilter = "AND completed_at >= date('now', '-30 days')";
                break;
        }

        const leaderboard = await dbService.db.all(`
            SELECT 
                u.name,
                u.avatar,
                MAX(gs.correct_words) as best_score,
                MIN(gs.turns_used) as best_turns,
                gs.time_elapsed,
                gs.completed_at
            FROM game_sessions gs
            LEFT JOIN users u ON gs.user_id = u.id
            WHERE gs.is_win = 1 ${dateFilter}
            GROUP BY COALESCE(gs.user_id, gs.session_id)
            ORDER BY best_score DESC, best_turns ASC, gs.completed_at ASC
            LIMIT 50
        `);

        res.json(leaderboard);
    } catch (error) {
        console.error('Error fetching leaderboard:', error);
        res.status(500).json({ error: 'Failed to fetch leaderboard' });
    }
});

module.exports = router;