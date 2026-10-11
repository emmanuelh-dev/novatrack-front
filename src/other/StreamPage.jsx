import { useEffect, useRef, useState } from 'react';
import { useSelector } from 'react-redux';
import {
  CircularProgress,
  IconButton,
  Paper,
  Step,
  StepLabel,
  Stepper,
  Toolbar,
  Typography,
} from '@mui/material';
import { makeStyles } from 'tss-react/mui';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { default as Hls, Events, ErrorTypes } from 'hls.js/light';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import StopIcon from '@mui/icons-material/Stop';
import AddIcon from '@mui/icons-material/Add';
import CloseIcon from '@mui/icons-material/Close';
import VolumeOffIcon from '@mui/icons-material/VolumeOff';
import VolumeUpIcon from '@mui/icons-material/VolumeUp';
import { useTranslation } from '../common/components/LocalizationProvider';
import BackIcon from '../common/components/BackIcon';
import fetchOrThrow from '../common/util/fetchOrThrow';

const MAX_CHANNELS = 8;
const RETRY_DELAY = 5000;
const HEARTBEAT_INTERVAL = 10000;

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
    [theme.breakpoints.down('sm')]: {
      flexDirection: 'column',
    },
  },
  channel: {
    flex: '1 1 50%',
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
  },
  label: {
    flexGrow: 1,
  },
  video: {
    flexGrow: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    minHeight: 220,
  },
  progress: {
    position: 'absolute',
    width: '100%',
    maxWidth: 440,
    padding: theme.spacing(2),
    textAlign: 'center',
  },
  player: {
    maxWidth: '100%',
    maxHeight: '100%',
  },
}));

const ChannelPlayer = ({ classes, deviceId, channel, removable, onRemove }) => {
  const t = useTranslation();
  const videoRef = useRef(null);
  // Stable for the whole life of this player, so rerenders never look like a new viewer.
  const sessionIdRef = useRef(null);

  const [playing, setPlaying] = useState(true);
  const [muted, setMuted] = useState(true);
  const [stage, setStage] = useState(0);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.muted = muted;
    }
  }, [muted]);

  useEffect(() => {
    if (!playing) {
      return undefined;
    }

    sessionIdRef.current ??= crypto.randomUUID();
    const sessionId = sessionIdRef.current;
    const body = JSON.stringify({ sessionId });
    const headers = { 'Content-Type': 'application/json' };
    let destroyed = false;
    let retryTimeout;

    setStage(0);

    // The server owns videoStart and videoStop. This player only says that it is watching, so pausing, retrying or
    // closing it can never interrupt the other viewers of the same camera.
    fetchOrThrow(`/api/stream/${deviceId}/${channel}/subscribe`, {
      method: 'POST',
      headers,
      body,
    })
      .then(() => {
        if (!destroyed) setStage((current) => (current === 0 ? 1 : current));
      })
      .catch(() => {});

    const heartbeat = setInterval(() => {
      fetch(`/api/stream/${deviceId}/${channel}/heartbeat`, {
        method: 'POST',
        headers,
        body,
      })
        .then((response) => {
          if (!destroyed && response.ok) setStage((current) => (current === 0 ? 1 : current));
        })
        .catch(() => {});
    }, HEARTBEAT_INTERVAL);

    const hls = new Hls();
    hls.loadSource(`/api/stream/${deviceId}/${channel}/live.m3u8`);
    hls.attachMedia(videoRef.current);
    hls.on(Events.MANIFEST_PARSED, () => {
      if (!destroyed && videoRef.current) {
        videoRef.current.play().catch(() => {});
      }
    });
    hls.on(Events.ERROR, (_, data) => {
      if (!data.fatal || destroyed) {
        return;
      }
      setStage(1);
      clearTimeout(retryTimeout);
      retryTimeout = setTimeout(() => {
        if (destroyed) {
          return;
        }
        // Recovery is local to this player: no subscription change and no device command.
        if (data.type === ErrorTypes.MEDIA_ERROR) {
          hls.recoverMediaError();
        } else {
          hls.startLoad();
        }
      }, RETRY_DELAY);
    });

    return () => {
      destroyed = true;
      clearTimeout(retryTimeout);
      clearInterval(heartbeat);
      hls.destroy();
      // keepalive lets the request survive a tab close; the server heartbeat sweep covers the cases it does not.
      fetch(`/api/stream/${deviceId}/${channel}/subscribe`, {
        method: 'DELETE',
        headers,
        body,
        keepalive: true,
      }).catch(() => {});
    };
  }, [deviceId, channel, playing]);

  return (
    <div className={classes.channel}>
      <Toolbar variant="dense" disableGutters>
        <Typography className={classes.label} variant="body2">
          {channel}
        </Typography>
        {removable && (
          <IconButton size="small" title={t('sharedRemove')} onClick={() => onRemove(channel)}>
            <CloseIcon fontSize="small" />
          </IconButton>
        )}
        <IconButton
          size="small"
          color={playing ? 'error' : 'primary'}
          title={
            playing
              ? t('videoPauseViewing') || 'Pause viewing'
              : t('videoResumeViewing') || 'Resume viewing'
          }
          onClick={() => {
            setStage(0);
            setPlaying((current) => {
              if (!current) {
                setMuted(true);
              }
              return !current;
            });
          }}
        >
          {playing ? <StopIcon /> : <PlayArrowIcon />}
        </IconButton>
        {playing && (
          <IconButton
            size="small"
            title={t(muted ? 'videoEnableAudio' : 'videoDisableAudio')}
            onClick={() => setMuted((current) => !current)}
          >
            {muted ? <VolumeOffIcon /> : <VolumeUpIcon />}
          </IconButton>
        )}
      </Toolbar>
      <div className={classes.video}>
        {playing && stage < 2 && (
          <div className={classes.progress} role="status" aria-live="polite">
            <CircularProgress size={30} aria-hidden="true" />
            <Stepper activeStep={stage} alternativeLabel sx={{ mt: 2 }}>
              {[
                ['videoConnecting', 'Establishing connection'],
                ['videoWaiting', 'Connecting camera'],
                ['videoConnected', 'Connected'],
              ].map(([key, fallback]) => (
                <Step key={key}>
                  <StepLabel>{t(key) || fallback}</StepLabel>
                </Step>
              ))}
            </Stepper>
          </div>
        )}
        {playing && (
          <video
            ref={videoRef}
            className={classes.player}
            style={{ visibility: stage === 2 ? 'visible' : 'hidden' }}
            autoPlay
            muted={muted}
            controls
            onPlaying={() => setStage(2)}
          />
        )}
      </div>
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

  const [channels, setChannels] = useState([1]);

  const addChannel = () => {
    setChannels((prev) => {
      if (prev.length >= MAX_CHANNELS) {
        return prev;
      }
      let next = 1;
      while (prev.includes(next)) {
        next += 1;
      }
      return [...prev, next];
    });
  };

  const removeChannel = (channel) => {
    setChannels((prev) => (prev.length > 1 ? prev.filter((c) => c !== channel) : prev));
  };

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
          <IconButton
            edge="end"
            disabled={channels.length >= MAX_CHANNELS}
            onClick={addChannel}
            title={t('sharedAdd')}
          >
            <AddIcon />
          </IconButton>
        </Toolbar>
      </Paper>
      <div className={classes.grid}>
        {channels.map((channel) => (
          <ChannelPlayer
            key={`${deviceId}-${channel}`}
            classes={classes}
            deviceId={deviceId}
            channel={channel}
            removable={channels.length > 1}
            onRemove={removeChannel}
          />
        ))}
      </div>
    </div>
  );
};

export default StreamPage;
