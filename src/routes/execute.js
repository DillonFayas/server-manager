'use strict';

const express = require('express');
const fs = require('fs').promises;
const { spawn, exec } = require('child_process');
const os = require('os');
const { requireAuth } = require('../auth');
const { validate, schemas } = require('../validation');
const { resolveContained } = require('../paths');
const { audit } = require('../audit');
const { getConfig } = require('../config');
const pm = require('../services/processManager');

function executeCommandInternal(directory, command, env, timeoutMs) {
  return new Promise((resolve) => {
    const proc = spawn(command, {
      cwd: directory,
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env,
    });

    let output = '';
    let errorOutput = '';
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { proc.kill('SIGKILL'); } catch { /* noop */ }
      resolve({
        success: false,
        message: `Command timed out after ${Math.round(timeoutMs / 1000)}s`,
        output: output + errorOutput,
      });
    }, timeoutMs);

    proc.stdout.on('data', (d) => { output += d.toString(); });
    proc.stderr.on('data', (d) => { errorOutput += d.toString(); });

    proc.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        success: code === 0,
        message: code === 0 ? 'Command executed successfully' : `Command exited with code ${code}`,
        output: output + errorOutput,
      });
    });

    proc.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ success: false, message: err.message, output: '' });
    });
  });
}

function createExecuteRouter() {
  const router = express.Router();
  router.use(requireAuth);

  router.post('/', validate(schemas.execute), async (req, res) => {
    const { directory, command } = req.body;

    const dirTarget = await resolveContained(directory, { mustExist: true });
    if (!dirTarget.ok) {
      return res.status(400).json({ success: false, message: dirTarget.reason, output: '' });
    }

    const homeDir = os.homedir();
    const cmdEnv = { ...process.env, HOME: homeDir };

    const timeoutMs = (getConfig().execute && getConfig().execute.timeoutMs) || 60000;
    audit(req, 'execute', command.slice(0, 200), { directory: dirTarget.resolved });

    const isGitCommand = command.trim().startsWith('git');

    if (isGitCommand) {
      if (/["'$`\\;&|<>()]/.test(dirTarget.resolved)) {
        return res.json({ success: false, message: 'Directory contains unsupported characters for git commands', output: '' });
      }
      const safeCmd = `git config --global --add safe.directory "${dirTarget.resolved}"`;
      exec(safeCmd, { env: cmdEnv }, async (err) => {
        if (err) console.log(`[Execute] safe.directory command failed:`, err.message);
        const result = await executeCommandInternal(dirTarget.resolved, command, cmdEnv, timeoutMs);
        res.json(result);
      });
    } else {
      const result = await executeCommandInternal(dirTarget.resolved, command, cmdEnv, timeoutMs);
      res.json(result);
    }
  });

  return router;
}

module.exports = { createExecuteRouter };
