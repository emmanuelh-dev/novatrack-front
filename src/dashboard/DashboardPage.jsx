import { useCallback, useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  ButtonBase,
  Chip,
  LinearProgress,
  List,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import DashboardIcon from '@mui/icons-material/Dashboard';
import PageLayout from '../common/components/PageLayout';
import MenuItem from '../common/components/MenuItem';
import { useTranslation } from '../common/components/LocalizationProvider';
import { useRestriction } from '../common/util/permissions';
import { useAttributePreference } from '../common/util/preferences';
import {
  formatDistance,
  formatNumericHours,
  formatStatus,
  formatTime,
} from '../common/util/formatter';
import fetchOrThrow from '../common/util/fetchOrThrow';
import { useAsyncTask } from '../reactHelper';
import { devicesActions } from '../store';
import ReportsMenu from '../reports/components/ReportsMenu';
import ReportFilter from '../reports/components/ReportFilter';
import { classifyPosition, summarizeActivity } from './dashboardUtils';

const DashboardPage = () => {
  const t = useTranslation();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const [params] = useSearchParams();
  const devices = useSelector((state) => state.devices.items);
  const loaded = useSelector((state) => state.devices.loaded);
  const positions = useSelector((state) => state.session.positions);
  const socket = useSelector((state) => state.session.socket);
  const disableReports = useRestriction('disableReports');
  const distanceUnit = useAttributePreference('distanceUnit');
  const [now, setNow] = useState(Date.now);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [request, setRequest] = useState(null);
  const [report, setReport] = useState({ items: [], loading: false, error: false, query: null });

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);

  const units = useMemo(
    () =>
      Object.values(devices)
        .map((device) => ({
          ...device,
          position: positions[device.id],
          movement: classifyPosition(positions[device.id], Math.max(now, Date.now())),
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [devices, positions, now],
  );
  const counts = {
    all: units.length,
    online: units.filter((unit) => unit.status === 'online').length,
    offline: units.filter((unit) => unit.status !== 'online').length,
    moving: units.filter((unit) => unit.movement === 'moving').length,
    stopped: units.filter((unit) => unit.movement === 'stopped').length,
    stale: units.filter((unit) => unit.movement === 'stale').length,
  };
  const filtered = units.filter(
    (unit) =>
      (filter === 'all' ||
        (filter === 'offline'
          ? unit.status !== 'online'
          : ['online'].includes(filter)
            ? unit.status === filter
            : unit.movement === filter)) &&
      unit.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()),
  );
  const visiblePage = Math.min(page, Math.max(0, Math.ceil(filtered.length / 10) - 1));

  const onShow = useCallback(({ deviceIds, groupIds, from, to }) => {
    const query = new URLSearchParams({ from, to, daily: 'false' });
    deviceIds.forEach((id) => query.append('deviceId', id));
    groupIds.forEach((id) => query.append('groupId', id));
    setRequest({ query: query.toString() });
  }, []);

  useAsyncTask(
    async ({ signal }) => {
      if (!request || disableReports) return;
      setReport({ items: [], loading: true, error: false, query: request.query });
      try {
        const response = await fetchOrThrow(`/api/reports/summary?${request.query}`, {
          signal,
          headers: { Accept: 'application/json' },
        });
        const items = await response.json();
        if (!Array.isArray(items)) throw new Error('Invalid summary');
        if (!signal.aborted)
          setReport({ items, loading: false, error: false, query: request.query });
      } catch (error) {
        if (!signal.aborted)
          setReport({ items: [], loading: false, error: true, query: request.query });
        if (error.name === 'AbortError') return;
      }
    },
    [request, disableReports],
  );

  const queried = params.has('from') && params.has('to') && request?.query === report.query;
  const totals = summarizeActivity(report.items, devices);
  const openUnit = (id) => {
    dispatch(devicesActions.selectId(id));
    navigate('/');
  };
  const metricLabels = {
    all: 'dashboardUnits',
    online: 'dashboardConnected',
    offline: 'dashboardDisconnected',
    moving: 'dashboardMoving',
    stopped: 'dashboardStopped',
    stale: 'dashboardStale',
  };

  return (
    <PageLayout
      breadcrumbs={['dashboardTitle']}
      menu={
        disableReports ? (
          <List>
            <MenuItem
              title={t('dashboardTitle')}
              link="/dashboard"
              icon={<DashboardIcon />}
              selected
            />
          </List>
        ) : (
          <ReportsMenu />
        )
      }
    >
      <Stack spacing={3} sx={{ p: { xs: 2, md: 3 } }}>
        <Stack direction="row" spacing={2} justifyContent="space-between" alignItems="center">
          <Box>
            <Typography variant="h5" component="h2">
              {t('dashboardOverview')}
            </Typography>
            <Typography color="text.secondary">{t('dashboardLiveScope')}</Typography>
          </Box>
          <Button onClick={() => navigate('/')}>{t('mapTitle')}</Button>
        </Stack>
        {socket === false && <Alert severity="warning">{t('dashboardSocketWarning')}</Alert>}
        {!loaded && <LinearProgress aria-label={t('sharedLoading')} />}
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: 'repeat(2, 1fr)', lg: 'repeat(3, 1fr)' },
            gap: 2,
          }}
        >
          {Object.entries(metricLabels).map(([key, label]) => (
            <ButtonBase
              key={key}
              focusRipple
              onClick={() => {
                setFilter(key);
                setPage(0);
              }}
              aria-pressed={filter === key}
              sx={{
                p: 2,
                borderRadius: 2,
                textAlign: 'left',
                justifyContent: 'flex-start',
                bgcolor: filter === key ? 'action.selected' : 'action.hover',
              }}
            >
              <Box>
                <Typography color="text.secondary">{t(label)}</Typography>
                <Typography variant="h4" sx={{ fontWeight: 600 }}>
                  {loaded ? counts[key] : '—'}
                </Typography>
              </Box>
            </ButtonBase>
          ))}
        </Box>
        <Typography variant="body2" color="text.secondary">
          {t('dashboardFreshnessHelp')}
        </Typography>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} justifyContent="space-between">
          <Typography component="h2" variant="h6">
            {t(metricLabels[filter])} · {filtered.length}
          </Typography>
          <TextField
            size="small"
            label={t('sharedSearch')}
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(0);
            }}
          />
        </Stack>
        <TableContainer>
          <Table size="small" aria-label={t('dashboardUnits')}>
            <TableHead>
              <TableRow>
                {[
                  'sharedDevice',
                  'deviceStatus',
                  'dashboardMovement',
                  'dashboardCommunication',
                  'dashboardPositionTime',
                ].map((key) => (
                  <TableCell key={key}>{t(key)}</TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {filtered.slice(visiblePage * 10, visiblePage * 10 + 10).map((unit) => (
                <TableRow key={unit.id}>
                  <TableCell sx={{ minWidth: 180 }}>
                    <Button onClick={() => openUnit(unit.id)} sx={{ textAlign: 'left' }}>
                      {unit.name}
                    </Button>
                  </TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      label={formatStatus(unit.status || 'unknown', t)}
                      color={unit.status === 'online' ? 'success' : 'default'}
                    />
                  </TableCell>
                  <TableCell>{t(`dashboardMotion${unit.movement}`)}</TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>
                    {formatTime(unit.lastUpdate, 'minutes') || '—'}
                  </TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>
                    {formatTime(unit.position?.fixTime, 'minutes') || '—'}
                  </TableCell>
                </TableRow>
              ))}
              {loaded && !filtered.length && (
                <TableRow>
                  <TableCell colSpan={5}>
                    {t(units.length ? 'dashboardNoMatches' : 'dashboardNoUnits')}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
        <TablePagination
          component="div"
          count={filtered.length}
          page={visiblePage}
          rowsPerPage={10}
          rowsPerPageOptions={[10]}
          onPageChange={(_, value) => setPage(value)}
        />
        {!disableReports && (
          <>
            <Box>
              <Typography component="h2" variant="h6">
                {t('dashboardActivity')}
              </Typography>
              <Typography color="text.secondary">{t('dashboardActivityHelp')}</Typography>
            </Box>
            <ReportFilter
              onShow={onShow}
              deviceType="multiple"
              loading={queried && report.loading}
            />
            {!queried ? (
              <Alert severity="info">{t('dashboardChoosePeriod')}</Alert>
            ) : report.loading ? (
              <LinearProgress aria-label={t('sharedLoading')} />
            ) : report.error ? (
              <Alert
                severity="error"
                action={
                  <Button color="inherit" onClick={() => setRequest({ ...request })}>
                    {t('dashboardRetry')}
                  </Button>
                }
              >
                {t('dashboardReportError')}
              </Alert>
            ) : !totals.count ? (
              <Alert severity="info">{t('dashboardNoReport')}</Alert>
            ) : (
              <>
                <Box
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' },
                    gap: 2,
                  }}
                >
                  {[
                    [
                      'sharedDistance',
                      totals.distanceCount ? formatDistance(totals.distance, distanceUnit, t) : '—',
                      totals.distanceCount,
                    ],
                    [
                      'reportEngineHours',
                      totals.hoursCount ? formatNumericHours(totals.engineHours, t) : '—',
                      totals.hoursCount,
                    ],
                    ['dashboardReportUnits', totals.count, totals.count],
                  ].map(([label, value, coverage]) => (
                    <Box key={label} sx={{ p: 2, bgcolor: 'action.hover', borderRadius: 2 }}>
                      <Typography color="text.secondary">{t(label)}</Typography>
                      <Typography variant="h5">{value}</Typography>
                      <Typography variant="caption">
                        {coverage}/{totals.count} · {t('dashboardWithData')}
                      </Typography>
                    </Box>
                  ))}
                </Box>
                <Typography variant="body2" color="text.secondary">
                  {formatTime(params.get('from'), 'minutes')} —{' '}
                  {formatTime(params.get('to'), 'minutes')} · {t('dashboardReportedData')}
                </Typography>
                <Button
                  sx={{ alignSelf: 'flex-start' }}
                  onClick={() => navigate(`/reports/summary?${request.query}`)}
                >
                  {t('dashboardOpenSummary')}
                </Button>
              </>
            )}
            <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
              {['trips', 'stops', 'events'].map((type) => (
                <Button key={type} onClick={() => navigate(`/reports/${type}?${params}`)}>
                  {t(`report${type[0].toUpperCase()}${type.slice(1)}`)}
                </Button>
              ))}
            </Stack>
          </>
        )}
      </Stack>
    </PageLayout>
  );
};

export default DashboardPage;
