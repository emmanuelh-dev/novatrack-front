import { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { Autocomplete, TextField } from '@mui/material';
import { placePoint } from '../../routes/routePlan';
import { useTranslation } from './LocalizationProvider';

const AddressSearch = ({
  value,
  onChange,
  onSelect,
  disabled,
  latitude = 25.6866,
  longitude = -100.3161,
  label,
  places = [],
}) => {
  const t = useTranslation();
  const enabled = useSelector((state) => state.session.server.routingSearchEnabled);
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setOptions([]);
    setLoading(false);
    setFailed(false);
    if (!enabled || disabled || value.trim().length < 3) return () => controller.abort();
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const query = new URLSearchParams({ q: value, latitude, longitude });
        const response = await fetch(`/api/routing/search?${query}`, { signal: controller.signal });
        if (!response.ok) throw new Error();
        const data = await response.json();
        if (!controller.signal.aborted) setOptions(data);
      } catch {
        if (!controller.signal.aborted) setFailed(true);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [value, enabled, disabled, latitude, longitude]);
  return (
    <Autocomplete
      freeSolo
      openOnFocus={places.length > 0}
      disabled={disabled}
      options={[
        ...places
          .filter(
            (item) =>
              placePoint(item) && item.name.toLocaleLowerCase().includes(value.toLocaleLowerCase()),
          )
          .map((item) => ({ ...placePoint(item), label: item.name, id: item.id })),
        ...options,
      ]}
      filterOptions={(items) => items}
      loading={loading}
      inputValue={value}
      value={null}
      getOptionKey={(option) =>
        `${option.id || ''}:${option.label}:${option.latitude}:${option.longitude}`
      }
      getOptionLabel={(option) => (typeof option === 'string' ? option : option.label)}
      onInputChange={(_, input, reason) => {
        if (reason === 'input' || reason === 'clear') onChange(input);
      }}
      onChange={(_, item) => {
        if (item && typeof item !== 'string') onSelect(item);
      }}
      renderInput={(params) => (
        <TextField
          {...params}
          label={label || t('placeAddress')}
          error={failed}
          helperText={
            failed
              ? t('placeSearchError')
              : !enabled
                ? t(places.length ? 'placeSearchSavedHelp' : 'placeSearchDisabled')
                : undefined
          }
        />
      )}
    />
  );
};
export default AddressSearch;
