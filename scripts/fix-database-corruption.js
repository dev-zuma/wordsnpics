#!/usr/bin/env node

/**
 * Database Corruption Recovery Script
 * 
 * This script provides multiple recovery options for database corruption:
 * 1. Backup and assess the damage
 * 2. Attempt data recovery via SQL dump
 * 3. Create fresh database only if data recovery fails
 */

require('dotenv').config();
const path = require('path');
const fs = require('fs').promises;
const { execSync } = require('child_process');
const dbService = require('../database/wordsnpics-db');

async function assessDatabaseCorruption() {
    console.log('🔍 Assessing database corruption...');
    
    try {
        const dbFile = dbService.dbPath;
        console.log(`📍 Database file: ${dbFile}`);
        
        // Check if database file exists
        try {
            const stats = await fs.stat(dbFile);
            console.log(`📊 Database file size: ${(stats.size / 1024).toFixed(2)} KB`);
        } catch (error) {
            console.log('❌ Database file does not exist');
            return 'missing';
        }
        
        // Try to connect and read basic info
        try {
            await dbService.initialize();
            const boardTypes = await dbService.getBoardTypes();
            console.log(`✅ Database readable - found ${boardTypes.length} board types`);
            await dbService.close();
            return 'healthy';
        } catch (error) {
            console.log(`💥 Database corruption confirmed: ${error.message}`);
            return 'corrupted';
        }
        
    } catch (error) {
        console.error('❌ Assessment failed:', error);
        return 'unknown';
    }
}

async function createDatabaseBackup() {
    const dbFile = dbService.dbPath;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFile = path.join(path.dirname(dbFile), `backup-${timestamp}.db`);
    
    try {
        await fs.copyFile(dbFile, backupFile);
        console.log(`💾 Backup created: ${backupFile}`);
        return backupFile;
    } catch (error) {
        console.error('❌ Backup failed:', error);
        return null;
    }
}

async function recoverDataViaSqlDump() {
    console.log('🔧 Attempting data recovery via SQL dump...');
    
    const dbFile = dbService.dbPath;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const dumpFile = path.join(path.dirname(dbFile), `recovery-${timestamp}.sql`);
    
    try {
        // Try to use sqlite3 command line tool to dump readable data
        const dumpCommand = `sqlite3 "${dbFile}" ".dump" > "${dumpFile}"`;
        execSync(dumpCommand, { stdio: 'inherit' });
        
        console.log(`✅ SQL dump created: ${dumpFile}`);
        
        // Try to restore from dump to new database
        const recoveredDbFile = path.join(path.dirname(dbFile), `recovered-${timestamp}.db`);
        const restoreCommand = `sqlite3 "${recoveredDbFile}" < "${dumpFile}"`;
        execSync(restoreCommand, { stdio: 'inherit' });
        
        console.log(`✅ Data recovered to: ${recoveredDbFile}`);
        
        // Test the recovered database
        const tempDbPath = dbService.dbPath;
        dbService.dbPath = recoveredDbFile;
        
        try {
            await dbService.initialize();
            const boardTypes = await dbService.getBoardTypes();
            console.log(`✅ Recovered database verified - ${boardTypes.length} board types found`);
            await dbService.close();
            
            // Restore original path
            dbService.dbPath = tempDbPath;
            
            return recoveredDbFile;
        } catch (error) {
            console.log(`❌ Recovered database still corrupted: ${error.message}`);
            dbService.dbPath = tempDbPath;
            return null;
        }
        
    } catch (error) {
        console.error('❌ Data recovery failed:', error);
        return null;
    }
}

async function createFreshDatabase() {
    console.log('🆕 Creating fresh database...');
    
    const dbFile = dbService.dbPath;
    
    try {
        // Remove corrupted file
        await fs.unlink(dbFile);
        console.log('🗑️  Removed corrupted database');
    } catch (error) {
        console.log('ℹ️  No database file to remove');
    }
    
    try {
        // Create fresh database with schema
        await dbService.initialize(true);
        console.log('✅ Fresh database created successfully');
        
        // Verify it works
        const boardTypes = await dbService.getBoardTypes();
        console.log(`✅ Verification passed - ${boardTypes.length} board types initialized`);
        
        await dbService.close();
        return true;
    } catch (error) {
        console.error('❌ Fresh database creation failed:', error);
        return false;
    }
}

async function replaceWithRecoveredDatabase(recoveredDbFile) {
    const originalDbFile = dbService.dbPath;
    const backupFile = originalDbFile + '.corrupted-backup';
    
    try {
        // Backup corrupted file
        await fs.copyFile(originalDbFile, backupFile);
        console.log(`💾 Corrupted file backed up to: ${backupFile}`);
        
        // Replace with recovered database
        await fs.copyFile(recoveredDbFile, originalDbFile);
        console.log('✅ Database replaced with recovered version');
        
        // Clean up temporary recovered file
        await fs.unlink(recoveredDbFile);
        console.log('🧹 Cleaned up temporary files');
        
        return true;
    } catch (error) {
        console.error('❌ Database replacement failed:', error);
        return false;
    }
}

async function main() {
    console.log('🚑 WORDSNPICS Database Recovery Tool');
    console.log('=====================================');
    
    // Step 1: Assess the situation
    const status = await assessDatabaseCorruption();
    
    if (status === 'healthy') {
        console.log('✅ Database is healthy - no recovery needed!');
        return;
    }
    
    if (status === 'missing') {
        console.log('📝 Database missing - creating fresh database...');
        const success = await createFreshDatabase();
        if (success) {
            console.log('🎉 Fresh database created successfully!');
        } else {
            console.log('❌ Failed to create fresh database');
            process.exit(1);
        }
        return;
    }
    
    if (status === 'corrupted') {
        console.log('💥 Database corruption detected - attempting recovery...');
        
        // Step 2: Create backup
        await createDatabaseBackup();
        
        // Step 3: Attempt data recovery
        const recoveredDbFile = await recoverDataViaSqlDump();
        
        if (recoveredDbFile) {
            console.log('🎉 Data recovery successful!');
            console.log('');
            console.log('🔄 Do you want to replace the corrupted database with the recovered one?');
            console.log('   This will preserve your existing data.');
            console.log('');
            console.log('   To proceed: node scripts/apply-recovery.js');
            console.log(`   Recovered database: ${recoveredDbFile}`);
        } else {
            console.log('😔 Data recovery failed - will create fresh database');
            console.log('⚠️  This will result in data loss');
            console.log('');
            console.log('🔄 To proceed with fresh database: node scripts/create-fresh-db.js');
        }
    }
    
    console.log('');
    console.log('📋 Summary and Next Steps:');
    console.log(`   Database status: ${status}`);
    if (status === 'corrupted') {
        console.log('   1. Backup created ✅');
        console.log('   2. Recovery attempted');
        console.log('   3. Manual intervention required');
    }
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = { assessDatabaseCorruption, createDatabaseBackup, recoverDataViaSqlDump, createFreshDatabase };