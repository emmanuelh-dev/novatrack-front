import { useEffect, useLayoutEffect } from 'react';
import { GlobalStyles, useTheme } from '@mui/material';
import { Marker, Popup } from 'maplibre-gl';
import tollSvg from '@material-symbols/svg-600/outlined/toll.svg?raw';
import pinSvg from '@material-symbols/svg-600/outlined/location_on.svg?raw';
import pencilSvg from '@material-symbols/svg-600/outlined/edit.svg?raw';
import { map } from '../map/core/MapView';
import { fromMapCoordinates, toMapCoordinates } from '../map/core/mapUtil';
import MapCamera from '../map/MapCamera';
import MapRouteCoordinates from '../map/MapRouteCoordinates';
import { routePoint } from './routePlan';
import { useLocalization, useTranslation } from '../common/components/LocalizationProvider';

const RouteMap = ({
  origin,
  destination,
  result,
  onPoint,
  visible,
  position,
  cameraPoint,
  addressPoint,
  waypoints,
  alternatives = [],
  onAlternative,
}) => {
  const theme = useTheme();
  const t = useTranslation();
  const { language } = useLocalization();
  const cursor = (svg, tip) =>
    `url("data:image/svg+xml,${encodeURIComponent(
      svg
        .replaceAll('"48"', '"32"')
        .replace(
          '<path ',
          `<path fill="${theme.palette.primary.main}" stroke="${theme.palette.background.paper}" stroke-width="45" paint-order="stroke" `,
        ),
    )}") ${tip}, crosshair`;
  useLayoutEffect(() => {
    if (visible) map.resize();
  }, [visible]);
  useEffect(() => {
    let active = true;
    const click = (event) => {
      // Layer handlers can consume the click after this listener runs.
      queueMicrotask(() => {
        if (!active || event.defaultPrevented) return;
        const [longitude, latitude] = fromMapCoordinates(event.lngLat.lng, event.lngLat.lat);
        onPoint?.({ latitude: latitude.toFixed(6), longitude: longitude.toFixed(6) });
      });
    };
    map.on('click', click);
    return () => {
      active = false;
      map.off('click', click);
    };
  }, [onPoint]);

  useEffect(() => {
    const markers = [origin, destination, position, addressPoint, ...(waypoints || [])].map(
      (point, index) => {
        const valid = routePoint(point);
        if (!valid) return null;
        const element = document.createElement('div');
        element.textContent = ['A', 'B', '●'][index];
        element.title = ['Origen', 'Destino', 'Unidad'][index];
        if (index >= 4) {
          element.textContent = String(index - 3);
          element.title = point.label || String(index - 3);
          element.setAttribute('role', 'img');
          element.setAttribute('aria-label', element.title);
        }
        element.style.cssText = `background:${theme.palette.primary.main};color:${theme.palette.primary.contrastText};border-radius:50%;width:32px;height:32px;display:grid;place-items:center;font-weight:bold;box-shadow:0 2px 6px #0004`;
        if (index === 3) {
          element.innerHTML = pinSvg;
          element.title = point.label;
          element.setAttribute('role', 'img');
          element.setAttribute('aria-label', point.label);
          element.style.cssText = `fill:${theme.palette.primary.main};stroke:${theme.palette.background.paper};stroke-width:20;paint-order:stroke;width:36px;height:36px;pointer-events:none;filter:drop-shadow(0 2px 2px #0004)`;
        }
        return new Marker({ element, anchor: index === 3 ? 'bottom' : 'center' })
          .setLngLat(toMapCoordinates(valid.longitude, valid.latitude))
          .addTo(map);
      },
    );
    return () => markers.forEach((marker) => marker?.remove());
  }, [origin, destination, position, addressPoint, waypoints, theme]);

  useEffect(() => {
    const markers = (result?.accessPoints || []).map((access, index) => {
      if (access.distance <= 20) return null;
      const point = routePoint(access.point);
      if (!point) return null;
      const element = document.createElement('div');
      element.textContent =
        index === 0
          ? t('routingRoadStart')
          : index === result.accessPoints.length - 1
            ? t('routingRoadEnd')
            : `${t('tripStop')} ${index}`;
      element.title = `${element.textContent} · ${Math.round(access.distance)} m`;
      element.setAttribute('role', 'img');
      element.setAttribute('aria-label', element.title);
      element.style.cssText = `background:${theme.palette.warning.main};color:${theme.palette.warning.contrastText};padding:6px 10px;border-radius:12px;font-weight:600;box-shadow:0 2px 6px #0004;pointer-events:none`;
      return new Marker({ element, anchor: 'bottom' })
        .setLngLat(toMapCoordinates(point.longitude, point.latitude))
        .addTo(map);
    });
    return () => markers.forEach((marker) => marker?.remove());
  }, [result?.accessPoints, theme, t]);

  useEffect(() => {
    const popup = new Popup({ className: 'route-toll-popup', offset: 24, focusAfterOpen: false });
    const money = new Intl.NumberFormat(language === 'es' ? 'es-MX' : language.replace('_', '-'), {
      style: 'currency',
      currency: 'MXN',
      currencyDisplay: 'code',
    });
    const markers = (result?.charges || []).map((charge, index) => {
      const point = routePoint(charge.point);
      if (!point) return null;
      const label = `${t('tollsBooth')} ${index + 1} · ${charge.amount === null ? t('tollsPending') : money.format(charge.amount)}`;
      const content = document.createElement('div');
      const title = document.createElement('strong');
      title.textContent = label;
      const description = document.createElement('p');
      description.textContent = charge.description;
      description.style.cssText = 'margin:8px 0 0;overflow-wrap:anywhere';
      content.append(title, description);
      const element = document.createElement('button');
      element.type = 'button';
      element.className = 'route-toll-marker';
      element.title = label;
      element.setAttribute('aria-label', label);
      element.innerHTML = tollSvg;
      element.firstElementChild.setAttribute('aria-hidden', 'true');
      const price = document.createElement('span');
      price.textContent = charge.amount === null ? t('tollsPending') : money.format(charge.amount);
      element.append(price);
      element.onclick = (event) => {
        event.stopPropagation();
        popup
          .remove()
          .setLngLat(toMapCoordinates(point.longitude, point.latitude))
          .setDOMContent(content)
          .addTo(map);
      };
      return new Marker({ element })
        .setLngLat(toMapCoordinates(point.longitude, point.latitude))
        .addTo(map);
    });
    return () => {
      popup.remove();
      markers.forEach((marker) => marker?.remove());
    };
  }, [result?.charges, language, t]);

  const start = routePoint(cameraPoint || origin);
  const coordinates =
    result?.geometry?.coordinates ||
    (waypoints?.length
      ? [origin, ...waypoints, destination, position]
          .map(routePoint)
          .filter(Boolean)
          .map((point) => [point.longitude, point.latitude])
      : undefined);
  return (
    <>
      <GlobalStyles
        styles={{
          '.route-toll-marker': {
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            minWidth: 44,
            height: 44,
            padding: '0 8px',
            border: 0,
            borderRadius: 16,
            cursor: 'pointer',
            background: theme.palette.info.main,
            color: theme.palette.info.contrastText,
            font: 'inherit',
            fontWeight: 700,
            fontSize: 13,
            whiteSpace: 'nowrap',
            boxShadow: theme.shadows[3],
            '& svg': { width: 22, height: 22, fill: 'currentColor' },
            '&:focus-visible': {
              outline: `3px solid ${theme.palette.text.primary}`,
              outlineOffset: 3,
            },
          },
          '.route-toll-popup .maplibregl-popup-content': {
            background: theme.palette.background.paper,
            color: theme.palette.text.primary,
            padding: '16px 28px 16px 16px',
            borderRadius: 12,
            boxShadow: theme.shadows[3],
            fontFamily: theme.typography.fontFamily,
            fontSize: 14,
          },
          '.route-toll-popup .maplibregl-popup-close-button': {
            color: theme.palette.text.primary,
            fontSize: 20,
          },
          '.route-toll-popup:is(.maplibregl-popup-anchor-bottom, .maplibregl-popup-anchor-bottom-left, .maplibregl-popup-anchor-bottom-right) .maplibregl-popup-tip':
            {
              borderTopColor: theme.palette.background.paper,
            },
          '.route-toll-popup:is(.maplibregl-popup-anchor-top, .maplibregl-popup-anchor-top-left, .maplibregl-popup-anchor-top-right) .maplibregl-popup-tip':
            {
              borderBottomColor: theme.palette.background.paper,
            },
          '.route-toll-popup.maplibregl-popup-anchor-left .maplibregl-popup-tip': {
            borderRightColor: theme.palette.background.paper,
          },
          '.route-toll-popup.maplibregl-popup-anchor-right .maplibregl-popup-tip': {
            borderLeftColor: theme.palette.background.paper,
          },
          '.maplibregl-map .maplibregl-canvas-container.maplibregl-interactive': {
            cursor: onPoint ? cursor(pinSvg, '16 30') : undefined,
          },
          '.maplibregl-map:has(.mapbox-gl-draw_polygon.active) .maplibregl-canvas-container.maplibregl-interactive':
            {
              cursor: cursor(pencilSvg, '4 28'),
            },
        }}
      />
      {cameraPoint !== null && (
        <MapCamera
          latitude={start?.latitude ?? 25.6866}
          longitude={start?.longitude ?? -100.3161}
          coordinates={coordinates}
          padding={result?.geometry ? 80 : undefined}
          visible={visible}
        />
      )}
      {alternatives
        .filter((route) => route.geometry !== result?.geometry)
        .map((route, index) => (
          <MapRouteCoordinates
            key={index}
            name=""
            coordinates={route.geometry.coordinates}
            color={theme.palette.warning.main}
            minWidth={4}
            onClick={(event) => {
              event.preventDefault();
              onAlternative?.(route);
            }}
          />
        ))}
      {result?.geometry && (
        <MapRouteCoordinates
          name=""
          coordinates={result.geometry.coordinates}
          minWidth={5}
          onClick={(event) => event.preventDefault()}
        />
      )}
    </>
  );
};
export default RouteMap;
