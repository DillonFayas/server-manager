/*
* renders/projectCard.js
* Project card renderer
*/

function renderProjectCard(project) {
    let statusClass, statusText;

    if (project.status === 'restarting') {
        statusClass = 'bg-warning';
        statusText = 'restarting';
    } else if (project.status === 'running') {
        statusClass = 'bg-success';
        statusText = 'running';
    } else {
        statusClass = 'bg-secondary';
        statusText = 'stopped';
    }

    const stats = project.stats || { cpu: 0, memory: 0, uptime: '0s' };
    const health = project.health || { crashCount: 0, lastCrash: null };
    const showMetrics = project.status === 'running' && shouldShowMetrics(project.id);
    
    // Check if this project's metrics are enabled (default true)
    const projectMetricsEnabled = AppState.projectMetrics[project.id] !== undefined 
        ? AppState.projectMetrics[project.id] 
        : true;

    return `
        <div class="col-project">
            <div class="card h-100 shadow-sm" oncontextmenu="showContextMenu(event, '${project.id}'); return false;">
                <div class="card-body">
                    <div class="d-flex justify-content-between align-items-start mb-3">
                        <h5 class="card-title mb-0">${project.name}</h5>
                        <div class="d-flex align-items-center gap-2">
                            <span class="badge ${statusClass} status-badge" id="status-badge-${project.id}">
                                ${statusText}
                            </span>
                            <span id="status-icon-${project.id}">
                                ${project.status === 'restarting' 
                                    ? '<i class="bi bi-arrow-clockwise text-warning status-icon-spin"></i>'
                                    : project.status === 'running'
                                    ? '<i class="bi bi-circle-fill text-success status-icon-pulse"></i>'
                                    : '<i class="bi bi-circle-fill text-secondary"></i>'
                                }
                            </span>
                        </div>
                    </div>
                    
                    <p class="card-text text-muted small mb-2">
                        <strong>Path:</strong> ${project.path}
                    </p>
                    <p class="card-text text-muted small mb-2">
                        <strong>Command:</strong> ${project.command}
                    </p>
                    
                    ${project.tags && project.tags.length > 0 ? `
                        <div class="mb-2">
                            ${project.tags.map(tag => 
                                `<span class="badge bg-info me-1">${tag}</span>`
                            ).join('')}
                        </div>
                    ` : ''}
                    
                    ${project.status === 'running' && AppState.showMetrics ? `
                        <div class="d-flex justify-content-between align-items-center mb-2">
                            <small class="text-muted">Metrics</small>
                            <i class="bi bi-${projectMetricsEnabled ? 'eye-slash' : 'eye'} cursor-pointer" 
                               id="metrics-toggle-${project.id}"
                               onclick="toggleProjectMetrics('${project.id}')" 
                               title="${projectMetricsEnabled ? 'Hide' : 'Show'} metrics"
                               style="cursor: pointer; font-size: 0.9rem;"></i>
                        </div>
                    ` : ''}
                    
                    <div id="metrics-${project.id}" style="display: ${showMetrics ? 'block' : 'none'};">
                        ${project.status === 'running' ? `
                            <div class="mb-3 p-2 rounded" style="background-color: rgba(0,0,0,0.1);">
                                <div class="d-flex justify-content-between align-items-center mb-1">
                                    <span class="resource-text cpu-text">CPU: ${stats.cpu.toFixed(1)}%</span>
                                    <span class="resource-text uptime-text">Uptime: ${stats.uptime}</span>
                                </div>
                                <div class="resource-bar">
                                    <div class="resource-bar-fill resource-bar-cpu cpu-bar-fill" style="width: ${Math.min(stats.cpu, 100)}%"></div>
                                </div>
                                <div class="d-flex justify-content-between align-items-center mb-1 mt-2">
                                    <span class="resource-text memory-text">Memory: ${stats.memory.toFixed(1)}%</span>
                                </div>
                                <div class="resource-bar">
                                    <div class="resource-bar-fill resource-bar-mem memory-bar-fill" style="width: ${Math.min(stats.memory, 100)}%"></div>
                                </div>
                            </div>
                        ` : ''}
                    </div>
                    
                    <div id="health-${project.id}" class="alert alert-warning py-2 px-2 mb-3 small" style="display: ${health.crashCount > 0 && !AppState.dismissedCrashes[project.id] ? 'block' : 'none'};">
                        <div class="d-flex justify-content-between align-items-start">
                            <div class="flex-grow-1">
                                <i class="bi bi-exclamation-triangle me-1"></i>
                                <strong>Crashes:</strong> ${health.crashCount}
                                ${health.lastCrash ? `<br><small>Last: ${new Date(health.lastCrash.time).toLocaleString()}</small>` : ''}
                                ${health.lastCrash && health.lastCrash.reason ? `<br><small>Reason: ${health.lastCrash.reason}</small>` : ''}
                            </div>
                            <button class="btn btn-sm btn-outline-warning p-0 px-1" onclick="dismissCrashAlert('${project.id}')" title="Dismiss">
                                <i class="bi bi-x"></i>
                            </button>
                        </div>
                        ${health.crashCount > 1 ? `
                            <button class="btn btn-sm btn-link p-0 text-warning mt-1" onclick="showCrashHistory('${project.id}')">
                                View History
                            </button>
                        ` : ''}
                    </div>
                    
                    <div class="mb-3 d-flex flex-wrap gap-2 align-items-center">
                        ${project.autoRestart ? 
                            '<span class="badge bg-success"><i class="bi bi-arrow-clockwise me-1"></i>Auto-restart</span>' : 
                            '<span class="badge bg-secondary"><i class="bi bi-x-circle me-1"></i>No auto-restart</span>'
                        }
                        <div class="form-check form-switch form-switch-sm">
                            <input class="form-check-input" type="checkbox" id="email-${project.id}" 
                                ${project.emailOnCrash ? 'checked' : ''} 
                                onchange="toggleEmailAlerts('${project.id}', this.checked)"
                                title="Email crash alerts">
                            <label class="form-check-label small" for="email-${project.id}">
                                <i class="bi bi-envelope"></i>
                            </label>
                        </div>
                    </div>

                    <div class="d-flex flex-wrap gap-2" id="actions-${project.id}">
                        ${project.status === 'running' ?
        `<button class="btn btn-danger btn-sm" onclick="stopProject('${project.id}')">
                                <i class="bi bi-stop-fill me-1"></i>Stop
                            </button>` :
        project.status === 'restarting' ?
            `<button class="btn btn-warning btn-sm" disabled>
                                <i class="bi bi-arrow-repeat me-1"></i>Restarting...
                            </button>` :
            `<button class="btn btn-success btn-sm" onclick="startProject('${project.id}')">
                                <i class="bi bi-play-fill me-1"></i>Start
                            </button>`
    }
                        ${project.status !== 'restarting' ?
        `<button class="btn btn-warning btn-sm" onclick="restartProject('${project.id}')">
                                <i class="bi bi-arrow-clockwise me-1"></i>Restart
                            </button>` : ''
    }
                        <button class="btn btn-info btn-sm" onclick="updateProject('${project.id}')">
                            <i class="bi bi-download me-1"></i>Update
                        </button>
                        <button class="btn btn-secondary btn-sm" onclick="viewLogs('${project.id}')">
                            <i class="bi bi-file-text me-1"></i>Logs
                        </button>
                    </div>

                    <div class="d-flex gap-2 mt-3 pt-3 border-top">
                        <button class="btn btn-outline-primary btn-sm" onclick="editProject('${project.id}')">
                            <i class="bi bi-pencil me-1"></i>Edit
                        </button>
                        <button class="btn btn-outline-danger btn-sm" onclick="showDeleteProjectModal('${project.id}')">
                            <i class="bi bi-trash me-1"></i>Delete
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
}