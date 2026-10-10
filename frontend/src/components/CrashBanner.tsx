import { AlertTriangle, History, X } from 'lucide-react';
import type { ProjectHealth } from '@/lib/types';
import { Button } from '@/components/ui/button';

interface CrashBannerProps {
  health: ProjectHealth;
  onDismiss: () => void;
  onShowHistory: () => void;
}

export default function CrashBanner({ health, onDismiss, onShowHistory }: CrashBannerProps) {
  if (health.crashCount <= 0) return null;
  return (
    <div className="mb-3 rounded-md border border-warning/40 bg-warning/10 p-2 text-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 font-medium text-warning">
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
            Crashes: {health.crashCount}
          </div>
          {health.lastCrash && (
            <div className="mt-1 space-y-0.5 text-xs text-muted-foreground">
              <div>Last: {new Date(health.lastCrash.time).toLocaleString()}</div>
              {health.lastCrash.reason && <div>Reason: {health.lastCrash.reason}</div>}
            </div>
          )}
        </div>
        <Button variant="ghost" size="icon-sm" onClick={onDismiss} title="Dismiss" aria-label="Dismiss crash alert">
          <X className="h-4 w-4" />
        </Button>
      </div>
      {health.crashCount > 1 && (
        <button
          type="button"
          onClick={onShowHistory}
          className="mt-1 inline-flex items-center gap-1 text-xs text-warning underline-offset-2 hover:underline"
        >
          <History className="h-3 w-3" aria-hidden />
          View History
        </button>
      )}
    </div>
  );
}
