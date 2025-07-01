// Daily Puzzle Management JavaScript - Redesigned Interface

class DailyPuzzleManager {
    constructor() {
        this.boardTypes = [];
        this.currentDate = new Date();
        this.selectedDate = null;
        this.selectedBoard = null;
        this.dayStatuses = new Map(); // Cache for day generation statuses
        this.init();
    }

    async init() {
        try {
            console.log('Initializing Daily Puzzle Manager...');
            await this.loadBoardTypes();
            console.log('Board types loaded:', this.boardTypes.length);
            this.setupEventListeners();
            this.renderCalendar();
            this.renderBoardList();
            console.log('Daily Puzzle Manager initialized successfully');
        } catch (error) {
            console.error('Error initializing daily puzzle manager:', error);
            this.showError('Failed to initialize puzzle manager: ' + error.message);
        }
    }

    async loadBoardTypes() {
        try {
            const response = await fetch('/admin/board-types');
            if (!response.ok) throw new Error('Failed to load board types');
            const data = await response.json();
            this.boardTypes = data.filter(bt => bt.is_active);
        } catch (error) {
            console.error('Error loading board types:', error);
            throw error;
        }
    }

    setupEventListeners() {
        // Calendar navigation
        document.getElementById('prevMonth').addEventListener('click', () => {
            this.navigateMonth(-1);
        });

        document.getElementById('nextMonth').addEventListener('click', () => {
            this.navigateMonth(1);
        });

        // Generate all puzzles button
        document.getElementById('generateAllBtn').addEventListener('click', () => {
            this.generateAllPuzzlesForDate();
        });

        // Individual board generation
        document.getElementById('generateGameBtn').addEventListener('click', () => {
            this.generateIndividualPuzzle();
        });

        // Modal close
        const modal = document.getElementById('progressModal');
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                this.hideProgressModal();
            }
        });
    }

    renderCalendar() {
        const monthYear = document.getElementById('monthYear');
        const calendar = document.getElementById('calendar');
        
        // Update month/year display
        const options = { year: 'numeric', month: 'long' };
        monthYear.textContent = this.currentDate.toLocaleDateString('en-US', options);
        
        // Clear existing calendar days (keep headers)
        const existingDays = calendar.querySelectorAll('.calendar-day');
        existingDays.forEach(day => day.remove());
        
        // Calculate first day of month and number of days
        const firstDay = new Date(this.currentDate.getFullYear(), this.currentDate.getMonth(), 1);
        const lastDay = new Date(this.currentDate.getFullYear(), this.currentDate.getMonth() + 1, 0);
        const startDate = new Date(firstDay);
        startDate.setDate(startDate.getDate() - firstDay.getDay()); // Start from Sunday
        
        const today = new Date();
        
        // Generate calendar days
        for (let i = 0; i < 42; i++) { // 6 weeks = 42 days
            const date = new Date(startDate);
            date.setDate(startDate.getDate() + i);
            
            const dayElement = this.createCalendarDay(date, today);
            calendar.appendChild(dayElement);
            
            // Load status for this day
            this.loadDayStatus(date);
        }
    }

    createCalendarDay(date, today) {
        const dayElement = document.createElement('div');
        const isCurrentMonth = date.getMonth() === this.currentDate.getMonth();
        const isToday = date.toDateString() === today.toDateString();
        const isSelected = this.selectedDate && date.toDateString() === this.selectedDate.toDateString();
        
        let classes = ['calendar-day'];
        if (!isCurrentMonth) classes.push('other-month');
        if (isToday) classes.push('today');
        if (isSelected) classes.push('selected');
        
        dayElement.className = classes.join(' ');
        dayElement.textContent = date.getDate();
        dayElement.dataset.date = date.toISOString().split('T')[0];
        
        dayElement.addEventListener('click', () => {
            this.selectDate(date);
        });
        
        return dayElement;
    }

    async loadDayStatus(date) {
        const dateStr = date.toISOString().split('T')[0];
        const dayElement = document.querySelector(`[data-date="${dateStr}"]`);
        
        if (!dayElement || date.getMonth() !== this.currentDate.getMonth()) return;
        
        try {
            // Check how many puzzles exist for this date
            let generatedCount = 0;
            let totalActive = this.boardTypes.length;
            
            for (const boardType of this.boardTypes) {
                try {
                    const status = await this.checkPuzzleStatus(boardType.id, dateStr);
                    if (status.exists) generatedCount++;
                } catch (error) {
                    // Count as not generated
                }
            }
            
            // Store status
            this.dayStatuses.set(dateStr, { generated: generatedCount, total: totalActive });
            
            // Update day appearance
            dayElement.classList.remove('no-boards', 'all-generated', 'partial-generated');
            
            if (generatedCount === 0) {
                dayElement.classList.add('no-boards');
            } else if (generatedCount === totalActive) {
                dayElement.classList.add('all-generated');
            } else {
                dayElement.classList.add('partial-generated');
            }
            
        } catch (error) {
            console.error(`Error loading status for ${dateStr}:`, error);
        }
    }

    async checkPuzzleStatus(boardTypeId, date) {
        try {
            const response = await fetch(`/admin/daily-puzzle-status?boardTypeId=${boardTypeId}&date=${date}`);
            if (response.ok) {
                const data = await response.json();
                return { exists: true, ...data };
            } else if (response.status === 404) {
                return { exists: false };
            } else {
                throw new Error(`HTTP ${response.status}`);
            }
        } catch (error) {
            return { exists: false, error: error.message };
        }
    }

    selectDate(date) {
        // Remove previous selection
        document.querySelectorAll('.calendar-day.selected').forEach(day => {
            day.classList.remove('selected');
        });
        
        // Add selection to clicked day
        const dateStr = date.toISOString().split('T')[0];
        const dayElement = document.querySelector(`[data-date="${dateStr}"]`);
        if (dayElement) {
            dayElement.classList.add('selected');
        }
        
        this.selectedDate = date;
        this.updateSelectedDateInfo();
        this.updateBoardListForDate();
    }

    updateSelectedDateInfo() {
        const selectedDateInfo = document.getElementById('selectedDateInfo');
        const generateAllBtn = document.getElementById('generateAllBtn');
        
        if (this.selectedDate) {
            const dateStr = this.selectedDate.toLocaleDateString('en-US', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            });
            selectedDateInfo.textContent = dateStr;
            generateAllBtn.disabled = false;
        } else {
            selectedDateInfo.textContent = 'Select a date from the calendar';
            generateAllBtn.disabled = true;
        }
    }

    renderBoardList() {
        const boardList = document.getElementById('boardList');
        
        boardList.innerHTML = this.boardTypes.map(boardType => {
            // Use the icon from the board type data if available, otherwise fall back to mapping
            const iconFromData = boardType.icon;
            const iconMap = {
                'travel': '✈️',
                'food': '🍕',
                'sports': '⚽',
                'nature': '🌿',
                'technology': '💻',
                'worldwatch': '🌍',
                'animalkingdom': '🦁',
                'thedownload': '📱',
                'americana': '🇺🇸',
                'wordsnpicsdaily': '🎯'
            };
            
            const icon = iconFromData || iconMap[boardType.id] || '🎲';
            
            return `
                <div class="board-item" data-board-id="${boardType.id}">
                    <div class="board-icon">${icon}</div>
                    <div class="board-info">
                        <div class="board-name">${boardType.name}</div>
                        <div class="board-status" id="status-${boardType.id}">Select a date to check status</div>
                    </div>
                    <div class="board-check" id="check-${boardType.id}" style="display: none;">✓</div>
                </div>
            `;
        }).join('');
        
        // Add click listeners to board items
        document.querySelectorAll('.board-item').forEach(item => {
            item.addEventListener('click', () => {
                this.selectBoard(item.dataset.boardId);
            });
        });
    }

    async updateBoardListForDate() {
        if (!this.selectedDate) return;
        
        const dateStr = this.selectedDate.toISOString().split('T')[0];
        
        for (const boardType of this.boardTypes) {
            const statusElement = document.getElementById(`status-${boardType.id}`);
            const checkElement = document.getElementById(`check-${boardType.id}`);
            
            try {
                const status = await this.checkPuzzleStatus(boardType.id, dateStr);
                
                if (status.exists) {
                    statusElement.textContent = 'Generated ✓';
                    statusElement.style.color = '#28a745';
                    checkElement.style.display = 'block';
                } else {
                    statusElement.textContent = 'Not generated';
                    statusElement.style.color = '#6c757d';
                    checkElement.style.display = 'none';
                }
            } catch (error) {
                statusElement.textContent = 'Error checking status';
                statusElement.style.color = '#dc3545';
                checkElement.style.display = 'none';
            }
        }
    }

    selectBoard(boardId) {
        // Remove previous selection
        document.querySelectorAll('.board-item.selected').forEach(item => {
            item.classList.remove('selected');
        });
        
        // Add selection
        const boardItem = document.querySelector(`[data-board-id="${boardId}"]`);
        if (boardItem) {
            boardItem.classList.add('selected');
        }
        
        this.selectedBoard = this.boardTypes.find(bt => bt.id === boardId);
        this.updateGameDetails();
    }

    async updateGameDetails() {
        const gameTitle = document.getElementById('gameTitle');
        const gameContent = document.getElementById('gameContent');
        const generateGameBtn = document.getElementById('generateGameBtn');
        
        if (!this.selectedBoard) {
            gameTitle.textContent = 'Select a Board';
            gameContent.innerHTML = '<div class="no-selection"><p>Select a date from the calendar and a board from the list to view game details.</p></div>';
            generateGameBtn.style.display = 'none';
            return;
        }
        
        gameTitle.textContent = this.selectedBoard.name;
        
        if (!this.selectedDate) {
            gameContent.innerHTML = '<div class="no-selection"><p>Select a date from the calendar to view game details.</p></div>';
            generateGameBtn.style.display = 'none';
            return;
        }
        
        const dateStr = this.selectedDate.toISOString().split('T')[0];
        
        try {
            // Check if game exists
            const status = await this.checkPuzzleStatus(this.selectedBoard.id, dateStr);
            
            if (status.exists) {
                // Load and display the game
                await this.loadGameDetails(this.selectedBoard.id, dateStr);
                generateGameBtn.style.display = 'none';
            } else {
                // Show generation option
                gameContent.innerHTML = `
                    <div class="no-game">
                        <h4>No Game Generated</h4>
                        <p>No puzzle has been generated for <strong>${this.selectedBoard.name}</strong> on <strong>${dateStr}</strong>.</p>
                        <p>Click the "Generate Game" button to create one.</p>
                    </div>
                `;
                generateGameBtn.style.display = 'inline-flex';
            }
        } catch (error) {
            gameContent.innerHTML = `
                <div class="no-game">
                    <h4>Error Loading Game</h4>
                    <p>Failed to check game status: ${error.message}</p>
                </div>
            `;
            generateGameBtn.style.display = 'none';
        }
    }

    async loadGameDetails(boardId, date) {
        const gameContent = document.getElementById('gameContent');
        
        try {
            gameContent.innerHTML = '<div class="loading">Loading game details...</div>';
            
            // Load the actual game data
            const response = await fetch(`/admin/daily-puzzle?boardTypeId=${boardId}&date=${date}`);
            if (!response.ok) throw new Error('Failed to load game details');
            
            const game = await response.json();
            this.displayGameDetails(game);
            
        } catch (error) {
            gameContent.innerHTML = `
                <div class="no-game">
                    <h4>Error Loading Game</h4>
                    <p>${error.message}</p>
                </div>
            `;
        }
    }

    displayGameDetails(game) {
        const gameContent = document.getElementById('gameContent');
        
        gameContent.innerHTML = `
            <div class="game-display">
                <div class="game-info">
                    <h4>${game.title || 'Daily Puzzle'}</h4>
                </div>
                
                <div class="game-meta">
                    <div class="meta-item">
                        <div class="meta-label">Board Type</div>
                        <div class="meta-value">${this.selectedBoard.name}</div>
                    </div>
                    <div class="meta-item">
                        <div class="meta-label">Date</div>
                        <div class="meta-value">${game.scheduled_date || game.date}</div>
                    </div>
                    <div class="meta-item">
                        <div class="meta-label">Status</div>
                        <div class="meta-value">${game.is_published ? 'Published' : 'Draft'}</div>
                    </div>
                    <div class="meta-item">
                        <div class="meta-label">Groups</div>
                        <div class="meta-value">${game.images?.length || 0}</div>
                    </div>
                </div>
                
                <div class="puzzle-groups">
                    ${(game.images || []).map((image, index) => `
                        <div class="puzzle-group">
                            ${image.url ? `<img src="${image.url}" alt="${image.theme}" class="group-image" onerror="this.style.display='none'">` : 
                              '<div class="group-image">No image available</div>'}
                            <div class="group-content">
                                <div class="group-theme">${image.theme}</div>
                                <div class="group-narrative">${image.narrative}</div>
                                <div class="group-words">
                                    ${(game.words || [])
                                        .filter(word => word.correct_image_id === image.id)
                                        .map(word => `<span class="word-chip ${word.difficulty?.toLowerCase() || 'easy'}">${word.text}</span>`)
                                        .join('')}
                                </div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    navigateMonth(direction) {
        this.currentDate.setMonth(this.currentDate.getMonth() + direction);
        this.dayStatuses.clear(); // Clear cache when changing months
        this.renderCalendar();
        
        // If a date was selected, try to keep it selected in the new month
        if (this.selectedDate && this.selectedDate.getMonth() === this.currentDate.getMonth()) {
            // Re-select the date
            setTimeout(() => {
                const dateStr = this.selectedDate.toISOString().split('T')[0];
                const dayElement = document.querySelector(`[data-date="${dateStr}"]`);
                if (dayElement) {
                    dayElement.classList.add('selected');
                }
            }, 100);
        } else {
            // Clear selection if not in current month
            this.selectedDate = null;
            this.updateSelectedDateInfo();
            this.updateGameDetails();
        }
    }

    async generateAllPuzzlesForDate() {
        if (!this.selectedDate) {
            this.showError('Please select a date first');
            return;
        }
        
        const dateStr = this.selectedDate.toISOString().split('T')[0];
        
        try {
            this.showProgressModal();
            this.updateProgress(0, `Starting generation for ${this.boardTypes.length} board types...`);
            
            const results = [];
            
            for (let i = 0; i < this.boardTypes.length; i++) {
                const boardType = this.boardTypes[i];
                const progress = ((i + 1) / this.boardTypes.length) * 100;
                
                this.updateProgress(progress, `Generating ${boardType.name}...`);
                this.addProgressStep(`Generating puzzle for ${boardType.name}`, 'active');
                
                try {
                    const result = await this.generatePuzzleForBoardType(boardType.id, dateStr);
                    results.push({ boardType: boardType.name, success: true, ...result });
                    this.addProgressStep(`✅ ${boardType.name} completed`, 'completed');
                } catch (error) {
                    console.error(`Failed to generate puzzle for ${boardType.name}:`, error);
                    results.push({ boardType: boardType.name, success: false, error: error.message });
                    this.addProgressStep(`❌ ${boardType.name} failed: ${error.message}`, 'error');
                }
                
                // Delay between generations
                if (i < this.boardTypes.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 2000));
                }
            }
            
            const successCount = results.filter(r => r.success).length;
            this.updateProgress(100, `Generation complete: ${successCount}/${this.boardTypes.length} successful`);
            
            // Hide modal after 3 seconds and refresh
            setTimeout(() => {
                this.hideProgressModal();
                this.loadDayStatus(this.selectedDate);
                this.updateBoardListForDate();
            }, 3000);
            
        } catch (error) {
            console.error('Error in bulk generation:', error);
            this.updateProgress(0, `Generation failed: ${error.message}`);
        }
    }

    async generateIndividualPuzzle() {
        if (!this.selectedBoard || !this.selectedDate) {
            this.showError('Please select both a date and a board type');
            return;
        }
        
        const dateStr = this.selectedDate.toISOString().split('T')[0];
        
        try {
            // Show progress modal for individual generation
            this.showProgressModal();
            document.getElementById('progressTitle').textContent = `Generating ${this.selectedBoard.name}`;
            this.updateProgress(0, 'Starting puzzle generation...');
            this.addProgressStep(`Generating puzzle for ${this.selectedBoard.name}`, 'active');
            
            // Simulate progress updates during generation
            this.updateProgress(25, 'Creating word groups with AI...');
            
            const result = await this.generatePuzzleForBoardType(this.selectedBoard.id, dateStr);
            
            this.updateProgress(75, 'Generating images...');
            this.addProgressStep(`✅ Puzzle content created`, 'completed');
            this.addProgressStep(`Generating images...`, 'active');
            
            // Small delay to show image generation step
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            this.updateProgress(100, 'Puzzle generation complete!');
            this.addProgressStep(`✅ Images generated successfully`, 'completed');
            this.addProgressStep(`✅ ${this.selectedBoard.name} puzzle ready`, 'completed');
            
            // Hide modal after 2 seconds and refresh
            setTimeout(async () => {
                this.hideProgressModal();
                
                // Refresh the display
                await this.updateGameDetails();
                await this.loadDayStatus(this.selectedDate);
                await this.updateBoardListForDate();
                
                this.showSuccess(`Successfully generated puzzle for ${this.selectedBoard.name}`);
            }, 2000);
            
        } catch (error) {
            console.error('Individual generation failed:', error);
            this.updateProgress(0, `Generation failed: ${error.message}`);
            this.addProgressStep(`❌ Generation failed: ${error.message}`, 'error');
            
            setTimeout(() => {
                this.hideProgressModal();
                this.showError(`Generation failed: ${error.message}`);
            }, 2000);
        }
    }

    async generatePuzzleForBoardType(boardTypeId, targetDate) {
        const response = await fetch('/admin/generate-daily-puzzle', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                boardTypeId,
                targetDate
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Generation failed');
        }

        return await response.json();
    }

    // Progress Modal Methods
    showProgressModal() {
        document.getElementById('progressModal').classList.add('show');
        document.getElementById('progressDetails').innerHTML = '';
    }

    hideProgressModal() {
        document.getElementById('progressModal').classList.remove('show');
    }

    updateProgress(percentage, text) {
        document.getElementById('progressFill').style.width = `${percentage}%`;
        document.getElementById('progressText').textContent = text;
    }

    addProgressStep(text, status) {
        const details = document.getElementById('progressDetails');
        const step = document.createElement('div');
        step.className = `progress-step ${status}`;
        
        const icon = status === 'completed' ? '✅' : 
                     status === 'error' ? '❌' : 
                     status === 'active' ? '⏳' : '⋯';
        
        step.innerHTML = `
            <span class="progress-step-icon">${icon}</span>
            <span>${text}</span>
        `;
        
        details.appendChild(step);
        details.scrollTop = details.scrollHeight;
    }

    // Utility Methods
    showError(message) {
        // Simple error display - in production, you'd want a proper toast/notification system
        alert(`Error: ${message}`);
    }

    showSuccess(message) {
        // Simple success display - in production, you'd want a proper toast/notification system
        alert(`Success: ${message}`);
    }
}

// Initialize when DOM is loaded
// Since this script is loaded dynamically, DOMContentLoaded may have already fired
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        console.log('Initializing Daily Puzzle Manager from DOMContentLoaded');
        new DailyPuzzleManager();
    });
} else {
    // DOM is already loaded, initialize immediately
    console.log('DOM already loaded, initializing Daily Puzzle Manager immediately');
    new DailyPuzzleManager();
}