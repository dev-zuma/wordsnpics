/**
 * Main game class for WORDLINKS puzzle game
 * Players match 20 words to 5 images in 4 turns or less
 */
class WORDLINKSGame {
    constructor() {
        this.currentTurn = 1;
        this.maxTurns = 4;
        this.startTime = Date.now();
        this.correctWords = new Set(); // Words that have been correctly matched
        this.placements = {}; // Current word-to-image assignments {wordId: imageId}
        this.puzzleData = null;
        this.imageUsageCounts = {}; // Tracks temporary selections per image per turn
        this.currentImageIndex = 0;
        this.turnHistory = []; // Records results of each turn
        this.wordTurns = {}; // Track which turn each word was solved in
        this.selectedBoardType = this.getBoardTypeFromURL();
        this.gameCompleted = false; // Track if game is completed
        
        this.init();
    }
    
    getBoardTypeFromURL() {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get('boardType') || 'wordsnpics-daily';
    }
    
    async init() {
        await this.loadBoardTypes();
        
        // Check if user wants to see board selection or play specific game
        if (!this.selectedBoardType || this.selectedBoardType === 'select') {
            await this.showBoardSelection();
        } else {
            // Check if user has already completed today's puzzle
            const hasCompleted = await this.checkCompletionAndShowOverlay();
            
            if (!hasCompleted) {
                await this.loadPuzzle();
                this.setupCarousel();
                this.setupEventListeners();
                this.updateTurnBoxes();
            }
        }
    }
    
    async loadBoardTypes() {
        try {
            const response = await fetch('/api/board-types');
            const boardTypes = await response.json();
            
            const selector = document.getElementById('boardTypeSelector');
            
            // Create options with separator after WordsNPics Daily
            const options = [];
            boardTypes.forEach((boardType, index) => {
                options.push(`
                    <option value="${boardType.id}" ${boardType.id === this.selectedBoardType ? 'selected' : ''}>
                        ${boardType.icon} ${boardType.name}
                    </option>
                `);
                
                // Add separator after WordsNPics Daily (first item)
                if (index === 0 && (boardType.id === 'wordsnpicsdaily' || boardType.id === 'wordsnpics-daily') && boardTypes.length > 1) {
                    options.push('<option disabled>──────────</option>');
                }
            });
            
            selector.innerHTML = options.join('');
            
            // Add change handler
            selector.addEventListener('change', (e) => {
                const newBoardType = e.target.value;
                // Skip separator options
                if (newBoardType && !e.target.disabled) {
                    // Reload page with new board type
                    window.location.href = `/?boardType=${newBoardType}`;
                }
            });
        } catch (error) {
            console.error('Failed to load board types:', error);
        }
    }
    
    async showBoardSelection() {
        try {
            // Hide game interface, show board selection
            document.getElementById('gameInterface').style.display = 'none';
            document.getElementById('boardSelectionContainer').style.display = 'block';
            
            // Load board types and completion status
            const [boardTypesResponse, dailyStatusResponse] = await Promise.all([
                fetch('/api/board-types'),
                fetch('/api/daily-status')
            ]);
            
            const boardTypes = await boardTypesResponse.json();
            const dailyStatus = await dailyStatusResponse.json();
            
            this.renderBoardCards(boardTypes, dailyStatus);
            
        } catch (error) {
            console.error('Error showing board selection:', error);
            // Fallback to regular game if board selection fails
            await this.loadPuzzle();
            this.setupCarousel();
            this.setupEventListeners();
            this.updateTurnBoxes();
        }
    }
    
    renderBoardCards(boardTypes, dailyStatus) {
        const boardGrid = document.getElementById('boardGrid');
        
        const boardCards = boardTypes.map(boardType => {
            const completion = dailyStatus.completionStatus[boardType.id] || { hasCompleted: false };
            const isAuthenticated = dailyStatus.userAuthenticated;
            
            let statusBadge, statusContent = '';
            
            if (completion.hasCompleted) {
                statusBadge = `<span class="board-status-badge completed">Completed</span>`;
                statusContent = `
                    <span class="board-score">${completion.gameSession.correctWords}/${completion.gameSession.totalWords} words</span>
                    <div class="board-status-right">
                        <button class="view-results-btn" onclick="viewGameResults('${completion.gameSession.sessionId}')">View Results</button>
                    </div>
                `;
            } else {
                statusBadge = `<span class="board-status-badge available">Available</span>`;
                statusContent = `<div class="board-status-right"></div>`;
            }
            
            const cardClass = completion.hasCompleted ? 'board-card completed' : 'board-card';
            const clickHandler = completion.hasCompleted ? '' : `onclick="selectBoard('${boardType.id}')"`;
            
            return `
                <div class="${cardClass}" ${clickHandler}>
                    <div class="board-card-content">
                        <div class="board-card-header">
                            <span class="board-card-icon">${boardType.icon}</span>
                            <span class="board-card-title">${boardType.name}</span>
                        </div>
                        <div class="board-card-description">${boardType.description}</div>
                        <div class="board-card-status">
                            <div class="board-status-left">
                                ${statusBadge}
                                ${statusContent}
                            </div>
                        </div>
                        ${completion.hasCompleted ? this.generateCountdownText() : ''}
                    </div>
                </div>
            `;
        }).join('');
        
        boardGrid.innerHTML = boardCards;
    }
    
    generateCountdownText() {
        const now = new Date();
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowRelease = new Date(`${tomorrow.toISOString().split('T')[0]}T12:00:00.000Z`);
        
        const timeUntilNext = tomorrowRelease.getTime() - now.getTime();
        const hours = Math.floor(timeUntilNext / (1000 * 60 * 60));
        const minutes = Math.floor((timeUntilNext % (1000 * 60 * 60)) / (1000 * 60));
        
        return `<div class="countdown-text">Next puzzle in ${hours}h ${minutes}m</div>`;
    }
    
