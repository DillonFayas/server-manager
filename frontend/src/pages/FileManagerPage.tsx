import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  ArrowUp,
  ChevronRight,
  Download,
  Edit3,
  Eye,
  File as FileIcon,
  FileCode,
  FileText,
  FileImage,
  FileArchive,
  FileAudio,
  FileVideo,
  Database,
  Folder,
  FolderOpen,
  Loader2,
  Play,
  RefreshCw,
  Save,
  Terminal,
  X,
} from 'lucide-react';
import { api } from '@/lib/api';
import type { FileEntry } from '@/lib/types';
import { cn, formatFileSize } from '@/lib/utils';
import AppShell from '@/components/AppShell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

const DEFAULT_DIR = '/home/dilly';

/** Pick a Lucide icon by extension (parity with old getFileIcon, simplified). */
export function fileIcon(name: string, isDir: boolean) {
  if (isDir) return <Folder className="h-4 w-4 text-warning" aria-hidden />;
  const lower = name.toLowerCase();
  const ext = lower.includes('.') ? lower.split('.').pop()! : '';
  const map: Record<string, typeof FileIcon> = {
    js: FileCode, mjs: FileCode, cjs: FileCode, ts: FileCode, tsx: FileCode, jsx: FileCode,
    json: FileCode, yml: FileCode, yaml: FileCode, toml: FileCode, ini: FileCode,
    html: FileText, htm: FileText, css: FileCode, scss: FileCode,
    py: FileCode, php: FileCode, rb: FileCode, go: FileCode, rs: FileCode,
    c: FileCode, cpp: FileCode, h: FileCode, java: FileCode,
    sh: Terminal, bash: Terminal, zsh: Terminal,
    md: FileText, txt: FileText, log: FileText,
    jpg: FileImage, jpeg: FileImage, png: FileImage, gif: FileImage, svg: FileImage, webp: FileImage,
    zip: FileArchive, tar: FileArchive, gz: FileArchive, rar: FileArchive, '7z': FileArchive,
    mp3: FileAudio, wav: FileAudio, flac: FileAudio, ogg: FileAudio,
    mp4: FileVideo, avi: FileVideo, mov: FileVideo, mkv: FileVideo,
    sql: Database, db: Database, sqlite: Database,
  };
  const Icon = map[ext] ?? FileIcon;
  return <Icon className="h-4 w-4 text-muted-foreground" aria-hidden />;
}

interface OpenFile {
  name: string;
  path: string;
  content: string;
  originalContent: string;
  isEditing: boolean;
  loading: boolean;
}

