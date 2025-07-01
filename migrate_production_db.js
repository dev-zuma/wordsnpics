/**
 * Production Database Migration Script
 * 
 * IMPORTANT: This script is designed for PRODUCTION environment
 * - Uses /db/ directory (persistent disk on Render.com)
 * - Does NOT modify existing data
 * - Only adds new game_progress table if it doesn't exist
 * 
 * Run this script AFTER deploying the new code to production:
 * NODE_ENV=production node migrate_production_db.js
 */

const fs = require('fs').promises;
const path = require('path');
const initSqlJs = require('sql.js');

async function migrateProductionDatabase() {
  try {
    console.log('🚀 Starting PRODUCTION database migration...\n');
    
    // Force production path
    const dbPath = '/db/wordsnpics.db';
    console.log('📁 Target database:', dbPath);
    
    // Verify we're in production environment
    if (process.env.NODE_ENV !== 'production') {
      console.warn('⚠️  WARNING: NODE_ENV is not set to "production"');
      console.log('Current NODE_ENV:', process.env.NODE_ENV || 'undefined');
      console.log('Continuing with production database path...\n');
    }
    
    // Check if database file exists
    try {
      const stats = await fs.stat(dbPath);
      console.log('✅ Database file found');
      console.log('📊 Size:', stats.size, 'bytes');
      console.log('🕒 Last modified:', stats.mtime.toISOString());
    } catch (error) {
      console.error('❌ Database file not found at:', dbPath);
      console.error('Make sure you are running this on the production server with /db/ mounted');
      process.exit(1);
    }
    
    // Initialize SQL.js and load database
    console.log('\n🔍 Loading database...');
    const SQL = await initSqlJs();
    const buffer = await fs.readFile(dbPath);
    const data = new Uint8Array(buffer);
    const db = new SQL.Database(data);
    
    // Check existing tables (don't log all, just verify database is working)
    const tablesResult = db.exec('SELECT COUNT(*) as count FROM sqlite_master WHERE type="table"');
    const tableCount = tablesResult[0] ? tablesResult[0].values[0][0] : 0;
    console.log(`✅ Database loaded successfully (${tableCount} existing tables)`);
    
    // Check if game_progress table already exists
    const progressTableCheck = db.exec(`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name='game_progress'
    `);
    
    if (progressTableCheck.length > 0 && progressTableCheck[0].values.length > 0) {
      console.log('\n✅ game_progress table already exists - no migration needed');
      
      // Show table info
      const infoResult = db.exec('SELECT COUNT(*) as count FROM game_progress');
      const recordCount = infoResult[0] ? infoResult[0].values[0][0] : 0;
      console.log(`📊 Current progress records: ${recordCount}`);
      
      db.close();
      console.log('\n🎉 Migration check complete - no changes made');
      process.exit(0);
    }
    
    console.log('\n🔨 Creating game_progress table...');
    
    // Enable foreign keys
    db.run('PRAGMA foreign_keys = ON');
    
    // Create the game_progress table
    db.run(`
      CREATE TABLE game_progress (
        id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
        user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
        profile_id TEXT REFERENCES profiles(id) ON DELETE CASCADE,
        session_id TEXT UNIQUE NOT NULL,
        board_id TEXT NOT NULL,
        current_turn INTEGER NOT NULL DEFAULT 1,
        correct_words TEXT,
        word_turns TEXT,
        turn_history TEXT,
        current_placements TEXT,
        start_time DATETIME NOT NULL,
        last_saved DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (board_id) REFERENCES boards (id) ON DELETE CASCADE
      )
    `);
    
    console.log('✅ Table created');
    
    // Create indexes for performance
    db.run('CREATE INDEX idx_game_progress_session_id ON game_progress (session_id)');
    db.run('CREATE INDEX idx_game_progress_user_id ON game_progress (user_id)');
    db.run('CREATE INDEX idx_game_progress_profile_id ON game_progress (profile_id)');
    db.run('CREATE INDEX idx_game_progress_board_id ON game_progress (board_id)');
    
    console.log('✅ Indexes created');
    
    // Verify table was created successfully
    const verifyResult = db.exec(`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name='game_progress'
    `);
    
    if (verifyResult.length === 0 || verifyResult[0].values.length === 0) {
      throw new Error('Table creation verification failed');
    }
    
    console.log('✅ Table verified');
    
    // Save the database back to production disk
    console.log('\n💾 Saving to production database...');
    const exportedData = db.export();
    await fs.writeFile(dbPath, Buffer.from(exportedData));
    
    console.log('✅ Database saved');
    
    // Final verification by loading the saved database
    console.log('\n🔍 Final verification...');
    const verifyBuffer = await fs.readFile(dbPath);
    const verifyData = new Uint8Array(verifyBuffer);
    const verifyDb = new SQL.Database(verifyData);
    
    const finalCheck = verifyDb.exec(`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name='game_progress'
    `);
    
    verifyDb.close();
    db.close();
    
    if (finalCheck.length > 0 && finalCheck[0].values.length > 0) {
      console.log('✅ Final verification passed');
      console.log('\n🎉 PRODUCTION MIGRATION SUCCESSFUL!');
      console.log('\n📋 Summary:');
      console.log('   ✅ game_progress table created');
      console.log('   ✅ Indexes added for performance');
      console.log('   ✅ Foreign key constraints enabled');
      console.log('   ✅ No existing data modified');
      console.log('\n🔄 You can now restart your production server');
      console.log('🎮 Game progress persistence is now available!');
    } else {
      throw new Error('Final verification failed');
    }
    
  } catch (error) {
    console.error('\n❌ MIGRATION FAILED:');
    console.error('Error:', error.message);
    console.error('\nStack trace:');
    console.error(error.stack);
    console.error('\n🚨 Do not restart the server until this is resolved');
    process.exit(1);
  }
}

// Safety check - prevent accidental execution on development
if (process.argv.length > 2 && process.argv[2] === '--force-dev') {
  console.log('🔧 Running in development mode (forced)');
} else if (!process.env.NODE_ENV || process.env.NODE_ENV !== 'production') {
  console.error('🚨 SAFETY CHECK: This script is for PRODUCTION only');
  console.error('Current NODE_ENV:', process.env.NODE_ENV || 'undefined');
  console.error('\nTo run in production, set: NODE_ENV=production');
  console.error('To run in development (not recommended): node migrate_production_db.js --force-dev');
  process.exit(1);
}

migrateProductionDatabase();