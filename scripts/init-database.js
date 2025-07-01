const dbService = require('../database/wordsnpics-db');

async function initializeDatabase() {
    try {
        console.log('🗄️  Initializing WORDSNPICS database...');
        
        // Initialize the database with schema and default data
        // Use forceSchema=true to ensure schema is applied during explicit initialization
        await dbService.initialize(true);
        
        console.log('✅ Database initialization complete');
        console.log('🚀 Server can now be started with: npm start');
        
    } catch (error) {
        console.error('❌ Database initialization failed:', error);
        process.exit(1);
    }
}

// Run initialization
initializeDatabase();