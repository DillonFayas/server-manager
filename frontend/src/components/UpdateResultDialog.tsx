import { CheckCircle2, XCircle } from 'lucide-react';
import type { ExecuteResult } from '@/lib/types';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface UpdateResultDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  result: ExecuteResult | null;
}

export default function UpdateResultDialog({ open, onOpenChange, result }: UpdateResultDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Git Update</DialogTitle>
          <DialogDescription>Result of the git pull operation.</DialogDescription>
        </DialogHeader>
        {result && (
          <>
            <div
              className={`flex items-center gap-2 rounded-md p-3 text-sm ${
                result.success ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'
              }`}
              role="status"
            >
              {result.success ? <CheckCircle2 className="h-5 w-5" /> : <XCircle className="h-5 w-5" />}
              {result.success ? 'Update successful!' : `Update failed: ${result.message || 'Unknown error'}`}
            </div>
            <pre className="max-h-80 overflow-auto rounded-md bg-muted p-3 font-mono text-xs scrollbar-thin">
              {result.output || 'No output'}
            </pre>
          </>
        )}
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>OK</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
