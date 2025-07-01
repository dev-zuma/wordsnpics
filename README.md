# WORDSNPICS

A daily word puzzle game where players match 20 words to 5 themed images in 4 turns or less.

## Features

- **Daily Puzzles**: New themed puzzles every day at 6 AM UTC
- **Multiple Board Types**: Daily, Travel, Food, Americana, and more
- **User Profiles**: OAuth login with Google and Facebook
- **Game History**: Track your progress and view past games
- **Shareable Results**: Generate graphics to share your achievements
- **League System**: Join leagues and compete with friends
- **Responsive Design**: Works on desktop and mobile devices

## Quick Start

### Local Development

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd wordsnpics
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   # Edit .env with your OAuth credentials
   ```

4. **Initialize the database**
   ```bash
   node scripts/init-database.js
   ```

5. **Start the server**
   ```bash
   npm start
   ```

   Visit `http://localhost:5000` to play!

### Production Deployment (Render.com)

1. **Create new Render.com service**
   - Connect your GitHub repository
   - Set build command: `npm install`
   - Set start command: `node server.js`

2. **Configure environment variables**
   ```
   NODE_ENV=production
   RENDER_EXTERNAL_URL=your-app-name.onrender.com
   SESSION_SECRET=<generate-secure-random-string>
   HTTPS=true
   GOOGLE_CLIENT_ID=<your-production-google-client-id>
   GOOGLE_CLIENT_SECRET=<your-production-google-client-secret>
   FACEBOOK_APP_ID=<your-production-facebook-app-id>
   FACEBOOK_APP_SECRET=<your-production-facebook-app-secret>
   ```

3. **Initialize database**
   - After first deployment, use Render shell to run:
   ```bash
   node scripts/init-database.js
   ```

## OAuth Setup

### Google OAuth
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create new project or select existing
3. Enable Google+ API
4. Create OAuth 2.0 credentials
5. Add authorized redirect URI:
   - Development: `http://localhost:5000/auth/google/callback`
   - Production: `https://your-app.onrender.com/auth/google/callback`

### Facebook OAuth
1. Go to [Facebook Developers](https://developers.facebook.com/)
2. Create new app
3. Add Facebook Login product
4. Set redirect URI:
   - Development: `http://localhost:5000/auth/facebook/callback`
   - Production: `https://your-app.onrender.com/auth/facebook/callback`

## Game Mechanics

### Turn System
- Players have 4 turns maximum to solve each puzzle
- Each turn allows placing words on images
- Visual feedback shows correct matches with colored borders
- Turn indicators track progress incrementally

### Dice Indicators
- Each image shows a dice-style indicator with 1-6 dots
- Green dots: Correctly matched words from previous turns
- White dots: Current turn selections
- Black dots: Available slots for words

### Scoring
- Games are won by matching all 20 words correctly
- Leagues track various scoring metrics (standard, speed, consistency)
- Shareable graphics display your results

## Architecture

### Backend
- **Node.js** with Express server
- **SQLite** database with file persistence
- **Passport.js** for OAuth authentication
- **Express-session** with SQLite session store

### Frontend
- **Vanilla JavaScript** with modern ES6+ features
- **CSS Grid/Flexbox** for responsive layouts
- **Canvas API** for shareable graphics generation
- **Fetch API** for REST API communication

### Database Schema
- `users`: OAuth user accounts
- `profiles`: User profiles with display preferences  
- `boards`: Puzzle configurations with images and words
- `game_sessions`: Individual game results
- `leagues`: League definitions and memberships
- `shareable_graphics`: Auto-generated result graphics

## Project Structure

```
wordsnpics/
├── public/                 # Frontend files
│   ├── index.html         # Main game page
│   ├── results.html       # Game results page
│   ├── profile-view.html  # Individual profile page
│   ├── js/               # JavaScript modules
│   └── css/              # Stylesheets
├── routes/               # Express routes
├── database/             # Database service and schema
├── config/               # Configuration files
├── scripts/              # Utility scripts
└── server.js            # Main server file
```

## Commands

- `npm start` - Start the server on port 5000
- `npm run dev` - Start in development mode
- `node scripts/init-database.js` - Initialize database schema

## Contributing

This is a personal project, but suggestions and bug reports are welcome!

## License

MIT License - see LICENSE file for details