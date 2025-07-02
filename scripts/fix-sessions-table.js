#!/usr/bin/env node

/**
 * Fix missing sessions table in production database
 * This script adds the sessions table if it's missing
 */

const wordsnpicsDb = require('../database/wordsnpics-db');

async function fixSessionsTable() {
    try {
        console.log('🔧 Fixing sessions table...');
        
        // Initialize database connection
        await wordsnpicsDb.initialize();
        
        if (!wordsnpicsDb.db) {
            throw new Error('Database not initialized');
        }
        
        // Check if sessions table exists
        try {
            const stmt = wordsnpicsDb.db.prepare('SELECT COUNT(*) FROM sessions');
            stmt.step();
            stmt.free();
            console.log('✅ Sessions table already exists');
            return;
        } catch (error) {
            if (error.message.includes('no such table: sessions')) {
                console.log('❌ Sessions table missing, creating...');
                
                // Create sessions table
                wordsnpicsDb.db.run(`
                    CREATE TABLE IF NOT EXISTS sessions (
                        sid TEXT PRIMARY KEY,
                        sess TEXT NOT NULL,
                        expired DATETIME NOT NULL
                    )
                `);
                
                // Create index
                wordsnpicsDb.db.run(`
                    CREATE INDEX IF NOT EXISTS idx_sessions_expired ON sessions (expired)
                `);
                
                // Save database
                await wordsnpicsDb.saveDatabase();
                
                console.log('✅ Sessions table created successfully');
            } else {
                throw error;
            }
        }
        
    } catch (error) {
        console.error('❌ Error fixing sessions table:', error);
        process.exit(1);
    } finally {
        await wordsnpicsDb.close();
    }
}

// Run if called directly
if (require.main === module) {
    fixSessionsTable();
}

module.exports = fixSessionsTable;