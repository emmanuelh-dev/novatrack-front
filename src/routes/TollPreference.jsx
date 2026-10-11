import { Box, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import TollIcon from '@mui/icons-material/Toll';
import RouteIcon from '@mui/icons-material/Route';
import AltRouteIcon from '@mui/icons-material/AltRoute';
import { useTranslation } from '../common/components/LocalizationProvider';

const TollPreference = ({ value, onChange }) => {
  const t = useTranslation();
  return (
    <Box>
      <Typography variant="caption" color="text.secondary" component="p" sx={{ mb: 0.75 }}>
        {t('tollsPreference')}
      </Typography>
      <ToggleButtonGroup
        exclusive
        fullWidth
        value={value}
        aria-label={t('tollsPreference')}
        onChange={(_, next) => {
          if (next !== null) onChange(next);
        }}
        sx={{
          gap: 0.5,
          '& .MuiToggleButtonGroup-grouped': {
            border: 0,
            borderRadius: '12px !important',
            m: 0,
            minHeight: 48,
            gap: 0.5,
            flexDirection: 'column',
            textTransform: 'none',
            fontSize: '0.75rem',
            lineHeight: 1.3,
            color: 'text.secondary',
            '&.Mui-selected': { bgcolor: 'action.selected', color: 'primary.main' },
          },
        }}
      >
        <ToggleButton value="toll">
          <TollIcon fontSize="small" />
          {t('tollsPreferencetoll')}
        </ToggleButton>
        <ToggleButton value="free">
          <RouteIcon fontSize="small" />
          {t('tollsPreferencefree')}
        </ToggleButton>
        <ToggleButton value="both">
          <AltRouteIcon fontSize="small" />
          {t('tollsPreferenceboth')}
        </ToggleButton>
      </ToggleButtonGroup>
    </Box>
  );
};
export default TollPreference;
