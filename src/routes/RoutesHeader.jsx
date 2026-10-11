import { Box, Button, Stack, Typography } from '@mui/material';
import { useTranslation } from '../common/components/LocalizationProvider';

const RoutesHeader = ({ navigation, view, onView }) => {
  const t = useTranslation();
  return (
    <Box sx={{ px: 2.5, pt: 2, pb: 1, flexShrink: 0, '@media print': { display: 'none' } }}>
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        sx={{ minHeight: 40 }}
      >
        <Typography variant="h6" component="h1" sx={{ fontWeight: 700 }}>
          {t('tripTitle')}
        </Typography>
        {onView && (
          <Button onClick={() => onView(view === 'form' ? 'map' : 'form')}>
            {t(view === 'form' ? 'mapTitle' : 'routingForm')}
          </Button>
        )}
      </Stack>
      {navigation}
    </Box>
  );
};

export default RoutesHeader;
