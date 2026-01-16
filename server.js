const express = require('express');
const { spawn, exec } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const WebSocket = require('ws');
const http = require('http');
const multer = require('multer');
const nodemailer = require('nodemailer');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ noServer: true });

const PORT_DEFAULT = 5000;
const CONFIG_FILE = path.join(__dirname, 'config.json');

// Load configuration
let config = null;
let emailTransporter = null;

async function loadConfiguration() {
    try {
        const data = await fs.readFile(CONFIG_FILE, 'utf8');
        config = JSON.parse(data);
        console.log('Configuration loaded successfully');
        
        // Setup email transporter if enabled
        if (config.email.enabled) {
            try {
                emailTransporter = nodemailer.createTransport({
                    service: config.email.service,
                    auth: {
                        user: config.email.user,
                        pass: config.email.pass
                    }
                });
                console.log('Email notifications enabled');
            } catch (error) {
                console.error('Failed to setup email transporter:', error.message);
            }
        }
    } catch (error) {
        console.error('Failed to load configuration:', error.message);
        console.error('Please run "npm run setup" to configure the application');
        process.exit(1);
    }
}

// Store running processes
const processes = new Map();
const logStreams = new Map();
const processStats = new Map();
const projectHealth = new Map();
const restartingProjects = new Set();

app.use(express.json());
app.use(express.static('public'));

// Send crash email
async function sendCrashEmail(project, exitCode, lastLogs) {
    if (!config.email.enabled || !emailTransporter) return;
    
    try {
        const logText = lastLogs.slice(-100).map(log => log.text).join('');
        
        await emailTransporter.sendMail({
            from: config.email.user,
            to: config.email.recipient,
            subject: `🚨 Project Crash Alert: ${project.name}`,
            text: `Project "${project.name}" has crashed.\n\nDetails:\n- Path: ${project.path}\n- Command: ${project.command}\n- Exit Code: ${exitCode}\n- Time: ${new Date().toLocaleString()}\n\nLast 100 log lines attached.`,
            attachments: [{
                filename: `${project.name}-crash-logs.txt`,
                content: logText
            }]
        });
        
        console.log(`Crash email sent for project: ${project.name}`);
    } catch (error) {
        console.error('Failed to send crash email:', error.message);
    }
}

// Load config (projects only now)
async function loadConfig() {
    if (!config) await loadConfiguration();
    return config;
}

// Save config (projects only)
async function saveConfig(configData) {
    config = configData;
    await fs.writeFile(CONFIG_FILE, JSON.stringify(config, null, 2));
}

// Generate unique ID
function generateId() {
    return crypto.randomBytes(8).toString('hex');
}

// Get project status
function getProjectStatus(id) {
    return processes.has(id) ? 'running' : 'stopped';
}

// Format uptime from seconds
function formatUptime(seconds) {
    const weeks = Math.floor(seconds / 604800);
    const days = Math.floor((seconds % 604800) / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    let parts = [];
    if (weeks > 0) parts.push(`${weeks}w`);
    if (days > 0 || weeks > 0) parts.push(`${days}d`);
    if (hours > 0 || days > 0 || weeks > 0) parts.push(`${hours}h`);
    if (minutes > 0 || hours > 0 || days > 0 || weeks > 0) parts.push(`${minutes}m`);
    parts.push(`${secs}s`);
    
    return parts.join(' ');
}

// Get all child PIDs of a process
function getChildPids(pid) {
    return new Promise((resolve) => {
        exec(`pgrep -P ${pid}`, (error, stdout) => {
            if (error) {
                resolve([]);
                return;
            }
            const pids = stdout.trim().split('\n').filter(p => p).map(p => parseInt(p));
            resolve(pids);
        });
    });
}

// Get combined stats for process and all its children
function getProcessStats(pid, startTime) {
    return new Promise(async (resolve) => {
        // Get child PIDs
        const childPids = await getChildPids(pid);
        const allPids = [pid, ...childPids];
        
        // Build ps command for all PIDs
        const pidsStr = allPids.join(',');
        const psCommand = `ps -p ${pidsStr} -o pcpu=,pmem= 2>/dev/null`;
        
        exec(psCommand, (error, stdout, stderr) => {
            if (error || !stdout.trim()) {
                // Process might have just died, return zeros
                resolve({ cpu: 0, memory: 0, uptime: '0s' });
                return;
            }
            
            // Sum up CPU and memory from all processes
            let totalCpu = 0;
            let totalMemory = 0;
            
            const lines = stdout.trim().split('\n');
            lines.forEach(line => {
                const parts = line.trim().split(/\s+/).filter(p => p);
                if (parts.length >= 2) {
                    totalCpu += parseFloat(parts[0]) || 0;
                    totalMemory += parseFloat(parts[1]) || 0;
                }
            });
            
            const uptimeSeconds = Math.floor((Date.now() - startTime) / 1000);
            
            resolve({
                cpu: totalCpu,
                memory: totalMemory,
                uptime: formatUptime(uptimeSeconds)
            });
        });
    });
}

// Update stats for all running processes
async function updateAllStats() {
    for (const [projectId, proc] of processes.entries()) {
        if (proc && proc.pid) {
            const stats = await getProcessStats(proc.pid, proc.startTime);
            processStats.set(projectId, stats);
            
            // Broadcast updated stats to all status listeners
            broadcastStatusUpdate(projectId, 'running', stats, projectHealth.get(projectId));
        }
    }
}

// Start stats monitoring interval (every 1 second)
setInterval(updateAllStats, 1000);

// Broadcast project status update to all WebSocket clients
function broadcastStatusUpdate(projectId, status, stats = null, health = null) {
    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN && client.isStatusListener) {
            client.send(JSON.stringify({
                type: 'status_update',
                projectId,
                status,
                stats,
                health
            }));
        }
    });
}

