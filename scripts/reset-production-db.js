#!/usr/bin/env node

/**
 * Production Database Reset Script
 * 
 * This script safely resets the production database by:
 * 1. Backing up the corrupted database
 * 2. Creating a fresh database with proper schema
 * 3. Ensuring all tables and sample data are properly initialized
 */

require('dotenv').config();
const path = require('path');
const fs = require('fs').promises;
const dbService = require('../database/wordsnpics-db');

async function resetProductionDatabase() {
    console.log('🔄 Starting production database reset...');
    
    try {
        // Determine database path based on environment
        let dbDir = path.dirname(dbService.dbPath);
        let dbFile = dbService.dbPath;
        
        console.log(`📍 Database path: ${dbFile}`);
        console.log(`📁 Database directory: ${dbDir}`);
        
        // Step 1: Create backup of corrupted database (if it exists)
        try {
            await fs.access(dbFile);
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const backupFile = path.join(dbDir, `wordsnpics-corrupted-${timestamp}.db`);
            
            console.log(`💾 Backing up corrupted database to: ${backupFile}`);
            await fs.copyFile(dbFile, backupFile);
            console.log('✅ Backup created successfully');
        } catch (error) {
            console.log('ℹ️  No existing database file found (this is fine for fresh setup)');
        }
        
        // Step 2: Remove corrupted database file
        try {
            await fs.unlink(dbFile);
            console.log('🗑️  Removed corrupted database file');
        } catch (error) {
            console.log('ℹ️  No database file to remove');
        }
        
        // Step 3: Ensure database directory exists
        try {
            await fs.mkdir(dbDir, { recursive: true });
            console.log(`📁 Ensured database directory exists: ${dbDir}`);
        } catch (error) {
            if (error.code !== 'EEXIST') {
                throw error;
            }
        }
        
        // Step 4: Initialize fresh database with schema
        console.log('🔨 Creating fresh database with schema...');
        await dbService.initialize(true); // Force schema creation
        
        // Step 5: Verify database is working
        console.log('🔍 Verifying database functionality...');
        
        // Test basic operations
        const boardTypes = await dbService.getBoardTypes();
        console.log(`✅ Database verification passed. Found ${boardTypes.length} board types.`);
        
        // Step 6: Close database connection cleanly
        await dbService.close();
        
        console.log('🎉 Production database reset completed successfully!');
        console.log('');
        console.log('📋 Summary:');
        console.log(`   • Database location: ${dbFile}`);
        console.log(`   • Schema: ✅ Applied`);
        console.log(`   • Board types: ✅ ${boardTypes.length} initialized`);
        console.log(`   • Status: 🟢 Ready for production`);
        console.log('');
        console.log('🚀 You can now restart your application.');
        
    } catch (error) {
        console.error('❌ Database reset failed:');
        console.error(error);
        
        console.log('');
        console.log('🔧 Troubleshooting suggestions:');
        console.log('1. Check that the /db directory has write permissions');
        console.log('2. Ensure sufficient disk space is available');
        console.log('3. Verify that no other processes are using the database file');
        console.log('4. Check Render logs for any permission-related errors');
        
        process.exit(1);
    }
}

// Run the reset if this script is executed directly
if (require.main === module) {
    resetProductionDatabase();
}

module.exports = { resetProductionDatabase };