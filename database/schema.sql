-- WordLinks Database Schema

-- Users table
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

-- Game sessions table
CREATE TABLE IF NOT EXISTS game_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT,
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
    word_turns TEXT, -- JSON string of word turn mapping
    turn_history TEXT, -- JSON string of turn history
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL
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

-- Shareable graphics table
CREATE TABLE IF NOT EXISTS shareable_graphics (
    id TEXT PRIMARY KEY,
    game_session_id INTEGER NOT NULL,
    user_id TEXT,
    board_id TEXT NOT NULL,
    graphic_data TEXT NOT NULL, -- JSON containing game results and graphic info
    image_data TEXT, -- Base64 encoded image data
    view_count INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (game_session_id) REFERENCES game_sessions (id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL,
    FOREIGN KEY (board_id) REFERENCES boards (id) ON DELETE CASCADE
);

-- Sessions table for production session storage
CREATE TABLE IF NOT EXISTS sessions (
    sid TEXT PRIMARY KEY,
    sess TEXT NOT NULL,
    expired DATETIME NOT NULL
);

-- Insert default board type
INSERT OR IGNORE INTO board_types (id, name, description, is_premium, is_active) 
VALUES ('daily', 'Daily Board', 'Free daily puzzle for everyone', 0, 1);

-- Indexes for better performance
CREATE INDEX IF NOT EXISTS idx_users_provider ON users (provider, provider_id);
CREATE INDEX IF NOT EXISTS idx_game_sessions_user_id ON game_sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_game_sessions_completed_at ON game_sessions (completed_at);
CREATE INDEX IF NOT EXISTS idx_game_sessions_board_id ON game_sessions (board_id);

-- Board indexes
CREATE INDEX IF NOT EXISTS idx_boards_type_id ON boards (board_type_id);
CREATE INDEX IF NOT EXISTS idx_boards_published ON boards (is_published);
CREATE INDEX IF NOT EXISTS idx_boards_daily ON boards (is_daily, scheduled_date);
CREATE INDEX IF NOT EXISTS idx_puzzle_images_board_id ON puzzle_images (board_id);
CREATE INDEX IF NOT EXISTS idx_puzzle_words_board_id ON puzzle_words (board_id);
CREATE INDEX IF NOT EXISTS idx_puzzle_words_image_id ON puzzle_words (image_id);
CREATE INDEX IF NOT EXISTS idx_shareable_graphics_user_id ON shareable_graphics (user_id);
CREATE INDEX IF NOT EXISTS idx_shareable_graphics_board_id ON shareable_graphics (board_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expired ON sessions (expired);