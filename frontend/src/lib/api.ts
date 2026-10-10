import type {
  ExecuteResult,
  FileEntry,
  LogEntry,
  Project,
  ProjectInput,
  ProjectStatus,
  ProjectStats,
  ProjectHealth,
} from './types';

/** Thrown for non-2xx responses; carries the backend's { success, error/message } payload when present. */
export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function parse<T>(res: Response): Promise<T> {
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* non-JSON */
  }
  if (!res.ok) {
    const msg =
      (body as { error?: string; message?: string } | null)?.error ||
      (body as { message?: string } | null)?.message ||
      `HTTP ${res.status}`;
    throw new ApiError(res.status, msg);
  }
  return body as T;
}

export const api = {
  // Auth
  async session(): Promise<{ authenticated: boolean }> {
    return parse(await fetch('/api/session'));
  },
  async login(password: string): Promise<{ success: boolean }> {
    return parse(
      await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
    );
  },
  async logout(): Promise<{ success: boolean }> {
    return parse(await fetch('/api/logout', { method: 'POST' }));
  },

  // Projects
  async listProjects(): Promise<Project[]> {
    return parse(await fetch('/api/projects'));
  },
  async createProject(input: ProjectInput): Promise<Project> {
    return parse(
      await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })
    );
  },
  async updateProject(id: string, input: Partial<ProjectInput>): Promise<Project> {
    return parse(
      await fetch(`/api/projects/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })
    );
  },
  async deleteProject(id: string): Promise<{ success: boolean }> {
    return parse(await fetch(`/api/projects/${id}`, { method: 'DELETE' }));
  },
  async startProject(id: string): Promise<{ success: boolean; message: string }> {
    return parse(await fetch(`/api/projects/${id}/start`, { method: 'POST' }));
  },
  async stopProject(id: string): Promise<{ success: boolean; message: string }> {
    return parse(await fetch(`/api/projects/${id}/stop`, { method: 'POST' }));
  },
  async restartProject(id: string): Promise<{ success: boolean; message: string }> {
    return parse(await fetch(`/api/projects/${id}/restart`, { method: 'POST' }));
  },
  async restartAll(): Promise<{ success: boolean; message: string }> {
    return parse(await fetch('/api/projects/restart-all', { method: 'POST' }));
  },
  async gitUpdate(id: string): Promise<ExecuteResult> {
    return parse(await fetch(`/api/projects/${id}/update`, { method: 'POST' }));
  },
  async clearLogs(id: string): Promise<{ success: boolean }> {
    return parse(await fetch(`/api/projects/${id}/clear-logs`, { method: 'POST' }));
  },

  // Files
  async listDir(path: string): Promise<{ success: boolean; path: string; entries: FileEntry[] }> {
    return parse(
      await fetch('/api/file/list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path }),
      })
    );
  },
  async readFile(path: string): Promise<{ success: boolean; content?: string; message?: string }> {
    return parse(
      await fetch('/api/file/read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path }),
      })
    );
  },
  async writeFile(path: string, content: string): Promise<{ success: boolean; message?: string }> {
    return parse(
      await fetch('/api/file/write', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path, content }),
      })
    );
  },
  /** Triggers a browser download via a temporary form POST (cookies included). */
  downloadFile(path: string): void {
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = '/api/file/download';
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = 'path';
    input.value = path;
    form.appendChild(input);
    document.body.appendChild(form);
    form.submit();
    form.remove();
  },
  async uploadFile(directory: string, file: File): Promise<{ success: boolean; message?: string }> {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('directory', directory);
    return parse(await fetch('/api/file/upload', { method: 'POST', body: fd }));
  },

  // Execute
  async execute(directory: string, command: string): Promise<ExecuteResult> {
    return parse(
      await fetch('/api/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ directory, command }),
      })
    );
  },
};

/** Apply a WS status_update to a project list (returns a new array). */
export function applyStatusUpdate(
  projects: Project[],
  update: { projectId: string; status: ProjectStatus; stats: ProjectStats | null; health: ProjectHealth | null }
): Project[] {
  return projects.map((p) =>
    p.id === update.projectId
      ? {
          ...p,
          status: update.status,
          stats: update.stats ?? p.stats,
          health: update.health ?? p.health,
        }
      : p
  );
}

/** WebSocket helper: connect with reconnect-on-close while `shouldReconnect` returns true. */
export function connectWs(
  path: string,
  onMessage: (data: unknown) => void,
  shouldReconnect: () => boolean,
  delayMs = 5000
): { close: () => void } {
  let ws: WebSocket | null = null;
  let closed = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const connect = () => {
    if (closed || !shouldReconnect()) return;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${protocol}//${window.location.host}${path}`);
    ws.onmessage = (event) => {
      try {
        onMessage(JSON.parse(event.data));
      } catch {
        onMessage(event.data);
      }
    };
    ws.onclose = () => {
      if (closed || !shouldReconnect()) return;
      timer = setTimeout(connect, delayMs);
    };
  };

  connect();

  return {
    close() {
      closed = true;
      if (timer) clearTimeout(timer);
      ws?.close();
    },
  };
}

export type { LogEntry };
