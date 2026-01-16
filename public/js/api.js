/*
* api.js
* All API calls to the server
*/

const API_BASE = '';

// Authentication
async function handleLogin() {
    const password = document.getElementById('password').value;
    const errorDiv = document.getElementById('login-error');

    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password })
        });

        if (response.ok) {
            AppState.isLoggedIn = true;
            await fetchProjects();
            
            // Connect to status WebSocket
            connectStatusWebSocket();
            
            render();
        } else {
            errorDiv.textContent = 'Invalid password';
            errorDiv.classList.remove('d-none');
        }
    } catch (error) {
        errorDiv.textContent = 'Login failed';
        errorDiv.classList.remove('d-none');
    }
}

function handleLogout() {
    AppState.isLoggedIn = false;
    AppState.projects = [];
    
    // Disconnect status WebSocket
    if (AppState.statusWs) {
        AppState.statusWs.close();
        AppState.statusWs = null;
    }
    
    render();
}

// Connect to status WebSocket for real-time updates
function connectStatusWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    AppState.statusWs = new WebSocket(`${protocol}//${window.location.host}/status`);
    
    AppState.statusWs.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            if (data.type === 'status_update') {
                updateProjectStatusInDOM(data.projectId, data.status, data.stats, data.health);
            }
        } catch (error) {
            console.error('Error parsing status update:', error);
        }
    };
    
    AppState.statusWs.onerror = (error) => {
        console.error('Status WebSocket error:', error);
    };
    
    AppState.statusWs.onclose = () => {
        console.log('Status WebSocket disconnected');
        // Reconnect after 5 seconds if still logged in
        if (AppState.isLoggedIn) {
            setTimeout(connectStatusWebSocket, 5000);
        }
    };
}

// Update individual project in AppState and DOM without full re-render
function updateProjectStatusInDOM(projectId, status, stats, health) {
    // Update AppState
    const project = AppState.projects.find(p => p.id === projectId);
    if (project) {
        project.status = status;
        if (stats) project.stats = stats;
        if (health) project.health = health;
    }
    
    // Update DOM elements directly
    const statusBadge = document.getElementById(`status-badge-${projectId}`);
    const statusIcon = document.getElementById(`status-icon-${projectId}`);
    const metricsContainer = document.getElementById(`metrics-${projectId}`);
    const healthContainer = document.getElementById(`health-${projectId}`);
    const actionButtons = document.getElementById(`actions-${projectId}`);
    
    // Update status badge and icon (only if status changed to preserve animations)
    if (statusBadge && statusIcon) {
        const currentStatus = statusBadge.textContent;
        
        // Only update if status actually changed
        if (currentStatus !== status) {
            let statusClass, statusText, iconHtml;
            
            if (status === 'restarting') {
                statusClass = 'bg-warning';
                statusText = 'restarting';
                iconHtml = '<i class="bi bi-arrow-clockwise text-warning status-icon-spin"></i>';
            } else if (status === 'running') {
                statusClass = 'bg-success';
                statusText = 'running';
                iconHtml = '<i class="bi bi-circle-fill text-success status-icon-pulse"></i>';
            } else {
                statusClass = 'bg-secondary';
                statusText = 'stopped';
                iconHtml = '<i class="bi bi-circle-fill text-secondary"></i>';
            }
            
            statusBadge.className = `badge ${statusClass} status-badge`;
            statusBadge.textContent = statusText;
            statusIcon.innerHTML = iconHtml;
        }
    }
    
    // Update metrics if running and visible
    if (metricsContainer && stats && status === 'running') {
        updateMetricsDisplay(projectId, stats);
    } else if (metricsContainer && status !== 'running') {
        // Hide metrics when stopped
        if (metricsContainer.style.display !== 'none') {
            metricsContainer.style.display = 'none';
        }
    }
    
    // Update health display
    if (healthContainer && health) {
        updateHealthDisplay(projectId, health);
    }
    
    // Update action buttons
    if (actionButtons) {
        updateActionButtons(projectId, status);
    }
}

// Update metrics display
function updateMetricsDisplay(projectId, stats) {
    if (!shouldShowMetrics(projectId)) return;
    
    const metricsContainer = document.getElementById(`metrics-${projectId}`);
    if (!metricsContainer) return;
    
    metricsContainer.style.display = 'block';
    
    const cpuText = metricsContainer.querySelector('.cpu-text');
    const uptimeText = metricsContainer.querySelector('.uptime-text');
    const memoryText = metricsContainer.querySelector('.memory-text');
    const cpuBar = metricsContainer.querySelector('.cpu-bar-fill');
    const memoryBar = metricsContainer.querySelector('.memory-bar-fill');
    
    if (cpuText) cpuText.textContent = `CPU: ${stats.cpu.toFixed(1)}%`;
    if (uptimeText) uptimeText.textContent = `Uptime: ${stats.uptime}`;
    if (memoryText) memoryText.textContent = `Memory: ${stats.memory.toFixed(1)}%`;
    if (cpuBar) cpuBar.style.width = `${Math.min(stats.cpu, 100)}%`;
    if (memoryBar) memoryBar.style.width = `${Math.min(stats.memory, 100)}%`;
}

