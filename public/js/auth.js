class AuthManager {
    constructor() {
        this.user = null;
        this.avatarIcons = {
            star: '⭐',
            heart: '❤️', 
            rocket: '🚀',
            crown: '👑',
            diamond: '💎',
            lightning: '⚡',
            flower: '🌸',
            rainbow: '🌈'
        };
        this.init();
    }
    
    async init() {
        await this.checkAuthStatus();
        this.setupEventListeners();
        this.renderUserSection();
        this.handleAuthCallbackMessages();
        
        // Check if we need to redirect to profile selection
        if (window.location.pathname === '/' && this.user) {
            // Only redirect if not explicitly coming from profile page
            const urlParams = new URLSearchParams(window.location.search);
            if (!urlParams.has('fromProfiles')) {
                this.checkProfileSelection();
            }
        }
    }
    
    async checkAuthStatus() {
        try {
            const response = await fetch('/auth/status');
            const data = await response.json();
            this.user = data.user;
            this.activeProfile = data.activeProfile;
        } catch (error) {
            console.error('Error checking auth status:', error);
            this.user = null;
            this.activeProfile = null;
        }
    }
    
    setupEventListeners() {
        // Login modal
        const loginModal = document.getElementById('loginModal');
        const closeLoginModal = document.getElementById('closeLoginModal');
        
        if (closeLoginModal) {
            closeLoginModal.addEventListener('click', () => {
                loginModal.classList.remove('active');
            });
        }
        
        // Close modal when clicking outside
        if (loginModal) {
            loginModal.addEventListener('click', (e) => {
                if (e.target === loginModal) {
                    loginModal.classList.remove('active');
                }
            });
        }
    }
    
    renderUserSection() {
        const userSection = document.getElementById('userSection');
        if (!userSection) return;
        
        if (this.user) {
            // Use active profile if available, otherwise fallback to user
            let displayName, displayAvatar;
            
            if (this.activeProfile) {
                // Use active profile data
                displayName = this.activeProfile.displayName || this.activeProfile.username || this.activeProfile.name;
                displayAvatar = this.activeProfile.avatar; // Image URL if available
                
            } else {
                // Use user account data
                displayName = this.user.name;
                displayAvatar = this.user.avatar;
            }
            
            // Generate avatar HTML
            let avatarHtml;
            if (displayAvatar) {
                // Use image avatar
                avatarHtml = `<img src="${displayAvatar}" alt="${displayName}" class="user-avatar-small">`;
            } else if (this.activeProfile && this.activeProfile.avatarColor) {
                // Use styled profile avatar with icon and color
                const avatarIcon = this.avatarIcons[this.activeProfile.avatarIcon] || '⭐';
                avatarHtml = `<div class="user-avatar-small" style="background-color: ${this.activeProfile.avatarColor}; display: flex; align-items: center; justify-content: center; color: white; font-size: 12px; flex-shrink: 0;">${avatarIcon}</div>`;
            } else {
                // Default avatar placeholder
                avatarHtml = `<div class="avatar-placeholder-small">${displayName.charAt(0).toUpperCase()}</div>`;
            }
            
            // User is logged in - show user menu with updated structure
            userSection.innerHTML = `
                <div class="user-menu">
                    <button id="userMenuBtn" class="user-menu-btn">
                        ${avatarHtml}
                        <span class="user-name-short">${displayName.split(' ')[0]}</span>
                    </button>
                    <div id="userDropdown" class="user-dropdown">
                        <button id="viewHistory" class="dropdown-item">History</button>
                        <button id="viewLeagues" class="dropdown-item">Leagues</button>
                        <div class="dropdown-separator"></div>
                        <button id="changePlayer" class="dropdown-item">Change Player</button>
                        <div class="dropdown-separator"></div>
                        <button id="logoutBtn" class="dropdown-item">Logout</button>
                    </div>
                </div>
            `;
            
            // Add event listeners for user actions
            document.getElementById('logoutBtn')?.addEventListener('click', () => this.logout());
            document.getElementById('viewHistory')?.addEventListener('click', () => this.showHistory());
            document.getElementById('viewLeagues')?.addEventListener('click', () => this.showLeagues());
            document.getElementById('changePlayer')?.addEventListener('click', () => this.showChangePlayer());
            
            // Toggle dropdown
            document.getElementById('userMenuBtn')?.addEventListener('click', (e) => {
                e.stopPropagation();
                const dropdown = document.getElementById('userDropdown');
                dropdown.classList.toggle('show');
            });
            
            // Close dropdown when clicking outside
            document.addEventListener('click', () => {
                document.getElementById('userDropdown')?.classList.remove('show');
            });
            
        } else {
            // User is not logged in - show simple sign in button
            userSection.innerHTML = `
                <button id="loginBtn" class="sign-in-btn">Sign In</button>
            `;
            
            // Add event listener for login button
            document.getElementById('loginBtn')?.addEventListener('click', () => this.showLoginModal());
        }
    }
    
    showLoginModal(gameSessionId = null) {
        const loginModal = document.getElementById('loginModal');
        if (loginModal) {
            // Update the auth links with game session info if provided
            if (gameSessionId) {
                const currentPage = window.location.pathname + window.location.search;
                const authParams = new URLSearchParams({
                    returnTo: currentPage,
                    gameSessionId: gameSessionId
                });
                
                // Update Google auth link
                const googleAuthLink = loginModal.querySelector('a[href="/auth/google"]');
                if (googleAuthLink) {
                    googleAuthLink.href = `/auth/google?${authParams.toString()}`;
                }
            }
            
            loginModal.classList.add('active');
        }
    }
    
    async logout() {
        try {
            const response = await fetch('/auth/logout', {
                method: 'POST'
            });
            
            if (response.ok) {
                this.user = null;
                this.renderUserSection();
                
                // Show logout success message
                this.showMessage('Successfully logged out!', 'success');
            }
        } catch (error) {
            console.error('Logout error:', error);
            this.showMessage('Error logging out. Please try again.', 'error');
        }
    }
    
    async showHistory() {
        // Navigate to the current profile's history page
        if (this.activeProfile && this.activeProfile.username) {
            window.location.href = `/profile/${encodeURIComponent(this.activeProfile.username)}`;
        } else {
            // Fallback to profiles page if no active profile
            window.location.href = '/profiles';
        }
    }
    
    async showChangePlayer() {
        // Navigate to the manage profiles page for profile selection
        window.location.href = '/profiles';
    }
    
    async showLeagues() {
        // Navigate to the leagues page
        window.location.href = '/leagues';
    }

    async checkProfileSelection() {
        try {
            // Check if user has an active profile in session
            const response = await fetch('/auth/status');
            const data = await response.json();
            
            // If authenticated but no active profile, redirect to profile selection
            if (data.authenticated && !data.activeProfile) {
                window.location.href = '/profiles';
                return;
            }
        } catch (error) {
            console.error('Error checking profile selection:', error);
        }
    }
    
    displayProfileModal(profile) {
        // Create and show profile modal
        const existingModal = document.getElementById('profileModal');
        if (existingModal) {
            existingModal.remove();
        }
        
        const modal = document.createElement('div');
        modal.id = 'profileModal';
        modal.className = 'auth-modal active';
        modal.innerHTML = `
            <div class="auth-modal-content profile-modal-content">
                <div class="auth-modal-header">
                    <h2>Your Profile</h2>
                    <button class="auth-modal-close" id="closeProfileModal">&times;</button>
                </div>
                <div class="auth-modal-body">
                    <div class="profile-info">
                        <div class="profile-avatar">
                            ${profile.user.avatar ? 
                                `<img src="${profile.user.avatar}" alt="${profile.user.name}">` : 
                                `<div class="avatar-placeholder large">${profile.user.name.charAt(0).toUpperCase()}</div>`
                            }
                        </div>
                        <h3>${profile.user.name}</h3>
                        <p class="profile-email">${profile.user.email}</p>
                        <p class="profile-provider">Signed in with ${profile.user.provider}</p>
                    </div>
                    
                    <div class="profile-stats">
                        <h4>Game Statistics</h4>
                        <div class="stats-grid">
                            <div class="stat-item">
                                <span class="stat-number">${profile.stats.totalGames}</span>
                                <span class="stat-label">Total Games</span>
                            </div>
                            <div class="stat-item">
                                <span class="stat-number">${profile.stats.completedGames}</span>
                                <span class="stat-label">Completed</span>
                            </div>
                            <div class="stat-item">
                                <span class="stat-number">${profile.stats.winRate}%</span>
                                <span class="stat-label">Win Rate</span>
                            </div>
                            <div class="stat-item">
                                <span class="stat-number">${profile.stats.averageScore}/20</span>
                                <span class="stat-label">Avg Score</span>
                            </div>
                        </div>
                    </div>
                    
                    ${profile.recentGames.length > 0 ? `
                        <div class="recent-games">
                            <h4>Recent Games</h4>
                            <div class="games-list">
                                ${profile.recentGames.slice(0, 5).map(game => `
                                    <div class="game-item">
                                        <div class="game-info">
                                            <span class="game-score">${game.correctWords}/20</span>
                                            <span class="game-date">${new Date(game.completedAt).toLocaleDateString()}</span>
                                        </div>
                                        <div class="game-status ${game.isWin ? 'win' : 'incomplete'}">
                                            ${game.isWin ? '✅' : '⏱️'}
                                        </div>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // Add close event listener
        document.getElementById('closeProfileModal')?.addEventListener('click', () => {
            modal.remove();
        });
        
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.remove();
            }
        });
    }
    
    handleAuthCallbackMessages() {
        const urlParams = new URLSearchParams(window.location.search);
        
        if (urlParams.get('login') === 'success') {
            this.showMessage('Successfully signed in!', 'success');
            // Clean up URL
            window.history.replaceState({}, document.title, window.location.pathname);
            // Refresh auth status
            this.checkAuthStatus().then(() => this.renderUserSection());
        }
        
        if (urlParams.get('error')) {
            const errorType = urlParams.get('error');
            let message = 'Authentication failed. Please try again.';
            
            if (errorType === 'google_auth_failed') {
                message = 'Google sign-in failed. Please try again.';
            } else if (errorType === 'facebook_auth_failed') {
                message = 'Facebook sign-in failed. Please try again.';
            }
            
            this.showMessage(message, 'error');
            // Clean up URL
            window.history.replaceState({}, document.title, window.location.pathname);
        }
    }
    
    showMessage(text, type = 'info') {
        // Create and show a toast message
        const existingToast = document.querySelector('.auth-toast');
        if (existingToast) {
            existingToast.remove();
        }
        
        const toast = document.createElement('div');
        toast.className = `auth-toast auth-toast-${type}`;
        toast.textContent = text;
        
        document.body.appendChild(toast);
        
        // Show toast
        setTimeout(() => toast.classList.add('show'), 100);
        
        // Hide and remove toast
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }
    
    // Method to get current user (for use by other scripts)
    getCurrentUser() {
        return this.user;
    }
}

// Initialize auth manager when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.authManager = new AuthManager();
});