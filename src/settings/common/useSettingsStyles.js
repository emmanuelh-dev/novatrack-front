import { makeStyles } from 'tss-react/mui';

export default makeStyles()((theme) => ({
  table: {
    flexShrink: 0,
    marginBottom: theme.spacing(10),
  },
  columnAction: {
    width: '1%',
    paddingRight: theme.spacing(1),
  },
  container: {
    marginTop: theme.spacing(2),
    marginBottom: theme.spacing(3),
  },
  buttons: {
    marginTop: theme.spacing(2),
    marginBottom: theme.spacing(2),
    display: 'flex',
    justifyContent: 'flex-end',
    gap: theme.spacing(2),
    '& > *': {
      flexBasis: '33%',
    },
  },
  details: {
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing(2),
    paddingBottom: theme.spacing(3),
  },
  verticalActions: {
    display: 'flex',
    flexDirection: 'column',
  },
}));
