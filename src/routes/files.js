'use strict';

const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const multer = require('multer');
const { requireAuth } = require('../auth');
const { validate, schemas } = require('../validation');
const { resolveContained, sanitizeUploadName } = require('../paths');
const { audit } = require('../audit');

function createFilesRouter() {
  const router = express.Router();
  router.use(requireAuth);

  const upload = multer({
    dest: '/tmp/',
    limits: { fileSize: 100 * 1024 * 1024 },
  });

  // Safe directory listing for the file manager (replaces shelling out to ls)
  router.post('/list', validate(schemas.fsList), async (req, res) => {
    const target = await resolveContained(req.body.path, { mustExist: true });
    if (!target.ok) return res.status(400).json({ success: false, message: target.reason });

    try {
      const dirents = await fs.readdir(target.resolved, { withFileTypes: true });
      const entries = [];
      for (const d of dirents) {
        const full = path.join(target.resolved, d.name);
        let stat = null;
        try { stat = await fs.stat(full); } catch { /* unreadable */ }
        entries.push({
          name: d.name,
          isDirectory: d.isDirectory(),
          isExecutable: !d.isDirectory() && !!(stat && (stat.mode & 0o111)),
          size: stat ? stat.size : null,
          permissions: stat ? (stat.mode & 0o777).toString(8).padStart(3, '0') : null,
          modified: stat ? stat.mtime.toISOString() : null,
          path: full,
        });
      }
      entries.sort((a, b) => {
        if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
      audit(req, 'fs-list', target.resolved);
      res.json({ success: true, path: target.resolved, entries });
    } catch (error) {
      res.status(400).json({ success: false, message: error.message });
    }
  });

  // Read file
  router.post('/read', validate(schemas.fileRead), async (req, res) => {
    const target = await resolveContained(req.body.path, { mustExist: true });
    if (!target.ok) {
      // Preserve the original contract: a missing file is a success:false 200;
      // containment violations are hard 400s.
      if (target.code === 'NOT_FOUND' && !target.confined) {
        return res.json({ success: false, message: target.reason });
      }
      return res.status(400).json({ success: false, message: target.reason });
    }
    try {
      const content = await fs.readFile(target.resolved, 'utf8');
      audit(req, 'file-read', target.resolved);
      res.json({ success: true, content });
    } catch (error) {
      res.json({ success: false, message: error.message });
    }
  });

  // Write file
  router.post('/write', validate(schemas.fileWrite), async (req, res) => {
    const target = await resolveContained(req.body.path);
    if (!target.ok) return res.status(400).json({ success: false, message: target.reason });

    const isSystemFile = target.resolved.startsWith('/etc') || target.resolved.startsWith('/sys') || target.resolved.startsWith('/proc');
    if (isSystemFile) console.log(`[File Write] Warning: Writing to system file: ${target.resolved}`);

    try {
      await fs.writeFile(target.resolved, req.body.content, 'utf8');
      audit(req, 'file-write', target.resolved, { bytes: Buffer.byteLength(req.body.content) });
      res.json({ success: true });
    } catch (error) {
      res.json({ success: false, message: error.message });
    }
  });

  // Download file (kept as POST to preserve the documented contract)
  router.post('/download', validate(schemas.fileDownload), async (req, res) => {
    const target = await resolveContained(req.body.path, { mustExist: true });
    if (!target.ok) return res.status(400).json({ success: false, message: target.reason });
    audit(req, 'file-download', target.resolved);
    res.download(target.resolved, path.basename(target.resolved), (err) => {
      if (err && !res.headersSent) {
        res.status(500).json({ success: false, message: err.message });
      }
    });
  });

  // Upload file
  router.post('/upload', upload.single('file'), async (req, res) => {
    try {
      const { directory } = req.body;
      const file = req.file;
      if (!file) return res.json({ success: false, message: 'No file provided' });

      const dirTarget = await resolveContained(directory, { mustExist: true });
      if (!dirTarget.ok) {
        await fs.unlink(file.path).catch(() => {});
        return res.status(400).json({ success: false, message: dirTarget.reason });
      }

      const safeName = sanitizeUploadName(file.originalname);
      if (!safeName) {
        await fs.unlink(file.path).catch(() => {});
        return res.status(400).json({ success: false, message: 'Invalid filename' });
      }

      const targetPath = path.join(dirTarget.resolved, safeName);
      // Containment re-check after join (defense in depth)
      const finalCheck = await resolveContained(targetPath);
      if (!finalCheck.ok) {
        await fs.unlink(file.path).catch(() => {});
        return res.status(400).json({ success: false, message: finalCheck.reason });
      }

      try {
        await fs.rename(file.path, targetPath);
      } catch (renameErr) {
        if (renameErr.code === 'EXDEV') {
          await fs.copyFile(file.path, targetPath);
          await fs.unlink(file.path);
        } else {
          throw renameErr;
        }
      }

      audit(req, 'file-upload', targetPath, { size: file.size });
      res.json({ success: true });
    } catch (error) {
      res.json({ success: false, message: error.message });
    }
  });

  return router;
}

module.exports = { createFilesRouter };
