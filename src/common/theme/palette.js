import { grey } from '@mui/material/colors';

export default (server, darkMode) => ({
  mode: darkMode ? 'dark' : 'light',
  background: {
    default: darkMode ? grey[900] : grey[50],
  },
  primary: {
    main: '#4DF425',
    contrastText: '#000000',
  },
  secondary: {
    main: '#4DF425',
    contrastText: '#000000',
  },
  neutral: {
    main: grey[500],
  },
  geometry: {
    main: '#3bb2d0',
  },
  alwaysDark: {
    main: grey[900],
  },
});