// Kill process and all children
async function killProcessTree(pid) {
    try {
        // Get all child PIDs
        const childPids = await getChildPids(pid);
        
        // Kill children first
        for (const childPid of childPids) {
            try {
                process.kill(childPid, 'SIGTERM');
                console.log(`Killed child process ${childPid}`);
            } catch (e) {
                // Process might already be dead
            }
        }
        
        // Kill parent
        try {
            process.kill(pid, 'SIGTERM');
            console.log(`Killed parent process ${pid}`);
        } catch (e) {
            // Process might already be dead
        }
        
        // Wait a bit, then force kill any remaining
        setTimeout(async () => {
            const remainingChildren = await getChildPids(pid);
            for (const childPid of remainingChildren) {
                try {
                    process.kill(childPid, 'SIGKILL');
                    console.log(`Force killed child process ${childPid}`);
                } catch (e) {}
            }
            
            try {
                process.kill(pid, 'SIGKILL');
                console.log(`Force killed parent process ${pid}`);
            } catch (e) {}
        }, 1000);
    } catch (error) {
        console.error('Error killing process tree:', error);
    }
}

function startProject(project) {
    console.log(`Starting project: ${project.name}`);

    if (processes.has(project.id)) {
        return { success: false, message: 'Project already running' };
    }

    try {
        console.log(`Executing: ${project.command} in ${project.path}`);

        const proc = spawn(project.command, {
            cwd: project.path,
            stdio: ['ignore', 'pipe', 'pipe'],
            shell: true,
            detached: false // Keep as part of this process group
        });

        proc.startTime = Date.now();

        // Initialize log stream for this project if it doesn't exist
        if (!logStreams.has(project.id)) {
            logStreams.set(project.id, []);
        }

        // Initialize health tracking
        if (!projectHealth.has(project.id)) {
            projectHealth.set(project.id, { crashCount: 0, lastCrash: null });
        }

        // In startProject(), update stdout/stderr handlers:
        proc.stdout?.on('data', (data) => {
            const log = data.toString();
            const timestamp = new Date().toLocaleTimeString();
            const logs = logStreams.get(project.id) || [];
            logs.push({ text: log, timestamp: timestamp });  // Store with timestamp
            if (logs.length > 1000) logs.shift();
            logStreams.set(project.id, logs);
            broadcastLog(project.id, log, timestamp);  // Pass timestamp
        });

        proc.stderr?.on('data', (data) => {
            const log = data.toString();
            const timestamp = new Date().toLocaleTimeString();
            const logs = logStreams.get(project.id) || [];
            logs.push({ text: log, timestamp: timestamp });  // Store with timestamp
            if (logs.length > 1000) logs.shift();
            logStreams.set(project.id, logs);
            broadcastLog(project.id, log, timestamp);  // Pass timestamp
        });

        proc.on('exit', async (code, signal) => {
            console.log(`Project ${project.name} exited with code ${code}, signal ${signal}`);
            
            // Kill any remaining child processes
            if (proc.pid) {
                await killProcessTree(proc.pid);
            }
            
            processes.delete(project.id);
            processStats.delete(project.id);
            
            const exitLog = `\nProcess exited with code ${code}\n`;
            const timestamp = new Date().toLocaleTimeString();
            const logs = logStreams.get(project.id) || [];
            logs.push({ text: exitLog, timestamp: timestamp });
            logStreams.set(project.id, logs);
            broadcastLog(project.id, exitLog, timestamp);

            // Only broadcast stopped if not restarting
            if (!restartingProjects.has(project.id)) {
                // Track crash if exit code indicates failure
                if (code !== 0 && code !== null) {
                    const health = projectHealth.get(project.id) || { crashCount: 0, lastCrash: null };
                    health.crashCount++;
                    health.lastCrash = {
                        time: new Date().toISOString(),
                        code: code,
                        reason: `Exited with code ${code}`
                    };
                    projectHealth.set(project.id, health);

                    // Send email if enabled for this project
                    if (project.emailOnCrash) {
                        await sendCrashEmail(project, code, logs);
                    }

                    broadcastStatusUpdate(project.id, 'stopped', null, health);
                } else {
                    broadcastStatusUpdate(project.id, 'stopped', null, projectHealth.get(project.id));
                }
            }
        });

        proc.on('error', (err) => {
            console.error(`Failed to start project ${project.name}:`, err);
            const errorLog = `\nError: ${err.message}\n`;
            const timestamp = new Date().toLocaleTimeString();
            const logs = logStreams.get(project.id) || [];
            logs.push({ text: errorLog, timestamp: timestamp });
            logStreams.set(project.id, logs);
            broadcastLog(project.id, errorLog, timestamp);
        });

        processes.set(project.id, proc);
        
        // Initialize stats immediately
        processStats.set(project.id, { cpu: 0, memory: 0, uptime: '0s' });
        broadcastStatusUpdate(project.id, 'running', { cpu: 0, memory: 0, uptime: '0s' }, projectHealth.get(project.id));

        console.log(`Project ${project.name} started with PID ${proc.pid}`);
        return { success: true, message: 'Project started', pid: proc.pid };
    } catch (error) {
        console.error(`Error starting project ${project.name}:`, error);
        return { success: false, message: error.message };
    }
}

