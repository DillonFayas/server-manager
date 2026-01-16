/*
* handlefilemanager.js
* All file manager functionality
*/

// Initialize File Manager state
if (!AppState.fileManager) {
    AppState.fileManager = {
        currentDirectory: '/home/meap',
        currentFile: null,
        editorOpen: false,
        files: [],
        commandHistory: []
    };
}

// Navigate to dashboard
function backToDashboard() {
    AppState.currentView = 'dashboard';
    render();
}

// Show file manager
function showFileManager() {
    AppState.currentView = 'filemanager';
    render();
    // Load initial directory
    setTimeout(() => {
        fileManagerLoadDirectory(AppState.fileManager.currentDirectory);
    }, 100);
}

// Navigate to directory
function fileManagerNavigate(directory) {
    AppState.fileManager.currentDirectory = directory;
    document.getElementById('fm-directory').value = directory;
    document.getElementById('fm-current-dir').textContent = directory;
    fileManagerLoadDirectory(directory);
}

// Navigate up one directory
function fileManagerNavigateUp() {
    const current = AppState.fileManager.currentDirectory;
    if (current === '/') return;
    
    const parts = current.split('/').filter(p => p);
    parts.pop();
    const newDir = '/' + parts.join('/');
    fileManagerNavigate(newDir);
}

// Refresh current directory
function fileManagerRefresh() {
    fileManagerLoadDirectory(AppState.fileManager.currentDirectory);
}

// Load directory contents
async function fileManagerLoadDirectory(directory) {
    const fileList = document.getElementById('fm-file-list');
    if (!fileList) return;
    
    fileList.innerHTML = '<div class="text-center text-muted py-4"><i class="bi bi-hourglass-split"></i> Loading...</div>';
    
    // Update breadcrumb
    fileManagerUpdateBreadcrumb(directory);
    
    try {
        const response = await fetch('/api/execute', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ directory, command: 'ls -lAF' })
        });

        const result = await response.json();
        
        if (result.success && result.output) {
            const lines = result.output.split('\n').filter(l => l.trim() && !l.startsWith('total'));
            AppState.fileManager.files = parseFileList(lines, directory);
            fileManagerDisplayFiles(AppState.fileManager.files);
        } else {
            fileList.innerHTML = '<div class="text-center text-danger py-4"><i class="bi bi-exclamation-triangle"></i> Failed to load directory</div>';
        }
    } catch (error) {
        console.error('Failed to load directory:', error);
        fileList.innerHTML = '<div class="text-center text-danger py-4"><i class="bi bi-x-circle"></i> Error loading directory</div>';
    }
}

// Parse ls -lAF output
function parseFileList(lines, currentDir) {
    const files = [];
    
    lines.forEach(line => {
        const parts = line.split(/\s+/);
        if (parts.length < 9) return;
        
        const permissions = parts[0];
        const name = parts.slice(8).join(' ');
        
        if (name === '.' || name === '..') return;
        
        const isDir = permissions.startsWith('d') || name.endsWith('/');
        const isExecutable = permissions.includes('x') && !isDir;
        const cleanName = name.replace(/[\/@*]$/, '');
        
        files.push({
            name: cleanName,
            isDirectory: isDir,
            isExecutable: isExecutable,
            permissions: permissions,
            size: parts[4],
            path: `${currentDir}/${cleanName}`.replace('//', '/')
        });
    });
    
    // Sort: directories first, then files
    files.sort((a, b) => {
        if (a.isDirectory && !b.isDirectory) return -1;
        if (!a.isDirectory && b.isDirectory) return 1;
        return a.name.localeCompare(b.name);
    });
    
    return files;
}

// Display file list
function fileManagerDisplayFiles(files) {
    const fileList = document.getElementById('fm-file-list');
    if (!fileList) return;
    
    if (files.length === 0) {
        fileList.innerHTML = '<div class="text-center text-muted py-4">Empty directory</div>';
        return;
    }
    
    let html = '<div class="list-group list-group-flush">';
    
    files.forEach(file => {
        const icon = file.isDirectory ? 'folder-fill text-warning' : getFileIcon(file.name);
        const clickAction = file.isDirectory 
            ? `onclick="fileManagerNavigate('${file.path}')"` 
            : `onclick="viewFile('${file.path}')"`;
        
        html += `
            <div class="list-group-item list-group-item-action d-flex align-items-center justify-content-between file-item" 
                 ${clickAction}
                 style="cursor: pointer;">
                <div class="d-flex align-items-center">
                    <i class="bi bi-${icon} me-2"></i>
                    <span>${escapeHtml(file.name)}</span>
                </div>
                <small class="text-muted">${file.isDirectory ? '' : formatFileSize(file.size)}</small>
            </div>
        `;
    });
    
    html += '</div>';
    fileList.innerHTML = html;
}

