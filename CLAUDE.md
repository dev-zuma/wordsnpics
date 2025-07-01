# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm start` - Start the server on port 5000
- `npm run dev` - Start the server in development mode (currently same as start)

## Project Overview

WORDLINKS is a daily word puzzle game where players match 20 words to 5 images in 4 turns or less. It's a Node.js web application with modern frontend JavaScript and CSS.

## Architecture

WordLinks is a Node.js web application with the following structure:

### Core Files
- `server.js` - Main server file that creates an HTTP server on port 5000
- `database/db.js` - SQLite database service with game sessions and user management
- `routes/api.js` - API endpoints for game submission and shareable graphics
- `routes/auth.js` - OAuth authentication routes (Google) and profile management

### Frontend Structure
- `public/index.html` - Main game page
- `public/results.html` - Game results page with shareable graphics
- `public/profile.html` - User profile with game history
- `public/share.html` - Shared results page
- `public/js/game.js` - Core game logic (WORDLINKSGame class)
- `public/js/auth.js` - Authentication handling
- `public/js/results.js` - Results page functionality
- `public/js/profile.js` - Profile page logic for displaying game history
- `public/css/styles.css` - Main stylesheet
- `public/css/results.css` - Results page styles

### Key Features
- **Turn-based gameplay**: 4 turns maximum to solve the puzzle
- **Word-image matching**: Players assign 20 words to 5 themed images
- **Visual feedback**: Correct assignments marked with colored borders per turn
- **Multi-board support**: Daily, travel, food, and other themed boards
- **User Profiles**: OAuth login with game history tracking
- **Shareable Graphics**: Auto-generated result graphics for social sharing
- **Responsive Design**: Works on desktop and mobile devices

## Game Mechanics

### Dice Indicators
- **Visual word count tracking**: Each image has a dice-style indicator
- **Real dice patterns**: 1-6 dots arranged like actual dice faces
- **Three dot states**:
  - Green dots: Correctly matched words from previous turns
  - White dots: Current turn selections
  - Black dots: Available slots for words
- **Dynamic updates**: Dots update as words are selected/deselected

### Turn System
- **Progress tracking**: Turn indicators show incremental correct counts (T1, T2, T3, T4)
- **Incremental scoring**: Shows new correct words per turn, not cumulative
- **Visual feedback**: Turn boxes change color based on completion status

## Technical Details

### Cache Busting
- CSS version: `v2.2` (in index.html)
- JS version: `v4.4` (in index.html)
- Update these when making changes to ensure browser cache refresh

### Game State Management
- `correctWords` - Set of correctly matched word IDs
- `placements` - Object mapping word IDs to image IDs  
- `imageUsageCounts` - Tracks temporary selections per turn
- `wordTurns` - Records which turn each word was solved in
- `turnHistory` - Array of turn results with incremental correct counts

### Key Functions in game.js
- `assignImageToWord()` - Handles word-to-image assignments with overflow protection
- `updateImageCounts()` - Updates dice indicator dot states
- `resetImageUsageCountsForNewTurn()` - Cleans counts between turns
- `renderCarousel()` - Creates image slides and dice indicators

## Database Schema

The application uses SQLite with these main tables:
- `users` - OAuth user accounts
- `boards` - Puzzle configurations with images and words
- `game_sessions` - Individual game results linked to users
- `shareable_graphics` - Auto-generated result graphics linked to game sessions

## Important Implementation Notes

### Dice Indicator Logic
The dice indicators account for already-correct words when calculating remaining slots:
```javascript
// Correct calculation for remaining slots
const remaining = image.matchCount - correctWordsForThisImage - imageUsageCounts[imageId];
```

This prevents over-assignment and ensures dice show proper white/black dot states.

### Turn Count Display
Turn indicators show incremental (not cumulative) correct counts:
- T1: 6 (6 new correct words)
- T2: 8 (8 additional correct words)  
- T3: 1 (1 additional correct word)

### File Organization
- Keep game logic in `game.js`
- UI styling in `styles.css`
- Server logic in `server.js` and `routes/`
- Puzzle data in `data/` directory

## Known Issues

### Shareable Graphics in Profile
**Current Issue**: Shareable graphics not appearing in user profiles despite being created.

**Debug Info**: Console shows `gamesWithGraphics: 0` even when games exist.

**Root Cause**: Database JOIN between `game_sessions` and `shareable_graphics` may not be matching properly due to session ID mismatches.

**Technical Details**:
- Game sessions use `session_id` field (string)
- Shareable graphics use `game_session_id` field 
- JOIN conditions need to handle both database IDs and session strings
- Auto-save occurs on results page but may not link to correct game session

**Current JOIN Logic**:
```sql
LEFT JOIN shareable_graphics sg ON (
    gs.id = sg.game_session_id OR 
    gs.session_id = sg.game_session_id OR
    (sg.user_id = gs.user_id AND sg.board_id = gs.board_id AND DATE(sg.created_at) = DATE(gs.completed_at))
)
```

## Port Configuration
- Port 5000 is used (avoiding 3000 and 4000 which are used by other projects)

## Production Configuration

### Session Storage
- **Development**: Uses in-memory session store (not production-ready)
- **Production**: Uses custom SQLite session store (`database/session-store.js`)
- **Session table**: `sessions` table in SQLite database
- **Cleanup**: Automatic cleanup of expired sessions every hour
- **Security**: Secure cookies enabled in production with HTTPS

### Middleware Initialization Order
- **Critical**: Session and Passport middleware must be initialized before routes
- **Fixed**: All routes now defined after database and session initialization
- **Authentication**: `req.isAuthenticated()` available after proper middleware setup