// Stop a project
async function stopProject(id, skipBroadcast = false) {
    const proc = processes.get(id);
    if (!proc) {
        return { success: false, message: 'Project not running' };
    }

    try {
        if (proc.pid) {
            await killProcessTree(proc.pid);
        }
        processes.delete(id);
        processStats.delete(id);
        
        // Only broadcast if not part of a restart operation
        if (!skipBroadcast) {
            broadcastStatusUpdate(id, 'stopped', null, projectHealth.get(id));
        }
        
        return { success: true, message: 'Project stopped' };
    } catch (error) {
        return { success: false, message: error.message };
    }
}

// Broadcast log to WebSocket clients
function broadcastLog(projectId, log, timestamp) {
    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN && client.projectId === projectId) {
            client.send(JSON.stringify({ text: log, timestamp: timestamp }));
        }
    });
}

// WebSocket connection for logs and status updates
server.on('upgrade', (request, socket, head) => {
    const url = new URL(request.url, `http://${request.headers.host}`);
    if (url.pathname.startsWith('/logs/')) {
        wss.handleUpgrade(request, socket, head, (ws) => {
            ws.projectId = url.pathname.split('/').pop();
            ws.isStatusListener = false;
            wss.emit('connection', ws, request);
        });
    } else if (url.pathname === '/status') {
        wss.handleUpgrade(request, socket, head, (ws) => {
            ws.isStatusListener = true;
            wss.emit('connection', ws, request);
        });
    } else {
        socket.destroy();
    }
});

