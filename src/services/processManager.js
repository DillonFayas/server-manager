'use strict';

const fs = require('fs');
const nodePath = require('path');
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
      if (processes.get(projectId) !== proc || proc.exiting || proc.stopRequested) continue;
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

// Every POSIX project is started in its own process group. Signal the whole
// group, including grandchildren reparented after the shell/npm wrapper exits.
async function killProcessTree(pid) {
  if (!Number.isInteger(pid) || pid <= 1) throw new Error('Invalid project PID');
  if (process.platform === 'win32') {
    await new Promise((resolve, reject) => {
      exec(`taskkill /PID ${pid} /T /F`, (error) => {
        // taskkill also reports failure when the process has already exited.
        if (error) {
          try { process.kill(pid, 0); } catch (err) {
            if (err.code === 'ESRCH') return resolve();
          }
          return reject(error);
        }
        resolve();
      });
    });
    return;
  }
  const signalGroup = (signal) => {
    try { process.kill(-pid, signal); } catch (error) {
      if (error.code !== 'ESRCH') throw error;
    }
  };
  signalGroup('SIGTERM');
  await new Promise((resolve) => setTimeout(resolve, 1000));
  // The leader may have exited already; descendants retain its group ID.
  signalGroup('SIGKILL');
}

function cleanProcess(proc) {
  if (!proc.cleanupPromise) {
    proc.cleanupPromise = proc.pid ? killProcessTree(proc.pid) : Promise.resolve();
    // A failed cleanup must remain visible and keep the start slot reserved.
    proc.cleanupPromise.catch(() => { proc.cleanupPromise = null; });
  }
  return proc.cleanupPromise;
}

async function startProject(project) {
  console.log(`Starting project: ${project.name}`);

  if (processes.has(project.id)) {
    return { success: false, message: 'Project already running' };
  }

  // FIX: fail fast with actionable messages instead of a cryptic
  // `spawn /bin/sh ENOENT` (how a missing/relative cwd surfaces on spawn).
  if (!nodePath.isAbsolute(project.path)) {
    const message = `Project path must be an absolute path (got "${project.path}"). Edit the project and use e.g. /home/user/project.`;
    console.error(`Start refused for ${project.name}: ${message}`);
    return { success: false, message };
  }

  let dirStat = null;
  try {
    dirStat = fs.statSync(project.path);
  } catch { /* not found */ }
  if (!dirStat || !dirStat.isDirectory()) {
    const message = `Project directory does not exist: ${project.path}`;
    console.error(`Start refused for ${project.name}: ${message}`);
    return { success: false, message };
  }

  try {
    console.log(`Executing: ${project.command} in ${project.path}`);

    const proc = spawn(project.command, {
      cwd: project.path,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true,
      detached: process.platform !== 'win32',
      windowsHide: true,
    });

    proc.startTime = Date.now();
    let resolveCompletion;
    proc.completion = new Promise((resolve) => { resolveCompletion = resolve; });

    if (!logStreams.has(project.id)) logStreams.set(project.id, []);
    if (!projectHealth.has(project.id)) {
      projectHealth.set(project.id, { crashCount: 0, lastCrash: null });
    }

    proc.stdout?.on('data', (data) => pushLog(project.id, data.toString()));
    proc.stderr?.on('data', (data) => pushLog(project.id, data.toString()));

    // Permanent listener attached synchronously so a spawn failure never
    // becomes an unhandled 'error' event (which would crash the server).
    proc.on('error', (err) => {
      console.error(`Process error for project ${project.name}:`, err.message);
      pushLog(project.id, `\nError: ${err.message}\n`);
    });

    proc.on('exit', (code, signal) => {
      proc.exiting = true;
      // Catch all asynchronous cleanup failures: event emitters do not await us.
      (async () => {
        console.log(`Project ${project.name} exited with code ${code}, signal ${signal}`);
        await cleanProcess(proc);
        // A late callback must never delete or broadcast over a newer process.
        if (processes.get(project.id) !== proc) return;
        processes.delete(project.id);
        processStats.delete(project.id);
        const reason = signal ? `Killed by signal ${signal}` : `Exited with code ${code}`;
        pushLog(project.id, `\nProcess ${reason.toLowerCase()}\n`);

        if (!proc.stopRequested && (signal || (code !== 0 && code !== null))) {
          const health = projectHealth.get(project.id) || { crashCount: 0, lastCrash: null };
          health.crashCount++;
          health.lastCrash = { time: new Date().toISOString(), code, signal, reason };
          projectHealth.set(project.id, health);
          // Publish stopped before notification I/O; email failure cannot hide it.
          broadcaster.broadcastStatus(project.id, 'stopped', null, health);
          if (project.emailOnCrash) {
            try { await sendCrashEmail(project, code ?? signal, logStreams.get(project.id) || []); }
            catch (error) { console.error('Crash email failed:', error.message); }
          }
        } else if (!restartingProjects.has(project.id)) {
          broadcaster.broadcastStatus(project.id, 'stopped', null, projectHealth.get(project.id));
        }
      })().catch((error) => {
        console.error(`Cleanup failed for ${project.name}:`, error);
        pushLog(project.id, `\nProcess cleanup failed: ${error.message}. Stop again before starting.\n`);
      }).finally(resolveCompletion);
    });

    // Claim the slot synchronously so a concurrent start cannot double-spawn
    // while we wait for spawn confirmation below.
    processes.set(project.id, proc);
    processStats.set(project.id, { cpu: 0, memory: 0, uptime: '0s' });

    // FIX: wait for 'spawn' (success) or 'error' (failure) before reporting
    // the outcome. Previously we returned success + `pid: undefined` even when
    // spawn failed, and the failed spawn left a stale "running" entry.
    const spawned = await new Promise((resolve) => {
      proc.once('spawn', () => resolve(true));
      proc.once('error', () => resolve(false));
    });

    if (!spawned) {
      if (processes.get(project.id) === proc) {
        processes.delete(project.id);
        processStats.delete(project.id);
      }
      resolveCompletion();
      const message = `Failed to start "${project.command}" in ${project.path}: the process could not be spawned (missing directory or shell)`;
      console.error(`Failed to start project ${project.name}: ${message}`);
      pushLog(project.id, `\n${message}\n`);
      broadcaster.broadcastStatus(project.id, 'stopped', null, projectHealth.get(project.id));
      return { success: false, message };
    }

    // Stopped (or replaced) while spawn was in flight — reap the child.
    if (processes.get(project.id) !== proc || proc.stopRequested) {
      await cleanProcess(proc);
      return { success: false, message: 'Project was stopped during startup' };
    }

    broadcaster.broadcastStatus(project.id, 'running', { cpu: 0, memory: 0, uptime: '0s' }, projectHealth.get(project.id));

    console.log(`Project ${project.name} started with PID ${proc.pid}`);
    return { success: true, message: 'Project started', pid: proc.pid };
  } catch (error) {
    console.error(`Error starting project ${project.name}:`, error);
    processes.delete(project.id);
    processStats.delete(project.id);
    return { success: false, message: error.message };
  }
}

async function stopProject(id, skipBroadcast = false) {
  const proc = processes.get(id);
  if (!proc) {
    return { success: false, message: 'Project not running' };
  }
  try {
    proc.stopRequested = true;
    await cleanProcess(proc);
    await proc.completion;
    if (processes.get(id) === proc) {
      processes.delete(id);
      processStats.delete(id);
    }
    if (!skipBroadcast && !processes.has(id)) {
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
