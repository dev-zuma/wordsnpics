#!/usr/bin/env node

/**
 * Clean Recent Games Script
 * 
 * This script removes recent game sessions that may have caused database corruption
 * while preserving:
 * - User accounts and profiles
 * - Board types and configurations
 * - The first 7 games (known good data)
 * - Shareable graphics for kept games
 */

require('dotenv').config();
const path = require('path');
const fs = require('fs').promises;
const dbService = require('../database/wordsnpics-db');

async function analyzeGameSessions() {
    console.log('🔍 Analyzing game sessions...');
    
    try {
        await dbService.initialize();
        
        // Get all game sessions ordered by creation date
        const stmt = dbService.db.prepare(`
            SELECT id, session_id, user_id, profile_id, board_id, completed_at, correct_words, total_words
            FROM game_sessions 
            ORDER BY completed_at ASC
        `);
        
        const games = [];
        while (stmt.step()) {
            games.push(stmt.getAsObject());
        }
        stmt.free();
        
        console.log(`📊 Total game sessions found: ${games.length}`);
        
        if (games.length <= 7) {
            console.log('✅ 7 or fewer games found - no cleanup needed');
            return { needsCleanup: false, games };
        }
        
        console.log('📋 Game sessions breakdown:');
        console.log(`   First 7 games (to keep): ${games.slice(0, 7).length}`);
        console.log(`   Recent games (to remove): ${games.slice(7).length}`);
        
        // Show details of games to keep
        console.log('\n🟢 Games to KEEP:');
        games.slice(0, 7).forEach((game, index) => {
            console.log(`   ${index + 1}. Session: ${game.session_id} | Score: ${game.correct_words}/${game.total_words} | Date: ${game.completed_at}`);
        });
        
        // Show details of games to remove
        console.log('\n🔴 Games to REMOVE:');
        games.slice(7).forEach((game, index) => {
            console.log(`   ${index + 8}. Session: ${game.session_id} | Score: ${game.correct_words}/${game.total_words} | Date: ${game.completed_at}`);
        });
        
        return { needsCleanup: true, games, keepGames: games.slice(0, 7), removeGames: games.slice(7) };
        
    } catch (error) {
        console.error('❌ Failed to analyze game sessions:', error);
        return { needsCleanup: false, error };
    }
}

async function createBackupBeforeCleanup() {
    console.log('💾 Creating backup before cleanup...');
    
    const dbFile = dbService.dbPath;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFile = path.join(path.dirname(dbFile), `backup-before-cleanup-${timestamp}.db`);
    
    try {
        await fs.copyFile(dbFile, backupFile);
        console.log(`✅ Backup created: ${backupFile}`);
        return backupFile;
    } catch (error) {
        console.error('❌ Backup failed:', error);
        throw error;
    }
}

async function cleanRecentGameSessions(gamesToRemove) {
    console.log(`🧹 Removing ${gamesToRemove.length} recent game sessions...`);
    
    try {
        // Get IDs of games to remove
        const gameIdsToRemove = gamesToRemove.map(game => game.id);
        const sessionIdsToRemove = gamesToRemove.map(game => game.session_id);
        
        console.log('🗑️  Removing associated shareable graphics...');
        
        // Remove shareable graphics for these games
        const deleteGraphicsStmt = dbService.db.prepare(`
            DELETE FROM shareable_graphics 
            WHERE game_session_id IN (${gameIdsToRemove.map(() => '?').join(',')})
        `);
        deleteGraphicsStmt.run(gameIdsToRemove);
        deleteGraphicsStmt.free();
        
        console.log('🗑️  Removing game sessions...');
        
        // Remove the game sessions themselves
        const deleteSessionsStmt = dbService.db.prepare(`
            DELETE FROM game_sessions 
            WHERE id IN (${gameIdsToRemove.map(() => '?').join(',')})
        `);
        deleteSessionsStmt.run(gameIdsToRemove);
        deleteSessionsStmt.free();
        
        // Save database changes
        await dbService.saveDatabase();
        
        console.log(`✅ Successfully removed ${gamesToRemove.length} recent game sessions`);
        
        // Verify cleanup
        const remainingStmt = dbService.db.prepare('SELECT COUNT(*) as count FROM game_sessions');
        const result = remainingStmt.step() ? remainingStmt.getAsObject() : { count: 0 };
        remainingStmt.free();
        
        console.log(`📊 Remaining game sessions: ${result.count}`);
        
        return true;
        
    } catch (error) {
        console.error('❌ Cleanup failed:', error);
        throw error;
    }
}

async function verifyDatabaseIntegrity() {
    console.log('🔍 Verifying database integrity after cleanup...');
    
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
        
        // Test remaining games
        const gamesStmt = dbService.db.prepare('SELECT COUNT(*) as count FROM game_sessions');
        const gamesResult = gamesStmt.step() ? gamesStmt.getAsObject() : { count: 0 };
        gamesStmt.free();
        console.log(`✅ Game sessions remaining: ${gamesResult.count}`);
        
        // Test boards
        const boardsStmt = dbService.db.prepare('SELECT COUNT(*) as count FROM boards');
        const boardsResult = boardsStmt.step() ? boardsStmt.getAsObject() : { count: 0 };
        boardsStmt.free();
        console.log(`✅ Boards preserved: ${boardsResult.count}`);
        
        console.log('✅ Database integrity check passed!');
        return true;
        
    } catch (error) {
        console.error('❌ Database integrity check failed:', error);
        return false;
    }
}

async function main() {
    console.log('🧹 WORDSNPICS Game Sessions Cleanup Tool');
    console.log('=========================================');
    console.log('This tool will remove recent game sessions while preserving user data');
    console.log('');
    
    try {
        // Step 1: Analyze current state
        const analysis = await analyzeGameSessions();
        
        if (analysis.error) {
            console.error('💥 Database appears to be corrupted and unreadable');
            console.log('🔧 Recommend using: node scripts/fix-database-corruption.js');
            process.exit(1);
        }
        
        if (!analysis.needsCleanup) {
            console.log('✅ No cleanup needed - database is fine!');
            await dbService.close();
            return;
        }
        
        // Step 2: Create backup
        const backupFile = await createBackupBeforeCleanup();
        
        // Step 3: Perform cleanup
        console.log('');
        console.log('🚀 Starting cleanup process...');
        await cleanRecentGameSessions(analysis.removeGames);
        
        // Step 4: Verify everything is working
        console.log('');
        const integrityOk = await verifyDatabaseIntegrity();
        
        if (integrityOk) {
            console.log('');
            console.log('🎉 Cleanup completed successfully!');
            console.log('');
            console.log('📋 Summary:');
            console.log(`   • Backup created: ${backupFile}`);
            console.log(`   • Games removed: ${analysis.removeGames.length}`);
            console.log(`   • Games preserved: ${analysis.keepGames.length}`);
            console.log(`   • User data: ✅ Preserved`);
            console.log(`   • Board data: ✅ Preserved`);
            console.log('');
            console.log('🚀 Database should now be corruption-free!');
            console.log('   You can restart your application.');
        } else {
            console.log('');
            console.log('❌ Cleanup completed but integrity check failed');
            console.log(`🔄 Backup available at: ${backupFile}`);
            console.log('🔧 May need to use full recovery: node scripts/fix-database-corruption.js');
        }
        
    } catch (error) {
        console.error('💥 Cleanup process failed:', error);
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

module.exports = { analyzeGameSessions, cleanRecentGameSessions, verifyDatabaseIntegrity };