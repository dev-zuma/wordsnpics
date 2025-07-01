# WORDSNPICS Enhanced Features - Technical Specification

## Table of Contents
1. [Multi-Profile Family Account System](#1-multi-profile-family-account-system)
2. [Leagues & Competition System](#2-leagues--competition-system)
3. [Daily Puzzle Generation & Global Timing](#3-daily-puzzle-generation--global-timing)
4. [Implementation Roadmap](#4-implementation-roadmap)
5. [Technical Considerations](#5-technical-considerations)
6. [Success Metrics & KPIs](#6-success-metrics--kpis)
7. [Rebrand Implementation Notes](#7-rebrand-implementation-notes)

---

## 1. Multi-Profile Family Account System

### 1.1 Overview
Allow parents to create multiple profiles under their account for family members, especially children who don't have email accounts. Each profile maintains separate game history, stats, and progress.

### 1.2 Database Schema Changes

#### New Tables

```sql
-- Profiles table for family members
CREATE TABLE profiles (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    username VARCHAR(50) NOT NULL UNIQUE,
    display_name VARCHAR(100) NOT NULL,
    avatar_color VARCHAR(7) DEFAULT '#3498db', -- hex color for generated avatar
    avatar_icon VARCHAR(50) DEFAULT 'star', -- icon type (star, heart, rocket, etc.)
    birth_year INTEGER, -- optional, for age-appropriate features
    is_default BOOLEAN DEFAULT false, -- parent's default profile
    is_child BOOLEAN DEFAULT true,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_username UNIQUE(username),
    CONSTRAINT valid_avatar_color CHECK(avatar_color GLOB '#[0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f]')
);

-- Profile statistics (derived from game_sessions but cached for performance)
CREATE TABLE profile_stats (
    profile_id TEXT PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
    games_played INTEGER DEFAULT 0,
    games_won INTEGER DEFAULT 0,
    best_time TEXT, -- fastest completion time
    best_turn_count INTEGER DEFAULT 4, -- fewest turns to complete
    average_accuracy REAL DEFAULT 0.0, -- average correct words per game
    total_play_time INTEGER DEFAULT 0, -- total seconds played
    current_streak INTEGER DEFAULT 0, -- consecutive wins
    longest_streak INTEGER DEFAULT 0, -- best streak ever
    last_played DATETIME,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_profiles_user_id ON profiles(user_id);
CREATE INDEX idx_profiles_username ON profiles(username);
CREATE INDEX idx_profile_stats_games_played ON profile_stats(games_played DESC);
```

#### Modified Tables

```sql
-- Update game_sessions to use profiles
ALTER TABLE game_sessions ADD COLUMN profile_id TEXT REFERENCES profiles(id);
ALTER TABLE game_sessions ADD COLUMN parent_user_id TEXT REFERENCES users(id); -- for parent access
CREATE INDEX idx_game_sessions_profile_id ON game_sessions(profile_id);

-- Update shareable_graphics to use profiles  
ALTER TABLE shareable_graphics ADD COLUMN profile_id TEXT REFERENCES profiles(id);
CREATE INDEX idx_shareable_graphics_profile_id ON shareable_graphics(profile_id);
```

### 1.3 API Endpoints

#### Profile Management

```javascript
// Get all profiles for authenticated user
GET /api/profiles
Response: {
  profiles: [{
    id: "prof_123",
    username: "emma", 
    display_name: "Emma",
    avatar_color: "#e74c3c",
    avatar_icon: "heart",
    is_default: false,
    is_child: true,
    stats: { games_played: 15, games_won: 12, ... }
  }]
}

// Create new profile
POST /api/profiles
Body: {
  username: "alex",
  display_name: "Alex", 
  avatar_color: "#3498db",
  avatar_icon: "rocket",
  birth_year: 2015
}

// Update profile
PUT /api/profiles/:profileId
Body: { display_name: "Alexander", avatar_color: "#9b59b6" }

// Delete profile (parent only)
DELETE /api/profiles/:profileId

// Switch active profile in session
POST /api/profiles/:profileId/activate
Response: { activeProfile: { id: "prof_123", username: "emma" } }

// Get profile-specific game history
GET /api/profiles/:profileId/games?limit=20&offset=0
```

### 1.4 User Interface Components

#### Profile Selection Screen
```html
<!-- Who's Playing Screen -->
<div class="profile-selection">
  <h2>Who's Playing?</h2>
  <div class="profile-grid">
    <div class="profile-card" data-profile-id="prof_parent">
      <div class="avatar" style="background: #2c3e50">👤</div>
      <span>Mom</span>
    </div>
    <div class="profile-card" data-profile-id="prof_child1">
      <div class="avatar" style="background: #e74c3c">❤️</div>
      <span>Emma</span>
    </div>
    <div class="add-profile-card">
      <div class="avatar add-icon">➕</div>
      <span>Add Profile</span>
    </div>
  </div>
</div>
```

#### Profile Management Interface
- **Add Profile Modal** with username validation
- **Edit Profile** with avatar customization
- **Profile Stats Dashboard** showing individual progress
- **Family Overview** for parents to see all profiles

### 1.5 Session Management

```javascript
// Enhanced session structure
{
  user: {
    id: "user_parent_123",
    email: "parent@email.com",
    name: "Sarah Johnson"
  },
  activeProfile: {
    id: "prof_emma_456", 
    username: "emma",
    display_name: "Emma",
    is_child: true,
    avatar_color: "#e74c3c",
    avatar_icon: "heart"
  },
  isParentSession: false // true if playing as parent profile
}
```

---

## 2. Leagues & Competition System

### 2.1 Overview
Enable friends and families to create private leagues for friendly competition. Features include leaderboards, invitations, multiple scoring methods, and seasonal competitions.

### 2.2 Database Schema

```sql
-- Leagues table
CREATE TABLE leagues (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    name VARCHAR(100) NOT NULL,
    description TEXT,
    creator_user_id TEXT NOT NULL REFERENCES users(id),
    league_code VARCHAR(10) UNIQUE NOT NULL, -- shareable 6-8 char code
    is_public BOOLEAN DEFAULT false,
    scoring_method VARCHAR(20) DEFAULT 'standard', -- standard, speed, consistency
    competition_type VARCHAR(20) DEFAULT 'ongoing', -- ongoing, weekly, monthly
    board_type_id TEXT REFERENCES board_types(id), -- specific board or 'all'
    max_members INTEGER DEFAULT 50,
    start_date DATE,
    end_date DATE,
    is_active BOOLEAN DEFAULT true,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- League memberships
CREATE TABLE league_members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    league_id TEXT NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    profile_id TEXT REFERENCES profiles(id) ON DELETE CASCADE, -- if playing as child
    joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    is_admin BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    nickname VARCHAR(50), -- optional display name in league
    UNIQUE(league_id, user_id, profile_id)
);

-- League scores and rankings
CREATE TABLE league_scores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    league_id TEXT NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
    member_id INTEGER NOT NULL REFERENCES league_members(id) ON DELETE CASCADE,
    game_session_id INTEGER NOT NULL REFERENCES game_sessions(id),
    board_id TEXT NOT NULL,
    score INTEGER NOT NULL, -- calculated based on scoring_method
    bonus_points INTEGER DEFAULT 0,
    submission_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    week_number INTEGER, -- for weekly competitions
    month_number INTEGER, -- for monthly competitions
    UNIQUE(league_id, member_id, game_session_id)
);

-- League activity feed
CREATE TABLE league_activities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    league_id TEXT NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
    member_id INTEGER REFERENCES league_members(id),
    activity_type VARCHAR(50) NOT NULL, -- 'game_completed', 'member_joined', 'achievement'
    activity_data TEXT, -- JSON with activity details
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_leagues_code ON leagues(league_code);
CREATE INDEX idx_league_members_league ON league_members(league_id);
CREATE INDEX idx_league_scores_league ON league_scores(league_id, score DESC);
CREATE INDEX idx_league_activities_league ON league_activities(league_id, created_at DESC);
```

### 2.3 Scoring Methods

#### Standard Scoring
```javascript
function calculateStandardScore(gameSession) {
  const baseScore = gameSession.correct_words * 10; // 10 points per correct word
  const turnBonus = Math.max(0, (5 - gameSession.turns_used) * 25); // bonus for fewer turns
  const timeBonus = gameSession.time_elapsed < 120 ? 50 : 0; // speed bonus under 2 minutes
  return baseScore + turnBonus + timeBonus;
}
```

#### Speed Scoring (time-focused)
```javascript
function calculateSpeedScore(gameSession) {
  if (!gameSession.is_win) return 0;
  const timeInSeconds = parseTimeToSeconds(gameSession.time_elapsed);
  const maxTime = 600; // 10 minutes max
  return Math.max(0, 1000 - Math.floor(timeInSeconds / maxTime * 1000));
}
```

#### Consistency Scoring (average performance)
```javascript
function calculateConsistencyScore(recentGames) {
  // Average score of last 7 games with bonus for consistency
  const scores = recentGames.map(g => calculateStandardScore(g));
  const average = scores.reduce((a, b) => a + b, 0) / scores.length;
  const variance = calculateVariance(scores);
  const consistencyBonus = Math.max(0, 100 - variance); // bonus for low variance
  return Math.floor(average + consistencyBonus);
}
```

### 2.4 League API Endpoints

```javascript
// Create league
POST /api/leagues
Body: {
  name: "Family Word Challenge",
  description: "Johnson family competition",
  scoring_method: "standard",
  competition_type: "weekly",
  board_type_id: "daily"
}

// Join league by code
POST /api/leagues/join
Body: { league_code: "FWC2024", profile_id: "prof_123" }

// Get league details and leaderboard
GET /api/leagues/:leagueId
Response: {
  league: { name: "Family Challenge", ... },
  leaderboard: [{
    rank: 1,
    member: { nickname: "Emma", avatar_color: "#e74c3c" },
    score: 1250,
    games_played: 8,
    last_played: "2024-01-15T10:30:00Z"
  }],
  userMembership: { is_admin: false, joined_at: "..." }
}

// Get user's leagues
GET /api/leagues/my-leagues
Response: {
  leagues: [{
    id: "league_123",
    name: "Family Challenge", 
    member_count: 4,
    user_rank: 2,
    recent_activity: 3
  }]
}

// Submit game to league (automatic when user is in leagues)
POST /api/leagues/:leagueId/submit-score
Body: { game_session_id: 789 }

// Invite to league
POST /api/leagues/:leagueId/invite
Body: { invite_method: "link" } // or "email" with email addresses
Response: { invite_link: "https://wordsnpics.com/join/FWC2024" }
```

### 2.5 Invitation System

#### Shareable League Codes
- **6-character alphanumeric codes** (e.g., "FWC24A")
- **QR codes** for easy mobile sharing
- **Invite links** with embedded league codes

#### Invitation Methods
```javascript
// Direct Link Sharing
https://wordsnpics.com/join/FWC2024

// Social Media Sharing
"Join our WORDSNPICS league! Use code FWC2024 or click: https://wordsnpics.com/join/FWC2024"

// Family Sharing (text/email)
"Hi! I created a WORDSNPICS league for us to compete. Join with code: FWC2024"
```

---

## 3. Daily Puzzle Generation & Global Timing

### 3.1 Overview
Implement automated daily puzzle generation for each board type with fair global timing. Ensure all players worldwide get the same puzzle at the same time for competitive integrity.

### 3.2 Enhanced Database Schema

```sql
-- Daily puzzle schedule
CREATE TABLE daily_puzzles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    board_type_id TEXT NOT NULL REFERENCES board_types(id),
    puzzle_date DATE NOT NULL, -- YYYY-MM-DD format
    board_id TEXT NOT NULL REFERENCES boards(id),
    release_time DATETIME NOT NULL, -- UTC timestamp when puzzle becomes available
    is_active BOOLEAN DEFAULT true,
    generation_status VARCHAR(20) DEFAULT 'pending', -- pending, generating, ready, failed
    generation_log TEXT, -- JSON log of generation process
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(board_type_id, puzzle_date)
);

-- Puzzle generation queue
CREATE TABLE puzzle_generation_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    board_type_id TEXT NOT NULL REFERENCES board_types(id),
    target_date DATE NOT NULL,
    priority INTEGER DEFAULT 0, -- higher = more urgent
    status VARCHAR(20) DEFAULT 'queued', -- queued, processing, completed, failed
    attempt_count INTEGER DEFAULT 0,
    last_attempt DATETIME,
    error_log TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Global puzzle settings
CREATE TABLE puzzle_settings (
    key VARCHAR(50) PRIMARY KEY,
    value TEXT NOT NULL,
    description TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Insert default settings
INSERT OR IGNORE INTO puzzle_settings (key, value, description) VALUES
('daily_release_hour', '12', 'UTC hour when daily puzzles are released (0-23)'),
('advance_generation_days', '3', 'How many days ahead to generate puzzles'),
('generation_retry_limit', '3', 'Max attempts to generate a puzzle before manual intervention'),
('puzzle_difficulty_target', 'medium', 'Target difficulty for auto-generated puzzles');

CREATE INDEX idx_daily_puzzles_date_type ON daily_puzzles(puzzle_date, board_type_id);
CREATE INDEX idx_puzzle_queue_status ON puzzle_generation_queue(status, priority DESC);
```

### 3.3 Puzzle Generation System

#### Automated Generation Pipeline

```javascript
// Daily Generation Cron Job (runs every hour)
class PuzzleGenerationService {
  async generateDailyPuzzles() {
    const targetDate = this.getTargetGenerationDate();
    const boardTypes = await this.getActiveBoardTypes();
    
    for (const boardType of boardTypes) {
      await this.queuePuzzleGeneration(boardType.id, targetDate);
    }
  }

  async processGenerationQueue() {
    const queueItems = await this.getPendingQueueItems();
    
    for (const item of queueItems) {
      try {
        await this.generatePuzzleForBoardType(item.board_type_id, item.target_date);
        await this.markQueueItemCompleted(item.id);
      } catch (error) {
        await this.handleGenerationFailure(item.id, error);
      }
    }
  }

  async generatePuzzleForBoardType(boardTypeId, targetDate) {
    // 1. Get board type configuration
    const boardType = await this.getBoardType(boardTypeId);
    
    // 2. Generate puzzle using OpenAI API
    const puzzleData = await this.generatePuzzleContent(boardType);
    
    // 3. Create board and associated data
    const boardId = await this.createBoard(puzzleData, boardTypeId, targetDate);
    
    // 4. Schedule puzzle for release
    await this.scheduleDailyPuzzle(boardTypeId, targetDate, boardId);
    
    return boardId;
  }
}
```

#### OpenAI Integration Enhancement

```javascript
// Enhanced puzzle generation with better prompts
class AIContentGenerator {
  async generatePuzzleContent(boardType) {
    const prompt = this.buildGenerationPrompt(boardType);
    
    const response = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        {
          role: "system",
          content: "You are an expert puzzle creator for WORDSNPICS, a word-image matching game. Create engaging, family-friendly puzzles with clear thematic connections."
        },
        {
          role: "user", 
          content: prompt
        }
      ],
      temperature: 0.8, // allow creativity but maintain consistency
      max_tokens: 2000
    });

    return this.parsePuzzleResponse(response.choices[0].message.content);
  }

  buildGenerationPrompt(boardType) {
    return `Create a ${boardType.name} themed WORDSNPICS puzzle with:
    - 5 distinct image themes within the ${boardType.name} category
    - Each theme should have 4 words that clearly relate to it
    - Words should be family-friendly and suitable for ages 8+
    - Avoid obscure or overly technical terms
    - Ensure clear thematic connections that players can discover
    
    Board Type: ${boardType.name}
    Description: ${boardType.description}
    One-liner: ${boardType.one_liner}
    
    Format your response as JSON with the structure:
    {
      "themes": [
        {
          "name": "Theme Name",
          "description": "Brief description for image generation",
          "words": ["word1", "word2", "word3", "word4"]
        }
      ]
    }`;
  }
}
```

### 3.4 Global Timing Strategy

#### UTC-Based Release Schedule
```javascript
// Puzzle Release Configuration
const PUZZLE_RELEASE_CONFIG = {
  utcHour: 12, // 12:00 UTC daily release
  advanceNoticeHours: 24, // show countdown 24h before
  gracePerionMinutes: 60 // allow submissions up to 1h after new puzzle
};

// Time Zone Handling
class GlobalTimingService {
  getPuzzleReleaseTime(date) {
    const releaseTime = new Date(date);
    releaseTime.setUTCHours(PUZZLE_RELEASE_CONFIG.utcHour, 0, 0, 0);
    return releaseTime;
  }

  getCurrentPuzzleDate() {
    const now = new Date();
    const releaseTime = this.getPuzzleReleaseTime(now);
    
    // If before today's release time, show yesterday's puzzle
    if (now < releaseTime) {
      const yesterday = new Date(now);
      yesterday.setDate(now.getDate() - 1);
      return this.formatDate(yesterday);
    }
    
    return this.formatDate(now);
  }

  getNextPuzzleCountdown() {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(now.getDate() + 1);
    const nextRelease = this.getPuzzleReleaseTime(tomorrow);
    
    return {
      nextReleaseTime: nextRelease,
      hoursUntilRelease: Math.ceil((nextRelease - now) / (1000 * 60 * 60)),
      userTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone
    };
  }
}
```

#### Fair Competition Mechanics

```javascript
// Puzzle Availability API
GET /api/puzzles/daily/:boardType
Response: {
  puzzle: { 
    boardId: "board_123",
    releaseTime: "2024-01-15T12:00:00.000Z",
    isAvailable: true,
    timeRemaining: null // or seconds until next puzzle
  },
  userProgress: {
    hasPlayed: false,
    bestScore: null,
    rank: null
  },
  globalStats: {
    totalPlayers: 1247,
    averageScore: 850,
    completionRate: 0.73
  }
}

// Submission Validation
POST /api/game/submit-game
// Server validates:
// 1. Puzzle was available when game started
// 2. Game completed within reasonable time window
// 3. No multiple submissions for same puzzle
```

### 3.5 Puzzle Generation Scheduling

#### Cron Job Configuration
```javascript
// Node-cron schedule for puzzle generation
const cron = require('node-cron');

// Generate puzzles daily at 6 AM UTC (6 hours before release)
cron.schedule('0 6 * * *', async () => {
  console.log('Starting daily puzzle generation...');
  await puzzleGenerationService.generateDailyPuzzles();
});

// Process generation queue every 30 minutes
cron.schedule('*/30 * * * *', async () => {
  await puzzleGenerationService.processGenerationQueue();
});

// Cleanup old puzzles weekly
cron.schedule('0 2 * * 0', async () => {
  await puzzleGenerationService.cleanupOldPuzzles();
});
```

#### Fallback and Quality Control

```javascript
class PuzzleQualityControl {
  async validateGeneratedPuzzle(puzzleData) {
    const checks = [
      this.validateWordCount(puzzleData), // exactly 20 words
      this.validateThemeDistribution(puzzleData), // 4 words per theme
      this.validateWordDifficulty(puzzleData), // age-appropriate
      this.validateThemeClarity(puzzleData), // clear connections
      this.checkForDuplicates(puzzleData) // no repeated words
    ];

    const results = await Promise.all(checks);
    return results.every(check => check.passed);
  }

  async createFallbackPuzzle(boardTypeId, date) {
    // Use pre-created backup puzzles or template system
    const fallbackPuzzles = await this.getFallbackPuzzles(boardTypeId);
    return this.adaptFallbackPuzzle(fallbackPuzzles[0], date);
  }
}
```

---

## 4. Implementation Roadmap

### Phase 1: Multi-Profile System (Weeks 1-3)
**Week 1: Database & Backend**
- [ ] Update database schema with profiles tables
- [ ] Create migration scripts for existing users
- [ ] Implement profile management API endpoints
- [ ] Update session handling for profile-based auth

**Week 2: Frontend Core**
- [ ] Build profile selection screen
- [ ] Create profile management interface
- [ ] Update game flow to use active profile
- [ ] Add profile switching functionality

**Week 3: Polish & Testing**
- [ ] Implement profile statistics dashboard
- [ ] Add avatar customization options
- [ ] Create parent/child specific features
- [ ] Test multi-profile game sessions

### Phase 2: Daily Puzzle Generation (Weeks 4-6)
**Week 4: Generation System**
- [ ] Implement puzzle generation service
- [ ] Create scheduling and queue system
- [ ] Enhance OpenAI integration for better content
- [ ] Build quality control and validation

**Week 5: Global Timing**
- [ ] Implement UTC-based release schedule
- [ ] Create puzzle availability API
- [ ] Add countdown timers and time zone handling
- [ ] Build admin tools for puzzle management

**Week 6: Testing & Optimization**
- [ ] Test generation pipeline end-to-end
- [ ] Optimize generation speed and reliability
- [ ] Create fallback mechanisms for failures
- [ ] Monitor and tune generation quality

### Phase 3: Leagues & Competition (Weeks 7-10)
**Week 7: Core League System**
- [ ] Implement league database schema
- [ ] Create league management API
- [ ] Build basic league creation and joining
- [ ] Implement invitation system with codes

**Week 8: Scoring & Leaderboards**
- [ ] Implement multiple scoring algorithms
- [ ] Create leaderboard calculation system
- [ ] Build league statistics and rankings
- [ ] Add competition period handling

**Week 9: Social Features**
- [ ] Create league discovery and search
- [ ] Implement activity feeds
- [ ] Add achievement and badge system
- [ ] Build social sharing features

**Week 10: UI & Polish**
- [ ] Design and implement league interfaces
- [ ] Create leaderboard visualization
- [ ] Add mobile-optimized league features
- [ ] Test social features and competition flow

---

## 5. Technical Considerations

### 5.1 Performance Optimization

#### Database Indexing Strategy
```sql
-- Critical indexes for performance
CREATE INDEX idx_game_sessions_profile_date ON game_sessions(profile_id, completed_at DESC);
CREATE INDEX idx_league_scores_ranking ON league_scores(league_id, score DESC, submission_time);
CREATE INDEX idx_daily_puzzles_availability ON daily_puzzles(board_type_id, puzzle_date, is_active);
```

#### Caching Strategy
```javascript
// Redis caching for frequently accessed data
const cache = {
  leaderboards: 'cache:leaderboard:{leagueId}', // 5 min TTL
  profileStats: 'cache:profile_stats:{profileId}', // 1 hour TTL
  dailyPuzzles: 'cache:daily_puzzle:{boardType}:{date}', // 24 hour TTL
  globalStats: 'cache:global_stats:{date}' // 6 hour TTL
};
```

### 5.2 Security Considerations

#### Profile Access Control
```javascript
// Middleware to verify profile access
function verifyProfileAccess(req, res, next) {
  const { profileId } = req.params;
  const { user } = req.session;
  
  // Check if user owns this profile or is parent
  if (!userOwnsProfile(user.id, profileId)) {
    return res.status(403).json({ error: 'Access denied' });
  }
  
  next();
}
```

#### League Privacy
```javascript
// League access validation
function validateLeagueAccess(req, res, next) {
  const { leagueId } = req.params;
  const { user, activeProfile } = req.session;
  
  if (!isLeagueMember(leagueId, user.id, activeProfile?.id)) {
    return res.status(403).json({ error: 'Not a league member' });
  }
  
  next();
}
```

### 5.3 Scalability Planning

#### Database Sharding Strategy
- **User data**: Shard by user_id for profile and league data
- **Game sessions**: Partition by date for historical data
- **Daily puzzles**: Separate by board_type for parallel generation

#### API Rate Limiting
```javascript
// Rate limiting for different endpoints
const rateLimits = {
  'POST /api/profiles': { max: 10, window: '1h' }, // profile creation
  'POST /api/leagues': { max: 5, window: '1h' }, // league creation  
  'POST /api/game/submit-game': { max: 50, window: '1h' }, // game submission
  'GET /api/leagues/:id': { max: 100, window: '15m' } // leaderboard views
};
```

### 5.4 Monitoring & Analytics

#### Key Metrics to Track
```javascript
const metrics = {
  // User Engagement
  profilesPerUser: 'Average profiles created per parent account',
  activeProfiles: 'Daily/Weekly active profiles',
  familyRetention: 'Family account retention rates',
  
  // League Performance  
  leagueParticipation: 'Percentage of users in leagues',
  leagueRetention: 'League member retention over time',
  competitionEngagement: 'Games played in league vs solo',
  
  // Puzzle Generation
  generationSuccess: 'Daily puzzle generation success rate',
  puzzleQuality: 'User satisfaction with generated content',
  globalParticipation: 'Daily puzzle participation by timezone'
};
```

### 5.5 Mobile Optimization

#### Responsive Design Considerations
- **Profile selection**: Touch-friendly profile cards
- **League leaderboards**: Horizontal scrolling for mobile
- **Daily countdown**: Prominent timer display
- **Quick profile switching**: Header dropdown for easy switching

#### Offline Capability
```javascript
// Service worker for offline puzzle caching
self.addEventListener('fetch', event => {
  if (event.request.url.includes('/api/puzzles/daily')) {
    event.respondWith(
      caches.match(event.request)
        .then(response => response || fetch(event.request))
    );
  }
});
```

---

## 6. Success Metrics & KPIs

### 6.1 Multi-Profile System Success
- **Adoption Rate**: % of accounts with multiple profiles
- **Family Engagement**: Average games per family per week
- **Child Retention**: Return rate for child profiles
- **Profile Switching**: Frequency of profile changes per session

### 6.2 League System Success  
- **League Creation**: New leagues created per week
- **Member Participation**: Average league size and activity
- **Competition Effect**: Increased game frequency in league members
- **Social Sharing**: Invitation click-through and conversion rates

### 6.3 Daily Puzzle Success
- **Generation Reliability**: 99.5% successful daily generation
- **Global Participation**: Players across all time zones
- **Puzzle Quality**: User ratings and completion rates
- **Engagement Lift**: Increased daily active users

---

## 7. Rebrand Implementation Notes

### 7.1 WORDLINKS to WORDSNPICS Migration
As part of implementing these features, the application has been rebranded from WORDLINKS to WORDSNPICS. The following naming updates are required throughout the codebase:

#### Frontend Updates Required
```javascript
// Update component names and references
WORDLINKSGame → WORDSNPICSGame
wordlinks-logo.svg → wordsnpics-logo.svg (asset replacement)
wordlinks.onrender.com → wordsnpics.com (domain updates)

// Database naming conventions
wordlinks.db → wordsnpics.db (if recreating database)
```

#### Meta Tags and SEO Updates
```html
<!-- Update all meta tags, titles, and descriptions -->
<title>WORDSNPICS - Daily Word Puzzle Game</title>
<meta property="og:site_name" content="WORDSNPICS">
<meta name="author" content="WORDSNPICS">
```

#### Domain and URL Updates
```javascript
// Update all hardcoded URLs in:
// - Social sharing messages
// - Email templates  
// - API documentation
// - League invitation links
// - Shareable game results

// Example updates:
"Join our WORDSNPICS league! Use code FWC2024 or click: https://wordsnpics.com/join/FWC2024"
```

#### Variable and Class Naming
```javascript
// Update CSS classes and JavaScript variables
.wordlinks-container → .wordsnpics-container
this.wordlinksGame → this.wordsnpicsGame

// Update API endpoints if needed
/api/wordlinks/ → /api/wordsnpics/ (if applicable)
```

#### Database Content Updates
```sql
-- Update any stored content that references the old brand
UPDATE board_types SET description = REPLACE(description, 'WORDLINKS', 'WORDSNPICS');
UPDATE puzzle_settings SET value = REPLACE(value, 'wordlinks', 'wordsnpics') 
  WHERE key IN ('base_url', 'app_name');
```

### 7.2 Asset Replacement Checklist
- [ ] Update logo files (SVG, PNG variants)
- [ ] Update favicon files
- [ ] Update social media preview images
- [ ] Update any marketing materials
- [ ] Update documentation and help text
- [ ] Update email templates
- [ ] Update error pages (404, 500)

### 7.3 SEO and Analytics
- [ ] Update Google Analytics property name
- [ ] Update search console settings
- [ ] Implement 301 redirects if changing domains
- [ ] Update structured data markup
- [ ] Update sitemap references

---

This specification provides a comprehensive roadmap for transforming WORDSNPICS into a family-friendly, socially competitive platform with automated content generation. The phased approach ensures steady progress while maintaining system stability and user experience quality.