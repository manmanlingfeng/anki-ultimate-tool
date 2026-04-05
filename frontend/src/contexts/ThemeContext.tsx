import { useEffect, type ReactNode } from 'react';

/**
 * Theme provider that enforces dark mode only.
 * Light mode has been removed for a cleaner, focused experience.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    // Always use dark mode
    document.documentElement.classList.add('dark');
  }, []);

  return <>{children}</>;
}
