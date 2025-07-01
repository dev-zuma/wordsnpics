/**
 * Individual Profile View Page JavaScript
 * Displays detailed profile information, stats, and game history
 */

class ProfileViewManager {
    constructor() {
        this.profileUsername = null;
        this.profileData = null;
        this.gameHistory = [];
        this.filteredGames = [];
        this.displayedGames = [];
        this.boardTypes = [];
        this.gamesPerPage = 10;
        this.currentPage = 1;
        this.shareableGraphics = null; // Cache for shareable graphics
        this.init();
    }

    async init() {
        try {
            console.log('👤 Profile View Manager initializing...');
            
            // Extract profile username from URL
            this.profileUsername = this.extractProfileUsername();
            if (!this.profileUsername) {
                this.showError('Invalid profile URL');
                return;
            }

            console.log('👤 Profile username:', this.profileUsername);

            // Wait for auth manager to be ready
            await this.waitForAuthManager();
            
            // Check authentication status
            await this.checkAuth();
            
            // Load profile data
            await this.loadProfileData();
            
            // Load board types for filtering
            await this.loadBoardTypes();
            
            // Load game history
            await this.loadGameHistory();
            
            this.setupEventListeners();
            
        } catch (error) {
            console.error('Failed to initialize profile view:', error);
            this.showError('Failed to load profile');
        }
    }

    extractProfileUsername() {
        const path = window.location.pathname;
        const match = path.match(/\/profile\/([^\/]+)/);
        return match ? decodeURIComponent(match[1]) : null;
    }

    async waitForAuthManager() {
        let attempts = 0;
        while (!window.authManager && attempts < 50) {
            await new Promise(resolve => setTimeout(resolve, 100));
            attempts++;
        }
        
        if (window.authManager) {
            console.log('🔐 Auth manager found');
            let authAttempts = 0;
            while (!window.authManager.initialized && authAttempts < 30) {
                await new Promise(resolve => setTimeout(resolve, 100));
                authAttempts++;
            }
        }
    }

    async checkAuth() {
        try {
            if (window.authManager) {
                const user = window.authManager.getCurrentUser();
                const activeProfile = window.authManager.activeProfile;
                
                if (window.authManager.renderUserSection) {
                    window.authManager.renderUserSection();
                }
                
                console.log('🔍 Auth status:', {
                    user: !!user,
                    activeProfile: !!activeProfile
                });
            }
        } catch (error) {
            console.error('Auth check failed:', error);
        }
    }

    async loadProfileData() {
        try {
            const response = await fetch(`/api/profiles/by-username/${encodeURIComponent(this.profileUsername)}`);
            
            if (!response.ok) {
                if (response.status === 404) {
                    throw new Error('Profile not found');
                } else if (response.status === 403) {
                    throw new Error('You do not have permission to view this profile');
                } else {
                    throw new Error('Failed to load profile');
                }
            }
            
            this.profileData = await response.json();
            console.log('👤 Profile data loaded:', this.profileData);
            
            this.displayProfileInfo();
            this.displayStats();
            
        } catch (error) {
            console.error('Failed to load profile data:', error);
            this.showError(error.message);
        }
    }

    async loadBoardTypes() {
        try {
            const response = await fetch('/api/board-types');
            
            if (response.ok) {
                this.boardTypes = await response.json();
                this.populateBoardTypeFilter();
            }
        } catch (error) {
            console.error('Failed to load board types:', error);
        }
    }

    async loadGameHistory() {
        try {
            this.showSection('loadingGames');
            
            const response = await fetch(`/api/profiles/${this.profileData.id}/game-history`);
            
            if (!response.ok) {
                throw new Error('Failed to load game history');
            }
            
            this.gameHistory = await response.json();
            console.log('🎮 Game history loaded:', this.gameHistory);
            
            this.applyFilters();
            this.hideSection('loadingGames');
            
        } catch (error) {
            console.error('Failed to load game history:', error);
            this.hideSection('loadingGames');
            this.showSection('noGamesMessage');
        }
    }

    displayProfileInfo() {
        // Update page title
        document.title = `WORDSNPICS - ${this.profileData.display_name} Profile`;
        
        // Display avatar
        const avatarElement = document.getElementById('profileAvatar');
        avatarElement.style.backgroundColor = this.profileData.avatar_color || '#3498db';
        avatarElement.textContent = this.renderAvatar(this.profileData.avatar_icon, this.profileData.display_name);
        
        // Display name
        document.getElementById('profileName').textContent = this.profileData.display_name;
        
        // Show profile content
        this.hideSection('loadingState');
        this.showSection('profileContent');
    }

