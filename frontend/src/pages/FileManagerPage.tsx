import AppShell from '@/components/AppShell';
import { FolderOpen } from 'lucide-react';

/** Placeholder — replaced in phase F3 (File Manager migration). */
export default function FileManagerPage() {
  return (
    <AppShell title="File Manager" icon={<FolderOpen className="h-5 w-5" />}>
      <div className="container mx-auto py-8">
        <p className="text-muted-foreground">File Manager — migrating in phase F3.</p>
      </div>
    </AppShell>
  );
}
