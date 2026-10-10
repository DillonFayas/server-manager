/** Shared API types mirroring the backend JSON shapes. */

export type ProjectStatus = 'running' | 'stopped' | 'restarting';

export interface ProjectStats {
  cpu: number;
  memory: number;
  uptime: string;
}

export interface LastCrash {
  time: string;
  code: number | null;
  reason: string;
}

export interface ProjectHealth {
  crashCount: number;
  lastCrash: LastCrash | null;
}

export interface Project {
  id: string;
  name: string;
  path: string;
  command: string;
  tags: string[];
  autoRestart: boolean;
  emailOnCrash: boolean;
  status: ProjectStatus;
  stats: ProjectStats;
  health: ProjectHealth;
}

export interface ProjectInput {
  name: string;
  path: string;
  command: string;
  tags: string[];
  autoRestart: boolean;
  emailOnCrash: boolean;
}

export interface FileEntry {
  name: string;
  isDirectory: boolean;
  isExecutable: boolean;
  size: number | null;
  permissions: string | null;
  modified: string | null;
  path: string;
}

export interface ExecuteResult {
  success: boolean;
  message: string;
  output: string;
}

export interface StatusUpdate {
  type: 'status_update';
  projectId: string;
  status: ProjectStatus;
  stats: ProjectStats | null;
  health: ProjectHealth | null;
}

export interface LogEntry {
  text: string;
  timestamp: string;
}
