import { useState, type MouseEvent } from 'react';
import { toast } from 'sonner';
import {
  ArrowDownToLine,
  Download,
  Eye,
  EyeOff,
  FileText,
  Mail,
  MoreVertical,
  Pencil,
  Play,
  RefreshCw,
  Square,
  Trash2,
} from 'lucide-react';
import type { Project } from '@/lib/types';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import StatusBadge from '@/components/StatusBadge';
import MetricsBars from '@/components/MetricsBars';
import CrashBanner from '@/components/CrashBanner';

export interface ProjectCardActions {
  onStart: (p: Project) => void;
  onStop: (p: Project) => void;
  onRestart: (p: Project) => void;
  onUpdate: (p: Project) => void;
  onLogs: (p: Project) => void;
  onEdit: (p: Project) => void;
  onDelete: (p: Project) => void;
}

interface ProjectCardProps {
  project: Project;
  showMetrics: boolean;
  projectMetricsEnabled: boolean;
  dismissedCrash: boolean;
  onToggleProjectMetrics: () => void;
  onDismissCrash: () => void;
  onShowCrashHistory: () => void;
  onToggleEmail: (enabled: boolean) => void;
  actions: ProjectCardActions;
}

export default function ProjectCard({
  project,
  showMetrics,
  projectMetricsEnabled,
  dismissedCrash,
  onToggleProjectMetrics,
  onDismissCrash,
  onShowCrashHistory,
  onToggleEmail,
  actions,
}: ProjectCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  const metricsVisible = project.status === 'running' && showMetrics && projectMetricsEnabled;
  const crashVisible = project.health.crashCount > 0 && !dismissedCrash;

  const onContextMenu = (e: MouseEvent) => {
    e.preventDefault();
    setMenuOpen(true);
  };

  const safeAction = (fn: () => void) => () => {
    setMenuOpen(false);
    try {
      fn();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Action failed');
    }
  };

  return (
    <Card
      className="h-full transition-shadow hover:shadow-md"
      onContextMenu={onContextMenu}
      data-testid={`project-card-${project.id}`}
    >
      <CardContent className="p-4">
        <div className="mb-3 flex items-start justify-between gap-2">
          <h3 className="truncate text-base font-semibold leading-tight" title={project.name}>
            {project.name}
          </h3>
          <div className="flex shrink-0 items-center gap-2">
            <StatusBadge status={project.status} />
            <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label="Project actions">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={safeAction(() => actions.onStart(project))}>
                  <Play className="mr-2 h-4 w-4" /> Start
                </DropdownMenuItem>
                <DropdownMenuItem onClick={safeAction(() => actions.onStop(project))}>
                  <Square className="mr-2 h-4 w-4" /> Stop
                </DropdownMenuItem>
                <DropdownMenuItem onClick={safeAction(() => actions.onRestart(project))}>
                  <RefreshCw className="mr-2 h-4 w-4" /> Restart
                </DropdownMenuItem>
                <DropdownMenuItem onClick={safeAction(() => actions.onLogs(project))}>
                  <FileText className="mr-2 h-4 w-4" /> View Logs
                </DropdownMenuItem>
                <DropdownMenuItem onClick={safeAction(() => actions.onUpdate(project))}>
                  <Download className="mr-2 h-4 w-4" /> Update (git pull)
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={safeAction(() => actions.onEdit(project))}>
                  <Pencil className="mr-2 h-4 w-4" /> Edit
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={safeAction(() => actions.onDelete(project))}
                >
                  <Trash2 className="mr-2 h-4 w-4" /> Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <div className="mb-1 truncate text-xs text-muted-foreground" title={project.path}>
          <span className="font-medium">Path:</span> {project.path}
        </div>
        <div className="mb-2 truncate font-mono text-xs text-muted-foreground" title={project.command}>
          <span className="font-sans font-medium">Command:</span> {project.command}
        </div>

        {project.tags.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1">
            {project.tags.map((tag) => (
              <Badge key={tag} variant="info" className="text-[11px]">
                {tag}
              </Badge>
            ))}
          </div>
        )}

        {project.status === 'running' && showMetrics && (
          <div className="mb-2 flex items-center justify-end">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onToggleProjectMetrics}
              title={projectMetricsEnabled ? 'Hide metrics' : 'Show metrics'}
              aria-label={projectMetricsEnabled ? 'Hide metrics' : 'Show metrics'}
            >
              {projectMetricsEnabled ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </Button>
          </div>
        )}

        {metricsVisible && <div className="mb-3">{<MetricsBars stats={project.stats} />}</div>}

        {crashVisible && (
          <CrashBanner health={project.health} onDismiss={onDismissCrash} onShowHistory={onShowCrashHistory} />
        )}

        <div className="mb-3 flex flex-wrap items-center gap-2">
          {project.autoRestart ? (
            <Badge variant="success" className="gap-1 text-[11px]">
              <RefreshCw className="h-3 w-3" aria-hidden /> Auto-restart
            </Badge>
          ) : (
            <Badge variant="secondary" className="gap-1 text-[11px]">
              No auto-restart
            </Badge>
          )}
          <label className="flex cursor-pointer items-center gap-1.5" title="Email crash alerts">
            <Switch
              checked={project.emailOnCrash}
              onCheckedChange={(v) => {
                onToggleEmail(v);
              }}
              aria-label="Email crash alerts"
            />
            <Mail className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
          </label>
        </div>

        <div className="flex flex-wrap gap-2">
          {project.status === 'running' ? (
            <Button variant="destructive" size="sm" onClick={() => actions.onStop(project)}>
              <Square className="h-3.5 w-3.5" /> Stop
            </Button>
          ) : project.status === 'restarting' ? (
            <Button variant="warning" size="sm" disabled>
              <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Restarting…
            </Button>
          ) : (
            <Button variant="success" size="sm" onClick={() => actions.onStart(project)}>
              <Play className="h-3.5 w-3.5" /> Start
            </Button>
          )}
          {project.status !== 'restarting' && (
            <Button variant="warning" size="sm" onClick={() => actions.onRestart(project)}>
              <RefreshCw className="h-3.5 w-3.5" /> Restart
            </Button>
          )}
          <Button variant="info" size="sm" onClick={() => actions.onUpdate(project)}>
            <ArrowDownToLine className="h-3.5 w-3.5" /> Update
          </Button>
          <Button variant="secondary" size="sm" onClick={() => actions.onLogs(project)}>
            <FileText className="h-3.5 w-3.5" /> Logs
          </Button>
        </div>

        <div className="mt-3 flex gap-2 border-t pt-3">
          <Button variant="outline" size="sm" onClick={() => actions.onEdit(project)}>
            <Pencil className="h-3.5 w-3.5" /> Edit
          </Button>
          <Button variant="outline" size="sm" className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => actions.onDelete(project)}>
            <Trash2 className="h-3.5 w-3.5" /> Delete
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
