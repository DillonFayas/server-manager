'use strict';

const express = require('express');
const http = require('http');
const path = require('path');
const helmet = require('helmet');
const { loadConfiguration, getConfig } = require('./config');
const { createSessionMiddleware, createAuthRouter } = require('./auth');
const ws = require('./ws');
const pm = require('./services/processManager');
const { initEmail } = require('./services/email');
const { createProjectsRouter } = require('./routes/projects');
const { createFilesRouter } = require('./routes/files');
const { createExecuteRouter } = require('./routes/execute');

const PORT_DEFAULT = 5000;

function createApp() {
  const app = express();
  const server = http.createServer(app);

  const sessionMiddleware = createSessionMiddleware();

  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        // CDN allowed only for Bootstrap CSS/icons during the F1–F4 migration window;
        // removed in F4 when the old public/ UI is deleted.
        styleSrc: ["'self'", "'unsafe-inline'", 'https://cdn.jsdelivr.net'],
        fontSrc: ["'self'", 'https://cdn.jsdelivr.net', 'data:'],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'", 'ws:', 'wss:'],
      },
    },
    crossOriginEmbedderPolicy: false,
  }));

  app.use(sessionMiddleware);
  app.use(express.json({ limit: '2mb' }));

  // CSRF defense-in-depth: SameSite=Lax already blocks cross-site POST cookies;
  // additionally reject state-changing requests whose Origin doesn't match.
  app.use((req, res, next) => {
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
      const origin = req.headers.origin;
      if (origin) {
        const host = req.headers.host;
        try {
          const o = new URL(origin);
          if (o.host !== host) {
            return res.status(403).json({ success: false, error: 'Cross-origin request rejected' });
          }
        } catch {
          return res.status(403).json({ success: false, error: 'Invalid Origin' });
        }
      }
    }
    next();
  });

  // Static: old public/ during migration; frontend/dist once built (see F4)
  app.use(express.static(path.join(__dirname, '..', 'public')));
  const distDir = path.join(__dirname, '..', 'frontend', 'dist');
  app.use(express.static(distDir));

  const broadcastStatus = (projectId, status, stats, health) => {
    ws.broadcastStatusUpdate(projectId, status, stats, health);
  };
  app.set('broadcastStatus', broadcastStatus);

  app.use('/api', createAuthRouter(sessionMiddleware));
  app.use('/api/projects', createProjectsRouter());
  app.use('/api/file', createFilesRouter());
  app.use('/api/execute', createExecuteRouter());

  // SPA fallback for non-API GETs (React router will handle client-side)
  app.get(/^(?!\/api).*/, (req, res, next) => {
    res.sendFile(path.join(distDir, 'index.html'), (err) => {
      if (err) next(); // no frontend built yet — fall through to 404
    });
  });

  ws.attach(server, sessionMiddleware);

  return { app, server };
}

async function autoStartProjects() {
  try {
    const config = getConfig();
    const toStart = config.projects.filter((p) => p.autoRestart);
    if (toStart.length === 0) {
      console.log('No projects configured for auto-restart');
      return;
    }
    console.log(`Auto-starting ${toStart.length} project(s)...`);
    for (const project of toStart) {
      console.log(`Auto-starting: ${project.name}`);
      pm.startProject(project);
      await new Promise((r) => setTimeout(r, 2000));
    }
    console.log('All auto-start projects have been started');
  } catch (error) {
    console.error('Error auto-starting projects:', error);
  }
}

async function main() {
  await loadConfiguration();
  initEmail();

  const config = getConfig();
  const PORT = config.server.port || PORT_DEFAULT;
  const HOST = config.server.host || '0.0.0.0';

  const { server } = createApp();

  // FIX (B-5/B-6): bind the port FIRST so the UI is reachable immediately and a
  // port conflict fails fast (no orphaned children). Auto-start runs async after.
  await new Promise((resolve, reject) => {
    server.once('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`Port ${PORT} is already in use. Change it via "npm run setup" or set PORT.`);
        process.exit(1);
      }
      reject(err);
    });
    server.listen(PORT, HOST, () => {
      console.log(`Server Manager running on http://${HOST}:${PORT}`);
      console.log('Access from any device on your network');
      resolve();
    });
  });

  // Stats sampler (1 Hz) — started after listen so it doesn't delay boot
  setInterval(() => pm.updateAllStats(), 1000);

  // Auto-start managed projects (original semantics: boot-time only, not crash-restart)
  autoStartProjects();

  // Graceful shutdown (fixes B-7)
  const shutdown = async (signal) => {
    console.log(`Received ${signal}, shutting down...`);
    try {
      await pm.stopAllProjects();
      ws.closeAll();
    } finally {
      server.close(() => process.exit(0));
      setTimeout(() => process.exit(0), 3000).unref();
    }
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

module.exports = { createApp, main, loadConfiguration, pm };

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
