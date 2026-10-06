import { useEffect, useState } from 'react';
import { Box, Button, IconButton, Paper, Typography } from '@mui/material';
import { Close as CloseIcon, IosShare as IosShareIcon } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';

// Not in TypeScript's DOM lib — Chromium-only (Chrome/Edge/Opera/Samsung).
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

// Timestamp rather than a boolean so a dismissal only snoozes the card for a
// week instead of hiding it forever.
const DISMISSED_KEY = 'installPromptDismissedAt';
const SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;
const SHOW_DELAY_MS = 2000;

function isStandalone(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches
    || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function isSnoozed(): boolean {
  const dismissedAt = Number(localStorage.getItem(DISMISSED_KEY));
  return Boolean(dismissedAt) && Date.now() - dismissedAt < SNOOZE_MS;
}

function isIOS(): boolean {
  const ua = navigator.userAgent;
  // iPadOS reports itself as a Mac; touch points give it away.
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

// "Install TrackTube" card. Chromium browsers hand us beforeinstallprompt, so
// the button triggers the native install dialog; iOS Safari has no such API,
// so there we can only explain the Share → Add to Home Screen steps. Other
// browsers (Firefox desktop, etc.) can't install PWAs and never see the card.
// Sits above MiniPlayer (zIndex 1200) but below MobileAppGate (2000), so on
// phones it only becomes visible once the gate is dismissed.
export function InstallPrompt() {
  const { t } = useTranslation();
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [mode, setMode] = useState<'native' | 'ios'>('native');
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (isStandalone() || isSnoozed()) return;

    let timer: number | undefined;
    if (isIOS()) {
      setMode('ios');
      timer = window.setTimeout(() => setVisible(true), SHOW_DELAY_MS);
      return () => window.clearTimeout(timer);
    }

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setVisible(true), SHOW_DELAY_MS);
    };
    const onInstalled = () => {
      setVisible(false);
      setDeferredPrompt(null);
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (!visible) return null;

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    setVisible(false);
  };

  const handleDismiss = () => {
    localStorage.setItem(DISMISSED_KEY, String(Date.now()));
    setVisible(false);
  };

  return (
    <Paper
      role="dialog"
      aria-label={t('installPrompt.title')}
      elevation={8}
      sx={{
        position: 'fixed', zIndex: 1250,
        // Clear of MiniPlayer, which is taller on mobile (controls + scrubber stacked).
        bottom: { xs: 'calc(env(safe-area-inset-bottom, 0px) + 128px)', md: 96 },
        right: { xs: 12, md: 24 }, left: { xs: 12, md: 'auto' },
        width: { md: 400 },
        display: 'flex', alignItems: 'center', gap: 1.5,
        p: 1.5, pr: 1, borderRadius: 3,
      }}
    >
      <Box component="img" src="/icon-192.png" alt="" sx={{ width: 44, height: 44, borderRadius: 2.5, flexShrink: 0 }} />
      <Box sx={{ flexGrow: 1, minWidth: 0 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>{t('installPrompt.title')}</Typography>
        <Typography variant="caption" color="text.secondary" component="div" sx={{ lineHeight: 1.4 }}>
          {mode === 'ios' ? (
            <>
              {t('installPrompt.iosTap')}{' '}
              <IosShareIcon sx={{ fontSize: 14, verticalAlign: -2 }} aria-label={t('installPrompt.iosShare')} />{' '}
              <strong>{t('installPrompt.iosShare')}</strong>, {t('installPrompt.iosThen')}{' '}
              <strong>{t('installPrompt.iosAddToHome')}</strong>
            </>
          ) : t('installPrompt.description')}
        </Typography>
      </Box>
      {mode === 'native' && (
        <Button variant="contained" size="small" onClick={handleInstall} sx={{ flexShrink: 0 }}>
          {t('installPrompt.install')}
        </Button>
      )}
      <IconButton size="small" onClick={handleDismiss} aria-label={t('common.close')} sx={{ flexShrink: 0 }}>
        <CloseIcon fontSize="small" />
      </IconButton>
    </Paper>
  );
}
