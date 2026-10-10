'use strict';

const path = require('path');
const { getConfig } = require('./config');

/**
 * Resolve a user-supplied path and verify containment.
 *
 * Policy (decision D-2): absolute paths are allowed by default, matching the
 * application's original intentional behavior. If config.security.allowedRoots
 * is a non-empty array, the resolved real path must live under one of those
 * roots (after realpath, so symlinks cannot escape).
 *
 * Returns { ok: true, resolved, confined } or
 * { ok: false, reason, code, confined } where code is
 * 'INVALID' | 'NOT_FOUND' | 'OUTSIDE_ROOTS'.
 */
async function resolveContained(p, { mustExist = false } = {}) {
  const roots = (getConfig().security && getConfig().security.allowedRoots) || [];
  const confined = roots.length > 0;

  if (typeof p !== 'string' || !p.trim()) {
    return { ok: false, reason: 'Path is required', code: 'INVALID', confined };
  }

  const resolved = path.resolve(p);

  if (!confined) {
    // Unrestricted mode (original behavior). Still normalize.
    if (mustExist) {
      try {
        await require('fs').promises.access(resolved);
      } catch {
        return { ok: false, reason: 'Path does not exist', code: 'NOT_FOUND', confined: false };
      }
    }
    return { ok: true, resolved, confined: false };
  }

  // Confined mode: check realpath (resolves symlinks) against allowed roots
  let real;
  try {
    real = await require('fs').promises.realpath(resolved);
  } catch {
    if (mustExist) return { ok: false, reason: 'Path does not exist', code: 'NOT_FOUND', confined: true };
    // For non-existent paths (e.g. upload target), fall back to the normalized path
    real = resolved;
  }

  const realRoots = [];
  for (const r of roots) {
    try {
      realRoots.push(await require('fs').promises.realpath(path.resolve(r)));
    } catch {
      realRoots.push(path.resolve(r));
    }
  }

  const allowed = realRoots.some((root) => real === root || real.startsWith(root + path.sep));
  if (!allowed) {
    return { ok: false, reason: 'Path is outside the allowed roots', code: 'OUTSIDE_ROOTS', confined: true };
  }
  return { ok: true, resolved: real, confined: true };
}

/** Sanitize an uploaded original filename: no separators, no traversal. */
function sanitizeUploadName(originalname) {
  const base = path.basename(originalname || '');
  // Strip control chars and leading dots-only names
  const clean = base.replace(/[\x00-\x1f\x7f]/g, '').replace(/^\.+$/, '');
  return clean;
}

module.exports = { resolveContained, sanitizeUploadName };
