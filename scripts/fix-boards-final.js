const dbService = require('../database/wordsnpics-db');

async function fixBoardsFinal() {
  try {
    await dbService.initialize();
    
    console.log('🔧 Fixing board configuration...\n');
    
    // Get current boards
    const boardTypes = await dbService.getBoardTypes();
    console.log(`Current boards: ${boardTypes.length}`);
    
    // Remove boards without prompts
    console.log('\n🗑️ Removing boards without prompts...');
    const toRemove = boardTypes.filter(bt => !bt.prompt || bt.prompt.trim() === '');
    
    for (const board of toRemove) {
      dbService.db.run('DELETE FROM board_types WHERE id = ?', [board.id]);
      console.log(`✅ Removed: ${board.name} (${board.id})`);
    }
    
    // Check if WordsNPics Daily exists
    const hasDaily = boardTypes.some(bt => bt.id === 'wordsnpics-daily');
    
    if (!hasDaily) {
      console.log('\n➕ Adding WordsNPics Daily...');
      dbService.db.run(`
        INSERT OR REPLACE INTO board_types 
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
      console.log('✅ Added WordsNPics Daily');
    } else {
      console.log('\n✅ WordsNPics Daily already exists');
    }
    
    // Save changes
    await dbService.saveDatabase();
    
    // Show final state
    console.log('\n📋 Final board types (8 total):');
    const finalBoards = await dbService.getBoardTypes();
    finalBoards.forEach((bt, i) => {
      console.log(`  ${i+1}. ${bt.icon || '🎯'} ${bt.name} (${bt.id})`);
    });
    console.log(`\nTotal: ${finalBoards.length} boards`);
    
    if (finalBoards.length !== 8) {
      console.log('\n⚠️ Warning: Expected 8 boards but found ' + finalBoards.length);
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

fixBoardsFinal();