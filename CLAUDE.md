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

## Game Progress Persistence

### Overview
Players can now resume games after page reload/browser restart. Progress is automatically saved after each turn and restored when returning to the same puzzle.

### Database Schema
**Table**: `game_progress`
- `session_id`: Unique game session identifier
- `board_id`: Links to specific puzzle board
- `current_turn`: Turn number (1-4)
- `correct_words`: JSON array of correctly matched word IDs
- `word_turns`: JSON object mapping word IDs to turn solved
- `turn_history`: JSON array of turn results
- `current_placements`: JSON object of current word-image assignments
- `user_id`/`profile_id`: Links to authenticated users (optional)

### Implementation Flow
1. **Game Start**: Generate unique session ID (`game_[timestamp]_[random]`)
2. **Each Turn**: Auto-save progress after turn validation
3. **Page Load**: Check for existing progress and restore game state
4. **Resume**: Show notification and restore visual state
5. **Game Complete**: Clear progress and redirect to results

### Key Methods
- `saveGameProgress()`: Save current state after each turn
- `loadGameProgress()`: Load existing progress on initialization  
- `restoreCorrectWordsVisualState()`: Restore visual styling and background images
- `clearGameProgress()`: Clean up when game completes

### API Endpoints
- `POST /api/game/save-progress`: Save game state
- `GET /api/game/find-progress/:boardId`: Find existing progress
- `DELETE /api/game/clear-progress/:sessionId`: Clear completed game

## AWS S3 Image Storage

### Overview
Images are stored in AWS S3 for persistent cloud storage, preventing loss during deployments on ephemeral filesystems (like Render.com).

### Configuration
**Environment Variables** (in `.env`):
```env
AWS_S3_BUCKET_NAME=wordsnpics-images-dev
AWS_REGION=us-east-2
AWS_ACCESS_KEY_ID=your_aws_access_key_id
AWS_SECRET_ACCESS_KEY=your_aws_secret_access_key
```

**Buckets**:
- **Development**: `wordsnpics-images-dev`
- **Production**: `wordsnpics-images-prod`

### Implementation
**Service**: `/services/s3-service.js`
- Handles image uploads to S3 with local filesystem fallback
- Returns public HTTPS URLs for uploaded images
- Automatic retry logic and error handling

**Usage in Puzzle Generation**:
```javascript
const imageBuffer = Buffer.from(imageB64, "base64");
const fileName = `daily-${group.id}-${Date.now()}.png`;
const imageUrl = await this.s3Service.uploadImage(imageBuffer, fileName);
```

### CORS Configuration
**Issue**: Canvas image loading blocked by CORS when loading S3 images for shareable graphics.

**Solutions Implemented**:
1. **S3 CORS Policy**: Applied to bucket in AWS Console
2. **Image Proxy Endpoint**: `/api/image-proxy` for CORS bypass
3. **Dual Loading Strategy**: Direct S3 load with proxy fallback

**Image Proxy Usage**:
```javascript
img.onerror = () => {
    if (!img.src.includes('/api/image-proxy')) {
        const proxyUrl = `/api/image-proxy?url=${encodeURIComponent(image.url)}`;
        img.src = proxyUrl;
        return;
    }
    // Gradient fallback if both fail
};
```

### File Organization
- Keep game logic in `game.js`
- UI styling in `styles.css`
- Server logic in `server.js` and `routes/`
- **S3 service**: `/services/s3-service.js`
- **Image generation**: `/services/puzzle-generation.js`

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

## Database Migrations

### Windows/WSL Database Path Issues
**Important**: When developing locally on Windows with WSL, there can be path conflicts between Windows Command Prompt and WSL environments.

**Issue**: Running server from Windows Command Prompt but applying migrations from WSL can result in separate database files.

**Solution**: Always run migrations from the same environment as your server:
- If server runs from Windows Command Prompt: `node migration_script.js` from Windows
- If server runs from WSL: Run migrations from WSL

**Example Migration Script**:
```javascript
const dbService = require('./database/wordsnpics-db');

async function applyMigration() {
  await dbService.initialize();
  
  // Create new table
  dbService.db.run(`CREATE TABLE new_table (...)`);
  
  // Save to ensure persistence
  await dbService.saveDatabase();
}
```

### Game Progress Table
The `game_progress` table was added via migration to support mid-game persistence. If missing, it can be recreated by:
1. Running a migration script from the same environment as the server
2. Ensuring the database file is properly saved after schema changes

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