'use strict';

const { spawn, exec } = require('child_process');
const { sendCrashEmail } = require('./email');

/**
 * Process lifecycle, stats sampling, health tracking, and log buffering.
 * Broadcast callbacks are injected so this module stays transport-agnostic.
 */

const processes = new Map(); // projectId -> ChildProcess
const logStreams = new Map(); // projectId -> [{ text, timestamp }]
const processStats = new Map(); // projectId -> { cpu, memory, uptime }
const projectHealth = new Map(); // projectId -> { crashCount, lastCrash }
const restartingProjects = new Set();

let broadcaster = {
  broadcastStatus() {},
  broadcastLog() {},
};

function setBroadcaster(b) {
  broadcaster = b;
}

function getProjectStatus(id) {
  return processes.has(id) ? 'running' : 'stopped';
}

function formatUptime(seconds) {
  const weeks = Math.floor(seconds / 604800);
  const days = Math.floor((seconds % 604800) / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  const parts = [];
  if (weeks > 0) parts.push(`${weeks}w`);
  if (days > 0 || weeks > 0) parts.push(`${days}d`);
  if (hours > 0 || days > 0 || weeks > 0) parts.push(`${hours}h`);
  if (minutes > 0 || hours > 0 || days > 0 || weeks > 0) parts.push(`${minutes}m`);
  parts.push(`${secs}s`);
  return parts.join(' ');
}

function getChildPids(pid) {
  return new Promise((resolve) => {
    if (process.platform === 'win32') return resolve([]); // taskkill /T handles the tree
    exec(`pgrep -P ${pid}`, (error, stdout) => {
      if (error) return resolve([]);
      const pids = stdout.trim().split('\n').filter(Boolean).map((p) => parseInt(p, 10));
      resolve(pids);
    });
  });
}

function getProcessStats(pid, startTime) {
  return new Promise(async (resolve) => {
    const childPids = await getChildPids(pid);
    const allPids = [pid, ...childPids];
    const pidsStr = allPids.join(',');
    exec(`ps -p ${pidsStr} -o pcpu=,pmem= 2>/dev/null`, (error, stdout) => {
      if (error || !stdout.trim()) {
        return resolve({ cpu: 0, memory: 0, uptime: '0s' });
      }
      let totalCpu = 0;
      let totalMemory = 0;
      for (const line of stdout.trim().split('\n')) {
        const parts = line.trim().split(/\s+/).filter(Boolean);
        if (parts.length >= 2) {
          totalCpu += parseFloat(parts[0]) || 0;
          totalMemory += parseFloat(parts[1]) || 0;
        }
      }
      const uptimeSeconds = Math.floor((Date.now() - startTime) / 1000);
      resolve({ cpu: totalCpu, memory: totalMemory, uptime: formatUptime(uptimeSeconds) });
    });
  });
}

async function updateAllStats() {
  for (const [projectId, proc] of processes.entries()) {
    if (proc && proc.pid) {
      const stats = await getProcessStats(proc.pid, proc.startTime);
      processStats.set(projectId, stats);
      broadcaster.broadcastStatus(projectId, 'running', stats, projectHealth.get(projectId));
    }
  }
}

function pushLog(projectId, text) {
  const timestamp = new Date().toLocaleTimeString();
  const logs = logStreams.get(projectId) || [];
  logs.push({ text, timestamp });
  if (logs.length > 1000) logs.shift();
  logStreams.set(projectId, logs);
  broadcaster.broadcastLog(projectId, text, timestamp);
}

async function killProcessTree(pid) {
  try {
    if (process.platform === 'win32') {
      await new Promise((resolve) => {
        exec(`taskkill /PID ${pid} /T /F`, () => resolve());
      });
      return;
    }
    const childPids = await getChildPids(pid);
    for (const childPid of childPids) {
      try {
        process.kill(childPid, 'SIGTERM');
      } catch { /* already dead */ }
    }
    try {
      process.kill(pid, 'SIGTERM');
    } catch { /* already dead */ }

    await new Promise((r) => setTimeout(r, 1000));

    const remainingChildren = await getChildPids(pid);
    for (const childPid of remainingChildren) {
      try {
        process.kill(childPid, 'SIGKILL');
      } catch { /* already dead */ }
    }
    try {
      process.kill(pid, 'SIGKILL');
    } catch { /* already dead */ }
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
      detached: false,
    });

    proc.startTime = Date.now();

    if (!logStreams.has(project.id)) logStreams.set(project.id, []);
    if (!projectHealth.has(project.id)) {
      projectHealth.set(project.id, { crashCount: 0, lastCrash: null });
    }

    proc.stdout?.on('data', (data) => pushLog(project.id, data.toString()));
    proc.stderr?.on('data', (data) => pushLog(project.id, data.toString()));

    proc.on('exit', async (code, signal) => {
      console.log(`Project ${project.name} exited with code ${code}, signal ${signal}`);
      if (proc.pid) await killProcessTree(proc.pid);

      processes.delete(project.id);
      processStats.delete(project.id);

      pushLog(project.id, `\nProcess exited with code ${code}\n`);

      if (!restartingProjects.has(project.id)) {
        if (code !== 0 && code !== null) {
          const health = projectHealth.get(project.id) || { crashCount: 0, lastCrash: null };
          health.crashCount++;
          health.lastCrash = {
            time: new Date().toISOString(),
            code,
            reason: `Exited with code ${code}`,
          };
          projectHealth.set(project.id, health);

          if (project.emailOnCrash) {
            await sendCrashEmail(project, code, logStreams.get(project.id) || []);
          }
          broadcaster.broadcastStatus(project.id, 'stopped', null, health);
        } else {
          broadcaster.broadcastStatus(project.id, 'stopped', null, projectHealth.get(project.id));
        }
      }
    });

    proc.on('error', (err) => {
      console.error(`Failed to start project ${project.name}:`, err);
      pushLog(project.id, `\nError: ${err.message}\n`);
    });

    processes.set(project.id, proc);
    processStats.set(project.id, { cpu: 0, memory: 0, uptime: '0s' });
    broadcaster.broadcastStatus(project.id, 'running', { cpu: 0, memory: 0, uptime: '0s' }, projectHealth.get(project.id));

    console.log(`Project ${project.name} started with PID ${proc.pid}`);
    return { success: true, message: 'Project started', pid: proc.pid };
  } catch (error) {
    console.error(`Error starting project ${project.name}:`, error);
    return { success: false, message: error.message };
  }
}

