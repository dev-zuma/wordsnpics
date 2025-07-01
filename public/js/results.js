class ResultsPage {
    constructor() {
        this.gameResults = this.getGameResults();
        this.fullBoardData = null;
        this.init();
    }
    
    async init() {
        // If we have a session ID in the URL, load from API first
        if (this.gameResults.loading && this.gameResults.sessionId) {
            await this.loadGameSession();
        }
        
        this.displayResults();
        await this.loadFullBoardData();
        this.createVisualization();
        this.renderAuthSection();
        this.setupEventListeners();
        this.animateEntry();
        await this.generateShareableGraphic();
        // Automatically save the shareable graphic
        await this.autoSaveShareableGraphic();
    }
    
    getGameResults() {
        // Get results from URL parameters or localStorage
        const urlParams = new URLSearchParams(window.location.search);
        const sessionId = urlParams.get('session');
        
        // If we have a session ID, we'll load data from the API
        if (sessionId) {
            // Return temporary object, will be replaced by API data
            return {
                sessionId: sessionId,
                loading: true
            };
        }
        
        // Otherwise parse from URL params (legacy support)
        const wordTurnsParam = urlParams.get('wordTurns');
        const parsedWordTurns = JSON.parse(wordTurnsParam || '{}');
        
        return {
            correctWords: parseInt(urlParams.get('correct')) || 0,
            totalWords: 20,
            turns: parseInt(urlParams.get('turns')) || 0,
            maxTurns: 4,
            timeElapsed: urlParams.get('time') || '0:00',
            date: urlParams.get('date') || new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric' }),
            turnProgress: JSON.parse(urlParams.get('progress') || '[]'),
            puzzleImages: JSON.parse(urlParams.get('images') || '[]'),
            puzzleWords: JSON.parse(urlParams.get('words') || '[]'),
            wordTurns: parsedWordTurns,
            boardId: urlParams.get('boardId') || null,
            sessionId: urlParams.get('sessionId') || null,
            isWin: (parseInt(urlParams.get('correct')) || 0) === 20
        };
    }

    async loadGameSession() {
        try {
            const response = await fetch(`/api/game/session/${this.gameResults.sessionId}`);
            if (!response.ok) {
                throw new Error('Failed to load game session');
            }
            
            const sessionData = await response.json();
            
            // Transform API data to match expected format
            this.gameResults = {
                correctWords: sessionData.correct,
                totalWords: sessionData.totalWords,
                turns: sessionData.turns,
                maxTurns: sessionData.maxTurns,
                timeElapsed: sessionData.time,
                date: sessionData.date,
                title: sessionData.title,
                wordTurns: sessionData.wordTurns,
                turnHistory: sessionData.turnHistory,
                boardId: sessionData.boardId,
                sessionId: sessionData.sessionId,
                isWin: sessionData.isWin,
                completedAt: sessionData.completedAt,
                // Initialize empty arrays for images/words - will be loaded separately
                puzzleImages: [],
                puzzleWords: [],
                turnProgress: []
            };
            
            // Calculate turn progress from turnHistory
            if (sessionData.turnHistory && sessionData.turnHistory.length > 0) {
                this.gameResults.turnProgress = sessionData.turnHistory.map(turn => turn.correctCount || 0);
            }
            
            console.log('🏁 Game session loaded:', this.gameResults);
            
        } catch (error) {
            console.error('Error loading game session:', error);
            // Redirect to home with error message
            window.location.href = '/?message=session_not_found';
        }
    }

    async loadFullBoardData() {
        const { puzzleImages, boardId } = this.gameResults;
        
        
        // If we have a board ID, fetch full board data
        if (boardId) {
            try {
                // Use public API endpoint
                let response = await fetch(`/api/board/${boardId}`);
                if (response.ok) {
                    this.fullBoardData = await response.json();
                    return;
                }
            } catch (error) {
                console.warn('Could not load full board data:', error);
            }
        }
        
        // Fallback: try to extract board ID from image URLs
        if (puzzleImages && puzzleImages.length > 0) {
            const firstImage = puzzleImages[0];
            if (firstImage.url && firstImage.url.includes('/images/generated/')) {
                // Extract board ID from image filename (e.g., "group1-1234567890.png" -> look for board files)
                try {
                    const response = await fetch('/api/puzzles');
                    if (response.ok) {
                        const allBoards = await response.json();
                        // Try to match by date or other criteria
                        const matchingBoard = allBoards.find(board => 
                            board.date === this.gameResults.date || 
                            board.title === this.gameResults.title
                        );
                        
                        if (matchingBoard) {
                            const boardResponse = await fetch(`/api/board/${matchingBoard.id}`);
                            if (boardResponse.ok) {
                                this.fullBoardData = await boardResponse.json();
                                return;
                            }
                        }
                    }
                } catch (error) {
                    console.warn('Could not fetch board list:', error);
                }
            }
        }
        
    }
    
    displayResults() {
        const { correctWords, totalWords, turns, maxTurns, timeElapsed, date, isWin } = this.gameResults;
        
        // Date removed from header per user request
        
        // Update status
        const statusIcon = document.getElementById('statusIcon');
        const statusText = document.getElementById('statusText');
        
        if (isWin) {
            statusIcon.textContent = '🎉';
            statusText.textContent = 'Puzzle Complete!';
        } else {
            statusIcon.textContent = '💪';
            statusText.textContent = 'Good Effort!';
        }
        
        // Update score
        document.getElementById('correctScore').textContent = correctWords;
        
        // Update details
        document.getElementById('turnsValue').textContent = `${turns}/${maxTurns}`;
        document.getElementById('timeValue').textContent = timeElapsed;
        
        const accuracy = Math.round((correctWords / totalWords) * 100);
        document.getElementById('accuracyValue').textContent = `${accuracy}%`;
    }
    
    createVisualization() {
        this.createAnswersGrid();
        this.createGroupExplanations();
    }
    
    async renderAuthSection() {
        const authSection = document.getElementById('authSection');
        const userSection = document.getElementById('userSection');
        
        try {
            // Check if user is authenticated by accessing the auth manager
            const user = window.authManager ? window.authManager.getCurrentUser() : null;
            
            // Get active profile from auth manager or fetch from server
            let activeProfile = window.authManager ? window.authManager.activeProfile : null;
            
            // If no active profile from auth manager, fetch from server
            if (user && !activeProfile) {
                try {
                    const statusResponse = await fetch('/auth/status');
                    const statusData = await statusResponse.json();
                    activeProfile = statusData.activeProfile;
                } catch (fetchError) {
                    console.error('Error fetching active profile:', fetchError);
                }
            }
            
            if (user) {
                // User is signed in - show game history in auth section and user info in header
                if (authSection) {
                    await this.renderUserHistory(authSection, user, activeProfile);
                }
                if (userSection && window.authManager) {
                    window.authManager.renderUserSection();
                }
                // Show recent games section
                await this.renderRecentGames(user, activeProfile);
            } else {
                // User is not signed in - show call to action and login button
                if (authSection) {
                    this.renderSignUpCTA(authSection);
                }
                if (userSection && window.authManager) {
                    window.authManager.renderUserSection();
                }
            }
        } catch (error) {
            console.error('Error rendering auth section:', error);
            if (authSection) {
                this.renderSignUpCTA(authSection);
            }
        }
    }
    
    renderSignUpCTA(container) {
        container.innerHTML = `
            <div class="signup-cta">
                <div class="cta-icon">📊</div>
                <div class="cta-content">
                    <h3>Track Your Progress!</h3>
                    <p>Sign in to save your game history and see how you improve over time.</p>
                    <button id="ctaSignInBtn" class="cta-signin-btn">Sign In to Save Progress</button>
                </div>
            </div>
        `;
        
        // Add event listener for CTA button
        document.getElementById('ctaSignInBtn')?.addEventListener('click', () => {
            if (window.authManager) {
                // Pass the game session ID so it can be associated with the user after login
                const gameSessionId = this.gameSessionId || this.gameResults.sessionId;
                window.authManager.showLoginModal(gameSessionId);
            }
        });
    }
    
    async renderRecentGames(user, activeProfile) {
        try {
            // Fetch profile's recent games
            const profileId = activeProfile ? activeProfile.id : null;
            if (!profileId) return;
            
            const response = await fetch(`/api/profiles/${profileId}/games`);
            if (!response.ok) return;
            
            const gamesData = await response.json();
            const recentGames = gamesData.games?.slice(0, 5) || [];
            
            if (recentGames.length === 0) return;
            
            const recentGamesSection = document.getElementById('recentGamesSection');
            const recentGamesGrid = document.getElementById('recentGamesGrid');
            
            if (!recentGamesSection || !recentGamesGrid) return;
            
            // Show the section
            recentGamesSection.style.display = 'block';
            
            // Render recent games
            recentGamesGrid.innerHTML = recentGames.map(game => {
                const gameDate = new Date(game.completed_at).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric'
                });
                
                const isWin = game.is_win;
                const scoreClass = isWin ? '' : 'partial';
                
                return `
                    <div class="recent-game-card" onclick="window.open('/share/${game.shareableGraphicId}', '_blank')" 
                         style="${!game.shareableGraphicId ? 'opacity: 0.7; cursor: default;' : ''}">
                        <div class="recent-game-graphic">
                            ${game.shareableGraphicId ? 
                                `<img src="/api/share/${game.shareableGraphicId}/image" alt="Game Result" loading="lazy">` :
                                `<div style="width: 80px; height: 80px; background: var(--soft-bg); border-radius: 6px; display: flex; align-items: center; justify-content: center; color: var(--disabled); font-size: 0.8rem;">No Graphic</div>`
                            }
                        </div>
                        <div class="recent-game-info">
                            <h4>${game.puzzle_title || 'WORDLINKS'}</h4>
                            <div class="recent-game-score ${scoreClass}">${game.correct_words}/${game.total_words}</div>
                            <div class="recent-game-date">${gameDate}</div>
                        </div>
                    </div>
                `;
            }).join('');
            
        } catch (error) {
            console.error('Error loading recent games:', error);
        }
    }
    
    async renderUserHistory(container, user, activeProfile) {
        try {
            // Use active profile if available
            const profileId = activeProfile ? activeProfile.id : null;
            const displayName = activeProfile ? activeProfile.displayName : user.name;
            
            if (!profileId) {
                container.innerHTML = `
                    <div class="history-error">
                        <p>Please select a profile to see your game history.</p>
                    </div>
                `;
                return;
            }
            
            // Fetch profile's recent games and stats
            const response = await fetch(`/api/profiles/${profileId}/games`);
            
            if (!response.ok) {
                console.error('Error fetching profile games:', response.status);
                this.renderSignUpCTA(container);
                return;
            }
            
            const gamesData = await response.json();
            const recentGames = gamesData.games || [];
            
            // Calculate stats from games
            const totalGames = recentGames.length;
            const completedGames = recentGames.filter(g => g.is_win).length;
            const winRate = totalGames > 0 ? Math.round((completedGames / totalGames) * 100) : 0;
            const averageScore = totalGames > 0 ? 
                Math.round(recentGames.reduce((sum, g) => sum + g.correct_words, 0) / totalGames) : 0;
            
            container.innerHTML = `
                <div class="user-history-section">
                    <div class="history-header">
                        <div class="history-user">
                            <div class="history-avatar">
                                ${activeProfile && activeProfile.avatarColor ? 
                                    `<div class="avatar-placeholder" style="background-color: ${activeProfile.avatarColor}; color: white; font-size: 1.5rem;">${activeProfile.avatarIcon ? this.getAvatarIcon(activeProfile.avatarIcon) : displayName.charAt(0).toUpperCase()}</div>` :
                                    user.avatar ? 
                                        `<img src="${user.avatar}" alt="${displayName}">` : 
                                        `<div class="avatar-placeholder">${displayName.charAt(0).toUpperCase()}</div>`
                                }
                            </div>
                            <div class="history-user-info">
                                <h3>${displayName}'s Progress</h3>
                                <div class="user-stats">
                                    <span class="stat">${totalGames} games</span>
                                    <span class="stat">${winRate}% win rate</span>
                                    <span class="stat">${averageScore}/20 avg</span>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    ${recentGames.length > 0 ? `
                        <div class="recent-games">
                            <h4>Recent Games</h4>
                            <div class="games-list">
                                ${recentGames.slice(0, 3).map(game => `
                                    <div class="game-item clickable-game" onclick="window.open('/results?session=${game.session_id}', '_blank')" style="cursor: pointer; transition: transform 0.2s ease;" onmouseover="this.style.transform='translateY(-2px)'" onmouseout="this.style.transform='translateY(0)'">
                                        <div class="game-score ${game.is_win ? 'win' : 'incomplete'}">
                                            ${game.correct_words}/20
                                        </div>
                                        <div class="game-details">
                                            <div class="game-date">${new Date(game.completed_at).toLocaleDateString()}</div>
                                            <div class="game-status">${game.is_win ? 'Completed' : 'Partial'}</div>
                                        </div>
                                        <div class="game-badge">
                                            ${game.is_win ? '🎉' : '💪'}
                                        </div>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    ` : `
                        <div class="no-history">
                            <p>This is your first game! Keep playing to build your history.</p>
                        </div>
                    `}
                </div>
            `;
        } catch (error) {
            console.error('Error loading user history:', error);
            const displayName = activeProfile ? activeProfile.displayName : user.name;
            container.innerHTML = `
                <div class="history-error">
                    <p>Welcome back, ${displayName}! Your game history will appear here.</p>
                </div>
            `;
        }
    }
    
    getAvatarIcon(iconName) {
        const avatarIcons = {
            star: '⭐',
            heart: '❤️', 
            rocket: '🚀',
            crown: '👑',
            diamond: '💎',
            lightning: '⚡',
            flower: '🌸',
            rainbow: '🌈'
        };
        return avatarIcons[iconName] || '⭐';
    }
    
    createTurnVisualization() {
        const container = document.getElementById('turnVisualization');
        const { turns, maxTurns, turnProgress } = this.gameResults;
        
        for (let i = 1; i <= maxTurns; i++) {
            const step = document.createElement('div');
            step.className = 'turn-step';
            
            if (i <= turns) {
                step.classList.add(`turn-${i}`);
                
                const turnData = turnProgress[i - 1];
                const correctCount = turnData ? turnData.correct : 0;
                
                const turnNumber = document.createElement('div');
                turnNumber.className = 'turn-number';
                turnNumber.textContent = `T${i}`;
                
                const turnCount = document.createElement('div');
                turnCount.className = 'turn-count';
                turnCount.textContent = `${correctCount}`;
                
                step.appendChild(turnNumber);
                step.appendChild(turnCount);
            } else {
                step.classList.add('unused');
                step.textContent = `T${i}`;
            }
            
            container.appendChild(step);
        }
    }
    
    createPatternGrid() {
        const container = document.getElementById('patternGrid');
        const { puzzleWords, wordTurns } = this.gameResults;
        
        
        // Create 20 cells representing all words
        for (let i = 0; i < 20; i++) {
            const cell = document.createElement('div');
            cell.className = 'pattern-cell';
            
            if (puzzleWords && puzzleWords[i] && wordTurns) {
                const wordId = puzzleWords[i].id;
                const turnSolved = wordTurns[wordId];
                
                
                if (turnSolved) {
                    cell.classList.add('filled');
                    cell.classList.add(`turn-${turnSolved}`);
                    cell.setAttribute('data-word-id', wordId);
                    cell.setAttribute('data-turn', turnSolved);
                }
            }
            
            container.appendChild(cell);
        }
    }
    
    createAnswersGrid() {
        const container = document.getElementById('answersGrid');
        
        // IMPORTANT: Use game data word order to match the actual board layout
        // The fullBoardData has words in database order (grouped), but gameResults has shuffled order
        const puzzleWords = this.gameResults.puzzleWords;
        const puzzleImages = (this.fullBoardData && this.fullBoardData.images) || this.gameResults.puzzleImages;
        
        // Create word-to-image mapping from full board data
        let wordImageMap = {};
        if (this.fullBoardData && this.fullBoardData.words) {
            this.fullBoardData.words.forEach(word => {
                // Use correctImageId which is what the admin endpoint returns
                wordImageMap[word.id] = word.correctImageId || word.image_id;
            });
        }
        
        // If no mapping available, try to get images from the old gameResults format
        if (Object.keys(wordImageMap).length === 0 && puzzleImages) {
            // Try to match by position or other available data
            puzzleWords.forEach((word, index) => {
                if (word.correctImageId) {
                    wordImageMap[word.id] = word.correctImageId;
                } else if (word.image_id) {
                    wordImageMap[word.id] = word.image_id;
                }
            });
        }
        
        // If still no mapping, create a simple distribution across available images
        if (Object.keys(wordImageMap).length === 0 && puzzleImages && puzzleWords) {
            const wordsPerImage = Math.ceil(puzzleWords.length / puzzleImages.length);
            puzzleWords.forEach((word, index) => {
                const imageIndex = Math.floor(index / wordsPerImage);
                if (puzzleImages[imageIndex]) {
                    wordImageMap[word.id] = puzzleImages[imageIndex].id;
                }
            });
        }
        
        
        // Create 20 cells showing the correct words
        for (let i = 0; i < 20; i++) {
            const cell = document.createElement('div');
            cell.className = 'answer-cell';
            
            if (puzzleWords && puzzleWords[i]) {
                const word = puzzleWords[i];
                
                // Add background image if available
                if (puzzleImages) {
                    // Get the correct image ID from the full board data mapping
                    const imageId = wordImageMap[word.id];
                    
                    if (imageId) {
                        const image = puzzleImages.find(img => img.id === imageId);
                        if (image && image.url) {
                            cell.style.backgroundImage = `url(${image.url})`;
                        } else {
                        }
                    }
                }
                
                // Create text span that appears above overlay
                const textSpan = document.createElement('span');
                textSpan.textContent = word.text || word.word || word;
                textSpan.style.position = 'relative';
                textSpan.style.zIndex = '2';
                cell.appendChild(textSpan);
            }
            
            container.appendChild(cell);
        }
    }

    createGroupExplanations() {
        const container = document.getElementById('explanationsContent');
        
        if (!container) {
            console.error('Group explanations container not found');
            return;
        }
        
        // Use full board data if available, otherwise fall back to game data
        const sourceData = this.fullBoardData || this.gameResults;
        const puzzleWords = sourceData.words || sourceData.puzzleWords;
        const puzzleImages = sourceData.images || sourceData.puzzleImages;
        
        if (!puzzleWords || !puzzleImages) {
            container.innerHTML = '<p>Group explanations not available for this puzzle.</p>';
            return;
        }
        
        // Group words by their correct image (theme)
        const groups = puzzleImages.map(image => {
            // Handle both old format (correctImageId) and new format (image_id)
            const groupWords = puzzleWords.filter(word => {
                const wordImageId = word.correctImageId || word.image_id;
                return wordImageId === image.id;
            });
            return {
                ...image,
                words: groupWords
            };
        });
        
        // Sort groups by word count (descending) to match the expected order
        groups.sort((a, b) => b.words.length - a.words.length);
        
        container.innerHTML = groups.map(group => `
            <div class="explanation-group">
                <div class="explanation-header">${group.theme} (${group.words.length} words)</div>
                <div class="explanation-description">${group.narrative || 'No explanation available for this group.'}</div>
                <div class="explanation-words">
                    ${group.words.map(word => `
                        <span class="explanation-word">${typeof word === 'string' ? word : word.text}</span>
                    `).join('')}
                </div>
            </div>
        `).join('');
    }
    
    createTurnLegend() {
        const container = document.getElementById('turnLegend');
        const { turns } = this.gameResults;
        
        const turnColors = [
            { turn: 1, color: 'var(--success)', label: 'Turn 1' },
            { turn: 2, color: 'var(--secondary)', label: 'Turn 2' },
            { turn: 3, color: 'var(--highlight)', label: 'Turn 3' },
            { turn: 4, color: 'var(--primary)', label: 'Turn 4' }
        ];
        
        turnColors.slice(0, turns).forEach(item => {
            const legendItem = document.createElement('div');
            legendItem.className = 'legend-item';
            
            const colorBox = document.createElement('div');
            colorBox.className = 'legend-color';
            colorBox.style.backgroundColor = item.color;
            
            const label = document.createElement('span');
            label.textContent = item.label;
            
            legendItem.appendChild(colorBox);
            legendItem.appendChild(label);
            container.appendChild(legendItem);
        });
    }
    
    
    animateEntry() {
        // Animate the pattern grid cells
        const cells = document.querySelectorAll('.pattern-cell.filled');
        cells.forEach((cell, index) => {
            setTimeout(() => {
                cell.classList.add('animate');
            }, index * 50);
        });
    }
    
    async autoSaveShareableGraphic() {
        try {
            // Generate session ID if missing
            if (!this.gameResults.sessionId) {
                this.gameResults.sessionId = 'auto_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
                console.log('Generated temporary session ID for auto-save:', this.gameResults.sessionId);
            }
            
            await this.createShareableGraphic();
            console.log('Shareable graphic auto-saved successfully');
        } catch (error) {
            console.error('Failed to auto-save shareable graphic:', error);
            console.error('Error details:', error.message);
            // Don't show error to user as this is automatic, but log for debugging
        }
    }
    
    async generateShareableGraphic() {
        const canvas = document.getElementById('shareableGraphic');
        const ctx = canvas.getContext('2d');
        
        const { correctWords, totalWords, turns, maxTurns, date, isWin } = this.gameResults;
        
        // Clear canvas with a clean background
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, 400, 400);
        
        // Draw image collage strip at the top
        await this.drawImageCollage(ctx);
        
        // Score section (below image strip with background) - compressed spacing
        const scoreY = 120;
        
        // Draw white background for score section
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 80, 400, 60);
        
        // Score number
        ctx.fillStyle = '#2C3E50';
        ctx.font = 'bold 44px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(`${correctWords}/${totalWords}`, 200, scoreY);
        
        // Score label
        ctx.font = '13px Arial';
        ctx.fillStyle = '#7f8c8d';
        ctx.fillText('WORDS MATCHED', 200, scoreY + 20);
        
        // Turn visualization - moved up
        const turnY = 170;
        const turnBoxSize = 60;
        const turnSpacing = 20;
        const totalTurnWidth = (turnBoxSize * 4) + (turnSpacing * 3);
        const startX = (400 - totalTurnWidth) / 2;
        
        for (let i = 1; i <= maxTurns; i++) {
            const x = startX + (i - 1) * (turnBoxSize + turnSpacing);
            
            if (i <= turns) {
                // Completed turn
                const turnData = this.gameResults.turnProgress[i - 1];
                const correctInTurn = turnData ? turnData.correct : 0;
                
                ctx.fillStyle = this.getTurnColor(i);
                ctx.fillRect(x, turnY, turnBoxSize, turnBoxSize);
                
                // Turn number
                ctx.fillStyle = i === 2 ? '#2C3E50' : 'white';
                ctx.font = 'bold 14px Arial';
                ctx.textAlign = 'center';
                ctx.fillText(`T${i}`, x + turnBoxSize/2, turnY + 25);
                
                // Correct count
                ctx.font = 'bold 20px Arial';
                ctx.fillText(correctInTurn.toString(), x + turnBoxSize/2, turnY + 45);
            } else {
                // Unused turn
                ctx.fillStyle = '#ecf0f1';
                ctx.fillRect(x, turnY, turnBoxSize, turnBoxSize);
                
                ctx.fillStyle = '#bdc3c7';
                ctx.font = '14px Arial';
                ctx.textAlign = 'center';
                ctx.fillText(`T${i}`, x + turnBoxSize/2, turnY + 35);
            }
        }
        
        // Pattern grid - matches game board layout exactly - moved up
        const gridY = 250;
        const cellSize = 18;
        const cellGap = 4;
        const gridCols = 4;
        const gridRows = 5;
        const gridWidth = (cellSize * gridCols) + (cellGap * (gridCols - 1));
        const gridStartX = (400 - gridWidth) / 2;
        
        // IMPORTANT: Use the same shuffled word order as the game board
        const puzzleWords = this.gameResults.puzzleWords || [];
        let wordTurns = this.gameResults.wordTurns || {};
        
        // If wordTurns is empty, we can't reconstruct which specific words were solved
        // The shareable graphic should only show colors for words we actually know were solved
        
        // Draw grid in the same shuffled order as the game board
        let wordIndex = 0;
        for (let row = 0; row < gridRows; row++) {
            for (let col = 0; col < gridCols; col++) {
                const x = gridStartX + col * (cellSize + cellGap);
                const y = gridY + row * (cellSize + cellGap);
                
                // Get the word at this position in game board order
                if (wordIndex < puzzleWords.length && puzzleWords[wordIndex]) {
                    const word = puzzleWords[wordIndex];
                    // The word ID format should match what server uses
                    const wordId = word.id;
                    
                    // Look up the actual turn this word was solved in
                    const turnSolved = wordTurns[wordId];
                    
                    
                    if (turnSolved) {
                        // Word was solved - use the actual turn color it was solved in
                        ctx.fillStyle = this.getTurnColor(turnSolved);
                    } else {
                        // Word was not solved - gray
                        ctx.fillStyle = '#ecf0f1';
                    }
                } else {
                    // No word at this position - gray
                    ctx.fillStyle = '#ecf0f1';
                }
                
                ctx.fillRect(x, y, cellSize, cellSize);
                wordIndex++;
            }
        }
        
        // Add small logo at bottom right
        await this.drawLogoWatermark(ctx);
    }
    
    async drawImageCollage(ctx) {
        const sourceData = this.fullBoardData || this.gameResults;
        const puzzleImages = sourceData.images || sourceData.puzzleImages;
        
        if (!puzzleImages || puzzleImages.length === 0) return;
        
        // Sort images by word count
        const sortedImages = [...puzzleImages].sort((a, b) => b.matchCount - a.matchCount);
        
        // Draw 5 image strips side by side
        const stripWidth = 400 / 5;
        const stripHeight = 80;
        
        for (let i = 0; i < Math.min(5, sortedImages.length); i++) {
            const image = sortedImages[i];
            if (image.url) {
                try {
                    const img = new Image();
                    img.crossOrigin = 'anonymous';
                    
                    await new Promise((resolve) => {
                        img.onload = () => {
                            // Calculate aspect ratios to avoid stretching
                            const sourceAspect = img.width / img.height;
                            const destAspect = stripWidth / stripHeight;
                            
                            let sourceX = 0;
                            let sourceY = 0;
                            let sourceW = img.width;
                            let sourceH = img.height;
                            
                            if (sourceAspect > destAspect) {
                                // Image is wider - crop horizontally
                                sourceW = img.height * destAspect;
                                sourceX = (img.width - sourceW) / 2;
                            } else {
                                // Image is taller - crop vertically
                                sourceH = img.width / destAspect;
                                sourceY = (img.height - sourceH) / 2;
                            }
                            
                            // Draw the cropped image
                            ctx.drawImage(img, 
                                sourceX, sourceY, sourceW, sourceH,  // Source (cropped)
                                i * stripWidth, 0, stripWidth, stripHeight     // Destination
                            );
                            
                            resolve();
                        };
                        img.onerror = () => {
                            // Fallback colored rectangle
                            ctx.fillStyle = this.getTurnColor(i + 1);
                            ctx.fillRect(i * stripWidth, 0, stripWidth, stripHeight);
                            resolve();
                        };
                        img.src = image.url;
                    });
                } catch (error) {
                    // Fallback
                    ctx.fillStyle = this.getTurnColor(i + 1);
                    ctx.fillRect(i * stripWidth, 0, stripWidth, stripHeight);
                }
            }
        }
        
        // Add white overlay to make images less distracting
        ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.fillRect(0, 0, 400, stripHeight);
    }
    
    async drawLogoWatermark(ctx) {
        // Draw small WORDSNPICS logo tiles at bottom right
        const scale = 0.2; // Scale for readability
        const logoWidth = 530 * scale; // Adjusted for 9 letters + special N
        const logoHeight = 120 * scale; 
        const x = 400 - logoWidth - 10; // 10px margin from right
        const y = 370; // Below the grid
        
        // Save context state
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(scale, scale);
        
        // Draw mini tiles for WORDS**N**PICS (9 letters with special N)
        const tiles = [
            { x: 5, y: 20, w: 50, h: 70, color: '#E67E22', letter: 'W', size: 48 },
            { x: 60, y: 20, w: 50, h: 70, color: '#E67E22', letter: 'O', size: 48 },
            { x: 115, y: 20, w: 50, h: 70, color: '#E67E22', letter: 'R', size: 48 },
            { x: 170, y: 20, w: 50, h: 70, color: '#E67E22', letter: 'D', size: 48 },
            { x: 225, y: 20, w: 50, h: 70, color: '#E67E22', letter: 'S', size: 48 },
            { x: 285, y: 10, w: 60, h: 80, color: '#1ABC9C', letter: 'N', size: 56, special: true },
            { x: 350, y: 20, w: 50, h: 70, color: '#F1C40F', letter: 'P', size: 48 },
            { x: 405, y: 20, w: 50, h: 70, color: '#F1C40F', letter: 'I', size: 48 },
            { x: 460, y: 20, w: 50, h: 70, color: '#F1C40F', letter: 'C', size: 48 },
            { x: 515, y: 20, w: 50, h: 70, color: '#F1C40F', letter: 'S', size: 48 }
        ];
        
        // Draw tiles
        tiles.forEach(tile => {
            // Tile background
            ctx.fillStyle = tile.color;
            ctx.fillRect(tile.x, tile.y, tile.w, tile.h);
            
            // Tile border - thicker border for special N
            ctx.strokeStyle = '#000';
            ctx.lineWidth = tile.special ? 4 : 3;
            ctx.strokeRect(tile.x, tile.y, tile.w, tile.h);
            
            // Add extra emphasis for special N tile
            if (tile.special) {
                // Add inner shadow effect
                ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
                ctx.lineWidth = 2;
                ctx.strokeRect(tile.x + 2, tile.y + 2, tile.w - 4, tile.h - 4);
            }
            
            // Letter
            ctx.fillStyle = 'white';
            ctx.font = `bold ${tile.size}px Arial`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(tile.letter, tile.x + tile.w/2, tile.y + tile.h/2);
        });
        
        // Restore context
        ctx.restore();
    }
    
    getTurnColor(turn) {
        const colors = {
            1: 'rgba(46, 204, 113, 1)',
            2: 'rgba(255, 235, 59, 1)', 
            3: 'rgba(255, 152, 0, 1)',
            4: 'rgba(100, 181, 246, 1)'
        };
        return colors[turn] || '#ccc';
    }

    setupEventListeners() {
        // Set up inline share buttons
        const shareButtons = document.querySelectorAll('.share-btn');
        shareButtons.forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const platform = btn.getAttribute('data-platform');
                await this.handleShare(platform);
            });
        });
    }
    
    async handleShare(platform) {
        // Create shareable graphic and get URL
        let shareUrl;
        try {
            // First ensure we have a shareable graphic generated
            await this.generateShareableGraphic();
            
            // Create the shareable with a temporary session ID if needed
            if (!this.gameSessionId && !this.gameResults.sessionId) {
                this.gameSessionId = 'temp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            }
            
            shareUrl = await this.createShareableGraphic();
            console.log('Created shareable URL:', shareUrl);
        } catch (error) {
            console.error('Failed to create shareable:', error);
            // Better fallback - still try to create a basic share URL
            shareUrl = await this.createFallbackShareUrl();
        }
        
        const { correctWords, totalWords, turns } = this.gameResults;
        const shareText = `I solved ${correctWords} out of ${totalWords} words in ${turns} turns on WORDLINKS! Can you beat my score?`;
        
        switch(platform) {
            case 'facebook':
                this.shareFacebook(shareUrl);
                break;
            case 'twitter':
                this.shareTwitter(shareUrl, shareText);
                break;
            case 'linkedin':
                this.shareLinkedIn(shareUrl, shareText);
                break;
            case 'reddit':
                this.shareReddit(shareUrl, shareText);
                break;
            case 'copy':
                this.copyShareLink(shareUrl);
                break;
        }
    }
    
    
    async createShareableGraphic() {
        const canvas = document.getElementById('shareableGraphic');
        if (!canvas) {
            throw new Error('Canvas not found');
        }
        
        // Get the image data
        const imageData = canvas.toDataURL('image/png');
        
        // Get the actual game session ID from the URL or generate one
        const gameSessionId = this.gameResults.sessionId || ('temp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9));
        
        // Prepare the data to send
        const requestData = {
            gameSessionId: gameSessionId,
            imageData: imageData,
            gameResults: this.gameResults
        };
        
        console.log('🎨 Creating shareable graphic with data:', {
            sessionId: gameSessionId,
            hasImage: !!imageData,
            boardId: this.gameResults.boardId,
            fullGameResults: this.gameResults
        });
        
        // Send to server to create shareable graphic
        const response = await fetch('/api/game/create-shareable', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestData)
        });
        
        if (!response.ok) {
            throw new Error('Failed to create shareable graphic');
        }
        
        const result = await response.json();
        return result.shareUrl;
    }
    
    async createFallbackShareUrl() {
        // Fallback: create a simple shareable URL without server-side storage
        // This could be enhanced to use localStorage or sessionStorage
        console.log('Using fallback share URL creation');
        
        // For now, return the home page with a message encouraging people to play
        return `${window.location.origin}/?shared=true`;
    }
    
    getShareUrl() {
        // This will be the URL to the shareable graphic
        // For now, we'll use the current page URL with parameters
        const baseUrl = window.location.origin;
        const params = new URLSearchParams({
            boardId: this.gameResults.boardId || '',
            date: this.gameResults.date,
            correct: this.gameResults.correctWords,
            turns: this.gameResults.turns
        });
        return `${baseUrl}/results?${params.toString()}`;
    }
    
    setupShareModalListeners() {
        const modal = document.getElementById('shareModal');
        const closeBtn = document.getElementById('closeShareModal');
        const copyBtn = document.getElementById('copyShareLink');
        
        // Close modal
        const closeModal = () => {
            modal.classList.remove('active');
        };
        
        closeBtn.addEventListener('click', closeModal);
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal();
        });
        
        // Copy link
        copyBtn.addEventListener('click', () => {
            const shareLink = document.getElementById('shareLink');
            shareLink.select();
            navigator.clipboard.writeText(shareLink.value).then(() => {
                copyBtn.textContent = 'Copied!';
                copyBtn.classList.add('copied');
                setTimeout(() => {
                    copyBtn.textContent = 'Copy';
                    copyBtn.classList.remove('copied');
                }, 2000);
            });
        });
        
        // Social media share buttons
        document.getElementById('shareTwitter').addEventListener('click', () => this.shareToTwitter());
        document.getElementById('shareFacebook').addEventListener('click', () => this.shareToFacebook());
        document.getElementById('shareLinkedIn').addEventListener('click', () => this.shareToLinkedIn());
        document.getElementById('shareWhatsApp').addEventListener('click', () => this.shareToWhatsApp());
        document.getElementById('shareReddit').addEventListener('click', () => this.shareToReddit());
        document.getElementById('downloadImage').addEventListener('click', () => this.downloadImage());
    }
    
    shareToTwitter() {
        const text = `🧠 WORDLINKS – ${this.gameResults.date}\n${this.gameResults.isWin ? '✅ SOLVED!' : '💪 Good effort!'} ${this.gameResults.correctWords}/20 words in ${this.gameResults.turns} turns`;
        const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(this.getShareUrl())}`;
        window.open(url, '_blank', 'width=550,height=420');
    }
    
    shareToFacebook() {
        const url = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(this.getShareUrl())}`;
        window.open(url, '_blank', 'width=550,height=420');
    }
    
    shareToLinkedIn() {
        const url = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(this.getShareUrl())}`;
        window.open(url, '_blank', 'width=550,height=420');
    }
    
    shareToWhatsApp() {
        const text = `🧠 WORDLINKS – ${this.gameResults.date}\n${this.gameResults.isWin ? '✅ SOLVED!' : '💪 Good effort!'} ${this.gameResults.correctWords}/20 words in ${this.gameResults.turns} turns\n${this.getShareUrl()}`;
        const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
        window.open(url, '_blank');
    }
    
    shareToReddit() {
        const title = `WORDLINKS ${this.gameResults.date} - ${this.gameResults.correctWords}/20 words`;
        const url = `https://reddit.com/submit?url=${encodeURIComponent(this.getShareUrl())}&title=${encodeURIComponent(title)}`;
        window.open(url, '_blank', 'width=550,height=420');
    }
    
    // New inline share methods
    shareTwitter(shareUrl, text) {
        const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(shareUrl)}`;
        window.open(url, '_blank', 'width=550,height=420');
    }
    
    shareFacebook(shareUrl) {
        const url = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`;
        window.open(url, '_blank', 'width=550,height=420');
    }
    
    shareLinkedIn(shareUrl, text) {
        const url = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`;
        window.open(url, '_blank', 'width=550,height=420');
    }
    
    shareReddit(shareUrl, text) {
        const title = `WORDLINKS Result - Check out my score!`;
        const url = `https://reddit.com/submit?url=${encodeURIComponent(shareUrl)}&title=${encodeURIComponent(title)}`;
        window.open(url, '_blank', 'width=550,height=420');
    }
    
    downloadImage() {
        const canvas = document.getElementById('shareableGraphic');
        if (canvas) {
            canvas.toBlob((blob) => {
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.download = `wordlinks-${this.gameResults.date.replace(/\s/g, '-')}.png`;
                link.href = url;
                link.click();
                URL.revokeObjectURL(url);
            });
        }
    }
    
    async copyShareLink(url) {
        try {
            await navigator.clipboard.writeText(url);
            // Show feedback
            const copyBtn = document.querySelector('.share-copy');
            const originalHTML = copyBtn.innerHTML;
            copyBtn.innerHTML = '<svg viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z"/></svg>';
            copyBtn.style.background = '#27AE60';
            copyBtn.style.color = 'white';
            
            setTimeout(() => {
                copyBtn.innerHTML = originalHTML;
                copyBtn.style.background = '';
                copyBtn.style.color = '';
            }, 2000);
        } catch (err) {
            console.error('Failed to copy link:', err);
        }
    }
    
    fallbackShare() {
        const { correctWords, totalWords, turns, maxTurns, timeElapsed, date, isWin } = this.gameResults;
        
        // Create visual representation using emojis
        const turnEmojis = {
            success: '🟢',
            partial: '🟡', 
            failed: '🔴',
            unused: '⚪'
        };
        
        // Create turn visualization
        let turnVisualization = '';
        for (let i = 1; i <= maxTurns; i++) {
            if (i <= turns) {
                const turnData = this.gameResults.turnProgress[i - 1];
                if (turnData) {
                    if (turnData.correct >= 7) turnVisualization += turnEmojis.success;
                    else if (turnData.correct >= 3) turnVisualization += turnEmojis.partial;
                    else turnVisualization += turnEmojis.failed;
                } else {
                    turnVisualization += turnEmojis.success;
                }
            } else {
                turnVisualization += turnEmojis.unused;
            }
        }
        
        // Create grid visualization (4x5 grid with solved words as green squares)
        let gridVisualization = '';
        for (let row = 0; row < 5; row++) {
            for (let col = 0; col < 4; col++) {
                const cellIndex = row * 4 + col;
                gridVisualization += cellIndex < correctWords ? '🟩' : '⬜';
            }
            gridVisualization += '\\n';
        }
        
        const shareText = `🧠 WORDLINKS – ${date}
${isWin ? '✅ SOLVED!' : '💪 Good effort!'} ${correctWords}/20 words
🕒 ${turns}/${maxTurns} turns | ⏱️ ${timeElapsed}

${turnVisualization}

${gridVisualization}
Play at: [Your URL]
#WORDLINKS #PuzzleGame`;
        
        navigator.clipboard.writeText(shareText).then(() => {
            // Show feedback
            const btn = document.getElementById('shareResultsBtn');
            const originalText = btn.textContent;
            btn.textContent = '✅ Copied to clipboard!';
            btn.style.background = 'linear-gradient(135deg, var(--success) 0%, #27ae60 100%)';
            
            setTimeout(() => {
                btn.textContent = originalText;
                btn.style.background = '';
            }, 2000);
        });
    }
    
    async createShareableForSocialMedia() {
        try {
            // Check if we have a canvas
            const canvas = document.getElementById('shareableGraphic');
            if (!canvas) {
                console.log('No canvas found for shareable graphic');
                return;
            }
            
            // Generate the shareable graphic first
            await this.generateShareableGraphic();
            
            // Create a shareable graphic in the database
            const shareUrl = await this.createShareableGraphic();
            
            if (shareUrl) {
                // Update meta tags with the shareable graphic
                this.updateMetaTagsForSharing(shareUrl);
            }
            
        } catch (error) {
            console.error('Failed to create shareable for social media:', error);
        }
    }
    
    updateMetaTagsForSharing(shareUrl) {
        // Update Open Graph image to point to the shareable graphic
        const shareId = shareUrl.split('/share/')[1];
        const imageUrl = `${window.location.origin}/api/share/${shareId}/image`;
        
        // Update existing meta tags
        const ogImage = document.querySelector('meta[property="og:image"]');
        if (ogImage) ogImage.content = imageUrl;
        
        const twitterImage = document.querySelector('meta[name="twitter:image"]');
        if (twitterImage) twitterImage.content = imageUrl;
        
        // Update URL to point to the shareable page
        const ogUrl = document.querySelector('meta[property="og:url"]');
        if (ogUrl) ogUrl.content = shareUrl;
        
        // Update description with actual results
        const { correctWords, totalWords, turns } = this.gameResults;
        const description = `I solved ${correctWords} out of ${totalWords} words in ${turns} turns on WORDLINKS!`;
        
        const ogDesc = document.querySelector('meta[property="og:description"]');
        if (ogDesc) ogDesc.content = description;
        
        const twitterDesc = document.querySelector('meta[name="twitter:description"]');
        if (twitterDesc) twitterDesc.content = description;
        
        console.log('Updated meta tags for sharing:', shareUrl);
    }
}

// Initialize when page loads
document.addEventListener('DOMContentLoaded', () => {
    const resultsPage = new ResultsPage();
    
    // If URL has parameters, create shareable graphic and update meta tags
    if (window.location.search) {
        setTimeout(async () => {
            await resultsPage.createShareableForSocialMedia();
        }, 2000); // Wait for page to fully load
    }
});