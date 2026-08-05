import { useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import { Link, Stack, Table, TableBody, TableCell, TableHead, TableRow } from '@mui/material';
import ReportFilter from './components/ReportFilter';
import { useTranslation } from '../common/components/LocalizationProvider';
import PageLayout from '../common/components/PageLayout';
import ReportsMenu from './components/ReportsMenu';
import ResizeHandle from './components/ResizeHandle';
import { useCatchCallback } from '../reactHelper';
import MapView from '../map/core/MapView';
import useReportStyles from './common/useReportStyles';
import TableShimmer from '../common/components/TableShimmer';
import MapCamera from '../map/MapCamera';
import MapGeofence from '../map/MapGeofence';
import { formatTime } from '../common/util/formatter';
import { prefixString } from '../common/util/stringUtils';
import MapMarkers from '../map/MapMarkers';
import MapRouteCoordinates from '../map/MapRouteCoordinates';
import MapScale from '../map/MapScale';
import fetchOrThrow from '../common/util/fetchOrThrow';
import { deviceEquality } from '../common/util/deviceEquality';

const CombinedReportPage = () => {
  const { classes } = useReportStyles();
  const t = useTranslation();

  const devices = useSelector(
    (state) => state.devices.items,
    deviceEquality(['id', 'name', 'uniqueId']),
  );

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);

  const itemsCoordinates = useMemo(() => items.flatMap((item) => item.route), [items]);

  const findPosition = (item, event) =>
    item.positions.find((position) => event.positionId === position.id);

  const findMedia = (item, event) => {
    const position = findPosition(item, event);
    if (event.type === 'media') {
      return event.attributes?.file ? [event.attributes.file] : [];
    }
    const alarmLabel = position?.attributes.alarmLabel;
    if (!alarmLabel) {
      return [];
    }
    return item.events
      .filter((candidate) => candidate.type === 'media' && candidate.attributes?.file)
      .filter((candidate) => {
        const mediaPosition = findPosition(item, candidate);
        return String(mediaPosition?.attributes.instructionId) === String(alarmLabel);
      })
      .map((candidate) => candidate.attributes.file);
  };

  const createMarkers = () =>
    items
      .flatMap((item) =>
        item.events
          .map((event) => ({ event, position: findPosition(item, event) }))
          .filter(({ position }) => position != null)
          .map(({ event, position }) => ({
            latitude: position.latitude,
            longitude: position.longitude,
            image:
              event.type === 'alarm' && event.attributes?.alarm === 'overspeed'
                ? 'car-error'
                : event.type === 'alarm'
                  ? 'default-error'
                  : event.type === 'media'
                    ? 'default-info'
                    : 'default-neutral',
          })),
      )
      .sort(
        (first, second) =>
          Number(first.image.endsWith('-error')) - Number(second.image.endsWith('-error')),
      );

  const formatEvent = (event) => {
    const eventName = t(prefixString('event', event.type));
    if (event.type === 'alarm' && event.attributes?.alarm) {
      return `${eventName}: ${t(prefixString('alarm', event.attributes.alarm))}`;
    }
    return eventName;
  };

  const onShow = useCatchCallback(async ({ deviceIds, groupIds, from, to }) => {
    const query = new URLSearchParams({ from, to });
    deviceIds.forEach((deviceId) => query.append('deviceId', deviceId));
    groupIds.forEach((groupId) => query.append('groupId', groupId));
    setLoading(true);
    try {
      const response = await fetchOrThrow(`/api/reports/combined?${query.toString()}`);
      setItems(await response.json());
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <PageLayout menu={<ReportsMenu />} breadcrumbs={['reportTitle', 'reportCombined']}>
      <div className={classes.container}>
        {Boolean(items.length) && (
          <>
            <div className={classes.containerMap}>
              <MapView>
                <MapGeofence />
                {items.map((item) => (
                  <MapRouteCoordinates
                    key={item.deviceId}
                    name={devices[item.deviceId].name}
                    coordinates={item.route}
                    deviceId={item.deviceId}
                  />
                ))}
                <MapMarkers markers={createMarkers()} />
              </MapView>
              <MapScale />
              <MapCamera coordinates={itemsCoordinates} />
            </div>
            <ResizeHandle />
          </>
        )}
        <div className={classes.containerMain}>
          <div className={classes.header}>
            <ReportFilter onShow={onShow} deviceType="multiple" loading={loading} />
          </div>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>{t('sharedDevice')}</TableCell>
                <TableCell>{t('positionFixTime')}</TableCell>
                <TableCell>{t('sharedType')}</TableCell>
                <TableCell>{t('eventMedia')}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {!loading ? (
                items.flatMap((item) =>
                  item.events.map((event, index) => {
                    const media = findMedia(item, event);
                    return (
                      <TableRow key={event.id}>
                        <TableCell>{index ? '' : devices[item.deviceId].name}</TableCell>
                        <TableCell>{formatTime(event.eventTime, 'seconds')}</TableCell>
                        <TableCell>{formatEvent(event)}</TableCell>
                        <TableCell>
                          <Stack spacing={0.5}>
                            {media.map((file) => (
                              <Link
                                key={file}
                                href={`/api/media/${devices[item.deviceId].uniqueId}/${file}`}
                                target="_blank"
                              >
                                {file.toLowerCase().match(/\.(mp4|webm|mov|avi)$/)
                                  ? t('positionVideo')
                                  : t('positionImage')}
                              </Link>
                            ))}
                          </Stack>
                        </TableCell>
                      </TableRow>
                    );
                  }),
                )
              ) : (
                <TableShimmer columns={4} />
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </PageLayout>
  );
};

export default CombinedReportPage;
