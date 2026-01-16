/*
* File Manager Page Renderer
* Full-page file system browser with terminal and editor
*/

function renderFileManager() {
    const currentDir = AppState.fileManager.currentDirectory || '/home/meap';
    const currentFile = AppState.fileManager.currentFile;
    const isEditorOpen = AppState.fileManager.editorOpen;
    
    return `
        <nav class="navbar navbar-dark bg-primary shadow-sm">
            <div class="container-fluid">
                <div class="d-flex align-items-center gap-2">
                    <button class="btn btn-sm btn-outline-light" onclick="backToDashboard()">
                        <i class="bi bi-arrow-left me-1"></i>Dashboard
                    </button>
                    <span class="navbar-brand mb-0 h1">
                        <i class="bi bi-folder me-2"></i>File Manager
                    </span>
                </div>
                <div class="d-flex gap-2 align-items-center">
                    <i class="bi bi-${AppState.currentTheme === 'dark' ? 'sun' : 'moon'}-fill fs-5 text-white" 
                       onclick="toggleTheme()" title="Toggle theme" style="cursor: pointer;"></i>
                </div>
            </div>
        </nav>

        <div class="container-fluid p-0" style="height: calc(100vh - 56px);">
            <div class="row g-0 h-100">
                <!-- File Browser Column (30%) -->
                <div class="col-12 col-lg-3 border-end" style="height: 100%; overflow-y: auto;">
                    <div class="p-3">
                        <h6 class="mb-3">File Browser</h6>
                        
                        <!-- Directory Input with Navigation -->
                        <div class="mb-3">
                            <div class="input-group input-group-sm">
                                <span class="input-group-text"><i class="bi bi-folder"></i></span>
                                <input type="text" id="fm-directory" class="form-control form-control-sm" 
                                    value="${currentDir}" onchange="fileManagerNavigate(this.value)" />
                                <button class="btn btn-outline-secondary btn-sm" onclick="fileManagerNavigateUp()" title="Up">
                                    <i class="bi bi-arrow-up"></i>
                                </button>
                                <button class="btn btn-outline-secondary btn-sm" onclick="fileManagerRefresh()" title="Refresh">
                                    <i class="bi bi-arrow-clockwise"></i>
                                </button>
                            </div>
                        </div>

                        <!-- Breadcrumb -->
                        <div id="fm-breadcrumb" class="mb-3"></div>

                        <!-- Upload Area -->
                        <div class="mb-3">
                            <div id="fm-upload-zone" class="upload-zone text-center p-3 border border-2 border-dashed rounded" 
                                 ondrop="handleFileDrop(event)" 
                                 ondragover="handleDragOver(event)"
                                 ondragleave="handleDragLeave(event)">
                                <i class="bi bi-cloud-upload fs-4"></i>
                                <p class="mb-2 small">Drag & drop files here</p>
                                <button class="btn btn-sm btn-primary" onclick="document.getElementById('fm-file-input').click()">
                                    <i class="bi bi-upload me-1"></i>Choose Files
                                </button>
                                <input type="file" id="fm-file-input" multiple style="display: none;" onchange="handleFileSelect(event)" />
                            </div>
                        </div>

                        <!-- File List -->
                        <div id="fm-file-list" class="file-list">
                            <div class="text-center text-muted py-4">
                                <i class="bi bi-hourglass-split"></i> Loading...
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Terminal Column (30% or 70% when editor closed) -->
                <div class="col-12 col-lg-${isEditorOpen ? '3' : '9'} border-end" style="height: 100%; display: flex; flex-direction: column;">
                    <div class="p-3 border-bottom">
                        <h6 class="mb-0">Terminal</h6>
                    </div>
                    <div class="p-3 flex-grow-1" style="display: flex; flex-direction: column; overflow: hidden;">
                        <!-- Current Directory Display -->
                        <div class="mb-2">
                            <small class="text-muted">Working Directory: <code id="fm-current-dir">${currentDir}</code></small>
                        </div>

                        <!-- Command Input -->
                        <div class="mb-3">
                            <div class="input-group input-group-sm">
                                <span class="input-group-text">$</span>
                                <input type="text" id="fm-command-input" class="form-control form-control-sm" 
                                    placeholder="Enter command..." 
                                    onkeydown="handleFileManagerCommandKeydown(event)" 
                                    onkeypress="handleFileManagerCommandKeypress(event)" />
                                <button class="btn btn-primary btn-sm" onclick="executeFileManagerCommand()" id="fm-execute-btn">
                                    <i class="bi bi-play-fill"></i>
                                </button>
                            </div>
                            <div class="form-check form-check-sm mt-1">
                                <input class="form-check-input" type="checkbox" id="fm-clear-toggle" 
                                    ${AppState.clearCommandOnExecute ? 'checked' : ''}
                                    onchange="toggleClearCommand(this.checked)">
                                <label class="form-check-label small" for="fm-clear-toggle">
                                    Clear after execute
                                </label>
                            </div>
                        </div>

                        <!-- Terminal Output -->
                        <div class="flex-grow-1" style="min-height: 0;">
                            <div id="fm-terminal-output" class="log-container h-100" style="overflow-y: auto;">
                                <div style="color: #ccc;">Ready. Enter a command...</div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Editor/Viewer Column (40%) - Always render, hide when not in use -->
                <div class="col-12 col-lg-6 ${!isEditorOpen ? 'd-none' : ''}" id="fm-editor-column" style="height: 100%; display: flex; flex-direction: column;">
                    <!-- Editor content will be dynamically updated -->
                </div>
            </div>
        </div>

        <!-- File Context Menu -->
        <div id="fm-context-menu" class="context-menu" style="display: none;"></div>
    `;
}

