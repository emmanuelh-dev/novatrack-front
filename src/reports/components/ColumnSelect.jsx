import { useId } from 'react';
import { FormControl, InputLabel, MenuItem, Select } from '@mui/material';
import { useTranslation } from '../../common/components/LocalizationProvider';
import useReportStyles from '../common/useReportStyles';

const ColumnSelect = ({ columns, setColumns, columnsArray, rawValues, disabled }) => {
  const { classes } = useReportStyles();
  const t = useTranslation();
  const columnsLabelId = useId();

  return (
    <div className={classes.filterItem}>
      <FormControl fullWidth>
        <InputLabel id={columnsLabelId}>{t('sharedColumns')}</InputLabel>
        <Select
          labelId={columnsLabelId}
          label={t('sharedColumns')}
          value={columns}
          onChange={(e) => setColumns(e.target.value)}
          multiple
          disabled={disabled}
        >
          {columnsArray.map(([key, string]) => (
            <MenuItem key={key} value={key}>
              {rawValues ? string : t(string)}
            </MenuItem>
          ))}
        </Select>
      </FormControl>
    </div>
  );
};

export default ColumnSelect;
