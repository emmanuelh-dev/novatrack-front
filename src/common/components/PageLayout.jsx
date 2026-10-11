import { useState } from 'react';
import {
  AppBar,
  Divider,
  Drawer,
  IconButton,
  Toolbar,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import { makeStyles } from 'tss-react/mui';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import MenuIcon from '@mui/icons-material/Menu';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from './LocalizationProvider';
import BackIcon from './BackIcon';
import BottomMenu from './BottomMenu';

const useStyles = makeStyles()((theme, { miniVariant }) => ({
  page: {
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
  },
  footer: {
    flexShrink: 0,
    '@media print': { display: 'none' },
  },
  root: {
    flex: 1,
    minHeight: 0,
    display: 'flex',
    minWidth: 0,
    padding: theme.spacing(1.5),
    gap: theme.spacing(1.5),
    backgroundColor: theme.palette.background.default,
    '@media print': { padding: 0, gap: 0 },
    [theme.breakpoints.down('md')]: {
      flexDirection: 'column',
      padding: 0,
      gap: 0,
    },
  },
  desktopDrawer: {
    width: miniVariant ? theme.spacing(9) : theme.dimensions.drawerWidthDesktop,
    flexShrink: 0,
    overflowX: 'hidden',
    transition: theme.transitions.create('width', {
      easing: theme.transitions.easing.sharp,
      duration: theme.transitions.duration.enteringScreen,
    }),
    ...(miniVariant && {
      '& .MuiListItemButton-root': {
        minHeight: 48,
      },
      '& .MuiListItemText-root': {
        display: 'none',
      },
    }),
    '@media print': {
      display: 'none',
    },
  },
  drawerPaper: {
    position: 'relative',
    height: '100%',
    borderRadius: theme.spacing(2),
    boxShadow: theme.shadows[1],
    overflow: 'hidden',
    '& > .MuiToolbar-root': { flexShrink: 0 },
  },
  menu: {
    flex: 1,
    minHeight: 0,
    overflowY: 'auto',
  },
  mobileDrawer: {
    width: `min(${theme.dimensions.drawerWidthTablet}, 90vw)`,
    '@media print': {
      display: 'none',
    },
  },
  mobileToolbar: {
    zIndex: 1,
    '@media print': {
      display: 'none',
    },
  },
  main: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
    borderRadius: theme.spacing(2),
    backgroundColor: theme.palette.background.paper,
    overflow: 'hidden',
    boxShadow: theme.shadows[1],
    [theme.breakpoints.down('md')]: { border: 0, borderRadius: 0, boxShadow: 'none' },
    '@media print': { border: 0, borderRadius: 0, boxShadow: 'none', overflow: 'visible' },
  },
  pageHeader: {
    flexShrink: 0,
    minHeight: 76,
    borderBottom: `1px solid ${theme.palette.divider}`,
    '@media print': { minHeight: 0, border: 0 },
  },
  content: {
    flexGrow: 1,
    minHeight: 0,
    minWidth: 0,
    alignItems: 'stretch',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'auto',
    '& > .MuiTable-root': { flexShrink: 0 },
    '@media print': { overflow: 'visible' },
  },
}));

const PageTitle = ({ breadcrumbs }) => {
  const t = useTranslation();
  return (
    <div style={{ minWidth: 0 }}>
      {breadcrumbs.length > 1 && (
        <Typography variant="caption" color="text.secondary">
          {breadcrumbs.slice(0, -1).map(t).join(' / ')}
        </Typography>
      )}
      <Typography component="h1" variant="h6" sx={{ fontWeight: 600, overflowWrap: 'anywhere' }}>
        {t(breadcrumbs[breadcrumbs.length - 1]) || breadcrumbs[breadcrumbs.length - 1]}
      </Typography>
    </div>
  );
};

const PageLayout = ({ menu, breadcrumbs, children }) => {
  const [miniVariant, setMiniVariant] = useState(false);
  const { classes } = useStyles({ miniVariant });
  const theme = useTheme();
  const navigate = useNavigate();
  const t = useTranslation();

  const desktop = useMediaQuery(theme.breakpoints.up('md'));

  const [searchParams] = useSearchParams();

  const [openDrawer, setOpenDrawer] = useState(!desktop && searchParams.has('menu'));

  const toggleDrawer = () => setMiniVariant(!miniVariant);

  return (
    <div className={classes.page}>
      <div className={classes.root}>
        {desktop ? (
          <Drawer
            variant="permanent"
            className={classes.desktopDrawer}
            slotProps={{ paper: { className: `${classes.desktopDrawer} ${classes.drawerPaper}` } }}
          >
            <Toolbar>
              {!miniVariant && (
                <>
                  <IconButton
                    color="inherit"
                    edge="start"
                    sx={{ mr: 2 }}
                    aria-label={t('mapTitle')}
                    onClick={() => navigate('/')}
                  >
                    <BackIcon />
                  </IconButton>
                  <Typography variant="h6" sx={{ fontWeight: 600 }} noWrap>
                    {t(breadcrumbs[0])}
                  </Typography>
                </>
              )}
              <IconButton
                color="inherit"
                edge="start"
                sx={{ ml: miniVariant ? -2 : 'auto' }}
                aria-label={t(breadcrumbs[0])}
                aria-expanded={!miniVariant}
                onClick={toggleDrawer}
              >
                {miniVariant !== (theme.direction === 'rtl') ? (
                  <ChevronRightIcon />
                ) : (
                  <ChevronLeftIcon />
                )}
              </IconButton>
            </Toolbar>
            <Divider />
            <nav className={classes.menu} aria-label={t(breadcrumbs[0])}>
              {menu}
            </nav>
            <div className={classes.footer}>
              <BottomMenu compact={miniVariant} />
            </div>
          </Drawer>
        ) : (
          <Drawer
            variant="temporary"
            open={openDrawer}
            onClose={() => setOpenDrawer(false)}
            slotProps={{ paper: { className: classes.mobileDrawer } }}
          >
            <nav
              aria-label={t(breadcrumbs[0])}
              onClick={(event) => {
                if (event.target.closest('a')) setOpenDrawer(false);
              }}
            >
              {menu}
            </nav>
          </Drawer>
        )}
        {!desktop && (
          <AppBar className={classes.mobileToolbar} position="static" color="inherit">
            <Toolbar>
              <IconButton
                color="inherit"
                edge="start"
                sx={{ mr: 2 }}
                aria-label={t(breadcrumbs[0])}
                aria-expanded={openDrawer}
                onClick={() => setOpenDrawer(true)}
              >
                <MenuIcon />
              </IconButton>
              <PageTitle breadcrumbs={breadcrumbs} />
            </Toolbar>
          </AppBar>
        )}
        <main className={classes.main}>
          {desktop && (
            <Toolbar className={classes.pageHeader}>
              <PageTitle breadcrumbs={breadcrumbs} />
            </Toolbar>
          )}
          <div className={classes.content}>{children}</div>
        </main>
      </div>
    </div>
  );
};

export default PageLayout;
