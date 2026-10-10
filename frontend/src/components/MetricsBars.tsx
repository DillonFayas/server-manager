import type { ProjectStats } from '@/lib/types';

function Bar({ label, value, kind }: { label: string; value: number; kind: 'cpu' | 'mem' }) {
  const pct = Math.min(Math.max(value, 0), 100);
  return (
    <div className="mb-1">
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="text-muted-foreground">
          {label}: {value.toFixed(1)}%
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={kind === 'cpu' ? 'h-full rounded-full bg-info transition-all' : 'h-full rounded-full bg-primary transition-all'}
          style={{ width: `${pct}%` }}
          role="progressbar"
          aria-valuenow={value}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={label}
        />
      </div>
    </div>
  );
}

export default function MetricsBars({ stats }: { stats: ProjectStats }) {
  return (
    <div className="space-y-2 rounded-md bg-muted/40 p-2">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">Metrics</span>
        <span className="text-muted-foreground">Uptime: {stats.uptime}</span>
      </div>
      <Bar label="CPU" value={stats.cpu} kind="cpu" />
      <Bar label="Memory" value={stats.memory} kind="mem" />
    </div>
  );
}
