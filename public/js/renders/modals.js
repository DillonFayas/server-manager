/*
* renders/modals.js
* All modal renderers
*/

function renderAddProjectModal() {
    return `
        <div id="add-project-modal" class="modal">
            <div class="modal-dialog">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title" id="modal-title">Add New Project</h5>
                        <button type="button" class="btn-close" onclick="closeAddProjectModal()"></button>
                    </div>
                    <div class="modal-body">
                        <div class="mb-3">
                            <label class="form-label">Project Name</label>
                            <input type="text" id="project-name" class="form-control" />
                        </div>
                        <div class="mb-3">
                            <label class="form-label">Project Path</label>
                            <input type="text" id="project-path" class="form-control" placeholder="/home/user/project" />
                        </div>
                        <div class="mb-3">
                            <label class="form-label">Start Command</label>
                            <input type="text" id="project-command" class="form-control" placeholder="node . or python3 main.py" />
                        </div>
                        <div class="mb-3">
                            <label class="form-label">Tags (comma-separated)</label>
                            <input type="text" id="project-tags" class="form-control" placeholder="web, api, production" />
                            <div class="form-text">Add tags to organize and filter your projects</div>
                        </div>
                        <div class="form-check mb-2">
                            <input type="checkbox" class="form-check-input" id="project-auto-restart" />
                            <label class="form-check-label" for="project-auto-restart">
                                Auto-restart on system boot
                            </label>
                        </div>
                        <div class="form-check">
                            <input type="checkbox" class="form-check-input" id="project-email-crash" />
                            <label class="form-check-label" for="project-email-crash">
                                Send email alerts on crash
                            </label>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" onclick="closeAddProjectModal()">Cancel</button>
                        <button type="button" class="btn btn-primary" onclick="saveProject()">Save</button>
                    </div>
                </div>
            </div>
        </div>
    `;
}

function renderLogsModal() {
    return `
        <div id="logs-modal" class="modal">
            <div class="modal-dialog modal-xl">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title" id="logs-title">
                            <i class="bi bi-file-text me-2"></i>Logs
                        </h5>
                        <button type="button" class="btn-close" onclick="closeLogsModal()"></button>
                    </div>
                    <div class="modal-body">
                        <div class="d-flex gap-2 mb-3 flex-wrap">
                            <button class="btn btn-sm btn-danger" onclick="clearLogs()">
                                <i class="bi bi-trash me-1"></i>Clear
                            </button>
                            <button class="btn btn-sm btn-secondary" onclick="toggleDeduplication()">
                                <i class="bi bi-layers me-1"></i><span id="dedup-status">Dedup: ON</span>
                            </button>
                            <button class="btn btn-sm btn-secondary" onclick="toggleAutoScroll()">
                                <i class="bi bi-arrow-down-circle me-1"></i><span id="autoscroll-status">Auto-scroll: ON</span>
                            </button>
                            <button class="btn btn-sm btn-secondary" onclick="toggleTimestamps()">
                                <i class="bi bi-clock me-1"></i><span id="timestamp-status">Timestamps: OFF</span>
                            </button>
                            <button class="btn btn-sm btn-primary" onclick="exportLogs()">
                                <i class="bi bi-download me-1"></i>Export
                            </button>
                            <div class="flex-grow-1">
                                <input type="text" class="form-control form-control-sm" id="log-filter" 
                                    placeholder="Filter logs..." onkeyup="filterLogs()" />
                            </div>
                        </div>
                        <div id="logs-container" class="log-container" style="height: 500px;">
                            <div class="text-muted">Waiting for logs...</div>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" onclick="closeLogsModal()">Close</button>
                    </div>
                </div>
            </div>
        </div>
    `;
}

function renderUpdateModal() {
    return `
        <div id="update-modal" class="modal">
            <div class="modal-dialog modal-lg">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">
                            <i class="bi bi-info-circle me-2"></i>Update Result
                        </h5>
                        <button type="button" class="btn-close" onclick="closeUpdateModal()"></button>
                    </div>
                    <div class="modal-body">
                        <div id="update-modal-message" class="mb-3"></div>
                        <div id="update-modal-output" class="log-container" style="height: 300px;"></div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-primary" onclick="closeUpdateModal()">Close</button>
                    </div>
                </div>
            </div>
        </div>
    `;
}

