import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSelector } from 'react-redux';
import { useSearchParams } from 'react-router-dom';
import {
  Alert,
  Button,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import DownloadIcon from '@mui/icons-material/Download';
import { default as Hls, Events } from 'hls.js/light';
import PageLayout from '../common/components/PageLayout';
import fetchOrThrow from '../common/util/fetchOrThrow';
import ReportsMenu from './components/ReportsMenu';

const TIMEZONE = 'America/Monterrey';

const localDate = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

const formatDate = (value) =>
  new Date(value).toLocaleString('es-MX', {
    timeZone: TIMEZONE,
    dateStyle: 'medium',
    timeStyle: 'medium',
  });

const formatSize = (value) => {
  if (!value) return '—';
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
};

const cameraError = (error, fallback) => {
  const message = error?.message || '';
  return /java\.|at org\.traccar|Failed to send command/i.test(message)
    ? fallback
    : message || fallback;
};

const VideoReportPage = () => {
  const videoRef = useRef(null);
  const pollRef = useRef(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const devices = useSelector((state) => state.devices.items);
  const deviceOptions = useMemo(
    () => Object.values(devices).sort((a, b) => a.name.localeCompare(b.name)),
    [devices],
  );

  const [deviceId, setDeviceId] = useState(Number(searchParams.get('deviceId')) || '');
  const [date, setDate] = useState(localDate);
  const [time, setTime] = useState('16:00');
  const [channel, setChannel] = useState(1);
  const [query, setQuery] = useState(null);
  const [session, setSession] = useState(null);
  const [archives, setArchives] = useState([]);
  const [archivePlayer, setArchivePlayer] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => () => clearInterval(pollRef.current), []);

  const loadArchives = useCallback(
    async (selectedDeviceId = deviceId) => {
      if (!selectedDeviceId) {
        setArchives([]);
        return;
      }
      const response = await fetchOrThrow(
        `/api/stream/history/archive?deviceId=${selectedDeviceId}`,
      );
      setArchives(await response.json());
    },
    [deviceId],
  );

  useEffect(() => {
    loadArchives().catch(() => setArchives([]));
  }, [loadArchives]);

  useEffect(() => {
    const source = archivePlayer
      ? `/api/stream/history/${archivePlayer.id}/archive.m3u8`
      : session?.hlsUrl;
    if (!source || !videoRef.current) return undefined;
    const video = videoRef.current;
    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = source;
      video.play().catch(() => {});
      return () => video.removeAttribute('src');
    }
    const hls = new Hls();
    hls.loadSource(source);
    hls.attachMedia(video);
    hls.on(Events.MANIFEST_PARSED, () => video.play().catch(() => {}));
    return () => hls.destroy();
  }, [session?.hlsUrl, archivePlayer]);

  const waitForQuery = async () => {
    for (let attempt = 0; attempt < 30; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      const response = await fetchOrThrow(`/api/stream/history/intervals?deviceId=${deviceId}`);
      const result = await response.json();
      setQuery(result);
      if (result.state !== 'QUERYING') return result;
    }
    throw new Error('La cámara no respondió a la consulta en 30 segundos.');
  };

  const handleQuery = async () => {
    setLoading(true);
    setError('');
    setQuery(null);
    setSession(null);
    setArchivePlayer(null);
    clearInterval(pollRef.current);
    try {
      setSearchParams({ deviceId: String(deviceId) });
      await fetchOrThrow('/api/stream/history/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId, channel, date, time: `${time}:00`, timezone: TIMEZONE }),
      });
      const result = await waitForQuery();
      if (result.state === 'REJECTED') {
        throw new Error(result.message || 'La cámara rechazó la consulta de grabaciones.');
      }
    } catch (e) {
      setError(
        cameraError(
          e,
          'La cámara no está conectada para recibir la consulta. Intenta nuevamente cuando esté en línea.',
        ),
      );
    } finally {
      setLoading(false);
    }
  };

  const refreshSession = async (id) => {
    const response = await fetchOrThrow(`/api/stream/history/${id}`);
    const result = await response.json();
    setSession(result);
    loadArchives().catch(() => {});
    if (['SAVED', 'FAILED', 'CONVERSION_FAILED'].includes(result.state)) {
      clearInterval(pollRef.current);
    }
  };

  const handlePlay = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetchOrThrow(`/api/stream/history/play?deviceId=${deviceId}`, {
        method: 'POST',
      });
      const result = await response.json();
      setSession(result);
      setArchivePlayer(null);
      clearInterval(pollRef.current);
      pollRef.current = setInterval(() => {
        refreshSession(result.id).catch((e) => {
          clearInterval(pollRef.current);
          setError(cameraError(e, 'Se perdió la conexión con la cámara. Intenta nuevamente.'));
        });
      }, 1000);
    } catch (e) {
      setError(
        cameraError(
          e,
          'La cámara no está conectada para iniciar el video. Intenta nuevamente cuando esté en línea.',
        ),
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <PageLayout menu={<ReportsMenu />} breadcrumbs={['reportTitle', 'Video histórico']}>
      <Stack spacing={2} sx={{ p: 2 }}>
        <Typography variant="h5">Video histórico</Typography>
        <Typography variant="body2" color="text.secondary">
          Consulta directamente la tarjeta SD de la cámara. Horario: {TIMEZONE}.
        </Typography>

        <Paper variant="outlined" sx={{ p: 2 }}>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems="stretch">
            <FormControl sx={{ minWidth: 260 }}>
              <InputLabel id="history-device-label">Dispositivo</InputLabel>
              <Select
                labelId="history-device-label"
                label="Dispositivo"
                value={deviceId}
                onChange={(event) => setDeviceId(event.target.value)}
              >
                {deviceOptions.map((device) => (
                  <MenuItem key={device.id} value={device.id}>
                    {device.name} — {device.uniqueId}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              label="Fecha"
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
            />
            <TextField
              label="Hora exacta"
              type="time"
              value={time}
              onChange={(event) => setTime(event.target.value)}
              slotProps={{ inputLabel: { shrink: true }, htmlInput: { step: 60 } }}
            />
            <FormControl sx={{ minWidth: 170 }}>
              <InputLabel id="history-channel-label">Canal</InputLabel>
              <Select
                labelId="history-channel-label"
                label="Canal"
                value={channel}
                onChange={(event) => setChannel(event.target.value)}
              >
                <MenuItem value={1}>1 — Frontal</MenuItem>
                <MenuItem value={2}>2 — Cabina</MenuItem>
              </Select>
            </FormControl>
            <Button
              variant="contained"
              startIcon={<SearchIcon />}
              disabled={!deviceId || !date || !time || loading}
              onClick={handleQuery}
            >
              {loading ? 'Consultando…' : 'Consultar SD'}
            </Button>
          </Stack>
        </Paper>

        {error && <Alert severity="error">{error}</Alert>}
        {query && (
          <Alert severity={query.selected ? 'success' : 'warning'}>
            {query.selected
              ? `Se encontró el segmento que contiene las ${time}.`
              : `La cámara reportó ${query.intervals?.length || 0} intervalos, pero ninguno contiene las ${time}.`}
          </Alert>
        )}

        {query?.intervals?.length > 0 && (
          <Paper variant="outlined" sx={{ overflowX: 'auto' }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Canal</TableCell>
                  <TableCell>Inicio</TableCell>
                  <TableCell>Fin</TableCell>
                  <TableCell>Almacenamiento</TableCell>
                  <TableCell>Stream</TableCell>
                  <TableCell>Tamaño</TableCell>
                  <TableCell>Coincide</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {query.intervals.map((interval) => {
                  const selected =
                    query.selected?.start === interval.start &&
                    query.selected?.end === interval.end;
                  return (
                    <TableRow
                      key={`${interval.channel}-${interval.start}-${interval.end}`}
                      selected={selected}
                    >
                      <TableCell>{interval.channel}</TableCell>
                      <TableCell>{formatDate(interval.start)}</TableCell>
                      <TableCell>{formatDate(interval.end)}</TableCell>
                      <TableCell>{interval.storageType}</TableCell>
                      <TableCell>{interval.streamType}</TableCell>
                      <TableCell>{formatSize(interval.size)}</TableCell>
                      <TableCell>{selected ? 'Sí' : 'No'}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Paper>
        )}

        {query?.selected && (
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems="center">
            <Button
              variant="contained"
              color="success"
              startIcon={<PlayArrowIcon />}
              onClick={handlePlay}
              disabled={loading}
            >
              Reproducir segmento seleccionado
            </Button>
            <Typography variant="body2">
              {formatDate(query.selected.start)} – {formatDate(query.selected.end)}
            </Typography>
          </Stack>
        )}

        {session && (
          <Alert severity={session.state === 'STREAMING' ? 'success' : 'info'}>
            Estado del stream: {session.state}. {session.hlsUrl}
          </Alert>
        )}
        {session?.state === 'STREAMING' && session.hlsUrl && (
          <Stack spacing={1}>
            <Typography color="text.secondary">Recibiendo video de la cámara…</Typography>
            <Paper variant="outlined" sx={{ p: 1, bgcolor: 'black' }}>
              <video
                ref={videoRef}
                controls
                autoPlay
                muted
                style={{ width: '100%', maxHeight: '65vh' }}
              />
            </Paper>
          </Stack>
        )}
        {session?.state === 'CONVERTING' && (
          <Alert severity="info">Recepción terminada. Convirtiendo el video a MP4…</Alert>
        )}
        {session?.state === 'SAVED' && (
          <Button
            component="a"
            href={session.downloadUrl}
            startIcon={<DownloadIcon />}
            sx={{ alignSelf: 'flex-start' }}
          >
            Descargar MP4
          </Button>
        )}

        <Paper variant="outlined" sx={{ p: 2, overflowX: 'auto' }}>
          <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1}>
            <Typography variant="h6">Videos históricos guardados</Typography>
            <Button disabled={!deviceId} onClick={() => loadArchives()}>
              Actualizar
            </Button>
          </Stack>
          {!deviceId ? (
            <Typography color="text.secondary">
              Selecciona un dispositivo para ver sus videos.
            </Typography>
          ) : archives.length === 0 ? (
            <Typography color="text.secondary">
              Este dispositivo todavía no tiene videos guardados.
            </Typography>
          ) : (
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Guardado</TableCell>
                  <TableCell>Canal</TableCell>
                  <TableCell>Inicio</TableCell>
                  <TableCell>Fin</TableCell>
                  <TableCell>Estado</TableCell>
                  <TableCell>Acciones</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {archives.map((item) => (
                  <TableRow key={item.id} selected={archivePlayer?.id === item.id}>
                    <TableCell>{formatDate(item.createdTime)}</TableCell>
                    <TableCell>{item.channel}</TableCell>
                    <TableCell>{formatDate(item.interval.start)}</TableCell>
                    <TableCell>{formatDate(item.interval.end)}</TableCell>
                    <TableCell>{item.state}</TableCell>
                    <TableCell>
                      <Stack direction="row" spacing={1}>
                        <Button
                          size="small"
                          startIcon={<PlayArrowIcon />}
                          disabled={item.state !== 'SAVED'}
                          onClick={() => {
                            setArchivePlayer(item);
                            setSession(null);
                          }}
                        >
                          Ver
                        </Button>
                        <Button
                          size="small"
                          component="a"
                          href={item.downloadUrl}
                          startIcon={<DownloadIcon />}
                          disabled={item.state !== 'SAVED'}
                        >
                          Descargar MP4
                        </Button>
                      </Stack>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Paper>

        {archivePlayer && (
          <Paper variant="outlined" sx={{ p: 1, bgcolor: 'black' }}>
            <video
              ref={videoRef}
              controls
              autoPlay
              muted
              style={{ width: '100%', maxHeight: '65vh' }}
            />
          </Paper>
        )}
      </Stack>
    </PageLayout>
  );
};

export default VideoReportPage;
