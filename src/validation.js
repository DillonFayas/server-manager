'use strict';

const { z } = require('zod');

const hexId = z.string().regex(/^[0-9a-f]{16}$/, 'Invalid project id');

const projectFields = {
  name: z.string().trim().min(1).max(200),
  path: z.string().trim().min(1).max(4096),
  command: z.string().trim().min(1).max(4096),
  tags: z.array(z.string().trim().min(1).max(50)).max(50).optional().default([]),
  autoRestart: z.boolean().optional().default(false),
  emailOnCrash: z.boolean().optional().default(false),
};

const schemas = {
  login: z.object({ password: z.string().min(1).max(1024) }),

  projectCreate: z.object(projectFields).strict(),

  projectUpdate: z
    .object({
      ...projectFields,
      name: projectFields.name.optional(),
      path: projectFields.path.optional(),
      command: projectFields.command.optional(),
    })
    .partial()
    .strict()
    .refine((o) => Object.keys(o).length > 0, 'Empty update'),

  projectId: z.object({ id: hexId }),

  fileRead: z.object({ path: z.string().min(1).max(4096) }),

  fileWrite: z.object({
    path: z.string().min(1).max(4096),
    content: z.string().max(10 * 1024 * 1024),
  }),

  fileDownload: z.object({ path: z.string().min(1).max(4096) }),

  fsList: z.object({ path: z.string().min(1).max(4096) }),

  execute: z.object({
    directory: z.string().min(1).max(4096),
    command: z.string().min(1).max(8192),
  }),
};

/** Express middleware: validate req.body with the given zod schema; 400 on failure. */
function validate(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const issue = result.error.issues[0];
      return res.status(400).json({
        success: false,
        error: `${issue.path.join('.') || 'body'}: ${issue.message}`,
      });
    }
    req.validated = result.data;
    req.body = result.data; // sanitized/trimmed values only
    next();
  };
}

/** Express middleware: validate req.params with the given zod schema; 400 on failure. */
function validateParams(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.params);
    if (!result.success) {
      const issue = result.error.issues[0];
      return res.status(400).json({
        success: false,
        error: `${issue.path.join('.') || 'params'}: ${issue.message}`,
      });
    }
    next();
  };
}

module.exports = { schemas, validate, validateParams, hexId };
