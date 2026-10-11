import { useCallback, useEffect, useRef, useState } from 'react';
import { useSelector } from 'react-redux';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  MenuItem,
  Paper,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import dayjs from 'dayjs';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import CloseIcon from '@mui/icons-material/Close';
import PlaceIcon from '@mui/icons-material/Place';
import BottomMenu from '../common/components/BottomMenu';
import { useTranslation } from '../common/components/LocalizationProvider';
import { useRestriction } from '../common/util/permissions';
import { useAttributePreference } from '../common/util/preferences';
import { formatDistance, formatNumericHours, formatTime } from '../common/util/formatter';
import MapView from '../map/core/MapView';
import RouteMap from './RouteMap';
import RoutesHeader from './RoutesHeader';
import TollPanel from './TollPanel';
import TollPreference from './TollPreference';
import AddressSearch from '../common/components/AddressSearch';
import {
  routePoint,
  routeRequest,
  savedRoute,
  validRouteAlternatives,
  googleMapsRouteUrl,
} from './routePlan';

const emptyPlan = () => ({
  origin: { latitude: '', longitude: '' },
  destination: { latitude: '', longitude: '' },
  waypoints: [],
  profile: 'car',
  departureTime: '',
  truck: { height: '', width: '', length: '', weight: '', axleload: '' },
});
const errorKeys = {
  INVALID_REQUEST: 'routingInvalid',
  ROUTING_DISABLED: 'routingDisabled',
  NO_ROUTE: 'routingNoRoute',
  ROUTE_WARNING: 'routingWarning',
  INVALID_RESPONSE: 'routingUnavailable',
  PROVIDER_UNAVAILABLE: 'routingUnavailable',
};

