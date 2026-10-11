import { useCallback, useEffect, useRef, useState } from 'react';
import { api, applyStatusUpdate, connectWs, type ApiError } from '@/lib/api';
import type { Project, ProjectInput, StatusUpdate } from '@/lib/types';

interface UseProjectsResult {
  projects: Project[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  start: (id: string) => Promise<void>;
  stop: (id: string) => Promise<void>;
  restart: (id: string) => Promise<void>;
  restartAll: () => Promise<void>;
  create: (input: ProjectInput) => Promise<void>;
  update: (id: string, input: Partial<ProjectInput>) => Promise<void>;
  remove: (id: string) => Promise<void>;
  setEmailOnCrash: (id: string, enabled: boolean) => Promise<void>;
  /** Optimistically set a project's status (used for local `restarting` state). */
  setLocalStatus: (id: string, status: Project['status']) => void;
}

export function useProjects(): UseProjectsResult {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const authedRef = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const list = await api.listProjects();
      if (authedRef.current) {
        setProjects(list);
        setError(null);
      }
    } catch (err) {
      if (authedRef.current) {
        setError(err instanceof Error ? err.message : 'Failed to load projects');
      }
    } finally {
      if (authedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    authedRef.current = true;
    void refresh();

    const conn = connectWs(
      '/status',
      (data) => {
        const update = data as StatusUpdate;
        if (update?.type === 'status_update') {
          setProjects((prev) => applyStatusUpdate(prev, update));
        }
      },
      () => authedRef.current
    );

    return () => {
      authedRef.current = false;
      conn.close();
    };
  }, [refresh]);

  const start = useCallback(
    async (id: string) => {
      const res = await api.startProject(id);
      await refresh();
      // FIX: `{ success: false }` responses are HTTP 200 — surface them as errors.
      if (!res.success) throw new Error(res.message || 'Failed to start project');
    },
    [refresh]
  );

  const stop = useCallback(
    async (id: string) => {
      const res = await api.stopProject(id);
      // Refresh either way so a stale "running" status corrects itself.
      await refresh();
      if (!res.success) throw new Error(res.message || 'Failed to stop project');
    },
    [refresh]
  );

  const restart = useCallback(
    async (id: string) => {
      setProjects((prev) => prev.map((p) => (p.id === id ? { ...p, status: 'restarting' } : p)));
      try {
        await api.restartProject(id);
        setTimeout(() => void refresh(), 2500);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Restart failed');
        await refresh();
      }
    },
    [refresh]
  );

  const restartAll = useCallback(async () => {
    await api.restartAll();
    setTimeout(() => void refresh(), 2500);
  }, [refresh]);

  const create = useCallback(
    async (input: ProjectInput) => {
      await api.createProject(input);
      await refresh();
    },
    [refresh]
  );

  const update = useCallback(
    async (id: string, input: Partial<ProjectInput>) => {
      await api.updateProject(id, input);
      await refresh();
    },
    [refresh]
  );

  const remove = useCallback(
    async (id: string) => {
      await api.deleteProject(id);
      await refresh();
    },
    [refresh]
  );

  const setEmailOnCrash = useCallback(async (id: string, enabled: boolean) => {
    // Optimistic update; backend allow-lists the field.
    setProjects((prev) => prev.map((p) => (p.id === id ? { ...p, emailOnCrash: enabled } : p)));
    try {
      await api.updateProject(id, { emailOnCrash: enabled });
    } catch (err) {
      setProjects((prev) => prev.map((p) => (p.id === id ? { ...p, emailOnCrash: !enabled } : p)));
      throw err;
    }
  }, []);

  const setLocalStatus = useCallback((id: string, status: Project['status']) => {
    setProjects((prev) => prev.map((p) => (p.id === id ? { ...p, status } : p)));
  }, []);

  return {
    projects,
    loading,
    error,
    refresh,
    start,
    stop,
    restart,
    restartAll,
    create,
    update,
    remove,
    setEmailOnCrash,
    setLocalStatus,
  };
}

export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return 'Unexpected error';
}

export type { ApiError, Project, ProjectInput };
