import { useState } from 'react';
import {
  Box,
  Button,
  ButtonBase,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  Tooltip,
} from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutlined';
import AudiotrackIcon from '@mui/icons-material/Audiotrack';
import { useTranslation } from './LocalizationProvider';

const resolveMediaType = (file, mediaType) => {
  if (mediaType) {
    return mediaType;
  }
  if (file.toLowerCase().match(/\.(mp4|webm|mov|avi)$/)) {
    return 'video';
  }
  if (file.toLowerCase().match(/\.(mp3|wav|ogg|m4a|aac)$/)) {
    return 'audio';
  }
  return 'image';
};

const MediaPreview = ({ uniqueId, file, mediaType }) => {
  const t = useTranslation();
  const [open, setOpen] = useState(false);

  if (!uniqueId || !file) {
    return null;
  }

  const type = resolveMediaType(file, mediaType);
  const label =
    type === 'video'
      ? t('positionVideo')
      : type === 'audio'
        ? t('positionAudio')
        : t('positionImage');
  const url = `/api/media/${encodeURIComponent(uniqueId)}/${encodeURIComponent(file)}`;

  const preview =
    type === 'image' ? (
      <ButtonBase
        onClick={() => setOpen(true)}
        aria-label={`${label}: ${file}`}
        sx={{ borderRadius: 1, overflow: 'hidden' }}
      >
        <Box
          component="img"
          src={url}
          alt={file}
          loading="lazy"
          sx={{ width: 96, height: 54, objectFit: 'cover', display: 'block' }}
        />
      </ButtonBase>
    ) : (
      <Button
        size="small"
        variant="outlined"
        startIcon={type === 'video' ? <PlayCircleOutlineIcon /> : <AudiotrackIcon />}
        onClick={() => setOpen(true)}
      >
        {label}
      </Button>
    );

  return (
    <>
      <Stack direction="row" spacing={0.5} alignItems="center">
        <Tooltip title={file}>{preview}</Tooltip>
        <Tooltip title={t('sharedSave')}>
          <IconButton
            component="a"
            href={url}
            download={file}
            size="small"
            aria-label={`${t('sharedSave')}: ${file}`}
          >
            <DownloadIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Stack>
      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>
          {label}: {file}
        </DialogTitle>
        <DialogContent
          dividers
          sx={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            minHeight: 240,
            bgcolor: 'common.black',
          }}
        >
          {type === 'image' && (
            <Box
              component="img"
              src={url}
              alt={file}
              sx={{ maxWidth: '100%', maxHeight: '70vh', objectFit: 'contain' }}
            />
          )}
          {type === 'video' && (
            <Box
              component="video"
              src={url}
              controls
              playsInline
              preload="metadata"
              sx={{ width: '100%', maxHeight: '70vh' }}
            />
          )}
          {type === 'audio' && (
            <Box component="audio" src={url} controls preload="metadata" sx={{ width: '100%' }} />
          )}
        </DialogContent>
        <DialogActions>
          <Button component="a" href={url} download={file} startIcon={<DownloadIcon />}>
            {t('sharedSave')}
          </Button>
          <Button onClick={() => setOpen(false)}>{t('sharedCancel')}</Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default MediaPreview;
