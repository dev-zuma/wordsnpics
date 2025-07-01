// This module ensures we have exactly the 8 curated board types
// It removes any boards not in our list and adds missing ones

const CURATED_BOARDS = [
    'americana',
    'animal-kingdom', 
    'historical-figures',
    'mind-benders',
    'startup',
    'the-download',
    'wordsnpics-daily',
    'world-watch'
];

async function ensureBoards(dbService) {
    try {
        // Get current boards
        const boardTypes = await dbService.getBoardTypes();
        
        // Remove any boards not in our curated list
        let removedCount = 0;
        for (const board of boardTypes) {
            if (!CURATED_BOARDS.includes(board.id)) {
                dbService.db.run('DELETE FROM board_types WHERE id = ?', [board.id]);
                removedCount++;
                console.log(`🗑️ Removed unexpected board: ${board.name} (${board.id})`);
            }
        }
        
        // Check if WordsNPics Daily exists (in case it's missing)
        const hasDaily = boardTypes.some(bt => bt.id === 'wordsnpics-daily');
        if (!hasDaily) {
            dbService.db.run(`
                INSERT INTO board_types 
                (id, name, icon, one_liner, prompt, description, is_premium, is_active)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                'wordsnpics-daily',
                'WordsNPics Daily',
                '🧩',
                'Your go-to grid of clever connections, fresh every day.',
                'Distinct and broad conceptual themes that are interesting and accessible to a wide audience aged 10 years and older.',
                'Your go-to grid of clever connections, fresh every day.',
                0,
                1
            ]);
            console.log('➕ Added missing WordsNPics Daily board');
        }
        
        if (removedCount > 0) {
            await dbService.saveDatabase();
            console.log(`✅ Board cleanup complete: removed ${removedCount} unwanted boards`);
        }
        
    } catch (error) {
        console.error('Error ensuring boards:', error);
    }
}

module.exports = { ensureBoards, CURATED_BOARDS };