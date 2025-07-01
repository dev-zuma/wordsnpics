-- WORDSNPICS Database Schema with Multi-Profile Support

-- Users table (parent account holders)
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    provider TEXT NOT NULL,
    provider_id TEXT NOT NULL,
    name TEXT NOT NULL,
    email TEXT,
    avatar TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(provider, provider_id)
);

-- Profiles table for family members
CREATE TABLE IF NOT EXISTS profiles (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    username VARCHAR(50) NOT NULL UNIQUE,
    display_name VARCHAR(100) NOT NULL,
    avatar_color VARCHAR(7) DEFAULT '#3498db',
    avatar_icon VARCHAR(50) DEFAULT 'star',
    birth_year INTEGER,
    is_default BOOLEAN DEFAULT false,
    is_child BOOLEAN DEFAULT true,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_username UNIQUE(username),
    CONSTRAINT valid_avatar_color CHECK(avatar_color GLOB '#[0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f]')
);

-- Profile statistics (derived from game_sessions but cached for performance)
CREATE TABLE IF NOT EXISTS profile_stats (
    profile_id TEXT PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
    games_played INTEGER DEFAULT 0,
    games_won INTEGER DEFAULT 0,
    best_time TEXT,
    best_turn_count INTEGER DEFAULT 4,
    average_accuracy REAL DEFAULT 0.0,
    total_play_time INTEGER DEFAULT 0,
    current_streak INTEGER DEFAULT 0,
    longest_streak INTEGER DEFAULT 0,
    last_played DATETIME,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Game sessions table (updated for profiles)
CREATE TABLE IF NOT EXISTS game_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    profile_id TEXT REFERENCES profiles(id) ON DELETE SET NULL,
    session_id TEXT NOT NULL,
    board_id TEXT NOT NULL,
    puzzle_date TEXT,
    puzzle_title TEXT,
    correct_words INTEGER NOT NULL DEFAULT 0,
    total_words INTEGER NOT NULL DEFAULT 20,
    turns_used INTEGER NOT NULL,
    max_turns INTEGER NOT NULL DEFAULT 4,
    time_elapsed TEXT NOT NULL,
    is_win BOOLEAN NOT NULL DEFAULT 0,
    completed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    word_turns TEXT,
    turn_history TEXT
);

-- Game progress table for in-progress games
CREATE TABLE IF NOT EXISTS game_progress (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
    profile_id TEXT REFERENCES profiles(id) ON DELETE CASCADE,
    session_id TEXT UNIQUE NOT NULL,
    board_id TEXT NOT NULL,
    current_turn INTEGER NOT NULL DEFAULT 1,
    correct_words TEXT, -- JSON array of correct word IDs
    word_turns TEXT, -- JSON object mapping word IDs to turn numbers
    turn_history TEXT, -- JSON array of completed turn results
    current_placements TEXT, -- JSON object of current turn placements
    start_time DATETIME NOT NULL,
    last_saved DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (board_id) REFERENCES boards (id) ON DELETE CASCADE
);

