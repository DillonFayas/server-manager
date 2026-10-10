import { useCallback, useEffect, useState } from 'react';

export type Theme = 'dark' | 'light';

function readTheme(): Theme {
  const saved = localStorage.getItem('theme');
  return saved === 'light' ? 'light' : 'dark';
}

function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark');
  document.documentElement.style.colorScheme = theme;
}

/** Dark/light theme with localStorage persistence (parity with old initTheme/toggleTheme). */
export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(readTheme);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const setTheme = useCallback((next: Theme) => {
    localStorage.setItem('theme', next);
    setThemeState(next);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark';
      localStorage.setItem('theme', next);
      return next;
    });
  }, []);

  return { theme, setTheme, toggleTheme };
}

/** Local boolean preference, parity with old localStorage keys (showMetrics, clearCommandOnExecute, ...). */
export function useLocalBool(key: string, defaultValue: boolean): [boolean, (v: boolean) => void] {
  const [value, setValue] = useState<boolean>(() => {
    const saved = localStorage.getItem(key);
    return saved === null ? defaultValue : saved === 'true';
  });
  const update = useCallback(
    (v: boolean) => {
      localStorage.setItem(key, String(v));
      setValue(v);
    },
    [key]
  );
  return [value, update];
}

/** Local JSON preference, parity with old dismissedCrashes / projectMetrics. */
export function useLocalJson<T>(key: string, defaultValue: T): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(() => {
    const saved = localStorage.getItem(key);
    if (!saved) return defaultValue;
    try {
      return JSON.parse(saved) as T;
    } catch {
      return defaultValue;
    }
  });
  const update = useCallback(
    (v: T) => {
      localStorage.setItem(key, JSON.stringify(v));
      setValue(v);
    },
    [key]
  );
  return [value, update];
}