    displayStats() {
        const statsGrid = document.getElementById('statsGrid');
        
        // Calculate stats from profile data - 2x2 grid as requested
        const stats = [
            {
                label: 'Games Played',
                value: this.profileData.games_played || 0
            },
            {
                label: 'Games Won',
                value: this.profileData.games_won || 0
            },
            {
                label: 'Win %',
                value: this.profileData.games_played > 0 ? 
                    `${Math.round((this.profileData.games_won || 0) / this.profileData.games_played * 100)}%` : 
                    '0%'
            },
            {
                label: 'Average Score',
                value: this.profileData.average_accuracy ? 
                    `${Math.round(this.profileData.average_accuracy)}/20` : 
                    '0/20'
            }
        ];
        
        statsGrid.innerHTML = stats.map(stat => `
            <div class="stat-card">
                <span class="stat-value">${stat.value}</span>
                <span class="stat-label">${stat.label}</span>
            </div>
        `).join('');
    }

    populateBoardTypeFilter() {
        const filter = document.getElementById('boardTypeFilter');
        
        this.boardTypes.forEach(boardType => {
            const option = document.createElement('option');
            option.value = boardType.id;
            option.textContent = boardType.name;
            filter.appendChild(option);
        });
    }

    applyFilters() {
        const boardTypeFilter = document.getElementById('boardTypeFilter').value;
        const resultFilter = document.getElementById('resultFilter').value;
        
        this.filteredGames = this.gameHistory.filter(game => {
            // Board type filter
            if (boardTypeFilter !== 'all' && game.board_type_id !== boardTypeFilter) {
                return false;
            }
            
            // Result filter
            if (resultFilter === 'wins' && !game.is_win) {
                return false;
            }
            
            if (resultFilter === 'recent') {
                const gameDate = new Date(game.completed_at);
                const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
                if (gameDate < thirtyDaysAgo) {
                    return false;
                }
            }
            
            return true;
        });
        
        // Reset pagination when filters change
        this.currentPage = 1;
        this.displayedGames = [];
        this.displayGameHistory();
    }

