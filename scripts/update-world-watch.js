const dbService = require('../database/wordsnpics-db');

async function updateWorldWatch() {
    try {
        await dbService.initialize();
        
        console.log('🌍 Updating World Watch board prompt...');
        
        const newPrompt = `For this topic, generate themes and word groups based on major global events, political shifts, cultural movements, and social changes that are actively unfolding or trending in the last 7 days. Use news headlines and global media coverage as inspiration. Focus on contemporary relevance — such as international elections, diplomatic tensions, protests, climate summits, tech regulation, viral movements, or sports/political controversies. Themes should still be conceptually clean (e.g., "Heat Waves Across Europe" or "Tech Layoffs") but rooted in what is happening now. The words should connect strongly to this context, helping players link familiar headlines to key ideas.`;
        
        dbService.db.run(`
            UPDATE board_types 
            SET prompt = ?
            WHERE id = 'world-watch'
        `, [newPrompt]);
        
        // Save changes
        await dbService.saveDatabase();
        
        console.log('✅ Updated World Watch board prompt');
        
        // Verify the update
        const boardTypes = await dbService.getBoardTypes();
        const worldWatch = boardTypes.find(bt => bt.id === 'world-watch');
        if (worldWatch) {
            console.log('\n📋 New prompt:');
            console.log(worldWatch.prompt);
        }
        
    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

updateWorldWatch();