import { useEffect, useState } from 'react';
import { useTheme, Popover, Box } from '@mui/material';
import { createRoot } from 'react-dom/client';
import TravelExploreIcon from '@mui/icons-material/TravelExplore';
import { map } from '../core/MapView';
import { toMapCoordinates } from '../core/mapUtil';
import { useTranslation } from '../../common/components/LocalizationProvider';
import AddressSearch from '../../common/components/AddressSearch';

const MapGeocoder = () => {
  const theme = useTheme();
  const t = useTranslation();
  const [anchorEl, setAnchorEl] = useState(null);
  const [query, setQuery] = useState('');
  useEffect(() => {
    let element, root;
    const control = {
      onAdd: () => {
        element = document.createElement('div');
        element.className = 'maplibregl-ctrl maplibregl-ctrl-group';
        const button = document.createElement('button');
        button.type = 'button';
        button.title = t('sharedSearch');
        button.setAttribute('aria-label', t('sharedSearch'));
        button.onclick = () => setAnchorEl(button);
        element.appendChild(button);
        root = createRoot(button);
        root.render(<TravelExploreIcon fontSize="small" />);
        return element;
      },
      onRemove: () => {
        queueMicrotask(() => root.unmount());
        element.remove();
      },
    };
    map.addControl(control, theme.direction === 'rtl' ? 'top-left' : 'top-right');
    return () => map.removeControl(control);
  }, [theme.direction, t]);
  const center = map.getCenter();
  return (
    <Popover
      anchorEl={anchorEl}
      open={Boolean(anchorEl)}
      onClose={() => setAnchorEl(null)}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      transformOrigin={{ vertical: 'top', horizontal: 'right' }}
    >
      <Box sx={{ width: 320, maxWidth: '90vw', p: 1.5 }}>
        <AddressSearch
          value={query}
          onChange={setQuery}
          latitude={center.lat}
          longitude={center.lng}
          label={t('sharedSearch')}
          onSelect={(item) => {
            map.flyTo({ center: toMapCoordinates(item.longitude, item.latitude), zoom: 16 });
            setAnchorEl(null);
            setQuery('');
          }}
        />
      </Box>
    </Popover>
  );
};
export default MapGeocoder;
