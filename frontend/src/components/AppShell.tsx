import { type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Moon, Server, Sun } from 'lucide-react';
import { useTheme } from '@/hooks/usePreferences';
import { useSession } from '@/hooks/useSession';
import { Button } from '@/components/ui/button';

interface AppShellProps {
  title: string;
  icon?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}

export default function AppShell({ title, icon, actions, children }: AppShellProps) {
  const { theme, toggleTheme } = useTheme();
  const { logout } = useSession();
  const location = useLocation();

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-40 border-b bg-primary text-primary-foreground shadow-sm">
        <div className="flex h-14 items-center justify-between gap-2 px-4">
          <div className="flex items-center gap-3">
            <Link to="/" className="flex items-center gap-2 font-semibold tracking-tight">
              {icon ?? <Server className="h-5 w-5" aria-hidden />}
              <span className="text-base sm:text-lg">{title}</span>
            </Link>
            <nav className="ml-4 hidden items-center gap-1 sm:flex" aria-label="Primary">
              <Link
                to="/"
                className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                  location.pathname === '/'
                    ? 'bg-primary-foreground/20 text-primary-foreground'
                    : 'text-primary-foreground/80 hover:bg-primary-foreground/10 hover:text-primary-foreground'
                }`}
              >
                Dashboard
              </Link>
              <Link
                to="/files"
                className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                  location.pathname === '/files'
                    ? 'bg-primary-foreground/20 text-primary-foreground'
                    : 'text-primary-foreground/80 hover:bg-primary-foreground/10 hover:text-primary-foreground'
                }`}
              >
                File Manager
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-2">
            {actions}
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={toggleTheme}
              title="Toggle theme"
              aria-label="Toggle theme"
              className="text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground"
            >
              {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void logout()}
              className="border-primary-foreground/30 bg-transparent text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground"
            >
              Logout
            </Button>
          </div>
        </div>
        {/* Mobile nav */}
        <nav className="flex items-center gap-1 border-t border-primary-foreground/20 px-4 py-1.5 sm:hidden" aria-label="Primary mobile">
          <Link
            to="/"
            className={`rounded-md px-3 py-1 text-sm ${
              location.pathname === '/' ? 'bg-primary-foreground/20' : 'text-primary-foreground/80'
            }`}
          >
            Dashboard
          </Link>
          <Link
            to="/files"
            className={`rounded-md px-3 py-1 text-sm ${
              location.pathname === '/files' ? 'bg-primary-foreground/20' : 'text-primary-foreground/80'
            }`}
          >
            Files
          </Link>
        </nav>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  );
}
