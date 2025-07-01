/**
 * Script to migrate board types from old database to new database
 * with requested modifications
 */

const initSqlJs = require('sql.js');
const fs = require('fs').promises;
const path = require('path');

async function migrateBoardTypes() {
    try {
        console.log('🔄 Starting board types migration...');
        
        // Initialize sql.js
        const SQL = await initSqlJs();
        
        // Load old database
        const oldDbPath = path.join(__dirname, '../database/wordlinks.db');
        const oldDbBuffer = await fs.readFile(oldDbPath);
        const oldDb = new SQL.Database(new Uint8Array(oldDbBuffer));
        
        // Load new database
        const newDbPath = path.join(__dirname, '../database/wordsnpics.db');
        const newDbBuffer = await fs.readFile(newDbPath);
        const newDb = new SQL.Database(new Uint8Array(newDbBuffer));
        
        // Get existing board types from old database
        console.log('📖 Reading board types from old database...');
        const oldBoardTypes = [];
        const stmt = oldDb.prepare('SELECT * FROM board_types ORDER BY name');
        while (stmt.step()) {
            oldBoardTypes.push(stmt.getAsObject());
        }
        stmt.free();
        
        console.log(`Found ${oldBoardTypes.length} board types in old database:`);
        oldBoardTypes.forEach(bt => {
            console.log(`  - ${bt.name} (${bt.id})`);
        });
        
        // Apply modifications as requested
        const modifiedBoardTypes = oldBoardTypes.map(bt => {
            const newBoardType = { ...bt };
            
            // Update Americana to be harder
            if (bt.id === 'americana' || bt.name.toLowerCase().includes('americana')) {
                console.log('🔧 Making Americana harder...');
                newBoardType.prompt = `Create challenging Americana-themed puzzle groups that require deeper knowledge of American culture, history, and society. Focus on:

- Historical events, figures, and periods that shaped America
- Cultural movements, traditions, and regional characteristics
- Political systems, founding principles, and constitutional concepts
- American innovations, landmarks, and symbols with cultural significance
- Entertainment, sports, and artistic contributions that define American identity

Make the connections more sophisticated and require cultural knowledge beyond surface-level recognition. Include some lesser-known but important elements alongside well-known ones. Each group should test understanding of American heritage rather than just recognition of American things.

Difficulty should be elevated with connections that require historical context, cultural awareness, or deeper knowledge of American society and values.`;
            }
            
            // Change Internet of Things to The Download
            if (bt.id === 'iot' || bt.name.toLowerCase().includes('internet of things')) {
                console.log('🔧 Converting Internet of Things to The Download...');
                newBoardType.id = 'the-download';
                newBoardType.name = 'The Download';
                newBoardType.icon = '📥';
                newBoardType.one_liner = 'Today\'s top tech decoded into words.';
                newBoardType.prompt = `For this topic, select themes based on current technology trends, innovations, and digital culture. This includes artificial intelligence, emerging hardware, futuristic transportation, social platforms, data privacy, Web3, software tools, robotics, and other fast-evolving ideas shaping the tech world. Aim for a fun, accessible blend of terms — some widely known, some surprising — that reflect the pace and impact of modern tech.`;
            }
            
            return newBoardType;
        });
        
        // Add the new World Watch board
        console.log('➕ Adding new World Watch board...');
        modifiedBoardTypes.push({
            id: 'world-watch',
            name: 'World Watch',
            description: 'Politics, pop culture, and global events',
            icon: '🌍',
            one_liner: 'Politics, pop culture, and global events — stay sharp with what\'s shaping the world.',
            prompt: `For this topic, select themes inspired by current events, international affairs, cultural moments, political shifts, viral stories, public movements, global crises, or breakthrough moments in entertainment or society. Keep the concepts broad, interesting, and understandable to a general audience aged 10+. Avoid hyper-local references and ensure each theme reflects something timely or widely discussed.`,
            is_premium: 0,
            is_active: 1
        });
        
        // Clear existing board types in new database (except the defaults)
        console.log('🗑️ Clearing old board types from new database...');
        newDb.run('DELETE FROM board_types WHERE id NOT IN (\'daily\', \'travel\', \'food\', \'sports\', \'animals\')');
        
        // Insert modified board types into new database
        console.log('💾 Inserting updated board types...');
        
        for (const boardType of modifiedBoardTypes) {
            // Skip if it's one of the basic default types
            if (['daily', 'travel', 'food', 'sports', 'animals'].includes(boardType.id)) {
                continue;
            }
            
            const insertStmt = newDb.prepare(`
                INSERT OR REPLACE INTO board_types 
                (id, name, description, icon, one_liner, prompt, is_premium, is_active)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `);
            
            insertStmt.run([
                boardType.id,
                boardType.name,
                boardType.description || boardType.one_liner,
                boardType.icon || '🎯',
                boardType.one_liner || boardType.description,
                boardType.prompt || '',
                boardType.is_premium || 0,
                boardType.is_active !== undefined ? boardType.is_active : 1
            ]);
            
            insertStmt.free();
            console.log(`  ✅ Added: ${boardType.name} (${boardType.id})`);
        }
        
        // Save new database
        const newDbData = newDb.export();
        await fs.writeFile(newDbPath, Buffer.from(newDbData));
        
        // Close databases
        oldDb.close();
        newDb.close();
        
        console.log('✅ Board types migration completed successfully!');
        console.log('\n📋 Final board types:');
        
        // Verify by reading the new database
        const verifyDbBuffer = await fs.readFile(newDbPath);
        const verifyDb = new SQL.Database(new Uint8Array(verifyDbBuffer));
        
        const verifyStmt = verifyDb.prepare('SELECT id, name, icon, one_liner FROM board_types WHERE is_active = 1 ORDER BY name');
        while (verifyStmt.step()) {
            const bt = verifyStmt.getAsObject();
            console.log(`  ${bt.icon || '🎯'} ${bt.name} (${bt.id}) - ${bt.one_liner || 'No description'}`);
        }
        verifyStmt.free();
        verifyDb.close();
        
    } catch (error) {
        console.error('❌ Migration failed:', error);
        throw error;
    }
}

// Run migration
migrateBoardTypes()
    .then(() => {
        console.log('\n🎉 Migration script completed!');
        process.exit(0);
    })
    .catch((error) => {
        console.error('\n💥 Migration script failed:', error);
        process.exit(1);
    });