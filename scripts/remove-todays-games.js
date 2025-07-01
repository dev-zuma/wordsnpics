const dbService = require('../database/wordsnpics-db');

async function removeTodaysGames() {
    try {
        await dbService.initialize();
        
        const targetDate = '2025-06-28'; // The date you actually used for testing
        console.log(`🗑️ Removing all games generated for ${targetDate}...`);
        
        // Get boards for target date
        const boards = await dbService.getAllBoards();
        const targetBoards = boards.filter(board => board.date === targetDate);
        
        console.log(`Found ${targetBoards.length} boards for ${targetDate}`);
        
        for (const board of targetBoards) {
            // Delete the board (CASCADE will delete images and words)
            await dbService.deleteBoard(board.id);
            console.log(`✅ Removed board: ${board.title} (${board.id})`);
        }
        
        // Save changes
        await dbService.saveDatabase();
        
        console.log(`\n✅ Removed ${targetBoards.length} boards for ${targetDate}`);
        
    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

removeTodaysGames();