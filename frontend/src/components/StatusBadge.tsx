import { Badge } from '@/components/ui/badge';
import type { ProjectStatus } from '@/lib/types';
import { cn } from '@/lib/utils';
import { RefreshCw } from 'lucide-react';

const styles: Record<ProjectStatus, { badge: string; text: string }> = {
  running: { badge: 'bg-success text-success-foreground', text: 'running' },
  stopped: { badge: 'bg-secondary text-secondary-foreground', text: 'stopped' },
  restarting: { badge: 'bg-warning text-warning-foreground', text: 'restarting' },
};

export default function StatusBadge({ status }: { status: ProjectStatus }) {
  const s = styles[status] ?? styles.stopped;
  return (
    <Badge variant="outline" className={cn('gap-1 border-transparent capitalize', s.badge)}>
      {status === 'restarting' ? (
        <RefreshCw className="h-3 w-3 animate-spin-slow" aria-hidden />
      ) : status === 'running' ? (
        <span className="h-2 w-2 rounded-full bg-current animate-pulse-dot" aria-hidden />
      ) : (
        <span className="h-2 w-2 rounded-full bg-current opacity-60" aria-hidden />
      )}
      {s.text}
    </Badge>
  );
}
