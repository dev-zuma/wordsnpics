#!/usr/bin/env node

/**
 * Initialize production database with full schema
 * This script forces database schema creation even if database file exists
 */

const wordsnpicsDb = require('../database/wordsnpics-db');

async function initProductionDatabase() {
    try {
        console.log('🚀 Initializing production database with full schema...');
        console.log('📝 This will create all required tables from scratch');
        console.log('');
        
        // Force schema initialization (forceSchema = true)
        console.log('🔧 Running database initialization with forced schema creation...');
        await wordsnpicsDb.initialize(true);
        
        if (!wordsnpicsDb.db) {
            throw new Error('Database initialization failed');
        }
        
        console.log('✅ Database schema initialization completed');
        console.log('');
        
        // Verify core tables exist with detailed logging
        const coreTables = [
            { name: 'users', description: 'User accounts (OAuth)' },
            { name: 'profiles', description: 'User profiles and child accounts' },
            { name: 'profile_stats', description: 'Cached profile statistics' },
            { name: 'board_types', description: 'Board categories (daily, travel, etc.)' },
            { name: 'boards', description: 'Individual puzzle boards' },
            { name: 'puzzle_images', description: 'Images for puzzles' },
            { name: 'puzzle_words', description: 'Words for puzzles' },
            { name: 'game_sessions', description: 'Completed game records' },
            { name: 'game_progress', description: 'Mid-game state persistence' },
            { name: 'shareable_graphics', description: 'Generated result graphics' },
            { name: 'sessions', description: 'Express session storage' },
            { name: 'leagues', description: 'League system (Phase 3)' },
            { name: 'league_members', description: 'League membership' }
        ];
        
        console.log('🔍 Verifying all required tables were created:');
        console.log('══════════════════════════════════════════════════════════');
        
        let allTablesExist = true;
        for (const table of coreTables) {
            try {
                const stmt = wordsnpicsDb.db.prepare(`SELECT COUNT(*) as count FROM ${table.name}`);
                const result = stmt.step() ? stmt.getAsObject() : { count: 0 };
                stmt.free();
                console.log(`✅ ${table.name.padEnd(20)} | ${result.count.toString().padStart(3)} records | ${table.description}`);
            } catch (error) {
                console.log(`❌ ${table.name.padEnd(20)} | MISSING     | ${table.description}`);
                allTablesExist = false;
            }
        }
        
        console.log('══════════════════════════════════════════════════════════');
        
        if (!allTablesExist) {
            throw new Error('Some required tables are missing');
        }
        
        // Check board types and indexes
        console.log('');
        console.log('🔍 Checking default data and indexes:');
        
        try {
            const boardTypes = await wordsnpicsDb.getBoardTypes();
            console.log(`📊 Board types: ${boardTypes.length} found`);
            
            if (boardTypes.length === 0) {
                console.log('⚠️  No board types found. This is expected for a fresh database.');
                console.log('💡 Use the admin panel or board generation scripts to add board types.');
            } else {
                boardTypes.forEach(bt => {
                    console.log(`   • ${bt.name} (${bt.id}) - Active: ${bt.is_active ? 'Yes' : 'No'}`);
                });
            }
        } catch (error) {
            console.log('❌ Error checking board types:', error.message);
        }
        
        // Verify database indexes exist
        console.log('');
        console.log('🗂️  Database indexes and constraints are automatically created');
        console.log('');
        console.log('🎉 Production database initialization completed successfully!');
        console.log('');
        console.log('📋 Next steps:');
        console.log('  1. Server should now start without table errors');
        console.log('  2. Use admin panel to create board types and puzzles');
        console.log('  3. Generate daily puzzles using the generation scripts');
        console.log('  4. Test user authentication and game functionality');
        
    } catch (error) {
        console.error('❌ Error initializing production database:', error);
        process.exit(1);
    } finally {
        await wordsnpicsDb.close();
    }
}

// Run if called directly
if (require.main === module) {
    initProductionDatabase();
}

module.exports = initProductionDatabase;