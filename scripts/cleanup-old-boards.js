const dbService = require('../database/wordsnpics-db');

async function removeOldBoards() {
  try {
    await dbService.initialize();
    
    const boardTypes = await dbService.getBoardTypes();
    console.log('📋 Current board types:');
    
    const toRemove = [];
    boardTypes.forEach(bt => {
      const hasPrompt = bt.prompt && bt.prompt.trim() !== '';
      console.log(`- ${bt.name} (prompt: ${hasPrompt ? 'YES' : 'NO'})`);
      if (!hasPrompt) {
        toRemove.push(bt.id);
      }
    });
    
    console.log(`\n🗑️ Removing ${toRemove.length} boards without prompts:`, toRemove.join(', '));
    
    for (const boardId of toRemove) {
      dbService.db.run('DELETE FROM board_types WHERE id = ?', [boardId]);
      console.log(`✅ Removed: ${boardId}`);
    }
    
    // Save changes to file
    await dbService.saveDatabase();
    
    console.log('\n📋 Remaining board types:');
    const remaining = await dbService.getBoardTypes();
    remaining.forEach(bt => console.log(`  ${bt.icon || '🎯'} ${bt.name} (${bt.id})`));
    
    console.log(`\n✅ Cleanup complete! ${remaining.length} board types remaining.`);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

removeOldBoards();