// Format file size
function formatFileSize(bytes) {
    const size = parseInt(bytes);
    if (isNaN(size)) return bytes;
    
    if (size < 1024) return size + ' B';
    if (size < 1024 * 1024) return (size / 1024).toFixed(1) + ' KB';
    if (size < 1024 * 1024 * 1024) return (size / (1024 * 1024)).toFixed(1) + ' MB';
    return (size / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
}

// Update breadcrumb
function fileManagerUpdateBreadcrumb(directory) {
    const breadcrumb = document.getElementById('fm-breadcrumb');
    if (!breadcrumb) return;
    
    const parts = directory.split('/').filter(p => p);
    
    let html = '<nav aria-label="breadcrumb"><ol class="breadcrumb breadcrumb-sm mb-0">';
    html += `<li class="breadcrumb-item"><a href="#" onclick="fileManagerNavigate('/'); return false;"><i class="bi bi-house-fill"></i></a></li>`;
    
    parts.forEach((part, index) => {
        const path = '/' + parts.slice(0, index + 1).join('/');
        if (index === parts.length - 1) {
            html += `<li class="breadcrumb-item active">${escapeHtml(part)}</li>`;
        } else {
            html += `<li class="breadcrumb-item"><a href="#" onclick="fileManagerNavigate('${path}'); return false;">${escapeHtml(part)}</a></li>`;
        }
    });
    
    html += '</ol></nav>';
    breadcrumb.innerHTML = html;
}

// Show file context menu
function showFileContextMenu(event, filePath, isDirectory) {
    event.preventDefault();
    
    const contextMenu = document.getElementById('fm-context-menu');
    if (!contextMenu) return;
    
    if (isDirectory) {
        contextMenu.innerHTML = `
            <div class="context-menu-item" onclick="fileManagerNavigate('${filePath}'); hideFileContextMenu();">
                <i class="bi bi-folder-open me-2"></i>Open
            </div>
        `;
    } else {
        contextMenu.innerHTML = `
            <div class="context-menu-item" onclick="viewFile('${filePath}'); hideFileContextMenu();">
                <i class="bi bi-eye me-2"></i>View
            </div>
            <div class="context-menu-item" onclick="editFile('${filePath}'); hideFileContextMenu();">
                <i class="bi bi-pencil me-2"></i>Edit
            </div>
            <div class="context-menu-item" onclick="downloadFile('${filePath}'); hideFileContextMenu();">
                <i class="bi bi-download me-2"></i>Download
            </div>
        `;
    }
    
    contextMenu.style.left = event.pageX + 'px';
    contextMenu.style.top = event.pageY + 'px';
    contextMenu.style.display = 'block';
}

function hideFileContextMenu() {
    const contextMenu = document.getElementById('fm-context-menu');
    if (contextMenu) {
        contextMenu.style.display = 'none';
    }
}

// View file
async function viewFile(filePath) {
    await loadFileContent(filePath, false);
}

// Edit file
async function editFile(filePath) {
    await loadFileContent(filePath, true);
}

// Load file content
async function loadFileContent(filePath, isEditing) {
    const fileName = filePath.split('/').pop();
    
    AppState.fileManager.currentFile = {
        name: fileName,
        path: filePath,
        isEditing: isEditing,
        loading: true,
        content: ''
    };
    AppState.fileManager.editorOpen = true;
    
    // Only update the editor column, not the whole page
    updateFileEditorColumn();
    
    try {
        const response = await fetch('/api/file/read', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: filePath })
        });
        
        const result = await response.json();
        
        if (result.success) {
            AppState.fileManager.currentFile = {
                name: fileName,
                path: filePath,
                isEditing: isEditing,
                loading: false,
                content: result.content,
                originalContent: result.content
            };
            updateFileEditorColumn();
        } else {
            alert('Failed to load file: ' + result.message);
            closeFileEditor();
        }
    } catch (error) {
        console.error('Failed to load file:', error);
        alert('Failed to load file: ' + error.message);
        closeFileEditor();
    }
}

