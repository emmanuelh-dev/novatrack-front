import { useEffect, useRef } from 'react';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Autocomplete,
  Avatar,
  Button,
  List,
  ListItemButton,
  ListItemText,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import PlaceIcon from '@mui/icons-material/Place';
import WarehouseIcon from '@mui/icons-material/Warehouse';
import LocalGasStationIcon from '@mui/icons-material/LocalGasStation';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import { useTranslation } from '../common/components/LocalizationProvider';
import AddressSearch from '../common/components/AddressSearch';
import { routePoint, placePoint } from './routePlan';

export const placeIcons = {
  place: PlaceIcon,
  warehouse: WarehouseIcon,
  fuel: LocalGasStationIcon,
  customer: LocalShippingIcon,
};
export { placePoint };
export const newPlace = () => ({
  name: '',
  address: '',
  center: null,
  radius: 150,
  shape: 'polygon',
  area: '',
  icon: 'place',
});
export const placeArea = (draft) =>
  draft.shape === 'polygon'
    ? draft.area
    : routePoint(draft.center) && Number(draft.radius) >= 10 && Number(draft.radius) <= 50000
      ? `CIRCLE (${draft.center.latitude} ${draft.center.longitude}, ${draft.radius})`
      : '';
const PlacesPanel = ({ items, draft, setDraft, readonly, busy, onSave, onMap, onVisits }) => {
  const t = useTranslation();
  const fileInputRef = useRef(null);
  useEffect(() => {
    if (!draft?.file && fileInputRef.current) fileInputRef.current.value = '';
  }, [draft?.file]);
  const change = (patch) => setDraft({ ...draft, ...patch });
  const open = (item) => {
    const definition = item.attributes?.routePlace;
    const circle = item.area.startsWith('CIRCLE');
    const radius = circle ? Number(item.area.split(',')[1]?.replace(')', '').trim()) : 150;
    setDraft({
      ...newPlace(),
      ...definition,
      item,
      name: item.name,
      area: item.area,
      center: circle ? placePoint(item) : null,
      shape: circle ? 'circle' : 'polygon',
      radius,
    });
  };
  return (
    <Stack spacing={2}>
      <Typography variant="body2" color="text.secondary">
        {t('placeHelp')}
      </Typography>
      <Autocomplete
        options={items.filter(placePoint)}
        value={draft?.item || null}
        getOptionLabel={(item) => item.name}
        isOptionEqualToValue={(a, b) => a.id === b.id}
        disabled={busy}
        onChange={(_, item) => (item ? open(item) : setDraft(null))}
        renderInput={(params) => <TextField {...params} label={t('placeSaved')} />}
      />
      {!draft && (
        <List disablePadding aria-label={t('placeSaved')}>
          {items.filter(placePoint).map((item) => (
            <ListItemButton
              key={item.id}
              onClick={() => open(item)}
              disabled={busy}
              sx={{ borderRadius: 1.5 }}
            >
              <ListItemText primary={item.name} />
            </ListItemButton>
          ))}
        </List>
      )}
      {!readonly && (!draft || draft.item) && (
        <Button
          disabled={busy}
          onClick={() => {
            setDraft(newPlace());
            onMap('zone');
          }}
        >
          {t('placeNew')}
        </Button>
      )}
      {draft && (
        <Stack
          key={draft.item?.id || 'new'}
          spacing={2}
          component="form"
          onSubmit={(event) => {
            event.preventDefault();
            onSave();
          }}
        >
          <TextField
            label={t('placeName')}
            value={draft.name}
            disabled={readonly || busy}
            onChange={(event) => change({ name: event.target.value })}
            slotProps={{ htmlInput: { maxLength: 128 } }}
            required
          />
          <AddressSearch
            label={t('placeOptionalAddress')}
            value={draft.address}
            disabled={readonly || busy}
            onChange={(address) => change({ address, addressPoint: null })}
            onSelect={(item) =>
              change({
                address: item.label,
                addressPoint: item,
                center: draft.center || { latitude: item.latitude, longitude: item.longitude },
              })
            }
          />
          <TextField
            select
            label={t('placeZone')}
            value={draft.shape}
            disabled={readonly || busy}
            onChange={(event) => change({ shape: event.target.value, area: '' })}
          >
            <MenuItem value="circle">{t('placeCircle')}</MenuItem>
            <MenuItem value="polygon">{t('placePolygon')}</MenuItem>
          </TextField>
          {draft.shape === 'circle' ? (
            <TextField
              type="number"
              label={t('placeRadius')}
              value={draft.radius}
              disabled={readonly || busy}
              onChange={(event) => change({ radius: event.target.value })}
              slotProps={{ htmlInput: { min: 10, max: 50000 } }}
            />
          ) : (
            <Typography variant="body2">
              {t(draft.area ? 'placeZoneReady' : 'placePolygonHelp')}
            </Typography>
          )}
          <Button disabled={readonly || busy} onClick={() => onMap('zone')}>
            {t('placePickZone')}
          </Button>
          {draft.shape === 'circle' && (
            <Accordion disableGutters elevation={0}>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Typography>{t('placeCoordinates')}</Typography>
              </AccordionSummary>
              <AccordionDetails>
                <Stack direction="row" spacing={1}>
                  {['latitude', 'longitude'].map((key) => (
                    <TextField
                      key={key}
                      type="number"
                      label={t(key === 'latitude' ? 'placeCenterLatitude' : 'placeCenterLongitude')}
                      value={draft.center?.[key] ?? ''}
                      disabled={readonly || busy}
                      onChange={(event) =>
                        change({
                          center: {
                            latitude: draft.center?.latitude ?? '',
                            longitude: draft.center?.longitude ?? '',
                            [key]: event.target.value,
                          },
                        })
                      }
                      slotProps={{ inputLabel: { shrink: true }, htmlInput: { step: 'any' } }}
                    />
                  ))}
                </Stack>
              </AccordionDetails>
            </Accordion>
          )}
          <Accordion disableGutters elevation={0}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography>{t('placeAppearance')}</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Stack spacing={2}>
                <TextField
                  select
                  label={t('placeIcon')}
                  value={draft.icon}
                  disabled={readonly || busy}
                  onChange={(event) =>
                    change({ icon: event.target.value, image: false, file: null })
                  }
                >
                  {Object.entries(placeIcons).map(([key, Icon]) => (
                    <MenuItem key={key} value={key}>
                      <Icon sx={{ mr: 1 }} />
                      {t(`placeIcon${key}`)}
                    </MenuItem>
                  ))}
                </TextField>
                {!readonly && (
                  <TextField
                    type="file"
                    inputRef={fileInputRef}
                    label={t('placeImage')}
                    disabled={busy}
                    onChange={(event) => change({ file: event.target.files[0] || null })}
                    slotProps={{
                      inputLabel: { shrink: true },
                      htmlInput: { accept: 'image/png,image/jpeg' },
                    }}
                    helperText={t('placeImageHelp')}
                  />
                )}
                {draft.item?.attributes.routePlace?.image && (
                  <Avatar
                    variant="rounded"
                    src={`/api/geofences/${draft.item.id}/image`}
                    alt={draft.name}
                    sx={{ width: 56, height: 56 }}
                  />
                )}
              </Stack>
            </AccordionDetails>
          </Accordion>
          {!readonly && (
            <Button
              variant="contained"
              type="submit"
              disabled={busy || !draft.name.trim() || !placePoint({ area: placeArea(draft) })}
            >
              {t('sharedSave')}
            </Button>
          )}
          <Button disabled={busy} onClick={() => setDraft(null)}>
            {t('sharedCancel')}
          </Button>
          {draft.item && <Button onClick={() => onVisits(draft.item)}>{t('placeVisits')}</Button>}
        </Stack>
      )}
    </Stack>
  );
};
export default PlacesPanel;