async function stopProject(id, skipBroadcast = false) {
  const proc = processes.get(id);
  if (!proc) {
    return { success: false, message: 'Project not running' };
  }
  try {
    if (proc.pid) await killProcessTree(proc.pid);
    processes.delete(id);
    processStats.delete(id);
    if (!skipBroadcast) {
      broadcaster.broadcastStatus(id, 'stopped', null, projectHealth.get(id));
    }
    return { success: true, message: 'Project stopped' };
  } catch (error) {
    return { success: false, message: error.message };
  }
}

async function stopAllProjects() {
  const ids = [...processes.keys()];
  for (const id of ids) {
    await stopProject(id, true);
  }
}

function getStats(projectId) {
  return processStats.get(projectId) || { cpu: 0, memory: 0, uptime: '0s' };
}

function getHealth(projectId) {
  return projectHealth.get(projectId) || { crashCount: 0, lastCrash: null };
}

function getLogs(projectId) {
  return logStreams.get(projectId) || [];
}

function clearLogs(projectId) {
  logStreams.set(projectId, []);
}

function dropProjectState(projectId) {
  logStreams.delete(projectId);
  processStats.delete(projectId);
  projectHealth.delete(projectId);
}

function markRestarting(projectId, on) {
  if (on) restartingProjects.add(projectId);
  else restartingProjects.delete(projectId);
}

function isRestarting(projectId) {
  return restartingProjects.has(projectId);
}

module.exports = {
  setBroadcaster,
  getProjectStatus,
  formatUptime,
  getChildPids,
  getProcessStats,
  updateAllStats,
  startProject,
  stopProject,
  stopAllProjects,
  getStats,
  getHealth,
  getLogs,
  clearLogs,
  dropProjectState,
  markRestarting,
  isRestarting,
  processes,
};