function renderCommandModal() {
    return `
        <div id="command-modal" class="modal">
            <div class="modal-dialog modal-xl">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">
                            <i class="bi bi-terminal me-2"></i>Run Command
                        </h5>
                        <button type="button" class="btn-close" onclick="closeCommandModal()"></button>
                    </div>
                    <div class="modal-body">
                        <!-- Breadcrumb navigation -->
                        <div class="mb-3">
                            <label class="form-label">Current Directory</label>
                            <div class="input-group">
                                <span class="input-group-text"><i class="bi bi-folder"></i></span>
                                <input type="text" id="command-directory" class="form-control" 
                                    placeholder="/home/meap" onchange="updateCurrentDir()" />
                                <button class="btn btn-outline-secondary" onclick="navigateUp()" title="Go up one directory">
                                    <i class="bi bi-arrow-up"></i>
                                </button>
                                <button class="btn btn-outline-secondary" onclick="refreshDirectory()" title="Refresh">
                                    <i class="bi bi-arrow-clockwise"></i>
                                </button>
                            </div>
                            <div class="mt-2" id="breadcrumb-container"></div>
                        </div>

                        <!-- File browser -->
                        <div class="mb-3">
                            <div class="card file-browser-card">
                                <div class="card-header py-2">
                                    <strong>Directory Contents</strong>
                                </div>
                                <div class="card-body p-0">
                                    <div id="file-browser" class="file-browser" style="max-height: 300px; overflow-y: auto;">
                                        <div class="text-center text-muted py-4">
                                            Loading directory contents...
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Quick select from projects -->
                        ${AppState.projects.length > 0 ? `
                            <div class="mb-3">
                                <label class="form-label">Quick Select Project Directory</label>
                                <select class="form-select form-select-sm" id="project-directory-select" 
                                    onchange="selectProjectDirectory()">
                                    <option value="">Choose a project...</option>
                                    ${AppState.projects.map(p => `<option value="${p.path}">${p.name}</option>`).join('')}
                                </select>
                            </div>
                        ` : ''}

                        <!-- Command input -->
                        <div class="mb-3">
                            <label class="form-label d-flex justify-content-between align-items-center">
                                <span>Command</span>
                                <div class="form-check form-switch form-switch-sm">
                                    <input class="form-check-input" type="checkbox" id="clear-command-toggle" 
                                        ${AppState.clearCommandOnExecute ? 'checked' : ''}
                                        onchange="toggleClearCommand(this.checked)">
                                    <label class="form-check-label small" for="clear-command-toggle">
                                        Clear after execute
                                    </label>
                                </div>
                            </label>
                            <input type="text" id="command-input" class="form-control" placeholder="ls -la" 
                                onkeydown="handleCommandKeydown(event)" 
                                onkeypress="handleCommandKeypress(event)" />
                            <div class="form-text">↑↓ for command history</div>
                        </div>

                        <!-- Execute buttons -->
                        <div class="mb-3 d-flex gap-2">
                            <button type="button" class="btn btn-primary" onclick="executeCommand()" id="execute-btn">
                                <i class="bi bi-play-fill me-1"></i>Execute
                            </button>
                            <button type="button" class="btn btn-success" onclick="saveAsProject()">
                                <i class="bi bi-save me-1"></i>Save as Project
                            </button>
                        </div>

                        <!-- Output -->
                        <div class="mb-2">
                            <strong>Output:</strong>
                        </div>
                        <div id="command-output" class="log-container" style="height: 300px;">
                            <div style="color: #ccc;">No output yet. Enter a command and click Execute.</div>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" onclick="closeCommandModal()">Close</button>
                    </div>
                </div>
            </div>
        </div>
    `;
}

function renderRestartAllModal() {
    return `
        <div id="restart-all-modal" class="modal">
            <div class="modal-dialog">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">
                            <i class="bi bi-exclamation-triangle me-2"></i>Restart All Running Projects
                        </h5>
                        <button type="button" class="btn-close" onclick="closeRestartAllModal()"></button>
                    </div>
                    <div class="modal-body">
                        <p>Are you sure you want to restart all running projects?</p>
                        <p class="text-muted small">This will stop and restart all currently running projects.</p>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" onclick="closeRestartAllModal()">Cancel</button>
                        <button type="button" class="btn btn-warning" onclick="confirmRestartAll()">
                            <i class="bi bi-arrow-clockwise me-1"></i>Restart All
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
}

function renderDeleteProjectModal() {
    return `
        <div id="delete-project-modal" class="modal">
            <div class="modal-dialog">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">
                            <i class="bi bi-exclamation-triangle me-2"></i>Delete Project
                        </h5>
                        <button type="button" class="btn-close" onclick="closeDeleteProjectModal()"></button>
                    </div>
                    <div class="modal-body">
                        <p>Are you sure you want to delete this project?</p>
                        <p class="text-muted small">This action cannot be undone.</p>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" onclick="closeDeleteProjectModal()">Cancel</button>
                        <button type="button" class="btn btn-danger" onclick="confirmDeleteProject()">
                            <i class="bi bi-trash me-1"></i>Delete
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
}