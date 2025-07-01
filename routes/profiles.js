const express = require('express');
const router = express.Router();

// Utility functions
function requireAuth(req, res, next) {
    if (!req.isAuthenticated || !req.isAuthenticated()) {
        return res.status(401).json({ error: 'Authentication required' });
    }
    next();
}

function generateUsername(displayName) {
    return displayName.toLowerCase()
        .replace(/[^a-z0-9]/g, '')
        .substring(0, 20) + '_' + Math.random().toString(36).substring(2, 6);
}

function validateProfileData(data) {
    const { username, displayName, avatarColor, avatarIcon } = data;
    const errors = [];

    if (!username || username.length < 3 || username.length > 50) {
        errors.push('Username must be between 3 and 50 characters');
    }

    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
        errors.push('Username can only contain letters, numbers, and underscores');
    }

    if (!displayName || displayName.length < 1 || displayName.length > 100) {
        errors.push('Display name must be between 1 and 100 characters');
    }

    if (avatarColor && !/^#[0-9A-Fa-f]{6}$/.test(avatarColor)) {
        errors.push('Avatar color must be a valid hex color');
    }

    const validIcons = ['star', 'heart', 'rocket', 'crown', 'diamond', 'lightning', 'flower', 'rainbow', 'sun', 'moon'];
    if (avatarIcon && !validIcons.includes(avatarIcon)) {
        errors.push('Invalid avatar icon');
    }

    return errors;
}

// Get all profiles for authenticated user
router.get('/', requireAuth, async (req, res) => {
    try {
        const dbService = req.app.get('dbService');
        const profiles = await dbService.getProfilesByUserId(req.user.id);
        
        res.json({ profiles });
    } catch (error) {
        console.error('Error getting profiles:', error);
        res.status(500).json({ error: 'Failed to get profiles' });
    }
});

// Create new profile
router.post('/', requireAuth, async (req, res) => {
    try {
        const { username, displayName, avatarColor, avatarIcon, birthYear } = req.body;
        const dbService = req.app.get('dbService');

        // Validate input
        const errors = validateProfileData(req.body);
        if (errors.length > 0) {
            return res.status(400).json({ error: errors.join(', ') });
        }

        // Check if username is already taken
        const existingProfile = await dbService.getProfileByUsername(username);
        if (existingProfile) {
            return res.status(400).json({ error: 'Username already taken' });
        }

        // Check profile limit (max 8 profiles per user)
        const existingProfiles = await dbService.getProfilesByUserId(req.user.id);
        if (existingProfiles.length >= 8) {
            return res.status(400).json({ error: 'Maximum of 8 profiles allowed per account' });
        }

        // Create profile
        const profileData = {
            userId: req.user.id,
            username,
            displayName,
            avatarColor: avatarColor || '#3498db',
            avatarIcon: avatarIcon || 'star',
            birthYear: birthYear ? parseInt(birthYear) : null,
            isDefault: false,
            isChild: true
        };

        const profile = await dbService.createProfile(profileData);
        
        res.status(201).json({ profile });
    } catch (error) {
        console.error('Error creating profile:', error);
        res.status(500).json({ error: 'Failed to create profile' });
    }
});

// Get specific profile
router.get('/:profileId', requireAuth, async (req, res) => {
    try {
        const { profileId } = req.params;
        const dbService = req.app.get('dbService');

        const profile = await dbService.getProfileById(profileId);
        
        if (!profile) {
            return res.status(404).json({ error: 'Profile not found' });
        }

        // Check ownership
        if (profile.user_id !== req.user.id) {
            return res.status(403).json({ error: 'Access denied' });
        }

        res.json({ profile });
    } catch (error) {
        console.error('Error getting profile:', error);
        res.status(500).json({ error: 'Failed to get profile' });
    }
});

