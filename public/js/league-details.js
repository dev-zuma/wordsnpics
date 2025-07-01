/**
 * League Details Page JavaScript
 * Handles displaying league information and rankings
 */

class LeagueDetailsManager {
    constructor() {
        this.leagueCode = null;
        this.leagueData = null;
        this.user = null;
        this.activeProfile = null;
        this.rankings = null;
        this.init();
    }

    async init() {
        try {
            console.log('🏆 League Details Manager initializing...');
            
            // Extract league code from URL
            this.leagueCode = this.extractLeagueCode();
            if (!this.leagueCode) {
                this.showError('Invalid league URL');
                return;
            }

            console.log('🏆 League code:', this.leagueCode);

            // Wait for auth manager to be ready
            await this.waitForAuthManager();
            
            // Check authentication status
            await this.checkAuth();
            
            // Load league details and rankings
            await this.loadLeagueDetails();
            await this.loadRankings();
            
            this.setupEventListeners();
            
        } catch (error) {
            console.error('Failed to initialize league details:', error);
            this.showError('Failed to load league details');
        }
    }

    extractLeagueCode() {
        const path = window.location.pathname;
        const match = path.match(/\/leagues\/([A-Z0-9]{6})/);
        return match ? match[1] : null;
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
                this.user = window.authManager.getCurrentUser();
                this.activeProfile = window.authManager.activeProfile;
                
                if (window.authManager.renderUserSection) {
                    window.authManager.renderUserSection();
                }
            } else {
                // Fallback to direct API call
                const response = await fetch('/auth/status');
                const data = await response.json();
                
                if (data.authenticated) {
                    this.user = data.user;
                    this.activeProfile = data.activeProfile;
                }
            }
            
