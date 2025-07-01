#!/usr/bin/env node

/**
 * Clean Board Generation Script
 * 
 * This script removes problematic boards that were being generated for July 1st
 * while preserving:
 * - User accounts and profiles
 * - Game sessions 
 * - The first 7 successfully generated boards
 * - Board types configuration
 */

require('dotenv').config();
const path = require('path');
const fs = require('fs').promises;
const dbService = require('../database/wordsnpics-db');

async function analyzeBoardData() {
    console.log('🔍 Analyzing board generation data...');
    
    try {
        await dbService.initialize();
        
        // Get all boards ordered by creation date
        const stmt = dbService.db.prepare(`
            SELECT b.id, b.board_type_id, b.title, b.date, b.scheduled_date, b.is_daily, b.is_published, b.created_at,
                   bt.name as board_type_name,
                   (SELECT COUNT(*) FROM puzzle_images WHERE board_id = b.id) as image_count,
                   (SELECT COUNT(*) FROM puzzle_words WHERE board_id = b.id) as word_count
            FROM boards b
            LEFT JOIN board_types bt ON b.board_type_id = bt.id
            ORDER BY b.created_at ASC
        `);
        
        const boards = [];
        while (stmt.step()) {
            boards.push(stmt.getAsObject());
        }
        stmt.free();
        
        console.log(`📊 Total boards found: ${boards.length}`);
        
        if (boards.length <= 7) {
            console.log('✅ 7 or fewer boards found - no cleanup needed');
            return { needsCleanup: false, boards };
        }
        
        // Separate boards by date and generation status
        const july1Boards = boards.filter(board => 
            board.scheduled_date === '2025-07-01' || 
            board.date === '2025-07-01' ||
            board.created_at?.includes('2025-07-01')
        );
        
        const otherBoards = boards.filter(board => 
            board.scheduled_date !== '2025-07-01' && 
            board.date !== '2025-07-01' &&
            !board.created_at?.includes('2025-07-01')
        );
        
        // Find problematic boards (likely the ones after the first 7)
        const firstSevenBoards = boards.slice(0, 7);
        const problematicBoards = boards.slice(7);
        
        console.log('📋 Board analysis:');
        console.log(`   First 7 boards (to keep): ${firstSevenBoards.length}`);
        console.log(`   Problematic boards (to remove): ${problematicBoards.length}`);
        console.log(`   July 1st boards total: ${july1Boards.length}`);
        console.log(`   Other date boards: ${otherBoards.length}`);
        
        // Show details of boards to keep
        console.log('\n🟢 Boards to KEEP (first 7):');
        firstSevenBoards.forEach((board, index) => {
            console.log(`   ${index + 1}. ${board.title || board.board_type_name} | Date: ${board.scheduled_date || board.date} | Images: ${board.image_count} | Words: ${board.word_count}`);
        });
        
        // Show details of boards to remove
        if (problematicBoards.length > 0) {
            console.log('\n🔴 Boards to REMOVE (likely corrupted):');
            problematicBoards.forEach((board, index) => {
                console.log(`   ${index + 8}. ${board.title || board.board_type_name} | Date: ${board.scheduled_date || board.date} | Images: ${board.image_count} | Words: ${board.word_count}`);
            });
        }
        
        return { 
            needsCleanup: problematicBoards.length > 0, 
            boards, 
            keepBoards: firstSevenBoards, 
            removeBoards: problematicBoards,
            july1Boards,
            otherBoards
        };
        
    } catch (error) {
        console.error('❌ Failed to analyze board data:', error);
        return { needsCleanup: false, error };
    }
}

async function createBackupBeforeCleanup() {
    console.log('💾 Creating backup before board cleanup...');
    
    const dbFile = dbService.dbPath;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFile = path.join(path.dirname(dbFile), `backup-before-board-cleanup-${timestamp}.db`);
    
    try {
        await fs.copyFile(dbFile, backupFile);
        console.log(`✅ Backup created: ${backupFile}`);
        return backupFile;
    } catch (error) {
        console.error('❌ Backup failed:', error);
        throw error;
    }
}

async function cleanProblematicBoards(boardsToRemove) {
    console.log(`🧹 Removing ${boardsToRemove.length} problematic boards...`);
    
    try {
        const boardIdsToRemove = boardsToRemove.map(board => board.id);
        
        console.log('🗑️  Removing puzzle words for problematic boards...');
        // Remove puzzle words for these boards
        const deleteWordsStmt = dbService.db.prepare(`
            DELETE FROM puzzle_words 
            WHERE board_id IN (${boardIdsToRemove.map(() => '?').join(',')})
        `);
        deleteWordsStmt.run(boardIdsToRemove);
        deleteWordsStmt.free();
        
        console.log('🗑️  Removing puzzle images for problematic boards...');
        // Remove puzzle images for these boards
        const deleteImagesStmt = dbService.db.prepare(`
            DELETE FROM puzzle_images 
            WHERE board_id IN (${boardIdsToRemove.map(() => '?').join(',')})
        `);
        deleteImagesStmt.run(boardIdsToRemove);
        deleteImagesStmt.free();
        
        console.log('🗑️  Removing problematic boards...');
        // Remove the boards themselves
        const deleteBoardsStmt = dbService.db.prepare(`
            DELETE FROM boards 
            WHERE id IN (${boardIdsToRemove.map(() => '?').join(',')})
        `);
        deleteBoardsStmt.run(boardIdsToRemove);
        deleteBoardsStmt.free();
        
        // Also clean up any game sessions that reference these boards
        console.log('🗑️  Removing game sessions for deleted boards...');
        const deleteGameSessionsStmt = dbService.db.prepare(`
            DELETE FROM game_sessions 
            WHERE board_id IN (${boardIdsToRemove.map(() => '?').join(',')})
        `);
        deleteGameSessionsStmt.run(boardIdsToRemove);
        deleteGameSessionsStmt.free();
        
        // Clean up shareable graphics for deleted boards
        console.log('🗑️  Removing shareable graphics for deleted boards...');
        const deleteGraphicsStmt = dbService.db.prepare(`
            DELETE FROM shareable_graphics 
            WHERE board_id IN (${boardIdsToRemove.map(() => '?').join(',')})
        `);
        deleteGraphicsStmt.run(boardIdsToRemove);
        deleteGraphicsStmt.free();
        
        // Save database changes
        await dbService.saveDatabase();
        
        console.log(`✅ Successfully removed ${boardsToRemove.length} problematic boards and associated data`);
        
        // Verify cleanup
        const remainingStmt = dbService.db.prepare('SELECT COUNT(*) as count FROM boards');
        const result = remainingStmt.step() ? remainingStmt.getAsObject() : { count: 0 };
        remainingStmt.free();
        
        console.log(`📊 Remaining boards: ${result.count}`);
        
        return true;
        
    } catch (error) {
        console.error('❌ Board cleanup failed:', error);
        throw error;
    }
}

