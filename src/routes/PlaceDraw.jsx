import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css';
import MapboxDraw from '@mapbox/mapbox-gl-draw';
import { LngLatBounds } from 'maplibre-gl';
import { useEffect, useMemo, useRef } from 'react';
import { useTheme } from '@mui/material';
import { map } from '../map/core/MapView';
import { geofenceToFeature, geometryToArea } from '../map/core/mapUtil';
import drawTheme from '../map/draw/theme';
import { useTranslation } from '../common/components/LocalizationProvider';

MapboxDraw.constants.classes.CANVAS = 'maplibregl-canvas';
MapboxDraw.constants.classes.CONTROL_BASE = 'maplibregl-ctrl';
MapboxDraw.constants.classes.CONTROL_PREFIX = 'maplibregl-ctrl-';
MapboxDraw.constants.classes.CONTROL_GROUP = 'maplibregl-ctrl-group';
const PlaceDraw = ({ area, onChange }) => {
  const theme = useTheme();
  const t = useTranslation();
  const initialAreaRef = useRef(area);
  const callbackRef = useRef(onChange);
  callbackRef.current = onChange;
  const draw = useMemo(
    () =>
      new MapboxDraw({
        displayControlsDefault: false,
        controls: { polygon: true, trash: true },
        styles: drawTheme,
      }),
    [],
  );
  useEffect(() => {
    const add = () => {
      map.addControl(draw, 'top-left');
      for (const [selector, label] of [
        ['.mapbox-gl-draw_polygon', t('placePolygon')],
        ['.mapbox-gl-draw_trash', t('sharedRemove')],
      ]) {
        const button = map.getContainer().querySelector(selector);
        button.title = label;
        button.setAttribute('aria-label', label);
      }
      if (!initialAreaRef.current) draw.changeMode('draw_polygon');
    };
    if (map.loaded()) add();
    else map.once('idle', add);
    const update = (event) => {
      if (event.features[0]?.geometry.type !== 'Polygon') return;
      const feature = event.features[0];
      draw
        .getAll()
        .features.filter((item) => item.id !== feature.id)
        .forEach((item) => draw.delete(item.id));
      callbackRef.current(geometryToArea(feature.geometry));
    };
    const remove = () => callbackRef.current('');
    map.on('draw.create', update);
    map.on('draw.update', update);
    map.on('draw.delete', remove);
    return () => {
      map.off('idle', add);
      map.off('draw.create', update);
      map.off('draw.update', update);
      map.off('draw.delete', remove);
      if (map.hasControl(draw)) map.removeControl(draw);
    };
  }, [draw, t]);
  useEffect(() => {
    const add = () => {
      if (area && map.hasControl(draw) && !draw.getAll().features.length) {
        const feature = geofenceToFeature(theme, { id: 'draft', name: '', area, attributes: {} });
        draw.add(feature);
        const coordinates = feature.geometry.coordinates[0];
        const bounds = coordinates.reduce(
          (value, coordinate) => value.extend(coordinate),
          new LngLatBounds(coordinates[0], coordinates[0]),
        );
        const canvas = map.getCanvas();
        map.fitBounds(bounds, {
          padding: Math.min(canvas.width, canvas.height) * 0.1,
          duration: 0,
        });
      }
    };
    if (map.hasControl(draw)) add();
    else map.once('idle', add);
    return () => map.off('idle', add);
  }, [area, draw, theme]);
  return null;
};
export default PlaceDraw;
