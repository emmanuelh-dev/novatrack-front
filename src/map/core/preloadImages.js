import backhoeSvg from '../../resources/images/categories/backhoe.svg?no-inline';
import backhoeSource from '../../resources/images/categories/backhoe.svg?raw';
import dumpTruckSvg from '../../resources/images/categories/dump-truck.svg?no-inline';
import dumpTruckSource from '../../resources/images/categories/dump-truck.svg?raw';
import tramSource from '../../resources/images/categories/tram.svg?raw';
import trainSource from '../../resources/images/categories/train.svg?raw';
import planeSource from '../../resources/images/categories/plane.svg?raw';
import helicopterSource from '../../resources/images/categories/helicopter.svg?raw';
import shipSource from '../../resources/images/categories/ship.svg?raw';
import boatSource from '../../resources/images/categories/boat.svg?raw';
import scooterSource from '../../resources/images/categories/scooter.svg?raw';
import bicycleSource from '../../resources/images/categories/bicycle.svg?raw';
import motorcycleSource from '../../resources/images/categories/motorcycle.svg?raw';
import tractorSource from '../../resources/images/categories/tractor.svg?raw';
import craneSource from '../../resources/images/categories/crane.svg?raw';
import camperSvg from '../../resources/images/categories/camper.svg?no-inline';
import camperSource from '../../resources/images/categories/camper.svg?raw';
import { vehicleColors, vehicleColor, colorizeVehicleSvg } from '../../common/util/vehicleColors';
import pickupSource from '../../resources/images/categories/pickup.svg?raw';
import busSource from '../../resources/images/categories/bus.svg?raw';
import truckSource from '../../resources/images/categories/truck.svg?raw';
import vanSource from '../../resources/images/categories/van.svg?raw';
import trailerSource from '../../resources/images/categories/trailer.svg?raw';
import carSource from '../../resources/images/categories/car.svg?raw';
import truckTractorSource from '../../resources/images/categories/truck-tractor.svg?raw';
import { grey } from '@mui/material/colors';
import { createTheme } from '@mui/material';
import { loadImage, prepareIcon } from './mapUtil';

import directionSvg from '../../resources/images/direction.svg';
import backgroundSvg from '../../resources/images/background.svg';
import dashcamSvg from '../../resources/images/categories/dashcam.svg';
import truckTractorSvg from '../../resources/images/categories/truck-tractor.svg?no-inline';
import pickupSvg from '../../resources/images/categories/pickup.svg?no-inline';
import animalSvg from '@material-symbols/svg-600/outlined/pets.svg';
import bicycleSvg from '../../resources/images/categories/bicycle.svg?no-inline';
import boatSvg from '../../resources/images/categories/boat.svg?no-inline';
import busSvg from '../../resources/images/categories/bus.svg?no-inline';
import carSvg from '../../resources/images/categories/car.svg?no-inline';
import craneSvg from '../../resources/images/categories/crane.svg?no-inline';
import defaultSvg from '@material-symbols/svg-600/outlined/location_on.svg';
import startSvg from '@material-symbols/svg-600/outlined/play_circle.svg';
import finishSvg from '@material-symbols/svg-600/outlined/stop_circle.svg';
import helicopterSvg from '../../resources/images/categories/helicopter.svg?no-inline';
import motorcycleSvg from '../../resources/images/categories/motorcycle.svg?no-inline';
import personSvg from '@material-symbols/svg-600/outlined/person.svg';
import planeSvg from '../../resources/images/categories/plane.svg?no-inline';
import scooterSvg from '../../resources/images/categories/scooter.svg?no-inline';
import shipSvg from '../../resources/images/categories/ship.svg?no-inline';
import tractorSvg from '../../resources/images/categories/tractor.svg?no-inline';
import trailerSvg from '../../resources/images/categories/trailer.svg?no-inline';
import trainSvg from '../../resources/images/categories/train.svg?no-inline';
import tramSvg from '../../resources/images/categories/tram.svg?no-inline';
import truckSvg from '../../resources/images/categories/truck.svg?no-inline';
import vanSvg from '../../resources/images/categories/van.svg?no-inline';

import warningSvg from '@material-symbols/svg-600/outlined/warning.svg';
import taskAltSvg from '@material-symbols/svg-600/outlined/task_alt.svg';
import arrowCircleDownSvg from '@material-symbols/svg-600/outlined/arrow_circle_down.svg';
import arrowCircleUpSvg from '@material-symbols/svg-600/outlined/arrow_circle_up.svg';
import bedtimeSvg from '@material-symbols/svg-600/outlined/bedtime.svg';
import cloudOffSvg from '@material-symbols/svg-600/outlined/cloud_off.svg';
import cloudDoneSvg from '@material-symbols/svg-600/outlined/cloud_done.svg';
import speedSvg from '@material-symbols/svg-600/outlined/speed.svg';
import cloudAlertSvg from '@material-symbols/svg-600/outlined/cloud_alert.svg';
import distanceSvg from '@material-symbols/svg-600/outlined/distance.svg';
import powerOffSvg from '@material-symbols/svg-600/outlined/power_off.svg';
import powerSvg from '@material-symbols/svg-600/outlined/power.svg';
import buildSvg from '@material-symbols/svg-600/outlined/build.svg';
import imageSvg from '@material-symbols/svg-600/outlined/image.svg';
import connectWithoutContactSvg from '@material-symbols/svg-600/outlined/connect_without_contact.svg';
import smsSvg from '@material-symbols/svg-600/outlined/sms.svg';