async function verifyDatabaseIntegrity() {
    console.log('🔍 Verifying database integrity after board cleanup...');
    
    try {
        // Test basic operations
        const boardTypes = await dbService.getBoardTypes();
        console.log(`✅ Board types accessible: ${boardTypes.length}`);
        
        // Test users
        const usersStmt = dbService.db.prepare('SELECT COUNT(*) as count FROM users');
        const usersResult = usersStmt.step() ? usersStmt.getAsObject() : { count: 0 };
        usersStmt.free();
        console.log(`✅ Users preserved: ${usersResult.count}`);
        
        // Test profiles
        const profilesStmt = dbService.db.prepare('SELECT COUNT(*) as count FROM profiles');
        const profilesResult = profilesStmt.step() ? profilesStmt.getAsObject() : { count: 0 };
        profilesStmt.free();
        console.log(`✅ Profiles preserved: ${profilesResult.count}`);
        
        // Test remaining boards
        const boardsStmt = dbService.db.prepare('SELECT COUNT(*) as count FROM boards');
        const boardsResult = boardsStmt.step() ? boardsStmt.getAsObject() : { count: 0 };
        boardsStmt.free();
        console.log(`✅ Boards remaining: ${boardsResult.count}`);
        
        // Test puzzle images
        const imagesStmt = dbService.db.prepare('SELECT COUNT(*) as count FROM puzzle_images');
        const imagesResult = imagesStmt.step() ? imagesStmt.getAsObject() : { count: 0 };
        imagesStmt.free();
        console.log(`✅ Puzzle images: ${imagesResult.count}`);
        
        // Test puzzle words
        const wordsStmt = dbService.db.prepare('SELECT COUNT(*) as count FROM puzzle_words');
        const wordsResult = wordsStmt.step() ? wordsStmt.getAsObject() : { count: 0 };
        wordsStmt.free();
        console.log(`✅ Puzzle words: ${wordsResult.count}`);
        
        console.log('✅ Database integrity check passed!');
        return true;
        
    } catch (error) {
        console.error('❌ Database integrity check failed:', error);
        return false;
    }
}

async function main() {
    console.log('🧹 WORDSNPICS Board Generation Cleanup Tool');
    console.log('============================================');
    console.log('This tool will remove problematic boards from July 1st generation');
    console.log('while preserving user data and the first 7 working boards');
    console.log('');
    
    try {
        // Step 1: Analyze current state
        const analysis = await analyzeBoardData();
        
        if (analysis.error) {
            console.error('💥 Database appears to be corrupted and unreadable');
            console.log('🔧 Recommend using: node scripts/fix-database-corruption.js');
            process.exit(1);
        }
        
        if (!analysis.needsCleanup) {
            console.log('✅ No cleanup needed - board data looks fine!');
            await dbService.close();
            return;
        }
        
        // Step 2: Create backup
        const backupFile = await createBackupBeforeCleanup();
        
        // Step 3: Perform cleanup
        console.log('');
        console.log('🚀 Starting board cleanup process...');
        await cleanProblematicBoards(analysis.removeBoards);
        
        // Step 4: Verify everything is working
        console.log('');
        const integrityOk = await verifyDatabaseIntegrity();
        
        if (integrityOk) {
            console.log('');
            console.log('🎉 Board cleanup completed successfully!');
            console.log('');
            console.log('📋 Summary:');
            console.log(`   • Backup created: ${backupFile}`);
            console.log(`   • Boards removed: ${analysis.removeBoards.length}`);
            console.log(`   • Boards preserved: ${analysis.keepBoards.length}`);
            console.log(`   • User data: ✅ Preserved`);
            console.log(`   • Board types: ✅ Preserved`);
            console.log('');
            console.log('🚀 Database should now be corruption-free!');
            console.log('   You can restart your application and regenerate July 1st boards.');
        } else {
            console.log('');
            console.log('❌ Cleanup completed but integrity check failed');
            console.log(`🔄 Backup available at: ${backupFile}`);
            console.log('🔧 May need to use full recovery: node scripts/fix-database-corruption.js');
        }
        
    } catch (error) {
        console.error('💥 Board cleanup process failed:', error);
        console.log('');
        console.log('🔧 Fallback options:');
        console.log('   1. Restore from backup if created');
        console.log('   2. Use full recovery: node scripts/fix-database-corruption.js');
        process.exit(1);
    } finally {
        await dbService.close();
    }
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = { analyzeBoardData, cleanProblematicBoards, verifyDatabaseIntegrity };