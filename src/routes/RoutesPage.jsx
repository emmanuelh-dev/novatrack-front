import { useCallback, useEffect, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  Alert,
  Autocomplete,
  Avatar,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  List,
  ListItemAvatar,
  ListItemButton,
  ListItemText,
  MenuItem,
  Paper,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import dayjs from 'dayjs';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import CloseIcon from '@mui/icons-material/Close';
import BottomMenu from '../common/components/BottomMenu';
import { useTranslation } from '../common/components/LocalizationProvider';
import { useRestriction } from '../common/util/permissions';
import { useAttributePreference } from '../common/util/preferences';
import { formatDistance, formatNumericHours, formatTime } from '../common/util/formatter';
import MapView from '../map/core/MapView';
import MapGeofence from '../map/MapGeofence';
import GeofenceReportPage from '../reports/GeofenceReportPage';
import RouteMap from './RouteMap';
import RoutePlanner from './RoutePlanner';
import RoutesHeader from './RoutesHeader';
import TollPanel from './TollPanel';
import NearestUnits from './NearestUnits';
import PlaceDraw from './PlaceDraw';
import PlacesPanel, { placeArea, placePoint, placeIcons } from './PlacesPanel';
import { geofencesActions } from '../store';
import { routeRequest } from './routePlan';
import { tripVisits } from './tripMetrics';

const newTrip = () => ({
  name: '',
  originId: null,
  destinationId: null,
  deviceId: null,
  stopIds: [],
  departureMode: 'manual',
  departureTime: dayjs().format('YYYY-MM-DDTHH:mm'),
  profile: 'car',
  dwellSeconds: 120,
  truck: { height: '', width: '', length: '', weight: '', axleload: '' },
});
const errors = {
  UNIT_BUSY: 'tripUnitBusy',
  INVALID_TRANSITION: 'tripTransitionError',
  INVALID_PLACE: 'placeInvalid',
  INVALID_UNIT: 'tripInvalid',
  INVALID_TRIP: 'tripInvalid',
  PLACE_TOO_COMPLEX: 'placeComplex',
  NO_ROUTE: 'routingNoRoute',
  ROUTING_DISABLED: 'routingDisabled',
  PROVIDER_UNAVAILABLE: 'routingUnavailable',
};
const RoutesPage = () => {
  const t = useTranslation();
  const dispatch = useDispatch();
  const theme = useTheme();
  const mobile = useMediaQuery(theme.breakpoints.down('md'));
  const readonly = useRestriction('readonly');
  const enabled = useSelector((state) => state.session.server.routingEnabled);
  const devices = useSelector((state) => state.devices.items);
  const distanceUnit = useAttributePreference('distanceUnit', 'km');
  const [tab, setTab] = useState('calculator');
  const [view, setView] = useState('form');
  const [orders, setOrders] = useState([]);
  const [places, setPlaces] = useState([]);
  const [draft, setDraft] = useState(null);
  const [place, setPlace] = useState(null);
  const [preview, setPreview] = useState(null);
  const [tollMap, setTollMap] = useState(null);
  const [visits, setVisits] = useState(null);
  const [selected, setSelected] = useState(null);
  const [progress, setProgress] = useState(null);
  const [listing, setListing] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [notice, setNotice] = useState('');
  const [confirmation, setConfirmation] = useState(null);
  const [refresh, setRefresh] = useState(0);
  const requestsRef = useRef(new Set());
  const update = (items, item) => [...items.filter((value) => value.id !== item.id), item];
  const call = useCallback(async (url, options = {}, signal) => {
    const controller = new AbortController();
    requestsRef.current.add(controller);
    try {
      const response = await fetch(url, { ...options, signal: signal || controller.signal });
      const data = response.status === 204 ? null : await response.json();
      if (!response.ok) throw new Error(errors[data?.code] || 'tripRequestError');
      return data;
    } finally {
      requestsRef.current.delete(controller);
    }
  }, []);
  useEffect(() => {
    let mounted = true;
    Promise.all([call('/api/orders'), call('/api/geofences')])
      .then(([items, zones]) => {
        if (mounted) {
          setOrders(items.filter((item) => item.attributes?.routeTrip?.version === 1));
          setPlaces(zones);
        }
      })
      .catch((e) => {
        if (mounted) setLoadError(e.message);
      })
      .finally(() => {
        if (mounted) setListing(false);
      });
    const pending = requestsRef.current;
    return () => {
      mounted = false;
      pending.forEach((controller) => controller.abort());
    };
  }, [call]);
  useEffect(() => {
    setProgress(null);
    if (!selected || tab !== 'trips') return undefined;
    const controller = new AbortController();
    let polling = false;
    const load = async () => {
      if (polling) return;
      polling = true;
      try {
        const data = await call(`/api/orders/${selected.id}/progress`, {}, controller.signal);
        if (!controller.signal.aborted) {
          setProgress(data);
          setOrders((items) =>
            items.map((item) =>
              item.id === selected.id
                ? { ...item, attributes: { ...item.attributes, routeTrip: data.trip } }
                : item,
            ),
          );
          setError('');
        }
      } catch (e) {
        if (!controller.signal.aborted) {
          setProgress(null);
          setError(e.message);
        }
      } finally {
        polling = false;
      }
    };
    load();
    // ponytail: one selected trip polls; batch cached progress if many simultaneous operators require it.
    const interval = setInterval(load, 30000);
    return () => {
      controller.abort();
      clearInterval(interval);
    };
  }, [selected, tab, refresh, call]);
  const mutate = async (operation, write = true) => {
    if ((write && readonly) || busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await operation();
    } catch (e) {
      if (e.name !== 'AbortError') setError(e.message || 'tripRequestError');
    } finally {
      setBusy(false);
    }
  };
  const post = (body) => ({
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const status = (action) =>
    mutate(async () => {
      setConfirmation(null);
      const saved = await call(`/api/orders/${selected.id}/status`, post({ action }));
      setOrders((items) => update(items, saved));
      setSelected(saved);
    });
  const savedPlaces = places.filter(placePoint);
  const origin = savedPlaces.find((item) => item.id === draft?.originId);
  const destination = savedPlaces.find((item) => item.id === draft?.destinationId);
  const stops = (draft?.stopIds || []).map((id) => savedPlaces.find((item) => item.id === id));
  const valid =
    draft &&
    routeRequest({
      ...draft,
      origin: placePoint(origin),
      destination: placePoint(destination),
      waypoints: stops.map(placePoint),
    });
  const trip = progress?.trip || selected?.attributes.routeTrip;
  const stopVisits = trip
    ? tripVisits({ attributes: { ...selected?.attributes, routeTrip: trip } })
    : [];
  const current = progress?.remaining;
  const nextPlace = trip?.stops?.find((stop) => !stop.arrivedTime)?.place || trip?.destination;
  const next =
    progress?.next || (!(trip?.stops || []).some((stop) => !stop.arrivedTime) ? current : null);
  const tollPlan = draft
    ? {
        ...draft,
        origin: placePoint(origin),
        destination: placePoint(destination),
        waypoints: stops.map(placePoint),
      }
    : trip?.request;
  const tollKey = JSON.stringify([draft ? 'draft' : selected?.id, tollPlan]);
  const tollRoute = tab === 'trips' && tollMap?.key === tollKey ? tollMap.route : null;
  const tollControl = tollPlan && (
    <TollPanel
      key={tollKey}
      plan={tollPlan}
      showing={Boolean(tollRoute)}
      onRoute={(route) => {
        setTollMap({ key: tollKey, route });
        if (route && mobile) setView('map');
      }}
    />
  );
  const previewKey = JSON.stringify(valid || (trip?.status === 'planned' ? trip.request : null));
  useEffect(() => {
    setPreview(null);
  }, [previewKey]);
  const calculate = () =>
    mutate(async () => {
      setPreview(null);
      const result = await call('/api/routing', post(JSON.parse(previewKey)));
      setPreview(result);
    }, false);
  const previewControl = (
    <Stack spacing={1}>
      <Button disabled={busy || !enabled || previewKey === 'null'} onClick={calculate}>
        {t('routingCalculate')}
      </Button>
      {preview && (
        <Box aria-live="polite">
          <Typography>{formatDistance(preview.distance, distanceUnit, t)}</Typography>
          <Typography>{formatNumericHours(preview.duration * 1000, t)}</Typography>
          <Typography>
            {t('routingArrival')}: {formatTime(preview.arrivalTime, 'minutes')}
          </Typography>
          <Typography variant="caption">{t('routingNoTraffic')}</Typography>
        </Box>
      )}
    </Stack>
  );
  const drawing = tab === 'places' && place?.shape === 'polygon' && !readonly && !busy;
  const zoneItems =
    tab === 'places'
      ? placeArea(place || {})
        ? [{ id: place?.item?.id || -1, name: place.name, area: placeArea(place), attributes: {} }]
        : []
      : trip
        ? [trip.origin, ...(trip.stops || []).map((stop) => stop.place), trip.destination].map(
            (item) => ({ ...item, attributes: {} }),
          )
        : [];
  const onPoint = useCallback(
    (point) => {
      if (tab === 'places' && !readonly && !busy)
        setPlace((value) => (value ? { ...value, center: point } : value));
    },
    [tab, readonly, busy],
  );
  const savePlace = () =>
    mutate(async () => {
      if (
        place.file &&
        (!['image/png', 'image/jpeg'].includes(place.file.type) || place.file.size > 500000)
      )
        throw new Error('placeImageInvalid');
      const item = {
        ...place.item,
        name: place.name.trim(),
        area: placeArea(place),
        attributes: {
          ...place.item?.attributes,
          routePlace: {
            version: 1,
            address: place.address.trim(),
            ...placePoint({ area: placeArea(place) }),
            icon: place.icon,
            image: Boolean(place.image || place.file),
          },
        },
      };
      const saved = await call(`/api/geofences${place.item ? `/${place.item.id}` : ''}`, {
        ...post(item),
        method: place.item ? 'PUT' : 'POST',
      });
      setPlaces((items) => update(items, saved));
      dispatch(geofencesActions.update([saved]));
      setPlace((value) => ({ ...value, item: saved }));
      if (place.file) {
        try {
          await call(`/api/geofences/${saved.id}/image`, {
            method: 'POST',
            headers: { 'Content-Type': place.file.type },
            body: place.file,
          });
        } catch {
          throw new Error('placeImageRetry');
        }
        setPlace((value) => ({ ...value, file: null }));
      }
      setNotice('placeSavedNotice');
    });
  const createTrip = () =>
    mutate(async () => {
      const saved = await call(
        '/api/orders/trips',
        post({ ...draft, departureTime: valid.departureTime, truck: valid.truck }),
      );
      setOrders((items) => update(items, saved));
      setSelected(saved);
      setDraft(null);
      if (draft.departureMode === 'origin') {
        const armed = await call(`/api/orders/${saved.id}/status`, post({ action: 'start' }));
        setOrders((items) => update(items, armed));
        setSelected(armed);
      }
    });
  const navigation = (
    <Tabs
      value={tab}
      onChange={(_, value) => {
        if (!busy) {
          setTab(value);
          setVisits(null);
          setError('');
          setNotice('');
        }
      }}
      aria-label={t('tripTitle')}
      variant="standard"
      sx={{
        mt: 1,
        '& .MuiTabs-list': {
          display: 'grid',
          gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
          gap: 0.5,
        },
        '& .MuiTabs-indicator': { display: 'none' },
        '& .MuiTab-root': {
          minWidth: 0,
          minHeight: 40,
          p: 1,
          borderRadius: 1,
          textTransform: 'none',
        },
        '& .Mui-selected': { bgcolor: 'action.selected', fontWeight: 600 },
      }}
    >
      <Tab value="trips" label={t('tripTab')} />
      <Tab value="places" label={t('placeTab')} />
      <Tab value="calculator" label={t('tripCalculator')} />
      <Tab value="nearest" label={t('nearestTitle')} />
    </Tabs>
  );
  const header = (
    <RoutesHeader navigation={navigation} view={view} onView={mobile ? setView : undefined} />
  );
  if (tab === 'calculator')
    return <RoutePlanner navigation={navigation} places={places} error={loadError} />;
  if (tab === 'nearest')
    return (
      <NearestUnits
        navigation={navigation}
        places={places}
        loading={listing}
        error={error || loadError}
      />
    );
  return (
    <Box
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        minWidth: 0,
      }}
    >
      {mobile && header}
      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
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
            '@media print': { display: 'none' },
          }}
        >
          {!mobile && header}
          <Stack spacing={2} sx={{ flex: 1, minHeight: 0, overflowY: 'auto', p: 2.5 }}>
            {(error || loadError) && <Alert severity="error">{t(error || loadError)}</Alert>}
            {notice && <Alert severity="success">{t(notice)}</Alert>}
            {listing && <Typography role="status">{t('sharedLoading')}</Typography>}
            {tab === 'places' ? (
              <PlacesPanel
                items={places}
                draft={place}
                setDraft={(value) => {
                  setPlace(value);
                  setVisits(null);
                  setNotice('');
                }}
                readonly={readonly}
                busy={busy}
                onSave={savePlace}
                onVisits={(item) => {
                  setVisits(item);
                  setView('map');
                }}
                onMap={() => {
                  setView('map');
                }}
              />
            ) : (
              <>
                {!enabled && <Alert severity="info">{t('routingDisabled')}</Alert>}
                {!readonly && (
                  <Button
                    disabled={busy || listing}
                    onClick={() => {
                      setDraft(newTrip());
                      setSelected(null);
                      setError('');
                    }}
                  >
                    {t('tripNew')}
                  </Button>
                )}
                {draft ? (
                  <Stack
                    spacing={2}
                    component="form"
                    onSubmit={(event) => {
                      event.preventDefault();
                      if (
                        valid &&
                        draft.deviceId &&
                        draft.name.trim() &&
                        draft.originId !== draft.destinationId &&
                        draft.dwellSeconds >= 30 &&
                        draft.dwellSeconds <= 3600
                      )
                        createTrip();
                    }}
                  >
                    <TextField
                      label={t('tripName')}
                      value={draft.name}
                      disabled={busy}
                      required
                      slotProps={{ htmlInput: { maxLength: 128 } }}
                      onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                    />
                    {['originId', ...draft.stopIds.map((_, index) => index), 'destinationId'].map(
                      (key) => (
                        <Stack key={key} spacing={0.5}>
                          <Autocomplete
                            options={savedPlaces}
                            getOptionLabel={(item) => item.name}
                            value={
                              savedPlaces.find(
                                (item) =>
                                  item.id ===
                                  (typeof key === 'number' ? draft.stopIds[key] : draft[key]),
                              ) || null
                            }
                            disabled={busy}
                            onChange={(_, item) =>
                              setDraft({
                                ...draft,
                                ...(typeof key === 'number'
                                  ? {
                                      stopIds: draft.stopIds.map((id, index) =>
                                        index === key ? item?.id || null : id,
                                      ),
                                    }
                                  : { [key]: item?.id || null }),
                              })
                            }
                            renderOption={(props, item) => {
                              const Icon =
                                placeIcons[item.attributes?.routePlace?.icon] || placeIcons.place;
                              return (
                                <li key={item.id} {...props}>
                                  <Avatar
                                    sx={{ width: 24, height: 24, mr: 1 }}
                                    src={
                                      item.attributes?.routePlace?.image
                                        ? `/api/geofences/${item.id}/image`
                                        : undefined
                                    }
                                  >
                                    <Icon fontSize="small" />
                                  </Avatar>
                                  {item.name}
                                </li>
                              );
                            }}
                            renderInput={(params) => (
                              <TextField
                                {...params}
                                label={
                                  typeof key === 'number'
                                    ? `${t('tripStop')} ${key + 1}`
                                    : t(key === 'originId' ? 'routingOrigin' : 'routingDestination')
                                }
                                required
                              />
                            )}
                          />
                          {typeof key === 'number' && (
                            <Stack direction="row" justifyContent="flex-end">
                              {[-1, 1].map((direction) => (
                                <IconButton
                                  key={direction}
                                  size="small"
                                  disabled={
                                    busy ||
                                    key + direction < 0 ||
                                    key + direction >= draft.stopIds.length
                                  }
                                  aria-label={`${t(direction === -1 ? 'tripStopUp' : 'tripStopDown')} ${key + 1}`}
                                  onClick={() => {
                                    const stopIds = [...draft.stopIds];
                                    [stopIds[key], stopIds[key + direction]] = [
                                      stopIds[key + direction],
                                      stopIds[key],
                                    ];
                                    setDraft({ ...draft, stopIds });
                                  }}
                                >
                                  {direction === -1 ? (
                                    <ArrowUpwardIcon fontSize="small" />
                                  ) : (
                                    <ArrowDownwardIcon fontSize="small" />
                                  )}
                                </IconButton>
                              ))}
                              <IconButton
                                size="small"
                                disabled={busy}
                                aria-label={`${t('tripStopRemove')} ${key + 1}`}
                                onClick={() =>
                                  setDraft({
                                    ...draft,
                                    stopIds: draft.stopIds.filter((_, index) => index !== key),
                                  })
                                }
                              >
                                <CloseIcon fontSize="small" />
                              </IconButton>
                            </Stack>
                          )}
                        </Stack>
                      ),
                    )}
                    <Button
                      disabled={busy || draft.stopIds.length >= 10}
                      onClick={() => setDraft({ ...draft, stopIds: [...draft.stopIds, null] })}
                    >
                      {t('tripStopAdd')}
                    </Button>
                    {draft.stopIds.length > 0 && (
                      <Typography variant="caption" color="text.secondary">
                        {t('tripStopsHelp')}
                      </Typography>
                    )}
                    <Button disabled={busy} onClick={() => setTab('places')}>
                      {t('tripManagePlaces')}
                    </Button>
                    <Autocomplete
                      options={Object.values(devices)}
                      getOptionLabel={(item) => item.name}
                      value={devices[draft.deviceId] || null}
                      disabled={busy}
                      onChange={(_, item) => setDraft({ ...draft, deviceId: item?.id || null })}
                      renderInput={(params) => (
                        <TextField {...params} label={t('tripUnit')} required />
                      )}
                    />
                    <TextField
                      select
                      label={t('routingVehicle')}
                      value={draft.profile}
                      disabled={busy}
                      onChange={(event) => setDraft({ ...draft, profile: event.target.value })}
                    >
                      <MenuItem value="car">{t('routingCar')}</MenuItem>
                      <MenuItem value="truck">{t('routingTruck')}</MenuItem>
                    </TextField>
                    {draft.profile === 'truck' && (
                      <>
                        <Typography variant="caption">{t('routingTruckHelp')}</Typography>
                        {Object.keys(draft.truck).map((key) => (
                          <TextField
                            key={key}
                            type="number"
                            label={t(`routingTruck${key}`)}
                            value={draft.truck[key]}
                            disabled={busy}
                            onChange={(event) =>
                              setDraft({
                                ...draft,
                                truck: { ...draft.truck, [key]: event.target.value },
                              })
                            }
                            slotProps={{
                              htmlInput: {
                                step: 'any',
                                min: 0.1,
                                max: { height: 10, width: 10, length: 100 }[key] || 1000,
                              },
                            }}
                          />
                        ))}
                      </>
                    )}
                    <TextField
                      select
                      label={t('tripDepartureMode')}
                      value={draft.departureMode}
                      disabled={busy}
                      onChange={(event) =>
                        setDraft({ ...draft, departureMode: event.target.value })
                      }
                      helperText={t(
                        draft.departureMode === 'origin'
                          ? 'tripDepartureAutoHelp'
                          : 'tripDepartureManualHelp',
                      )}
                    >
                      <MenuItem value="manual">{t('tripDepartureManual')}</MenuItem>
                      <MenuItem value="origin">{t('tripDepartureAuto')}</MenuItem>
                    </TextField>
                    <TextField
                      type="datetime-local"
                      label={t('routingDeparture')}
                      helperText={t('tripDeparturePlanHelp')}
                      value={draft.departureTime}
                      required
                      disabled={busy}
                      onChange={(event) =>
                        setDraft({ ...draft, departureTime: event.target.value })
                      }
                      slotProps={{ inputLabel: { shrink: true } }}
                    />
                    <TextField
                      type="number"
                      label={t('tripDwell')}
                      value={draft.dwellSeconds}
                      disabled={busy}
                      onChange={(event) =>
                        setDraft({ ...draft, dwellSeconds: Number(event.target.value) })
                      }
                      slotProps={{ htmlInput: { min: 30, max: 3600 } }}
                      helperText={t('tripDwellHelp')}
                    />
                    {previewControl}
                    {tollControl}
                    <Button
                      variant="contained"
                      type="submit"
                      disabled={
                        busy ||
                        !enabled ||
                        !valid ||
                        !draft.deviceId ||
                        !draft.name.trim() ||
                        draft.originId === draft.destinationId ||
                        draft.dwellSeconds < 30 ||
                        draft.dwellSeconds > 3600
                      }
                    >
                      {t('tripCreate')}
                    </Button>
                    <Button disabled={busy} onClick={() => setDraft(null)}>
                      {t('sharedCancel')}
                    </Button>
                  </Stack>
                ) : selected && trip ? (
                  <>
                    <Button
                      disabled={busy}
                      onClick={() => {
                        setSelected(null);
                        setProgress(null);
                      }}
                    >
                      {t('tripAll')}
                    </Button>
                    <Typography variant="h6" component="h2">
                      {selected.description}
                    </Typography>
                    <Chip label={t(`tripStatus${trip.status}`)} sx={{ alignSelf: 'flex-start' }} />
                    <Typography>
                      {devices[trip.deviceId]?.name || t('tripUnitUnavailable')}
                    </Typography>
                    <Typography>
                      {trip.origin.name} → {trip.destination.name}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {trip.destination.address}
                    </Typography>
                    <Typography variant="subtitle2">{t('tripVisitTitle')}</Typography>
                    {stopVisits.map((visit) => (
                      <Box key={visit.index} component="section" aria-label={visit.place?.name}>
                        <Typography variant="body2">
                          {visit.destination
                            ? t('routingDestination')
                            : `${t('tripStop')} ${visit.index + 1}`}
                          : {visit.place?.name}
                        </Typography>
                        <Typography
                          variant="caption"
                          color={visit.state === 'incomplete' ? 'warning.main' : 'text.secondary'}
                        >
                          {t(`tripVisitState${visit.state}`)}
                        </Typography>
                        {visit.arrival !== null && (
                          <>
                            {[
                              ['triparrivedTime', visit.arrival],
                              ['tripVisitDeparture', visit.departure],
                            ].map(([key, value]) => (
                              <Stack
                                key={key}
                                direction="row"
                                justifyContent="space-between"
                                spacing={1}
                              >
                                <Typography variant="caption" color="text.secondary">
                                  {t(key)}
                                </Typography>
                                <Typography variant="caption">
                                  {value === null
                                    ? '—'
                                    : formatTime(new Date(value).toISOString(), 'minutes')}
                                </Typography>
                              </Stack>
                            ))}
                            <Stack direction="row" justifyContent="space-between" spacing={1}>
                              <Typography variant="caption" color="text.secondary">
                                {t('tripVisitDuration')}
                              </Typography>
                              <Typography variant="caption">
                                {visit.duration === null
                                  ? '—'
                                  : formatNumericHours(visit.duration, t)}
                              </Typography>
                            </Stack>
                            {['inside', 'incomplete'].includes(visit.state) &&
                              visit.lastInside !== null && (
                                <Typography variant="caption" color="text.secondary">
                                  {t('tripVisitObservedUntil')}:{' '}
                                  {formatTime(new Date(visit.lastInside).toISOString(), 'minutes')}
                                </Typography>
                              )}
                          </>
                        )}
                      </Box>
                    ))}
                    <Typography variant="caption" color="text.secondary">
                      {t('tripVisitHelp')}
                    </Typography>
                    {trip.status === 'ready' && (
                      <Alert severity="info">
                        {t(
                          trip.originSeenTime
                            ? 'tripDepartureWaitingExit'
                            : 'tripDepartureWaitingOrigin',
                        )}
                      </Alert>
                    )}
                    <Typography variant="subtitle2">{t('tripInitialPlan')}</Typography>
                    <Typography>
                      {formatDistance(trip.plannedDistance, distanceUnit, t)} ·{' '}
                      {formatNumericHours(trip.plannedDuration * 1000, t)}
                    </Typography>
                    <Typography variant="body2">
                      {t('routingDeparture')}: {formatTime(trip.request.departureTime, 'minutes')}
                    </Typography>
                    <Typography variant="body2">
                      {t('routingArrival')}: {formatTime(trip.plannedArrival, 'minutes')}
                    </Typography>
                    {trip.status === 'planned' && previewControl}
                    {tollControl}
                    <Typography variant="subtitle2">{t('tripCurrentProgress')}</Typography>
                    {progress?.position?.fixTime && (
                      <Typography variant="caption">
                        {t('routingFixTime')}: {formatTime(progress.position.fixTime, 'seconds')}
                      </Typography>
                    )}
                    {progress?.stale && <Alert severity="warning">{t('tripStale')}</Alert>}
                    {progress?.routingError && (
                      <Alert severity="warning">{t('routingUnavailable')}</Alert>
                    )}
                    {trip.status === 'active' && nextPlace && (
                      <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                        {devices[trip.deviceId]?.name || t('tripUnitUnavailable')} →{' '}
                        {nextPlace.name}
                      </Typography>
                    )}
                    {next && (
                      <Box aria-live="polite">
                        <Typography>{t('tripNextArrival')}</Typography>
                        <Typography variant="h5">
                          {formatNumericHours(next.duration * 1000, t)} ·{' '}
                          {formatDistance(next.distance, distanceUnit, t)}
                        </Typography>
                        <Typography>
                          {t('routingArrival')}: {formatTime(next.arrivalTime, 'minutes')}
                        </Typography>
                        {next.distance === 0 && (
                          <Typography variant="body2">{t('tripDwellWaiting')}</Typography>
                        )}
                        <Typography variant="caption">{t('routingNoTraffic')}</Typography>
                      </Box>
                    )}
                    {current && nextPlace?.id !== trip.destination.id && (
                      <Box aria-live="polite">
                        <Typography>
                          {t('routingDestination')}: {trip.destination.name}
                        </Typography>
                        <Typography variant="h5">
                          {formatDistance(current.distance, distanceUnit, t)}
                        </Typography>
                        <Typography>{formatNumericHours(current.duration * 1000, t)}</Typography>
                        <Typography>
                          {t('routingArrival')}: {formatTime(current.arrivalTime, 'minutes')}
                        </Typography>
                        <Typography variant="caption">{t('routingNoTraffic')}</Typography>
                      </Box>
                    )}
                    {['startedTime', 'arrivedTime', 'completedTime', 'cancelledTime']
                      .filter((key) => trip[key])
                      .map((key) => (
                        <Typography key={key} variant="body2">
                          {t(`trip${key}`)}: {formatTime(trip[key], 'minutes')}
                        </Typography>
                      ))}
                    <Button disabled={busy} onClick={() => setRefresh((value) => value + 1)}>
                      {t('tripRefresh')}
                    </Button>
                    {!readonly && trip.status === 'planned' && (
                      <Button variant="contained" disabled={busy} onClick={() => status('start')}>
                        {t(trip.departureMode === 'origin' ? 'tripDepartureArm' : 'tripStart')}
                      </Button>
                    )}
                    {!readonly && trip.status === 'arrived' && (
                      <Button
                        variant="contained"
                        disabled={busy}
                        onClick={() => setConfirmation('complete')}
                      >
                        {t('tripComplete')}
                      </Button>
                    )}
                    {!readonly &&
                      ['planned', 'ready', 'active', 'arrived'].includes(trip.status) && (
                        <Button
                          color="error"
                          disabled={busy}
                          onClick={() => setConfirmation('cancel')}
                        >
                          {t('tripCancel')}
                        </Button>
                      )}
                  </>
                ) : (
                  <>
                    {!listing && !orders.length && (
                      <Typography color="text.secondary">{t('tripEmpty')}</Typography>
                    )}
                    <List disablePadding>
                      {orders
                        .slice()
                        .sort((a, b) => b.id - a.id)
                        .map((item) => (
                          <ListItemButton
                            key={item.id}
                            onClick={() => {
                              setSelected(item);
                              setError('');
                            }}
                            sx={{ borderRadius: 2, mb: 0.5 }}
                          >
                            <ListItemAvatar>
                              <Avatar>
                                {item.attributes.routeTrip.status === 'active' ? '→' : 'A'}
                              </Avatar>
                            </ListItemAvatar>
                            <ListItemText
                              primary={item.description}
                              secondary={`${item.attributes.routeTrip.destination.name} · ${t(`tripStatus${item.attributes.routeTrip.status}`)}`}
                            />
                          </ListItemButton>
                        ))}
                    </List>
                  </>
                )}
              </>
            )}
          </Stack>
          {!mobile && (
            <Box sx={{ flexShrink: 0 }}>
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
          {visits && tab === 'places' ? (
            <Box sx={{ height: '100%', overflow: 'auto', bgcolor: 'background.paper', p: 2 }}>
              <Stack direction="row" alignItems="center" justifyContent="space-between">
                <Typography variant="h6" component="h2">
                  {t('placeVisits')}: {visits.name}
                </Typography>
                <Button
                  onClick={() => {
                    setVisits(null);
                    setView('form');
                  }}
                >
                  {t('placeBackMap')}
                </Button>
              </Stack>
              <GeofenceReportPage key={visits.id} embedded selectedGeofenceId={visits.id} />
            </Box>
          ) : (
            <MapView>
              <RouteMap
                visible={!mobile || view === 'map'}
                cameraPoint={
                  tab === 'places'
                    ? place?.shape === 'polygon' && place.area && !readonly
                      ? null
                      : place?.addressPoint ||
                        place?.center ||
                        placePoint({ area: placeArea(place || {}) })
                    : undefined
                }
                addressPoint={tab === 'places' ? place?.addressPoint : null}
                origin={
                  tab === 'places'
                    ? placePoint({ area: placeArea(place || {}) })
                    : trip?.origin.point || placePoint(origin)
                }
                destination={
                  tab === 'trips' ? trip?.destination.point || placePoint(destination) : null
                }
                waypoints={
                  tab === 'trips'
                    ? (
                        trip?.stops ||
                        stops
                          .filter(Boolean)
                          .map((item) => ({ place: { ...item, point: placePoint(item) } }))
                      ).map((stop) => ({
                        ...stop.place.point,
                        label: stop.place.name,
                      }))
                    : []
                }
                position={tab === 'trips' && !tollRoute ? progress?.position : null}
                result={
                  tollRoute || current || (draft || trip?.status === 'planned' ? preview : null)
                }
                onPoint={
                  tab === 'places' && place && !drawing && !readonly && !busy ? onPoint : undefined
                }
              />
              {!drawing && <MapGeofence items={zoneItems} />}
              {drawing && (
                <PlaceDraw
                  key={place?.item?.id || 'new'}
                  area={place.area}
                  onChange={(area) => setPlace((value) => ({ ...value, area }))}
                />
              )}
            </MapView>
          )}
          {tollRoute && (
            <Paper
              sx={{
                position: 'absolute',
                top: 12,
                left: 12,
                p: 1.5,
                borderRadius: 2,
                maxWidth: 'calc(100% - 70px)',
              }}
            >
              <Typography variant="subtitle2">{t('tollsMapTitle')}</Typography>
              <Typography variant="h6">{tollRoute.tollTotal}</Typography>
              <Typography variant="body2">
                {formatDistance(tollRoute.distance, distanceUnit, t)} ·{' '}
                {formatNumericHours(tollRoute.duration * 1000, t)}
              </Typography>
              <Typography variant="caption" display="block">
                {tollRoute.attribution}
              </Typography>
              <Button size="small" onClick={() => setTollMap(null)}>
                {t('tollsBackRoute')}
              </Button>
            </Paper>
          )}
          {tab === 'places' && place && !visits && (
            <Paper
              sx={{
                position: 'absolute',
                left: 12,
                bottom: 40,
                p: 1.5,
                maxWidth: 'calc(100% - 24px)',
                borderRadius: 2,
              }}
            >
              <Typography variant="body2">
                {t(
                  readonly
                    ? 'placeHelp'
                    : place.shape === 'polygon'
                      ? place.area
                        ? 'placeZoneReady'
                        : 'placePolygonHelp'
                      : 'placeCircleHelp',
                )}
              </Typography>
              {mobile && <Button onClick={() => setView('form')}>{t('routingForm')}</Button>}
            </Paper>
          )}
        </Box>
      </Box>
      <Dialog open={Boolean(confirmation)} onClose={() => !busy && setConfirmation(null)}>
        <DialogTitle>{t(confirmation === 'complete' ? 'tripComplete' : 'tripCancel')}</DialogTitle>
        <DialogContent>
          {t(confirmation === 'complete' ? 'tripCompleteHelp' : 'tripCancelHelp')}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmation(null)}>{t('sharedCancel')}</Button>
          <Button onClick={() => status(confirmation)} disabled={busy}>
            {t('tripConfirm')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};
export default RoutesPage;
