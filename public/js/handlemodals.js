/*
* handlemodals.js
* Modal control functions
*/

// Add/Edit Project Modal
function showAddProjectModal() {
    AppState.editingProjectId = null;
    document.getElementById('modal-title').textContent = 'Add New Project';
    document.getElementById('project-name').value = '';
    document.getElementById('project-path').value = '';
    document.getElementById('project-command').value = '';
    document.getElementById('project-tags').value = '';
    document.getElementById('project-auto-restart').checked = false;
    document.getElementById('project-email-crash').checked = false;
    document.getElementById('add-project-modal').classList.add('show');
    document.getElementById('add-project-modal').style.display = 'block';
}

function editProject(id) {
    const project = AppState.projects.find(p => p.id === id);
    if (!project) return;

    AppState.editingProjectId = id;
    document.getElementById('modal-title').textContent = 'Edit Project';
    document.getElementById('project-name').value = project.name;
    document.getElementById('project-path').value = project.path;
    document.getElementById('project-command').value = project.command;
    document.getElementById('project-tags').value = (project.tags || []).join(', ');
    document.getElementById('project-auto-restart').checked = project.autoRestart;
    document.getElementById('project-email-crash').checked = project.emailOnCrash || false;
    document.getElementById('add-project-modal').classList.add('show');
    document.getElementById('add-project-modal').style.display = 'block';
}

function closeAddProjectModal() {
    document.getElementById('add-project-modal').classList.remove('show');
    document.getElementById('add-project-modal').style.display = 'none';
    AppState.editingProjectId = null;
}

// Update Modal
function showUpdateModal(result) {
    const modal = document.getElementById('update-modal');
    const messageDiv = document.getElementById('update-modal-message');
    const outputDiv = document.getElementById('update-modal-output');

    if (!modal || !messageDiv || !outputDiv) {
        console.error('Update modal elements not found');
        return;
    }

    if (result.success) {
        messageDiv.innerHTML = `<div class="alert alert-success mb-0">
            <i class="bi bi-check-circle me-2"></i>Update successful!
        </div>`;
    } else {
        messageDiv.innerHTML = `<div class="alert alert-danger mb-0">
            <i class="bi bi-exclamation-triangle me-2"></i>Update failed: ${result.message || 'Unknown error'}
        </div>`;
    }

    outputDiv.textContent = result.output || 'No output';
    modal.classList.add('show');
    modal.style.display = 'block';
}

function closeUpdateModal() {
    const modal = document.getElementById('update-modal');
    if (modal) {
        modal.classList.remove('show');
        modal.style.display = 'none';
    }
    fetchProjects();
}