// Update health display
function updateHealthDisplay(projectId, health) {
    const healthContainer = document.getElementById(`health-${projectId}`);
    if (!healthContainer) return;
    
    if (health.crashCount > 0) {
        healthContainer.style.display = 'block';
        healthContainer.innerHTML = `
            <i class="bi bi-exclamation-triangle me-1"></i>
            <strong>Crashes:</strong> ${health.crashCount}
            ${health.lastCrash ? `<br><small>Last: ${new Date(health.lastCrash.time).toLocaleString()}</small>` : ''}
            ${health.lastCrash && health.lastCrash.reason ? `<br><small>Reason: ${health.lastCrash.reason}</small>` : ''}
        `;
    } else {
        healthContainer.style.display = 'none';
    }
}

// Update action buttons
function updateActionButtons(projectId, status) {
    const actionsContainer = document.getElementById(`actions-${projectId}`);
    if (!actionsContainer) return;
    
    if (status === 'running') {
        actionsContainer.innerHTML = `
            <button class="btn btn-danger btn-sm" onclick="stopProject('${projectId}')">
                <i class="bi bi-stop-fill me-1"></i>Stop
            </button>
            <button class="btn btn-warning btn-sm" onclick="restartProject('${projectId}')">
                <i class="bi bi-arrow-clockwise me-1"></i>Restart
            </button>
            <button class="btn btn-info btn-sm" onclick="updateProject('${projectId}')">
                <i class="bi bi-download me-1"></i>Update
            </button>
            <button class="btn btn-secondary btn-sm" onclick="viewLogs('${projectId}')">
                <i class="bi bi-file-text me-1"></i>Logs
            </button>
        `;
    } else if (status === 'restarting') {
        actionsContainer.innerHTML = `
            <button class="btn btn-warning btn-sm" disabled>
                <i class="bi bi-arrow-repeat me-1"></i>Restarting...
            </button>
            <button class="btn btn-info btn-sm" onclick="updateProject('${projectId}')">
                <i class="bi bi-download me-1"></i>Update
            </button>
            <button class="btn btn-secondary btn-sm" onclick="viewLogs('${projectId}')">
                <i class="bi bi-file-text me-1"></i>Logs
            </button>
        `;
    } else {
        actionsContainer.innerHTML = `
            <button class="btn btn-success btn-sm" onclick="startProject('${projectId}')">
                <i class="bi bi-play-fill me-1"></i>Start
            </button>
            <button class="btn btn-warning btn-sm" onclick="restartProject('${projectId}')">
                <i class="bi bi-arrow-clockwise me-1"></i>Restart
            </button>
            <button class="btn btn-info btn-sm" onclick="updateProject('${projectId}')">
                <i class="bi bi-download me-1"></i>Update
            </button>
            <button class="btn btn-secondary btn-sm" onclick="viewLogs('${projectId}')">
                <i class="bi bi-file-text me-1"></i>Logs
            </button>
        `;
    }
}

// Projects
async function fetchProjects() {
    try {
        const response = await fetch('/api/projects');
        AppState.projects = await response.json();
        render();
    } catch (error) {
        console.error('Failed to fetch projects:', error);
    }
}

async function startProject(id) {
    try {
        await fetch(`/api/projects/${id}/start`, { method: 'POST' });
        await fetchProjects();
    } catch (error) {
        console.error('Failed to start project:', error);
    }
}

async function stopProject(id) {
    try {
        await fetch(`/api/projects/${id}/stop`, { method: 'POST' });
        await fetchProjects();
    } catch (error) {
        console.error('Failed to stop project:', error);
    }
}

async function restartProject(id) {
    try {
        const project = AppState.projects.find(p => p.id === id);
        if (project) {
            project.status = 'restarting';
            updateProjectStatusInDOM(id, 'restarting', null, null);
        }

        await fetch(`/api/projects/${id}/restart`, { method: 'POST' });
        setTimeout(async () => {
            await fetchProjects();
        }, 2500);
    } catch (error) {
        console.error('Failed to restart project:', error);
        await fetchProjects();
    }
}

async function updateProject(id) {
    try {
        const response = await fetch(`/api/projects/${id}/update`, { method: 'POST' });
        const result = await response.json();
        showUpdateModal(result);
    } catch (error) {
        showUpdateModal({ success: false, message: error.message, output: '' });
    }
}

