// Profiles Management JavaScript

class ProfilesManager {
    constructor() {
        this.profiles = [];
        this.currentUser = null;
        this.currentEditingProfile = null;
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
        try {
            // Check authentication (keep original working logic)
            this.currentUser = await this.getCurrentUser();
            if (!this.currentUser) {
                window.location.href = '/';
                return;
            }

            this.setupEventListeners();
            await this.loadProfiles();
            this.hideLoading();
            
            // Ensure user info displays in header
            this.displayUserInfo();
        } catch (error) {
            console.error('Error initializing profiles:', error);
            this.showError();
        }
    }

    setupEventListeners() {
        // Note: Add profile button is created dynamically in renderProfiles()
        // Event listener will be added when the button is created

        // Modal close buttons
        document.getElementById('closeAddModal').addEventListener('click', () => {
            this.hideAddProfileModal();
        });

        document.getElementById('closeEditModal').addEventListener('click', () => {
            this.hideEditProfileModal();
        });

        document.getElementById('closeDeleteModal').addEventListener('click', () => {
            this.hideDeleteConfirmModal();
        });

        // Form submissions
        document.getElementById('addProfileForm').addEventListener('submit', (e) => {
            this.handleAddProfile(e);
        });

        document.getElementById('editProfileForm').addEventListener('submit', (e) => {
            this.handleEditProfile(e);
        });

        // Modal background clicks
        document.getElementById('addProfileModal').addEventListener('click', (e) => {
            if (e.target.id === 'addProfileModal') {
                this.hideAddProfileModal();
            }
        });

        document.getElementById('editProfileModal').addEventListener('click', (e) => {
            if (e.target.id === 'editProfileModal') {
                this.hideEditProfileModal();
            }
        });

        // Cancel buttons
        document.getElementById('cancelAddProfile').addEventListener('click', () => {
            this.hideAddProfileModal();
        });

        document.getElementById('cancelEditProfile').addEventListener('click', () => {
            this.hideEditProfileModal();
        });

        // Delete profile buttons
        document.getElementById('deleteProfile').addEventListener('click', () => {
            this.showDeleteConfirmModal();
        });

        document.getElementById('confirmDelete').addEventListener('click', () => {
            this.handleDeleteProfile();
        });

        document.getElementById('cancelDelete').addEventListener('click', () => {
            this.hideDeleteConfirmModal();
        });

        // Username validation
        document.getElementById('username').addEventListener('input', (e) => {
            this.debounce(() => this.validateUsername(e.target.value), 500)();
        });

        // Display name auto-generation
        document.getElementById('displayName').addEventListener('input', (e) => {
            this.updateSubmitButton();
        });

        // Avatar customization
        this.setupAvatarCustomization();

        // Logout button
        document.getElementById('logoutBtn').addEventListener('click', () => {
            window.location.href = '/auth/logout';
        });
    }

    setupAvatarCustomization() {
        // Add profile modal avatar customization
        const colorInputs = document.querySelectorAll('input[name="avatarColor"]');
        const iconInputs = document.querySelectorAll('input[name="avatarIcon"]');

        colorInputs.forEach(input => {
            input.addEventListener('change', () => this.updateAvatarPreview());
        });

        iconInputs.forEach(input => {
            input.addEventListener('change', () => this.updateAvatarPreview());
        });

        // Edit profile modal avatar customization
        const editColorInputs = document.querySelectorAll('input[name="editAvatarColor"]');
        const editIconInputs = document.querySelectorAll('input[name="editAvatarIcon"]');

        editColorInputs.forEach(input => {
            input.addEventListener('change', () => this.updateEditAvatarPreview());
        });

        editIconInputs.forEach(input => {
            input.addEventListener('change', () => this.updateEditAvatarPreview());
        });
    }

    updateAvatarPreview() {
        const color = document.querySelector('input[name="avatarColor"]:checked').value;
        const icon = document.querySelector('input[name="avatarIcon"]:checked').value;
        
        const preview = document.getElementById('avatarPreview');
        preview.style.backgroundColor = color;
        preview.querySelector('.avatar-icon').textContent = this.avatarIcons[icon];
    }

    updateEditAvatarPreview() {
        const color = document.querySelector('input[name="editAvatarColor"]:checked').value;
        const icon = document.querySelector('input[name="editAvatarIcon"]:checked').value;
        
        const preview = document.getElementById('editAvatarPreview');
        preview.style.backgroundColor = color;
        preview.querySelector('.avatar-icon').textContent = this.avatarIcons[icon];
    }

    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    async getCurrentUser() {
        try {
            const response = await fetch('/api/user');
            if (response.ok) {
                return await response.json();
            }
            return null;
        } catch (error) {
            console.error('Error getting current user:', error);
            return null;
        }
    }

