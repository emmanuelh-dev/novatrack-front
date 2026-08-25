import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Typography,
} from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import { default as Hls, Events } from 'hls.js/light';
import fetchOrThrow from '../../common/util/fetchOrThrow';

const cameraError = (error) => {
  const message = error?.message || '';
  return /java\.|at org\.traccar|Failed to send command/i.test(message)
    ? 'La cámara no está conectada. Intenta nuevamente cuando esté en línea.'
    : message || 'No fue posible reproducir el video histórico.';
};

const TIMEZONE = 'America/Monterrey';

const localParts = (value) =>
  Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(new Date(value))
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  );

const HistoricalVideoDialog = ({ deviceId, eventTime, open, onClose }) => {
  const videoRef = useRef(null);
  const [channel, setChannel] = useState(1);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [streamUrl, setStreamUrl] = useState(null);
  const [historySessionId, setHistorySessionId] = useState(null);
  const [sessionStatus, setSessionStatus] = useState(null);

  useEffect(() => {
    if (!historySessionId) return undefined;
    const timer = setInterval(async () => {
      try {
        const response = await fetchOrThrow(`/api/stream/history/${historySessionId}`);
        setSessionStatus(await response.json());
      } catch {
        // Keep playback available if a status refresh fails temporarily.
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [historySessionId]);

  useEffect(() => {
    if (!streamUrl || !videoRef.current) {
      return undefined;
    }
    const hls = new Hls();
    hls.loadSource(streamUrl);
    hls.attachMedia(videoRef.current);
    hls.on(Events.MANIFEST_PARSED, () => videoRef.current?.play());
    return () => hls.destroy();
  }, [streamUrl]);

  useEffect(() => {
    if (!open) {
      setStreamUrl(null);
      setHistorySessionId(null);
      setSessionStatus(null);
      setMessage('');
    }
  }, [open]);

  const pollIntervals = async () => {
    for (let attempt = 0; attempt < 30; attempt += 1) {
      await new Promise((resolve) => {
        setTimeout(resolve, 1000);
      });
      const response = await fetchOrThrow(`/api/stream/history/intervals?deviceId=${deviceId}`);
      const query = await response.json();
      if (query.state !== 'QUERYING') {
        return query;
      }
    }
    throw new Error('La cámara no respondió a tiempo');
  };

  const handlePlay = async () => {
    const parts = localParts(eventTime);
    setLoading(true);
    setMessage('Consultando grabaciones de la cámara…');
    setStreamUrl(null);
    try {
      await fetchOrThrow('/api/stream/history/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceId,
          channel,
          date: `${parts.year}-${parts.month}-${parts.day}`,
          time: `${parts.hour}:${parts.minute}:${parts.second}`,
          timezone: TIMEZONE,
        }),
      });
      const query = await pollIntervals();
      if (query.state === 'REJECTED') {
        throw new Error(query.message || 'La cámara rechazó la consulta de grabaciones.');
      }
      if (!query.selected) {
        setMessage('No hay una grabación que contenga exactamente esta hora.');
        return;
      }
      const response = await fetchOrThrow(`/api/stream/history/play?deviceId=${deviceId}`, {
        method: 'POST',
      });
      const session = await response.json();
      setMessage(`Reproduciendo ${query.selected.start} – ${query.selected.end}`);
      setStreamUrl(session.hlsUrl);
      setHistorySessionId(session.id);
      setSessionStatus(session);
    } catch (error) {
      setMessage(cameraError(error));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>Video histórico</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <Typography variant="body2">
            Hora del evento: {new Date(eventTime).toLocaleString('es-MX', { timeZone: TIMEZONE })}
          </Typography>
          <FormControl size="small" sx={{ width: 160 }}>
            <InputLabel id="historical-channel-label">Canal</InputLabel>
            <Select
              labelId="historical-channel-label"
              value={channel}
              label="Canal"
              onChange={(event) => setChannel(event.target.value)}
            >
              <MenuItem value={1}>1 — Frontal</MenuItem>
              <MenuItem value={2}>2 — Cabina</MenuItem>
            </Select>
          </FormControl>
          {message && <Alert severity={streamUrl ? 'success' : 'info'}>{message}</Alert>}
          {streamUrl && (
            <video
              ref={videoRef}
              controls
              autoPlay
              muted
              style={{ width: '100%', maxHeight: '60vh' }}
            />
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cerrar</Button>
        {sessionStatus?.state === 'SAVED' && historySessionId && (
          <Button component="a" href={sessionStatus.downloadUrl} startIcon={<DownloadIcon />}>
            Descargar MP4
          </Button>
        )}
        <Button variant="contained" onClick={handlePlay} disabled={loading}>
          {loading ? 'Consultando…' : 'Buscar y reproducir'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default HistoricalVideoDialog;
