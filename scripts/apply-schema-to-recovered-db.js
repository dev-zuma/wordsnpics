#!/usr/bin/env node

/**
 * Apply Schema to Recovered Database
 * 
 * This script applies the WORDSNPICS schema to a recovered database
 * that has lost its table structure.
 */

require('dotenv').config();
const path = require('path');
const fs = require('fs').promises;
const dbService = require('../database/wordsnpics-db');

async function applySchemaToRecoveredDatabase() {
    console.log('🔧 Applying schema to recovered database...');
    
    try {
        // Force schema initialization
        console.log('📋 Initializing database with schema...');
        await dbService.initialize(true); // Force schema creation
        
        console.log('✅ Schema applied successfully!');
        
        // Verify tables exist
        console.log('\n🔍 Verifying database tables...');
        
        try {
            // Check each critical table
            const tables = [
                'board_types',
                'boards', 
                'puzzle_images',
                'puzzle_words',
                'users',
                'profiles',
                'game_sessions',
                'shareable_graphics'
            ];
            
            for (const table of tables) {
                const stmt = dbService.db.prepare(`SELECT COUNT(*) as count FROM ${table}`);
                const result = stmt.step() ? stmt.getAsObject() : { count: 0 };
                stmt.free();
                console.log(`✅ Table '${table}' exists with ${result.count} records`);
            }
            
            // Initialize board types if empty
            const boardTypesStmt = dbService.db.prepare('SELECT COUNT(*) as count FROM board_types');
            const boardTypesResult = boardTypesStmt.step() ? boardTypesStmt.getAsObject() : { count: 0 };
            boardTypesStmt.free();
            
            if (boardTypesResult.count === 0) {
                console.log('\n📝 Initializing board types...');
                const { ensureBoards } = require('../database/ensure-boards');
                await ensureBoards(dbService);
                console.log('✅ Board types initialized');
            }
            
            await dbService.close();
            
            console.log('\n🎉 Database recovery complete!');
            console.log('✅ Schema applied');
            console.log('✅ Tables created');
            console.log('✅ Board types initialized');
            console.log('\n🚀 You can now restart your application');
            
        } catch (verifyError) {
            console.error('❌ Error verifying tables:', verifyError);
            throw verifyError;
        }
        
    } catch (error) {
        console.error('❌ Failed to apply schema:', error);
        console.log('\n💡 If this fails, you may need to start with a fresh database:');
        console.log('   node scripts/reset-production-db.js');
        process.exit(1);
    }
}

async function main() {
    console.log('🏥 WORDSNPICS Database Schema Recovery');
    console.log('=====================================');
    console.log('This will apply the schema to a recovered database');
    console.log('');
    
    await applySchemaToRecoveredDatabase();
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = { applySchemaToRecoveredDatabase };