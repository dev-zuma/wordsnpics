class ProfilePage {
    constructor() {
        this.currentFilter = 'all';
        this.currentBoardType = 'all';
        this.gameHistory = [];
        this.userProfile = null;
        this.boardTypes = [];
        this.init();
    }
    
    async init() {
        // Initialize auth manager first
        await this.initAuthManager();
        
        // Load board types
        await this.loadBoardTypes();
        
        // Load user profile and games
        await this.loadProfile();
        
        // Setup event listeners
        this.setupEventListeners();
    }
    
    async initAuthManager() {
        // Wait for auth manager to be available and check auth status
        if (window.authManager) {
            await window.authManager.checkAuthStatus();
            window.authManager.renderUserSection();
        }
    }
    
    async loadBoardTypes() {
        try {
            const response = await fetch('/api/board-types');
            if (response.ok) {
                this.boardTypes = await response.json();
                this.renderBoardTypeFilter();
            }
        } catch (error) {
            console.error('Error loading board types:', error);
        }
    }
    
    renderBoardTypeFilter() {
        const selector = document.getElementById('boardTypeFilter');
        if (!selector) return;
        
        selector.innerHTML = `
            <option value="all">All Board Types</option>
            ${this.boardTypes.map(boardType => `
                <option value="${boardType.id}">
                    ${boardType.icon} ${boardType.name}
                </option>
            `).join('')}
        `;
    }
    
    async loadProfile() {
        try {
            const response = await fetch('/auth/profile');
            
            if (!response.ok) {
                // User not authenticated
                this.showLoginPrompt();
                return;
            }
            
            const profileData = await response.json();
            this.userProfile = profileData;
            this.gameHistory = profileData.recentGames || [];
            
            // Debug logging to see what data we're getting
            console.log('Profile data loaded:', {
                totalGames: this.gameHistory.length,
                gamesWithGraphics: this.gameHistory.filter(g => g.shareableGraphicId).length,
                sampleGame: this.gameHistory[0]
            });
            
            this.renderProfile();
            this.renderGameHistory();
            
        } catch (error) {
            console.error('Error loading profile:', error);
            this.showError('Failed to load profile. Please try again.');
        }
    }
    
    renderProfile() {
        if (!this.userProfile) return;
        
        const { user, stats } = this.userProfile;
        
        // Update profile info
        document.getElementById('profileName').textContent = user.name || 'Anonymous User';
        
        // Update avatar
        const avatarContainer = document.getElementById('profileAvatar');
        if (user.avatar) {
            avatarContainer.innerHTML = `<img src="${user.avatar}" alt="${user.name}">`;
        } else {
            // Show initials
            const initials = user.name ? user.name.split(' ').map(n => n[0]).join('').toUpperCase() : 'U';
            avatarContainer.textContent = initials;
        }
        
        // Update stats (2x2 grid)
        const statsContainer = document.getElementById('profileStats');
        statsContainer.innerHTML = `
            <div class="stat-item">
                <span class="stat-number">${stats.totalGames || 0}</span>
                <span class="stat-label">Games</span>
            </div>
            <div class="stat-item">
                <span class="stat-number">${stats.completedGames || 0}</span>
                <span class="stat-label">Wins</span>
            </div>
            <div class="stat-item">
                <span class="stat-number">${stats.winRate || 0}%</span>
                <span class="stat-label">Win Rate</span>
            </div>
            <div class="stat-item">
                <span class="stat-number">${stats.averageScore || 0}</span>
                <span class="stat-label">Avg Score</span>
            </div>
        `;
    }
    
    renderGameHistory() {
        const gamesGrid = document.getElementById('gamesGrid');
        const loadingMessage = document.getElementById('loadingMessage');
        const noGamesMessage = document.getElementById('noGamesMessage');
        
        // Hide loading message
        loadingMessage.style.display = 'none';
        
        // Filter games based on current filter
        const filteredGames = this.filterGames(this.gameHistory);
        
        if (filteredGames.length === 0) {
            noGamesMessage.style.display = 'block';
            gamesGrid.innerHTML = '';
            return;
        }
        
        noGamesMessage.style.display = 'none';
        
        // Render game cards
        gamesGrid.innerHTML = filteredGames.map(game => this.createGameCard(game)).join('');
        
        // Add click listeners for game graphics
        this.setupGameCardListeners();
    }
    
    filterGames(games) {
        let filtered = games;
        
        // Filter by win status
        switch (this.currentFilter) {
            case 'wins':
                filtered = filtered.filter(game => game.is_win);
                break;
            case 'recent':
                filtered = filtered.slice(0, 10);
                break;
        }
        
        // Filter by board type
        if (this.currentBoardType !== 'all') {
            filtered = filtered.filter(game => {
                // Get board type from board ID (assuming board ID contains board type)
                return this.getBoardTypeFromBoardId(game.board_id) === this.currentBoardType;
            });
        }
        
        return filtered;
    }
    
    getBoardTypeFromBoardId(boardId) {
        // For now, all existing games are from 'daily' board type
        // This will need to be enhanced when we have board type information in the game data
        return 'daily';
    }
    
    getBoardTypeName(boardTypeId) {
        const boardType = this.boardTypes.find(bt => bt.id === boardTypeId);
        return boardType ? `${boardType.icon} ${boardType.name}` : boardTypeId;
    }
    
    createGameCard(game) {
        const gameDate = new Date(game.completed_at).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
        
        const isWin = game.is_win;
        const statusClass = isWin ? 'status-win' : 'status-partial';
        const statusText = isWin ? 'Perfect' : 'Partial';
        const scoreClass = isWin ? '' : 'partial';
        
        const boardTypeId = this.getBoardTypeFromBoardId(game.board_id);
        const boardTypeName = this.getBoardTypeName(boardTypeId);
        
        return `
            <div class="game-card" data-game-id="${game.id}">
                <div class="game-graphic-container">
                    ${this.renderGameGraphic(game)}
                </div>
                
                <div class="game-info">
                    <div class="game-header">
                        <span class="game-date">${gameDate}</span>
                    </div>
                    
                    <div class="game-score">
                        <span class="score-display ${scoreClass}">${game.correct_words}/${game.total_words}</span>
                        <span class="game-status ${statusClass}">${statusText}</span>
                    </div>
                    
                    <div class="board-type-info">
                        ${boardTypeName}
                    </div>
                    
                    <div class="game-details">
                        <span>🕒 ${game.turns_used}/${game.max_turns} turns</span>
                        <span>⏱️ ${this.formatTime(game.time_elapsed)}</span>
                    </div>
                </div>
            </div>
        `;
    }
    
    renderGameGraphic(game) {
        // Check if we have a shareable graphic for this game
        if (game.shareableGraphicId) {
            return `
                <div class="game-graphic" onclick="window.open('/share/${game.shareableGraphicId}', '_blank')">
                    <img src="/api/share/${game.shareableGraphicId}/image" 
                         alt="Game Result" 
                         data-shareable-id="${game.shareableGraphicId}"
                         loading="lazy">
                </div>
            `;
        } else {
            // Create a placeholder for games without graphics
            return `
                <div class="game-graphic">
                    <div style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; font-size: 0.8rem; color: var(--shadow);">
                        No Graphic
                    </div>
                </div>
            `;
        }
    }
    
    setupGameCardListeners() {
        // Event listeners are now handled inline with onclick attributes
        // This method is kept for future enhancements if needed
    }
    
    async generateGameGraphic(gameId) {
        try {
            // Find the game in our history
            const game = this.gameHistory.find(g => g.id === gameId);
            if (!game) return;
            
            // You could implement on-demand graphic generation here
            // For now, show a message that the graphic wasn't saved
            alert('This game was played before shareable graphics were available. Play a new game to see result graphics!');
            
        } catch (error) {
            console.error('Error generating game graphic:', error);
        }
    }
    
    setupEventListeners() {
        // Filter buttons
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const filter = e.target.dataset.filter;
                if (filter) {
                    this.setFilter(filter);
                }
            });
        });
        
        // Board type dropdown
        const boardTypeFilter = document.getElementById('boardTypeFilter');
        if (boardTypeFilter) {
            boardTypeFilter.addEventListener('change', (e) => {
                this.setBoardTypeFilter(e.target.value);
            });
        }
        
        // Close login modal
        document.getElementById('closeLoginModal')?.addEventListener('click', () => {
            document.getElementById('loginModal').classList.remove('active');
        });
    }
    
    setFilter(filter) {
        this.currentFilter = filter;
        
        // Update active button
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.classList.remove('active');
            if (btn.dataset.filter === filter) {
                btn.classList.add('active');
            }
        });
        
        // Re-render games
        this.renderGameHistory();
    }
    
    setBoardTypeFilter(boardType) {
        this.currentBoardType = boardType;
        
        // Re-render games
        this.renderGameHistory();
    }
    
    formatTime(timeElapsed) {
        if (!timeElapsed || timeElapsed === 'N/A') return 'N/A';
        
        // If it's already formatted as MM:SS, return as is
        if (typeof timeElapsed === 'string' && timeElapsed.includes(':')) {
            return timeElapsed;
        }
        
        // If it's in seconds, convert to MM:SS
        const totalSeconds = parseInt(timeElapsed);
        if (isNaN(totalSeconds)) return 'N/A';
        
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }
    
    showLoginPrompt() {
        document.getElementById('profileName').textContent = 'Sign In Required';
        
        const statsContainer = document.getElementById('profileStats');
        statsContainer.innerHTML = `
            <button class="filter-btn" onclick="document.getElementById('loginModal').classList.add('active')">
                Sign In to View Profile
            </button>
        `;
        
        document.getElementById('gamesGrid').innerHTML = '';
        document.getElementById('loadingMessage').style.display = 'none';
        document.getElementById('noGamesMessage').innerHTML = `
            <p>Please <a href="#" onclick="document.getElementById('loginModal').classList.add('active')">sign in</a> to view your game history.</p>
        `;
        document.getElementById('noGamesMessage').style.display = 'block';
    }
    
    showError(message) {
        document.getElementById('loadingMessage').textContent = message;
        document.getElementById('loadingMessage').style.display = 'block';
    }
}

// Initialize when page loads
document.addEventListener('DOMContentLoaded', () => {
    new ProfilePage();
});