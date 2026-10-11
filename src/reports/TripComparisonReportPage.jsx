import { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import PageLayout from '../common/components/PageLayout';
import { useRestriction } from '../common/util/permissions';
import fetchOrThrow from '../common/util/fetchOrThrow';
import TripReport from '../routes/TripReport';
import ReportsMenu from './components/ReportsMenu';

const TripComparisonReportPage = () => {
  const devices = useSelector((state) => state.devices.items);
  const disabled = useRestriction('disableReports');
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    if (disabled) return undefined;
    const controller = new AbortController();
    setLoading(true);
    setError(false);
    fetchOrThrow('/api/orders', { signal: controller.signal })
      .then((response) => response.json())
      .then((items) => {
        if (!controller.signal.aborted) {
          setOrders(items.filter((item) => item.attributes?.routeTrip?.version === 1));
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [disabled, refresh]);
  return (
    <PageLayout menu={<ReportsMenu />} breadcrumbs={['reportTitle', 'tripReportTitle']}>
      <TripReport
        orders={orders}
        devices={devices}
        loading={loading}
        error={error}
        onRefresh={() => setRefresh((value) => value + 1)}
      />
    </PageLayout>
  );
};
export default TripComparisonReportPage;
