import { makeStyles } from 'tss-react/mui';
import { ListItemButton, ListItemIcon, ListItemText } from '@mui/material';
import { Link } from 'react-router-dom';

const useStyles = makeStyles()(() => ({
  menuItemText: {
    whiteSpace: 'nowrap',
  },
}));

const MenuItem = ({ title, link, icon, selected }) => {
  const { classes } = useStyles();
  return (
    <ListItemButton
      key={link}
      component={Link}
      to={link}
      selected={selected}
      aria-label={title}
      aria-current={selected ? 'page' : undefined}
      sx={{
        mx: 1,
        my: 0.5,
        borderRadius: 1,
        minHeight: 44,
        '& .MuiListItemIcon-root': { minWidth: 40 },
        '&.Mui-selected .MuiListItemText-primary': { fontWeight: 600 },
      }}
    >
      <ListItemIcon>{icon}</ListItemIcon>
      <ListItemText primary={title} className={classes.menuItemText} />
    </ListItemButton>
  );
};

export default MenuItem;
