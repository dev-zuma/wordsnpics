require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');
const fs = require('fs').promises;
const { passport, addUserInfo } = require('./config/auth');
const dbService = require('./database/wordsnpics-db');
const SQLiteSessionStore = require('./database/session-store');

const app = express();
const PORT = process.env.PORT || 5000;

// Basic middleware
app.use(express.json({ limit: '10mb' })); // Increase limit for shareable graphics
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Add route debugging middleware
app.use((req, res, next) => {
    console.log(`${req.method} ${req.url}`);
    next();
});

// Store session store reference for cleanup
let sessionStore = null;

// Start server (database should already be initialized externally)
async function startServer() {
    try {
        // Check if database is already initialized
        await dbService.initialize();
        
        if (!dbService.db) {
            console.log('⚠️  Database not initialized. Please run initialization script first.');
            console.log('   Run: node scripts/init-database.js');
            process.exit(1);
        }
        
        // Configure session store
        sessionStore = new SQLiteSessionStore({ 
            dbService,
            ttl: 24 * 60 * 60 // 24 hours in seconds
        });
        
        // Session configuration with SQLite store
        app.use(session({
            store: sessionStore,
            secret: process.env.SESSION_SECRET || 'wordlinks-secret-key-change-in-production',
            resave: false,
            saveUninitialized: false,
            cookie: {
                secure: process.env.NODE_ENV === 'production' && process.env.HTTPS === 'true',
                maxAge: 24 * 60 * 60 * 1000 // 24 hours
            }
        }));

        // Passport middleware
        app.use(passport.initialize());
        app.use(passport.session());
        
        // Make database service available to routes
        app.set('dbService', dbService);
        
        // Add user info to all requests after session/passport setup
        app.use(addUserInfo);
        
        // Import and setup routes after middleware is ready
        const apiRoutes = require('./routes/api');
        const adminRoutes = require('./routes/admin');
        const authRoutes = require('./routes/auth');
        const analyticsRoutes = require('./routes/analytics');
        const profileRoutes = require('./routes/profiles');

        // Routes
        app.get('/', (req, res) => {
            res.sendFile(path.join(__dirname, 'public', 'index.html'));
        });

        // Results page route
        app.get('/results', (req, res) => {
            // Allow access if only 'session' parameter is present (for viewing saved games)
            const queryKeys = Object.keys(req.query);
            const hasOnlySessionParam = queryKeys.length === 1 && queryKeys[0] === 'session';
            const hasNoParams = queryKeys.length === 0;
            const hasValidatedParam = req.query.validated === 'true' && req.query.sessionId;
            
            if (hasNoParams || hasOnlySessionParam || hasValidatedParam) {
                // Allow normal results page access
                res.sendFile(path.join(__dirname, 'public', 'results.html'));
            } else {
                // Old-style URL sharing is no longer supported to prevent spoilers
                // Redirect to home page with a message
                res.redirect('/?message=use_share_button');
            }
        });

        // Individual profile view route (new URL pattern)
        app.get('/profile/:username', (req, res) => {
            res.sendFile(path.join(__dirname, 'public', 'profile-view.html'));
        });

        // Legacy profile page route (redirect to profiles page)
        app.get('/profile', (req, res) => {
            res.redirect('/profiles');
        });

        // Profiles selection page route
        app.get('/profiles', (req, res) => {
            res.sendFile(path.join(__dirname, 'public', 'profiles.html'));
        });

        // Leagues page route
        app.get('/leagues', (req, res) => {
            res.sendFile(path.join(__dirname, 'public', 'leagues.html'));
        });

        // League join route (shareable links)
        app.get('/join/:leagueCode', (req, res) => {
            res.sendFile(path.join(__dirname, 'public', 'join.html'));
        });

        // League details route
        app.get('/leagues/:leagueCode', (req, res) => {
            res.sendFile(path.join(__dirname, 'public', 'league-details.html'));
        });

        // Authentication routes
        app.use('/auth', authRoutes);

        // API routes
        app.use('/api', apiRoutes);

        // Profile routes
        app.use('/api/profiles', profileRoutes);

        // League routes
        const leagueRoutes = require('./routes/leagues');
        app.use('/api/leagues', leagueRoutes);

        // User info route (for profile page)
        app.get('/api/user', (req, res) => {
            if (req.isAuthenticated()) {
                res.json({
                    id: req.user.id,
                    name: req.user.name,
                    email: req.user.email,
                    avatar: req.user.avatar,
                    provider: req.user.provider
                });
            } else {
                res.status(401).json({ error: 'Not authenticated' });
            }
        });

        // Analytics routes
        app.use('/analytics', analyticsRoutes);

        // Admin routes
        app.use('/admin', adminRoutes);
        
        // Shareable graphic routes
        app.get('/share/:id', async (req, res) => {
            try {
                const shareableId = req.params.id;
                const graphic = await dbService.getShareableGraphicById(shareableId);
                
                if (!graphic) {
                    return res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
                }
                
                // Increment view count
                await dbService.incrementShareableGraphicViews(shareableId);
                
                // Read the share.html template and inject proper meta tags
                const htmlTemplate = await fs.readFile(path.join(__dirname, 'public', 'share.html'), 'utf8');
                
                // Create dynamic meta tags with the actual shareable graphic
                const baseUrl = `${req.protocol}://${req.get('host')}`;
                const imageUrl = `${baseUrl}/api/share/${shareableId}/image`;
                const shareUrl = `${baseUrl}/share/${shareableId}`;
                
                // Get game results for better description
                const gameResults = graphic.graphic_data || {};
                const { correctWords = 0, totalWords = 20, turns = 0 } = gameResults;
                const userName = graphic.user_name ? `${graphic.user_name}'s` : 'My';
                
                const description = `${userName} WORDLINKS result: ${correctWords}/${totalWords} words in ${turns} turns. Can you beat this score?`;
                const title = `${userName} WORDLINKS Result - ${correctWords}/${totalWords} words`;
                
                // Replace meta tag placeholders with actual values
                const dynamicHtml = htmlTemplate
                    .replace('<meta property="og:url" content="">', `<meta property="og:url" content="${shareUrl}">`)
                    .replace('<meta property="og:image" content="">', `<meta property="og:image" content="${imageUrl}">`)
                    .replace('<meta name="twitter:image" content="">', `<meta name="twitter:image" content="${imageUrl}">`)
                    .replace('<meta property="og:title" content="WORDLINKS - Shared Game Result">', `<meta property="og:title" content="${title}">`)
                    .replace('<meta name="twitter:title" content="WORDLINKS - Shared Game Result">', `<meta name="twitter:title" content="${title}">`)
                    .replace('<meta property="og:description" content="Check out this WORDLINKS puzzle result! A daily word puzzle game where you match words to images.">', `<meta property="og:description" content="${description}">`)
                    .replace('<meta name="twitter:description" content="Check out this WORDLINKS puzzle result! A daily word puzzle game where you match words to images.">', `<meta name="twitter:description" content="${description}">`);
                
                res.send(dynamicHtml);
                
            } catch (error) {
                console.error('Error serving shareable graphic:', error);
                res.status(500).sendFile(path.join(__dirname, 'public', '500.html'));
            }
        });

        // API endpoint to get shareable graphic data
        app.get('/api/share/:id', async (req, res) => {
            try {
                const shareableId = req.params.id;
                const graphic = await dbService.getShareableGraphicById(shareableId);
                
                if (!graphic) {
                    return res.status(404).json({ error: 'Shareable graphic not found' });
                }
                
                // Get board type information
                let boardTypeId = null;
                if (graphic.board_id) {
                    try {
                        const board = await dbService.getBoardById(graphic.board_id, false);
                        if (board) {
                            boardTypeId = board.board_type_id;
                        }
                    } catch (error) {
                        console.error('Error fetching board type:', error);
                    }
                }

                res.json({
                    id: graphic.id,
                    imageData: graphic.image_data,
                    gameResults: graphic.graphic_data,
                    puzzleTitle: graphic.puzzle_title,
                    puzzleDate: graphic.puzzle_date,
                    userName: graphic.user_name,
                    viewCount: graphic.view_count,
                    createdAt: graphic.created_at,
                    boardId: graphic.board_id,
                    boardType: boardTypeId
                });
                
            } catch (error) {
                console.error('Error getting shareable graphic data:', error);
                res.status(500).json({ error: 'Failed to load shareable graphic' });
            }
        });

        // API endpoint to serve shareable graphic image for Open Graph
        app.get('/api/share/:id/image', async (req, res) => {
            try {
                const shareableId = req.params.id;
                const graphic = await dbService.getShareableGraphicById(shareableId);
                
                if (!graphic || !graphic.image_data) {
                    return res.status(404).send('Image not found');
                }
                
                // Convert base64 to buffer
                const base64Data = graphic.image_data.replace(/^data:image\/png;base64,/, '');
                const imgBuffer = Buffer.from(base64Data, 'base64');
                
                res.set({
                    'Content-Type': 'image/png',
                    'Content-Length': imgBuffer.length,
                    'Cache-Control': 'public, max-age=31536000', // 1 year cache
                    'Access-Control-Allow-Origin': '*', // Allow cross-origin access
                    'X-Content-Type-Options': 'nosniff'
                });
                res.send(imgBuffer);
                
            } catch (error) {
                console.error('Error serving shareable graphic image:', error);
                res.status(500).send('Failed to load image');
            }
        });
        
        // Start server
        app.listen(PORT, () => {
            console.log(`WORDSNPICS server running at http://localhost:${PORT}/`);
            console.log('Session store: SQLite (production-ready)');
            console.log('Multi-profile system: Enabled');
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
    console.log('\nShutting down gracefully...');
    if (sessionStore) {
        sessionStore.close();
    }
    await dbService.close();
    process.exit(0);
});

startServer();