// Get icon class for file type
function getFileIcon(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    const iconMap = {
        // JavaScript/TypeScript
        'js': 'filetype-js text-warning',
        'mjs': 'filetype-js text-warning',
        'cjs': 'filetype-js text-warning',
        'ts': 'filetype-tsx text-info',
        'tsx': 'filetype-tsx text-info',
        'jsx': 'filetype-jsx text-info',
        
        // Web
        'html': 'filetype-html text-danger',
        'htm': 'filetype-html text-danger',
        'css': 'filetype-css text-primary',
        'scss': 'filetype-scss text-danger',
        'sass': 'filetype-sass text-danger',
        'less': 'filetype-css text-primary',
        
        // Data/Config
        'json': 'filetype-json text-warning',
        'xml': 'filetype-xml text-warning',
        'yml': 'filetype-yml text-info',
        'yaml': 'filetype-yml text-info',
        'toml': 'file-code text-secondary',
        'ini': 'gear text-secondary',
        'env': 'gear text-secondary',
        
        // Python
        'py': 'filetype-py text-info',
        'pyc': 'filetype-py text-muted',
        'pyw': 'filetype-py text-info',
        
        // PHP
        'php': 'filetype-php text-primary',
        
        // Ruby
        'rb': 'gem text-danger',
        
        // Go
        'go': 'code-square text-info',
        
        // Rust
        'rs': 'gear text-warning',
        
        // C/C++
        'c': 'file-code text-primary',
        'cpp': 'file-code text-primary',
        'cc': 'file-code text-primary',
        'h': 'file-code text-secondary',
        'hpp': 'file-code text-secondary',
        
        // Java
        'java': 'cup-hot text-danger',
        'class': 'cup-hot text-muted',
        'jar': 'archive text-warning',
        
        // Shell
        'sh': 'terminal text-success',
        'bash': 'terminal text-success',
        'zsh': 'terminal text-success',
        'fish': 'terminal text-success',
        
        // Markdown/Docs
        'md': 'filetype-md text-secondary',
        'markdown': 'filetype-md text-secondary',
        'txt': 'file-text text-secondary',
        'doc': 'file-word text-primary',
        'docx': 'file-word text-primary',
        'pdf': 'file-pdf text-danger',
        
        // Images
        'jpg': 'file-image text-success',
        'jpeg': 'file-image text-success',
        'png': 'file-image text-success',
        'gif': 'file-image text-success',
        'svg': 'file-image text-warning',
        'ico': 'file-image text-secondary',
        'webp': 'file-image text-success',
        
        // Archives
        'zip': 'file-zip text-warning',
        'tar': 'file-zip text-warning',
        'gz': 'file-zip text-warning',
        'rar': 'file-zip text-warning',
        '7z': 'file-zip text-warning',
        
        // Logs
        'log': 'file-text text-muted',
        
        // Git
        'gitignore': 'git text-danger',
        'gitattributes': 'git text-danger',
        
        // Docker
        'dockerfile': 'box text-info',
        
        // Database
        'sql': 'database text-primary',
        'db': 'database text-secondary',
        'sqlite': 'database text-secondary',
        
        // Video
        'mp4': 'play-circle text-danger',
        'avi': 'play-circle text-danger',
        'mov': 'play-circle text-danger',
        'mkv': 'play-circle text-danger',
        
        // Audio
        'mp3': 'music-note text-success',
        'wav': 'music-note text-success',
        'flac': 'music-note text-success',
        'ogg': 'music-note text-success'
    };
    
    // Check for special filenames (without extension)
    const lowerFilename = filename.toLowerCase();
    const specialFiles = {
        'dockerfile': 'box text-info',
        'makefile': 'hammer text-secondary',
        'readme': 'file-text text-primary',
        'license': 'shield text-warning',
        'package.json': 'filetype-json text-success',
        'tsconfig.json': 'filetype-json text-info',
        'package-lock.json': 'lock text-warning',
        'yarn.lock': 'lock text-info',
        '.env': 'gear text-warning',
        '.gitignore': 'git text-danger'
    };
    
    if (specialFiles[lowerFilename]) {
        return specialFiles[lowerFilename];
    }
    
    return iconMap[ext] || 'file-earmark text-secondary';
}