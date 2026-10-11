import { useMemo, useState } from 'react';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  MenuItem,
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
  useTheme,
} from '@mui/material';
import dayjs from 'dayjs';
import { useTranslation } from '../common/components/LocalizationProvider';
import { formatNumericHours, formatTime } from '../common/util/formatter';
import exportExcel from '../common/util/exportExcel';
import { useRestriction } from '../common/util/permissions';
import { pageSize, useCatch } from '../reactHelper';
import { filterTrips, tripMetrics, tripVisits } from './tripMetrics';

const statuses = ['planned', 'ready', 'active', 'arrived', 'completed', 'cancelled'];

const TripReport = ({ orders, devices, loading, error, onRefresh }) => {
  const t = useTranslation();
  const theme = useTheme();
  const disabled = useRestriction('disableReports');
  const [from, setFrom] = useState(() =>
    dayjs().subtract(6, 'day').startOf('day').format('YYYY-MM-DDTHH:mm'),
  );
  const [to, setTo] = useState(() => dayjs().format('YYYY-MM-DDTHH:mm'));
  const [deviceId, setDeviceId] = useState('');
  const [status, setStatus] = useState('');
  const [view, setView] = useState('trips');
  const [page, setPage] = useState(0);
  const [exporting, setExporting] = useState(false);
  const validPeriod =
    Number.isFinite(Date.parse(from)) &&
    Number.isFinite(Date.parse(to)) &&
    Date.parse(from) <= Date.parse(to);
  const tripRows = useMemo(
    () =>
      filterTrips(orders, { from, to, deviceId, status }, devices)
        .map((order) => ({ order, ...tripMetrics(order) }))
        .sort((a, b) => b.plannedDeparture - a.plannedDeparture),
    [orders, from, to, deviceId, status, devices],
  );
  const rows = useMemo(
    () =>
      view === 'trips'
        ? tripRows
        : tripRows.flatMap(({ order }) => tripVisits(order).map((visit) => ({ order, ...visit }))),
    [tripRows, view],
  );
  const currentPage = Math.min(page, Math.max(0, Math.ceil(rows.length / pageSize) - 1));
  const date = (value) => (value === null ? '—' : formatTime(new Date(value).toISOString()));
  const duration = (value) => {
    if (value === null) return '—';
    if (value > 0 && value < 60000) return `< 1 ${t('sharedMinuteAbbreviation')}`;
    return formatNumericHours(value, t);
  };
  const delta = (value) => {
    if (value === null) return '—';
    if (value === 0) return t('tripReportOnTime');
    return `${value < 0 ? '−' : '+'} ${duration(Math.abs(value))} (${t(value < 0 ? 'tripReportEarly' : 'tripReportDelayed')})`;
  };
  const columns = [
    ['tripName', ({ order }) => order.description || '—'],
    [
      'tripUnit',
      ({ order }) => devices[order.attributes.routeTrip.deviceId]?.name || t('tripUnitUnavailable'),
    ],
    ...(view === 'visits'
      ? [
          [
            'tripVisitPlace',
            (row) =>
              `${row.destination ? t('routingDestination') : `${t('tripStop')} ${row.index + 1}`} · ${row.place?.name || '—'}`,
          ],
          ['tripVisitDuration', (row) => duration(row.duration)],
          ['deviceStatus', (row) => t(`tripVisitState${row.state}`)],
          ['triparrivedTime', (row) => date(row.arrival)],
          ['tripVisitDeparture', (row) => date(row.departure)],
          ['tripVisitObservedUntil', (row) => date(row.lastInside)],
        ]
      : [
          ['routingOrigin', ({ order }) => order.attributes.routeTrip.origin?.name || '—'],
          [
            'routingDestination',
            ({ order }) => order.attributes.routeTrip.destination?.name || '—',
          ],
          [
            'deviceStatus',
            ({ order }) =>
              statuses.includes(order.attributes.routeTrip.status)
                ? t(`tripStatus${order.attributes.routeTrip.status}`)
                : '—',
          ],
          ['tripReportPlannedDeparture', (row) => date(row.plannedDeparture)],
          ['tripReportActualStart', (row) => date(row.actualStart)],
          ['tripReportPlannedArrival', (row) => date(row.plannedArrival)],
          ['tripReportActualArrival', (row) => date(row.actualArrival)],
          ['tripReportDuration', (row) => duration(row.duration)],
          ['tripReportArrivalDelta', (row) => delta(row.arrivalDelta)],
          ['tripReportStartDelta', (row) => delta(row.startDelta)],
        ]),
  ];
  const onExport = useCatch(async () => {
    if (disabled || !rows.length || exporting) return;
    setExporting(true);
    try {
      const values = rows.map((row) =>
        Object.fromEntries(columns.map(([key, format]) => [t(key), format(row)])),
      );
      await exportExcel(
        `${t('tripReportTitle')} · ${t('tripReportPeriod')}: ${formatTime(from)} – ${formatTime(to)} · ${t('sharedTimezone')}: ${Intl.DateTimeFormat().resolvedOptions().timeZone}`,
        view === 'visits' ? 'trip-visits.xlsx' : 'trip-comparison.xlsx',
        new Map([[t(view === 'visits' ? 'tripVisitTitle' : 'tripTab'), values]]),
        theme,
      );
    } finally {
      setExporting(false);
    }
  });
  if (disabled) return <Alert severity="info">{t('tripReportRestricted')}</Alert>;
  return (
    <Box
      component="section"
      aria-label={t('tripReportTitle')}
      sx={{
        height: '100%',
        minWidth: 0,
        minHeight: 0,
        overflowY: 'auto',
        bgcolor: 'background.paper',
        p: { xs: 2, md: 3 },
        '@media print': { height: 'auto', overflow: 'visible', p: 0 },
      }}
    >
      <Stack spacing={2} sx={{ minWidth: 0 }}>
        <Typography variant="body2" color="text.secondary">
          {t(view === 'visits' ? 'tripVisitHelp' : 'tripReportHelp')}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {t('tripReportPeriod')}: {validPeriod ? `${formatTime(from)} – ${formatTime(to)}` : '—'}
          {' · '}
          {t('sharedTimezone')}: {Intl.DateTimeFormat().resolvedOptions().timeZone}
          {' · '}
          {deviceId ? devices[deviceId]?.name || t('tripUnitUnavailable') : t('tripReportAllUnits')}
          {' · '}
          {status ? t(`tripStatus${status}`) : t('tripReportAllStatuses')}
        </Typography>
        <Stack
          direction="row"
          useFlexGap
          spacing={2}
          sx={{ flexWrap: 'wrap', '@media print': { display: 'none' } }}
        >
          <TextField
            select
            label={t('tripReportView')}
            value={view}
            onChange={(event) => {
              setView(event.target.value);
              setPage(0);
            }}
            sx={{ flex: '1 1 250px', minWidth: 0 }}
          >
            <MenuItem value="trips">{t('tripReportTitle')}</MenuItem>
            <MenuItem value="visits">{t('tripVisitTitle')}</MenuItem>
          </TextField>
          <TextField
            type="datetime-local"
            label={`${t('reportFrom')} · ${t('tripReportPlannedDeparture')}`}
            value={from}
            required
            error={!validPeriod}
            onChange={(event) => {
              setFrom(event.target.value);
              setPage(0);
            }}
            slotProps={{ inputLabel: { shrink: true } }}
            sx={{ flex: '1 1 250px', minWidth: 0 }}
          />
          <TextField
            type="datetime-local"
            label={`${t('reportTo')} · ${t('tripReportPlannedDeparture')}`}
            value={to}
            required
            error={!validPeriod}
            helperText={!validPeriod ? t('tripReportPeriodInvalid') : undefined}
            onChange={(event) => {
              setTo(event.target.value);
              setPage(0);
            }}
            slotProps={{ inputLabel: { shrink: true } }}
            sx={{ flex: '1 1 250px', minWidth: 0 }}
          />
          <Autocomplete
            options={Object.values(devices)}
            getOptionLabel={(item) => item.name}
            value={devices[deviceId] || null}
            onChange={(_, item) => {
              setDeviceId(item?.id || '');
              setPage(0);
            }}
            renderInput={(params) => (
              <TextField {...params} label={t('tripUnit')} placeholder={t('tripReportAllUnits')} />
            )}
            sx={{ flex: '1 1 200px', minWidth: 0 }}
          />
          <TextField
            select
            label={t('deviceStatus')}
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(0);
            }}
            sx={{ flex: '1 1 180px', minWidth: 0 }}
          >
            <MenuItem value="">{t('tripReportAllStatuses')}</MenuItem>
            {statuses.map((value) => (
              <MenuItem key={value} value={value}>
                {t(`tripStatus${value}`)}
              </MenuItem>
            ))}
          </TextField>
        </Stack>
        <Stack
          direction="row"
          spacing={1}
          useFlexGap
          sx={{ flexWrap: 'wrap', '@media print': { display: 'none' } }}
        >
          <Button disabled={loading} onClick={onRefresh}>
            {t('tripRefresh')}
          </Button>
          <Button disabled={loading || !rows.length || exporting} onClick={onExport}>
            {t('reportExport')} · Excel
          </Button>
          <Button disabled={loading || !rows.length} onClick={() => window.print()}>
            {t('reportPrint')}
          </Button>
        </Stack>
        {error && <Alert severity="error">{t('tripReportLoadError')}</Alert>}
        {loading ? (
          <Typography role="status">{t('sharedLoading')}</Typography>
        ) : (
          <>
            {validPeriod && (!error || rows.length > 0) && (
              <Stack
                direction="row"
                useFlexGap
                spacing={3}
                aria-live="polite"
                sx={{ flexWrap: 'wrap' }}
              >
                {[
                  ['tripReportVisible', tripRows.length],
                  ['tripReportArrived', tripRows.filter((row) => row.arrived).length],
                  ['tripReportLate', tripRows.filter((row) => row.late).length],
                ].map(([key, value]) => (
                  <Box key={key}>
                    <Typography variant="h5" component="p">
                      {value}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {t(key)}
                    </Typography>
                  </Box>
                ))}
              </Stack>
            )}
            {!rows.length && validPeriod && !error && (
              <Typography color="text.secondary" role="status">
                {t('tripReportEmpty')}
              </Typography>
            )}
            {rows.length > 0 && (
              <>
                <Typography variant="caption" color="text.secondary">
                  {t('tripReportPrintScope')}
                </Typography>
                <TableContainer
                  component="div"
                  role="region"
                  aria-label={t('tripReportTitle')}
                  tabIndex={0}
                  sx={{
                    maxWidth: '100%',
                    overflowX: 'auto',
                    '&:focus-visible': {
                      outline: '2px solid',
                      outlineColor: 'primary.main',
                      outlineOffset: 2,
                    },
                    '@media print': {
                      overflow: 'visible',
                      '& table': { minWidth: 0 },
                      '& th, & td': { whiteSpace: 'normal', fontSize: '8pt', p: 0.5 },
                    },
                  }}
                >
                  <Table size="small" sx={{ minWidth: 1200 }}>
                    <TableHead>
                      <TableRow>
                        {columns.map(([key]) => (
                          <TableCell key={key} scope="col">
                            {t(key)}
                          </TableCell>
                        ))}
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {rows
                        .slice(currentPage * pageSize, (currentPage + 1) * pageSize)
                        .map((row) => (
                          <TableRow key={`${row.order.id}-${row.index ?? 'trip'}`}>
                            {columns.map(([key, format]) => (
                              <TableCell
                                key={key}
                                sx={{
                                  verticalAlign: 'top',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                {format(row)}
                              </TableCell>
                            ))}
                          </TableRow>
                        ))}
                    </TableBody>
                  </Table>
                </TableContainer>
                <TablePagination
                  component="div"
                  count={rows.length}
                  page={currentPage}
                  rowsPerPage={pageSize}
                  rowsPerPageOptions={[pageSize]}
                  onPageChange={(_, value) => setPage(value)}
                  sx={{ flexShrink: 0, '@media print': { display: 'none' } }}
                />
              </>
            )}
          </>
        )}
      </Stack>
    </Box>
  );
};

export default TripReport;
