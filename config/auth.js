const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const FacebookStrategy = require('passport-facebook').Strategy;
const dbService = require('../database/wordsnpics-db');

// Serialize user for session
passport.serializeUser((user, done) => {
    console.log('Serializing user:', user.id, user.email);
    done(null, user.id);
});

// Deserialize user from session
passport.deserializeUser(async (id, done) => {
    try {
        console.log('Deserializing user ID:', id);
        const user = await dbService.getUserById(id);
        console.log('Deserialized user:', user ? `${user.name} (${user.email})` : 'null');
        done(null, user);
    } catch (error) {
        console.log('Error deserializing user:', error);
        done(error, null);
    }
});

// Google OAuth Strategy
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    passport.use(new GoogleStrategy({
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: process.env.NODE_ENV === 'production' 
            ? `https://${process.env.RENDER_EXTERNAL_URL || 'wordsnpics.onrender.com'}/auth/google/callback`
            : "/auth/google/callback"
    }, async (accessToken, refreshToken, profile, done) => {
        try {
            // Check if user already exists
            let user = await dbService.getUserByProvider('google', profile.id);

            if (!user) {
                // Create new user
                const userData = {
                    id: 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
                    provider: 'google',
                    providerId: profile.id,
                    name: profile.displayName,
                    email: profile.emails[0]?.value,
                    avatar: profile.photos[0]?.value
                };
                user = await dbService.createUser(userData);
            }

            return done(null, user);
        } catch (error) {
            return done(error, null);
        }
    }));
}

// Facebook OAuth Strategy
if (process.env.FACEBOOK_APP_ID && process.env.FACEBOOK_APP_SECRET) {
    passport.use(new FacebookStrategy({
        clientID: process.env.FACEBOOK_APP_ID,
        clientSecret: process.env.FACEBOOK_APP_SECRET,
        callbackURL: process.env.NODE_ENV === 'production' 
            ? `https://${process.env.RENDER_EXTERNAL_URL || 'wordsnpics.onrender.com'}/auth/facebook/callback`
            : "/auth/facebook/callback",
        profileFields: ['id', 'displayName', 'emails', 'photos']
    }, async (accessToken, refreshToken, profile, done) => {
        try {
            // Check if user already exists
            let user = await dbService.getUserByProvider('facebook', profile.id);

            if (!user) {
                // Create new user
                const userData = {
                    id: 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
                    provider: 'facebook',
                    providerId: profile.id,
                    name: profile.displayName,
                    email: profile.emails[0]?.value,
                    avatar: profile.photos[0]?.value
                };
                user = await dbService.createUser(userData);
            }

            return done(null, user);
        } catch (error) {
            return done(error, null);
        }
    }));
}

// Middleware to check if user is authenticated
const requireAuth = (req, res, next) => {
    if (req.isAuthenticated()) {
        return next();
    }
    res.status(401).json({ error: 'Authentication required' });
};

// Middleware to add user info to requests (optional auth)
const addUserInfo = (req, res, next) => {
    // User info is automatically available in req.user if authenticated
    next();
};

module.exports = {
    passport,
    requireAuth,
    addUserInfo
};