class BoardManager {
    constructor() {
        this.boardTypes = [];
        this.selectedBoardType = null;
        this.isEditing = false;
        this.init();
    }

    async init() {
        await this.loadBoardTypes();
        this.setupEventListeners();
    }

    async loadBoardTypes() {
        try {
            const response = await fetch('/api/board-types');
            if (!response.ok) {
                throw new Error('Failed to load board types');
            }
            this.boardTypes = await response.json();
            this.displayBoardTypesList();
        } catch (error) {
            console.error('Error loading board types:', error);
            document.getElementById('boardTypesList').innerHTML = `
                <div class="status-message error">
                    Error loading board types: ${error.message}
                </div>
            `;
        }
    }

    displayBoardTypesList() {
        const container = document.getElementById('boardTypesList');
        
        if (this.boardTypes.length === 0) {
            container.innerHTML = `
                <div class="status-message">
                    No board types found.
                </div>
            `;
            return;
        }

        container.innerHTML = this.boardTypes.map(boardType => `
            <div class="board-type-item ${!boardType.is_active ? 'inactive' : ''}" 
                 data-board-type-id="${boardType.id}">
                <div class="board-type-icon">${boardType.icon}</div>
                <div class="board-type-info">
                    <h4>${boardType.name}</h4>
                    <p>${boardType.one_liner}</p>
                </div>
                <div class="board-type-status ${boardType.is_active ? 'active' : 'inactive'}">
                    ${boardType.is_active ? 'Active' : 'Inactive'}
                </div>
            </div>
        `).join('');

        // Add click listeners to board type items
        document.querySelectorAll('.board-type-item').forEach(item => {
            item.addEventListener('click', (e) => {
                const boardTypeId = e.currentTarget.dataset.boardTypeId;
                this.selectBoardType(boardTypeId);
            });
        });
    }

    selectBoardType(boardTypeId) {
        // Update visual selection
        document.querySelectorAll('.board-type-item').forEach(item => {
            item.classList.remove('selected');
        });
        document.querySelector(`[data-board-type-id="${boardTypeId}"]`).classList.add('selected');

        // Load board type for editing
        const boardType = this.boardTypes.find(bt => bt.id === boardTypeId);
        if (boardType) {
            this.selectedBoardType = boardType;
            this.showEditForm(boardType);
        }
    }

    showEditForm(boardType = null) {
        // Hide welcome message, show form
        document.getElementById('welcomeMessage').style.display = 'none';
        document.getElementById('boardEditForm').style.display = 'block';

        // Update form title and button text
        const isNew = !boardType;
        document.getElementById('formTitle').textContent = isNew ? 'Create New Board Type' : 'Edit Board Type';
        document.getElementById('saveBtn').textContent = isNew ? 'Create Board' : 'Save Changes';

        // Populate form fields
        if (boardType) {
            document.getElementById('boardEditId').value = boardType.id;
            document.getElementById('boardId').value = boardType.id;
            document.getElementById('boardName').value = boardType.name;
            document.getElementById('boardIcon').value = boardType.icon;
            document.getElementById('boardOneLiner').value = boardType.one_liner;
            document.getElementById('boardPrompt').value = boardType.prompt;
            document.getElementById('boardDescription').value = boardType.description || '';
            document.getElementById('boardActive').checked = boardType.is_active;
            document.getElementById('boardPremium').checked = boardType.is_premium;

            // Disable ID field for existing boards
            document.getElementById('boardId').disabled = true;
        } else {
            // Clear form for new board
            document.getElementById('boardForm').reset();
            document.getElementById('boardEditId').value = '';
            document.getElementById('boardId').disabled = false;
            document.getElementById('boardActive').checked = true; // Default to active
        }

        this.isEditing = true;
    }

    hideEditForm() {
        document.getElementById('boardEditForm').style.display = 'none';
        document.getElementById('welcomeMessage').style.display = 'block';
        
        // Clear selection
        document.querySelectorAll('.board-type-item').forEach(item => {
            item.classList.remove('selected');
        });
        
        this.selectedBoardType = null;
        this.isEditing = false;
    }

    setupEventListeners() {
        // New Board button
        document.getElementById('newBoardBtn').addEventListener('click', () => {
            this.showEditForm();
        });

        // Cancel button
        document.getElementById('cancelBtn').addEventListener('click', () => {
            this.hideEditForm();
        });

        // Save button
        document.getElementById('saveBtn').addEventListener('click', async () => {
            await this.saveBoardType();
        });

        // Form submission
        document.getElementById('boardForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.saveBoardType();
        });
    }

    async saveBoardType() {
        const form = document.getElementById('boardForm');
        const formData = new FormData(form);
        
        // Get ID from either form data or the input directly (for disabled fields)
        const boardId = formData.get('id') || document.getElementById('boardId').value;
        
        const boardTypeData = {
            id: boardId,
            name: formData.get('name'),
            icon: formData.get('icon'),
            one_liner: formData.get('one_liner'),
            prompt: formData.get('prompt'),
            description: formData.get('description') || formData.get('one_liner'),
            is_active: document.getElementById('boardActive').checked,
            is_premium: document.getElementById('boardPremium').checked
        };

        // Validate required fields
        if (!boardTypeData.id || !boardTypeData.name || !boardTypeData.icon || 
            !boardTypeData.one_liner || !boardTypeData.prompt) {
            alert('Please fill in all required fields');
            console.log('Validation failed:', boardTypeData); // Debug info
            return;
        }

        // Validate ID format
        if (!/^[a-z0-9-]+$/.test(boardTypeData.id)) {
            alert('Board ID must contain only lowercase letters, numbers, and hyphens');
            return;
        }

        try {
            const editId = document.getElementById('boardEditId').value;
            const isNew = !editId;
            
            let response;
            if (isNew) {
                // Create new board type
                response = await fetch('/admin/board-type', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(boardTypeData)
                });
            } else {
                // Update existing board type
                response = await fetch(`/admin/board-type/${editId}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(boardTypeData)
                });
            }

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || `Failed to ${isNew ? 'create' : 'update'} board type`);
            }

            // Success
            alert(`Board type ${isNew ? 'created' : 'updated'} successfully!`);
            
            // Reload board types and hide form
            await this.loadBoardTypes();
            this.hideEditForm();
            
        } catch (error) {
            console.error('Error saving board type:', error);
            alert(`Error: ${error.message}`);
        }
    }

    async toggleBoardTypeStatus(boardTypeId, isActive) {
        try {
            const response = await fetch(`/admin/board-type/${boardTypeId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ is_active: isActive })
            });

            if (!response.ok) {
                throw new Error('Failed to update board type');
            }

            // Reload board types
            await this.loadBoardTypes();
            
            alert(`Board type ${isActive ? 'activated' : 'deactivated'} successfully!`);
        } catch (error) {
            console.error('Error updating board type:', error);
            alert(`Error: ${error.message}`);
        }
    }
}

// Initialize when the script loads
// Check if DOM is already loaded (since this script is loaded dynamically)
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        new BoardManager();
    });
} else {
    // DOM is already loaded, initialize immediately
    new BoardManager();
}