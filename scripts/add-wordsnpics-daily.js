const dbService = require('../database/wordsnpics-db');

async function addWordsNPicsDaily() {
  try {
    await dbService.initialize();
    
    console.log('📋 Adding WordsNPics Daily board...');
    
    // Add the WordsNPics Daily board
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
    
    console.log('✅ Added WordsNPics Daily board');
    
    // Save changes to file
    await dbService.saveDatabase();
    
    console.log('\n📋 Current board types:');
    const boardTypes = await dbService.getBoardTypes();
    boardTypes.forEach((bt, index) => {
      console.log(`  ${index + 1}. ${bt.icon || '🎯'} ${bt.name} (${bt.id})`);
    });
    console.log(`\nTotal: ${boardTypes.length} board types`);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

addWordsNPicsDaily();