// Logs Modal - REMOVED CLEAR LOGS CALL, FIX TIMESTAMP ISSUE
function viewLogs(id) {
    const project = AppState.projects.find(p => p.id === id);
    if (!project) return;

    // Clear rawLogs when opening/switching projects
    AppState.rawLogs = [];
    AppState.currentProject = project;
    AppState.lastLog = null;
    AppState.logCount = 1;
    
    // DO NOT clear logs on server - this was the issue
    
    document.getElementById('logs-title').innerHTML = `<i class="bi bi-file-text me-2"></i>Logs: ${project.name}`;
    document.getElementById('logs-container').innerHTML = '<div class="text-muted">Connecting...</div>';
    document.getElementById('logs-modal').classList.add('show');
    document.getElementById('logs-modal').style.display = 'block';

    if (AppState.currentLogWs) {
        AppState.currentLogWs.close();
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    AppState.currentLogWs = new WebSocket(`${protocol}//${window.location.host}/logs/${id}`);

    AppState.currentLogWs.onmessage = (event) => {
        const container = document.getElementById('logs-container');
        let logData;
        
        // Parse JSON or fallback to plain text
        try {
            logData = JSON.parse(event.data);
        } catch (e) {
            // If it's plain text (old logs), use current time
            logData = { text: event.data, timestamp: new Date().toLocaleTimeString() };
        }
        
        const log = logData.text;
        const timestamp = logData.timestamp;
        
        // Store with the actual timestamp from server
        AppState.rawLogs.push({ text: log, timestamp: timestamp });
        
        if (container.querySelector('.text-muted')) {
            container.innerHTML = '';
        }

        if (AppState.logDeduplication && log === AppState.lastLog) {
            AppState.logCount++;
            const lastLine = container.lastElementChild;
            if (lastLine && lastLine.querySelector('.log-count')) {
                lastLine.querySelector('.log-count').textContent = ` x${AppState.logCount}`;
            }
        } else {
            AppState.logCount = 1;
            AppState.lastLog = log;
            
            const logLine = document.createElement('div');
            logLine.className = 'log-line';
            const colorClass = colorizeLog(log);
            const timestampHtml = AppState.showTimestamps ? `<span class="log-timestamp">[${timestamp}]</span>` : '';
            logLine.innerHTML = `${timestampHtml}<span class="log-text ${colorClass}">${escapeHtml(log)}</span><span class="log-count text-warning"></span>`;
            container.appendChild(logLine);
        }
        
        if (AppState.autoScroll) {
            container.scrollTop = container.scrollHeight;
        }
    };

    AppState.currentLogWs.onerror = (error) => {
        console.error('WebSocket error:', error);
    };
}

function closeLogsModal() {
    if (AppState.currentLogWs) {
        AppState.currentLogWs.close();
        AppState.currentLogWs = null;
    }
    document.getElementById('logs-modal').classList.remove('show');
    document.getElementById('logs-modal').style.display = 'none';
}

function clearLogs() {
    if (!AppState.currentProject) return;
    
    // Clear on server
    fetch(`/api/projects/${AppState.currentProject.id}/clear-logs`, { method: 'POST' }).catch(console.error);
    
    const container = document.getElementById('logs-container');
    container.innerHTML = '<div class="text-muted">Logs cleared. Waiting for new output...</div>';
    AppState.rawLogs = [];
    AppState.lastLog = null;
    AppState.logCount = 1;
}

function toggleAutoScroll() {
    AppState.autoScroll = !AppState.autoScroll;
    document.getElementById('autoscroll-status').textContent = `Auto-scroll: ${AppState.autoScroll ? 'ON' : 'OFF'}`;
}

function toggleTimestamps() {
    AppState.showTimestamps = !AppState.showTimestamps;
    document.getElementById('timestamp-status').textContent = `Timestamps: ${AppState.showTimestamps ? 'ON' : 'OFF'}`;
    redisplayLogs();
}

function toggleDeduplication() {
    AppState.logDeduplication = !AppState.logDeduplication;
    document.getElementById('dedup-status').textContent = `Dedup: ${AppState.logDeduplication ? 'ON' : 'OFF'}`;
    redisplayLogs();
}

function redisplayLogs() {
    const container = document.getElementById('logs-container');
    container.innerHTML = '';
    AppState.lastLog = null;
    AppState.logCount = 1;
    
    AppState.rawLogs.forEach(logData => {
        const log = logData.text;
        if (AppState.logDeduplication && log === AppState.lastLog) {
            AppState.logCount++;
            const lastLine = container.lastElementChild;
            if (lastLine && lastLine.querySelector('.log-count')) {
                lastLine.querySelector('.log-count').textContent = ` x${AppState.logCount}`;
            }
        } else {
            AppState.logCount = 1;
            AppState.lastLog = log;
            const logLine = document.createElement('div');
            logLine.className = 'log-line';
            const colorClass = colorizeLog(log);
            const timestampHtml = AppState.showTimestamps ? `<span class="log-timestamp">[${logData.timestamp}]</span>` : '';
            logLine.innerHTML = `${timestampHtml}<span class="log-text ${colorClass}">${escapeHtml(log)}</span><span class="log-count text-warning"></span>`;
            container.appendChild(logLine);
        }
    });
}

function filterLogs() {
    const filterText = document.getElementById('log-filter').value.toLowerCase();
    const container = document.getElementById('logs-container');
    const lines = container.querySelectorAll('.log-line');
    
    lines.forEach(line => {
        const text = line.querySelector('.log-text').textContent.toLowerCase();
        line.style.display = text.includes(filterText) ? '' : 'none';
    });
}

function exportLogs() {
    if (!AppState.currentProject) return;
    
    const logsText = AppState.rawLogs.map(logData => {
        const timestamp = AppState.showTimestamps ? `[${logData.timestamp}] ` : '';
        return `${timestamp}${logData.text}`;
    }).join('\n');
    
    const blob = new Blob([logsText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${AppState.currentProject.name}-logs-${new Date().toISOString().split('T')[0]}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// Command Modal with default /home/meap directory and auto-ls
function showCommandModal() {
    const defaultDir = '/home/meap';
    AppState.currentWorkingDir = defaultDir;
    AppState.availableDirectories = [];
    AppState.currentFiles = [];
    
    const modal = document.getElementById('command-modal');
    modal.classList.add('show');
    modal.style.display = 'block';
    
    // Set values after modal is shown
    setTimeout(() => {
        document.getElementById('command-directory').value = defaultDir;
        document.getElementById('command-input').value = '';
        document.getElementById('command-output').innerHTML = '<div style="color: #ccc;">No output yet. Enter a command and click Execute.</div>';
        
        // Set the toggle based on saved preference
        const toggle = document.getElementById('clear-command-toggle');
        if (toggle) {
            toggle.checked = AppState.clearCommandOnExecute;
        }
        
        // Load and display directory contents
        loadDirectoryContents(defaultDir);
    }, 0);
}

function closeCommandModal() {
    const modal = document.getElementById('command-modal');
    if (modal) {
        modal.classList.remove('show');
        modal.style.display = 'none';
        // Clear available directories when closing
        AppState.availableDirectories = [];
        AppState.currentFiles = [];
    }
}

function toggleClearCommand(checked) {
    AppState.clearCommandOnExecute = checked;
    localStorage.setItem('clearCommandOnExecute', checked.toString());
}

function selectProjectDirectory() {
    const select = document.getElementById('project-directory-select');
    const path = select.value;
    if (path) {
        document.getElementById('command-directory').value = path;
        AppState.currentWorkingDir = path;
        loadDirectoryContents(path);
    }
    select.selectedIndex = 0;
}

function updateCurrentDir() {
    const dir = document.getElementById('command-directory').value.trim();
    AppState.currentWorkingDir = dir;
    
    // Load directory contents
    if (dir) {
        loadDirectoryContents(dir);
    }
}

function navigateUp() {
    const currentDir = document.getElementById('command-directory').value.trim();
    if (!currentDir || currentDir === '/') return;
    
    const parts = currentDir.split('/').filter(p => p);
    if (parts.length > 0) {
        parts.pop();
        const newDir = '/' + parts.join('/');
        document.getElementById('command-directory').value = newDir;
        AppState.currentWorkingDir = newDir;
        loadDirectoryContents(newDir);
    }
}

function refreshDirectory() {
    const currentDir = document.getElementById('command-directory').value.trim();
    if (currentDir) {
        loadDirectoryContents(currentDir);
    }
}

function navigateToDirectory(dir) {
    document.getElementById('command-directory').value = dir;
    AppState.currentWorkingDir = dir;
    loadDirectoryContents(dir);
}

function navigateToBreadcrumb(index) {
    const currentDir = document.getElementById('command-directory').value.trim();
    const parts = currentDir.split('/').filter(p => p);
    
    if (index === -1) {
        // Root
        navigateToDirectory('/');
    } else {
        const newParts = parts.slice(0, index + 1);
        const newDir = '/' + newParts.join('/');
        navigateToDirectory(newDir);
    }
}

// Load and display directory contents
async function loadDirectoryContents(directory) {
    if (!directory) return;
    
    const fileBrowser = document.getElementById('file-browser');
    if (!fileBrowser) return;
    
    fileBrowser.innerHTML = '<div class="text-center text-muted py-4"><i class="bi bi-hourglass-split"></i> Loading...</div>';
    
    // Update breadcrumb
    updateBreadcrumb(directory);
    
    try {
        const response = await fetch('/api/execute', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ directory, command: 'ls -F' })
        });

        const result = await response.json();
        
        if (result.success && result.output) {
            const items = result.output.split('\n')
                .map(l => l.trim())
                .filter(l => l);
            
            AppState.currentFiles = items;
            displayFileBrowser(items, directory);
        } else {
            fileBrowser.innerHTML = `<div class="text-center text-danger py-4">
                <i class="bi bi-exclamation-triangle"></i> Directory not accessible or empty
            </div>`;
        }
    } catch (error) {
        console.error('Failed to load directory:', error);
        fileBrowser.innerHTML = `<div class="text-center text-danger py-4">
            <i class="bi bi-x-circle"></i> Failed to load directory
        </div>`;
    }
}

// Display file browser with files and folders
function displayFileBrowser(items, currentDir) {
    const fileBrowser = document.getElementById('file-browser');
    if (!fileBrowser) return;
    
    if (items.length === 0) {
        fileBrowser.innerHTML = '<div class="text-center text-muted py-4">Empty directory</div>';
        return;
    }
    
    // Separate directories and files
    const directories = items.filter(item => item.endsWith('/')).map(item => item.slice(0, -1));
    const files = items.filter(item => !item.endsWith('/'));
    
    let html = '<div class="list-group list-group-flush">';
    
    // Add directories first
    directories.forEach(dir => {
        html += `
            <div class="list-group-item list-group-item-action d-flex align-items-center file-item" 
                 onclick="navigateToDirectory('${currentDir}/${dir}' .replace('//', '/'))" 
                 style="cursor: pointer;">
                <i class="bi bi-folder-fill text-warning me-2"></i>
                <span>${escapeHtml(dir)}</span>
            </div>
        `;
    });
    
    // Add files
    files.forEach(file => {
        const isExecutable = file.endsWith('*');
        const fileName = isExecutable ? file.slice(0, -1) : file;
        const icon = isExecutable ? 'bi-file-earmark-code-fill text-success' : 'bi-file-earmark text-secondary';
        
        html += `
            <div class="list-group-item d-flex align-items-center file-item">
                <i class="bi ${icon} me-2"></i>
                <span>${escapeHtml(fileName)}</span>
            </div>
        `;
    });
    
    html += '</div>';
    fileBrowser.innerHTML = html;
}

// Update breadcrumb navigation
function updateBreadcrumb(directory) {
    const breadcrumbContainer = document.getElementById('breadcrumb-container');
    if (!breadcrumbContainer) return;
    
    const parts = directory.split('/').filter(p => p);
    
    let html = '<nav aria-label="breadcrumb"><ol class="breadcrumb mb-0">';
    
    // Root
    html += `<li class="breadcrumb-item"><a href="#" onclick="navigateToBreadcrumb(-1); return false;" style="cursor: pointer;"><i class="bi bi-house-fill"></i></a></li>`;
    
    // Path parts
    parts.forEach((part, index) => {
        if (index === parts.length - 1) {
            html += `<li class="breadcrumb-item active">${escapeHtml(part)}</li>`;
        } else {
            html += `<li class="breadcrumb-item"><a href="#" onclick="navigateToBreadcrumb(${index}); return false;" style="cursor: pointer;">${escapeHtml(part)}</a></li>`;
        }
    });
    
    html += '</ol></nav>';
    breadcrumbContainer.innerHTML = html;
}

// Auto-run ls to populate directory contents (kept for backwards compatibility)
async function autoRunLsForDirectory(directory) {
    // This now just calls loadDirectoryContents
    await loadDirectoryContents(directory);
}

function handleCommandKeydown(event) {
    if (event.key === 'ArrowUp') {
        event.preventDefault();
        if (AppState.commandHistory.length > 0) {
            if (AppState.historyIndex === -1) {
                AppState.historyIndex = AppState.commandHistory.length - 1;
            } else if (AppState.historyIndex > 0) {
                AppState.historyIndex--;
            }
            document.getElementById('command-input').value = AppState.commandHistory[AppState.historyIndex];
        }
    } else if (event.key === 'ArrowDown') {
        event.preventDefault();
        if (AppState.historyIndex !== -1) {
            AppState.historyIndex++;
            if (AppState.historyIndex >= AppState.commandHistory.length) {
                AppState.historyIndex = -1;
                document.getElementById('command-input').value = '';
            } else {
                document.getElementById('command-input').value = AppState.commandHistory[AppState.historyIndex];
            }
        }
    }
}

function handleCommandKeypress(event) {
    if (event.key === 'Enter') {
        executeCommand();
    }
}

function cdToDirectory(dir) {
    // Deprecated - using navigateToDirectory now
    const currentDir = AppState.currentWorkingDir || document.getElementById('command-directory').value.trim();
    const newDir = currentDir + '/' + dir;
    navigateToDirectory(newDir);
}

function updateCommandModalDirectories() {
    // Deprecated - now handled by displayFileBrowser
}

function saveAsProject() {
    const directory = document.getElementById('command-directory').value.trim();
    const command = document.getElementById('command-input').value.trim();
    
    if (!directory || !command) {
        return;
    }
    
    const projectName = command.split(' ')[0];
    
    closeCommandModal();
    showAddProjectModal();
    
    setTimeout(() => {
        document.getElementById('project-name').value = projectName;
        document.getElementById('project-path').value = directory;
        document.getElementById('project-command').value = command;
    }, 100);
}

// Restart All Modal
function showRestartAllModal() {
    document.getElementById('restart-all-modal').classList.add('show');
    document.getElementById('restart-all-modal').style.display = 'block';
}

function closeRestartAllModal() {
    document.getElementById('restart-all-modal').classList.remove('show');
    document.getElementById('restart-all-modal').style.display = 'none';
}

// Delete Project Modal
function showDeleteProjectModal(id) {
    AppState.deleteProjectId = id;
    document.getElementById('delete-project-modal').classList.add('show');
    document.getElementById('delete-project-modal').style.display = 'block';
}

function closeDeleteProjectModal() {
    document.getElementById('delete-project-modal').classList.remove('show');
    document.getElementById('delete-project-modal').style.display = 'none';
    AppState.deleteProjectId = null;
}

// Context Menu
function showContextMenu(event, projectId) {
    event.preventDefault();
    
    const contextMenu = document.getElementById('context-menu');
    const project = AppState.projects.find(p => p.id === projectId);
    if (!project) return;
    
    contextMenu.innerHTML = `
        <div class="context-menu-item" onclick="startProject('${projectId}'); hideContextMenu();">
            <i class="bi bi-play-fill me-2"></i>Start
        </div>
        <div class="context-menu-item" onclick="stopProject('${projectId}'); hideContextMenu();">
            <i class="bi bi-stop-fill me-2"></i>Stop
        </div>
        <div class="context-menu-item" onclick="restartProject('${projectId}'); hideContextMenu();">
            <i class="bi bi-arrow-clockwise me-2"></i>Restart
        </div>
        <div class="context-menu-item" onclick="viewLogs('${projectId}'); hideContextMenu();">
            <i class="bi bi-file-text me-2"></i>View Logs
        </div>
        <div class="context-menu-item" onclick="updateProject('${projectId}'); hideContextMenu();">
            <i class="bi bi-download me-2"></i>Update (git pull)
        </div>
        <div class="context-menu-item" onclick="editProject('${projectId}'); hideContextMenu();">
            <i class="bi bi-pencil me-2"></i>Edit
        </div>
        <div class="context-menu-item" onclick="showDeleteProjectModal('${projectId}'); hideContextMenu();">
            <i class="bi bi-trash me-2"></i>Delete
        </div>
    `;
    
    contextMenu.style.left = event.pageX + 'px';
    contextMenu.style.top = event.pageY + 'px';
    contextMenu.style.display = 'block';
}

function hideContextMenu() {
    const contextMenu = document.getElementById('context-menu');
    if (contextMenu) {
        contextMenu.style.display = 'none';
    }
}

// Hide context menu when clicking elsewhere
document.addEventListener('click', hideContextMenu);

// Email toggle
async function toggleEmailAlerts(projectId, enabled) {
    try {
        const project = AppState.projects.find(p => p.id === projectId);
        if (!project) return;
        
        project.emailOnCrash = enabled;
        
        await fetch(`/api/projects/${projectId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(project)
        });
    } catch (error) {
        console.error('Failed to toggle email alerts:', error);
    }
}