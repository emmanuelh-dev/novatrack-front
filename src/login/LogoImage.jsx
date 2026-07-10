import { useTheme, useMediaQuery } from '@mui/material';
import { useSelector } from 'react-redux';
import { makeStyles } from 'tss-react/mui';

const useStyles = makeStyles()((theme) => ({
  container: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: theme.spacing(1),
  },
  text: {
    fontSize: '2.5rem',
    fontWeight: '800',
    letterSpacing: '1px',
    fontFamily: "'Cabinet Grotesk', sans-serif",
  },
}));

const LogoImage = ({ color }) => {
  const theme = useTheme();
  const { classes } = useStyles();

  return (
    <div className={classes.container}>
      <span className={classes.text} style={{ color: color || theme.palette.text.primary }}>
        ANACONDA
      </span>
    </div>
  );
};

export default LogoImage;
