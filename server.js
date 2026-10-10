'use strict';

// Entry point — kept at repo root so existing systemd units ("node server.js")
// and npm scripts continue to work. Implementation lives in src/.
const { main } = require('./src/server');

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
