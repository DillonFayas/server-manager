'use strict';

const WebSocket = require('ws');
const pm = require('./services/processManager');

/**
 * WebSocket layer: /status broadcast channel and /logs/:projectId streams.
 * Upgrades are authenticated by running the session middleware over the raw
 * upgrade request; unauthenticated sockets are destroyed.
 */

let wss = null;

function attach(httpServer, sessionMiddleware) {
  wss = new WebSocket.Server({ noServer: true });

  pm.setBroadcaster({
    broadcastStatus: broadcastStatusUpdate,
    broadcastLog: broadcastLog,
  });

  httpServer.on('upgrade', (request, socket, head) => {
    // Load the session onto the raw request, then decide.
    sessionMiddleware(request, {}, () => {
      const authed = request.session && request.session.isAuthenticated;
      const enforced = request.session ? request.session.smEnforced !== false : true;

      // Determine enforcement from config directly (session middleware doesn't know it)
      let requireAuth = true;
      try {
        const { securityEnforced } = require('./auth');
        requireAuth = securityEnforced();
      } catch { /* default deny */ }

      if (requireAuth && !authed) {
        socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
        socket.destroy();
        return;
      }

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
  });

  wss.on('connection', (ws) => {
    if (ws.isStatusListener) {
      console.log('WebSocket connected for status updates');
    } else {
      console.log(`WebSocket connected for project: ${ws.projectId}`);
      const logs = pm.getLogs(ws.projectId);
      if (logs.length === 0) {
        ws.send(
          JSON.stringify({
            text: 'No logs available yet. Waiting for output...\n',
            timestamp: new Date().toLocaleTimeString(),
          })
        );
      } else {
        for (const logObj of logs) {
          ws.send(JSON.stringify({ text: logObj.text, timestamp: logObj.timestamp }));
        }
      }
    }

    ws.on('error', console.error);
    ws.on('message', () => {});
    ws.on('close', () => {
      if (!ws.isStatusListener) console.log(`WebSocket disconnected for project: ${ws.projectId}`);
    });
  });

  return wss;
}

function broadcastStatusUpdate(projectId, status, stats = null, health = null) {
  if (!wss) return;
  const msg = JSON.stringify({ type: 'status_update', projectId, status, stats, health });
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN && client.isStatusListener) client.send(msg);
  });
}

function broadcastLog(projectId, log, timestamp) {
  if (!wss) return;
  const msg = JSON.stringify({ text: log, timestamp });
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN && client.projectId === projectId) client.send(msg);
  });
}

function closeAll() {
  if (!wss) return;
  for (const client of wss.clients) {
    try { client.close(); } catch { /* noop */ }
  }
}

module.exports = { attach, closeAll };