// Update profile
router.put('/:profileId', requireAuth, async (req, res) => {
    try {
        const { profileId } = req.params;
        const { displayName, avatarColor, avatarIcon, birthYear } = req.body;
        const dbService = req.app.get('dbService');

        // Get existing profile
        const existingProfile = await dbService.getProfileById(profileId);
        if (!existingProfile) {
            return res.status(404).json({ error: 'Profile not found' });
        }

        // Check ownership
        if (existingProfile.user_id !== req.user.id) {
            return res.status(403).json({ error: 'Access denied' });
        }

        // Validate input (username changes not allowed after creation)
        const validationData = { 
            username: existingProfile.username, // Keep existing username
            displayName, 
            avatarColor, 
            avatarIcon 
        };
        const errors = validateProfileData(validationData);
        if (errors.length > 0) {
            return res.status(400).json({ error: errors.join(', ') });
        }

        // Update profile
        const updates = {};
        if (displayName !== undefined) updates.display_name = displayName;
        if (avatarColor !== undefined) updates.avatar_color = avatarColor;
        if (avatarIcon !== undefined) updates.avatar_icon = avatarIcon;
        if (birthYear !== undefined) updates.birth_year = birthYear ? parseInt(birthYear) : null;

        const updatedProfile = await dbService.updateProfile(profileId, updates);
        
        res.json({ profile: updatedProfile });
    } catch (error) {
        console.error('Error updating profile:', error);
        res.status(500).json({ error: 'Failed to update profile' });
    }
});

// Delete profile
router.delete('/:profileId', requireAuth, async (req, res) => {
    try {
        const { profileId } = req.params;
        const dbService = req.app.get('dbService');

        // Get existing profile
        const existingProfile = await dbService.getProfileById(profileId);
        if (!existingProfile) {
            return res.status(404).json({ error: 'Profile not found' });
        }

        // Check ownership
        if (existingProfile.user_id !== req.user.id) {
            return res.status(403).json({ error: 'Access denied' });
        }

        // Cannot delete default profile
        if (existingProfile.is_default) {
            return res.status(400).json({ error: 'Cannot delete default profile' });
        }

        await dbService.deleteProfile(profileId);
        
        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting profile:', error);
        res.status(500).json({ error: 'Failed to delete profile' });
    }
});

// Switch active profile in session
router.post('/:profileId/activate', requireAuth, async (req, res) => {
    try {
        const { profileId } = req.params;
        const dbService = req.app.get('dbService');

        const profile = await dbService.getProfileById(profileId);
        
        if (!profile) {
            return res.status(404).json({ error: 'Profile not found' });
        }

        // Check ownership
        if (profile.user_id !== req.user.id) {
            return res.status(403).json({ error: 'Access denied' });
        }

        // Update session
        req.session.activeProfile = {
            id: profile.id,
            username: profile.username,
            displayName: profile.display_name,
            isChild: profile.is_child,
            avatarColor: profile.avatar_color,
            avatarIcon: profile.avatar_icon
        };

        console.log('Profile activated in session:', {
            profileId: profile.id,
            displayName: profile.display_name,
            sessionId: req.session.id,
            activeProfile: req.session.activeProfile
        });

        // Ensure session is saved before responding
        req.session.save((err) => {
            if (err) {
                console.error('Error saving session:', err);
                return res.status(500).json({ error: 'Failed to save session' });
            }
            
            res.json({ 
                activeProfile: req.session.activeProfile,
                message: `Switched to ${profile.display_name}'s profile`
            });
        });
    } catch (error) {
        console.error('Error activating profile:', error);
        res.status(500).json({ error: 'Failed to activate profile' });
    }
});

// Get profile-specific game history
router.get('/:profileId/games', requireAuth, async (req, res) => {
    try {
        const { profileId } = req.params;
        const { limit = 20, offset = 0 } = req.query;
        const dbService = req.app.get('dbService');

        // Get profile and check ownership
        const profile = await dbService.getProfileById(profileId);
        if (!profile) {
            return res.status(404).json({ error: 'Profile not found' });
        }

        if (profile.user_id !== req.user.id) {
            return res.status(403).json({ error: 'Access denied' });
        }

        const games = await dbService.getProfileGameHistory(profileId, parseInt(limit));
        
        res.json({ games: games.slice(parseInt(offset)) });
    } catch (error) {
        console.error('Error getting profile games:', error);
        res.status(500).json({ error: 'Failed to get profile games' });
    }
});

