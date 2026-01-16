/*
* renders/login.js
* Login page renderer
*/

function renderLogin() {
    return `
        <div class="min-vh-100 d-flex align-items-center justify-content-center">
            <div class="card login-card shadow" style="width: 400px;">
                <div class="card-body p-4">
                    <div class="d-flex justify-content-between align-items-center mb-4">
                        <h2 class="card-title mb-0">Server Manager</h2>
                        <i class="bi bi-${AppState.currentTheme === 'dark' ? 'sun' : 'moon'}-fill fs-4 theme-toggle" onclick="toggleTheme()"></i>
                    </div>
                    <div>
                        <div class="mb-3">
                            <label class="form-label">Password</label>
                            <input type="password" id="password" class="form-control" />
                        </div>
                        <div id="login-error" class="alert alert-danger py-2 d-none"></div>
                        <button onclick="handleLogin()" class="btn btn-primary w-100">Login</button>
                    </div>
                </div>
            </div>
        </div>
    `;
}