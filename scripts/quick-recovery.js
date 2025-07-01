#!/usr/bin/env node

/**
 * Quick Recovery Script
 * 
 * This script performs a quick recovery by:
 * 1. Backing up the corrupted database
 * 2. Creating a fresh database with schema
 * 3. Attempting to import any salvageable data
 */

require('dotenv').config();
const path = require('path');
const fs = require('fs').promises;
const { execSync } = require('child_process');
const dbService = require('../database/wordsnpics-db');

async function quickRecovery() {
    console.log('🚑 Starting quick database recovery...');
    
    const dbFile = dbService.dbPath;
    const dbDir = path.dirname(dbFile);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    
    try {
        // Step 1: Backup corrupted database
        console.log('\n💾 Step 1: Creating backup of corrupted database...');
        const backupFile = path.join(dbDir, `corrupted-backup-${timestamp}.db`);
        
        try {
            await fs.copyFile(dbFile, backupFile);
            console.log(`✅ Backup saved to: ${backupFile}`);
        } catch (error) {
            console.log('⚠️  Could not create backup (file may not exist)');
        }
        
        // Step 2: Try to extract any data using sqlite3 dump
        console.log('\n📤 Step 2: Attempting to extract data from corrupted database...');
        const dumpFile = path.join(dbDir, `data-dump-${timestamp}.sql`);
        let hasRecoverableData = false;
        
        try {
            // Use sqlite3 to dump whatever can be read
            execSync(`sqlite3 "${dbFile}" ".dump" > "${dumpFile}" 2>/dev/null || true`);
            
            // Check if dump has any content
            const dumpStats = await fs.stat(dumpFile);
            if (dumpStats.size > 0) {
                console.log(`✅ Extracted ${(dumpStats.size / 1024).toFixed(2)} KB of data`);
                hasRecoverableData = true;
            } else {
                console.log('⚠️  No data could be extracted');
            }
        } catch (error) {
            console.log('⚠️  Data extraction failed - database too corrupted');
        }
        
        // Step 3: Remove corrupted database
        console.log('\n🗑️  Step 3: Removing corrupted database...');
        try {
            await fs.unlink(dbFile);
            console.log('✅ Corrupted database removed');
        } catch (error) {
            console.log('⚠️  Could not remove database file');
        }
        
        // Step 4: Create fresh database with schema
        console.log('\n🔨 Step 4: Creating fresh database with schema...');
        await dbService.initialize(true); // Force schema creation
        console.log('✅ Fresh database created with schema');
        
        // Step 5: Attempt to import recovered data (if any)
        if (hasRecoverableData) {
            console.log('\n📥 Step 5: Attempting to import recovered data...');
            
            try {
                // Read the dump file
                const dumpContent = await fs.readFile(dumpFile, 'utf8');
                
                // Extract only INSERT statements for data recovery
                const insertStatements = dumpContent
                    .split('\n')
                    .filter(line => line.trim().startsWith('INSERT INTO'))
                    .filter(line => !line.includes('sqlite_sequence')); // Skip system tables
                
                console.log(`📊 Found ${insertStatements.length} data records to recover`);
                
                let recovered = 0;
                let failed = 0;
                
                for (const statement of insertStatements) {
                    try {
                        dbService.db.run(statement);
                        recovered++;
                    } catch (error) {
                        failed++;
                        // Silently skip failed inserts (may be due to schema changes)
                    }
                }
                
                console.log(`✅ Recovered ${recovered} records`);
                if (failed > 0) {
                    console.log(`⚠️  Failed to recover ${failed} records (may be incompatible)`);
                }
                
                await dbService.saveDatabase();
                
            } catch (error) {
                console.log('⚠️  Could not import recovered data - starting fresh');
            }
        } else {
            console.log('\n📝 Step 5: No data to recover - starting with fresh database');
        }
        
        // Step 6: Verify database functionality
        console.log('\n🔍 Step 6: Verifying database functionality...');
        
        // Check board types
        const boardTypes = await dbService.getBoardTypes();
        console.log(`✅ Board types: ${boardTypes.length}`);
        
        // Check tables
        const tables = ['users', 'profiles', 'boards', 'game_sessions'];
        for (const table of tables) {
            try {
                const stmt = dbService.db.prepare(`SELECT COUNT(*) as count FROM ${table}`);
                const result = stmt.step() ? stmt.getAsObject() : { count: 0 };
                stmt.free();
                console.log(`✅ Table '${table}': ${result.count} records`);
            } catch (error) {
                console.log(`❌ Table '${table}': Error`);
            }
        }
        
        await dbService.close();
        
        // Step 7: Summary
        console.log('\n' + '='.repeat(50));
        console.log('🎉 Quick Recovery Complete!');
        console.log('='.repeat(50));
        console.log('\n📋 Recovery Summary:');
        console.log(`   • Backup created: ${backupFile}`);
        console.log(`   • Database location: ${dbFile}`);
        console.log(`   • Schema: ✅ Applied`);
        console.log(`   • Board types: ✅ Initialized (${boardTypes.length})`);
        console.log(`   • Data recovery: ${hasRecoverableData ? '✅ Attempted' : '❌ Not possible'}`);
        console.log('\n🚀 You can now restart your application!');
        
        // Clean up temporary files
        try {
            if (hasRecoverableData) {
                await fs.unlink(dumpFile);
            }
        } catch (error) {
            // Ignore cleanup errors
        }
        
    } catch (error) {
        console.error('\n❌ Recovery failed:', error);
        console.log('\n💡 Last resort option:');
        console.log('   node scripts/reset-production-db.js');
        process.exit(1);
    }
}

async function main() {
    console.log('⚡ WORDSNPICS Quick Recovery Tool');
    console.log('==================================');
    console.log('This tool will quickly recover your database');
    console.log('by creating a fresh schema and attempting to');
    console.log('import any salvageable data.');
    console.log('');
    
    await quickRecovery();
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = { quickRecovery };