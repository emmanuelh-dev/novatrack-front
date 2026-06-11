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
  image: {
    alignSelf: 'center',
    maxWidth: '200px',
    maxHeight: '100px',
    width: 'auto',
    height: 'auto',
    margin: theme.spacing(1),
  },
  text: {
    fontSize: '1.8rem',
    fontWeight: 'bold',
    letterSpacing: '2px',
    fontFamily: 'Outfit, Roboto, sans-serif',
  },
}));

const LogoImage = ({ color }) => {
  const theme = useTheme();
  const { classes } = useStyles();

  const expanded = !useMediaQuery(theme.breakpoints.down('lg'));

  const logo = useSelector((state) => state.session.server.attributes?.logo);
  const logoInverted = useSelector((state) => state.session.server.attributes?.logoInverted);

  if (logo) {
    if (expanded && logoInverted) {
      return <img className={classes.image} src={logoInverted} alt="" />;
    }
    return <img className={classes.image} src={logo} alt="" />;
  }

  return (
    <div className={classes.container}>
      <img className={classes.image} src="/logo.png" alt="Nova Track" />
      <span className={classes.text} style={{ color: color || theme.palette.text.primary }}>
        NOVA TRACK
      </span>
    </div>
  );
};

export default LogoImage;