    displayGameHistory() {
        const gamesGrid = document.getElementById('gamesGrid');
        const loadMoreContainer = document.getElementById('loadMoreContainer');
        
        if (this.filteredGames.length === 0) {
            gamesGrid.innerHTML = '';
            this.hideSection('loadMoreContainer');
            this.showSection('noGamesMessage');
            return;
        }
        
        this.hideSection('noGamesMessage');
        
        // Show initial games or load more
        const startIndex = (this.currentPage - 1) * this.gamesPerPage;
        const endIndex = startIndex + this.gamesPerPage;
        const gamesToShow = this.filteredGames.slice(0, endIndex);
        
        const gamesHTML = gamesToShow.map(game => {
            return `
                <div class="game-card" data-session-id="${game.session_id}">
                    <div class="game-graphic" id="graphic-${game.id}">
                        <div class="game-graphic-placeholder">🎮</div>
                    </div>
                    <div class="game-info">
                        <div class="game-date">${this.formatDate(game.completed_at)}</div>
                        <div class="game-title">${this.escapeHtml(game.puzzle_title || 'Daily Puzzle')}</div>
                        <div class="game-score ${game.is_win ? 'win' : 'incomplete'}">
                            ${game.correct_words}/${game.total_words} words
                        </div>
                        <div class="game-actions">
                            <button class="game-action-btn view-btn" onclick="profileViewManager.openGameResults('${game.session_id}')">
                                View
                            </button>
                            <button class="game-action-btn share-btn" onclick="profileViewManager.openGameShare('${game.session_id}')">
                                Share
                            </button>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
        
        gamesGrid.innerHTML = gamesHTML;
        
        // Generate mini shareable graphics for each game
        gamesToShow.forEach(game => {
            this.generateMiniGraphic(game);
        });
        
        // Show/hide load more button
        const hasMoreGames = endIndex < this.filteredGames.length;
        if (hasMoreGames) {
            this.showSection('loadMoreContainer');
        } else {
            this.hideSection('loadMoreContainer');
        }
    }

    loadMoreGames() {
        this.currentPage++;
        this.displayGameHistory();
    }

    async generateMiniGraphic(game) {
        try {
            // Make graphics smaller as requested
            const isDesktop = window.innerWidth >= 768;
            const canvasWidth = isDesktop ? 80 : 60;
            const canvasHeight = isDesktop ? 100 : 75;
            
            const canvas = document.createElement('canvas');
            canvas.width = canvasWidth;
            canvas.height = canvasHeight;
            const ctx = canvas.getContext('2d');
            
            // Clear canvas with white background
            ctx.fillStyle = 'white';
            ctx.fillRect(0, 0, canvasWidth, canvasHeight);
            
            // Define turn colors (matching results page)
            const turnColors = {
                1: 'rgba(46, 204, 113, 0.8)',   // Green
                2: 'rgba(255, 235, 59, 0.8)',   // Yellow  
                3: 'rgba(255, 152, 0, 0.8)',    // Orange
                4: 'rgba(100, 181, 246, 0.8)'   // Blue
            };
            
            // Create 4x5 grid (20 cells total) - smaller size
            const gap = isDesktop ? 3 : 2;
            const cellWidth = (canvasWidth - (gap * 5)) / 4;   // 4 columns
            const cellHeight = (canvasHeight - (gap * 6)) / 5; // 5 rows
            
            // Parse word turns data if available
            let wordTurns = {};
            try {
                if (game.word_turns && typeof game.word_turns === 'string') {
                    wordTurns = JSON.parse(game.word_turns);
                }
            } catch (e) {
                console.log('No word turns data for game', game.id);
            }
            
            // Fetch the board data to get the original word order
            let wordPositions = new Array(20).fill(null);
            
            try {
                const response = await fetch(`/api/board/${game.board_id}`);
                if (response.ok) {
                    const boardData = await response.json();
                    
                    // Map word IDs to their original positions (0-19)
                    boardData.words.forEach((word, index) => {
                        const turn = wordTurns[word.id];
                        if (turn) {
                            wordPositions[index] = turn;
                        }
                    });
                } else {
                    console.log('Could not fetch board data, using fallback approach');
                    // Fallback: show pattern grouped by turns  
                    let cellIndex = 0;
                    for (let turn = 1; turn <= 4; turn++) {
                        Object.entries(wordTurns).forEach(([wordId, wordTurn]) => {
                            if (wordTurn === turn && cellIndex < 20) {
                                wordPositions[cellIndex] = turn;
                                cellIndex++;
                            }
                        });
                    }
                }
            } catch (error) {
                console.log('Error fetching board data:', error);
                // Fallback approach if API fails
                let cellIndex = 0;
                for (let turn = 1; turn <= 4; turn++) {
                    Object.entries(wordTurns).forEach(([wordId, wordTurn]) => {
                        if (wordTurn === turn && cellIndex < 20) {
                            wordPositions[cellIndex] = turn;
                            cellIndex++;
                        }
                    });
                }
            }
            
            // Draw the pattern grid showing word positions with their turn colors
            for (let row = 0; row < 5; row++) {
                for (let col = 0; col < 4; col++) {
                    const cellIndex = row * 4 + col;
                    const x = col * (cellWidth + gap) + gap;
                    const y = row * (cellHeight + gap) + gap;
                    
                    // Default cell (unfilled)
                    ctx.fillStyle = '#ecf0f1';
                    ctx.fillRect(x, y, cellWidth, cellHeight);
                    
                    // If this position has a word with a turn, color it
                    const turn = wordPositions[cellIndex];
                    if (turn && turnColors[turn]) {
                        ctx.fillStyle = turnColors[turn];
                        ctx.fillRect(x, y, cellWidth, cellHeight);
                    }
                }
            }
            
            // Replace placeholder with canvas
            const graphicContainer = document.getElementById(`graphic-${game.id}`);
            if (graphicContainer) {
                graphicContainer.innerHTML = '';
                graphicContainer.appendChild(canvas);
            }
        } catch (error) {
            console.error('Error generating mini graphic:', error);
            // Fallback to simple placeholder
            const graphicContainer = document.getElementById(`graphic-${game.id}`);
            if (graphicContainer) {
                graphicContainer.innerHTML = '<div class="game-graphic-placeholder">🎮</div>';
            }
        }
    }

    setupEventListeners() {
        // Filter change listeners
        document.getElementById('boardTypeFilter')?.addEventListener('change', () => {
            this.applyFilters();
        });

        document.getElementById('resultFilter')?.addEventListener('change', () => {
            this.applyFilters();
        });

        // Load more button
        document.getElementById('loadMoreBtn')?.addEventListener('click', () => {
            this.loadMoreGames();
        });
    }

    showSection(sectionId) {
        const element = document.getElementById(sectionId);
        if (element) {
            element.style.display = 'block';
        }
    }

    hideSection(sectionId) {
        const element = document.getElementById(sectionId);
        if (element) {
            element.style.display = 'none';
        }
    }

    showError(message) {
        document.getElementById('errorMessage').textContent = message;
        this.hideSection('loadingState');
        this.hideSection('profileContent');
        this.showSection('errorState');
    }

    renderAvatar(avatarIcon, displayName) {
        // Map icon names to emojis
        const iconMap = {
            'star': '⭐',
            'crown': '👑',
            'rocket': '🚀',
            'fire': '🔥',
            'lightning': '⚡',
            'diamond': '💎',
            'trophy': '🏆',
            'heart': '❤️',
            'smile': '😊',
            'cool': '😎',
            'wizard': '🧙',
            'robot': '🤖',
            'unicorn': '🦄',
            'dragon': '🐉',
            'cat': '🐱',
            'dog': '🐶',
            'flower': '🌸',
            'rainbow': '🌈'
        };
        
        // If avatarIcon is a known icon name, convert to emoji
        if (avatarIcon && iconMap[avatarIcon]) {
            return iconMap[avatarIcon];
        }
        
        // If there's an avatar icon and it looks like an emoji, use it
        if (avatarIcon && avatarIcon.length <= 2 && /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u.test(avatarIcon)) {
            return avatarIcon;
        }
        
        // Otherwise use first letter of display name
        return displayName ? displayName.charAt(0).toUpperCase() : '?';
    }

    formatDate(dateString) {
        const date = new Date(dateString);
        const now = new Date();
        const diffTime = Math.abs(now - date);
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
        
        if (diffDays === 0) {
            return 'Today';
        } else if (diffDays === 1) {
            return 'Yesterday';
        } else if (diffDays < 7) {
            return `${diffDays} days ago`;
        } else {
            return date.toLocaleDateString();
        }
    }

    formatTime(seconds) {
        if (!seconds || seconds === 0) return '-';
        const mins = Math.floor(seconds / 60);
        const secs = Math.round(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    async openGameResults(sessionId) {
        try {
            // Fetch the full results URL from the API
            const response = await fetch(`/api/game/session/${encodeURIComponent(sessionId)}/results-url`);
            if (!response.ok) {
                throw new Error('Failed to generate results URL');
            }
            
            const data = await response.json();
            
            // Navigate to the full results page
            window.location.href = data.resultsUrl;
            
        } catch (error) {
            console.error('Error opening game results:', error);
            // Fallback to session-based approach
            window.location.href = `/results?session=${encodeURIComponent(sessionId)}`;
        }
    }
    
    async openGameShare(sessionId) {
        try {
            // Load shareable graphics for this profile if not already loaded
            if (!this.shareableGraphics) {
                const response = await fetch(`/api/profile-graphics/${this.profileData.id}`);
                if (response.ok) {
                    this.shareableGraphics = await response.json();
                } else {
                    this.shareableGraphics = [];
                }
            }
            
            // Find the most recent shareable graphic for this session
            const matchingGraphic = this.shareableGraphics.find(g => g.session_id === sessionId);
            
            if (matchingGraphic) {
                window.location.href = `/share/${matchingGraphic.id}`;
                return;
            }
            
            // If no shareable graphic exists, show message and redirect to results
            console.log('No shareable graphic found for this game, redirecting to results');
            alert('No shareable graphic available for this game. Taking you to the results page instead.');
            this.openGameResults(sessionId);
            
        } catch (error) {
            console.error('Error opening game share:', error);
            // Fallback to results page
            alert('Unable to load share page. Taking you to the results page instead.');
            this.openGameResults(sessionId);
        }
    }
}

// Global reference for onclick handlers
let profileViewManager;

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    profileViewManager = new ProfileViewManager();
});