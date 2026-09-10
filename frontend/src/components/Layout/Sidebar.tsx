import { useState } from 'react';
import {
  Box,
  Drawer,
  IconButton,
  Tooltip,
  useTheme,
} from '@mui/material';
import { ChevronLeft as ChevronLeftIcon, ChevronRight as ChevronRightIcon } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useNavItems } from './useNavItems';
import { NavList } from './NavList';
import { SIDEBAR_COLLAPSED_WIDTH } from './constants';

const SIDEBAR_COLLAPSED_STORAGE_KEY = 'sidebar_collapsed';

interface SidebarProps {
  width: number;
}

export default function Sidebar({ width }: SidebarProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const navigate = useNavigate();
  const navItems = useNavItems();
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === 'true');
  const currentWidth = collapsed ? SIDEBAR_COLLAPSED_WIDTH : width;

  const toggleCollapsed = () => {
    setCollapsed((v) => {
      const next = !v;
      localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, String(next));
      return next;
    });
  };

  return (
    <Drawer
      variant="permanent"
      sx={{
        width: currentWidth,
        flexShrink: 0,
        transition: (muiTheme) => muiTheme.transitions.create('width', { duration: muiTheme.transitions.duration.shortest }),
        '& .MuiDrawer-paper': {
          width: currentWidth,
          boxSizing: 'border-box',
          display: 'flex',
          flexDirection: 'column',
          overflowX: 'hidden',
          borderRight: 'none',
          transition: (muiTheme) => muiTheme.transitions.create('width', { duration: muiTheme.transitions.duration.shortest }),
        },
      }}
    >
      {/* Logo + collapse toggle */}
      <Box
        sx={{ pl: 2.5, pr: 1, py: 2.5, display: 'flex', alignItems: 'center', position: 'relative',
          justifyContent: collapsed ? 'center' : 'space-between' }}
      >
        {!collapsed && (
          <Box
            component="img"
            src={theme.palette.mode === 'dark' ? '/assets/logo-full-dark.svg' : '/assets/logo-full-light.svg'}
            alt={t('auth.appName')}
            onClick={() => navigate('/dashboard')}
            sx={{ height: 28, minWidth: 0, cursor: 'pointer' }}
          />
        )}
        <Tooltip title={collapsed ? t('nav.expandSidebar') : t('nav.collapseSidebar')}>
          <IconButton size="small" onClick={toggleCollapsed} sx={{ flexShrink: 0 }}>
            {collapsed ? <ChevronRightIcon /> : <ChevronLeftIcon />}
          </IconButton>
        </Tooltip>
      </Box>

      {/* Navigation */}
      <Box sx={{ flexGrow: 1, pt: 1, px: collapsed ? 0.5 : 1, overflowY: 'auto', overflowX: 'hidden' }}>
        <NavList items={navItems} collapsed={collapsed} />
      </Box>
    </Drawer>
  );
}
