/*
* main.js
* Main application state and initialization
*/

// Global state
const AppState = {
    projects: [],
    isLoggedIn: false,
    currentView: 'dashboard', // 'dashboard' or 'filemanager'
    currentLogWs: null,
    statusWs: null,
    currentProject: null,
    editingProjectId: null,
    deleteProjectId: null,
    currentTheme: 'dark',
    currentWorkingDir: '',
    availableDirectories: [],
    currentFiles: [], // Files and folders in current directory
    logFilter: '',
    logDeduplication: true,
    commandHistory: [],
    historyIndex: -1,
    autoScroll: true,
    showTimestamps: false,
    rawLogs: [],
    lastLog: null,
    logCount: 1,
    showMetrics: true, // Global toggle
    projectMetrics: {}, // Per-project metrics toggle { projectId: true/false }
    selectedTags: [], // Selected tags for filtering
    clearCommandOnExecute: true, // Default to true
    dismissedCrashes: {}, // Track dismissed crash alerts { projectId: true/false }
    fileManager: null // Will be initialized in filemanager.js
};

// Initialize theme
function initTheme() {
    const savedTheme = localStorage.getItem('theme') || 'dark';
    AppState.currentTheme = savedTheme;
    document.body.setAttribute('data-bs-theme', AppState.currentTheme);
    
    // Load metrics preference
    const savedMetrics = localStorage.getItem('showMetrics');
    if (savedMetrics !== null) {
        AppState.showMetrics = savedMetrics === 'true';
    }
    
    // Load per-project metrics preference
    const savedProjectMetrics = localStorage.getItem('projectMetrics');
    if (savedProjectMetrics) {
        try {
            AppState.projectMetrics = JSON.parse(savedProjectMetrics);
        } catch (e) {
            AppState.projectMetrics = {};
        }
    }
    
    // Load clearCommandOnExecute preference (default to true)
    const savedClearCommand = localStorage.getItem('clearCommandOnExecute');
    if (savedClearCommand !== null) {
        AppState.clearCommandOnExecute = savedClearCommand === 'true';
    } else {
        AppState.clearCommandOnExecute = true;
        localStorage.setItem('clearCommandOnExecute', 'true');
    }
    
    // Load dismissed crashes
    const savedDismissedCrashes = localStorage.getItem('dismissedCrashes');
    if (savedDismissedCrashes) {
        try {
            AppState.dismissedCrashes = JSON.parse(savedDismissedCrashes);
        } catch (e) {
            AppState.dismissedCrashes = {};
        }
    }
}

// Toggle theme
function toggleTheme() {
    AppState.currentTheme = AppState.currentTheme === 'dark' ? 'light' : 'dark';
    document.body.setAttribute('data-bs-theme', AppState.currentTheme);
    localStorage.setItem('theme', AppState.currentTheme);
    
    // If in file manager, just update the theme icon instead of full re-render
    if (AppState.currentView === 'filemanager') {
        const themeIcon = document.querySelector('.theme-toggle');
        if (themeIcon) {
            themeIcon.className = `bi bi-${AppState.currentTheme === 'dark' ? 'sun' : 'moon'}-fill fs-5 text-white theme-toggle`;
        }
    } else {
        render();
    }
}

// Toggle metrics display (global)
function toggleMetrics() {
    AppState.showMetrics = !AppState.showMetrics;
    localStorage.setItem('showMetrics', AppState.showMetrics.toString());
    
    // Update all metric displays
    AppState.projects.forEach(project => {
        const metricsContainer = document.getElementById(`metrics-${project.id}`);
        if (metricsContainer) {
            if (shouldShowMetrics(project.id) && project.status === 'running') {
                metricsContainer.style.display = 'block';
            } else {
                metricsContainer.style.display = 'none';
            }
        }
    });
}

// Toggle per-project metrics
function toggleProjectMetrics(projectId) {
    // Initialize if not exists (default to true)
    if (AppState.projectMetrics[projectId] === undefined) {
        AppState.projectMetrics[projectId] = true;
    }
    
    // Toggle it
    AppState.projectMetrics[projectId] = !AppState.projectMetrics[projectId];
    localStorage.setItem('projectMetrics', JSON.stringify(AppState.projectMetrics));
    
    // Update the metrics display and toggle icon
    const metricsContainer = document.getElementById(`metrics-${projectId}`);
    const toggleIcon = document.getElementById(`metrics-toggle-${projectId}`);
    const project = AppState.projects.find(p => p.id === projectId);
    
    if (metricsContainer && project) {
        if (shouldShowMetrics(projectId) && project.status === 'running') {
            metricsContainer.style.display = 'block';
        } else {
            metricsContainer.style.display = 'none';
        }
    }
    
    if (toggleIcon) {
        toggleIcon.className = AppState.projectMetrics[projectId] 
            ? 'bi bi-eye-slash' 
            : 'bi bi-eye';
    }
}

