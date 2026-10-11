import { useCallback, useEffect, useRef, useState } from 'react';
import { useSelector } from 'react-redux';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  List,
  ListItemButton,
  ListItemText,
  Paper,
  Stack,
  TextField,
  TablePagination,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import BottomMenu from '../common/components/BottomMenu';
import AddressSearch from '../common/components/AddressSearch';
import { useTranslation } from '../common/components/LocalizationProvider';
import { useAttributePreference } from '../common/util/preferences';
import { formatDistance, formatNumericHours, formatTime } from '../common/util/formatter';
import MapView from '../map/core/MapView';
import MapMarkers from '../map/MapMarkers';
import RouteMap from './RouteMap';
import RoutesHeader from './RoutesHeader';
import { routePoint, routeRequest } from './routePlan';
import { nearestUnits } from './nearestUnits';
import { pageSize } from '../reactHelper';

const NearestUnits = ({ places, error: placesError, navigation }) => {
  const t = useTranslation();
  const theme = useTheme();
  const mobile = useMediaQuery(theme.breakpoints.down('md'));
  const devices = useSelector((state) => state.devices.items);
  const positions = useSelector((state) => state.session.positions);
  const enabled = useSelector((state) => state.session.server.routingEnabled);
  const distanceUnit = useAttributePreference('distanceUnit', 'km');
  const [target, setTarget] = useState({ latitude: '', longitude: '' });
  const [coordinatesOpen, setCoordinatesOpen] = useState(false);
  const [address, setAddress] = useState('');
  const [profile, setProfile] = useState('car');
  const [truck, setTruck] = useState({
    height: '',
    width: '',
    length: '',
    weight: '',
    axleload: '',
  });
  const [now, setNow] = useState(Date.now);
  const [selectedId, setSelectedId] = useState(null);
  const [page, setPage] = useState(0);
  const [view, setView] = useState('form');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const pendingRef = useRef(null);
  const rows = nearestUnits(devices, positions, target, now);
  const currentPage = Math.min(page, Math.max(0, Math.ceil(rows.length / pageSize) - 1));
  const selected = rows.find((row) => row.device.id === selectedId);
  const request =
    selected && routeRequest({ origin: selected.position, destination: target, profile, truck });
  const requestKey = JSON.stringify([request, selected?.position.fixTime]);

  const invalidate = useCallback(() => {
    pendingRef.current?.abort();
    pendingRef.current = null;
    setResult(null);
    setLoading(false);
    setError('');
  }, []);
  useEffect(() => {
    invalidate();
    return () => pendingRef.current?.abort();
  }, [requestKey, invalidate]);
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(interval);
  }, []);
  const changeTarget = useCallback(
    (point, label = '') => {
      invalidate();
      setTarget(point);
      setAddress(label);
      setSelectedId(null);
      setPage(0);
      setNow(Date.now());
    },
    [invalidate],
  );
  const onPoint = useCallback((point) => changeTarget(point), [changeTarget]);
  const choose = (id) => {
    invalidate();
    setNow(Date.now());
    setSelectedId(Number(id));
    if (mobile) setView('form');
  };
  const calculate = async () => {
    const fresh = nearestUnits(devices, positions, target, Date.now()).find(
      (row) => row.device.id === selectedId,
    );
    const valid =
      fresh && routeRequest({ origin: fresh.position, destination: target, profile, truck });
    if (!valid || !enabled) {
      setNow(Date.now());
      return;
    }
    invalidate();
    const controller = new AbortController();
    pendingRef.current = controller;
    setLoading(true);
    try {
      const response = await fetch('/api/routing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(valid),
        signal: controller.signal,
      });
      const data = await response.json();
      if (controller.signal.aborted || pendingRef.current !== controller) return;
      if (!response.ok) {
        setError(
          data.code === 'NO_ROUTE'
            ? 'routingNoRoute'
            : data.code === 'ROUTE_WARNING'
              ? 'routingWarning'
              : 'routingUnavailable',
        );
        return;
      }
      if (
        data.geometry?.type !== 'LineString' ||
        !Array.isArray(data.geometry.coordinates) ||
        data.geometry.coordinates.length < 2 ||
        !data.geometry.coordinates.every(
          (point) =>
            Array.isArray(point) && routePoint({ longitude: point[0], latitude: point[1] }),
        ) ||
        !Number.isFinite(data.distance) ||
        data.distance <= 0 ||
        !Number.isFinite(data.duration) ||
        data.duration <= 0 ||
        !Number.isFinite(Date.parse(data.arrivalTime))
      )
        throw new Error();
      setResult(data);
    } catch {
      if (!controller.signal.aborted) setError('routingUnavailable');
    } finally {
      if (pendingRef.current === controller) {
        pendingRef.current = null;
        setLoading(false);
      }
    }
  };
  const header = (
    <RoutesHeader navigation={navigation} view={view} onView={mobile ? setView : undefined} />
  );
  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
      {mobile && header}
      <Box sx={{ flex: 1, minHeight: 0, display: 'flex', gap: { md: 1.5 }, p: { md: 1.5 } }}>
        <Paper
          component="section"
          elevation={1}
          sx={{
            width: { xs: '100%', md: theme.dimensions.drawerWidthDesktop },
            flexShrink: 0,
            minHeight: 0,
            overflow: 'hidden',
            borderRadius: { md: 2 },
            display: mobile && view === 'map' ? 'none' : 'flex',
            flexDirection: 'column',
          }}
        >
          {!mobile && header}
          <Stack spacing={2} sx={{ flex: 1, minHeight: 0, overflowY: 'auto', p: 2.5 }}>
            <Typography component="h2" variant="h6">
              {t('nearestTitle')}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {t('nearestHelp')}
            </Typography>
            {placesError && <Alert severity="warning">{t(placesError)}</Alert>}
            <AddressSearch
              label={t('routingDestination')}
              places={places}
              value={
                address || (routePoint(target) ? `${target.latitude}, ${target.longitude}` : '')
              }
              onChange={(label) => changeTarget({ latitude: '', longitude: '' }, label)}
              onSelect={(item) => changeTarget(routePoint(item), item.label)}
            />
            <Accordion
              expanded={coordinatesOpen}
              onChange={(_, expanded) => setCoordinatesOpen(expanded)}
              elevation={0}
              disableGutters
              sx={{ bgcolor: 'action.hover', '&::before': { display: 'none' } }}
            >
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Typography variant="subtitle2">{t('routingCoordinates')}</Typography>
              </AccordionSummary>
              <AccordionDetails>
                <Stack direction="row" spacing={1}>
                  {['latitude', 'longitude'].map((key) => (
                    <TextField
                      key={key}
                      type="number"
                      label={t(key === 'latitude' ? 'positionLatitude' : 'positionLongitude')}
                      value={target[key]}
                      onChange={(event) => changeTarget({ ...target, [key]: event.target.value })}
                      slotProps={{
                        htmlInput: {
                          step: 'any',
                          min: key === 'latitude' ? -90 : -180,
                          max: key === 'latitude' ? 90 : 180,
                        },
                      }}
                    />
                  ))}
                </Stack>
              </AccordionDetails>
            </Accordion>
            <Button
              onClick={() => {
                setSelectedId(null);
                invalidate();
                setView('map');
              }}
            >
              {t('routingPick')}
            </Button>
            {!routePoint(target) ? (
              <Alert severity="info">{t('nearestPickTarget')}</Alert>
            ) : (
              <>
                <Typography variant="body2" role="status">
                  {t('nearestAvailable')
                    .replace('{count}', rows.length)
                    .replace('{total}', Object.keys(devices).length)}
                </Typography>
                {!rows.length && <Alert severity="info">{t('nearestNoGps')}</Alert>}
                <List disablePadding aria-label={t('nearestTitle')}>
                  {rows.slice(currentPage * pageSize, (currentPage + 1) * pageSize).map((row) => (
                    <ListItemButton
                      key={row.device.id}
                      selected={selectedId === row.device.id}
                      onClick={() => choose(row.device.id)}
                      sx={{ borderRadius: 1.5 }}
                    >
                      <ListItemText
                        primary={row.device.name}
                        secondary={`${formatDistance(row.distance, distanceUnit, t)} · ${t('nearestStraight')}`}
                      />
                    </ListItemButton>
                  ))}
                </List>
                {rows.length > pageSize && (
                  <TablePagination
                    component="div"
                    count={rows.length}
                    rowsPerPage={pageSize}
                    rowsPerPageOptions={[pageSize]}
                    page={currentPage}
                    onPageChange={(_, value) => setPage(value)}
                  />
                )}
              </>
            )}
            {selected && (
              <>
                <Typography variant="subtitle2">{selected.device.name}</Typography>
                <Typography variant="caption" color="text.secondary">
                  {t('routingFixTime')}: {formatTime(selected.position.fixTime, 'seconds')}
                </Typography>
                <ToggleButtonGroup
                  exclusive
                  value={profile}
                  onChange={(_, value) => {
                    if (value) {
                      invalidate();
                      setProfile(value);
                    }
                  }}
                  aria-label={t('routingVehicle')}
                  fullWidth
                >
                  <ToggleButton value="car">{t('routingCar')}</ToggleButton>
                  <ToggleButton value="truck">{t('routingTruck')}</ToggleButton>
                </ToggleButtonGroup>
                {profile === 'truck' && (
                  <>
                    <Typography variant="body2" color="text.secondary">
                      {t('routingTruckHelp')}
                    </Typography>
                    <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
                      {Object.keys(truck).map((key) => (
                        <TextField
                          key={key}
                          label={t(`routingTruck${key}`)}
                          type="number"
                          value={truck[key]}
                          onChange={(event) => {
                            invalidate();
                            setTruck({ ...truck, [key]: event.target.value });
                          }}
                          slotProps={{
                            htmlInput: {
                              min: 0.1,
                              step: 'any',
                              max: { height: 10, width: 10, length: 100 }[key] || 1000,
                            },
                          }}
                        />
                      ))}
                    </Box>
                  </>
                )}
                {!enabled && <Alert severity="info">{t('routingDisabled')}</Alert>}
                {selected.distance === 0 && <Alert severity="info">{t('nearestAtTarget')}</Alert>}
                <Button
                  variant="contained"
                  disabled={!enabled || !request || loading}
                  onClick={calculate}
                >
                  {t(loading ? 'routingCalculating' : 'nearestRoad')}
                </Button>
              </>
            )}
            {error && <Alert severity="error">{t(error)}</Alert>}
            {result && (
              <Box aria-live="polite" sx={{ bgcolor: 'action.hover', p: 2, borderRadius: 2 }}>
                <Typography variant="h6">
                  {formatDistance(result.distance, distanceUnit, t)}
                </Typography>
                <Typography>{formatNumericHours(result.duration * 1000, t)}</Typography>
                <Typography variant="body2">
                  {t('routingArrival')}: {formatTime(result.arrivalTime, 'minutes')}
                </Typography>
              </Box>
            )}
            {selected && (
              <Typography variant="caption" color="text.secondary">
                {t('nearestSnapshot')} {t('routingNoTraffic')}
              </Typography>
            )}
          </Stack>
          {!mobile && (
            <Box sx={{ flexShrink: 0, '@media print': { display: 'none' } }}>
              <BottomMenu />
            </Box>
          )}
        </Paper>
        <Box
          sx={{
            flex: 1,
            minWidth: 0,
            position: 'relative',
            overflow: 'hidden',
            borderRadius: { md: 2 },
            display: mobile && view === 'form' ? 'none' : 'block',
          }}
        >
          <MapView>
            <RouteMap
              visible={!mobile || view === 'map'}
              origin={selected?.position || target}
              destination={target}
              result={result}
              onPoint={onPoint}
            />
            <MapMarkers
              markers={rows.map((row) => ({
                ...row.position,
                id: row.device.id,
                title: row.device.name,
              }))}
              onClick={(item) => choose(item.id)}
            />
          </MapView>
          <Paper
            elevation={1}
            sx={{
              position: 'absolute',
              top: 12,
              left: 12,
              maxWidth: 'calc(100% - 70px)',
              px: 1.5,
              py: 1,
              borderRadius: 2,
            }}
          >
            <Typography variant="body2">{t('nearestMapHelp')}</Typography>
          </Paper>
        </Box>
      </Box>
    </Box>
  );
};
export default NearestUnits;
