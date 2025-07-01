/**
 * Join League Flow Handler
 * Handles the complete signup/join flow for league invitations
 */

class JoinLeagueManager {
    constructor() {
        this.leagueCode = null;
        this.leagueData = null;
        this.user = null;
        this.activeProfile = null;
        this.profiles = [];
        this.init();
    }

    async init() {
        try {
            console.log('🔗 Join League Manager initializing...');
            
            // Extract league code from URL
            this.leagueCode = this.extractLeagueCode();
            if (!this.leagueCode) {
                this.showError('Invalid league invitation link');
                return;
            }

            console.log('🏆 League code:', this.leagueCode);

            // Wait for auth manager to be ready
            await this.waitForAuthManager();
            
            // Check authentication status
            await this.checkAuth();
            
            // Load league information
            await this.loadLeagueInfo();
            
            // Determine next step based on auth status
            await this.determineNextStep();
            
            this.setupEventListeners();
            
        } catch (error) {
            console.error('Failed to initialize join flow:', error);
            this.showError('Failed to load league invitation');
        }
    }

    extractLeagueCode() {
        const path = window.location.pathname;
        const match = path.match(/\/join\/([A-Z0-9]{6})/);
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

    async loadLeagueInfo() {
        try {
            this.showSection('loadingState');
            
            const response = await fetch(`/api/leagues/public/${this.leagueCode}`);
            
            if (!response.ok) {
                if (response.status === 404) {
                    throw new Error('League not found. The invitation link may be invalid or expired.');
                } else {
                    throw new Error('Failed to load league information');
                }
            }
            
            this.leagueData = await response.json();
            console.log('🏆 League data loaded:', this.leagueData);
            
            // Populate league info
            document.getElementById('leagueName').textContent = this.leagueData.name;
            document.getElementById('leagueDescription').textContent = 
                this.leagueData.description || 'No description provided';
            document.getElementById('memberCount').textContent = this.leagueData.member_count || 0;
            document.getElementById('leagueType').textContent = 
                this.leagueData.is_public ? 'Public' : 'Private';
            
            this.showSection('leagueInfo');
            
        } catch (error) {
            console.error('Failed to load league info:', error);
            this.showError(error.message);
        }
    }

    async determineNextStep() {
        if (!this.user) {
            // Scenario 2: New user - show authentication
            this.showAuthRequired();
        } else if (!this.activeProfile) {
            // Scenario 1: Existing user without active profile - show profile selection
            await this.loadUserProfiles();
            this.showProfileSelection();
        } else {
            // User is ready to join - show confirmation
            this.showJoinConfirmation();
        }
    }

    showAuthRequired() {
        this.showSection('authRequired');
        
        // Set up sign-in button with return URL
        const signInBtn = document.getElementById('signInBtn');
        const returnUrl = encodeURIComponent(window.location.pathname);
        signInBtn.href = `/auth/google?returnTo=${returnUrl}`;
    }

    async loadUserProfiles() {
        try {
            const response = await fetch('/api/profiles');
            const data = await response.json();
            this.profiles = data.profiles || [];
            console.log('👤 User profiles loaded:', this.profiles.length);
        } catch (error) {
            console.error('Failed to load user profiles:', error);
            this.profiles = [];
        }
    }

    showProfileSelection() {
        const profileList = document.getElementById('profileList');
        
        if (this.profiles.length === 0) {
            profileList.innerHTML = `
                <div class="no-profiles">
                    <p>You don't have any profiles yet. Create your first profile to join leagues!</p>
                </div>
            `;
        } else {
            profileList.innerHTML = this.profiles.map(profile => `
                <div class="profile-option" data-profile-id="${profile.id}">
                    <div class="profile-avatar" style="background-color: ${profile.avatar_color || '#3498db'}">
                        ${profile.avatar_icon || profile.display_name.charAt(0)}
                    </div>
                    <div class="profile-info">
                        <div class="profile-name">${this.escapeHtml(profile.display_name)}</div>
                        <div class="profile-stats">${profile.games_played || 0} games played</div>
                    </div>
                    <button class="select-profile-btn" data-profile-id="${profile.id}">Select</button>
                </div>
            `).join('');
        }
        
        this.showSection('profileSelection');
    }

    showJoinConfirmation() {
        const profileName = this.activeProfile ? this.activeProfile.display_name : 'Unknown';
        document.getElementById('selectedProfileName').textContent = profileName;
        this.showSection('joinConfirmation');
    }

    async selectProfile(profileId) {
        try {
            const response = await fetch('/api/profiles/activate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ profileId })
            });

            if (!response.ok) {
                throw new Error('Failed to activate profile');
            }

            const data = await response.json();
            this.activeProfile = data.activeProfile;
            
            // Update auth manager
            if (window.authManager) {
                window.authManager.activeProfile = this.activeProfile;
                window.authManager.renderUserSection();
            }
            
            console.log('✅ Profile activated:', this.activeProfile.display_name);
            this.showJoinConfirmation();
            
        } catch (error) {
            console.error('Failed to select profile:', error);
            this.showError('Failed to select profile');
        }
    }

    async joinLeague() {
        try {
            const nickname = document.getElementById('nickname').value.trim();
            
            const joinData = {
                leagueCode: this.leagueCode,
                ...(nickname && { nickname })
            };
            
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
            
            console.log('🎉 Successfully joined league:', result.league.name);
            
            // Show success message
            document.getElementById('joinedLeagueName').textContent = result.league.name;
            this.showSection('joinSuccess');
            
        } catch (error) {
            console.error('Failed to join league:', error);
            this.showError(error.message);
        }
    }

    setupEventListeners() {
        // Profile selection
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('select-profile-btn')) {
                const profileId = e.target.getAttribute('data-profile-id');
                this.selectProfile(profileId);
            }
        });

        // Create new profile
        document.getElementById('createNewProfileBtn')?.addEventListener('click', () => {
            window.location.href = '/profiles';
        });

        // Join confirmation
        document.getElementById('confirmJoinBtn')?.addEventListener('click', () => {
            this.joinLeague();
        });

        document.getElementById('cancelJoinBtn')?.addEventListener('click', () => {
            window.location.href = '/leagues';
        });
    }

    showSection(sectionId) {
        const sections = [
            'loadingState', 'leagueInfo', 'authRequired', 
            'profileSelection', 'joinConfirmation', 'joinSuccess', 'errorMessage'
        ];
        
        sections.forEach(id => {
            const element = document.getElementById(id);
            if (element) {
                element.style.display = id === sectionId ? 'block' : 'none';
            }
        });
    }

    showError(message) {
        document.getElementById('errorText').textContent = message;
        this.showSection('errorMessage');
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new JoinLeagueManager();
});