import { useState } from 'react';
import { Alert, IconButton } from '@mui/material';
import ReplayIcon from '@mui/icons-material/Replay';
import { useDispatch, useSelector } from 'react-redux';
import { useAsyncTask } from './reactHelper';
import { sessionActions } from './store';
import Loader from './common/components/Loader';
import { extendTollCapability } from './common/util/serverCapabilities';

const ServerProvider = ({ children }) => {
  const dispatch = useDispatch();

  const initialized = useSelector((state) => !!state.session.server);
  const [error, setError] = useState(null);

  useAsyncTask(
    async ({ signal }) => {
      if (!error) {
        try {
          const response = await fetch('/api/server', { signal });
          if (response.ok) {
            const server = await extendTollCapability(await response.json(), signal);
            if (!signal.aborted) dispatch(sessionActions.updateServer(server));
          } else {
            const message = await response.text();
            throw Error(message || response.statusText);
          }
        } catch (error) {
          if (!signal.aborted) setError(error.message);
        }
      }
    },
    [error, dispatch],
  );

  if (error) {
    return (
      <Alert
        severity="error"
        action={
          <IconButton color="inherit" size="small" onClick={() => setError(null)}>
            <ReplayIcon fontSize="inherit" />
          </IconButton>
        }
      >
        {error}
      </Alert>
    );
  }
  if (!initialized) {
    return <Loader />;
  }
  return children;
};

export default ServerProvider;