    displayUserInfo() {
        const userSection = document.getElementById('userSection');
        if (!userSection || !this.currentUser) return;
        
        // Display user info with dropdown menu (similar to auth.js)
        userSection.innerHTML = `
            <div class="user-menu">
                <button id="userMenuBtn" class="user-menu-btn">
                    ${this.currentUser.avatar ? 
                        `<img src="${this.currentUser.avatar}" alt="${this.currentUser.name}" class="user-avatar-small">` : 
                        `<div class="avatar-placeholder-small">${this.currentUser.name.charAt(0).toUpperCase()}</div>`
                    }
                    <span class="user-name-short">${this.currentUser.name.split(' ')[0]}</span>
                </button>
                <div id="userDropdown" class="user-dropdown">
                    <button id="viewProfile" class="dropdown-item">Profile</button>
                    <button id="viewLeagues" class="dropdown-item">Leagues</button>
                    <button id="logoutBtn" class="dropdown-item">Logout</button>
                </div>
            </div>
        `;
        
        // Add event listeners
        document.getElementById('logoutBtn')?.addEventListener('click', () => this.logout());
        document.getElementById('viewProfile')?.addEventListener('click', () => window.location.href = '/profiles');
        document.getElementById('viewLeagues')?.addEventListener('click', () => window.location.href = '/leagues');
        
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
    }

    async logout() {
        try {
            const response = await fetch('/auth/logout', {
                method: 'POST'
            });
            
            if (response.ok) {
                window.location.href = '/';
            }
        } catch (error) {
            console.error('Logout error:', error);
        }
    }

    async loadProfiles() {
        try {
            const response = await fetch('/api/profiles');
            if (!response.ok) {
                throw new Error('Failed to load profiles');
            }

            const data = await response.json();
            this.profiles = data.profiles;
            this.renderProfiles();
        } catch (error) {
            console.error('Error loading profiles:', error);
            this.showError();
        }
    }

    renderProfiles() {
        const grid = document.getElementById('profilesGrid');
        grid.innerHTML = '';

        // Add profiles to grid
        this.profiles.forEach(profile => {
            const card = this.createProfileCard(profile);
            grid.appendChild(card);
        });

        // Add "Add Profile" button above the grid
        const addButtonContainer = document.querySelector('.add-profile-button');
        if (addButtonContainer) {
            addButtonContainer.innerHTML = `
                <button class="add-profile-top-btn" id="addProfileBtn">
                    <span>➕</span>
                    <span>Add Profile</span>
                </button>
            `;
            
            document.getElementById('addProfileBtn').addEventListener('click', () => {
                this.showAddProfileModal();
            });
        }
    }

