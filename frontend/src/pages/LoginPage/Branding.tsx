import { Box } from '@mui/material';
import { useTranslation } from 'react-i18next';

export function Branding() {
  const { t } = useTranslation();
  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', mb: 3 }}>
      <Box component="img" src="/assets/logo-full-light.svg" alt={t('auth.appName')} sx={{ height: 40 }} />
    </Box>
  );
}