// Check if metrics should be shown for a project
function shouldShowMetrics(projectId) {
    // If global is off, don't show
    if (!AppState.showMetrics) return false;
    
    // If per-project setting exists, use it
    if (AppState.projectMetrics[projectId] !== undefined) {
        return AppState.projectMetrics[projectId];
    }
    
    // Default to showing
    return true;
}

// Get all unique tags from all projects
function getAllTags() {
    const tagsSet = new Set();
    AppState.projects.forEach(project => {
        if (project.tags && Array.isArray(project.tags)) {
            project.tags.forEach(tag => tagsSet.add(tag));
        }
    });
    return Array.from(tagsSet).sort();
}

// Toggle tag filter
function toggleTagFilter(tag) {
    const index = AppState.selectedTags.indexOf(tag);
    if (index > -1) {
        AppState.selectedTags.splice(index, 1);
    } else {
        AppState.selectedTags.push(tag);
    }
    render();
}

// Clear all tag filters
function clearTagFilters() {
    AppState.selectedTags = [];
    render();
}

// Check if project matches current filters
function projectMatchesFilters(project) {
    if (AppState.selectedTags.length === 0) return true;
    
    if (!project.tags || !Array.isArray(project.tags)) return false;
    
    // Project must have at least one of the selected tags
    return AppState.selectedTags.some(tag => project.tags.includes(tag));
}

// Get filtered projects
function getFilteredProjects() {
    return AppState.projects.filter(projectMatchesFilters);
}

// Toggle mobile menu
function toggleMobileMenu() {
    const menu = document.getElementById('mobile-menu');
    if (menu) {
        menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
    }
}

// Close mobile menu when clicking outside
document.addEventListener('click', (e) => {
    const menu = document.getElementById('mobile-menu');
    const hamburger = e.target.closest('.btn-outline-light');
    
    if (menu && menu.style.display === 'block' && !menu.contains(e.target) && !hamburger) {
        menu.style.display = 'none';
    }
});

// Dismiss crash alert for a project
function dismissCrashAlert(projectId) {
    AppState.dismissedCrashes[projectId] = true;
    localStorage.setItem('dismissedCrashes', JSON.stringify(AppState.dismissedCrashes));
    
    const healthContainer = document.getElementById(`health-${projectId}`);
    if (healthContainer) {
        healthContainer.style.display = 'none';
    }
}

// Show crash history (can be enhanced later)
function showCrashHistory(projectId) {
    const project = AppState.projects.find(p => p.id === projectId);
    if (!project || !project.health) return;
    
    alert(`Crash History for ${project.name}:\n\nTotal Crashes: ${project.health.crashCount}\nLast Crash: ${project.health.lastCrash ? new Date(project.health.lastCrash.time).toLocaleString() : 'N/A'}\nReason: ${project.health.lastCrash?.reason || 'N/A'}`);
}

// Main render function
function render() {
    const app = document.getElementById('app');

    if (!AppState.isLoggedIn) {
        app.innerHTML = renderLogin();
    } else if (AppState.currentView === 'filemanager') {
        app.innerHTML = renderFileManager();
    } else {
        app.innerHTML = renderDashboard();
    }
}

// Utility functions
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function getTimestamp() {
    const now = new Date();
    return now.toLocaleTimeString();
}

function colorizeLog(text) {
    const lower = text.toLowerCase();
    if (lower.includes('error') || lower.includes('err:') || lower.includes('failed')) {
        return 'log-error';
    } else if (lower.includes('warn') || lower.includes('warning')) {
        return 'log-warn';
    } else if (lower.includes('info') || lower.includes('debug')) {
        return 'log-info';
    } else if (lower.includes('success') || lower.includes('ok') || lower.includes('done')) {
        return 'log-success';
    }
    return '';
}

// Handle window resize to close mobile menu when expanding
let resizeTimeout;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
        const menu = document.getElementById('mobile-menu');
        if (menu && window.innerWidth >= 992) { // Bootstrap lg breakpoint
            menu.style.display = 'none';
        }
    }, 150);
});

// Password enter key support
document.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !AppState.isLoggedIn) {
        handleLogin();
    }
});