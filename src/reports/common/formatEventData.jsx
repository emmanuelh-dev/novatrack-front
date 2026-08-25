import { Link } from '@mui/material';
import { formatNumber, formatSpeed } from '../../common/util/formatter';
import { prefixString } from '../../common/util/stringUtils';
import MediaPreview from '../../common/components/MediaPreview';

const formatEventData = (event, { deviceUniqueId, speedUnit, t }) => {
  switch (event.type) {
    case 'alarm':
      return t(prefixString('alarm', event.attributes.alarm));
    case 'deviceOverspeed':
      return formatSpeed(event.attributes.speed, speedUnit, t);
    case 'driverChanged':
      return event.attributes.driverUniqueId;
    case 'deviceFuelDrop':
    case 'deviceFuelIncrease':
      return formatNumber(Math.abs(event.attributes.after - event.attributes.before));
    case 'media':
      return (
        <MediaPreview
          uniqueId={deviceUniqueId}
          file={event.attributes?.file}
          mediaType={event.attributes?.media}
        />
      );
    case 'commandResult':
      return event.attributes.result;
    default:
      return '';
  }
};

export default formatEventData;
