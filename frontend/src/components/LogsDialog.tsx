import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Download, Eraser, Search } from 'lucide-react';
import { api, connectWs } from '@/lib/api';
import type { LogEntry, Project } from '@/lib/types';
import { colorizeLog, cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';

interface LogsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: Project | null;
}

interface DisplayLine extends LogEntry {
  count: number;
}

export default function LogsDialog({ open, onOpenChange, project }: LogsDialogProps) {
  const [lines, setLines] = useState<DisplayLine[]>([]);
  const [rawLogs, setRawLogs] = useState<LogEntry[]>([]);
  const [dedup, setDedup] = useState(true);
  const [autoScroll, setAutoScroll] = useState(true);
  const [showTimestamps, setShowTimestamps] = useState(false);
  const [filter, setFilter] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const lastTextRef = useRef<string | null>(null);
  const openRef = useRef(open);
  openRef.current = open;

  const reset = useCallback(() => {
    setLines([]);
    setRawLogs([]);
    lastTextRef.current = null;
  }, []);

  useEffect(() => {
    if (!open || !project) {
      reset();
      return;
    }
    reset();

    const conn = connectWs(
      `/logs/${project.id}`,
      (data) => {
        let entry: LogEntry;
        if (typeof data === 'string') {
          entry = { text: data, timestamp: new Date().toLocaleTimeString() };
        } else {
          entry = data as LogEntry;
        }
        setRawLogs((prev) => [...prev, entry]);
        setLines((prev) => {
          if (dedup && entry.text === lastTextRef.current && prev.length > 0) {
            const next = [...prev];
            next[next.length - 1] = { ...next[next.length - 1], count: next[next.length - 1].count + 1 };
            return next;
          }
          lastTextRef.current = entry.text;
          return [...prev, { ...entry, count: 1 }];
        });
      },
      () => openRef.current
    );

    return () => conn.close();
  }, [open, project, reset]); // eslint-disable-line react-hooks/exhaustive-deps

  // Rebuild display lines when dedup/showTimestamps toggle (redisplayLogs parity)
  useEffect(() => {
    if (!open) return;
    const rebuilt: DisplayLine[] = [];
    let last: string | null = null;
    for (const entry of rawLogs) {
      if (dedup && entry.text === last && rebuilt.length > 0) {
        rebuilt[rebuilt.length - 1] = { ...rebuilt[rebuilt.length - 1], count: rebuilt[rebuilt.length - 1].count + 1 };
      } else {
        last = entry.text;
        rebuilt.push({ ...entry, count: 1 });
      }
    }
    setLines(rebuilt);
  }, [dedup, showTimestamps]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (autoScroll && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [lines, autoScroll]);

  const visibleLines = useMemo(() => {
    if (!filter) return lines;
    const f = filter.toLowerCase();
    return lines.filter((l) => l.text.toLowerCase().includes(f));
  }, [lines, filter]);

  const handleClear = async () => {
    if (!project) return;
    try {
      await api.clearLogs(project.id);
      reset();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to clear logs');
    }
  };

  const handleExport = () => {
    if (!project) return;
    const text = rawLogs
      .map((l) => (showTimestamps ? `[${l.timestamp}] ${l.text}` : l.text))
      .join('\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project.name}-logs-${new Date().toISOString().split('T')[0]}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[80vh] max-w-4xl flex-col gap-3 p-4">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2">
            Logs: {project?.name}
          </DialogTitle>
          <DialogDescription>Live output from the project process.</DialogDescription>
        </DialogHeader>

        <div className="flex shrink-0 flex-wrap items-center gap-3">
          <div className="relative min-w-48 flex-1">
            <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter logs…"
              className="h-8 pl-8 text-sm"
              aria-label="Filter logs"
            />
          </div>
          <label className="flex items-center gap-1.5 text-xs" title="Deduplicate consecutive identical lines">
            <Switch checked={dedup} onCheckedChange={setDedup} aria-label="Deduplicate" />
            Dedup
          </label>
          <label className="flex items-center gap-1.5 text-xs">
            <Switch checked={autoScroll} onCheckedChange={setAutoScroll} aria-label="Auto-scroll" />
            Auto-scroll
          </label>
          <label className="flex items-center gap-1.5 text-xs">
            <Switch checked={showTimestamps} onCheckedChange={setShowTimestamps} aria-label="Timestamps" />
            Timestamps
          </label>
          <div className="ml-auto flex gap-1">
            <Button variant="ghost" size="icon-sm" onClick={handleClear} title="Clear logs" aria-label="Clear logs">
              <Eraser className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon-sm" onClick={handleExport} title="Export logs" aria-label="Export logs">
              <Download className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div
          ref={containerRef}
          className="min-h-0 flex-1 overflow-y-auto rounded-md border bg-muted/30 p-2 font-mono text-xs scrollbar-thin"
          role="log"
          aria-live="polite"
        >
          {visibleLines.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground">
              {filter ? 'No lines match the filter.' : 'Waiting for output…'}
            </p>
          ) : (
            visibleLines.map((line, i) => (
              <div key={i} className="flex gap-1.5 leading-relaxed">
                {showTimestamps && <span className="shrink-0 text-muted-foreground">[{line.timestamp}]</span>}
                <span className={cn('whitespace-pre-wrap break-all', colorizeLog(line.text))}>{line.text}</span>
                {line.count > 1 && <span className="shrink-0 text-warning">×{line.count}</span>}
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
