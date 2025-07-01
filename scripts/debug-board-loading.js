#!/usr/bin/env node

/**
 * Debug Board Loading Script
 * 
 * This script tests the exact API calls the game makes to understand
 * why boards aren't loading
 */

require('dotenv').config();
const dbService = require('../database/wordsnpics-db');
const fetch = require('node-fetch');

async function debugBoardLoading() {
    console.log('🔍 Debugging board loading issue...\n');
    
    try {
        await dbService.initialize();
        
        // Test 1: Check board types in database
        console.log('📋 Board Types in Database:');
        const boardTypes = await dbService.getBoardTypes();
        boardTypes.forEach(bt => {
            console.log(`   • ID: "${bt.id}" | Name: "${bt.name}" | Active: ${bt.is_active}`);
        });
        
        // Test 2: Check what getAllBoards returns for each board type
        console.log('\n📊 Testing getAllBoards for each board type:');
        
        for (const boardType of boardTypes) {
            if (boardType.is_active) {
                console.log(`\n   Testing board type: "${boardType.id}"`);
                const boards = await dbService.getAllBoards(boardType.id, true);
                const dailyBoards = boards.filter(b => b.is_daily);
                console.log(`   Total boards: ${boards.length}`);
                console.log(`   Daily boards: ${dailyBoards.length}`);
                
                // Find today's board
                const today = new Date().toISOString().split('T')[0];
                const todaysBoard = boards.find(b => 
                    b.is_daily && 
                    b.scheduled_date === today && 
                    b.is_published
                );
                
                if (todaysBoard) {
                    console.log(`   ✅ Today's board found: ${todaysBoard.title}`);
                    
                    // Check if it has content
                    const fullBoard = await dbService.getBoardById(todaysBoard.id, true);
                    console.log(`   Images: ${fullBoard.images ? fullBoard.images.length : 0}`);
                    console.log(`   Words: ${fullBoard.words ? fullBoard.words.length : 0}`);
                } else {
                    console.log(`   ❌ No board found for today (${today})`);
                }
            }
        }
        
        // Test 3: Check default board type
        console.log('\n🎯 Testing default board type "wordsnpics-daily":');
        const defaultBoards = await dbService.getAllBoards('wordsnpics-daily', true);
        console.log(`   Boards found: ${defaultBoards.length}`);
        
        const today = new Date().toISOString().split('T')[0];
        const todaysDefault = defaultBoards.find(b => 
            b.is_daily && 
            b.scheduled_date === today && 
            b.is_published
        );
        
        if (todaysDefault) {
            console.log(`   ✅ Today's default board: ${todaysDefault.title}`);
        } else {
            console.log(`   ❌ No default board for today`);
            
            // Show what boards ARE available
            console.log('\n   Available wordsnpics-daily boards:');
            defaultBoards.forEach(board => {
                console.log(`      - ${board.title} | Date: ${board.scheduled_date} | Daily: ${board.is_daily} | Published: ${board.is_published}`);
            });
        }
        
        // Test 4: Direct SQL query to understand the issue
        console.log('\n🔍 Direct SQL query for today\'s boards:');
        const stmt = dbService.db.prepare(`
            SELECT b.*, bt.id as board_type_id_actual, bt.name as board_type_name
            FROM boards b
            LEFT JOIN board_types bt ON b.board_type_id = bt.id
            WHERE b.scheduled_date = ?
            AND b.is_daily = 1
            AND b.is_published = 1
        `);
        
        stmt.bind([today]);
        const todaysBoards = [];
        while (stmt.step()) {
            todaysBoards.push(stmt.getAsObject());
        }
        stmt.free();
        
        console.log(`   Found ${todaysBoards.length} boards for today`);
        todaysBoards.forEach(board => {
            console.log(`   • ${board.title}`);
            console.log(`     Board Type ID in boards table: "${board.board_type_id}"`);
            console.log(`     Board Type ID from join: "${board.board_type_id_actual}"`);
            console.log(`     Board Type Name: "${board.board_type_name}"`);
        });
        
        await dbService.close();
        
        console.log('\n💡 Diagnosis Summary:');
        console.log('   1. Check if board_type_id values match between tables');
        console.log('   2. Verify the default board type "wordsnpics-daily" exists');
        console.log('   3. Ensure boards have proper images and words content');
        
    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
}

async function main() {
    console.log('🐛 WORDSNPICS Board Loading Debugger');
    console.log('=====================================\n');
    
    await debugBoardLoading();
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = { debugBoardLoading };