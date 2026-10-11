import { useEffect, useState, type FormEvent } from 'react';
import type { Project, ProjectInput } from '@/lib/types';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

interface ProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: Project | null; // null = add mode
  /** Pre-fill values for add mode (used by "Save as project…" from the command modal). */
  initial?: { name?: string; path?: string; command?: string } | null;
  onSubmit: (input: ProjectInput) => Promise<void>;
}

export default function ProjectDialog({ open, onOpenChange, project, initial, onSubmit }: ProjectDialogProps) {
  const [name, setName] = useState('');
  const [path, setPath] = useState('');
  const [command, setCommand] = useState('');
  const [tags, setTags] = useState('');
  const [autoRestart, setAutoRestart] = useState(false);
  const [emailOnCrash, setEmailOnCrash] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName(project?.name ?? initial?.name ?? '');
      setPath(project?.path ?? initial?.path ?? '');
      setCommand(project?.command ?? initial?.command ?? '');
      setTags((project?.tags ?? []).join(', '));
      setAutoRestart(project?.autoRestart ?? false);
      setEmailOnCrash(project?.emailOnCrash ?? false);
      setError(null);
    }
  }, [open, project, initial]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onSubmit({
        name: name.trim(),
        path: path.trim(),
        command: command.trim(),
        tags: tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
        autoRestart,
        emailOnCrash,
      });
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{project ? 'Edit Project' : 'Add New Project'}</DialogTitle>
          <DialogDescription>
            {project ? 'Update the project configuration.' : 'Register a new managed project.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="project-name">Name</Label>
            <Input id="project-name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={200} autoFocus />
          </div>
          <div className="space-y-2">
            <Label htmlFor="project-path">Path</Label>
            <Input id="project-path" value={path} onChange={(e) => setPath(e.target.value)} required maxLength={4096} placeholder="/home/user/project" />
            <p className="text-xs text-muted-foreground">Absolute path to the project directory (must start with /).</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="project-command">Command</Label>
            <Input id="project-command" value={command} onChange={(e) => setCommand(e.target.value)} required maxLength={4096} placeholder="npm start" className="font-mono" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="project-tags">Tags (comma-separated)</Label>
            <Input id="project-tags" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="web, production" />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="project-auto-restart" className="cursor-pointer">
              Auto-restart on boot
            </Label>
            <Switch id="project-auto-restart" checked={autoRestart} onCheckedChange={setAutoRestart} />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="project-email-crash" className="cursor-pointer">
              Email crash alerts
            </Label>
            <Switch id="project-email-crash" checked={emailOnCrash} onCheckedChange={setEmailOnCrash} />
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !name.trim() || !path.trim() || !command.trim()}>
              {busy ? 'Saving…' : project ? 'Save Changes' : 'Add Project'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
