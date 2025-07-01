class BoardViewer {
    constructor() {
        this.boards = [];
        this.boardTypes = [];
        this.selectedBoard = null;
        this.selectedBoardType = 'all';
        this.init();
    }

    async init() {
        await this.loadBoardTypes();
        await this.loadBoardList();
        this.setupEventListeners();
    }

    async loadBoardTypes() {
        try {
            const response = await fetch('/admin/board-types');
            if (!response.ok) {
                throw new Error('Failed to load board types');
            }
            this.boardTypes = await response.json();
            this.displayBoardTypeFilter();
        } catch (error) {
            console.error('Error loading board types:', error);
        }
    }

    displayBoardTypeFilter() {
        const filterContainer = document.getElementById('boardTypeFilter');
        filterContainer.innerHTML = `
            <div class="board-type-dropdown-container">
                <label for="boardTypeSelect" class="dropdown-label">Filter by Board Type:</label>
                <select id="boardTypeSelect" class="board-type-dropdown">
                    <option value="all" ${this.selectedBoardType === 'all' ? 'selected' : ''}>
                        All Boards
                    </option>
                    ${this.boardTypes.map(boardType => `
                        <option value="${boardType.id}" ${this.selectedBoardType === boardType.id ? 'selected' : ''}>
                            ${boardType.icon} ${boardType.name}
                        </option>
                    `).join('')}
                </select>
            </div>
        `;

        // Add change handler for dropdown
        const dropdown = document.getElementById('boardTypeSelect');
        dropdown.addEventListener('change', (e) => {
            this.selectedBoardType = e.target.value;
            this.displayBoardList();
        });
    }

    async loadBoardList() {
        const listContainer = document.getElementById('boardList');
        
        try {
            const response = await fetch('/admin/boards');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            this.boards = await response.json();
            this.displayBoardList();

        } catch (error) {
            console.error('Error loading boards:', error);
            listContainer.innerHTML = `
                <div class="status-message error">
                    Error loading boards: ${error.message}
                </div>
            `;
        }
    }

    displayBoardList() {
        const listContainer = document.getElementById('boardList');
        
        // Filter boards by selected board type
        const filteredBoards = this.selectedBoardType === 'all' 
            ? this.boards 
            : this.boards.filter(board => board.boardTypeId === this.selectedBoardType);
        
        if (filteredBoards.length === 0) {
            listContainer.innerHTML = `
                <div class="status-message">
                    No games found for this board. <a href="/admin/generate-games">Create a new game</a>
                </div>
            `;
            return;
        }

        // Group boards by board type for better display
        const boardType = this.boardTypes.find(bt => bt.id === this.selectedBoardType);
        const boardTypeName = boardType ? `${boardType.icon} ${boardType.name}` : 'All Boards';

        listContainer.innerHTML = filteredBoards.map(board => `
            <div class="board-item" data-board-id="${board.id}">
                <div class="board-name">${board.title || `Game ${board.id}`}</div>
                <div class="board-date">${board.date}</div>
                ${this.selectedBoardType === 'all' ? `<div class="board-type-badge">${this.getBoardTypeBadge(board.boardTypeId)}</div>` : ''}
            </div>
        `).join('');
    }

    getBoardTypeBadge(boardTypeId) {
        const boardType = this.boardTypes.find(bt => bt.id === boardTypeId);
        return boardType ? `${boardType.icon} ${boardType.name}` : boardTypeId;
    }

    setupEventListeners() {
        const listContainer = document.getElementById('boardList');
        const deleteBtn = document.getElementById('deleteBoardBtn');
        
        listContainer.addEventListener('click', (e) => {
            const boardItem = e.target.closest('.board-item');
            if (boardItem) {
                const boardId = boardItem.dataset.boardId;
                this.selectBoard(boardId);
            }
        });

        deleteBtn.addEventListener('click', () => {
            if (this.selectedBoard) {
                this.deleteBoard(this.selectedBoard.id);
            }
        });
    }

    async selectBoard(boardId) {
        // Update selection in UI
        document.querySelectorAll('.board-item').forEach(item => {
            item.classList.remove('selected');
        });
        document.querySelector(`[data-board-id="${boardId}"]`).classList.add('selected');

        // Load and display board details
        await this.loadBoardDetails(boardId);
    }

    async loadBoardDetails(boardId) {
        const detailsSection = document.getElementById('boardDetails');
        const titleElement = document.getElementById('boardTitle');
        const contentElement = document.getElementById('boardContent');
        
        try {
            titleElement.textContent = 'Loading...';
            contentElement.innerHTML = '<div class="loading">Loading board details...</div>';
            detailsSection.classList.remove('hidden');

            const response = await fetch(`/admin/board/${boardId}`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            this.selectedBoard = await response.json();
            this.displayBoardDetails();

        } catch (error) {
            console.error('Error loading board details:', error);
            titleElement.textContent = 'Error';
            contentElement.innerHTML = `
                <div class="status-message error">
                    Error loading board details: ${error.message}
                </div>
            `;
        }
    }

    displayBoardDetails() {
        const titleElement = document.getElementById('boardTitle');
        const contentElement = document.getElementById('boardContent');
        const board = this.selectedBoard;
        
        titleElement.textContent = `${board.title || `Board ${board.id}`} (${board.date})`;
        
        // Group words by image
        const groupedData = board.images.map(image => {
            const groupWords = board.words.filter(word => word.correctImageId === image.id);
            return {
                ...image,
                words: groupWords
            };
        });

        contentElement.innerHTML = groupedData.map(group => `
            <div class="board-group">
                <div class="board-group-header">
                    <img src="${group.url}" alt="${group.theme}" class="board-group-image" 
                         onerror="this.style.display='none'; this.nextElementSibling.style.display='flex'">
                    <div class="placeholder-image" style="display: none; width: 80px; height: 80px; background: var(--soft-bg); border-radius: 8px; align-items: center; justify-content: center; font-size: 2rem;">📷</div>
                    <div class="board-group-info">
                        <h3>${group.theme} (${group.words.length} words)</h3>
                        <div class="board-group-narrative">${group.narrative}</div>
                    </div>
                </div>
                <div class="board-group-words">
                    ${group.words.map(word => {
                        const difficulty = (word.difficulty || 'Medium').toLowerCase();
                        return `<span class="board-word-tag difficulty-${difficulty}" data-difficulty="${word.difficulty || 'Medium'}">
                            ${word.text}
                        </span>`;
                    }).join('')}
                </div>
            </div>
        `).join('');

        // Add difficulty-based styling
        this.addDifficultyStyles();
    }

    addDifficultyStyles() {
        const style = document.createElement('style');
        style.textContent = `
            .board-word-tag[data-difficulty="easy"] {
                background: var(--success);
            }
            .board-word-tag[data-difficulty="medium"] {
                background: var(--secondary);
                color: var(--primary);
            }
            .board-word-tag[data-difficulty="difficult"] {
                background: var(--highlight);
            }
            .board-word-tag[data-difficulty="extremely_difficult"] {
                background: var(--error);
            }
            .board-word-tag[data-difficulty="unknown"] {
                background: var(--disabled);
                color: var(--shadow);
            }
        `;
        
        // Remove any existing difficulty styles
        const existingStyle = document.getElementById('difficulty-styles');
        if (existingStyle) {
            existingStyle.remove();
        }
        
        style.id = 'difficulty-styles';
        document.head.appendChild(style);
    }

    async deleteBoard(boardId) {
        const boardName = this.selectedBoard.title || `Board ${boardId}`;
        
        if (!confirm(`Are you sure you want to delete "${boardName}"? This action cannot be undone and will remove all associated images.`)) {
            return;
        }

        const deleteBtn = document.getElementById('deleteBoardBtn');
        const originalText = deleteBtn.textContent;
        
        try {
            deleteBtn.disabled = true;
            deleteBtn.textContent = 'Deleting...';

            const response = await fetch(`/admin/board/${boardId}`, {
                method: 'DELETE'
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const result = await response.json();
            
            // Remove from boards list
            this.boards = this.boards.filter(board => board.id !== boardId);
            
            // Hide board details
            document.getElementById('boardDetails').classList.add('hidden');
            this.selectedBoard = null;
            
            // Refresh board list
            this.displayBoardList();
            
            alert(`Board "${boardName}" has been successfully deleted.`);

        } catch (error) {
            console.error('Error deleting board:', error);
            alert(`Error deleting board: ${error.message}`);
        } finally {
            deleteBtn.disabled = false;
            deleteBtn.textContent = originalText;
        }
    }
}

// Initialize the board viewer immediately since script is loaded dynamically
new BoardViewer();