    startLiveCountdown(elementId) {
        const updateCountdown = () => {
            const now = new Date();
            const tomorrow = new Date(now);
            tomorrow.setDate(tomorrow.getDate() + 1);
            const tomorrowRelease = new Date(`${tomorrow.toISOString().split('T')[0]}T12:00:00.000Z`);
            
            const timeUntilNext = tomorrowRelease.getTime() - now.getTime();
            
            if (timeUntilNext <= 0) {
                // Time's up, refresh the page
                window.location.reload();
                return;
            }
            
            const hours = Math.floor(timeUntilNext / (1000 * 60 * 60));
            const minutes = Math.floor((timeUntilNext % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((timeUntilNext % (1000 * 60)) / 1000);
            
            const element = document.getElementById(elementId);
            if (element) {
                element.textContent = `Next puzzle in ${hours}h ${minutes}m ${seconds}s`;
            }
        };
        
        // Update immediately
        updateCountdown();
        
        // Update every second
        const interval = setInterval(updateCountdown, 1000);
        
        // Store interval for cleanup
        if (!this.countdownIntervals) {
            this.countdownIntervals = [];
        }
        this.countdownIntervals.push(interval);
        
        return interval;
    }
    
    clearCountdownIntervals() {
        if (this.countdownIntervals) {
            this.countdownIntervals.forEach(interval => clearInterval(interval));
            this.countdownIntervals = [];
        }
    }
    
    async loadPuzzle() {
        try {
            // Check if this is a daily puzzle request
            const isDailyRequest = this.selectedBoardType && this.selectedBoardType !== 'demo';
            
            if (isDailyRequest) {
                // Try to load today's daily puzzle
                const dailyResponse = await fetch(`/api/daily-puzzle/${this.selectedBoardType}?t=${Date.now()}`);
                
                if (dailyResponse.ok) {
                    const dailyData = await dailyResponse.json();
                    
                    if (!dailyData.available) {
                        // Puzzle not available yet - show countdown
                        this.showPuzzleCountdown(dailyData);
                        return;
                    }
                    
                    // Puzzle is available
                    this.puzzleData = dailyData.puzzle;
                    this.renderCarousel();
                    this.renderWords();
                    this.initImageUsageCounts();
                    
                    // Update submit button text for initial turn
                    const solveBtn = document.getElementById('solveBtn');
                    if (solveBtn) {
                        solveBtn.textContent = this.getSubmitButtonText();
                    }
                    return;
                }
                
                // If daily puzzle fails, fall back to demo mode
                console.warn('Daily puzzle not available, falling back to demo mode');
            }
            
            // Load demo puzzle (fallback or explicit demo request)
            const response = await fetch(`/api/puzzle/demo?boardType=${this.selectedBoardType}&t=${Date.now()}`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            this.puzzleData = await response.json();
            this.renderCarousel();
            this.renderWords();
            this.initImageUsageCounts();
            
            // Update submit button text for initial turn
            const solveBtn = document.getElementById('solveBtn');
            if (solveBtn) {
                solveBtn.textContent = this.getSubmitButtonText();
            }
        } catch (error) {
            console.error('Failed to load puzzle:', error);
            // Show error message to user
            document.getElementById('wordsGrid').innerHTML = `
                <div style="text-align: center; padding: 2rem; color: var(--error);">
                    <p>No games available for this board type yet.</p>
                    <p style="margin-top: 1rem;">
                        <a href="/?boardType=daily" style="color: var(--primary);">← Back to WordLinks Daily</a>
                    </p>
                </div>
            `;
        }
    }
    
    showPuzzleCountdown(dailyData) {
        const { timeUntilRelease, releaseTime, message } = dailyData;
        
        // Hide the game interface elements
        document.getElementById('carouselContainer').style.display = 'none';
        document.querySelector('.words-per-image-section').style.display = 'none';
        document.querySelector('.game-controls-bar').style.display = 'none';
        
        document.getElementById('wordsGrid').innerHTML = `
            <div class="countdown-container">
                <div class="countdown-icon">⏰</div>
                <h2 class="countdown-title">Today's Puzzle<br>Coming Soon!</h2>
                <p class="countdown-message">Today's puzzle will be available at<br><strong>12:00 PM UTC</strong></p>
                <div id="countdown" class="countdown-timer">
                    --:--:--
                </div>
                <p class="countdown-release-time">
                    Releases at<br>${new Date(releaseTime).toLocaleString()}
                </p>
            </div>
        `;
        
        // Start countdown timer
        this.startCountdown(timeUntilRelease);
    }
    
    startCountdown(timeUntilRelease) {
        const countdownElement = document.getElementById('countdown');
        if (!countdownElement) return;
        
        let timeLeft = Math.max(0, Math.floor(timeUntilRelease / 1000));
        
        const updateCountdown = () => {
            if (timeLeft <= 0) {
                // Puzzle should be available now - reload the page
                window.location.reload();
                return;
            }
            
            const hours = Math.floor(timeLeft / 3600);
            const minutes = Math.floor((timeLeft % 3600) / 60);
            const seconds = timeLeft % 60;
            
            countdownElement.textContent = 
                `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            
            timeLeft--;
        };
        
        updateCountdown(); // Initial update
        const interval = setInterval(updateCountdown, 1000);
        
        // Clear interval when page unloads
        window.addEventListener('beforeunload', () => clearInterval(interval));
    }
    
    initImageUsageCounts() {
        this.puzzleData.images.forEach(img => {
            this.imageUsageCounts[img.id] = 0;
        });
    }
    
    /**
     * Resets image usage counts for a new turn
     * imageUsageCounts tracks temporary word selections within the current turn only
     * Recalculates based on current placements that aren't yet marked correct
     */
    resetImageUsageCountsForNewTurn() {
        // Reset all image usage counts to 0 for the new turn
        // imageUsageCounts should only track temporary selections within the current turn
        this.puzzleData.images.forEach(img => {
            this.imageUsageCounts[img.id] = 0;
        });
        
        // Recalculate counts based on current placements (excluding correct words)
        Object.entries(this.placements).forEach(([wordId, imageId]) => {
            // Only count if this word hasn't been marked correct yet
            if (!this.correctWords.has(wordId)) {
                this.imageUsageCounts[imageId] = (this.imageUsageCounts[imageId] || 0) + 1;
            }
        });
    }
    
    /**
     * Renders the image carousel and dice indicators
     * Creates 5 image slides and corresponding dice indicators showing word counts
     */
    renderCarousel() {
        const track = document.getElementById('carouselTrack');
        const indicators = document.getElementById('carouselIndicators');
        track.innerHTML = '';
        indicators.innerHTML = '';
        
        // Sort images by match count in descending order
        this.sortedImages = [...this.puzzleData.images].sort((a, b) => b.matchCount - a.matchCount);
        
        this.sortedImages.forEach((img, index) => {
            // Create carousel slide
            const slide = document.createElement('div');
            slide.className = 'carousel-slide';
            slide.dataset.imageId = img.id;
            
            const imageContainer = document.createElement('div');
            imageContainer.className = 'carousel-image-container';
            
            const imgEl = document.createElement('img');
            imgEl.src = img.url;
            imgEl.alt = img.theme;
            imgEl.onerror = () => {
                imgEl.style.display = 'none';
                const emojiDiv = document.createElement('div');
                emojiDiv.style.fontSize = '3rem';
                emojiDiv.textContent = '📷';
                imageContainer.appendChild(emojiDiv);
            };
            
            imageContainer.appendChild(imgEl);
            slide.appendChild(imageContainer);
            
            track.appendChild(slide);
            
            // Create indicator square with image number background
            const indicator = document.createElement('div');
            indicator.className = 'carousel-indicator';
            indicator.id = `indicator-${img.id}`;
            
            // Add large background number
            const backgroundNumber = document.createElement('div');
            backgroundNumber.className = 'indicator-background-number';
            backgroundNumber.textContent = index + 1;
            
            // Create dots container
            const dotsContainer = document.createElement('div');
            dotsContainer.className = 'indicator-dots';
            
            // Create dice pattern indicators - 9 dots in 3x3 grid showing only dice positions
            const dicePositions = {
                1: [4], // center (like die face 1)
                2: [0, 8], // top-left, bottom-right diagonal (like die face 2)
                3: [0, 4, 8], // top-left, center, bottom-right diagonal (like die face 3)
                4: [0, 2, 6, 8], // all four corners (like die face 4)
                5: [0, 2, 4, 6, 8], // four corners + center (like die face 5)
                6: [0, 2, 3, 5, 6, 8] // left and right columns (like die face 6)
            };
            
            // Create 9 dots for 3x3 grid
            for (let i = 0; i < 9; i++) {
                const dot = document.createElement('div');
                dot.className = 'indicator-dot';
                
                // Determine if this dot should be visible based on dice pattern
                const activeDots = dicePositions[img.matchCount] || [];
                if (activeDots.includes(i)) {
                    dot.dataset.state = 'default';
                } else {
                    dot.dataset.state = 'hidden';
                }
                
                dotsContainer.appendChild(dot);
            }
            
            indicator.appendChild(backgroundNumber);
            indicator.appendChild(dotsContainer);
            
            if (index === 0) indicator.classList.add('active');
            indicator.addEventListener('click', () => this.goToSlide(index));
            indicators.appendChild(indicator);
        });
        
        this.updateCarouselState();
    }
    
    renderWords() {
        const grid = document.getElementById('wordsGrid');
        grid.innerHTML = '';
        
        this.puzzleData.words.forEach(word => {
            const cell = document.createElement('div');
            cell.className = 'word-cell';
            cell.dataset.wordId = word.id;
            
            // Create text span
            const textSpan = document.createElement('span');
            
            // Handle word wrapping for very long words (>8 characters)
            if (word.text.length > 8) {
                const hyphenated = this.hyphenateWord(word.text);
                textSpan.innerHTML = hyphenated;
            } else {
                textSpan.textContent = word.text;
            }
            
            cell.appendChild(textSpan);
            
            if (this.correctWords.has(word.id)) {
                cell.classList.add('correct');
                // Add turn-specific class for border color - PRESERVE existing assignment
                const turnSolved = this.wordTurns[word.id];
                if (turnSolved) {
                    // Clear any existing turn classes first to avoid conflicts
                    cell.classList.remove('turn-1', 'turn-2', 'turn-3', 'turn-4');
                    cell.classList.add(`turn-${turnSolved}`);
                } else {
                }
                
                // Restore background image for correct words too
                if (this.placements[word.id]) {
                    cell.classList.add('has-image');
                    const imageId = this.placements[word.id];
                    const image = this.puzzleData.images.find(img => img.id === imageId);
                    if (image) {
                        cell.style.backgroundImage = `url(${image.url})`;
                    }
                }
            }
            
            if (this.placements[word.id] && !this.correctWords.has(word.id)) {
                cell.classList.add('has-image');
                // Add background image
                const imageId = this.placements[word.id];
                const image = this.puzzleData.images.find(img => img.id === imageId);
                if (image) {
                    cell.style.backgroundImage = `url(${image.url})`;
                }
            }
            
            // Add click event for word selection
            cell.addEventListener('click', (e) => {
                this.handleWordClick(word.id, cell, e);
            });
            
            grid.appendChild(cell);
        });
        
        this.highlightCurrentImageWords();
        
        // Ensure image usage counts are accurate after rendering
        this.recalculateImageUsageCounts();
    }
    
    recalculateImageUsageCounts() {
        // Reset counts
        this.puzzleData.images.forEach(img => {
            this.imageUsageCounts[img.id] = 0;
        });
        
        // Count all current placements that aren't already correct
        Object.entries(this.placements).forEach(([wordId, imageId]) => {
            if (!this.correctWords.has(wordId)) {
                this.imageUsageCounts[imageId] = (this.imageUsageCounts[imageId] || 0) + 1;
            }
        });
    }
    
    setupCarousel() {
        const prevBtn = document.getElementById('carouselPrev');
        const nextBtn = document.getElementById('carouselNext');
        
        prevBtn.addEventListener('click', () => this.previousSlide());
        nextBtn.addEventListener('click', () => this.nextSlide());
        
        // Add keyboard navigation
        document.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowLeft') this.previousSlide();
            if (e.key === 'ArrowRight') this.nextSlide();
        });
        
        // Add swipe support
        this.setupSwipeGestures();
    }
    
    setupSwipeGestures() {
        let touchStartX = 0;
        let touchEndX = 0;
        let touchStartY = 0;
        let touchEndY = 0;
        let isSwiping = false;
        
        const track = document.getElementById('carouselTrack');
        const carouselContainer = document.getElementById('carouselContainer');
        
        // Prevent default touch behavior to improve swipe feel
        carouselContainer.addEventListener('touchstart', (e) => {
            if (e.target.closest('.carousel-track')) {
                e.preventDefault();
            }
        }, { passive: false });
        
        track.addEventListener('touchstart', (e) => {
            touchStartX = e.changedTouches[0].screenX;
            touchStartY = e.changedTouches[0].screenY;
            isSwiping = true;
            track.style.transition = 'none'; // Disable transition during swipe
        });
        
        track.addEventListener('touchmove', (e) => {
            if (!isSwiping) return;
            
            const currentX = e.changedTouches[0].screenX;
            const currentY = e.changedTouches[0].screenY;
            const diffX = touchStartX - currentX;
            const diffY = touchStartY - currentY;
            
            // Only swipe horizontally if horizontal movement is greater than vertical
            if (Math.abs(diffX) > Math.abs(diffY)) {
                e.preventDefault();
                // Add visual feedback during swipe
                const currentTranslate = -this.currentImageIndex * 100;
                const swipeTranslate = currentTranslate - (diffX / track.offsetWidth * 100);
                track.style.transform = `translateX(${swipeTranslate}%)`;
            }
        });
        
        track.addEventListener('touchend', (e) => {
            if (!isSwiping) return;
            
            touchEndX = e.changedTouches[0].screenX;
            touchEndY = e.changedTouches[0].screenY;
            isSwiping = false;
            track.style.transition = ''; // Re-enable transition
            this.handleSwipe();
        });
        
        // Handle touchcancel event
        track.addEventListener('touchcancel', () => {
            isSwiping = false;
            track.style.transition = '';
            this.updateCarouselPosition();
        });
        
        this.handleSwipe = () => {
            const swipeThreshold = 50;
            const diffX = touchStartX - touchEndX;
            const diffY = touchStartY - touchEndY;
            
            // Only process horizontal swipes
            if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > swipeThreshold) {
                if (diffX > 0) {
                    this.nextSlide();
                } else {
                    this.previousSlide();
                }
            } else {
                // If swipe wasn't significant, snap back to current position
                this.updateCarouselPosition();
            }
        };
    }
    
    goToSlide(index) {
        this.currentImageIndex = index;
        this.updateCarouselPosition();
        this.updateCarouselState();
        this.highlightCurrentImageWords();
    }
    
    previousSlide() {
        if (this.currentImageIndex > 0) {
            this.currentImageIndex--;
            this.updateCarouselPosition();
            this.updateCarouselState();
            this.highlightCurrentImageWords();
        }
    }
    
    nextSlide() {
        if (this.currentImageIndex < this.sortedImages.length - 1) {
            this.currentImageIndex++;
            this.updateCarouselPosition();
            this.updateCarouselState();
            this.highlightCurrentImageWords();
        }
    }
    
    updateCarouselPosition() {
        const track = document.getElementById('carouselTrack');
        const offset = -this.currentImageIndex * 100;
        track.style.transform = `translateX(${offset}%)`;
    }
    
    updateCarouselState() {
        const prevBtn = document.getElementById('carouselPrev');
        const nextBtn = document.getElementById('carouselNext');
        const indicators = document.querySelectorAll('.carousel-indicator');
        
        // Update buttons
        prevBtn.disabled = this.currentImageIndex === 0;
        nextBtn.disabled = this.currentImageIndex === this.sortedImages.length - 1;
        
        // Update indicators
        indicators.forEach((indicator, index) => {
            indicator.classList.toggle('active', index === this.currentImageIndex);
        });
        
        // Update slide states
        const slides = document.querySelectorAll('.carousel-slide');
        slides.forEach((slide, index) => {
            const imageId = slide.dataset.imageId;
            const image = this.puzzleData.images.find(img => img.id === imageId);
            
            // Count correct words for this image
            const correctWordsForThisImage = Array.from(this.correctWords).filter(wordId => {
                return this.placements[wordId] === imageId;
            }).length;
            
            const remaining = image.matchCount - correctWordsForThisImage - this.imageUsageCounts[imageId];
            
            slide.classList.toggle('exhausted', remaining <= 0);
        });
    }
    
    hyphenateWord(word) {
        if (word.length <= 6) return word;
        const mid = Math.ceil(word.length / 2);
        return word.slice(0, mid) + '-<br>' + word.slice(mid);
    }
    
    highlightCurrentImageWords() {
        const currentImage = this.sortedImages[this.currentImageIndex];
        if (!currentImage) return;
        
        document.querySelectorAll('.word-cell').forEach(cell => {
            const wordId = cell.dataset.wordId;
            const isCurrentImage = this.placements[wordId] === currentImage.id;
            cell.classList.toggle('highlighted', isCurrentImage);
        });
    }
    
    handleWordClick(wordId, cell, event) {
        // Prevent any selection/unselection after game is completed
        if (this.gameCompleted || this.currentTurn > this.maxTurns) {
            return;
        }
        
        // Don't allow clicking on words that were marked correct in previous turns
        if (this.correctWords.has(wordId)) {
            return;
        }
        
        // Add ripple effect
        this.addRippleEffect(cell);
        
        // Handle unselection: allow unselecting words that were placed in the current turn
        if (this.placements[wordId]) {
            // Check if this word was placed in the current turn (not solved yet)
            const wordTurn = this.wordTurns[wordId];
            if (!wordTurn) { // Word was placed but not solved yet (current turn)
                // Add deselection animation
                cell.classList.add('deselecting');
                setTimeout(() => {
                    cell.classList.remove('deselecting');
                }, 200);
                
                this.unassignImageFromWord(wordId);
            }
            return;
        }
        
        // Add selection animation
        cell.classList.add('selecting');
        setTimeout(() => {
            cell.classList.remove('selecting');
        }, 200);
        
        // Handle new assignment
        this.assignImageToWord(wordId);
    }
    
    addRippleEffect(cell) {
        // Remove any existing ripple class
        cell.classList.remove('ripple');
        
        // Trigger reflow to restart animation
        void cell.offsetWidth;
        
        // Add ripple class
        cell.classList.add('ripple');
        
        // Remove after animation completes
        setTimeout(() => {
            cell.classList.remove('ripple');
        }, 600);
    }
    
    unassignImageFromWord(wordId) {
        if (this.placements[wordId]) {
            const oldImageId = this.placements[wordId];
            this.imageUsageCounts[oldImageId]--;
            delete this.placements[wordId];
            
            // Update just the specific word cell instead of re-rendering everything
            const cell = document.querySelector(`[data-word-id="${wordId}"]`);
            if (cell) {
                cell.classList.remove('has-image');
                cell.style.backgroundImage = '';
            }
            
            this.updateImageCounts();
            this.updateCarouselState();
        }
    }

    /**
     * Assigns a word to the currently selected image
     * Prevents over-assignment by accounting for already-correct words
     * @param {string} wordId - The ID of the word to assign
     */
    assignImageToWord(wordId) {
        const currentImage = this.sortedImages[this.currentImageIndex];
        if (!currentImage) return;
        
        const imageId = currentImage.id;
        
        // Count how many words are already correct for this image
        const correctWordsForThisImage = Array.from(this.correctWords).filter(wId => {
            return this.placements[wId] === imageId;
        }).length;
        
        // Calculate actual remaining slots (total - correct - currently selected)
        const remaining = currentImage.matchCount - correctWordsForThisImage - this.imageUsageCounts[imageId];
        
        // If image is exhausted, shake the carousel
        if (remaining <= 0) {
            const slide = document.querySelector('.carousel-slide.exhausted');
            if (slide) {
                slide.style.animation = 'shake 0.3s ease-in-out';
                setTimeout(() => slide.style.animation = '', 300);
            }
            return;
        }
        
        // Assign new image
        this.placements[wordId] = imageId;
        this.imageUsageCounts[imageId]++;
        
        // Update just the specific word cell instead of re-rendering everything
        const cell = document.querySelector(`[data-word-id="${wordId}"]`);
        if (cell && currentImage) {
            cell.classList.add('has-image');
            cell.style.backgroundImage = `url(${currentImage.url})`;
        }
        
        this.updateImageCounts();
        this.updateCarouselState();
        
        // Auto-advance to next available image if current is exhausted
        const newRemaining = currentImage.matchCount - correctWordsForThisImage - this.imageUsageCounts[imageId];
        if (newRemaining <= 0) {
            // Check if this theme is completely solved
            const wordsForThisImage = this.puzzleData.words.filter(w => w.correctImageId === imageId);
            const correctWordsForThisImage = wordsForThisImage.filter(w => this.correctWords.has(w.id));
            
            if (correctWordsForThisImage.length === wordsForThisImage.length) {
                // Theme is completed! Show celebration
                this.celebrateThemeCompletion(currentImage);
            }
            
            this.advanceToNextAvailable();
        }
    }
    
    advanceToNextAvailable() {
        const nextIndex = this.findNextAvailableImageIndex(this.currentImageIndex);
        if (nextIndex !== -1) {
            this.goToSlide(nextIndex);
        }
    }
    
    findNextAvailableImageIndex(startIndex = 0) {
        // First check from startIndex + 1 to end
        for (let i = startIndex + 1; i < this.sortedImages.length; i++) {
            const image = this.sortedImages[i];
            
            // Count correct words for this image
            const correctWordsForThisImage = Array.from(this.correctWords).filter(wordId => {
                return this.placements[wordId] === image.id;
            }).length;
            
            const remaining = image.matchCount - correctWordsForThisImage - this.imageUsageCounts[image.id];
            if (remaining > 0) {
                return i;
            }
        }
        
        // If no available images after startIndex, circle back from beginning
        for (let i = 0; i <= startIndex; i++) {
            const image = this.sortedImages[i];
            
            // Count correct words for this image
            const correctWordsForThisImage = Array.from(this.correctWords).filter(wordId => {
                return this.placements[wordId] === image.id;
            }).length;
            
            const remaining = image.matchCount - correctWordsForThisImage - this.imageUsageCounts[image.id];
            if (remaining > 0) {
                return i;
            }
        }
        
        return -1; // No available images
    }
    
    moveToFirstAvailableImage() {
        const availableIndex = this.findNextAvailableImageIndex(-1); // Start from beginning
        if (availableIndex !== -1) {
            this.goToSlide(availableIndex);
        }
    }
    
    celebrateThemeCompletion(image) {
        // Find the carousel slide for this image
        const slide = document.querySelector(`[data-image-id="${image.id}"]`);
        if (slide) {
            // Add celebration effect
            slide.style.animation = 'pulse 0.6s ease-in-out';
            setTimeout(() => {
                slide.style.animation = '';
            }, 600);
        }
        
        // Show brief success message with CSS overlay instead of destroying content
        const indicator = document.getElementById(`indicator-${image.id}`);
        if (indicator) {
            // Add celebration class instead of destroying HTML content
            indicator.classList.add('celebration');
            
            setTimeout(() => {
                indicator.classList.remove('celebration');
            }, 1500);
        }
        
    }
    
    /**
     * Updates the dice indicator dots to show word assignment states
     * Green dots = correctly matched words, White dots = current selections, Black dots = available slots
     */
    updateImageCounts() {
        this.puzzleData.images.forEach((img, imgIndex) => {
            const indicator = document.getElementById(`indicator-${img.id}`);
            
            if (indicator) {
                // Count correct words for this specific image using placements data
                const correctWordsForThisImage = Array.from(this.correctWords).filter(wordId => {
                    return this.placements[wordId] === img.id;
                }).length;
                
                // Count current turn selections for this image (temporary selections)
                const currentlySelected = this.imageUsageCounts[img.id] || 0;
                
                // Also count placements that haven't been marked correct yet
                const placementsForThisImage = Object.entries(this.placements).filter(([wordId, imgId]) => {
                    return imgId === img.id && !this.correctWords.has(wordId);
                }).length;
                
                // Update dots to show three states using dice patterns
                const dots = indicator.querySelectorAll('.indicator-dot');
                
                // Define dice positions for this image's match count
                const dicePositions = {
                    1: [4], // center
                    2: [0, 8], // top-left, bottom-right  
                    3: [0, 4, 8], // top-left, center, bottom-right
                    4: [0, 2, 6, 8], // corners
                    5: [0, 2, 4, 6, 8], // corners + center
                    6: [0, 2, 3, 5, 6, 8] // left and right columns
                };
                
                const activeDotPositions = dicePositions[img.matchCount] || [];
                
                // Use the actual placements count instead of imageUsageCounts
                const actualSelected = placementsForThisImage;
                
                dots.forEach((dot, index) => {
                    if (!activeDotPositions.includes(index)) {
                        // This dot position is not part of the dice pattern - hide it
                        dot.dataset.state = 'hidden';
                        return;
                    }
                    
                    // Find which word slot this active dot represents (0-based)
                    const dotSlot = activeDotPositions.indexOf(index);
                    
                    if (dotSlot < correctWordsForThisImage) {
                        // Correctly matched words for this image - green
                        dot.dataset.state = 'correct';
                    } else if (dotSlot < correctWordsForThisImage + actualSelected) {
                        // Currently selected for this turn - white  
                        dot.dataset.state = 'selected';
                    } else {
                        // Available but not selected - black (default)
                        dot.dataset.state = 'default';
                    }
                });
            }
        });
    }
    
    
    updateTurnBoxes() {
        const boxes = document.querySelectorAll('.turn-box');
        
        boxes.forEach((box, index) => {
            const turnNumber = index + 1;
            box.classList.remove('active', 'completed', 'turn-1', 'turn-2', 'turn-3', 'turn-4');
            box.innerHTML = ''; // Clear existing content
            
            // Create turn label
            const turnLabel = document.createElement('div');
            turnLabel.className = 'turn-label';
            turnLabel.textContent = `T${turnNumber}`;
            box.appendChild(turnLabel);
            
            if (turnNumber < this.currentTurn) {
                // This turn is completed
                box.classList.add('completed', `turn-${turnNumber}`);
                const turnData = this.turnHistory[turnNumber - 1];
                const correctCount = turnData ? turnData.correct : 0;
                
                // Add count below label
                const countDiv = document.createElement('div');
                countDiv.className = 'turn-count';
                countDiv.textContent = correctCount;
                box.appendChild(countDiv);
            } else if (turnNumber === this.currentTurn && this.currentTurn <= this.maxTurns) {
                // This is the current turn
                box.classList.add('active');
            } else {
                // This turn hasn't been reached yet
                // Just show the label
            }
        });
    }
    
    setupEventListeners() {
        const solveBtn = document.getElementById('solveBtn');
        const resetBtn = document.getElementById('resetBtn');
        const helpBtn = document.getElementById('helpButton');
        const helpModal = document.getElementById('howToPlayModal');
        const closeHelpBtn = document.getElementById('closeHelpModal');
        
        solveBtn.addEventListener('click', () => this.checkSolution());
        resetBtn.addEventListener('click', () => this.resetGame());
        
        // Help modal functionality
        helpBtn.addEventListener('click', () => {
            helpModal.classList.add('active');
        });
        
        closeHelpBtn.addEventListener('click', () => {
            helpModal.classList.remove('active');
        });
        
        // Close modal when clicking outside
        helpModal.addEventListener('click', (e) => {
            if (e.target === helpModal) {
                helpModal.classList.remove('active');
            }
        });
    }
    
    resetGame() {
        this.placements = {};
        this.correctWords.clear();
        this.imageUsageCounts = {};
        this.currentTurn = 1;
        this.currentImageIndex = 0;
        this.turnHistory = [];
        this.wordTurns = {};
        
        // Reset image usage counts
        this.puzzleData.images.forEach(img => {
            this.imageUsageCounts[img.id] = 0;
        });
        
        this.renderWords();
        this.updateImageCounts();
        this.updateCarouselState();
        this.updateCarouselPosition();
        this.updateTurnBoxes();
        
        // Update submit button text for current turn
        const solveBtn = document.getElementById('solveBtn');
        if (solveBtn) {
            solveBtn.textContent = this.getSubmitButtonText();
        }
    }
    
    getSubmitButtonText() {
        if (this.currentTurn === 1) return 'TURN 1 CHECK';
        if (this.currentTurn === 2) return 'TURN 2 CHECK';
        if (this.currentTurn === 3) return 'TURN 3 CHECK';
        if (this.currentTurn === 4) return 'FINAL SUBMIT';
        return 'FINAL SUBMIT';
    }
    
    async checkSolution() {
        try {
            // Show loading state
            const solveBtn = document.getElementById('solveBtn');
            const originalText = solveBtn.textContent;
            solveBtn.textContent = 'Checking...';
            solveBtn.disabled = true;
            
            // Submit turn to server for validation
            const response = await fetch('/api/game/submit-turn', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    boardId: this.puzzleData.boardId,
                    placements: this.placements,
                    turnNumber: this.currentTurn
                })
            });
            
            if (!response.ok) {
                throw new Error('Failed to validate turn');
            }
            
            const validation = await response.json();
            const results = validation.results;
            
            // Process validated results
            results.correct.forEach(wordId => {
                // Only count as new correct if it wasn't already correct
                if (!this.correctWords.has(wordId)) {
                    this.correctWords.add(wordId);
                    this.wordTurns[wordId] = this.currentTurn; // Track which turn this was solved
                }
            });
            
            // Record turn results  
            const newCorrectCount = results.correct.filter(wordId => !this.wordTurns[wordId] || this.wordTurns[wordId] === this.currentTurn).length;
            this.turnHistory.push({
                turn: this.currentTurn,
                correct: newCorrectCount, // Store only new correct answers for this turn
                incorrect: results.incorrect.length,
                totalCorrect: this.correctWords.size,
                placements: { ...this.placements } // Store placements for final validation
            });
            
            this.animateFeedback(results);
            
            // Remove incorrect placements
            results.incorrect.forEach(wordId => {
                const oldImageId = this.placements[wordId];
                this.imageUsageCounts[oldImageId]--;
                delete this.placements[wordId];
            });
            
            // Check if game is complete before incrementing turn
            if (this.correctWords.size === 20) {
                // All words correct - game won!
                this.gameCompleted = true;
                this.disableGameInteractions();
                setTimeout(() => this.endGame(), 1000);
            } else if (this.currentTurn >= this.maxTurns) {
                // Max turns reached - game over
                this.gameCompleted = true;
                this.disableGameInteractions();
                setTimeout(() => this.endGame(), 1000);
            } else {
                // Game continues - increment turn and prepare for next round
                this.currentTurn++;
                this.updateTurnBoxes();
                
                // Reset image usage counts for new turn - only count permanently placed words
                this.resetImageUsageCountsForNewTurn();
                
                // Reset button state with turn-specific text
                solveBtn.textContent = this.getSubmitButtonText();
                solveBtn.disabled = false;
                
                setTimeout(() => {
                    this.renderWords();
                    this.updateImageCounts();
                    this.updateCarouselState();
                }, 600);
                
                // Move to first available image for the new turn
                setTimeout(() => {
                    this.moveToFirstAvailableImage();
                }, 700);
            }
            
        } catch (error) {
            console.error('Error validating turn:', error);
            // Reset button state
            const solveBtn = document.getElementById('solveBtn');
            solveBtn.textContent = this.getSubmitButtonText();
            solveBtn.disabled = false;
            
            // Show error message
            alert('Failed to validate turn. Please try again.');
        }
    }
    
    animateFeedback(results) {
        const turnBeingPlayed = this.currentTurn; // Capture the turn being played
        results.correct.forEach(wordId => {
            const cell = document.querySelector(`[data-word-id="${wordId}"]`);
            // Remove any conflicting classes first, but keep has-image for background
            cell.classList.remove('highlighted', 'turn-1', 'turn-2', 'turn-3', 'turn-4');
            cell.classList.add('correct', `turn-${turnBeingPlayed}`);
        });
        
        results.incorrect.forEach(wordId => {
            const cell = document.querySelector(`[data-word-id="${wordId}"]`);
            cell.classList.add('incorrect');
            setTimeout(() => {
                cell.classList.remove('incorrect', 'has-image', 'highlighted');
                cell.style.backgroundImage = '';
            }, 500);
        });
    }
    
    disableGameInteractions() {
        // Disable the solve button
        const solveBtn = document.getElementById('solveBtn');
        if (solveBtn) {
            solveBtn.disabled = true;
            solveBtn.textContent = 'Game Complete';
        }
        
        // Disable carousel navigation
        const prevBtn = document.querySelector('.carousel-nav-prev');
        const nextBtn = document.querySelector('.carousel-nav-next');
        if (prevBtn) prevBtn.disabled = true;
        if (nextBtn) nextBtn.disabled = true;
        
        // Disable carousel indicators
        document.querySelectorAll('.carousel-indicator').forEach(indicator => {
            indicator.style.pointerEvents = 'none';
            indicator.style.opacity = '0.6';
        });
        
        // Add visual indication that game is completed
        document.body.classList.add('game-completed');
    }
    
    async endGame() {
        
        const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
        const minutes = Math.floor(elapsed / 60);
        const seconds = elapsed % 60;
        const timeString = `${minutes}:${seconds.toString().padStart(2, '0')}`;
        
        const today = new Date();
        const dateString = today.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
        
        try {
            // Submit final game data to server for validation and scoring
            const gameData = {
                turnHistory: this.turnHistory,
                timeElapsed: timeString,
                startTime: this.startTime,
                endTime: Date.now()
            };
            
            const response = await fetch('/api/game/submit-game', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    boardId: this.puzzleData.boardId,
                    gameData: gameData,
                    sessionId: this.generateSessionId()
                })
            });
            
            if (!response.ok) {
                throw new Error('Failed to submit game');
            }
            
            const finalScore = await response.json();
            // Game submitted successfully
            
            // Build URL parameters for results page using server-validated data
            const params = new URLSearchParams({
                correct: finalScore.score.correctWords,
                turns: finalScore.score.turns,
                time: timeString,
                date: dateString,
                progress: JSON.stringify(this.turnHistory),
                images: JSON.stringify(this.puzzleData.images),
                words: JSON.stringify(this.puzzleData.words),
                wordTurns: JSON.stringify(finalScore.score.wordTurns),
                boardId: this.puzzleData.boardId || '',
                sessionId: finalScore.score.gameSessionId || this.generateSessionId(),
                validated: 'true' // Flag to indicate server validation
            });
            
            // Redirect to results page
            window.location.href = `/results.html?${params.toString()}`;
            
        } catch (error) {
            console.error('Error submitting game:', error);
            
            // Fallback: redirect with client-side data if server submission fails
            const params = new URLSearchParams({
                correct: this.correctWords.size,
                turns: Math.min(this.currentTurn - 1, this.maxTurns),
                time: timeString,
                date: dateString,
                progress: JSON.stringify(this.turnHistory),
                images: JSON.stringify(this.puzzleData.images),
                words: JSON.stringify(this.puzzleData.words),
                wordTurns: JSON.stringify(this.wordTurns),
                boardId: this.puzzleData.boardId || '',
                validated: 'false' // Flag to indicate fallback
            });
            
            window.location.href = `/results.html?${params.toString()}`;
        }
    }
    
    generateSessionId() {
        // Generate a simple session ID for anonymous users
        if (!localStorage.getItem('wordlinks_session')) {
            const sessionId = 'anon_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            localStorage.setItem('wordlinks_session', sessionId);
        }
        return localStorage.getItem('wordlinks_session');
    }
    
    // Check if user has completed today's puzzle for current board type
    async checkCompletionAndShowOverlay() {
        if (!this.selectedBoardType || this.selectedBoardType === 'demo') {
            return false; // No completion check for demo mode
        }
        
        try {
            const response = await fetch(`/api/daily-status/${this.selectedBoardType}`);
            const status = await response.json();
            
            if (status.hasCompleted) {
                this.showCompletionOverlay(status.gameSession);
                return true;
            }
            
            return false;
        } catch (error) {
            console.error('Error checking completion status:', error);
            return false;
        }
    }
    
    showCompletionOverlay(gameSession) {
        const countdownId = `live-countdown-${Date.now()}`;
        const overlay = document.createElement('div');
        overlay.className = 'completion-overlay';
        overlay.innerHTML = `
            <div class="completion-content">
                <div class="completion-icon">✅</div>
                <h2>Puzzle Already Completed!</h2>
                <div class="completion-score">
                    Score: ${gameSession.correctWords}/${gameSession.totalWords} words
                </div>
                <div class="completion-time">
                    Time: ${gameSession.timeElapsed}
                </div>
                <div class="completion-actions">
                    <button onclick="viewGameResults('${gameSession.sessionId}')" class="view-results-button">
                        View Results
                    </button>
                    <button onclick="selectBoard('select')" class="choose-another-button">
                        Choose Another Board
                    </button>
                </div>
                <div class="next-puzzle-info">
                    <div id="${countdownId}">Next puzzle in calculating...</div>
                </div>
            </div>
        `;
        
        document.body.appendChild(overlay);
        
        // Start live countdown
        this.startLiveCountdown(countdownId);
    }
    
}

// Global functions for board selection interface
window.selectBoard = function(boardType) {
    window.location.href = `/?boardType=${boardType}`;
};

window.viewGameResults = async function(sessionId) {
    try {
        const response = await fetch(`/api/game/session/${sessionId}/results-url`);
        const data = await response.json();
        if (data.resultsUrl) {
            window.location.href = data.resultsUrl;
        } else {
            console.error('No results URL returned');
        }
    } catch (error) {
        console.error('Error getting results URL:', error);
    }
};

document.addEventListener('DOMContentLoaded', () => {
    window.gameInstance = new WORDLINKSGame();
});