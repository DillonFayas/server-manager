import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatFileSize(bytes: number | string | null | undefined): string {
  if (bytes === null || bytes === undefined) return '';
  const size = typeof bytes === 'string' ? parseInt(bytes, 10) : bytes;
  if (Number.isNaN(size)) return String(bytes);
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  if (size < 1024 * 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  return `${(size / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

/** Classify log line severity for colorization (parity with old colorizeLog). */
export function colorizeLog(text: string): string {
  const lower = text.toLowerCase();
  if (lower.includes('error') || lower.includes('err:') || lower.includes('failed')) {
    return 'text-destructive';
  }
  if (lower.includes('warn') || lower.includes('warning')) {
    return 'text-warning';
  }
  if (lower.includes('info') || lower.includes('debug')) {
    return 'text-info';
  }
  if (lower.includes('success') || lower.includes('ok') || lower.includes('done')) {
    return 'text-success';
  }
  return 'text-foreground/80';
}
