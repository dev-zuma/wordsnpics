#!/usr/bin/env node

/**
 * Fix Board Type IDs Script
 * 
 * This script ensures board_type_id values in boards table match
 * the actual IDs in board_types table
 */

require('dotenv').config();
const dbService = require('../database/wordsnpics-db');

async function fixBoardTypeIds() {
    console.log('🔧 Fixing board type ID mismatches...\n');
    
    try {
        await dbService.initialize();
        
        // Get all board types
        const boardTypes = await dbService.getBoardTypes();
        const boardTypeMap = {};
        
        console.log('📋 Board Types Found:');
        boardTypes.forEach(bt => {
            boardTypeMap[bt.name.toLowerCase().replace(/\s+/g, '-')] = bt.id;
            console.log(`   • ${bt.name} => ${bt.id}`);
        });
        
        // Check for common variations
        if (boardTypeMap['wordsnpics-daily'] && !boardTypeMap['wordsnpics-daily']) {
            boardTypeMap['wordsnpics-daily'] = boardTypeMap['wordsnpics-daily'];
        }
        
        // Get all boards
        const stmt = dbService.db.prepare('SELECT * FROM boards');
        const boards = [];
        while (stmt.step()) {
            boards.push(stmt.getAsObject());
        }
        stmt.free();
        
        console.log(`\n📊 Total boards to check: ${boards.length}`);
        
        let fixedCount = 0;
        
        // Fix each board
        for (const board of boards) {
            // Try to find the correct board type ID
            let correctBoardTypeId = null;
            
            // Check if current board_type_id exists in board_types
            const checkStmt = dbService.db.prepare('SELECT id FROM board_types WHERE id = ?');
            checkStmt.bind([board.board_type_id]);
            const exists = checkStmt.step();
            checkStmt.free();
            
            if (!exists) {
                console.log(`\n❌ Board "${board.title}" has invalid board_type_id: ${board.board_type_id}`);
                
                // Try to match by common patterns
                if (board.board_type_id === 'wordsnpics-daily' || board.board_type_id === 'daily') {
                    correctBoardTypeId = boardTypeMap['wordsnpics-daily'] || boardTypeMap['wordsnpics-daily'];
                } else {
                    // Try to match by board type ID directly
                    correctBoardTypeId = boardTypeMap[board.board_type_id];
                }
                
                if (correctBoardTypeId) {
                    console.log(`   🔧 Fixing to: ${correctBoardTypeId}`);
                    
                    const updateStmt = dbService.db.prepare('UPDATE boards SET board_type_id = ? WHERE id = ?');
                    updateStmt.run([correctBoardTypeId, board.id]);
                    updateStmt.free();
                    
                    fixedCount++;
                } else {
                    console.log(`   ⚠️  Could not determine correct board type`);
                }
            }
        }
        
        if (fixedCount > 0) {
            await dbService.saveDatabase();
            console.log(`\n✅ Fixed ${fixedCount} boards with incorrect board_type_id values`);
        } else {
            console.log('\n✅ All boards have valid board_type_id values');
        }
        
        // Verify the fix
        console.log('\n🔍 Verifying fix...');
        const verifyStmt = dbService.db.prepare(`
            SELECT b.board_type_id, COUNT(*) as count, bt.name
            FROM boards b
            LEFT JOIN board_types bt ON b.board_type_id = bt.id
            GROUP BY b.board_type_id
        `);
        
        console.log('\nBoard Type Usage:');
        while (verifyStmt.step()) {
            const row = verifyStmt.getAsObject();
            console.log(`   • ${row.board_type_id}: ${row.count} boards (${row.name || 'INVALID TYPE'})`);
        }
        verifyStmt.free();
        
        await dbService.close();
        
    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
}

async function main() {
    console.log('🔧 WORDSNPICS Board Type ID Fixer');
    console.log('==================================\n');
    
    await fixBoardTypeIds();
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = { fixBoardTypeIds };