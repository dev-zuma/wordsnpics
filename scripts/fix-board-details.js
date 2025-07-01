/**
 * Fix specific board details as requested
 */

const initSqlJs = require('sql.js');
const fs = require('fs').promises;
const path = require('path');

async function fixBoardDetails() {
    try {
        console.log('🔧 Fixing board details...');
        
        // Initialize sql.js
        const SQL = await initSqlJs();
        
        // Load database
        const dbPath = path.join(__dirname, '../database/wordsnpics.db');
        const dbBuffer = await fs.readFile(dbPath);
        const db = new SQL.Database(new Uint8Array(dbBuffer));
        
        // Update Internet Things to The Download
        console.log('📥 Converting Internet Things to The Download...');
        db.run(`
            UPDATE board_types 
            SET 
                id = 'the-download',
                name = 'The Download',
                description = 'Today''s top tech decoded into words',
                icon = '📥',
                one_liner = 'Today''s top tech decoded into words.',
                prompt = 'For this topic, select themes based on current technology trends, innovations, and digital culture. This includes artificial intelligence, emerging hardware, futuristic transportation, social platforms, data privacy, Web3, software tools, robotics, and other fast-evolving ideas shaping the tech world. Aim for a fun, accessible blend of terms — some widely known, some surprising — that reflect the pace and impact of modern tech.'
            WHERE id = 'internet-things'
        `);
        
        // Update any existing boards that reference the old ID
        db.run(`UPDATE boards SET board_type_id = 'the-download' WHERE board_type_id = 'internet-things'`);
        
        // Verify the changes
        console.log('✅ Verification of updated board types:');
        const stmt = db.prepare('SELECT id, name, icon, one_liner FROM board_types WHERE is_active = 1 ORDER BY name');
        while (stmt.step()) {
            const bt = stmt.getAsObject();
            console.log(`  ${bt.icon || '🎯'} ${bt.name} (${bt.id})`);
            console.log(`    "${bt.one_liner || 'No description'}"`);
        }
        stmt.free();
        
        // Save database
        const dbData = db.export();
        await fs.writeFile(dbPath, Buffer.from(dbData));
        db.close();
        
        console.log('\n✅ Board details updated successfully!');
        
    } catch (error) {
        console.error('❌ Failed to fix board details:', error);
        throw error;
    }
}

// Run the fix
fixBoardDetails()
    .then(() => {
        console.log('\n🎉 Board details fix completed!');
        process.exit(0);
    })
    .catch((error) => {
        console.error('\n💥 Board details fix failed:', error);
        process.exit(1);
    });