async function saveProject() {
    const tagsInput = document.getElementById('project-tags').value;
    const tags = tagsInput ? tagsInput.split(',').map(t => t.trim()).filter(t => t) : [];
    
    const data = {
        name: document.getElementById('project-name').value,
        path: document.getElementById('project-path').value,
        command: document.getElementById('project-command').value,
        tags: tags,
        autoRestart: document.getElementById('project-auto-restart').checked,
        emailOnCrash: document.getElementById('project-email-crash').checked
    };

    try {
        const method = AppState.editingProjectId ? 'PUT' : 'POST';
        const url = AppState.editingProjectId ? `/api/projects/${AppState.editingProjectId}` : '/api/projects';

        await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        closeAddProjectModal();
        await fetchProjects();
    } catch (error) {
        console.error('Failed to save project:', error);
    }
}

async function confirmDeleteProject() {
    if (!AppState.deleteProjectId) return;
    
    try {
        await fetch(`/api/projects/${AppState.deleteProjectId}`, { method: 'DELETE' });
        closeDeleteProjectModal();
        await fetchProjects();
    } catch (error) {
        console.error('Failed to delete project:', error);
    }
}

async function confirmRestartAll() {
    closeRestartAllModal();
    
    try {
        const response = await fetch('/api/projects/restart-all', { method: 'POST' });
        const result = await response.json();
        
        if (result.success) {
            console.log(result.message);
        }
        
        setTimeout(async () => {
            await fetchProjects();
        }, 2500);
    } catch (error) {
        console.error('Failed to restart all projects:', error);
    }
}

// Command execution with improved cd support
async function executeCommand() {
    let directory = document.getElementById('command-directory').value.trim();
    const command = document.getElementById('command-input').value.trim();
    const outputDiv = document.getElementById('command-output');
    const executeBtn = document.getElementById('execute-btn');

    // Default to /home/meap if empty
    if (!directory) {
        directory = '/home/meap';
        document.getElementById('command-directory').value = directory;
        AppState.currentWorkingDir = directory;
        document.getElementById('current-dir-display').textContent = directory;
    }

    if (!command) {
        outputDiv.innerHTML = '<div class="text-danger">Please enter a command.</div>';
        return;
    }

    // Add to command history
    if (command && !command.startsWith('cd ') && (AppState.commandHistory.length === 0 || AppState.commandHistory[AppState.commandHistory.length - 1] !== command)) {
        AppState.commandHistory.push(command);
        if (AppState.commandHistory.length > 50) {
            AppState.commandHistory.shift();
        }
    }
    AppState.historyIndex = -1;

    // Handle cd command locally
    if (command.startsWith('cd ')) {
        const targetDir = command.substring(3).trim();
        
        if (targetDir === '..') {
            // Go up one directory
            const parts = directory.split('/').filter(p => p);
            if (parts.length > 0) {
                parts.pop();
                directory = '/' + parts.join('/');
            } else {
                directory = '/';
            }
        } else if (targetDir.startsWith('/')) {
            // Absolute path
            directory = targetDir;
        } else {
            // Relative path
            directory = directory.replace(/\/$/, '') + '/' + targetDir;
        }
        
        document.getElementById('command-directory').value = directory;
        AppState.currentWorkingDir = directory;
        outputDiv.innerHTML = `<div class="text-success">Changed directory to: ${directory}</div>`;
        
        // Update directory contents
        updateCurrentDir();
        
        // Clear command if toggle is on
        if (AppState.clearCommandOnExecute) {
            document.getElementById('command-input').value = '';
        }
        return;
    }

    executeBtn.disabled = true;
    executeBtn.innerHTML = '<i class="bi bi-hourglass-split me-1"></i>Executing...';
    outputDiv.innerHTML = '<div class="text-muted">Executing command...</div>';

    try {
        const response = await fetch('/api/execute', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ directory, command })
        });

        const result = await response.json();

        if (result.success) {
            outputDiv.innerHTML = '';
            if (result.output) {
                const lines = result.output.split('\n');
                lines.forEach(line => {
                    const lineDiv = document.createElement('div');
                    lineDiv.textContent = line;
                    outputDiv.appendChild(lineDiv);
                });
                
                // If command was ls, extract directories
                if (command.match(/^ls(\s|$)/)) {
                    AppState.availableDirectories = lines.filter(line => {
                        return line.trim() && !line.includes(' ') && !line.startsWith('total');
                    }).map(l => l.trim());
                    updateCommandModalDirectories();
                }
            } else {
                outputDiv.innerHTML = '<div class="text-muted">Command executed successfully with no output.</div>';
            }
        } else {
            outputDiv.innerHTML = `<div class="text-danger">Error: ${result.message}</div>`;
            if (result.output) {
                const errorOutput = document.createElement('div');
                errorOutput.className = 'mt-2';
                errorOutput.textContent = result.output;
                outputDiv.appendChild(errorOutput);
            }
        }
        
        // Clear command if toggle is on
        if (AppState.clearCommandOnExecute) {
            document.getElementById('command-input').value = '';
        }
    } catch (error) {
        outputDiv.innerHTML = `<div class="text-danger">Failed to execute command: ${error.message}</div>`;
    } finally {
        executeBtn.disabled = false;
        executeBtn.innerHTML = '<i class="bi bi-play-fill me-1"></i>Execute';
    }
}