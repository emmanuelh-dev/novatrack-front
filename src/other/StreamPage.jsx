import { useEffect, useRef, useState } from 'react';
import { useSelector } from 'react-redux';
import { Typography, IconButton, Toolbar, Paper, TextField } from '@mui/material';
import { makeStyles } from 'tss-react/mui';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { default as Hls, Events, ErrorTypes } from 'hls.js/light';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import StopIcon from '@mui/icons-material/Stop';
import VolumeOffIcon from '@mui/icons-material/VolumeOff';
import VolumeUpIcon from '@mui/icons-material/VolumeUp';
import { useTranslation } from '../common/components/LocalizationProvider';
import BackIcon from '../common/components/BackIcon';
import fetchOrThrow from '../common/util/fetchOrThrow';

const useStyles = makeStyles()((theme) => ({
  root: {
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
  },
  video: {
    flexGrow: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  player: {
    maxWidth: '100%',
    maxHeight: '100%',
  },
  title: {
    flexGrow: 1,
  },
  channel: {
    marginInline: theme.spacing(1),
  },
}));

const HEARTBEAT_INTERVAL = 10000;

const ChannelPlayer = ({ classes, deviceId, channel, muted, setError }) => {
  const videoRef = useRef(null);
  // Stable for the whole life of this player, so rerenders never look like a new viewer.
  const sessionIdRef = useRef(null);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.muted = muted;
    }
  }, [muted]);

  useEffect(() => {
    sessionIdRef.current ??= crypto.randomUUID();
    const sessionId = sessionIdRef.current;
    const body = JSON.stringify({ sessionId });
    const headers = { 'Content-Type': 'application/json' };
    let retryTimeout;

    setError(false);

    // The server owns videoStart and videoStop. This player only says that it is watching, so pausing, retrying or
    // closing it can never interrupt the other viewers of the same camera.
    fetchOrThrow(`/api/stream/${deviceId}/${channel}/subscribe`, {
      method: 'POST',
      headers,
      body,
    }).catch(() => setError(true));

    const heartbeat = setInterval(() => {
      fetch(`/api/stream/${deviceId}/${channel}/heartbeat`, {
        method: 'POST',
        headers,
        body,
      }).catch(() => {});
    }, HEARTBEAT_INTERVAL);

    const hls = new Hls();
    hls.loadSource(`/api/stream/${deviceId}/${channel}/live.m3u8`);
    hls.attachMedia(videoRef.current);
    hls.on(Events.MANIFEST_PARSED, () => videoRef.current?.play());
    hls.on(Events.ERROR, (_, data) => {
      if (!data.fatal) {
        return;
      }
      setError(true);
      clearTimeout(retryTimeout);
      retryTimeout = setTimeout(() => {
        setError(false);
        // Recovery is local to this player: no subscription change and no device command.
        if (data.type === ErrorTypes.MEDIA_ERROR) {
          hls.recoverMediaError();
        } else {
          hls.startLoad();
        }
      }, 5000);
    });

    return () => {
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
  }, [deviceId, channel, setError]);

  return <video ref={videoRef} className={classes.player} autoPlay muted={muted} controls />;
};

const StreamPage = () => {
  const { classes } = useStyles();
  const navigate = useNavigate();
  const t = useTranslation();

  const [channel, setChannel] = useState(1);
  const [activeChannel, setActiveChannel] = useState(null);
  const [muted, setMuted] = useState(true);
  const [error, setError] = useState(false);

  const [searchParams] = useSearchParams();
  const deviceId = searchParams.get('deviceId');
  const device = useSelector((state) => state.devices.items[deviceId]);

  const playing = activeChannel !== null;

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
          <TextField
            size="small"
            type="number"
            value={channel}
            onChange={(event) => setChannel(Number(event.target.value) || 1)}
            label={t('commandIndex')}
            disabled={playing}
            className={classes.channel}
          />
          <IconButton
            edge="end"
            color={playing ? 'error' : 'primary'}
            onClick={() => {
              setError(false);
              setMuted(true);
              setActiveChannel(playing ? null : channel);
            }}
          >
            {playing ? <StopIcon /> : <PlayArrowIcon />}
          </IconButton>
          {playing && (
            <IconButton
              edge="end"
              title={t(muted ? 'videoEnableAudio' : 'videoDisableAudio')}
              onClick={() => setMuted((value) => !value)}
            >
              {muted ? <VolumeOffIcon /> : <VolumeUpIcon />}
            </IconButton>
          )}
        </Toolbar>
      </Paper>
      <div className={classes.video}>
        {error && <Typography>{t('errorConnection')}</Typography>}
        {playing && (
          <ChannelPlayer
            classes={classes}
            deviceId={deviceId}
            channel={activeChannel}
            muted={muted}
            setError={setError}
          />
        )}
      </div>
    </div>
  );
};

export default StreamPage;