export const mapIcons = {
  animal: animalSvg,
  backhoe: backhoeSvg,
  bicycle: bicycleSvg,
  boat: boatSvg,
  bus: busSvg,
  car: carSvg,
  camper: camperSvg,
  crane: craneSvg,
  dashcam: dashcamSvg,
  dumpTruck: dumpTruckSvg,
  default: defaultSvg,
  finish: finishSvg,
  helicopter: helicopterSvg,
  motorcycle: motorcycleSvg,
  person: personSvg,
  pickup: pickupSvg,
  plane: planeSvg,
  scooter: scooterSvg,
  ship: shipSvg,
  start: startSvg,
  tractor: tractorSvg,
  trailer: trailerSvg,
  train: trainSvg,
  tram: tramSvg,
  truck: truckSvg,
  truckTractor: truckTractorSvg,
  van: vanSvg,
};

const coloredVehicleIcons = Object.fromEntries(
  [
    ['backhoe', backhoeSource],
    ['camper', camperSource],
    ['crane', craneSource],
    ['tractor', tractorSource],
    ['motorcycle', motorcycleSource],
    ['bicycle', bicycleSource],
    ['scooter', scooterSource],
    ['boat', boatSource],
    ['ship', shipSource],
    ['helicopter', helicopterSource],
    ['plane', planeSource],
    ['train', trainSource],
    ['tram', tramSource],
    ['dumpTruck', dumpTruckSource],
    ['car', carSource],
    ['pickup', pickupSource],
    ['bus', busSource],
    ['truck', truckSource],
    ['van', vanSource],

    ['trailer', trailerSource],
    ['truckTractor', truckTractorSource],
  ].map(([key, svg]) => [
    key,
    Object.fromEntries(
      vehicleColors.map(({ id }) => [
        id,
        `data:image/svg+xml;charset=utf-8,${encodeURIComponent(colorizeVehicleSvg(svg, id))}`,
      ]),
    ),
  ]),
);
const fullColorSvgIcons = new Set([
  ...Object.keys(coloredVehicleIcons).map((key) => mapIcons[key]),
  ...Object.values(coloredVehicleIcons).flatMap(Object.values),
]);
export const isVehicleIcon = (icon) => icon.endsWith('.png') || fullColorSvgIcons.has(icon);

export const vehicleIconUrl = (category, color) => {
  const key = mapIconKey(category);
  return coloredVehicleIcons[key]?.[vehicleColor(color)] || mapIcons[key];
};

export const vehicleImageKey = (category, color, status) => {
  const key = mapIconKey(category);
  const body = vehicleColor(color);
  return `${key}${coloredVehicleIcons[key] && body !== 'blue' ? `-${body}` : ''}-${status}`;
};

export const mapIconKey = (category) => {
  switch (category) {
    case 'offroad':
      return 'car';
    case 'trolleybus':
      return 'bus';
    default:
      return mapIcons.hasOwnProperty(category) ? category : 'default';
  }
};

export const eventIcons = {
  alarm: warningSvg,
  commandResult: taskAltSvg,
  deviceFuelDrop: arrowCircleDownSvg,
  deviceFuelIncrease: arrowCircleUpSvg,
  deviceInactive: bedtimeSvg,
  deviceMoving: startSvg,
  deviceOffline: cloudOffSvg,
  deviceOnline: cloudDoneSvg,
  deviceOverspeed: speedSvg,
  deviceStopped: finishSvg,
  deviceUnknown: cloudAlertSvg,
  driverChanged: personSvg,
  geofenceCrossed: distanceSvg,
  geofenceEnter: distanceSvg,
  geofenceExit: distanceSvg,
  ignitionOff: powerOffSvg,
  ignitionOn: powerSvg,
  maintenance: buildSvg,
  media: imageSvg,
  proximityEnter: connectWithoutContactSvg,
  proximityExit: connectWithoutContactSvg,
  queuedCommandSent: taskAltSvg,
  textMessage: smsSvg,
  unaccompaniedMotion: connectWithoutContactSvg,
};

export const eventIconKey = (type) => (eventIcons.hasOwnProperty(type) ? type : 'alarm');

export const mapImages = {};

const theme = createTheme({
  palette: {
    neutral: { main: grey[500] },
  },
});

export default async () => {
  const background = await loadImage(backgroundSvg);
  mapImages.background = await prepareIcon(background);
  mapImages.direction = await prepareIcon(await loadImage(directionSvg));
  await Promise.all(
    Object.keys(mapIcons).map(async (key) => {
      const colors = coloredVehicleIcons[key] ? vehicleColors.map(({ id }) => id) : ['blue'];
      await Promise.all(
        colors.map(async (body) => {
          const url = vehicleIconUrl(key, body);
          const icon = await loadImage(url);
          ['info', 'success', 'error', 'neutral'].forEach((status) => {
            mapImages[vehicleImageKey(key, body, status)] = prepareIcon(
              background,
              icon,
              theme.palette[status].main,
              undefined,
              isVehicleIcon(url),
            );
          });
        }),
      );
    }),
  );
  await Promise.all(
    Object.keys(eventIcons).map((key) =>
      loadImage(eventIcons[key]).then((icon) => {
        mapImages[key] = prepareIcon(background, icon, theme.palette.neutral.main);
      }),
    ),
  );
};
