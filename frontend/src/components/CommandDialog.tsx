import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { ArrowUp, ChevronRight, Folder, Home, Loader2, Play, RotateCw } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
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
import { Label } from '@/components/ui/label';

const DEFAULT_DIR = '/home/dilly';

interface CommandDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaveAsProject?: (directory: string, command: string) => void;
}

export default function CommandDialog({ open, onOpenChange, onSaveAsProject }: CommandDialogProps) {
  const [directory, setDirectory] = useState(DEFAULT_DIR);
  const [command, setCommand] = useState('');
  const [output, setOutput] = useState<{ text: string; kind: 'info' | 'error' | 'muted' }[]>([
    { text: 'No output yet. Enter a command and click Execute.', kind: 'muted' },
  ]);
  const [history, setHistory] = useState<string[]>([]);
  const historyIndexRef = useRef(-1);
  const [busy, setBusy] = useState(false);
  const [clearOnExecute, setClearOnExecute] = useState(() => {
    const saved = localStorage.getItem('clearCommandOnExecute');
    return saved === null ? true : saved === 'true';
  });
  const [listing, setListing] = useState<string[]>([]);
  const outputRef = useRef<HTMLDivElement>(null);

  const loadDirectory = useCallback(async (dir: string) => {
    try {
      const res = await api.execute(dir, 'ls -F');
      if (res.success) {
        setListing(
          res.output
            .split('\n')
            .map((l) => l.trim())
            .filter(Boolean)
        );
      } else {
        setListing([]);
      }
    } catch {
      setListing([]);
    }
  }, []);

  useEffect(() => {
    if (open) {
      setDirectory(DEFAULT_DIR);
      setCommand('');
      setOutput([{ text: 'No output yet. Enter a command and click Execute.', kind: 'muted' }]);
      historyIndexRef.current = -1;
      void loadDirectory(DEFAULT_DIR);
    }
  }, [open, loadDirectory]);

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [output]);

  const updateClearPref = (v: boolean) => {
    setClearOnExecute(v);
    localStorage.setItem('clearCommandOnExecute', String(v));
  };

  const navigateTo = (dir: string) => {
    setDirectory(dir);
    void loadDirectory(dir);
  };

  const navigateUp = () => {
    if (!directory || directory === '/') return;
    const parts = directory.split('/').filter(Boolean);
    parts.pop();
    navigateTo('/' + parts.join('/'));
  };

  const execute = async (e?: FormEvent) => {
    e?.preventDefault();
    const cmd = command.trim();
    if (!cmd) return;

    // Local `cd` handling (parity with old UI)
    if (cmd.startsWith('cd ')) {
      const target = cmd.slice(3).trim();
      let next: string;
      if (target === '..') {
        const parts = directory.split('/').filter(Boolean);
        parts.pop();
        next = '/' + parts.join('/');
      } else if (target.startsWith('/')) {
        next = target;
      } else {
        next = directory.replace(/\/$/, '') + '/' + target;
      }
      navigateTo(next);
      setOutput((prev) => [...prev, { text: `Changed directory to: ${next}`, kind: 'info' }]);
      if (clearOnExecute) setCommand('');
      return;
    }

    if (history[history.length - 1] !== cmd) {
      setHistory((prev) => {
        const next = [...prev, cmd];
        if (next.length > 50) next.shift();
        return next;
      });
    }
    historyIndexRef.current = -1;
    setBusy(true);
    setOutput((prev) => [...prev.filter((l) => l.kind !== 'muted'), { text: 'Executing command…', kind: 'muted' }]);

    try {
      const res = await api.execute(directory, cmd);
      setOutput((prev) => {
        const withoutExecuting = prev.filter((l) => l.text !== 'Executing command…');
        if (res.success) {
          if (res.output) {
            return [
              ...withoutExecuting,
              ...res.output.split('\n').map((text) => ({ text, kind: 'info' as const })),
            ];
          }
          return [...withoutExecuting, { text: 'Command executed successfully with no output.', kind: 'muted' as const }];
        }
        const next = [...withoutExecuting, { text: `Error: ${res.message}`, kind: 'error' as const }];
        if (res.output) next.push({ text: res.output, kind: 'error' as const });
        return next;
      });
      if (cmd.match(/^ls(\s|$)/)) void loadDirectory(directory);
    } catch (err) {
      setOutput((prev) => [
        ...prev.filter((l) => l.text !== 'Executing command…'),
        { text: `Failed to execute command: ${err instanceof Error ? err.message : 'unknown error'}`, kind: 'error' },
      ]);
    } finally {
      setBusy(false);
      if (clearOnExecute) setCommand('');
    }
  };

  const onCommandKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (history.length === 0) return;
      let next: number;
      if (historyIndexRef.current === -1) {
        next = history.length - 1;
      } else {
        next = Math.max(0, historyIndexRef.current - 1);
      }
      historyIndexRef.current = next;
      setCommand(history[next]);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndexRef.current === -1) return;
      const next = historyIndexRef.current + 1;
      if (next >= history.length) {
        historyIndexRef.current = -1;
        setCommand('');
      } else {
        historyIndexRef.current = next;
        setCommand(history[next]);
      }
    }
  };

  const directories = listing.filter((i) => i.endsWith('/')).map((i) => i.slice(0, -1));
  const files = listing.filter((i) => !i.endsWith('/'));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] max-w-3xl flex-col gap-3">
        <DialogHeader>
          <DialogTitle>Run Command</DialogTitle>
          <DialogDescription>Execute shell commands on the server.</DialogDescription>
        </DialogHeader>

        <form onSubmit={execute} className="space-y-2">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Home className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                value={directory}
                onChange={(e) => setDirectory(e.target.value)}
                onBlur={() => void loadDirectory(directory)}
                className="pl-8 font-mono text-sm"
                aria-label="Working directory"
              />
            </div>
            <Button type="button" variant="outline" size="icon" onClick={navigateUp} title="Up one directory" aria-label="Up one directory">
              <ArrowUp className="h-4 w-4" />
            </Button>
            <Button type="button" variant="outline" size="icon" onClick={() => void loadDirectory(directory)} title="Refresh listing" aria-label="Refresh listing">
              <RotateCw className="h-4 w-4" />
            </Button>
          </div>

          {/* Directory browser */}
          {listing.length > 0 && (
            <div className="max-h-28 overflow-y-auto rounded-md border bg-muted/30 p-1.5 text-sm scrollbar-thin">
              <div className="flex flex-wrap gap-1">
                {directories.map((dir) => (
                  <button
                    key={dir}
                    type="button"
                    onClick={() => navigateTo((directory === '/' ? '' : directory) + '/' + dir)}
                    className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs hover:bg-accent"
                  >
                    <Folder className="h-3 w-3 text-warning" aria-hidden />
                    {dir}
                  </button>
                ))}
                {files.map((file) => (
                  <span key={file} className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-muted-foreground">
                    <ChevronRight className="h-3 w-3" aria-hidden />
                    {file.replace(/\*$/, '')}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <Input
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              onKeyDown={onCommandKeyDown}
              placeholder="Enter command… (↑/↓ for history)"
              className="font-mono text-sm"
              aria-label="Command"
              disabled={busy}
            />
            <Button type="submit" disabled={busy || !command.trim()}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              Execute
            </Button>
          </div>

          <div className="flex items-center justify-between">
            <label className="flex cursor-pointer items-center gap-1.5 text-xs">
              <Switch checked={clearOnExecute} onCheckedChange={updateClearPref} aria-label="Clear after execute" />
              <Label className="cursor-pointer text-xs font-normal">Clear after execute</Label>
            </label>
            {onSaveAsProject && (
              <Button
                type="button"
                variant="link"
                size="sm"
                className="h-auto p-0 text-xs"
                onClick={() => {
                  if (!directory || !command.trim()) return;
                  onSaveAsProject(directory, command.trim());
                  onOpenChange(false);
                }}
              >
                Save as project…
              </Button>
            )}
          </div>
        </form>

        <div
          ref={outputRef}
          className={cn(
            'min-h-32 max-h-64 flex-1 overflow-y-auto rounded-md border bg-muted/30 p-2 font-mono text-xs scrollbar-thin'
          )}
          aria-live="polite"
        >
          {output.map((line, i) => (
            <div
              key={i}
              className={cn(
                'whitespace-pre-wrap break-all',
                line.kind === 'error' && 'text-destructive',
                line.kind === 'info' && 'text-foreground/90',
                line.kind === 'muted' && 'text-muted-foreground'
              )}
            >
              {line.text}
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