// Update just the editor column
function updateFileEditorColumn() {
    const editorCol = document.getElementById('fm-editor-column');
    const terminalCol = document.querySelectorAll('.col-12.col-lg-3, .col-12.col-lg-9')[1];
    
    if (!editorCol) return;
    
    const currentFile = AppState.fileManager.currentFile;
    
    if (!currentFile) {
        editorCol.classList.add('d-none');
        // Expand terminal
        if (terminalCol) {
            terminalCol.className = 'col-12 col-lg-9 border-end';
        }
        return;
    }
    
    editorCol.classList.remove('d-none');
    // Shrink terminal
    if (terminalCol) {
        terminalCol.className = 'col-12 col-lg-3 border-end';
    }
    
    let html = `
        <div class="p-3 border-bottom d-flex justify-content-between align-items-center">
            <div>
                <h6 class="mb-0">
                    <i class="bi bi-${getFileIcon(currentFile.name)}"></i>
                    ${currentFile.name}
                </h6>
                <small class="text-muted">${currentFile.path}</small>
            </div>
            <div class="d-flex gap-2">
                ${currentFile.isEditing ? `
                    <button class="btn btn-sm btn-secondary" onclick="disableEditMode()">
                        <i class="bi bi-eye me-1"></i>View Mode
                    </button>
                    <button class="btn btn-sm btn-success" onclick="saveFileContent()" id="fm-save-btn">
                        <i class="bi bi-save me-1"></i>Save
                    </button>
                ` : `
                    <button class="btn btn-sm btn-primary" onclick="enableEditMode()">
                        <i class="bi bi-pencil me-1"></i>Edit Mode
                    </button>
                `}
                <button class="btn btn-sm btn-secondary" onclick="downloadCurrentFile()">
                    <i class="bi bi-download me-1"></i>Download
                </button>
                <button class="btn btn-sm btn-outline-secondary" onclick="closeFileEditor()">
                    <i class="bi bi-x-lg"></i>
                </button>
            </div>
        </div>
        <div class="flex-grow-1" style="position: relative; overflow: hidden;">
            ${currentFile.loading ? `
                <div class="d-flex flex-column align-items-center justify-content-center h-100">
                    <div class="spinner-border text-primary mb-3" role="status">
                        <span class="visually-hidden">Loading...</span>
                    </div>
                    <p class="mt-2 text-muted">Loading file...</p>
                </div>
            ` : `
                <textarea id="fm-editor" class="form-control h-100 font-monospace" style="resize: none; font-size: 0.9rem; border: none;" 
                    ${!currentFile.isEditing ? 'readonly' : ''}>${escapeHtml(currentFile.content)}</textarea>
            `}
        </div>
    `;
    
    editorCol.innerHTML = html;
}

// Enable edit mode
function enableEditMode() {
    if (AppState.fileManager.currentFile) {
        AppState.fileManager.currentFile.isEditing = true;
        updateFileEditorColumn();
    }
}

// Disable edit mode (return to view)
async function disableEditMode() {
    if (AppState.fileManager.currentFile) {
        const editor = document.getElementById('fm-editor');
        if (editor && editor.value !== AppState.fileManager.currentFile.originalContent) {
            if (!confirm('You have unsaved changes. Discard them?')) {
                return;
            }
        }
        
        // RELOAD THE FILE FROM SERVER
        const filePath = AppState.fileManager.currentFile.path;
        AppState.fileManager.currentFile.loading = true;
        AppState.fileManager.currentFile.isEditing = false;
        updateFileEditorColumn();
        
        try {
            const response = await fetch('/api/file/read', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: filePath })
            });
            
            const result = await response.json();
            
            if (result.success) {
                AppState.fileManager.currentFile.content = result.content;
                AppState.fileManager.currentFile.originalContent = result.content;
                AppState.fileManager.currentFile.loading = false;
                updateFileEditorColumn();
            } else {
                alert('Failed to reload file: ' + result.message);
                AppState.fileManager.currentFile.loading = false;
                updateFileEditorColumn();
            }
        } catch (error) {
            console.error('Failed to reload file:', error);
            alert('Failed to reload file: ' + error.message);
            AppState.fileManager.currentFile.loading = false;
            updateFileEditorColumn();
        }
    }
}

// Save file content
async function saveFileContent() {
    const currentFile = AppState.fileManager.currentFile;
    if (!currentFile) return;
    
    const editor = document.getElementById('fm-editor');
    if (!editor) return;
    
    const content = editor.value;
    const saveBtn = document.getElementById('fm-save-btn');
    
    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<i class="bi bi-hourglass-split me-1"></i>Saving...';
    }
    
    try {
        const response = await fetch('/api/file/write', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                path: currentFile.path,
                content: content
            })
        });
        
        const result = await response.json();
        
        if (result.success) {
            AppState.fileManager.currentFile.originalContent = content;
            showSuccessModal('File saved successfully!');
        } else {
            showSuccessModal('Failed to save file: ' + result.message, true);
        }
    } catch (error) {
        console.error('Failed to save file:', error);
        showSuccessModal('Failed to save file: ' + error.message, true);
    } finally {
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.innerHTML = '<i class="bi bi-save me-1"></i>Save';
        }
    }
}

