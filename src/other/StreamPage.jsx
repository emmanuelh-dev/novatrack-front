import { useEffect, useRef, useState } from 'react';
import { useSelector } from 'react-redux';
import { Typography, IconButton, Toolbar, Paper } from '@mui/material';
import { makeStyles } from 'tss-react/mui';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { default as Hls, Events } from 'hls.js/light';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import StopIcon from '@mui/icons-material/Stop';
import { useTranslation } from '../common/components/LocalizationProvider';
import { useCatchCallback } from '../reactHelper';
import BackIcon from '../common/components/BackIcon';
import fetchOrThrow from '../common/util/fetchOrThrow';

const DEFAULT_CHANNELS = [1, 2];

const useStyles = makeStyles()((theme) => ({
  root: {
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
  },
  title: {
    flexGrow: 1,
  },
  grid: {
    flexGrow: 1,
    display: 'flex',
    flexWrap: 'wrap',
    gap: theme.spacing(1),
    padding: theme.spacing(1),
  },
  video: {
    position: 'relative',
    flex: '1 1 45%',
    minWidth: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.palette.common.black,
  },
  player: {
    width: '100%',
    maxWidth: '100%',
    maxHeight: '100%',
  },
  label: {
    position: 'absolute',
    top: theme.spacing(1),
    left: theme.spacing(1),
    color: theme.palette.common.white,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    padding: theme.spacing(0, 1),
    borderRadius: theme.shape.borderRadius,
    zIndex: 1,
  },
  toggle: {
    position: 'absolute',
    top: theme.spacing(0.5),
    right: theme.spacing(0.5),
    zIndex: 1,
  },
  error: {
    color: theme.palette.common.white,
  },
}));

const ChannelPlayer = ({ classes, deviceId, channel, sendCommand }) => {
  const t = useTranslation();
  const videoRef = useRef(null);

  const [playing, setPlaying] = useState(true);
  const [error, setError] = useState(false);
  const [retryToken, setRetryToken] = useState(0);

  useEffect(() => {
    if (playing) {
      setError(false);
      sendCommand('videoStart', { index: channel });
      const hls = new Hls();
      hls.loadSource(`/api/stream/${deviceId}/${channel}/live.m3u8`);
      hls.attachMedia(videoRef.current);
      hls.on(Events.MANIFEST_PARSED, () => videoRef.current.play());
      let retryTimeout;
      hls.on(Events.ERROR, (_, data) => {
        if (data.fatal) {
          setError(true);
          retryTimeout = setTimeout(() => setRetryToken((token) => token + 1), 5000);
        }
      });
      return () => {
        clearTimeout(retryTimeout);
        hls.destroy();
        sendCommand('videoStop', { index: channel });
      };
    }
    return undefined;
  }, [deviceId, channel, playing, retryToken, sendCommand]);

  return (
    <div className={classes.video}>
      <Typography className={classes.label} variant="body2">{channel}</Typography>
      <IconButton
        className={classes.toggle}
        size="small"
        color={playing ? 'error' : 'primary'}
        onClick={() => {
          setError(false);
          setPlaying(!playing);
        }}
      >
        {playing ? <StopIcon /> : <PlayArrowIcon />}
      </IconButton>
      {error && <Typography className={classes.error}>{t('errorConnection')}</Typography>}
      {playing && !error && (
        <video ref={videoRef} className={classes.player} autoPlay muted controls />
      )}
    </div>
  );
};

const StreamPage = () => {
  const { classes } = useStyles();
  const navigate = useNavigate();
  const t = useTranslation();

  const [searchParams] = useSearchParams();
  const deviceId = searchParams.get('deviceId');
  const device = useSelector((state) => state.devices.items[deviceId]);

  const sendCommand = useCatchCallback(
    async (type, attributes) => {
      await fetchOrThrow('/api/commands/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId, type, attributes }),
      });
    },
    [deviceId],
  );

  return (
    <div className={classes.root}>
      <Paper square>
        <Toolbar>
          <IconButton edge="start" sx={{ mr: 2 }} onClick={() => navigate(-1)}>
            <BackIcon />
          </IconButton>
          <Typography variant="h6" className={classes.title}>
            {device?.name || t('linkLiveVideo')}
          </Typography>
        </Toolbar>
      </Paper>
      <div className={classes.grid}>
        {DEFAULT_CHANNELS.map((channel) => (
          <ChannelPlayer
            key={channel}
            classes={classes}
            deviceId={deviceId}
            channel={channel}
            sendCommand={sendCommand}
          />
        ))}
      </div>
    </div>
  );
};

export default StreamPage;
