/**
 * Leagues Page JavaScript
 * Handles league creation, joining, and management
 */

class LeaguesManager {
    constructor() {
        this.user = null;
        this.activeProfile = null;
        this.leagues = [];
        this.boardTypes = [];
        this.init();
    }

    async init() {
        try {
            console.log('🏆 Leagues Manager initializing...');
            
            // Wait for auth manager to be ready
            await this.waitForAuthManager();
            
            await this.checkAuth();
            console.log('🔍 Auth check complete:', { 
                user: !!this.user, 
                activeProfile: !!this.activeProfile,
                profileId: this.activeProfile?.id 
            });
            
            await this.loadBoardTypes();
            
            if (this.activeProfile) {
                console.log('✅ Active profile found, loading league interface');
                await this.loadUserLeagues();
                this.showLeagueInterface();
                
                // Check for direct join link
                const urlParams = new URLSearchParams(window.location.search);
                const joinCode = urlParams.get('join');
                if (joinCode) {
                    this.autoJoinLeague(joinCode);
                }
            } else {
                console.log('❌ No active profile, showing profile message');
                this.showProfileMessage();
            }
            
            this.setupEventListeners();
        } catch (error) {
            console.error('Failed to initialize leagues:', error);
            this.showError('Failed to load leagues page');
        }
    }

    async waitForAuthManager() {
        // Wait for auth manager to be available
        let attempts = 0;
        while (!window.authManager && attempts < 50) {
            await new Promise(resolve => setTimeout(resolve, 100));
            attempts++;
        }
        
        if (window.authManager) {
            console.log('🔐 Auth manager found');
            // Wait for auth manager to complete initialization
            let authAttempts = 0;
            while (!window.authManager.initialized && authAttempts < 30) {
                await new Promise(resolve => setTimeout(resolve, 100));
                authAttempts++;
            }
        } else {
            console.log('⚠️ Auth manager not available, using fallback');
        }
    }

    async checkAuth() {
        try {
            // Use auth manager if available
            if (window.authManager) {
                console.log('🔐 Using auth manager');
                this.user = window.authManager.getCurrentUser();
                this.activeProfile = window.authManager.activeProfile;
                
                console.log('Auth manager state:', {
                    user: !!this.user,
                    activeProfile: !!this.activeProfile,
                    profileId: this.activeProfile?.id,
                    profileName: this.activeProfile?.display_name
                });
                
                // Let auth manager handle user section rendering
                if (window.authManager.renderUserSection) {
                    window.authManager.renderUserSection();
                }
            } else {
                // Fallback to direct API call
                console.log('📡 Using direct API call');
                const response = await fetch('/auth/status');
                const data = await response.json();
                
                console.log('API auth response:', data);
                
                if (!data.authenticated) {
                    console.log('🚫 Not authenticated, redirecting to login');
                    window.location.href = '/auth/google?returnTo=' + encodeURIComponent(window.location.pathname);
                    return;
                }
                
                this.user = data.user;
                this.activeProfile = data.activeProfile;
                
                console.log('Fallback auth state:', {
                    user: !!this.user,
                    activeProfile: !!this.activeProfile,
                    profileId: this.activeProfile?.id
                });
            }
        } catch (error) {
            console.error('Auth check failed:', error);
        }
    }

    async loadBoardTypes() {
        try {
            const response = await fetch('/api/board-types');
            this.boardTypes = await response.json();
            
            // Populate board type selector in create form
            const selector = document.getElementById('boardType');
            selector.innerHTML = '<option value="">All board types</option>' +
                this.boardTypes.map(bt => `<option value="${bt.id}">${bt.icon} ${bt.name}</option>`).join('');
        } catch (error) {
            console.error('Failed to load board types:', error);
        }
    }

    showProfileMessage() {
        document.getElementById('profileMessage').style.display = 'block';
        document.getElementById('leagueActions').style.display = 'none';
        document.getElementById('myLeaguesSection').style.display = 'none';
    }

    showLeagueInterface() {
        document.getElementById('profileMessage').style.display = 'none';
        document.getElementById('leagueActions').style.display = 'block';
        document.getElementById('myLeaguesSection').style.display = 'block';
    }

    setupEventListeners() {
        // Main action buttons
        document.getElementById('createLeagueBtn').addEventListener('click', () => {
            this.showCreateLeagueModal();
        });

        document.getElementById('joinLeagueBtn').addEventListener('click', () => {
            this.showJoinLeagueModal();
        });

        document.getElementById('refreshLeaguesBtn').addEventListener('click', () => {
            this.loadUserLeagues();
        });

        // Modal close buttons
        document.getElementById('closeLeagueModal').addEventListener('click', () => {
            this.hideModal('leagueModal');
        });

        document.getElementById('closeCreateModal').addEventListener('click', () => {
            this.hideModal('createLeagueModal');
        });

        document.getElementById('closeJoinModal').addEventListener('click', () => {
            this.hideModal('joinLeagueModal');
        });

        document.getElementById('closeDiscoverModal').addEventListener('click', () => {
            this.hideModal('discoverModal');
        });

        // Form handlers
        document.getElementById('createLeagueForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleCreateLeague();
        });

