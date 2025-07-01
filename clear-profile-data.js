#!/usr/bin/env node

/**
 * Development helper script to clear profile data
 * Usage: node clear-profile-data.js [userId]
 * If no userId provided, clears all profile data
 */

const { dbService } = require('./config/auth');

async function clearProfileData() {
    try {
        const userId = process.argv[2] || null;
        
        console.log('Initializing database...');
        await dbService.initialize();
        
        console.log('Clearing profile data...');
        await dbService.clearUserProfileData(userId);
        
        if (userId) {
            console.log(`✅ Successfully cleared profile data for user: ${userId}`);
        } else {
            console.log('✅ Successfully cleared all profile data');
        }
        
        await dbService.close();
        process.exit(0);
        
    } catch (error) {
        console.error('❌ Error clearing profile data:', error);
        process.exit(1);
    }
}

clearProfileData();