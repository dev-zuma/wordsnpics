#!/usr/bin/env node

/**
 * Check and Fix Daily Puzzles Script
 * 
 * This script checks for puzzles in the database and ensures they are
 * properly configured for daily play
 */

require('dotenv').config();
const dbService = require('../database/wordsnpics-db');

async function checkAndFixDailyPuzzles() {
    console.log('🔍 Checking daily puzzles configuration...\n');
    
    try {
        await dbService.initialize();
        
        // Get current date in UTC
        const now = new Date();
        const todayUTC = now.toISOString().split('T')[0];
        console.log(`📅 Today's date (UTC): ${todayUTC}`);
        console.log(`🕐 Current time (UTC): ${now.toISOString()}`);
        console.log(`🕐 12 PM UTC today: ${todayUTC}T12:00:00.000Z`);
        console.log('');
        
        // Check all boards in the database
        const allBoardsStmt = dbService.db.prepare(`
            SELECT b.*, bt.name as board_type_name
            FROM boards b
            LEFT JOIN board_types bt ON b.board_type_id = bt.id
            ORDER BY b.created_at DESC
        `);
        
        const boards = [];
        while (allBoardsStmt.step()) {
            boards.push(allBoardsStmt.getAsObject());
        }
        allBoardsStmt.free();
        
        console.log(`📊 Total boards found: ${boards.length}\n`);
        
        if (boards.length === 0) {
            console.log('❌ No boards found in database!');
            return;
        }
        
        // Display all boards
        console.log('📋 Board Details:');
        boards.forEach((board, index) => {
            console.log(`\n${index + 1}. ${board.title || board.board_type_name || 'Untitled'}`);
            console.log(`   ID: ${board.id}`);
            console.log(`   Board Type: ${board.board_type_id} (${board.board_type_name})`);
            console.log(`   Date: ${board.date}`);
            console.log(`   Scheduled Date: ${board.scheduled_date || 'Not set'}`);
            console.log(`   Is Daily: ${board.is_daily ? '✅ Yes' : '❌ No'}`);
            console.log(`   Is Published: ${board.is_published ? '✅ Yes' : '❌ No'}`);
            console.log(`   Created: ${board.created_at}`);
        });
        
        // Check for today's daily puzzles
        console.log('\n\n🎯 Checking for today\'s daily puzzles...');
        
        const dailyPuzzlesStmt = dbService.db.prepare(`
            SELECT b.*, bt.name as board_type_name
            FROM boards b
            LEFT JOIN board_types bt ON b.board_type_id = bt.id
            WHERE b.is_daily = 1 
            AND b.scheduled_date = ?
            AND b.is_published = 1
        `);
        
        dailyPuzzlesStmt.bind([todayUTC]);
        const todaysPuzzles = [];
        while (dailyPuzzlesStmt.step()) {
            todaysPuzzles.push(dailyPuzzlesStmt.getAsObject());
        }
        dailyPuzzlesStmt.free();
        
        console.log(`\n📊 Daily puzzles for ${todayUTC}: ${todaysPuzzles.length}`);
        
        if (todaysPuzzles.length === 0) {
            console.log('❌ No daily puzzles found for today!');
            
            // Look for boards that might be intended for today
            console.log('\n🔧 Looking for boards that could be fixed...');
            
            const candidateBoards = boards.filter(board => {
                // Check if board date or scheduled date is today, or if created today
                const boardDate = board.date === todayUTC;
                const scheduledDate = board.scheduled_date === todayUTC;
                const createdToday = board.created_at && board.created_at.includes(todayUTC);
                
                return boardDate || scheduledDate || createdToday;
            });
            
            if (candidateBoards.length > 0) {
                console.log(`\n✅ Found ${candidateBoards.length} boards that could be set as today's daily puzzles:`);
                
                candidateBoards.forEach((board, index) => {
                    console.log(`\n${index + 1}. ${board.title || board.board_type_name}`);
                    console.log(`   Current settings: is_daily=${board.is_daily}, is_published=${board.is_published}`);
                    console.log(`   scheduled_date=${board.scheduled_date || 'not set'}`);
                });
                
                console.log('\n🔧 Fixing these boards to be today\'s daily puzzles...');
                
                candidateBoards.forEach(board => {
                    const updateStmt = dbService.db.prepare(`
                        UPDATE boards 
                        SET is_daily = 1, 
                            is_published = 1, 
                            scheduled_date = ?,
                            updated_at = CURRENT_TIMESTAMP
                        WHERE id = ?
                    `);
                    
                    updateStmt.run([todayUTC, board.id]);
                    updateStmt.free();
                    
                    console.log(`✅ Fixed: ${board.title || board.board_type_name} (ID: ${board.id})`);
                });
                
                await dbService.saveDatabase();
                console.log('\n✅ Database updated successfully!');
                
                // Verify the fix
                const verifyStmt = dbService.db.prepare(`
                    SELECT COUNT(*) as count 
                    FROM boards 
                    WHERE is_daily = 1 
                    AND scheduled_date = ? 
                    AND is_published = 1
                `);
                
                verifyStmt.bind([todayUTC]);
                const result = verifyStmt.step() ? verifyStmt.getAsObject() : { count: 0 };
                verifyStmt.free();
                
                console.log(`\n📊 Daily puzzles now available for today: ${result.count}`);
            } else {
                console.log('\n❌ No boards found that could be set for today.');
                console.log('💡 You may need to generate new puzzles for today.');
            }
        } else {
            console.log('\n✅ Today\'s daily puzzles are properly configured:');
            todaysPuzzles.forEach(puzzle => {
                console.log(`   • ${puzzle.title || puzzle.board_type_name} (${puzzle.board_type_id})`);
            });
        }
        
        // Check release time
        const releaseTime = new Date(`${todayUTC}T12:00:00.000Z`);
        const isPastReleaseTime = now >= releaseTime;
        
        console.log('\n⏰ Release Time Check:');
        console.log(`   Release time: ${releaseTime.toISOString()}`);
        console.log(`   Current time: ${now.toISOString()}`);
        console.log(`   Past release: ${isPastReleaseTime ? '✅ Yes' : '❌ No'}`);
        
        if (!isPastReleaseTime) {
            const timeUntilRelease = releaseTime - now;
            const hours = Math.floor(timeUntilRelease / (1000 * 60 * 60));
            const minutes = Math.floor((timeUntilRelease % (1000 * 60 * 60)) / (1000 * 60));
            console.log(`   Time until release: ${hours}h ${minutes}m`);
        }
        
        await dbService.close();
        
    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
}

async function main() {
    console.log('🎮 WORDSNPICS Daily Puzzle Checker & Fixer');
    console.log('==========================================\n');
    
    await checkAndFixDailyPuzzles();
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = { checkAndFixDailyPuzzles };