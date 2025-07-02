const { Store } = require('express-session');

/**
 * Custom SQLite session store for express-session
 * Uses the existing dbService to store sessions in the database
 */
class SQLiteSessionStore extends Store {
    constructor(options = {}) {
        super(options);
        this.dbService = options.dbService;
        this.ttl = options.ttl || 86400; // Default 24 hours in seconds
        
        if (!this.dbService) {
            throw new Error('dbService is required for SQLiteSessionStore');
        }
        
        // Clean up expired sessions every hour
        this.cleanupInterval = setInterval(() => {
            this.cleanup();
        }, 60 * 60 * 1000);
        
        // Track session operations to optimize saves
        this.batchOperations = 0;
        this.maxBatchSize = 10; // Force save after 10 operations
    }

    /**
     * Get session data
     */
    get(sid, callback) {
        try {
            const stmt = this.dbService.db.prepare(`
                SELECT sess FROM sessions 
                WHERE sid = ? AND expired > datetime('now')
            `);
            stmt.bind([sid]);
            
            const result = stmt.step() ? stmt.getAsObject() : null;
            stmt.free();
            
            if (result) {
                const session = JSON.parse(result.sess);
                callback(null, session);
            } else {
                callback(null, null);
            }
        } catch (error) {
            console.error('Session get error:', error);
            callback(error);
        }
    }

    /**
     * Set session data
     */
    set(sid, session, callback) {
        try {
            const maxAge = session.cookie && session.cookie.maxAge;
            const expired = new Date(Date.now() + (maxAge || this.ttl * 1000));
            
            const stmt = this.dbService.db.prepare(`
                INSERT OR REPLACE INTO sessions (sid, sess, expired)
                VALUES (?, ?, ?)
            `);
            stmt.bind([sid, JSON.stringify(session), expired.toISOString()]);
            stmt.step();
            stmt.free();
            
            // Use debounced save to prevent memory issues
            this.dbService.debouncedSave();
            
            if (callback) callback(null);
        } catch (error) {
            console.error('Session set error:', error);
            if (callback) callback(error);
        }
    }

    /**
     * Destroy session
     */
    destroy(sid, callback) {
        try {
            const stmt = this.dbService.db.prepare('DELETE FROM sessions WHERE sid = ?');
            stmt.bind([sid]);
            stmt.step();
            stmt.free();
            
            // Use debounced save to prevent memory issues
            this.dbService.debouncedSave();
            
            if (callback) callback(null);
        } catch (error) {
            console.error('Session destroy error:', error);
            if (callback) callback(error);
        }
    }

    /**
     * Touch session (update expiration)
     */
    touch(sid, session, callback) {
        try {
            const maxAge = session.cookie && session.cookie.maxAge;
            const expired = new Date(Date.now() + (maxAge || this.ttl * 1000));
            
            const stmt = this.dbService.db.prepare(`
                UPDATE sessions SET expired = ? WHERE sid = ?
            `);
            stmt.bind([expired.toISOString(), sid]);
            stmt.step();
            stmt.free();
            
            // Use debounced save to prevent memory issues
            this.dbService.debouncedSave();
            
            if (callback) callback(null);
        } catch (error) {
            console.error('Session touch error:', error);
            if (callback) callback(error);
        }
    }

    /**
     * Get session count
     */
    length(callback) {
        try {
            const stmt = this.dbService.db.prepare(`
                SELECT COUNT(*) as count FROM sessions 
                WHERE expired > datetime('now')
            `);
            const result = stmt.step() ? stmt.getAsObject() : { count: 0 };
            stmt.free();
            
            callback(null, result.count);
        } catch (error) {
            console.error('Session length error:', error);
            callback(error);
        }
    }

    /**
     * Clear all sessions
     */
    clear(callback) {
        try {
            const stmt = this.dbService.db.prepare('DELETE FROM sessions');
            stmt.step();
            stmt.free();
            
            // Use debounced save to prevent memory issues
            this.dbService.debouncedSave();
            
            if (callback) callback(null);
        } catch (error) {
            console.error('Session clear error:', error);
            if (callback) callback(error);
        }
    }

    /**
     * Clean up expired sessions
     */
    cleanup() {
        try {
            const stmt = this.dbService.db.prepare(`
                DELETE FROM sessions WHERE expired <= datetime('now')
            `);
            stmt.step();
            stmt.free();
            
            // Use debounced save to prevent memory issues
            this.dbService.debouncedSave();
            
            console.log('Cleaned up expired sessions');
        } catch (error) {
            console.error('Session cleanup error:', error);
        }
    }

    /**
     * Close the store and cleanup interval
     */
    close() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }
    }
}

module.exports = SQLiteSessionStore;