// Show success/error modal
function showSuccessModal(message, isError = false) {
    const modalId = 'fm-success-modal';
    let modal = document.getElementById(modalId);
    
    if (!modal) {
        const modalHtml = `
            <div id="${modalId}" class="modal" style="display: none;">
                <div class="modal-dialog">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title" id="${modalId}-title">Success</h5>
                            <button type="button" class="btn-close" onclick="closeSuccessModal()"></button>
                        </div>
                        <div class="modal-body" id="${modalId}-body">
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-primary" onclick="closeSuccessModal()">OK</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        modal = document.getElementById(modalId);
    }
    
    const title = document.getElementById(`${modalId}-title`);
    const body = document.getElementById(`${modalId}-body`);
    
    title.textContent = isError ? 'Error' : 'Success';
    body.innerHTML = `<p>${message}</p>`;
    
    modal.classList.add('show');
    modal.style.display = 'block';
}

function closeSuccessModal() {
    const modal = document.getElementById('fm-success-modal');
    if (modal) {
        modal.classList.remove('show');
        modal.style.display = 'none';
    }
}

// Close file editor
function closeFileEditor() {
    const currentFile = AppState.fileManager.currentFile;
    
    if (currentFile && currentFile.isEditing) {
        const editor = document.getElementById('fm-editor');
        if (editor && editor.value !== currentFile.originalContent) {
            if (!confirm('You have unsaved changes. Are you sure you want to close?')) {
                return;
            }
        }
    }
    
    AppState.fileManager.currentFile = null;
    AppState.fileManager.editorOpen = false;
    updateFileEditorColumn();
    
    // Refresh file list to ensure it's up to date
    const fileList = document.getElementById('fm-file-list');
    if (fileList && AppState.fileManager.files.length > 0) {
        fileManagerDisplayFiles(AppState.fileManager.files);
    }
}

// Execute command in file manager terminal
async function executeFileManagerCommand() {
    const directory = AppState.fileManager.currentDirectory;
    const command = document.getElementById('fm-command-input').value.trim();
    const outputDiv = document.getElementById('fm-terminal-output');
    const executeBtn = document.getElementById('fm-execute-btn');
    
    if (!command) return;
    
    // Add to history
    if (!AppState.fileManager.commandHistory.includes(command)) {
        AppState.fileManager.commandHistory.push(command);
    }
    
    executeBtn.disabled = true;
    executeBtn.innerHTML = '<i class="bi bi-hourglass-split"></i>';
    outputDiv.innerHTML = '<div class="text-muted">Executing...</div>';
    
    try {
        const response = await fetch('/api/execute', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ directory, command })
        });

        const result = await response.json();
        
        outputDiv.innerHTML = '';
        if (result.output) {
            const lines = result.output.split('\n');
            lines.forEach(line => {
                const lineDiv = document.createElement('div');
                lineDiv.textContent = line;
                outputDiv.appendChild(lineDiv);
            });
        } else {
            outputDiv.innerHTML = '<div class="text-muted">No output</div>';
        }
        
        if (AppState.clearCommandOnExecute) {
            document.getElementById('fm-command-input').value = '';
        }
    } catch (error) {
        outputDiv.innerHTML = `<div class="text-danger">Error: ${error.message}</div>`;
    } finally {
        executeBtn.disabled = false;
        executeBtn.innerHTML = '<i class="bi bi-play-fill"></i>';
    }
}

function handleFileManagerCommandKeypress(event) {
    if (event.key === 'Enter') {
        executeFileManagerCommand();
    }
}

function handleFileManagerCommandKeydown(event) {
    // TODO: Add command history navigation with up/down arrows
}

// File upload handlers
function handleDragOver(event) {
    event.preventDefault();
    event.currentTarget.classList.add('drag-over');
}

function handleDragLeave(event) {
    event.currentTarget.classList.remove('drag-over');
}

async function handleFileDrop(event) {
    event.preventDefault();
    event.currentTarget.classList.remove('drag-over');
    
    const files = event.dataTransfer.files;
    if (files.length > 0) {
        await uploadFiles(files);
    }
}

function handleFileSelect(event) {
    const files = event.target.files;
    if (files.length > 0) {
        uploadFiles(files);
    }
}

async function uploadFiles(files) {
    const directory = AppState.fileManager.currentDirectory;
    
    for (let file of files) {
        // Check if file exists
        const exists = AppState.fileManager.files.some(f => f.name === file.name);
        if (exists) {
            if (!confirm(`File "${file.name}" already exists. Overwrite?`)) {
                continue;
            }
        }
        
        await uploadFile(file, directory);
    }
    
    // Refresh directory
    fileManagerRefresh();
}

async function uploadFile(file, directory) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('directory', directory);
    
    try {
        const response = await fetch('/api/file/upload', {
            method: 'POST',
            body: formData
        });
        
        const result = await response.json();
        
        if (!result.success) {
            alert(`Failed to upload ${file.name}: ${result.message}`);
        }
    } catch (error) {
        console.error('Failed to upload file:', error);
        alert(`Failed to upload ${file.name}: ${error.message}`);
    }
}

// Click outside to close context menu
document.addEventListener('click', (e) => {
    if (!e.target.closest('.context-menu')) {
        hideFileContextMenu();
    }
});