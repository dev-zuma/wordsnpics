const express = require('express');
const { passport, requireAuth } = require('../config/auth');
const router = express.Router();

// Get authentication status
router.get('/status', (req, res) => {
    console.log('=== AUTH STATUS CHECK ===');
    console.log('  req.isAuthenticated():', req.isAuthenticated());
    console.log('  req.user:', req.user ? `${req.user.name} (${req.user.email})` : 'null');
    console.log('  session ID:', req.sessionID);
    console.log('  Headers:', req.headers.cookie ? 'Cookie present' : 'No cookie');
    
    // Add cache-busting headers
    res.set({
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
    });
    
    if (req.isAuthenticated()) {
        const response = {
            authenticated: true,
            user: {
                id: req.user.id,
                name: req.user.name,
                email: req.user.email,
                avatar: req.user.avatar,
                provider: req.user.provider
            },
            activeProfile: req.session.activeProfile || null
        };
        console.log('  ✅ Sending authenticated response');
        res.json(response);
    } else {
        console.log('  ❌ Sending NOT authenticated response');
        res.json({
            authenticated: false
        });
    }
});

// Google OAuth routes
router.get('/google', (req, res, next) => {
    // Store the original URL in session for redirect after auth
    if (req.query.returnTo) {
        req.session.returnTo = req.query.returnTo;
        console.log('OAuth: Storing returnTo in session:', req.query.returnTo);
    }
    
    // Store game session ID if logging in from results page
    if (req.query.gameSessionId) {
        req.session.pendingGameSessionId = req.query.gameSessionId;
        console.log('OAuth: Storing pending game session ID:', req.query.gameSessionId);
    }
    
    passport.authenticate('google', {
        scope: ['profile', 'email'],
        state: req.query.returnTo ? Buffer.from(req.query.returnTo).toString('base64') : null
    })(req, res, next);
});

router.get('/google/callback', 
    passport.authenticate('google', { failureRedirect: '/?error=google_auth_failed' }),
    async (req, res) => {
        // Successful authentication - redirect to original destination or home
        let returnTo = req.session.returnTo || '/profiles'; // Default to profiles page for new multi-profile system
        
        // Also try to get returnTo from state parameter
        if (req.query.state) {
            try {
                const stateReturnTo = Buffer.from(req.query.state, 'base64').toString();
                if (stateReturnTo) returnTo = stateReturnTo;
            } catch (e) {
                console.log('Could not decode state parameter');
            }
        }
        
        console.log('OAuth Callback: returnTo from session:', req.session.returnTo);
        console.log('OAuth Callback: returnTo from state:', req.query.state);
        console.log('OAuth Callback: final returnTo:', returnTo);
        console.log('OAuth Callback: user email:', req.user?.email);
        
        // Associate pending game session with newly authenticated user
        if (req.session.pendingGameSessionId && req.user) {
            try {
                const dbService = req.app.get('dbService');
                // TODO: Implement associateGameSessionWithUser in new database service
                console.log('OAuth Callback: Game session association not yet implemented in new DB service');
                delete req.session.pendingGameSessionId; // Clean up
            } catch (error) {
                console.error('OAuth Callback: Failed to associate game session with user:', error);
            }
        }
        
        delete req.session.returnTo; // Clean up
        
        // Check if user is trying to access admin
        if (returnTo.startsWith('/admin') && req.user.email !== 'adnanzuma@gmail.com') {
            // User is not authorized for admin, redirect to home with message
            console.log('OAuth Callback: Access denied for admin');
            return res.redirect('/?error=admin_access_denied');
        }
        
        console.log('OAuth Callback: Redirecting to:', returnTo);
        res.redirect(returnTo);
    }
);

// Facebook OAuth routes
router.get('/facebook', passport.authenticate('facebook', {
    scope: ['email']
}));

router.get('/facebook/callback',
    passport.authenticate('facebook', { failureRedirect: '/?error=facebook_auth_failed' }),
    (req, res) => {
        // Successful authentication
        res.redirect('/?login=success');
    }
);

// Logout routes (both GET and POST for flexibility)
router.get('/logout', (req, res) => {
    req.logout((err) => {
        if (err) {
            console.error('Logout error:', err);
            return res.redirect('/?error=logout_failed');
        }
        res.redirect('/?logout=success');
    });
});

router.post('/logout', (req, res) => {
    req.logout((err) => {
        if (err) {
            return res.status(500).json({ error: 'Logout failed' });
        }
        res.json({ success: true, message: 'Logged out successfully' });
    });
});

// Get current user info
router.get('/user', (req, res) => {
    if (req.isAuthenticated()) {
        res.json({
            user: {
                id: req.user.id,
                name: req.user.name,
                email: req.user.email,
                avatar: req.user.avatar,
                provider: req.user.provider
            }
        });
    } else {
        res.json({ user: null });
    }
});

// Get user profile with game history
router.get('/profile', requireAuth, async (req, res) => {
    try {
        const user = req.user;
        const dbService = req.app.get('dbService');
        
        // Get profiles for this user
        const profiles = await dbService.getProfilesByUserId(user.id);
        
        res.json({
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                avatar: user.avatar,
                provider: user.provider,
                createdAt: user.created_at
            },
            profiles
        });
    } catch (error) {
        console.error('Error fetching profile:', error);
        res.status(500).json({ error: 'Failed to fetch profile' });
    }
});

module.exports = router;