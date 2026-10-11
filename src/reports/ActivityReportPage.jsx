import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Alert,
  Box,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableFooter,
  TableHead,
  TablePagination,
  TableRow,
  Typography,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { formatNumericHours, formatTime } from '../common/util/formatter';
import { useTranslation } from '../common/components/LocalizationProvider';
import PageLayout from '../common/components/PageLayout';
import SelectField from '../common/components/SelectField';
import TableShimmer from '../common/components/TableShimmer';
import fetchOrThrow from '../common/util/fetchOrThrow';
import exportExcel from '../common/util/exportExcel';
import { pageSize, useCatch, useCatchCallback } from '../reactHelper';
import ReportFilter, { updateReportParams } from './components/ReportFilter';
import ReportsMenu from './components/ReportsMenu';
import useReportStyles from './common/useReportStyles';
import { activityTotals, activityQuery } from './common/activity';

const columns = [
  ['observedMillis', 'reportActivityObserved'],
  ['stoppedMillis', 'reportActivityStopped'],
  ['idleMillis', 'reportActivityIdle'],
  ['ignitionUnknownMillis', 'reportActivityIgnitionUnknown'],
  ['motionUnknownMillis', 'reportActivityMotionUnknown'],
  ['outsidePlacesMillis', 'reportActivityOutside'],
  ['uncoveredMillis', 'reportActivityUncovered'],
  ['positionCount', 'reportActivityPositions'],
];

