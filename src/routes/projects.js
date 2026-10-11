'use strict';

const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const { exec, spawn } = require('child_process');
const { getConfig, saveConfig } = require('../config');
const { requireAuth } = require('../auth');
const { validate, validateParams, schemas } = require('../validation');
const { audit } = require('../audit');
const pm = require('../services/processManager');

function generateId() {
  return crypto.randomBytes(8).toString('hex');
}

function createProjectsRouter() {
  const router = express.Router();
  router.use(requireAuth);

  // Restart all running projects
  router.post('/restart-all', async (req, res) => {
    // FIX (B-1): declare the list outside try so the catch block can reference it.
    let runningProjects = [];
    try {
      const config = getConfig();
      runningProjects = config.projects.filter((p) => pm.getProjectStatus(p.id) === 'running');

      runningProjects.forEach((p) => pm.markRestarting(p.id, true));
      for (const project of runningProjects) {
        req.app.get('broadcastStatus')(project.id, 'restarting', null, pm.getHealth(project.id));
      }
      for (const project of runningProjects) {
        await pm.stopProject(project.id, true);
      }

      setTimeout(() => {
        for (const project of runningProjects) {
          pm.startProject(project).finally(() => pm.markRestarting(project.id, false));
        }
      }, 2000);

      audit(req, 'restart-all', `${runningProjects.length} projects`, { ids: runningProjects.map((p) => p.id) });
      res.json({ success: true, message: `Restarting ${runningProjects.length} projects` });
    } catch (error) {
      runningProjects.forEach((p) => pm.markRestarting(p.id, false));
      audit(req, 'restart-all', '-', { error: error.message }, false);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Get all projects
  router.get('/', (req, res) => {
    const config = getConfig();
    const projects = config.projects.map((p) => ({
      ...p,
      status: pm.getProjectStatus(p.id),
      stats: pm.getStats(p.id),
      health: pm.getHealth(p.id),
    }));
    res.json(projects);
  });

  // Add project
  router.post('/', validate(schemas.projectCreate), async (req, res) => {
    try {
      const config = getConfig();
      const newProject = { id: generateId(), ...req.validated };
      config.projects.push(newProject);
      await saveConfig(config);
      audit(req, 'project-create', newProject.id, { name: newProject.name });
      res.json(newProject);
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Update project — allow-listed fields only (fixes S-6 mass assignment)
  router.put('/:id', validateParams(schemas.projectId), validate(schemas.projectUpdate), async (req, res) => {
    try {
      const config = getConfig();
      const index = config.projects.findIndex((p) => p.id === req.params.id);
      if (index === -1) return res.status(404).json({ error: 'Project not found' });

      // req.body was replaced by validated partial fields only; id/status/stats/health cannot be set
      config.projects[index] = { ...config.projects[index], ...req.validated, id: config.projects[index].id };
      await saveConfig(config);
      audit(req, 'project-update', req.params.id, { fields: Object.keys(req.validated) });
      res.json(config.projects[index]);
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Delete project
  router.delete('/:id', async (req, res) => {
    try {
      await pm.stopProject(req.params.id);
      pm.dropProjectState(req.params.id);
      const config = getConfig();
      config.projects = config.projects.filter((p) => p.id !== req.params.id);
      await saveConfig(config);
      audit(req, 'project-delete', req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Start project
  router.post('/:id/start', validateParams(schemas.projectId), async (req, res) => {
    try {
      const config = getConfig();
      const project = config.projects.find((p) => p.id === req.params.id);
      if (!project) return res.status(404).json({ error: 'Project not found' });
      const result = await pm.startProject(project);
      audit(req, 'project-start', req.params.id, {}, result.success);
      res.json(result);
    } catch (error) {
      audit(req, 'project-start', req.params.id, { error: error.message }, false);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Stop project
  router.post('/:id/stop', validateParams(schemas.projectId), async (req, res) => {
    const result = await pm.stopProject(req.params.id);
    audit(req, 'project-stop', req.params.id, {}, result.success);
    res.json(result);
  });

  // Restart project
  router.post('/:id/restart', validateParams(schemas.projectId), async (req, res) => {
    try {
      const config = getConfig();
      const project = config.projects.find((p) => p.id === req.params.id);
      if (!project) return res.status(404).json({ error: 'Project not found' });

      pm.markRestarting(req.params.id, true);
      req.app.get('broadcastStatus')(req.params.id, 'restarting', null, pm.getHealth(req.params.id));
      await pm.stopProject(req.params.id, true);

      setTimeout(() => {
        pm.startProject(project).finally(() => pm.markRestarting(req.params.id, false));
      }, 2000);

      audit(req, 'project-restart', req.params.id);
      res.json({ success: true, message: 'Project restarting' });
    } catch (error) {
      pm.markRestarting(req.params.id, false);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Clear project logs
  router.post('/:id/clear-logs', validateParams(schemas.projectId), (req, res) => {
    pm.clearLogs(req.params.id);
    audit(req, 'logs-clear', req.params.id);
    res.json({ success: true });
  });

  // Update project (git pull)
  router.post('/:id/update', validateParams(schemas.projectId), (req, res) => {
    const config = getConfig();
    const project = config.projects.find((p) => p.id === req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    // Pre-flight: give a clear message instead of a cryptic spawn ENOENT.
    let dirStat = null;
    try {
      dirStat = fs.statSync(project.path);
    } catch { /* not found */ }
    if (!dirStat || !dirStat.isDirectory()) {
      return res.json({ success: false, message: `Project directory does not exist: ${project.path}`, output: '' });
    }

    console.log(`[Git Update] Starting update for ${project.name} at ${project.path}`);
    audit(req, 'project-update-git', req.params.id, { path: project.path });

    const gitEnv = { ...process.env };
    if (!gitEnv.HOME) gitEnv.HOME = require('os').homedir();

    // NOTE: project.path is operator-controlled config, interpolated into a shell
    // command. Wrap in double quotes; validate no shell metacharacters beyond
    // what a POSIX path may contain.
    if (/["'$`\\;&|<>()]/.test(project.path)) {
      return res.json({ success: false, message: 'Project path contains unsupported characters for git update', output: '' });
    }

    const safeCmd = `git config --global --add safe.directory "${project.path}"`;
    exec(safeCmd, { env: gitEnv }, (err, _stdout, stderr) => {
      if (err) {
        console.log(`[Git Update] Warning: Failed to add to safe.directory:`, err.message);
        const altCmd = `cd "${project.path}" && git config --local core.fileMode false`;
        exec(altCmd, { env: gitEnv }, () => executeGitPull());
      } else {
        executeGitPull();
      }
      if (stderr) console.log(`[Git Update] safe.directory stderr:`, stderr);

      function executeGitPull() {
        console.log(`[Git Update] Executing git pull in ${project.path}`);
        const gitProcess = spawn('git', ['pull'], { cwd: project.path, env: gitEnv });
        let output = '';
        gitProcess.stdout.on('data', (d) => { output += d.toString(); });
        gitProcess.stderr.on('data', (d) => { output += d.toString(); });
        gitProcess.on('close', (code) => {
          console.log(`[Git Update] Completed with code ${code}`);
          res.json(code === 0
            ? { success: true, message: 'Update successful', output }
            : { success: false, message: 'Update failed', output });
        });
        gitProcess.on('error', (e) => {
          console.error(`[Git Update] Process error:`, e);
          res.json({ success: false, message: e.message, output: '' });
        });
      }
    });
  });

  return router;
}

module.exports = { createProjectsRouter };