        document.getElementById('joinLeagueForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleJoinLeague();
        });

        document.getElementById('cancelCreateBtn').addEventListener('click', () => {
            this.hideModal('createLeagueModal');
        });

        document.getElementById('cancelJoinBtn').addEventListener('click', () => {
            this.hideModal('joinLeagueModal');
        });

        // Search functionality
        document.getElementById('searchBtn').addEventListener('click', () => {
            this.searchPublicLeagues();
        });

        document.getElementById('searchLeagues').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.searchPublicLeagues();
            }
        });

        // League code formatting
        document.getElementById('leagueCode').addEventListener('input', (e) => {
            e.target.value = e.target.value.toUpperCase().slice(0, 6);
        });

        // Modal background click
        document.querySelectorAll('.modal').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    this.hideModal(modal.id);
                }
            });
        });
    }

    async loadUserLeagues() {
        if (!this.activeProfile) return;

        try {
            const grid = document.getElementById('myLeaguesGrid');
            grid.innerHTML = '<div class="loading-message">Loading your leagues...</div>';

            const response = await fetch('/api/leagues/my-leagues');
            
            if (!response.ok) {
                throw new Error('Failed to load leagues');
            }

            const data = await response.json();
            this.leagues = data.leagues;

            if (this.leagues.length === 0) {
                grid.innerHTML = `
                    <div class="empty-message">
                        <h3>No Leagues Yet</h3>
                        <p>Create your first league or join an existing one to get started!</p>
                    </div>
                `;
            } else {
                grid.innerHTML = this.leagues.map(league => this.createLeagueCard(league)).join('');
            }
        } catch (error) {
            console.error('Failed to load user leagues:', error);
            document.getElementById('myLeaguesGrid').innerHTML = 
                '<div class="error-message">Failed to load leagues. Please try again.</div>';
        }
    }

    createLeagueCard(league) {
        const isAdmin = league.is_admin;
        const memberCount = league.member_count || 0;
        const userRank = league.user_rank ? `#${league.user_rank}` : 'Unranked';
        const recentActivity = league.recent_activity || 0;

        return `
            <div class="league-card" onclick="leaguesManager.viewLeague('${league.id}')">
                <div class="league-card-header">
                    <div>
                        <h3 class="league-name">${this.escapeHtml(league.name)}</h3>
                        ${league.description ? `<p class="league-description">${this.escapeHtml(league.description)}</p>` : ''}
                    </div>
                    <div class="league-code">${league.league_code}</div>
                </div>
                
                <div class="league-stats">
                    <div class="league-stat">
                        <span class="stat-value">${memberCount}</span>
                        <span class="stat-label">Members</span>
                    </div>
                    <div class="league-stat">
                        <span class="stat-value">${userRank}</span>
                        <span class="stat-label">Your Rank</span>
                    </div>
                </div>
                
                <div class="league-badges">
                    ${isAdmin ? '<span class="league-badge badge-admin">Admin</span>' : '<span class="league-badge badge-member">Member</span>'}
                    ${league.is_public ? '<span class="league-badge badge-public">Public</span>' : '<span class="league-badge badge-private">Private</span>'}
                </div>
                
                <div class="league-actions-footer">
                    <div class="league-rank">
                        ${recentActivity > 0 ? `${recentActivity} active players` : 'No recent activity'}
                    </div>
                    <button class="view-league-btn" onclick="event.stopPropagation(); leaguesManager.viewLeague('${league.id}')">
                        View Details
                    </button>
                </div>
            </div>
        `;
    }

    showCreateLeagueModal() {
        if (!this.activeProfile) {
            this.showError('Please select an active profile first');
            return;
        }
        
        document.getElementById('createLeagueForm').reset();
        this.showModal('createLeagueModal');
    }

    showJoinLeagueModal() {
        if (!this.activeProfile) {
            this.showError('Please select an active profile first');
            return;
        }
        
        document.getElementById('joinLeagueForm').reset();
        this.showModal('joinLeagueModal');
    }

    async showDiscoverModal() {
        this.showModal('discoverModal');
        await this.searchPublicLeagues();
    }

    async handleCreateLeague() {
        try {
            const formData = new FormData(document.getElementById('createLeagueForm'));
            const leagueData = {
                // Set default values for removed fields
                scoringMethod: 'standard',
                maxMembers: 100,
                isPublic: false
            };
            
            for (let [key, value] of formData.entries()) {
                if (value.trim()) {
                    leagueData[key] = value.trim();
                }
            }

            const response = await fetch('/api/leagues', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(leagueData)
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.message || 'Failed to create league');
            }

            this.hideModal('createLeagueModal');
            this.showSuccess(`League "${result.league.name}" created successfully! League code: ${result.league.league_code}`);
            await this.loadUserLeagues();

        } catch (error) {
            console.error('Failed to create league:', error);
            this.showError(error.message);
        }
    }

    async handleJoinLeague() {
        try {
            const formData = new FormData(document.getElementById('joinLeagueForm'));
            const joinData = {};
            
            for (let [key, value] of formData.entries()) {
                if (value.trim()) {
                    joinData[key] = value.trim();
                }
            }

            const response = await fetch('/api/leagues/join', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(joinData)
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.message || 'Failed to join league');
            }

            this.hideModal('joinLeagueModal');
            this.showSuccess(`Successfully joined "${result.league.name}"!`);
            await this.loadUserLeagues();

        } catch (error) {
            console.error('Failed to join league:', error);
            this.showError(error.message);
        }
    }

    async searchPublicLeagues() {
        try {
            const searchTerm = document.getElementById('searchLeagues').value.trim();
            const resultsContainer = document.getElementById('discoverResults');
            
            resultsContainer.innerHTML = '<div class="loading-message">Searching public leagues...</div>';

            const params = new URLSearchParams();
            if (searchTerm) params.append('search', searchTerm);
            params.append('limit', '20');

            const response = await fetch(`/api/leagues/discover/public?${params}`);
            const data = await response.json();

            if (data.leagues.length === 0) {
                resultsContainer.innerHTML = `
                    <div class="empty-message">
                        <p>No public leagues found${searchTerm ? ` for "${searchTerm}"` : ''}.</p>
                        <p>Try a different search term or create your own league!</p>
                    </div>
                `;
            } else {
                resultsContainer.innerHTML = data.leagues.map(league => this.createDiscoverLeagueCard(league)).join('');
            }

        } catch (error) {
            console.error('Failed to search leagues:', error);
            document.getElementById('discoverResults').innerHTML = 
                '<div class="error-message">Failed to search leagues. Please try again.</div>';
        }
    }

    createDiscoverLeagueCard(league) {
        return `
            <div class="discover-league">
                <div class="discover-league-header">
                    <h4 class="discover-league-name">${this.escapeHtml(league.name)}</h4>
                    <span class="discover-league-members">${league.member_count} members</span>
                </div>
                
                ${league.description ? `<p class="discover-league-description">${this.escapeHtml(league.description)}</p>` : ''}
                
                <div class="discover-league-actions">
                    <span class="discover-league-code">Code: ${league.league_code}</span>
                    <button class="join-discover-btn" onclick="leaguesManager.quickJoinLeague('${league.league_code}')">
                        Quick Join
                    </button>
                </div>
            </div>
        `;
    }

    async quickJoinLeague(leagueCode) {
        try {
            if (!this.activeProfile) {
                this.showError('Please select an active profile first');
                return;
            }

            const response = await fetch('/api/leagues/join', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ leagueCode })
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.message || 'Failed to join league');
            }

            this.hideModal('discoverModal');
            this.showSuccess(`Successfully joined "${result.league.name}"!`);
            await this.loadUserLeagues();

        } catch (error) {
            console.error('Failed to join league:', error);
            this.showError(error.message);
        }
    }

    async viewLeague(leagueId) {
        try {
            // Find the league in our current list to get the league code
            const league = this.leagues.find(l => l.id === leagueId);
            
            if (league && league.league_code) {
                // Navigate to the dedicated league details page
                window.location.href = `/leagues/${league.league_code}`;
            } else {
                // Fallback: try to get league details from API
                const response = await fetch(`/api/leagues/${leagueId}`);
                const data = await response.json();

                if (!response.ok) {
                    throw new Error(data.message || 'Failed to load league details');
                }

                if (data.league && data.league.league_code) {
                    window.location.href = `/leagues/${data.league.league_code}`;
                } else {
                    throw new Error('League code not available');
                }
            }

        } catch (error) {
            console.error('Failed to view league:', error);
            this.showError(error.message);
        }
    }

    showLeagueDetailsModal(data) {
        const { league, leaderboard, userMembership } = data;
        
        document.getElementById('leagueModalTitle').textContent = league.name;
        
        const modalBody = document.getElementById('leagueModalBody');
        modalBody.innerHTML = `
            <div class="league-details">
                <div class="league-info">
                    <h4>League Information</h4>
                    <div class="info-grid">
                        <div class="info-item">
                            <span class="info-value">${league.league_code}</span>
                            <div class="info-label">League Code</div>
                        </div>
                        <div class="info-item">
                            <span class="info-value">${league.member_count}</span>
                            <div class="info-label">Members</div>
                        </div>
                        <div class="info-item">
                            <span class="info-value">${league.scoring_method}</span>
                            <div class="info-label">Scoring</div>
                        </div>
                        <div class="info-item">
                            <span class="info-value">${league.is_public ? 'Public' : 'Private'}</span>
                            <div class="info-label">Visibility</div>
                        </div>
                    </div>
                    ${league.description ? `<p style="margin-top: 1rem; color: #7f8c8d;">${this.escapeHtml(league.description)}</p>` : ''}
                </div>
                
                <div class="leaderboard">
                    <div class="leaderboard-header">
                        <div>Rank</div>
                        <div>Player</div>
                        <div>Score</div>
                        <div>Games</div>
                        <div>Last Played</div>
                    </div>
                    ${leaderboard.slice(0, 10).map(member => `
                        <div class="leaderboard-row">
                            <div class="rank rank-${member.rank}">#${member.rank}</div>
                            <div class="member-info">
                                <div class="member-avatar" style="background-color: ${member.avatar_color || '#3498db'}">
                                    ${member.avatar_icon || member.display_name.charAt(0)}
                                </div>
                                <span class="member-name">${this.escapeHtml(member.nickname || member.display_name)}</span>
                            </div>
                            <div class="score">${member.score || 0}</div>
                            <div class="games-count">${member.games_played || 0}</div>
                            <div class="last-played">${member.last_played ? new Date(member.last_played).toLocaleDateString() : 'Never'}</div>
                        </div>
                    `).join('')}
                </div>
                
                ${userMembership ? `
                    <div style="margin-top: 1rem; text-align: center;">
                        ${userMembership.is_admin ? 
                            '<button class="secondary-btn" onclick="leaguesManager.manageLeague(\'' + league.id + '\')">Manage League</button>' : 
                            '<button class="secondary-btn" onclick="leaguesManager.leaveLeague(\'' + league.id + '\')">Leave League</button>'
                        }
                        <button class="primary-btn" onclick="leaguesManager.shareLeague('${league.id}')">Share League</button>
                    </div>
                ` : ''}
            </div>
        `;
        
        this.showModal('leagueModal');
    }

    async leaveLeague(leagueId) {
        if (!confirm('Are you sure you want to leave this league?')) {
            return;
        }

        try {
            const response = await fetch(`/api/leagues/${leagueId}/leave`, {
                method: 'POST'
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.message || 'Failed to leave league');
            }

            this.hideModal('leagueModal');
            this.showSuccess('Successfully left the league');
            await this.loadUserLeagues();

        } catch (error) {
            console.error('Failed to leave league:', error);
            this.showError(error.message);
        }
    }

    async shareLeague(leagueId) {
        try {
            const response = await fetch(`/api/leagues/${leagueId}/invite`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ inviteMethod: 'link' })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || 'Failed to generate invite');
            }

            // Copy to clipboard
            if (navigator.clipboard) {
                await navigator.clipboard.writeText(data.share_text);
                this.showSuccess('Invite text copied to clipboard!');
            } else {
                // Fallback for older browsers
                prompt('Copy this invite text:', data.share_text);
            }

        } catch (error) {
            console.error('Failed to share league:', error);
            this.showError(error.message);
        }
    }

    // Utility methods
    showModal(modalId) {
        document.getElementById(modalId).style.display = 'flex';
        document.body.style.overflow = 'hidden';
    }

    hideModal(modalId) {
        document.getElementById(modalId).style.display = 'none';
        document.body.style.overflow = 'auto';
    }

    showSuccess(message) {
        // Simple alert for now - in production, use a proper toast system
        alert('Success: ' + message);
    }

    showError(message) {
        // Simple alert for now - in production, use a proper toast system
        alert('Error: ' + message);
    }

    async autoJoinLeague(leagueCode) {
        try {
            // Pre-fill the join form
            document.getElementById('leagueCode').value = leagueCode.toUpperCase();
            this.showJoinLeagueModal();
            
            // Clear the URL parameter
            const url = new URL(window.location);
            url.searchParams.delete('join');
            window.history.replaceState({}, '', url);
        } catch (error) {
            console.error('Failed to auto-join league:', error);
        }
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Initialize when DOM is loaded
let leaguesManager;
document.addEventListener('DOMContentLoaded', () => {
    leaguesManager = new LeaguesManager();
});