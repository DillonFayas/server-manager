/*
* renders/dashboard.js
* Dashboard renderer
*/

function renderDashboard() {
    const allTags = getAllTags();
    const filteredProjects = getFilteredProjects();
    
    return `
        <nav class="navbar navbar-dark bg-primary shadow-sm">
            <div class="container-fluid">
                <span class="navbar-brand mb-0 h1">
                    <i class="bi bi-hdd-rack me-2"></i>Server Manager
                </span>
                
                <!-- Desktop Navigation -->
                <div class="d-none d-lg-flex gap-2 align-items-center">
                    <button class="btn btn-sm btn-outline-light" onclick="showAddProjectModal()">
                        <i class="bi bi-plus-circle me-1"></i>Add Project
                    </button>
                    <button class="btn btn-sm btn-outline-light" onclick="showFileManager()">
                        <i class="bi bi-folder me-1"></i>File Manager
                    </button>
                    <button class="btn btn-sm btn-outline-light" onclick="showCommandModal()">
                        <i class="bi bi-terminal me-1"></i>Run Command
                    </button>
                    <button class="btn btn-sm btn-outline-light" onclick="showRestartAllModal()">
                        <i class="bi bi-arrow-clockwise me-1"></i>Restart All
                    </button>
                    <button class="btn btn-sm btn-outline-light" onclick="toggleMetrics()">
                        <i class="bi bi-${AppState.showMetrics ? 'eye-slash' : 'eye'} me-1"></i>${AppState.showMetrics ? 'Hide' : 'Show'} Metrics
                    </button>
                    <i class="bi bi-${AppState.currentTheme === 'dark' ? 'sun' : 'moon'}-fill fs-5 theme-toggle text-white" 
                       onclick="toggleTheme()" title="Toggle theme" style="cursor: pointer;"></i>
                    <div class="navbar-divider"></div>
                    <button class="btn btn-outline-light btn-sm" onclick="handleLogout()">
                        <i class="bi bi-box-arrow-right me-1"></i>Logout
                    </button>
                </div>
                
                <!-- Mobile Hamburger Menu -->
                <div class="d-lg-none">
                    <button class="btn btn-outline-light" type="button" onclick="toggleMobileMenu()">
                        <i class="bi bi-list fs-4"></i>
                    </button>
                </div>
            </div>
            
            <!-- Mobile Menu Dropdown -->
            <div id="mobile-menu" class="mobile-menu" style="display: none;">
                <div class="list-group list-group-flush">
                    <a href="#" class="list-group-item list-group-item-action bg-primary text-white" onclick="showAddProjectModal(); toggleMobileMenu(); return false;">
                        <i class="bi bi-plus-circle me-2"></i>Add Project
                    </a>
                    <a href="#" class="list-group-item list-group-item-action bg-primary text-white" onclick="showFileManager(); toggleMobileMenu(); return false;">
                        <i class="bi bi-folder me-2"></i>File Manager
                    </a>
                    <a href="#" class="list-group-item list-group-item-action bg-primary text-white" onclick="showCommandModal(); toggleMobileMenu(); return false;">
                        <i class="bi bi-terminal me-2"></i>Run Command
                    </a>
                    <a href="#" class="list-group-item list-group-item-action bg-primary text-white" onclick="showRestartAllModal(); toggleMobileMenu(); return false;">
                        <i class="bi bi-arrow-clockwise me-2"></i>Restart All
                    </a>
                    <a href="#" class="list-group-item list-group-item-action bg-primary text-white" onclick="toggleMetrics(); toggleMobileMenu(); return false;">
                        <i class="bi bi-${AppState.showMetrics ? 'eye-slash' : 'eye'} me-2"></i>${AppState.showMetrics ? 'Hide' : 'Show'} Metrics
                    </a>
                    <a href="#" class="list-group-item list-group-item-action bg-primary text-white" onclick="toggleTheme(); toggleMobileMenu(); return false;">
                        <i class="bi bi-${AppState.currentTheme === 'dark' ? 'sun' : 'moon'}-fill me-2"></i>Toggle Theme
                    </a>
                    <div class="dropdown-divider bg-light"></div>
                    <a href="#" class="list-group-item list-group-item-action bg-primary text-white" onclick="handleLogout(); return false;">
                        <i class="bi bi-box-arrow-right me-2"></i>Logout
                    </a>
                </div>
            </div>
        </nav>

        <div class="container-fluid py-4">
            <div class="d-flex justify-content-between align-items-center mb-3">
                <h2>Projects</h2>
                ${allTags.length > 0 ? `
                    <div class="d-flex align-items-center gap-2 flex-wrap">
                        <small class="text-muted">Filter by tags:</small>
                        ${allTags.map(tag => {
                            const isSelected = AppState.selectedTags.includes(tag);
                            return `<span class="badge ${isSelected ? 'bg-primary' : 'bg-secondary'} cursor-pointer" 
                                         onclick="toggleTagFilter('${tag}')" 
                                         style="cursor: pointer;">
                                ${tag}
                            </span>`;
                        }).join('')}
                        ${AppState.selectedTags.length > 0 ? `
                            <button class="btn btn-sm btn-outline-secondary" onclick="clearTagFilters()">
                                <i class="bi bi-x-circle me-1"></i>Clear
                            </button>
                        ` : ''}
                    </div>
                ` : ''}
            </div>

            ${AppState.selectedTags.length > 0 ? `
                <div class="alert alert-info py-2 mb-3">
                    <i class="bi bi-funnel me-2"></i>
                    Showing ${filteredProjects.length} project${filteredProjects.length !== 1 ? 's' : ''} 
                    with tag${AppState.selectedTags.length !== 1 ? 's' : ''}: 
                    <strong>${AppState.selectedTags.join(', ')}</strong>
                </div>
            ` : ''}

            <div class="row g-3 projects-grid" id="projects-container">
                ${filteredProjects.length === 0 ?
                    AppState.selectedTags.length > 0 
                        ? '<div class="col-12 text-center py-5"><p class="text-muted">No projects match the selected tags.</p></div>'
                        : '<div class="col-12 text-center py-5"><p class="text-muted">No projects yet. Click "Add Project" to get started.</p></div>'
                    : filteredProjects.map(renderProjectCard).join('')
                }
            </div>
        </div>

        ${renderAddProjectModal()}
        ${renderLogsModal()}
        ${renderUpdateModal()}
        ${renderCommandModal()}
        ${renderRestartAllModal()}
        ${renderDeleteProjectModal()}
        
        <div id="context-menu" class="context-menu" style="display: none;"></div>
    `;
}