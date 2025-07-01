const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'database', 'wordsnpics.db');
const schemaPath = path.join(__dirname, '..', 'database', 'wordsnpics-schema.sql');

// Remove existing database if it exists
if (fs.existsSync(dbPath)) {
    fs.unlinkSync(dbPath);
    console.log('Removed existing database');
}

// Read schema file
const schema = fs.readFileSync(schemaPath, 'utf8');

// Create new database
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error creating database:', err);
        return;
    }
    console.log('Database created successfully');
});

// Execute schema
db.exec(schema, (err) => {
    if (err) {
        console.error('Error executing schema:', err);
        return;
    }
    console.log('Schema applied successfully');
    
    // Close database
    db.close((err) => {
        if (err) {
            console.error('Error closing database:', err);
            return;
        }
        console.log('Database connection closed');
        console.log('WORDSNPICS database created at:', dbPath);
    });
});