wss.on('connection', (ws) => {
    if (ws.isStatusListener) {
        console.log('WebSocket connected for status updates');
    } else {
        console.log(`WebSocket connected for project: ${ws.projectId}`);
        
        // Send existing logs with their timestamps
        const logs = logStreams.get(ws.projectId) || [];
        if (logs.length === 0) {
            ws.send(JSON.stringify({ text: 'No logs available yet. Waiting for output...\n', timestamp: new Date().toLocaleTimeString() }));
        } else {
            logs.forEach(logObj => {
                ws.send(JSON.stringify({ text: logObj.text, timestamp: logObj.timestamp }));
            });
        }
    }

    ws.on('error', console.error);
    ws.on('message', () => {});
    
    ws.on('close', () => {
        if (ws.isStatusListener) {
            console.log('WebSocket disconnected for status updates');
        } else {
            console.log(`WebSocket disconnected for project: ${ws.projectId}`);
        }
    });
});

// API Routes

// Login
app.post('/api/login', async (req, res) => {
    try {
        const { password } = req.body;
        const match = await bcrypt.compare(password, config.auth.passwordHash);

        if (match) {
            res.json({ success: true });
        } else {
            res.status(401).json({ success: false });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Clear project logs endpoint
app.post('/api/projects/:id/clear-logs', async (req, res) => {
    try {
        const projectId = req.params.id;
        logStreams.set(projectId, []); // Clear but keep the array
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Restart all running projects endpoint
app.post('/api/projects/restart-all', async (req, res) => {
    try {
        const config = await loadConfig();
        const runningProjects = config.projects.filter(p => getProjectStatus(p.id) === 'running');
        
        // Mark all as restarting
        runningProjects.forEach(p => restartingProjects.add(p.id));
        
        // Broadcast restarting status for all
        for (const project of runningProjects) {
            broadcastStatusUpdate(project.id, 'restarting', null, projectHealth.get(project.id));
        }
        
        // Stop all without broadcasting
        for (const project of runningProjects) {
            await stopProject(project.id, true);
        }
        
        // Wait before restarting
        setTimeout(() => {
            for (const project of runningProjects) {
                startProject(project);
                restartingProjects.delete(project.id);
            }
        }, 2000);
        
        res.json({ success: true, message: `Restarting ${runningProjects.length} projects` });
    } catch (error) {
        runningProjects.forEach(p => restartingProjects.delete(p.id));
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get all projects
app.get('/api/projects', async (req, res) => {
    try {
        const config = await loadConfig();
        const projects = config.projects.map(p => ({
            ...p,
            status: getProjectStatus(p.id),
            stats: processStats.get(p.id) || { cpu: 0, memory: 0, uptime: '0s' },
            health: projectHealth.get(p.id) || { crashCount: 0, lastCrash: null }
        }));
        res.json(projects);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Add project
app.post('/api/projects', async (req, res) => {
    try {
        const config = await loadConfig();
        const newProject = {
            id: generateId(),
            ...req.body
        };
        config.projects.push(newProject);
        await saveConfig(config);
        res.json(newProject);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Update project
app.put('/api/projects/:id', async (req, res) => {
    try {
        const config = await loadConfig();
        const index = config.projects.findIndex(p => p.id === req.params.id);

        if (index === -1) {
            return res.status(404).json({ error: 'Project not found' });
        }

        config.projects[index] = {
            ...config.projects[index],
            ...req.body
        };

        await saveConfig(config);
        res.json(config.projects[index]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Delete project
app.delete('/api/projects/:id', async (req, res) => {
    try {
        await stopProject(req.params.id);
        logStreams.delete(req.params.id);
        processStats.delete(req.params.id);
        projectHealth.delete(req.params.id);

        const config = await loadConfig();
        config.projects = config.projects.filter(p => p.id !== req.params.id);
        await saveConfig(config);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Start project
app.post('/api/projects/:id/start', async (req, res) => {
    try {
        const config = await loadConfig();
        const project = config.projects.find(p => p.id === req.params.id);

        if (!project) {
            return res.status(404).json({ error: 'Project not found' });
        }

        const result = startProject(project);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Stop project
app.post('/api/projects/:id/stop', async (req, res) => {
    try {
        const result = await stopProject(req.params.id);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Restart project
app.post('/api/projects/:id/restart', async (req, res) => {
    try {
        const config = await loadConfig();
        const project = config.projects.find(p => p.id === req.params.id);

        if (!project) {
            return res.status(404).json({ error: 'Project not found' });
        }

        // Mark as restarting
        restartingProjects.add(req.params.id);
        
        // Broadcast restarting status FIRST
        broadcastStatusUpdate(req.params.id, 'restarting', null, projectHealth.get(req.params.id));
        
        // Stop without broadcasting (to keep "restarting" status visible)
        await stopProject(req.params.id, true);

        setTimeout(() => {
            startProject(project);
            // Remove from restarting set after starting
            restartingProjects.delete(req.params.id);
        }, 2000);

        res.json({ success: true, message: 'Project restarting' });
    } catch (error) {
        restartingProjects.delete(req.params.id);
        res.status(500).json({ error: error.message });
    }
});

// File read endpoint
app.post('/api/file/read', async (req, res) => {
    try {
        const { path } = req.body;
        
        // Security check - prevent path traversal
        if (path.includes('..')) {
            return res.status(400).json({ success: false, message: 'Invalid path' });
        }
        
        const content = await fs.readFile(path, 'utf8');
        res.json({ success: true, content });
    } catch (error) {
        res.json({ success: false, message: error.message });
    }
});

// File write endpoint
app.post('/api/file/write', async (req, res) => {
    try {
        const { path, content } = req.body;
        
        // Security check
        if (path.includes('..')) {
            return res.status(400).json({ success: false, message: 'Invalid path' });
        }
        
        // Check if system file
        const isSystemFile = path.startsWith('/etc') || path.startsWith('/sys') || path.startsWith('/proc');
        if (isSystemFile) {
            console.log(`[File Write] Warning: Writing to system file: ${path}`);
        }
        
        await fs.writeFile(path, content, 'utf8');
        res.json({ success: true });
    } catch (error) {
        res.json({ success: false, message: error.message });
    }
});

// File download endpoint
app.post('/api/file/download', async (req, res) => {
    try {
        const { path } = req.body;
        
        if (path.includes('..')) {
            return res.status(400).json({ success: false, message: 'Invalid path' });
        }
        
        res.download(path);
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// File upload endpoint
const upload = multer({ dest: '/tmp/' });

app.post('/api/file/upload', upload.single('file'), async (req, res) => {
    try {
        const { directory } = req.body;
        const file = req.file;
        
        if (!file) {
            return res.json({ success: false, message: 'No file provided' });
        }
        
        const targetPath = path.join(directory, file.originalname);
        await fs.rename(file.path, targetPath);
        
        res.json({ success: true });
    } catch (error) {
        res.json({ success: false, message: error.message });
    }
});

// Update project (git pull)
app.post('/api/projects/:id/update', async (req, res) => {
    try {
        const config = await loadConfig();
        const project = config.projects.find(p => p.id === req.params.id);

        if (!project) {
            return res.status(404).json({ error: 'Project not found' });
        }

        console.log(`[Git Update] Starting update for ${project.name} at ${project.path}`);

        // Set HOME environment variable if not set
        const gitEnv = { ...process.env };
        if (!gitEnv.HOME) {
            // Try to determine HOME from the project path
            gitEnv.HOME = process.env.HOME || '/home/meap';
            console.log(`[Git Update] Setting HOME to: ${gitEnv.HOME}`);
        }

        // Add to safe.directory to avoid dubious ownership error
        const safeCmd = `git config --global --add safe.directory "${project.path}"`;
        exec(safeCmd, { env: gitEnv }, (err, stdout, stderr) => {
            if (err) {
                console.log(`[Git Update] Warning: Failed to add to safe.directory:`, err.message);
                console.log(`[Git Update] Trying alternative method...`);
                
                // Alternative: Add safe.directory without --global
                const altCmd = `cd "${project.path}" && git config --local core.fileMode false`;
                exec(altCmd, { env: gitEnv }, () => {
                    // Continue regardless
                    executeGitPull();
                });
            } else {
                console.log(`[Git Update] Added ${project.path} to safe.directory`);
                executeGitPull();
            }
            
            if (stderr) {
                console.log(`[Git Update] safe.directory stderr:`, stderr);
            }
            
            function executeGitPull() {
                console.log(`[Git Update] Executing git pull in ${project.path}`);
                const gitProcess = spawn('git', ['pull'], { 
                    cwd: project.path,
                    env: gitEnv
                });

                let output = '';

                gitProcess.stdout.on('data', (data) => {
                    const chunk = data.toString();
                    console.log(`[Git Update] stdout:`, chunk);
                    output += chunk;
                });

                gitProcess.stderr.on('data', (data) => {
                    const chunk = data.toString();
                    console.log(`[Git Update] stderr:`, chunk);
                    output += chunk;
                });

                gitProcess.on('close', (code) => {
                    console.log(`[Git Update] Completed with code ${code}`);
                    if (code === 0) {
                        res.json({ success: true, message: 'Update successful', output });
                    } else {
                        res.json({ success: false, message: 'Update failed', output });
                    }
                });

                gitProcess.on('error', (err) => {
                    console.error(`[Git Update] Process error:`, err);
                    res.json({ success: false, message: err.message, output: '' });
                });
            }
        });
    } catch (error) {
        console.error(`[Git Update] Catch error:`, error);
        res.status(500).json({ error: error.message });
    }
});

// Execute command - COMPLETE REPLACEMENT
app.post('/api/execute', async (req, res) => {
    try {
        const { directory, command } = req.body;

        if (!directory || !command) {
            return res.status(400).json({ error: 'Directory and command are required' });
        }

        try {
            await fs.access(directory);
        } catch {
            return res.status(400).json({ 
                success: false, 
                message: 'Directory does not exist',
                output: ''
            });
        }

        // Set HOME environment variable
        const homeDir = process.env.HOME || '/home/meap';
        const cmdEnv = { ...process.env, HOME: homeDir };
        
        console.log(`[Execute] Command: "${command}"`);
        console.log(`[Execute] Directory: "${directory}"`);
        console.log(`[Execute] HOME: "${homeDir}"`);

        // Check if it's a git command
        const isGitCommand = command.trim().startsWith('git');
        
        if (isGitCommand) {
            console.log(`[Execute] Git command detected, adding to safe.directory`);
            
            // Use the SAME approach as the Update endpoint
            const safeCmd = `git config --global --add safe.directory "${directory}"`;
            
            exec(safeCmd, { env: cmdEnv }, (err, stdout, stderr) => {
                if (err) {
                    console.log(`[Execute] safe.directory command failed:`, err.message);
                    console.log(`[Execute] stderr:`, stderr);
                } else {
                    console.log(`[Execute] Successfully added ${directory} to safe.directory`);
                }
                if (stdout) console.log(`[Execute] stdout:`, stdout);
                
                // Run the actual git command
                executeCommandInternal(directory, command, res, cmdEnv);
            });
        } else {
            executeCommandInternal(directory, command, res, cmdEnv);
        }
    } catch (error) {
        console.error('[Execute] Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Helper function to execute command
function executeCommandInternal(directory, command, res, env) {
    console.log(`[Execute Internal] Running: "${command}" in "${directory}"`);
    
    const proc = spawn(command, {
        cwd: directory,
        shell: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: env
    });

    let output = '';
    let errorOutput = '';

    proc.stdout.on('data', (data) => {
        const chunk = data.toString();
        console.log(`[Execute Internal] stdout:`, chunk);
        output += chunk;
    });

    proc.stderr.on('data', (data) => {
        const chunk = data.toString();
        console.log(`[Execute Internal] stderr:`, chunk);
        errorOutput += chunk;
    });

    proc.on('close', (code) => {
        console.log(`[Execute Internal] Completed with code ${code}`);
        const combinedOutput = output + errorOutput;
        res.json({ 
            success: code === 0, 
            message: code === 0 ? 'Command executed successfully' : `Command exited with code ${code}`,
            output: combinedOutput 
        });
    });

    proc.on('error', (err) => {
        console.error(`[Execute Internal] Process error:`, err);
        res.json({ 
            success: false, 
            message: err.message, 
            output: '' 
        });
    });
}

// Auto-start projects on server start
async function autoStartProjects() {
    try {
        const config = await loadConfig();
        const autoStartProjects = config.projects.filter(p => p.autoRestart);

        for (const project of autoStartProjects) {
            console.log(`Auto-starting: ${project.name}`);
            startProject(project);
        }
    } catch (error) {
        console.error('Error auto-starting projects:', error);
    }
}

// Initialize and start server
async function main() {
    await loadConfiguration();

    const PORT = config.server.port || PORT_DEFAULT;
    const HOST = config.server.host || '0.0.0.0';

    await autoStartProjects();

    server.listen(PORT, HOST, () => {
        console.log(`Server Manager running on http://${HOST}:${PORT}`);
        console.log('Access from any device on your network');
    });
}

main().catch(console.error);