// Generate suggested username
router.post('/suggest-username', requireAuth, async (req, res) => {
    try {
        const { displayName } = req.body;
        
        if (!displayName) {
            return res.status(400).json({ error: 'Display name required' });
        }

        const dbService = req.app.get('dbService');
        let username = generateUsername(displayName);
        
        // Ensure uniqueness
        let attempts = 0;
        while (attempts < 10) {
            const existing = await dbService.getProfileByUsername(username);
            if (!existing) {
                break;
            }
            username = generateUsername(displayName);
            attempts++;
        }

        res.json({ suggestedUsername: username });
    } catch (error) {
        console.error('Error generating username:', error);
        res.status(500).json({ error: 'Failed to generate username' });
    }
});

// Check username availability
router.post('/check-username', requireAuth, async (req, res) => {
    try {
        const { username } = req.body;
        
        if (!username) {
            return res.status(400).json({ error: 'Username required' });
        }

        const errors = validateProfileData({ username, displayName: 'test' });
        if (errors.length > 0) {
            return res.json({ available: false, reason: errors[0] });
        }

        const dbService = req.app.get('dbService');
        const existing = await dbService.getProfileByUsername(username);
        
        res.json({ 
            available: !existing,
            reason: existing ? 'Username already taken' : null
        });
    } catch (error) {
        console.error('Error checking username:', error);
        res.status(500).json({ error: 'Failed to check username' });
    }
});

// Get profile by username (for profile view page)
router.get('/by-username/:username', async (req, res) => {
    try {
        const { username } = req.params;
        const dbService = req.app.get('dbService');
        
        if (!username) {
            return res.status(400).json({ error: 'Username required' });
        }
        
        const profile = await dbService.getProfileByUsername(username);
        
        if (!profile) {
            return res.status(404).json({ error: 'Profile not found' });
        }
        
        // Check if requester has permission to view this profile
        // For now, allow viewing any profile, but this could be restricted later
        if (req.isAuthenticated && req.isAuthenticated()) {
            // User is authenticated, check if they own this profile or it's public
            const userProfiles = await dbService.getProfilesByUserId(req.user.id);
            const isOwner = userProfiles.some(p => p.id === profile.id);
            
            if (!isOwner) {
                // For now, allow viewing other profiles, but could add privacy settings later
                // return res.status(403).json({ error: 'You do not have permission to view this profile' });
            }
        }
        
        res.json(profile);
        
    } catch (error) {
        console.error('Error getting profile by username:', error);
        res.status(500).json({ error: 'Failed to get profile' });
    }
});

// Get game history for a specific profile
router.get('/:profileId/game-history', async (req, res) => {
    try {
        const { profileId } = req.params;
        const { limit = 50 } = req.query;
        const dbService = req.app.get('dbService');
        
        if (!profileId) {
            return res.status(400).json({ error: 'Profile ID required' });
        }
        
        // Check if requester has permission to view this profile's history
        if (req.isAuthenticated && req.isAuthenticated()) {
            const userProfiles = await dbService.getProfilesByUserId(req.user.id);
            const isOwner = userProfiles.some(p => p.id === profileId);
            
            if (!isOwner) {
                // For now, allow viewing other profiles' history, but could add privacy settings later
                // return res.status(403).json({ error: 'You do not have permission to view this profile history' });
            }
        }
        
        const gameHistory = await dbService.getProfileGameHistory(profileId, parseInt(limit));
        
        res.json(gameHistory);
        
    } catch (error) {
        console.error('Error getting profile game history:', error);
        res.status(500).json({ error: 'Failed to get game history' });
    }
});

module.exports = router;