-- Board types table
CREATE TABLE IF NOT EXISTS board_types (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    icon TEXT,
    one_liner TEXT,
    prompt TEXT,
    description TEXT,
    is_premium BOOLEAN NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Boards table (individual puzzle boards)
CREATE TABLE IF NOT EXISTS boards (
    id TEXT PRIMARY KEY,
    board_type_id TEXT NOT NULL,
    title TEXT NOT NULL,
    date TEXT NOT NULL,
    difficulty TEXT DEFAULT 'medium',
    is_published BOOLEAN NOT NULL DEFAULT 0,
    is_daily BOOLEAN NOT NULL DEFAULT 0,
    scheduled_date DATE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (board_type_id) REFERENCES board_types (id)
);

-- Puzzle images table
CREATE TABLE IF NOT EXISTS puzzle_images (
    id TEXT PRIMARY KEY,
    board_id TEXT NOT NULL,
    theme TEXT NOT NULL,
    narrative TEXT,
    match_count INTEGER NOT NULL,
    url TEXT,
    sort_order INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (board_id) REFERENCES boards (id) ON DELETE CASCADE
);

-- Puzzle words table
CREATE TABLE IF NOT EXISTS puzzle_words (
    id TEXT PRIMARY KEY,
    board_id TEXT NOT NULL,
    image_id TEXT NOT NULL,
    text TEXT NOT NULL,
    difficulty TEXT DEFAULT 'Medium',
    sort_order INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (board_id) REFERENCES boards (id) ON DELETE CASCADE,
    FOREIGN KEY (image_id) REFERENCES puzzle_images (id) ON DELETE CASCADE
);

-- Shareable graphics table (updated for profiles)
CREATE TABLE IF NOT EXISTS shareable_graphics (
    id TEXT PRIMARY KEY,
    game_session_id INTEGER NOT NULL,
    user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    profile_id TEXT REFERENCES profiles(id) ON DELETE SET NULL,
    board_id TEXT NOT NULL,
    graphic_data TEXT NOT NULL,
    image_data TEXT,
    view_count INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (game_session_id) REFERENCES game_sessions (id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL,
    FOREIGN KEY (profile_id) REFERENCES profiles (id) ON DELETE SET NULL,
    FOREIGN KEY (board_id) REFERENCES boards (id) ON DELETE CASCADE
);

-- Sessions table for production session storage
CREATE TABLE IF NOT EXISTS sessions (
    sid TEXT PRIMARY KEY,
    sess TEXT NOT NULL,
    expired DATETIME NOT NULL
);

-- Leagues table for future Phase 3 implementation
CREATE TABLE IF NOT EXISTS leagues (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    name VARCHAR(100) NOT NULL,
    description TEXT,
    creator_user_id TEXT NOT NULL REFERENCES users(id),
    league_code VARCHAR(10) UNIQUE NOT NULL,
    is_public BOOLEAN DEFAULT false,
    scoring_method VARCHAR(20) DEFAULT 'standard',
    competition_type VARCHAR(20) DEFAULT 'ongoing',
    board_type_id TEXT REFERENCES board_types(id),
    max_members INTEGER DEFAULT 50,
    start_date DATE,
    end_date DATE,
    is_active BOOLEAN DEFAULT true,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- League memberships for future Phase 3 implementation
CREATE TABLE IF NOT EXISTS league_members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    league_id TEXT NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    profile_id TEXT REFERENCES profiles(id) ON DELETE CASCADE,
    joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    is_admin BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    nickname VARCHAR(50),
    UNIQUE(league_id, user_id, profile_id)
);

-- Daily puzzle schedule for future Phase 2 implementation
CREATE TABLE IF NOT EXISTS daily_puzzles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    board_type_id TEXT NOT NULL REFERENCES board_types(id),
    puzzle_date DATE NOT NULL,
    board_id TEXT NOT NULL REFERENCES boards(id),
    release_time DATETIME NOT NULL,
    is_active BOOLEAN DEFAULT true,
    generation_status VARCHAR(20) DEFAULT 'pending',
    generation_log TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(board_type_id, puzzle_date)
);

-- Insert default board types (8 curated boards only)
INSERT OR IGNORE INTO board_types (id, name, icon, one_liner, prompt, description, is_premium, is_active) 
VALUES 
    ('americana', 'Americana', '🇺🇸', 'Road trips, slang, diners, and red-white-blue nostalgia.', 'Create challenging Americana-themed puzzle groups that require deeper knowledge of American culture, history, and society. Focus on:

- Historical events, figures, and periods that shaped America
- Cultural movements, traditions, and regional characteristics
- Political systems, founding principles, and constitutional concepts
- American innovations, landmarks, and symbols with cultural significance
- Entertainment, sports, and artistic contributions that define American identity

Make the connections more sophisticated and require cultural knowledge beyond surface-level recognition. Include some lesser-known but important elements alongside well-known ones. Each group should test understanding of American heritage rather than just recognition of American things.

Difficulty should be elevated with connections that require historical context, cultural awareness, or deeper knowledge of American society and values.', 'Road trips, slang, diners, and red-white-blue nostalgia.', 0, 1),
    ('animal-kingdom', 'Animal Kingdom', '🐾', 'From the savannah to your backyard — all things wild, cute, and crawly.', 'For this topic, go beyond just animal names or categories. Choose themes that explore unique animal behaviors, traits, habitats, survival strategies, diets, adaptations, or evolutionary quirks. Each theme should be conceptually rich — for example: "Nocturnal Hunters," "Built to Fly," "Desert Survivors," "Animal Architects," or "Colorful Defenses." Words should represent concepts or features tied to how animals live, move, survive, or interact with the world — not just the animals themselves.', 'From the savannah to your backyard — all things wild, cute, and crawly.', 0, 1),
    ('historical-figures', 'Historical Figures', '👑', 'Inventors, leaders, rebels, and thinkers who shaped the world.', 'Create groups centered around historical figures who have shaped human civilization. Focus on leaders, inventors, artists, scientists, writers, and revolutionaries from different eras and cultures. Group them by time period, field of influence, geographic region, or shared characteristics. Include both well-known and lesser-known but important historical figures.', 'Inventors, leaders, rebels, and thinkers who shaped the world.', 0, 1),
    ('mind-benders', 'Mind-Benders', '🧠', 'Twisted wordplay, logic leaps, and aha! moments that bend your brain.', 'Create intellectually challenging puzzle groups that require lateral thinking and clever word associations. Focus on wordplay, puns, double meanings, anagrams, and conceptual connections that are not immediately obvious. Include riddles, brain teasers, and connections that require thinking outside the box.', 'Twisted wordplay, logic leaps, and aha! moments that bend your brain.', 0, 1),
    ('startup', 'Startup', '🚀', 'Pitch decks, jargon, and founder vibes from MVP to Series Z.', 'Create groups related to startup culture, entrepreneurship, and business innovation. Include terms related to funding, business models, technology trends, corporate culture, and the startup ecosystem. Cover everything from early-stage concepts to scale-up challenges.', 'Pitch decks, jargon, and founder vibes from MVP to Series Z.', 0, 1),
    ('the-download', 'The Download', '📥', 'Today''s top tech decoded into words.', 'For this topic, select themes based on current technology trends, innovations, and digital culture. This includes artificial intelligence, emerging hardware, futuristic transportation, social platforms, data privacy, Web3, software tools, robotics, and other fast-evolving ideas shaping the tech world. Aim for a fun, accessible blend of terms — some widely known, some surprising — that reflect the pace and impact of modern tech.', 'Today''s top tech decoded into words.', 0, 1),
    ('wordsnpics-daily', 'WordsNPics Daily', '🧩', 'Your go-to grid of clever connections, fresh every day.', 'Distinct and broad conceptual themes that are interesting and accessible to a wide audience aged 10 years and older.', 'Your go-to grid of clever connections, fresh every day.', 0, 1),
    ('world-watch', 'World Watch', '🌍', 'Politics, pop culture, and global events — stay sharp with what''s shaping the world.', 'For this topic, generate themes and word groups based on major global events, political shifts, cultural movements, and social changes that are actively unfolding or trending in the last 7 days. Use news headlines and global media coverage as inspiration. Focus on contemporary relevance — such as international elections, diplomatic tensions, protests, climate summits, tech regulation, viral movements, or sports/political controversies. Themes should still be conceptually clean (e.g., "Heat Waves Across Europe" or "Tech Layoffs") but rooted in what is happening now. The words should connect strongly to this context, helping players link familiar headlines to key ideas.', 'Politics, pop culture, and global events — stay sharp with what''s shaping the world.', 0, 1);

-- Indexes for better performance
CREATE INDEX IF NOT EXISTS idx_users_provider ON users (provider, provider_id);
CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_profiles_username ON profiles(username);
CREATE INDEX IF NOT EXISTS idx_profile_stats_games_played ON profile_stats(games_played DESC);

CREATE INDEX IF NOT EXISTS idx_game_sessions_user_id ON game_sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_game_sessions_profile_id ON game_sessions(profile_id);
CREATE INDEX IF NOT EXISTS idx_game_sessions_completed_at ON game_sessions (completed_at);
CREATE INDEX IF NOT EXISTS idx_game_sessions_board_id ON game_sessions (board_id);

CREATE INDEX IF NOT EXISTS idx_game_progress_session_id ON game_progress (session_id);
CREATE INDEX IF NOT EXISTS idx_game_progress_user_id ON game_progress (user_id);
CREATE INDEX IF NOT EXISTS idx_game_progress_profile_id ON game_progress (profile_id);
CREATE INDEX IF NOT EXISTS idx_game_progress_board_id ON game_progress (board_id);

CREATE INDEX IF NOT EXISTS idx_boards_type_id ON boards (board_type_id);
CREATE INDEX IF NOT EXISTS idx_boards_published ON boards (is_published);
CREATE INDEX IF NOT EXISTS idx_boards_daily ON boards (is_daily, scheduled_date);
CREATE INDEX IF NOT EXISTS idx_puzzle_images_board_id ON puzzle_images (board_id);
CREATE INDEX IF NOT EXISTS idx_puzzle_words_board_id ON puzzle_words (board_id);
CREATE INDEX IF NOT EXISTS idx_puzzle_words_image_id ON puzzle_words (image_id);

CREATE INDEX IF NOT EXISTS idx_shareable_graphics_user_id ON shareable_graphics (user_id);
CREATE INDEX IF NOT EXISTS idx_shareable_graphics_profile_id ON shareable_graphics(profile_id);
CREATE INDEX IF NOT EXISTS idx_shareable_graphics_board_id ON shareable_graphics (board_id);

CREATE INDEX IF NOT EXISTS idx_sessions_expired ON sessions (expired);
CREATE INDEX IF NOT EXISTS idx_leagues_code ON leagues(league_code);
CREATE INDEX IF NOT EXISTS idx_league_members_league ON league_members(league_id);
CREATE INDEX IF NOT EXISTS idx_daily_puzzles_date_type ON daily_puzzles(puzzle_date, board_type_id);