import { useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { FolderOpen, Plus, RefreshCw, Terminal, XCircle } from 'lucide-react';
import { api } from '@/lib/api';
import type { ExecuteResult, Project, ProjectInput } from '@/lib/types';
import { useLocalBool, useLocalJson } from '@/hooks/usePreferences';
import { useProjects, errorMessage } from '@/hooks/useProjects';
import AppShell from '@/components/AppShell';
import ProjectCard, { type ProjectCardActions } from '@/components/ProjectCard';
import ProjectDialog from '@/components/ProjectDialog';
import ConfirmDialog from '@/components/ConfirmDialog';
import UpdateResultDialog from '@/components/UpdateResultDialog';
import LogsDialog from '@/components/LogsDialog';
import CommandDialog from '@/components/CommandDialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export default function DashboardPage() {
  const {
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
  } = useProjects();

  const [showMetrics, setShowMetrics] = useLocalBool('showMetrics', true);
  const [projectMetrics, setProjectMetrics] = useLocalJson<Record<string, boolean>>('projectMetrics', {});
  const [dismissedCrashes, setDismissedCrashes] = useLocalJson<Record<string, boolean>>('dismissedCrashes', {});
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  const [projectDialogOpen, setProjectDialogOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);
  const [restartAllOpen, setRestartAllOpen] = useState(false);
  const [updateResult, setUpdateResult] = useState<ExecuteResult | null>(null);
  const [updateResultOpen, setUpdateResultOpen] = useState(false);
  const [logsProject, setLogsProject] = useState<Project | null>(null);
  const [logsOpen, setLogsOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [prefill, setPrefill] = useState<{ name?: string; path?: string; command?: string } | null>(null);

  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const p of projects) for (const t of p.tags ?? []) set.add(t);
    return Array.from(set).sort();
  }, [projects]);

  const filteredProjects = useMemo(() => {
    if (selectedTags.length === 0) return projects;
    return projects.filter((p) => p.tags?.some((t) => selectedTags.includes(t)));
  }, [projects, selectedTags]);

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  };

  const run = useCallback(async (fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }, []);

  const actions: ProjectCardActions = {
    onStart: (p) => void run(() => start(p.id)),
    onStop: (p) => void run(() => stop(p.id)),
    onRestart: (p) => {
      setLocalStatus(p.id, 'restarting');
      void run(() => restart(p.id));
    },
    onUpdate: (p) =>
      void (async () => {
        try {
          const result = await api.gitUpdate(p.id);
          setUpdateResult(result);
          setUpdateResultOpen(true);
          await refresh();
        } catch (err) {
          toast.error(errorMessage(err));
        }
      })(),
    onLogs: (p) => {
      setLogsProject(p);
      setLogsOpen(true);
    },
    onEdit: (p) => {
      setEditingProject(p);
      setProjectDialogOpen(true);
    },
    onDelete: (p) => setDeleteTarget(p),
  };

  const handleSubmitProject = async (input: ProjectInput) => {
    if (editingProject) {
      await update(editingProject.id, input);
      toast.success('Project updated');
    } else {
      await create(input);
      toast.success('Project added');
    }
  };

  return (
    <AppShell
      title="Server Manager"
      actions={
        <>
          <Button
            variant="ghost"
            size="sm"
            className="hidden text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground sm:inline-flex"
            onClick={() => {
              setEditingProject(null);
              setProjectDialogOpen(true);
            }}
          >
            <Plus className="h-4 w-4" /> Add Project
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="hidden text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground sm:inline-flex"
            onClick={() => setCommandOpen(true)}
          >
            <Terminal className="h-4 w-4" /> Run Command
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="hidden text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground sm:inline-flex"
            onClick={() => setRestartAllOpen(true)}
          >
            <RefreshCw className="h-4 w-4" /> Restart All
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground sm:hidden"
            onClick={() => {
              setEditingProject(null);
              setProjectDialogOpen(true);
            }}
            aria-label="Add project"
            title="Add Project"
          >
            <Plus className="h-5 w-5" />
          </Button>
        </>
      }
    >
      <div className="container mx-auto py-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-2xl font-semibold">Projects</h2>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowMetrics(!showMetrics)}>
              {showMetrics ? 'Hide' : 'Show'} Metrics
            </Button>
            <Button variant="outline" size="sm" onClick={() => void refresh()}>
              <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} /> Refresh
            </Button>
          </div>
        </div>

        {allTags.length > 0 && (
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted-foreground">Filter by tags:</span>
            {allTags.map((tag) => (
              <button key={tag} type="button" onClick={() => toggleTag(tag)} aria-pressed={selectedTags.includes(tag)}>
                <Badge
                  variant={selectedTags.includes(tag) ? 'default' : 'secondary'}
                  className="cursor-pointer transition-colors hover:opacity-80"
                >
                  {tag}
                </Badge>
              </button>
            ))}
            {selectedTags.length > 0 && (
              <Button variant="ghost" size="sm" onClick={() => setSelectedTags([])}>
                <XCircle className="h-4 w-4" /> Clear
              </Button>
            )}
          </div>
        )}

        {selectedTags.length > 0 && (
          <div className="mb-4 rounded-md border border-info/30 bg-info/10 px-3 py-2 text-sm">
            Showing {filteredProjects.length} project{filteredProjects.length !== 1 ? 's' : ''} with tag
            {selectedTags.length !== 1 ? 's' : ''}: <strong>{selectedTags.join(', ')}</strong>
          </div>
        )}

        {error && (
          <div className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-16">
            <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : filteredProjects.length === 0 ? (
          <div className="py-16 text-center text-muted-foreground">
            {selectedTags.length > 0
              ? 'No projects match the selected tags.'
              : 'No projects yet. Click "Add Project" to get started.'}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {filteredProjects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                showMetrics={showMetrics}
                projectMetricsEnabled={projectMetrics[project.id] ?? true}
                dismissedCrash={!!dismissedCrashes[project.id]}
                onToggleProjectMetrics={() =>
                  setProjectMetrics({ ...projectMetrics, [project.id]: !(projectMetrics[project.id] ?? true) })
                }
                onDismissCrash={() => setDismissedCrashes({ ...dismissedCrashes, [project.id]: true })}
                onShowCrashHistory={() =>
                  toast.info(
                    `Crash history for ${project.name}: ${project.health.crashCount} crash(es)` +
                      (project.health.lastCrash
                        ? `, last ${new Date(project.health.lastCrash.time).toLocaleString()} — ${project.health.lastCrash.reason ?? ''}`
                        : '')
                  )
                }
                onToggleEmail={(enabled) => {
                  void setEmailOnCrash(project.id, enabled).catch((err) => toast.error(errorMessage(err)));
                }}
                actions={actions}
              />
            ))}
          </div>
        )}
      </div>

      <ProjectDialog
        open={projectDialogOpen}
        onOpenChange={(o) => {
          setProjectDialogOpen(o);
          if (!o) setPrefill(null);
        }}
        project={editingProject}
        initial={editingProject ? null : prefill}
        onSubmit={handleSubmitProject}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => {
          if (!o) setDeleteTarget(null);
        }}
        title="Delete Project"
        description={`Are you sure you want to delete "${deleteTarget?.name}"? The process will be stopped and the project removed from the configuration.`}
        confirmLabel="Delete"
        destructive
        onConfirm={() => {
          const target = deleteTarget;
          setDeleteTarget(null);
          if (!target) return;
          void run(async () => {
            await remove(target.id);
            toast.success(`Deleted ${target.name}`);
          });
        }}
      />

      <ConfirmDialog
        open={restartAllOpen}
        onOpenChange={setRestartAllOpen}
        title="Restart All Projects"
        description="All running projects will be stopped and started again."
        confirmLabel="Restart All"
        onConfirm={() => {
          setRestartAllOpen(false);
          void (async () => {
            try {
              await restartAll();
              toast.success('Restarting all running projects');
            } catch (err) {
              toast.error(errorMessage(err));
            }
          })();
        }}
      />

      <UpdateResultDialog open={updateResultOpen} onOpenChange={setUpdateResultOpen} result={updateResult} />

      <LogsDialog open={logsOpen} onOpenChange={setLogsOpen} project={logsProject} />

      <CommandDialog
        open={commandOpen}
        onOpenChange={setCommandOpen}
        onSaveAsProject={(directory, command) => {
          setEditingProject(null);
          setPrefill({ name: command.split(' ')[0], path: directory, command });
          setProjectDialogOpen(true);
        }}
      />

      {/* Mobile quick actions */}
      <div className="fixed bottom-4 right-4 flex flex-col gap-2 sm:hidden">
        <Button
          size="icon"
          variant="secondary"
          onClick={() => setCommandOpen(true)}
          aria-label="Run command"
          title="Run Command"
          className="shadow-lg"
        >
          <Terminal className="h-5 w-5" />
        </Button>
        <Button
          size="icon"
          variant="secondary"
          onClick={() => setRestartAllOpen(true)}
          aria-label="Restart all"
          title="Restart All"
          className="shadow-lg"
        >
          <RefreshCw className="h-5 w-5" />
        </Button>
        <Button
          size="icon"
          variant="secondary"
          aria-label="File Manager"
          title="File Manager"
          className="shadow-lg"
          asChild
        >
          <a href="/files">
            <FolderOpen className="h-5 w-5" />
          </a>
        </Button>
      </div>
    </AppShell>
  );
}