    createProfileCard(profile) {
        const card = document.createElement('div');
        card.className = 'profile-card';
        card.style.position = 'relative';

        const gamesPlayed = profile.games_played || 0;
        const gamesWon = profile.games_won || 0;
        const currentStreak = profile.current_streak || 0;

        card.innerHTML = `
            ${profile.is_default ? '<div class="profile-badge">Parent</div>' : ''}
            <div class="profile-actions">
                <button class="profile-edit-btn" data-profile-id="${profile.id}" title="Edit Profile">
                    ✏️
                </button>
            </div>
            <div class="profile-avatar" style="background-color: ${profile.avatar_color}">
                <div class="avatar-icon">${this.avatarIcons[profile.avatar_icon] || '⭐'}</div>
            </div>
            <div class="profile-name">${profile.display_name}</div>
            <div class="profile-stats">
                <div class="profile-stat">
                    <span class="profile-stat-number">${gamesPlayed}</span>
                    Games
                </div>
                <div class="profile-stat">
                    <span class="profile-stat-number">${gamesWon}</span>
                    Wins
                </div>
                <div class="profile-stat">
                    <span class="profile-stat-number">${currentStreak}</span>
                    Streak
                </div>
            </div>
        `;

        // Add click handler for profile selection
        card.addEventListener('click', (e) => {
            // Don't activate if clicking edit button
            if (e.target.closest('.profile-edit-btn')) {
                this.editProfile(profile);
                return;
            }
            this.selectProfile(profile);
        });

        // Add edit button handler
        const editBtn = card.querySelector('.profile-edit-btn');
        editBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.editProfile(profile);
        });

        return card;
    }

    async selectProfile(profile) {
        try {
            const response = await fetch(`/api/profiles/${profile.id}/activate`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error('Failed to activate profile');
            }

            // Redirect to game page
            window.location.href = '/';
        } catch (error) {
            console.error('Error selecting profile:', error);
            this.showToast('Failed to select profile. Please try again.', 'error');
        }
    }

    editProfile(profile) {
        this.currentEditingProfile = profile;
        
        // Populate form
        document.getElementById('editProfileId').value = profile.id;
        document.getElementById('editDisplayName').value = profile.display_name;
        document.getElementById('editBirthYear').value = profile.birth_year || '';

        // Set avatar color
        document.querySelector(`input[name="editAvatarColor"][value="${profile.avatar_color}"]`).checked = true;
        
        // Set avatar icon
        document.querySelector(`input[name="editAvatarIcon"][value="${profile.avatar_icon}"]`).checked = true;

        // Update preview
        this.updateEditAvatarPreview();

        // Show/hide delete button based on whether it's default profile
        const deleteBtn = document.getElementById('deleteProfile');
        deleteBtn.style.display = profile.is_default ? 'none' : 'block';

        this.showEditProfileModal();
    }

    showAddProfileModal() {
        // Reset form
        document.getElementById('addProfileForm').reset();
        
        // Reset avatar preview
        document.querySelector('input[name="avatarColor"][value="#3498db"]').checked = true;
        document.querySelector('input[name="avatarIcon"][value="star"]').checked = true;
        this.updateAvatarPreview();
        
        // Reset feedback
        document.getElementById('usernameFeedback').textContent = '';
        document.getElementById('submitAddProfile').disabled = true;

        document.getElementById('addProfileModal').classList.add('show');
    }

    hideAddProfileModal() {
        document.getElementById('addProfileModal').classList.remove('show');
    }

    showEditProfileModal() {
        document.getElementById('editProfileModal').classList.add('show');
    }

    hideEditProfileModal() {
        document.getElementById('editProfileModal').classList.remove('show');
        this.currentEditingProfile = null;
    }

    showDeleteConfirmModal() {
        this.hideEditProfileModal();
        document.getElementById('deleteConfirmModal').classList.add('show');
    }

    hideDeleteConfirmModal() {
        document.getElementById('deleteConfirmModal').classList.remove('show');
    }

    async validateUsername(username) {
        const feedback = document.getElementById('usernameFeedback');
        
        if (username.length < 3) {
            feedback.textContent = '';
            this.updateSubmitButton();
            return;
        }

        feedback.textContent = 'Checking...';
        feedback.className = 'username-feedback checking';

        try {
            const response = await fetch('/api/profiles/check-username', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ username })
            });

            const data = await response.json();
            
            if (data.available) {
                feedback.textContent = '✓ Username available';
                feedback.className = 'username-feedback available';
            } else {
                feedback.textContent = '✗ ' + (data.reason || 'Username not available');
                feedback.className = 'username-feedback taken';
            }
        } catch (error) {
            feedback.textContent = 'Error checking username';
            feedback.className = 'username-feedback taken';
        }

        this.updateSubmitButton();
    }

    updateSubmitButton() {
        const submitBtn = document.getElementById('submitAddProfile');
        const displayName = document.getElementById('displayName').value.trim();
        const username = document.getElementById('username').value.trim();
        const feedback = document.getElementById('usernameFeedback');
        
        const isValid = displayName.length > 0 && 
                       username.length >= 3 && 
                       feedback.classList.contains('available');
        
        submitBtn.disabled = !isValid;
    }

    async handleAddProfile(e) {
        e.preventDefault();

        const formData = new FormData(e.target);
        const profileData = {
            displayName: formData.get('displayName'),
            username: formData.get('username'),
            avatarColor: formData.get('avatarColor'),
            avatarIcon: formData.get('avatarIcon'),
            birthYear: formData.get('birthYear') || null
        };

        try {
            const response = await fetch('/api/profiles', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(profileData)
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to create profile');
            }

            this.showToast('Profile created successfully!', 'success');
            this.hideAddProfileModal();
            await this.loadProfiles();
        } catch (error) {
            console.error('Error creating profile:', error);
            this.showToast(error.message, 'error');
        }
    }

    async handleEditProfile(e) {
        e.preventDefault();

        const formData = new FormData(e.target);
        const profileData = {
            displayName: formData.get('displayName'),
            avatarColor: formData.get('editAvatarColor'),
            avatarIcon: formData.get('editAvatarIcon'),
            birthYear: formData.get('birthYear') || null
        };

        try {
            const response = await fetch(`/api/profiles/${this.currentEditingProfile.id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(profileData)
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to update profile');
            }

            this.showToast('Profile updated successfully!', 'success');
            this.hideEditProfileModal();
            await this.loadProfiles();
        } catch (error) {
            console.error('Error updating profile:', error);
            this.showToast(error.message, 'error');
        }
    }

    async handleDeleteProfile() {
        if (!this.currentEditingProfile) return;

        try {
            const response = await fetch(`/api/profiles/${this.currentEditingProfile.id}`, {
                method: 'DELETE'
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || 'Failed to delete profile');
            }

            this.showToast('Profile deleted successfully!', 'success');
            this.hideDeleteConfirmModal();
            await this.loadProfiles();
        } catch (error) {
            console.error('Error deleting profile:', error);
            this.showToast(error.message, 'error');
        }
    }

    showToast(message, type = 'info') {
        // Create toast element
        const toast = document.createElement('div');
        toast.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            background-color: ${type === 'error' ? '#e74c3c' : type === 'success' ? '#2ecc71' : '#3498db'};
            color: white;
            padding: 12px 24px;
            border-radius: 8px;
            z-index: 1000;
            font-size: 14px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            max-width: 300px;
        `;
        toast.textContent = message;
        
        document.body.appendChild(toast);
        
        // Remove after 4 seconds
        setTimeout(() => {
            if (document.body.contains(toast)) {
                document.body.removeChild(toast);
            }
        }, 4000);
    }

    hideLoading() {
        document.getElementById('loadingMessage').style.display = 'none';
    }

    showError() {
        document.getElementById('loadingMessage').style.display = 'none';
        document.getElementById('errorMessage').style.display = 'block';
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new ProfilesManager();
});