            console.log('🔍 Auth status:', {
                user: !!this.user,
                activeProfile: !!this.activeProfile
            });
            
        } catch (error) {
            console.error('Auth check failed:', error);
        }
    }

    async loadLeagueDetails() {
        try {
            this.showSection('loadingState');
            
            const response = await fetch(`/api/leagues/by-code/${this.leagueCode}`);
            
            if (!response.ok) {
                if (response.status === 404) {
                    throw new Error('League not found');
                } else if (response.status === 403) {
                    throw new Error('You do not have access to this league');
                } else {
                    throw new Error('Failed to load league details');
                }
            }
            
            this.leagueData = await response.json();
            console.log('🏆 League data loaded:', this.leagueData);
            
            this.displayLeagueInfo();
            
        } catch (error) {
            console.error('Failed to load league details:', error);
            this.showError(error.message);
        }
    }

    displayLeagueInfo() {
        document.getElementById('leagueName').textContent = this.leagueData.name;
        document.getElementById('leagueCode').textContent = this.leagueData.league_code;
        document.getElementById('memberCount').textContent = this.leagueData.member_count || 0;

        // Hide loading state and error message
        this.hideSection('loadingState');
        this.hideSection('errorMessage');
        
        this.showSection('leagueInfo');
        this.showSection('leagueActions');
    }

    async loadRankings() {
        try {
            const response = await fetch(`/api/leagues/${this.leagueData.id}/rankings`);
            
            if (!response.ok) {
                throw new Error('Failed to load rankings');
            }
            
            this.rankings = await response.json();
            console.log('📊 Rankings loaded:', this.rankings);
            console.log('📊 Overall rankings data:', this.rankings.overall);
            console.log('📊 Board rankings data:', this.rankings.boards);
            
            this.displayRankings();
            
        } catch (error) {
            console.error('Failed to load rankings:', error);
            // Don't show error for rankings, just log it
            this.displayEmptyRankings();
        }
    }

    displayRankings() {
        // Display overall rankings
        this.displayOverallRankings();
        
        // Display board-specific rankings
        this.displayBoardRankings();
        
        this.showSection('overallRankings');
        this.showSection('boardRankings');
    }

    displayOverallRankings() {
        const overallTable = document.getElementById('overallTable');
        
        if (!this.rankings.overall || this.rankings.overall.length === 0) {
            overallTable.innerHTML = `
                <div class="empty-rankings">
                    <p>No games played yet. Be the first to play and appear on the leaderboard!</p>
                </div>
            `;
            return;
        }

        // Add toggle button for expand/collapse
        const isExpanded = this.isTableExpanded('overall');
        const toggleButton = `
            <div class="table-controls">
                <button class="toggle-table-btn" data-table="overall">
                    ${isExpanded ? 'Collapse' : 'Expand'} View
                </button>
            </div>
        `;

        const tableHTML = `
            ${toggleButton}
            <div class="rankings-header ${isExpanded ? 'expanded' : 'collapsed'}">
                <div class="rank-col">Rank</div>
                <div class="player-col">Player</div>
                <div class="stat-col ${isExpanded ? '' : 'hidden-col'}">Games<br>Played</div>
                <div class="stat-col ${isExpanded ? '' : 'hidden-col'}">Games<br>Won</div>
                <div class="stat-col">Win<br>%</div>
                <div class="stat-col ${isExpanded ? '' : 'hidden-col'}">Words<br>Played</div>
                <div class="stat-col ${isExpanded ? '' : 'hidden-col'}">Words<br>Correct</div>
                <div class="stat-col">Words<br>%</div>
                <div class="stat-col">Avg<br>Time</div>
            </div>
            ${this.rankings.overall.map((player, index) => `
                <div class="rankings-row ${player.is_current_user ? 'current-user' : ''} ${isExpanded ? 'expanded' : 'collapsed'}">
                    <div class="rank-col rank-${index + 1}">#${index + 1}</div>
                    <div class="player-col">
                        <div class="player-avatar" style="background-color: ${player.avatar_color || '#3498db'}">
                            ${this.renderAvatar(player.avatar_icon, player.display_name)}
                        </div>
                        <span class="player-name">${this.escapeHtml(player.nickname || player.display_name)}</span>
                    </div>
                    <div class="stat-col ${isExpanded ? '' : 'hidden-col'}">${player.games_played || 0}</div>
                    <div class="stat-col ${isExpanded ? '' : 'hidden-col'}">${player.games_won || 0}</div>
                    <div class="stat-col">${this.formatPercentage(player.win_percentage)}</div>
                    <div class="stat-col ${isExpanded ? '' : 'hidden-col'}">${player.words_played || 0}</div>
                    <div class="stat-col ${isExpanded ? '' : 'hidden-col'}">${player.words_correct || 0}</div>
                    <div class="stat-col">${this.formatPercentage(player.word_percentage)}</div>
                    <div class="stat-col">${player.avg_time || '-'}</div>
                </div>
            `).join('')}
        `;
        
        overallTable.innerHTML = tableHTML;
    }

    displayBoardRankings() {
        const boardRankings = document.getElementById('boardRankings');
        
        if (!this.rankings.boards || Object.keys(this.rankings.boards).length === 0) {
            boardRankings.innerHTML = `
                <div class="leagues-section">
                    <div class="section-header">
                        <h3>Board-Specific Rankings</h3>
                    </div>
                    <div class="empty-rankings">
                        <p>No board-specific data available yet.</p>
                    </div>
                </div>
            `;
            return;
        }

        const boardHTML = Object.entries(this.rankings.boards).map(([boardType, players]) => {
            const isExpanded = this.isTableExpanded(boardType);
            const toggleButton = `
                <div class="table-controls">
                    <button class="toggle-table-btn" data-table="${boardType}">
                        ${isExpanded ? 'Collapse' : 'Expand'} View
                    </button>
                </div>
            `;
            
            return `
                <div class="leagues-section">
                    <div class="section-header">
                        <h3>${this.formatBoardType(boardType)} Rankings</h3>
                        <span class="section-subtitle">${players.length} players</span>
                    </div>
                    ${toggleButton}
                    <div class="rankings-table-container">
                        <div class="rankings-table">
                            <div class="rankings-header ${isExpanded ? 'expanded' : 'collapsed'}">
                                <div class="rank-col">Rank</div>
                                <div class="player-col">Player</div>
                                <div class="stat-col ${isExpanded ? '' : 'hidden-col'}">Games<br>Played</div>
                                <div class="stat-col ${isExpanded ? '' : 'hidden-col'}">Games<br>Won</div>
                                <div class="stat-col">Win<br>%</div>
                                <div class="stat-col ${isExpanded ? '' : 'hidden-col'}">Words<br>Played</div>
                                <div class="stat-col ${isExpanded ? '' : 'hidden-col'}">Words<br>Correct</div>
                                <div class="stat-col">Words<br>%</div>
                                <div class="stat-col">Avg<br>Time</div>
                            </div>
                            ${players.map((player, index) => `
                                <div class="rankings-row ${player.is_current_user ? 'current-user' : ''} ${isExpanded ? 'expanded' : 'collapsed'}">
                                    <div class="rank-col rank-${index + 1}">#${index + 1}</div>
                                    <div class="player-col">
                                        <div class="player-avatar" style="background-color: ${player.avatar_color || '#3498db'}">
                                            ${this.renderAvatar(player.avatar_icon, player.display_name)}
                                        </div>
                                        <span class="player-name">${this.escapeHtml(player.nickname || player.display_name)}</span>
                                    </div>
                                    <div class="stat-col ${isExpanded ? '' : 'hidden-col'}">${player.games_played || 0}</div>
                                    <div class="stat-col ${isExpanded ? '' : 'hidden-col'}">${player.games_won || 0}</div>
                                    <div class="stat-col">${this.formatPercentage(player.win_percentage)}</div>
                                    <div class="stat-col ${isExpanded ? '' : 'hidden-col'}">${player.words_played || 0}</div>
                                    <div class="stat-col ${isExpanded ? '' : 'hidden-col'}">${player.words_correct || 0}</div>
                                    <div class="stat-col">${this.formatPercentage(player.word_percentage)}</div>
                                    <div class="stat-col">${player.avg_time || '-'}</div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                </div>
            `;
        }).join('');
        
        boardRankings.innerHTML = boardHTML;
    }

    displayEmptyRankings() {
        const overallTable = document.getElementById('overallTable');
        overallTable.innerHTML = `
            <div class="empty-rankings">
                <p>No games played yet. Be the first to play and appear on the leaderboard!</p>
            </div>
        `;
        
        const boardRankings = document.getElementById('boardRankings');
        boardRankings.innerHTML = `
            <div class="leagues-section">
                <div class="section-header">
                    <h3>Board-Specific Rankings</h3>
                </div>
                <div class="empty-rankings">
                    <p>No board-specific data available yet.</p>
                </div>
            </div>
        `;
        
        this.showSection('overallRankings');
        this.showSection('boardRankings');
    }

    async shareLeague() {
        try {
            const shareUrl = `${window.location.origin}/join/${this.leagueCode}`;
            
            // Populate share modal
            document.getElementById('shareCode').value = this.leagueCode;
            document.getElementById('shareLink').value = shareUrl;
            
            this.showModal('shareModal');
            
        } catch (error) {
            console.error('Failed to share league:', error);
            this.showError('Failed to generate share information');
        }
    }

    async leaveLeague() {
        if (!confirm('Are you sure you want to leave this league?')) {
            return;
        }

        try {
            const response = await fetch(`/api/leagues/${this.leagueData.id}/leave`, {
                method: 'POST'
            });

            if (!response.ok) {
                throw new Error('Failed to leave league');
            }

            // Redirect to leagues page
            window.location.href = '/leagues';
            
        } catch (error) {
            console.error('Failed to leave league:', error);
            this.showError('Failed to leave league');
        }
    }

    setupEventListeners() {
        // Share league
        document.getElementById('shareLeagueBtn')?.addEventListener('click', () => {
            this.shareLeague();
        });

        // Leave league
        document.getElementById('leaveLeagueBtn')?.addEventListener('click', () => {
            this.leaveLeague();
        });

        // Share modal
        document.getElementById('closeShareModal')?.addEventListener('click', () => {
            this.hideModal('shareModal');
        });

        // Copy buttons
        document.getElementById('copyCodeBtn')?.addEventListener('click', () => {
            this.copyToClipboard('shareCode', 'League code copied!');
        });

        document.getElementById('copyLinkBtn')?.addEventListener('click', () => {
            this.copyToClipboard('shareLink', 'Invitation link copied!');
        });

        // Modal background click
        document.getElementById('shareModal')?.addEventListener('click', (e) => {
            if (e.target.id === 'shareModal') {
                this.hideModal('shareModal');
            }
        });

        // Table toggle functionality
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('toggle-table-btn')) {
                const tableId = e.target.getAttribute('data-table');
                this.toggleTable(tableId);
            }
        });
    }

    async copyToClipboard(inputId, message) {
        try {
            const input = document.getElementById(inputId);
            await navigator.clipboard.writeText(input.value);
            
            // Simple feedback
            const button = inputId === 'shareCode' ? 
                document.getElementById('copyCodeBtn') : 
                document.getElementById('copyLinkBtn');
            
            const originalText = button.textContent;
            button.textContent = 'Copied!';
            button.style.background = 'var(--success)';
            
            setTimeout(() => {
                button.textContent = originalText;
                button.style.background = '';
            }, 2000);
            
        } catch (error) {
            console.error('Failed to copy to clipboard:', error);
            // Fallback
            const input = document.getElementById(inputId);
            input.select();
            document.execCommand('copy');
        }
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

    showModal(modalId) {
        document.getElementById(modalId).style.display = 'flex';
        document.body.style.overflow = 'hidden';
    }

    hideModal(modalId) {
        document.getElementById(modalId).style.display = 'none';
        document.body.style.overflow = 'auto';
    }

    showError(message) {
        console.error('📝 Showing error:', message);
        document.getElementById('errorText').textContent = message;
        
        // Hide loading and other sections but keep league info if it exists
        this.hideSection('loadingState');
        this.hideSection('overallRankings');
        this.hideSection('boardRankings');
        
        // Only show error message, keep league info and actions if they're already shown
        document.getElementById('errorMessage').style.display = 'block';
    }

    formatPercentage(value) {
        if (value === null || value === undefined) return '-';
        return `${Math.round(value)}%`;
    }


    formatBoardType(boardType) {
        return boardType.replace(/[-_]/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
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
            'dog': '🐶'
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

    isTableExpanded(tableId) {
        // Default to collapsed state, use localStorage to persist state
        const storageKey = `league_table_${tableId}_expanded`;
        return localStorage.getItem(storageKey) === 'true';
    }

    toggleTable(tableId) {
        const isExpanded = this.isTableExpanded(tableId);
        const storageKey = `league_table_${tableId}_expanded`;
        
        // Toggle state
        localStorage.setItem(storageKey, (!isExpanded).toString());
        
        // Re-render the appropriate table
        if (tableId === 'overall') {
            this.displayOverallRankings();
        } else {
            this.displayBoardRankings();
        }
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new LeagueDetailsManager();
});