export default function FileManagerPage() {
  const [currentDir, setCurrentDir] = useState(DEFAULT_DIR);
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [listingLoading, setListingLoading] = useState(false);
  const [listingError, setListingError] = useState<string | null>(null);
  const [openFile, setOpenFile] = useState<OpenFile | null>(null);
  const [editorContent, setEditorContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [command, setCommand] = useState('');
  const [terminalLines, setTerminalLines] = useState<{ text: string; kind: 'out' | 'err' | 'muted' }[]>([
    { text: 'Ready. Enter a command…', kind: 'muted' },
  ]);
  const [executing, setExecuting] = useState(false);
  const [clearOnExecute, setClearOnExecute] = useState(() => {
    const saved = localStorage.getItem('clearCommandOnExecute');
    return saved === null ? true : saved === 'true';
  });
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const terminalRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<HTMLTextAreaElement>(null);

  const loadDir = useCallback(async (dir: string) => {
    setListingLoading(true);
    setListingError(null);
    try {
      const res = await api.listDir(dir);
      if (res.success) {
        setEntries(res.entries);
        setCurrentDir(res.path);
      } else {
        setListingError('Failed to load directory');
        setEntries([]);
      }
    } catch (err) {
      setListingError(err instanceof Error ? err.message : 'Failed to load directory');
      setEntries([]);
    } finally {
      setListingLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDir(DEFAULT_DIR);
  }, [loadDir]);

  useEffect(() => {
    if (terminalRef.current) terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
  }, [terminalLines]);

  const navigate = (dir: string) => {
    void loadDir(dir);
  };

  const navigateUp = () => {
    if (currentDir === '/') return;
    const parts = currentDir.split('/').filter(Boolean);
    parts.pop();
    navigate('/' + parts.join('/'));
  };

  const openPath = async (path: string, isEditing: boolean) => {
    const name = path.split('/').pop() ?? path;
    setOpenFile({ name, path, content: '', originalContent: '', isEditing, loading: true });
    try {
      const res = await api.readFile(path);
      if (res.success && res.content !== undefined) {
        setOpenFile({ name, path, content: res.content, originalContent: res.content, isEditing, loading: false });
        setEditorContent(res.content);
      } else {
        toast.error(res.message ?? 'Failed to load file');
        setOpenFile(null);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load file');
      setOpenFile(null);
    }
  };

  const closeEditor = () => {
    if (openFile?.isEditing && editorContent !== openFile.originalContent) {
      if (!window.confirm('You have unsaved changes. Are you sure you want to close?')) return;
    }
    setOpenFile(null);
    setEditorContent('');
  };

  const toggleEditMode = () => {
    if (!openFile) return;
    if (openFile.isEditing && editorContent !== openFile.originalContent) {
      if (!window.confirm('You have unsaved changes. Discard them?')) return;
      // Reload from server (parity with disableEditMode)
      void openPath(openFile.path, false);
      return;
    }
    setOpenFile({ ...openFile, isEditing: !openFile.isEditing });
  };

  const saveFile = async () => {
    if (!openFile) return;
    setSaving(true);
    try {
      const res = await api.writeFile(openFile.path, editorContent);
      if (res.success) {
        setOpenFile({ ...openFile, content: editorContent, originalContent: editorContent });
        toast.success('File saved successfully');
      } else {
        toast.error(res.message ?? 'Failed to save file');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save file');
    } finally {
      setSaving(false);
    }
  };

  const executeCommand = async () => {
    const cmd = command.trim();
    if (!cmd) return;
    setExecuting(true);
    setTerminalLines((prev) => [...prev.filter((l) => l.kind !== 'muted'), { text: 'Executing…', kind: 'muted' }]);
    try {
      const res = await api.execute(currentDir, cmd);
      setTerminalLines((prev) => {
        const rest = prev.filter((l) => l.text !== 'Executing…');
        if (!res.output) return [...rest, { text: 'No output', kind: 'muted' }];
        return [
          ...rest,
          ...res.output.split('\n').map((text) => ({
            text,
            kind: res.success ? ('out' as const) : ('err' as const),
          })),
        ];
      });
      if (/^ls(\s|$)/.test(cmd)) void loadDir(currentDir);
    } catch (err) {
      setTerminalLines((prev) => [
        ...prev.filter((l) => l.text !== 'Executing…'),
        { text: `Error: ${err instanceof Error ? err.message : 'unknown error'}`, kind: 'err' },
      ]);
    } finally {
      setExecuting(false);
      if (clearOnExecute) setCommand('');
    }
  };

  const uploadFiles = async (files: FileList | File[]) => {
    for (const file of Array.from(files)) {
      const exists = entries.some((e) => e.name === file.name);
      if (exists && !window.confirm(`File "${file.name}" already exists. Overwrite?`)) continue;
      try {
        const res = await api.uploadFile(currentDir, file);
        if (!res.success) toast.error(`Failed to upload ${file.name}: ${res.message}`);
      } catch (err) {
        toast.error(`Failed to upload ${file.name}: ${err instanceof Error ? err.message : 'unknown error'}`);
      }
    }
    void loadDir(currentDir);
  };

  const crumbs = currentDir.split('/').filter(Boolean);
  const editorOpen = !!openFile;

  return (
    <AppShell title="File Manager" icon={<FolderOpen className="h-5 w-5" />}>
      <div className="flex h-[calc(100vh-3.5rem)] flex-col lg:flex-row">
        {/* File browser column */}
        <div className={cn('flex flex-col border-b lg:border-b-0 lg:border-r', editorOpen ? 'lg:w-[30%]' : 'lg:w-[35%]')}>
          <div className="border-b p-3">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold">File Browser</h2>
              <Button variant="ghost" size="icon-sm" onClick={() => void loadDir(currentDir)} title="Refresh" aria-label="Refresh">
                <RefreshCw className={cn('h-4 w-4', listingLoading && 'animate-spin')} />
              </Button>
            </div>
            <div className="mb-2 flex gap-1">
              <Input
                value={currentDir}
                onChange={(e) => setCurrentDir(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') navigate(currentDir);
                }}
                className="h-8 font-mono text-xs"
                aria-label="Directory path"
              />
              <Button variant="outline" size="icon-sm" onClick={navigateUp} title="Up" aria-label="Up one directory">
                <ArrowUp className="h-4 w-4" />
              </Button>
            </div>
            {/* Breadcrumb */}
            <nav aria-label="Breadcrumb" className="mb-2 flex flex-wrap items-center gap-0.5 text-xs">
              <button type="button" onClick={() => navigate('/')} className="rounded px-1 hover:bg-accent" aria-label="Root">
                <FolderOpen className="h-3.5 w-3.5" aria-hidden />
              </button>
              {crumbs.map((part, i) => {
                const path = '/' + crumbs.slice(0, i + 1).join('/');
                const isLast = i === crumbs.length - 1;
                return (
                  <span key={path} className="flex items-center">
                    <ChevronRight className="h-3 w-3 text-muted-foreground" aria-hidden />
                    {isLast ? (
                      <span className="px-1 font-medium">{part}</span>
                    ) : (
                      <button type="button" onClick={() => navigate(path)} className="rounded px-1 hover:bg-accent">
                        {part}
                      </button>
                    )}
                  </span>
                );
              })}
            </nav>
            {/* Upload zone */}
            <div
              className={cn(
                'rounded-md border-2 border-dashed p-3 text-center transition-colors',
                dragOver ? 'border-primary bg-primary/10' : 'border-muted-foreground/30'
              )}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                if (e.dataTransfer.files.length > 0) void uploadFiles(e.dataTransfer.files);
              }}
            >
              <p className="mb-1 text-xs text-muted-foreground">Drag & drop files here</p>
              <Button size="xs" variant="outline" onClick={() => fileInputRef.current?.click()}>
                Choose Files
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => {
                  if (e.target.files?.length) void uploadFiles(e.target.files);
                  e.target.value = '';
                }}
              />
            </div>
          </div>
          {/* File list */}
          <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
            {listingLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : listingError ? (
              <p className="p-4 text-center text-sm text-destructive">{listingError}</p>
            ) : entries.length === 0 ? (
              <p className="p-4 text-center text-sm text-muted-foreground">Empty directory</p>
            ) : (
              <ul className="divide-y">
                {entries.map((entry) => (
                  <li key={entry.path}>
                    <button
                      type="button"
                      onClick={() => (entry.isDirectory ? navigate(entry.path) : void openPath(entry.path, false))}
                      className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm hover:bg-accent"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        {fileIcon(entry.name, entry.isDirectory)}
                        <span className="truncate">{entry.name}</span>
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {entry.isDirectory ? '' : formatFileSize(entry.size)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Terminal column */}
        <div className={cn('flex flex-col border-b lg:border-b-0 lg:border-r', editorOpen ? 'lg:w-[30%]' : 'lg:w-[65%]')}>
          <div className="border-b p-3">
            <h2 className="mb-2 text-sm font-semibold">Terminal</h2>
            <p className="mb-2 truncate text-xs text-muted-foreground">
              Working Directory: <code className="font-mono">{currentDir}</code>
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void executeCommand();
              }}
              className="space-y-1.5"
            >
              <div className="flex gap-1">
                <span className="flex h-8 items-center rounded-l-md border border-r-0 bg-muted px-2 font-mono text-sm">$</span>
                <Input
                  value={command}
                  onChange={(e) => setCommand(e.target.value)}
                  placeholder="Enter command…"
                  className="h-8 rounded-l-none font-mono text-sm"
                  aria-label="Command"
                  disabled={executing}
                />
                <Button type="submit" size="sm" disabled={executing || !command.trim()} className="h-8">
                  {executing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                </Button>
              </div>
              <label className="flex cursor-pointer items-center gap-1.5 text-xs">
                <Switch
                  checked={clearOnExecute}
                  onCheckedChange={(v) => {
                    setClearOnExecute(v);
                    localStorage.setItem('clearCommandOnExecute', String(v));
                  }}
                  aria-label="Clear after execute"
                />
                <Label className="cursor-pointer text-xs font-normal">Clear after execute</Label>
              </label>
            </form>
          </div>
          <div ref={terminalRef} className="min-h-0 flex-1 overflow-y-auto bg-muted/20 p-3 font-mono text-xs scrollbar-thin" aria-live="polite">
            {terminalLines.map((line, i) => (
              <div
                key={i}
                className={cn(
                  'whitespace-pre-wrap break-all',
                  line.kind === 'err' && 'text-destructive',
                  line.kind === 'out' && 'text-foreground/90',
                  line.kind === 'muted' && 'text-muted-foreground'
                )}
              >
                {line.text}
              </div>
            ))}
          </div>
        </div>

        {/* Editor column */}
        {editorOpen && openFile && (
          <div className="flex min-h-96 flex-col lg:h-full lg:w-[40%]">
            <div className="flex items-center justify-between gap-2 border-b p-3">
              <div className="min-w-0">
                <h2 className="flex items-center gap-1.5 truncate text-sm font-semibold">
                  {fileIcon(openFile.name, false)}
                  {openFile.name}
                </h2>
                <p className="truncate text-xs text-muted-foreground">{openFile.path}</p>
              </div>
              <div className="flex shrink-0 gap-1">
                <Button size="xs" variant={openFile.isEditing ? 'secondary' : 'default'} onClick={toggleEditMode}>
                  {openFile.isEditing ? <Eye className="h-3.5 w-3.5" /> : <Edit3 className="h-3.5 w-3.5" />}
                  {openFile.isEditing ? 'View' : 'Edit'}
                </Button>
                {openFile.isEditing && (
                  <Button size="xs" variant="success" onClick={() => void saveFile()} disabled={saving}>
                    {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                    Save
                  </Button>
                )}
                <Button size="xs" variant="outline" onClick={() => api.downloadFile(openFile.path)}>
                  <Download className="h-3.5 w-3.5" />
                  Download
                </Button>
                <Button size="icon-sm" variant="ghost" onClick={closeEditor} aria-label="Close editor">
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="min-h-0 flex-1">
              {openFile.loading ? (
                <div className="flex h-full flex-col items-center justify-center gap-2">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  <p className="text-sm text-muted-foreground">Loading file…</p>
                </div>
              ) : (
                <textarea
                  ref={editorRef}
                  value={editorContent}
                  onChange={(e) => setEditorContent(e.target.value)}
                  readOnly={!openFile.isEditing}
                  spellCheck={false}
                  className="h-full w-full resize-none border-0 bg-card p-3 font-mono text-xs outline-none focus:ring-0"
                  aria-label={`File content of ${openFile.name}`}
                />
              )}
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
