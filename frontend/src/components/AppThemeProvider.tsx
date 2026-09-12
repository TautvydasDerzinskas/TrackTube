import { ReactNode, useEffect, useMemo, useState } from 'react';
import { ThemeProvider, CssBaseline } from '@mui/material';
import { useAuth } from '../contexts/AuthContext';
import { getTheme, ThemeMode } from '../theme';

// Tracks the OS-level color scheme live (not just read once) so a user on
// 'system' mode sees the app follow their OS without needing to reload —
// e.g. macOS/Windows auto dark-mode switching at sunset.
function useSystemThemeMode(): ThemeMode {
  const query = () => window.matchMedia('(prefers-color-scheme: dark)');
  const [systemMode, setSystemMode] = useState<ThemeMode>(() => (query().matches ? 'dark' : 'light'));

  useEffect(() => {
    const media = query();
    const listener = (e: MediaQueryListEvent) => setSystemMode(e.matches ? 'dark' : 'light');
    media.addEventListener('change', listener);
    return () => media.removeEventListener('change', listener);
  }, []);

  return systemMode;
}

// Reads the theme mode from the authenticated user's own DB-persisted
// preference (see AuthContext's updateTheme/UserMenu's Theme submenu) rather
// than localStorage, so it follows the account across devices. Defaults to
// light before the user loads and for logged-out visitors. 'system' resolves
// to the live OS preference via useSystemThemeMode rather than being a
// palette of its own.
export function AppThemeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const systemMode = useSystemThemeMode();
  const mode: ThemeMode =
    user?.themeMode === 'dark' ? 'dark' : user?.themeMode === 'system' ? systemMode : 'light';
  const theme = useMemo(() => getTheme(mode), [mode]);

  // The <link rel="icon"> in index.html defaults to the light app icon (a
  // static tag can't read the DB-persisted mode itself); swap it here so the
  // browser tab icon follows the same preference as the rest of the UI.
  useEffect(() => {
    const favicon = document.getElementById('favicon') as HTMLLinkElement | null;
    if (favicon) favicon.href = mode === 'dark' ? '/assets/app-icon-dark.svg' : '/assets/app-icon-light.svg';
  }, [mode]);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {children}
    </ThemeProvider>
  );
}