const RoutePlanner = ({ navigation, places = [], error: placesError }) => {
  const t = useTranslation();
  const theme = useTheme();
  const mobile = useMediaQuery(theme.breakpoints.down('md'));
  const readonly = useRestriction('readonly');
  const enabled = useSelector((state) => state.session.server.routingEnabled);
  const distanceUnit = useAttributePreference('distanceUnit', 'km');
  const [plan, setPlan] = useState(emptyPlan);
  const [name, setName] = useState('');
  const [addresses, setAddresses] = useState({ origin: '', destination: '' });
  const [orders, setOrders] = useState([]);
  const [selected, setSelected] = useState(null);
  const [pick, setPick] = useState('origin');
  const [view, setView] = useState('form');
  const [result, setResult] = useState(null);
  const [alternatives, setAlternatives] = useState([]);
  const [tollRoute, setTollRoute] = useState(null);
  const [tollPreference, setTollPreference] = useState('toll');
  const mapResult = tollRoute || result;
  const arrivalTime = result?.arrivalTime;
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);
  const [listing, setListing] = useState(true);
  const [writing, setWriting] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const pendingRef = useRef(null);
  const mutationRef = useRef(null);
  const valid = routeRequest(plan);
  const [options, setOptions] = useState(false);
  const keys = ['origin', ...plan.waypoints.map((_, index) => index), 'destination'];
  const pointFor = (key) => (typeof key === 'number' ? plan.waypoints[key] : plan[key]);
  const labelFor = (key) =>
    typeof key === 'number'
      ? `${t('tripStop')} ${key + 1}`
      : t(key === 'origin' ? 'routingOrigin' : 'routingDestination');
  const changePoint = (key, point, label = '') => {
    if (typeof key === 'number') {
      change({
        waypoints: plan.waypoints.map((current, index) =>
          index === key ? { ...point, id: current.id, label } : current,
        ),
      });
    } else change({ [key]: point }, { [key]: label });
  };
  const onTollRoute = useCallback((route) => setTollRoute(route), []);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/orders', { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        const items = await response.json();
        if (!controller.signal.aborted)
          setOrders(items.filter((item) => savedRoute(item) && !item.attributes.routeTrip));
      })
      .catch(() => {
        if (!controller.signal.aborted) setError('routingLoadError');
      })
      .finally(() => {
        if (!controller.signal.aborted) setListing(false);
      });
    return () => {
      controller.abort();
      pendingRef.current?.abort();
      mutationRef.current?.abort();
    };
  }, []);

  const invalidate = useCallback(() => {
    pendingRef.current?.abort();
    pendingRef.current = null;
    setResult(null);
    setAlternatives([]);
    setTollRoute(null);
    setLoading(false);
    setError('');
    setNotice('');
  }, []);
  const change = (patch, labels = {}) => {
    invalidate();
    setAddresses((current) => ({
      ...current,
      ...Object.fromEntries(
        ['origin', 'destination']
          .filter((key) => key in patch)
          .map((key) => [key, labels[key] || '']),
      ),
    }));
    setPlan({ ...plan, ...patch });
  };
  const onPoint = useCallback(
    (point) => {
      invalidate();
      setPlan((current) =>
        typeof pick === 'number'
          ? {
              ...current,
              waypoints: current.waypoints.map((value, index) =>
                index === pick ? { ...point, id: value.id, label: '' } : value,
              ),
            }
          : { ...current, [pick]: point },
      );
      setAddresses((current) => ({ ...current, [pick]: '' }));
      if (pick === 'origin') setPick('destination');
    },
    [invalidate, pick],
  );

  const calculate = async (request = valid) => {
    if (!request) {
      setError('routingInvalid');
      return;
    }
    invalidate();
    const controller = new AbortController();
    pendingRef.current = controller;
    setLoading(true);
    try {
      const response = await fetch('/api/routing/alternatives', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...request, preference: tollPreference }),
        signal: controller.signal,
      });
      const data = await response.json();
      if (controller.signal.aborted || pendingRef.current !== controller) return;
      if (!response.ok) {
        setError(errorKeys[data.code] || 'routingUnavailable');
        return;
      }
      if (!validRouteAlternatives(data)) {
        setError('routingUnavailable');
        return;
      }
      setAlternatives(data);
      setResult(data[0]);
      if (mobile) setView('map');
    } catch {
      if (!controller.signal.aborted) setError('routingUnavailable');
    } finally {
      if (pendingRef.current === controller) {
        setLoading(false);
        pendingRef.current = null;
      }
    }
  };

  const open = (order) => {
    invalidate();
    const definition = savedRoute(order);
    setSelected(order || null);
    setName(order?.description || '');
    setAddresses({ origin: order?.fromAddress || '', destination: order?.toAddress || '' });
    setPlan(
      definition
        ? {
            ...emptyPlan(),
            ...definition,
            departureTime: definition.departureTime || '',
            waypoints: (definition.waypoints || []).map((point, index) => ({
              ...point,
              id: crypto.randomUUID(),
              label:
                typeof order.attributes.routePlan.waypointAddresses?.[index] === 'string'
                  ? order.attributes.routePlan.waypointAddresses[index]
                  : '',
            })),
          }
        : emptyPlan(),
    );
    setView('form');
    setPick('origin');
    if (definition && enabled) calculate(definition);
  };
  const persist = async (remove = false) => {
    if (readonly || writing || (!remove && (!valid || !name.trim()))) return;
    const controller = new AbortController();
    mutationRef.current = controller;
    setWriting(true);
    setError('');
    setNotice('');
    setConfirm(false);
    try {
      const order = {
        ...selected,
        uniqueId: selected?.uniqueId || crypto.randomUUID(),
        description: name.trim(),
        fromAddress: addresses.origin || `${valid?.origin.latitude}, ${valid?.origin.longitude}`,
        toAddress:
          addresses.destination ||
          `${valid?.destination.latitude}, ${valid?.destination.longitude}`,
        attributes: {
          ...selected?.attributes,
          routePlan: {
            version: 1,
            ...valid,
            waypointAddresses: plan.waypoints.map((point) => point.label || ''),
          },
        },
      };
      const response = await fetch(`/api/orders${selected ? `/${selected.id}` : ''}`, {
        method: remove ? 'DELETE' : selected ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: remove ? undefined : JSON.stringify(order),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error();
      const saved = remove ? null : await response.json();
      if (controller.signal.aborted) return;
      setOrders((items) =>
        remove
          ? items.filter((item) => item.id !== selected.id)
          : [...items.filter((item) => item.id !== saved.id), saved],
      );
      if (remove) open(null);
      else setSelected(saved);
      setNotice(remove ? 'routingDeleted' : 'routingSaved');
    } catch {
      if (!controller.signal.aborted) setError('routingSaveError');
    } finally {
      if (!controller.signal.aborted) setWriting(false);
      mutationRef.current = null;
    }
  };

  const header = (
    <RoutesHeader navigation={navigation} view={view} onView={mobile ? setView : undefined} />
  );

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
      {mobile && header}
      <Box
        sx={{
          display: 'flex',
          flex: 1,
          minHeight: 0,
          gap: { md: 1.5 },
          p: { md: 1.5 },
        }}
      >
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
          <Stack
            sx={{ flex: 1, minHeight: 0, overflowY: 'auto', p: 2.5 }}
            spacing={2}
            component="form"
            onSubmit={(event) => {
              event.preventDefault();
              calculate();
            }}
          >
            <Typography variant="h6" component="h2">
              {t('routingTitle')}
            </Typography>
            {!enabled && <Alert severity="info">{t('routingDisabled')}</Alert>}
            {placesError && <Alert severity="warning">{t(placesError)}</Alert>}
            {error && <Alert severity="error">{t(error)}</Alert>}
            {notice && <Alert severity="success">{t(notice)}</Alert>}
            <TollPreference
              value={tollPreference}
              onChange={(value) => {
                invalidate();
                setTollPreference(value);
              }}
            />
            <ToggleButtonGroup
              exclusive
              value={plan.profile}
              disabled={writing}
              onChange={(_, profile) => {
                if (profile) change({ profile });
              }}
              aria-label={t('routingVehicle')}
              fullWidth
            >
              <ToggleButton value="car">{t('routingCar')}</ToggleButton>
              <ToggleButton value="truck">{t('routingTruck')}</ToggleButton>
            </ToggleButtonGroup>
            {keys.map((key) => {
              const point = pointFor(key);
              const label = labelFor(key);
              return (
                <Stack key={typeof key === 'number' ? point.id : key} spacing={0.5}>
                  <Stack direction="row" alignItems="center" spacing={0.5}>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <AddressSearch
                        label={label}
                        places={places}
                        value={
                          (typeof key === 'number' ? point.label : addresses[key]) ||
                          (routePoint(point) ? `${point.latitude}, ${point.longitude}` : '')
                        }
                        disabled={writing}
                        onChange={(text) => changePoint(key, { latitude: '', longitude: '' }, text)}
                        onSelect={(item) => changePoint(key, routePoint(item), item.label)}
                      />
                    </Box>
                    <IconButton
                      disabled={writing}
                      aria-label={`${t('routingPick')}: ${label}`}
                      aria-pressed={pick === key}
                      color={pick === key ? 'primary' : 'default'}
                      onClick={() => {
                        setPick(key);
                        if (mobile) setView('map');
                      }}
                    >
                      <PlaceIcon />
                    </IconButton>
                  </Stack>
                  <Stack direction="row" justifyContent="flex-end">
                    {[-1, 1].map((direction) => (
                      <IconButton
                        key={direction}
                        disabled={
                          writing ||
                          keys.indexOf(key) + direction < 0 ||
                          keys.indexOf(key) + direction >= keys.length
                        }
                        aria-label={`${t(direction === -1 ? 'routingPointUp' : 'routingPointDown')}: ${label}`}
                        onClick={() => {
                          const points = keys.map((value) => ({
                            ...pointFor(value),
                            label:
                              typeof value === 'number' ? pointFor(value).label : addresses[value],
                          }));
                          const index = keys.indexOf(key);
                          [points[index], points[index + direction]] = [
                            points[index + direction],
                            points[index],
                          ];
                          setPick('origin');
                          change(
                            {
                              origin: routePoint(points[0]) || { latitude: '', longitude: '' },
                              destination: routePoint(points.at(-1)) || {
                                latitude: '',
                                longitude: '',
                              },
                              waypoints: points.slice(1, -1).map((value) => ({
                                ...value,
                                id: value.id || crypto.randomUUID(),
                              })),
                            },
                            { origin: points[0].label, destination: points.at(-1).label },
                          );
                        }}
                      >
                        {direction === -1 ? (
                          <ArrowUpwardIcon fontSize="small" />
                        ) : (
                          <ArrowDownwardIcon fontSize="small" />
                        )}
                      </IconButton>
                    ))}
                    {typeof key === 'number' && (
                      <IconButton
                        disabled={writing}
                        aria-label={`${t('tripStopRemove')} ${key + 1}`}
                        onClick={() => {
                          setPick('origin');
                          change({ waypoints: plan.waypoints.filter((_, index) => index !== key) });
                        }}
                      >
                        <CloseIcon fontSize="small" />
                      </IconButton>
                    )}
                  </Stack>
                </Stack>
              );
            })}
            <Button
              disabled={writing || plan.waypoints.length >= 10}
              onClick={() =>
                change({
                  waypoints: [
                    ...plan.waypoints,
                    { id: crypto.randomUUID(), latitude: '', longitude: '', label: '' },
                  ],
                })
              }
            >
              {t('tripStopAdd')}
            </Button>
            {plan.profile === 'truck' && (
              <>
                <Typography variant="body2" color="text.secondary">
                  {t('routingTruckHelp')}
                </Typography>
                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
                  {['height', 'width', 'length', 'weight', 'axleload'].map((key) => (
                    <TextField
                      key={key}
                      label={t(`routingTruck${key}`)}
                      type="number"
                      value={plan.truck[key]}
                      disabled={writing}
                      onChange={(event) =>
                        change({ truck: { ...plan.truck, [key]: event.target.value } })
                      }
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
            <Button
              variant="contained"
              type="submit"
              disabled={!enabled || !valid || loading || writing}
            >
              {t(loading ? 'routingCalculating' : 'routingCalculate')}
            </Button>
            {alternatives.length > 0 && (
              <Stack spacing={0.5} role="group" aria-label={t('routingAlternatives')}>
                <Typography variant="subtitle2">{t('routingAlternatives')}</Typography>
                {alternatives.map((route, index) => (
                  <Button
                    key={index}
                    type="button"
                    aria-pressed={route === result}
                    onClick={() => {
                      setTollRoute(null);
                      setResult(route);
                    }}
                    sx={{
                      justifyContent: 'flex-start',
                      textAlign: 'left',
                      px: 1.5,
                      py: 1,
                      bgcolor: route === result ? 'action.selected' : 'transparent',
                    }}
                  >
                    {t('routingAlternative')} {index + 1} ·{' '}
                    {formatNumericHours(route.duration * 1000, t)}
                    {' · '}
                    {formatDistance(route.distance, distanceUnit, t)}
                    {route.tollways &&
                      ` · ${t(
                        route.tollways.some((item) => item.value === 1)
                          ? 'tollsPreferencetoll'
                          : 'tollsPreferencefree',
                      )}`}
                  </Button>
                ))}
              </Stack>
            )}
            {result?.accessPoints?.some((point) => point.distance > 100) && (
              <Alert severity="warning">
                {t('routingRoadEndWarning')}
                {result.accessPoints.map(
                  (point, index) =>
                    point.distance > 100 && (
                      <Typography key={index} variant="body2">
                        {labelFor(
                          index === 0
                            ? 'origin'
                            : index === result.accessPoints.length - 1
                              ? 'destination'
                              : index - 1,
                        )}
                        : {formatDistance(point.distance, distanceUnit, t)}
                      </Typography>
                    ),
                )}
              </Alert>
            )}
            {result && (
              <Box aria-live="polite" sx={{ bgcolor: 'action.hover', p: 2, borderRadius: 2 }}>
                <Typography variant="h6">
                  {formatDistance(mapResult.distance, distanceUnit, t)}
                </Typography>
                <Typography>{formatNumericHours(mapResult.duration * 1000, t)}</Typography>
                {tollRoute && (
                  <Typography variant="subtitle2">
                    {t('tollsTitle')}: {tollRoute.tollTotal}
                  </Typography>
                )}
                <Typography variant="body2">
                  {t('routingArrival')}: {formatTime(arrivalTime, 'minutes')}
                </Typography>
              </Box>
            )}
            <Typography variant="caption" color="text.secondary">
              {t('routingNoTraffic')}
            </Typography>
            {result && googleMapsRouteUrl(plan) && (
              <Box>
                <Button
                  component="a"
                  href={googleMapsRouteUrl(plan)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {t('routingOpenMaps')}
                </Button>
                <Typography variant="caption" display="block" color="text.secondary">
                  {t('routingMapsOwnRoute')}
                </Typography>
              </Box>
            )}
            <TollPanel
              key={JSON.stringify(plan)}
              plan={plan}
              showing={Boolean(tollRoute)}
              calculation={result}
              preserveRoute
              preference={tollPreference}
              onRoute={onTollRoute}
            />
            <Accordion
              expanded={options}
              onChange={(_, expanded) => setOptions(expanded)}
              elevation={0}
              disableGutters
              sx={{ bgcolor: 'action.hover', '&::before': { display: 'none' } }}
            >
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Typography variant="subtitle2">{t('routingOptions')}</Typography>
              </AccordionSummary>
              <AccordionDetails>
                <Stack spacing={2}>
                  <TextField
                    type="datetime-local"
                    label={t('routingDeparture')}
                    value={
                      plan.departureTime.endsWith('Z')
                        ? dayjs(plan.departureTime).format('YYYY-MM-DDTHH:mm')
                        : plan.departureTime
                    }
                    disabled={writing}
                    onChange={(event) => change({ departureTime: event.target.value })}
                    helperText={t('routingDepartureHelp')}
                    slotProps={{ inputLabel: { shrink: true } }}
                  />
                  {keys.map((key) => (
                    <Stack key={typeof key === 'number' ? pointFor(key).id : key} spacing={1}>
                      <Typography variant="subtitle2">{labelFor(key)}</Typography>
                      <Stack direction="row" spacing={1}>
                        {['latitude', 'longitude'].map((axis) => (
                          <TextField
                            key={axis}
                            type="number"
                            label={t(
                              axis === 'latitude' ? 'positionLatitude' : 'positionLongitude',
                            )}
                            value={pointFor(key)[axis]}
                            disabled={writing}
                            onChange={(event) =>
                              changePoint(key, { ...pointFor(key), [axis]: event.target.value })
                            }
                            slotProps={{
                              htmlInput: {
                                step: 'any',
                                min: axis === 'latitude' ? -90 : -180,
                                max: axis === 'latitude' ? 90 : 180,
                              },
                            }}
                          />
                        ))}
                      </Stack>
                    </Stack>
                  ))}
                  <TextField
                    select
                    label={t('routingSavedRoutes')}
                    value={selected?.id || ''}
                    disabled={listing || writing}
                    onChange={(event) =>
                      open(orders.find((order) => order.id === Number(event.target.value)))
                    }
                    helperText={listing ? t('sharedLoading') : undefined}
                  >
                    <MenuItem value="">{t('routingNew')}</MenuItem>
                    {orders.map((order) => (
                      <MenuItem key={order.id} value={order.id}>
                        {order.description}
                      </MenuItem>
                    ))}
                  </TextField>
                  <TextField
                    label={t('sharedName')}
                    value={name}
                    disabled={writing}
                    onChange={(event) => {
                      setName(event.target.value);
                      setNotice('');
                    }}
                    slotProps={{ htmlInput: { maxLength: 128 } }}
                  />
                  {!readonly && (
                    <Stack direction="row" spacing={1}>
                      <Button
                        disabled={!valid || !name.trim() || writing}
                        onClick={() => persist()}
                      >
                        {t('sharedSave')}
                      </Button>
                      {selected && (
                        <Button color="error" disabled={writing} onClick={() => setConfirm(true)}>
                          {t('sharedRemove')}
                        </Button>
                      )}
                    </Stack>
                  )}
                  {readonly && <Typography variant="caption">{t('routingReadonly')}</Typography>}
                </Stack>
              </AccordionDetails>
            </Accordion>
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
              origin={plan.origin}
              destination={plan.destination}
              waypoints={plan.waypoints}
              result={mapResult}
              alternatives={alternatives}
              onAlternative={(route) => {
                setTollRoute(null);
                setResult(route);
              }}
              onPoint={writing ? undefined : onPoint}
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
              pointerEvents: 'none',
            }}
          >
            <Typography variant="body2">
              {tollRoute
                ? t('routingSelectedRoute')
                : `${t('routingMapHint')} ${typeof pick === 'number' ? pick + 1 : pick === 'origin' ? 'A' : 'B'}`}
            </Typography>
          </Paper>
          {mapResult && (
            <Paper
              elevation={1}
              sx={{
                position: 'absolute',
                bottom: 35,
                left: 12,
                p: 1.5,
                borderRadius: 2,
                maxWidth: 'calc(100% - 24px)',
              }}
            >
              {tollRoute && <Typography variant="h6">{tollRoute.tollTotal}</Typography>}
              <Typography variant="subtitle2">
                {formatDistance(mapResult.distance, distanceUnit, t)} ·{' '}
                {formatNumericHours(mapResult.duration * 1000, t)}
              </Typography>
              <Typography variant="caption" sx={{ display: 'block' }}>
                {`${t('routingArrival')}: ${formatTime(arrivalTime, 'minutes')} · `}
                {t('routingNoTraffic')}
              </Typography>
              <Typography variant="caption" sx={{ display: 'block' }}>
                {mapResult.attribution}
              </Typography>
            </Paper>
          )}
        </Box>
      </Box>
      <Dialog open={confirm} onClose={() => setConfirm(false)}>
        <DialogTitle>{t('routingDeleteTitle')}</DialogTitle>
        <DialogContent>{selected?.description}</DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirm(false)}>{t('sharedCancel')}</Button>
          <Button color="error" onClick={() => persist(true)}>
            {t('sharedRemove')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};
export default RoutePlanner;
