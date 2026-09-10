import { ReactNode, useEffect, useMemo } from 'react';
import { ThemeProvider, CssBaseline } from '@mui/material';
import { useAuth } from '../contexts/AuthContext';
import { getTheme, ThemeMode } from '../theme';

// Reads the theme mode from the authenticated user's own DB-persisted
// preference (see AuthContext's updateTheme/UserMenu's Theme submenu) rather
// than localStorage, so it follows the account across devices. Defaults to
// light before the user loads and for logged-out visitors.
export function AppThemeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const mode: ThemeMode = user?.themeMode === 'dark' ? 'dark' : 'light';
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