const ActivityReportPage = () => {
  const t = useTranslation();
  const theme = useTheme();
  const { classes } = useReportStyles();
  const [searchParams, setSearchParams] = useSearchParams();
  const geofenceIds = useMemo(() => searchParams.getAll('geofenceId').map(Number), [searchParams]);
  const requestRef = useRef(null);
  const [result, setResult] = useState(null);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [failedKey, setFailedKey] = useState(null);
  const selection = useMemo(
    () => ({
      from: searchParams.get('from'),
      to: searchParams.get('to'),
      deviceIds: searchParams.getAll('deviceId'),
      groupIds: searchParams.getAll('groupId'),
      geofenceIds: searchParams.getAll('geofenceId'),
    }),
    [searchParams],
  );
  const selectionKey = activityQuery(selection).toString();
  const error = failedKey === selectionKey;
  const requested = searchParams.has('from') && searchParams.has('to');
  const visibleItems =
    requested && !loading && !error && result?.key === selectionKey ? result.items : [];
  const currentPage = Math.min(page, Math.max(0, Math.ceil(visibleItems.length / pageSize) - 1));
  useEffect(() => {
    if (requestRef.current && requestRef.current.key !== selectionKey) {
      requestRef.current.controller.abort();
    }
  }, [selectionKey]);
  useEffect(
    () => () => {
      requestRef.current?.controller.abort();
      requestRef.current = null;
    },
    [],
  );
  const totals = activityTotals(visibleItems);

  const onShow = useCatchCallback(
    async ({ deviceIds, groupIds, from, to }) => {
      const snapshot = { deviceIds, groupIds, geofenceIds, from, to };
      const query = activityQuery(snapshot);
      requestRef.current?.controller.abort();
      const current = { key: query.toString(), controller: new AbortController() };
      requestRef.current = current;
      setLoading(true);
      setFailedKey(null);
      setPage(0);
      try {
        const response = await fetchOrThrow(`/api/reports/activity?${query}`, {
          headers: { Accept: 'application/json' },
          signal: current.controller.signal,
        });
        const items = await response.json();
        if (requestRef.current === current && !current.controller.signal.aborted) {
          setResult({ key: current.key, items, selection: snapshot });
        }
      } catch (failure) {
        if (requestRef.current === current && !current.controller.signal.aborted) {
          setFailedKey(current.key);
          throw failure;
        }
      } finally {
        if (requestRef.current === current) {
          setLoading(false);
        }
      }
    },
    [geofenceIds],
  );

  const formatValue = (item, key) => {
    if (key === 'positionCount') {
      return item[key];
    }
    if (key === 'outsidePlacesMillis' && item[key] == null) {
      return t('reportActivityNotSelected');
    }
    if (!item.observedMillis && !['observedMillis', 'uncoveredMillis'].includes(key)) {
      return t('reportActivityNoCoverage');
    }
    if (
      ['stoppedMillis', 'idleMillis', 'outsidePlacesMillis'].includes(key) &&
      item.motionUnknownMillis === item.observedMillis
    ) {
      return t('reportActivityMotionUnknown');
    }
    if (key === 'idleMillis' && item.ignitionUnknownMillis === item.observedMillis) {
      return t('reportActivityIgnitionUnknown');
    }
    return formatNumericHours(item[key], t);
  };

  const onExport = useCatch(async () => {
    if (!visibleItems.length) {
      return;
    }
    const rows = visibleItems.map((item) => {
      const row = {
        [t('sharedDevice')]: item.deviceName || item.deviceId,
        [t('reportFrom')]: formatTime(result.selection.from, 'minutes'),
        [t('reportTo')]: formatTime(result.selection.to, 'minutes'),
      };
      columns.forEach(([key, label]) => {
        row[t(label)] = formatValue(item, key);
      });
      return row;
    });
    await exportExcel(t('reportActivity'), 'activity.xlsx', new Map([['Activity', rows]]), theme);
  });

  return (
    <PageLayout menu={<ReportsMenu />} breadcrumbs={['reportTitle', 'reportActivity']}>
      <div className={classes.header}>
        <ReportFilter
          onShow={onShow}
          onExport={onExport}
          deviceType="multiple"
          loading={loading}
          formats={['xlsx']}
        >
          <div className={classes.filterItem}>
            <SelectField
              label={t('reportActivityPlaces')}
              value={geofenceIds}
              onChange={(event) =>
                updateReportParams(searchParams, setSearchParams, 'geofenceId', event.target.value)
              }
              endpoint="/api/geofences"
              multiple
              singleLine
              fullWidth
            />
          </div>
        </ReportFilter>
      </div>
      <Box sx={{ px: 2, py: 1 }}>
        <Typography variant="body2" color="text.secondary">
          {t('reportActivityHelp')}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          {t('reportActivityCoverageHelp')}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          {t('reportActivityUnits')}
          {requested &&
            ` · ${formatTime(searchParams.get('from'), 'minutes')} — ${formatTime(searchParams.get('to'), 'minutes')}`}
        </Typography>
        {error && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {t('reportActivityLoadError')}
          </Alert>
        )}
      </Box>
      <TableContainer
        tabIndex={0}
        role="region"
        aria-label={t('reportActivity')}
        sx={{ '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main' } }}
      >
        <Table aria-label={t('reportActivity')}>
          <TableHead>
            <TableRow>
              <TableCell>{t('sharedDevice')}</TableCell>
              {columns.map(([key, label]) => (
                <TableCell key={key}>{t(label)}</TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              <TableShimmer columns={columns.length + 1} />
            ) : (
              visibleItems
                .slice(currentPage * pageSize, (currentPage + 1) * pageSize)
                .map((item) => (
                  <TableRow key={item.deviceId}>
                    <TableCell>
                      {item.deviceName || item.deviceId}
                      {!item.observedMillis && (
                        <Typography variant="caption" display="block" color="text.secondary">
                          {t('reportActivityNoCoverage')}
                        </Typography>
                      )}
                    </TableCell>
                    {columns.map(([key]) => (
                      <TableCell key={key}>{formatValue(item, key)}</TableCell>
                    ))}
                  </TableRow>
                ))
            )}
            {!loading && !visibleItems.length && (
              <TableRow>
                <TableCell colSpan={columns.length + 1}>
                  {t(
                    error
                      ? 'reportLoadError'
                      : requested
                        ? 'reportActivityNoData'
                        : 'dashboardChoosePeriod',
                  )}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
          {visibleItems.length > 0 && (
            <TableFooter>
              <TableRow>
                <TableCell>
                  {t('reportActivitySelectedTotal')} ({visibleItems.length})
                </TableCell>
                {columns.map(([key]) => (
                  <TableCell key={key}>{formatValue(totals, key)}</TableCell>
                ))}
              </TableRow>
            </TableFooter>
          )}
        </Table>
      </TableContainer>
      {visibleItems.length > pageSize && (
        <TablePagination
          component="div"
          count={visibleItems.length}
          page={currentPage}
          rowsPerPage={pageSize}
          rowsPerPageOptions={[pageSize]}
          onPageChange={(_, value) => setPage(value)}
          sx={{ '@media print': { display: 'none' } }}
        />
      )}
    </PageLayout>
  );
};

export default ActivityReportPage;
