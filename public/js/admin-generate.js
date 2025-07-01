class BoardGenerator {
    constructor() {
        this.generatedGroups = null;
        this.selectedBoardType = null;
        this.boardTypes = [];
        this.init();
    }

    async init() {
        await this.loadBoardTypes();
        this.setupEventListeners();
    }

    async loadBoardTypes() {
        try {
            const response = await fetch('/admin/board-types');
            if (!response.ok) {
                throw new Error('Failed to load board types');
            }
            this.boardTypes = await response.json();
            this.displayBoardTypes();
        } catch (error) {
            console.error('Error loading board types:', error);
            document.getElementById('boardSelector').innerHTML = `
                <div class="status-message error">
                    Error loading board types: ${error.message}
                </div>
            `;
        }
    }

    displayBoardTypes() {
        const selector = document.getElementById('boardSelector');
        selector.innerHTML = `
            <div class="board-type-grid">
                ${this.boardTypes.map(boardType => `
                    <div class="board-type-card" data-board-type-id="${boardType.id}">
                        <div class="board-type-icon">${boardType.icon}</div>
                        <div class="board-type-name">${boardType.name}</div>
                        <div class="board-type-description">${boardType.one_liner}</div>
                    </div>
                `).join('')}
            </div>
        `;

        // Add click handlers
        document.querySelectorAll('.board-type-card').forEach(card => {
            card.addEventListener('click', () => {
                const boardTypeId = card.dataset.boardTypeId;
                this.selectBoardType(boardTypeId);
            });
        });
    }

    selectBoardType(boardTypeId) {
        this.selectedBoardType = this.boardTypes.find(bt => bt.id === boardTypeId);
        
        // Update UI
        document.querySelectorAll('.board-type-card').forEach(card => {
            card.classList.toggle('selected', card.dataset.boardTypeId === boardTypeId);
        });

        // Show selected board name
        document.getElementById('selectedBoardName').textContent = 
            `${this.selectedBoardType.icon} ${this.selectedBoardType.name}`;

        // Show step 1
        document.getElementById('step0').classList.add('hidden');
        document.getElementById('step1').classList.remove('hidden');
    }

    setupEventListeners() {
        const btn = document.getElementById('generateWordsBtn');
        if (btn) {
            btn.addEventListener('click', () => {
                this.generateWords();
            });
        }
    }

    async generateWords() {
        const btn = document.getElementById('generateWordsBtn');
        const status = document.getElementById('generateStatus');
        
        btn.disabled = true;
        btn.textContent = 'Generating...';
        status.className = 'status-message loading';
        status.textContent = 'Generating words with AI...';

        try {
            const response = await fetch('/admin/generate-words', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    boardTypeId: this.selectedBoardType?.id || 'wordlinks-daily'
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            this.generatedGroups = data.groups;
            
            status.className = 'status-message success';
            status.textContent = 'Words generated successfully!';
            
            this.displayWordGroups();
            this.showStep(2);

        } catch (error) {
            console.error('Error generating words:', error);
            status.className = 'status-message error';
            status.textContent = `Error: ${error.message}`;
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<span class="btn-icon">🎲</span>Generate Words';
        }
    }

    displayWordGroups() {
        const container = document.getElementById('wordGroups');
        container.innerHTML = '';

        this.generatedGroups.forEach((group, index) => {
            const groupEl = document.createElement('div');
            groupEl.className = 'word-group';
            groupEl.innerHTML = `
                <div class="group-header">
                    <div class="group-theme">${group.theme}</div>
                    <div class="word-count">${group.words.length} words</div>
                </div>
                <div class="group-narrative">${group.narrative}</div>
                <div class="group-scene"><strong>Scene:</strong> ${group.scene || 'Scene description not generated - please regenerate words'}</div>
                <div class="group-words">
                    ${group.words.map(word => {
                        // Handle both old format (string) and new format (object)
                        const wordText = typeof word === 'string' ? word : word.text;
                        const difficulty = typeof word === 'string' ? 'medium' : (word.difficulty || 'Medium').toLowerCase();
                        return `<span class="word-tag difficulty-${difficulty}" data-difficulty="${typeof word === 'string' ? 'Medium' : (word.difficulty || 'Medium')}">${wordText}</span>`;
                    }).join('')}
                </div>
                <div class="image-section">
                    <div class="image-controls">
                        <button class="generate-image-btn" data-group-index="${index}">
                            🎨 Generate Image
                        </button>
                        <button class="refresh-image-btn hidden" data-group-index="${index}">
                            🔄 Regenerate
                        </button>
                    </div>
                    <div class="image-preview" id="imagePreview${index}">
                        <!-- Generated image will appear here -->
                    </div>
                    <div class="status-message" id="imageStatus${index}"></div>
                </div>
            `;
            container.appendChild(groupEl);
        });

        // Add event listeners for image generation
        container.addEventListener('click', (e) => {
            if (e.target.classList.contains('generate-image-btn') || e.target.classList.contains('refresh-image-btn')) {
                const groupIndex = e.target.dataset.groupIndex;
                this.generateImage(groupIndex);
            }
        });

        // Show save board section
        this.showSaveBoardSection();
    }

    showSaveBoardSection() {
        // Show the save board section at the bottom
        const saveBoardHtml = `
            <div id="saveBoardSection" class="save-board-section">
                <h2>Save Board</h2>
                <div class="save-form">
                    <label for="boardTitle">Board Title:</label>
                    <input type="text" id="boardTitle" placeholder="Enter a title for this board" required>
                    <button id="saveBoardBtn" class="primary-btn">
                        <span class="btn-icon">💾</span>
                        Save Board
                    </button>
                    <div id="saveStatus" class="status-message"></div>
                </div>
            </div>
        `;
        
        // Add save section after step 2
        const step2 = document.getElementById('step2');
        if (step2 && !document.getElementById('saveBoardSection')) {
            step2.insertAdjacentHTML('afterend', saveBoardHtml);
            
            // Add event listener for save button
            document.getElementById('saveBoardBtn').addEventListener('click', () => {
                this.saveBoard();
            });
        }
    }

    async generateImage(groupIndex) {
        const group = this.generatedGroups[groupIndex];
        const btn = document.querySelector(`[data-group-index="${groupIndex}"].generate-image-btn, [data-group-index="${groupIndex}"].refresh-image-btn`);
        const status = document.getElementById(`imageStatus${groupIndex}`);
        const preview = document.getElementById(`imagePreview${groupIndex}`);
        
        btn.disabled = true;
        btn.textContent = 'Generating...';
        status.className = 'status-message loading';
        status.textContent = 'Generating image with AI...';

        try {
            const response = await fetch('/admin/generate-image', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    narrative: group.narrative,
                    theme: group.theme,
                    scene: group.scene,
                    groupId: group.id
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            console.log('Image generation response:', data);
            group.imageUrl = data.url;
            
            status.className = 'status-message success';
            status.textContent = 'Image generated successfully!';
            
            // Debug: log the image URL being used
            console.log('Setting image src to:', data.url);
            preview.innerHTML = `<img src="${data.url}" alt="${group.theme}" class="generated-image" onerror="console.error('Image failed to load:', this.src)">`;
            
            // Show refresh button
            const refreshBtn = document.querySelector(`[data-group-index="${groupIndex}"].refresh-image-btn`);
            refreshBtn.classList.remove('hidden');

        } catch (error) {
            console.error('Error generating image:', error);
            status.className = 'status-message error';
            status.textContent = `Error: ${error.message}`;
        } finally {
            btn.disabled = false;
            if (btn.classList.contains('generate-image-btn')) {
                btn.innerHTML = '🎨 Generate Image';
            } else {
                btn.innerHTML = '🔄 Regenerate';
            }
        }
    }


    async saveBoard() {
        const title = document.getElementById('boardTitle').value.trim();
        const btn = document.getElementById('saveBoardBtn');
        const status = document.getElementById('saveStatus');
        
        if (!title) {
            status.className = 'status-message error';
            status.textContent = 'Please enter a board title';
            return;
        }

        btn.disabled = true;
        btn.textContent = 'Saving...';
        status.className = 'status-message loading';
        status.textContent = 'Saving board...';

        try {
            // Prepare the data for saving
            const boardData = {
                title: title,
                boardTypeId: this.selectedBoardType?.id || 'wordlinks-daily',
                groups: this.generatedGroups.map(group => ({
                    theme: group.theme,
                    narrative: group.narrative,
                    words: group.words.map((word, index) => {
                        // Handle both old format (string) and new format (object)
                        if (typeof word === 'string') {
                            return {
                                text: word,
                                difficulty: this.assignDifficulty(group.words.length, index)
                            };
                        } else {
                            return {
                                text: word.text,
                                difficulty: word.difficulty || 'Medium'
                            };
                        }
                    }),
                    imageUrl: group.imageUrl
                }))
            };

            const response = await fetch('/admin/save-board', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(boardData)
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const result = await response.json();
            
            status.className = 'status-message success';
            status.textContent = `Board saved successfully! ID: ${result.boardId}`;

        } catch (error) {
            console.error('Error saving board:', error);
            status.className = 'status-message error';
            status.textContent = `Error: ${error.message}`;
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<span class="btn-icon">💾</span>Save Board';
        }
    }

    assignDifficulty(groupSize, wordIndex) {
        // Distribute difficulty based on group size and position
        if (groupSize === 6) {
            return wordIndex < 4 ? 'easy' : 'medium';
        } else if (groupSize === 5) {
            return wordIndex < 3 ? 'easy' : 'medium';
        } else if (groupSize === 4) {
            return wordIndex < 2 ? 'medium' : 'difficult';
        } else if (groupSize === 3) {
            return wordIndex < 1 ? 'difficult' : 'extremely_difficult';
        } else {
            return 'extremely_difficult';
        }
    }

    showStep(stepNumber) {
        // Show all steps up to and including stepNumber
        for (let i = 1; i <= stepNumber; i++) {
            const step = document.getElementById(`step${i}`);
            if (step) {
                step.classList.remove('hidden');
            }
        }
        
        // Hide any steps after stepNumber
        for (let i = stepNumber + 1; i <= 4; i++) {
            const step = document.getElementById(`step${i}`);
            if (step) {
                step.classList.add('hidden');
            }
        }
    }
}

// Initialize the board generator immediately since script is loaded dynamically
new BoardGenerator();