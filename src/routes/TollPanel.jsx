import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSelector } from 'react-redux';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  Link,
  LinearProgress,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import CheckIcon from '@mui/icons-material/Check';
import { useLocalization, useTranslation } from '../common/components/LocalizationProvider';
import { formatDistance, formatNumericHours, formatTime } from '../common/util/formatter';
import { useAttributePreference } from '../common/util/preferences';
import { tollRequest, validTollQuote, catalogTollRequest, validCatalogQuote } from './routePlan';
import TollPreference from './TollPreference';

const TollPanel = ({
  plan,
  onRoute,
  showing,
  calculation,
  preference: requestedPreference,
  preserveRoute = false,
}) => {
  const t = useTranslation();
  const { language } = useLocalization();
  const distanceUnit = useAttributePreference('distanceUnit', 'km');
  const enabled = useSelector((state) =>
    preserveRoute
      ? state.session.server.routingTollsCatalogEnabled
      : state.session.server.routingTollsEnabled,
  );
  const [axles, setAxles] = useState(2);
  const [extraAxles, setExtraAxles] = useState(0);
  const [localPreference, setLocalPreference] = useState('toll');
  const preference = requestedPreference || localPreference;
  const [alternatives, setAlternatives] = useState([]);
  const [quote, setQuote] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const pendingRef = useRef(null);
  const lastCalculationRef = useRef(null);
  const [expanded, setExpanded] = useState(false);
  useEffect(() => () => pendingRef.current?.abort(), []);
  const request = useMemo(
    () =>
      preserveRoute
        ? catalogTollRequest(
            calculation,
            plan.profile,
            plan.profile === 'car' ? 2 : axles,
            extraAxles,
          )
        : tollRequest(plan, axles, extraAxles, preference === 'both' ? 'toll' : preference),
    [plan, calculation, preserveRoute, axles, extraAxles, preference],
  );
  const money = useCallback(
    (amount) =>
      new Intl.NumberFormat(language === 'es' ? 'es-MX' : language.replace('_', '-'), {
        style: 'currency',
        currency: 'MXN',
        currencyDisplay: 'code',
      }).format(amount),
    [language],
  );
  const change = (setter, value) => {
    pendingRef.current?.abort();
    pendingRef.current = null;
    setLoading(false);
    setQuote(null);
    setAlternatives([]);
    setError('');
    onRoute(null);
    setter(value);
  };
  const calculate = useCallback(async () => {
    if (!request || !enabled) return;
    pendingRef.current?.abort();
    const controller = new AbortController();
    pendingRef.current = controller;
    setLoading(true);
    setQuote(null);
    setAlternatives([]);
    onRoute(null);
    setError('');
    let displayed = false;
    try {
      if (preserveRoute) {
        const response = await fetch('/api/routing/tolls/match', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(request),
          signal: controller.signal,
        });
        const data = await response.json();
        if (controller.signal.aborted || pendingRef.current !== controller) return;
        if (!response.ok || !validCatalogQuote(data)) {
          setError({ type: preference, key: 'tollsLookupFailed' });
          onRoute({ ...calculation, tollTotal: t('tollsPending') });
          return;
        }
        setQuote({ ...data, route: calculation });
        onRoute({
          ...calculation,
          charges: data.charges,
          tollTotal: data.complete
            ? money(data.total)
            : `${t('tollsPending')} · ${money(data.knownTotal)} ${t('tollsKnown')}`,
        });
        return;
      }
      await Promise.all(
        (preference === 'both' ? ['toll', 'free'] : [preference]).map(async (type) => {
          try {
            const response = await fetch('/api/routing/tolls', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ ...request, preference: type }),
              signal: controller.signal,
            });
            const data = await response.json();
            if (controller.signal.aborted || pendingRef.current !== controller) return;
            if (!response.ok || !validTollQuote(data)) {
              setError({
                type,
                key:
                  data.code === 'TOLLS_DISABLED'
                    ? 'tollsDisabled'
                    : data.code === 'NO_ROUTE'
                      ? 'routingNoRoute'
                      : 'tollsUnavailable',
              });
              return;
            }
            setAlternatives((current) => [...current, { type, data }]);
            if (!displayed) {
              displayed = true;
              setQuote(data);
              onRoute({ ...data.route, charges: data.charges, tollTotal: money(data.total) });
            }
          } catch {
            if (!controller.signal.aborted) setError({ type, key: 'tollsUnavailable' });
          }
        }),
      );
    } catch {
      if (!controller.signal.aborted && pendingRef.current === controller) {
        setError({ type: preference, key: 'tollsLookupFailed' });
        if (preserveRoute) onRoute({ ...calculation, tollTotal: t('tollsPending') });
      }
    } finally {
      if (!controller.signal.aborted && pendingRef.current === controller) setLoading(false);
    }
  }, [request, preference, enabled, onRoute, money, calculation, preserveRoute, t]);
  useEffect(() => {
    if (calculation === null && lastCalculationRef.current) {
      lastCalculationRef.current = null;
      pendingRef.current?.abort();
      pendingRef.current = null;
      setQuote(null);
      setAlternatives([]);
      setError('');
      setLoading(false);
    } else if (
      calculation &&
      (lastCalculationRef.current?.calculation !== calculation ||
        lastCalculationRef.current?.request !== request ||
        lastCalculationRef.current?.enabled !== enabled)
    ) {
      lastCalculationRef.current = { calculation, request, enabled };
      if (!preserveRoute) setExpanded(true);
      calculate();
    }
  }, [calculation, calculate, request, enabled, preserveRoute]);
  return (
    <Accordion
      expanded={expanded}
      onChange={(_, value) => setExpanded(value)}
      elevation={0}
      disableGutters
      sx={{ bgcolor: 'action.hover', '&::before': { display: 'none' } }}
    >
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Typography variant="subtitle2">{t('tollsTitle')}</Typography>
      </AccordionSummary>
      <AccordionDetails>
        <Stack spacing={2}>
          {!requestedPreference && (
            <TollPreference
              value={preference}
              onChange={(value) => change(setLocalPreference, value)}
            />
          )}
          {!enabled && <Alert severity="info">{t('tollsDisabled')}</Alert>}
          {!preserveRoute && plan.waypoints?.length > 0 && (
            <Alert severity="info">{t('tollsStops')}</Alert>
          )}
          <Accordion
            elevation={0}
            disableGutters
            sx={{ bgcolor: 'transparent', '&::before': { display: 'none' } }}
          >
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography variant="subtitle2">{t('tollsOptions')}</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Stack spacing={2}>
                {plan.profile === 'truck' && (
                  <TextField
                    select
                    label={t('tollsAxles')}
                    value={axles}
                    onChange={(event) => change(setAxles, event.target.value)}
                  >
                    {[2, 3, 4, 5, 6, 7, 8, 9].map((value) => (
                      <MenuItem key={value} value={value}>
                        {value}
                      </MenuItem>
                    ))}
                  </TextField>
                )}
                <TextField
                  select
                  label={t('tollsExtraAxles')}
                  value={extraAxles}
                  helperText={t('tollsExtraAxlesHelp')}
                  onChange={(event) => change(setExtraAxles, event.target.value)}
                >
                  {[0, 1, 2, 3, 4, 5].map((value) => (
                    <MenuItem key={value} value={value}>
                      {value}
                    </MenuItem>
                  ))}
                </TextField>
              </Stack>
            </AccordionDetails>
          </Accordion>
          <Button
            type="button"
            variant="contained"
            disabled={!enabled || !request || loading}
            onClick={calculate}
          >
            {t(loading ? 'routingCalculating' : 'tollsCalculate')}
          </Button>
          {loading && (
            <Stack spacing={1} role="status">
              <LinearProgress />
              <Typography variant="body2">{t('tollsLoading')}</Typography>
            </Stack>
          )}
          {!preserveRoute && preference === 'both' && alternatives.length > 0 && (
            <Stack spacing={1} aria-label={t('tollsCompare')}>
              {['toll', 'free'].map((type) => {
                const option = alternatives.find((item) => item.type === type);
                return (
                  option && (
                    <Button
                      key={type}
                      variant={quote === option.data ? 'contained' : 'text'}
                      aria-pressed={quote === option.data}
                      startIcon={quote === option.data ? <CheckIcon /> : undefined}
                      onClick={() => {
                        setQuote(option.data);
                        onRoute({
                          ...option.data.route,
                          charges: option.data.charges,
                          tollTotal: money(option.data.total),
                        });
                      }}
                    >
                      {t(`tollsPreference${type}`)} · {money(option.data.total)} ·{' '}
                      {formatDistance(option.data.route.distance, distanceUnit, t)} ·{' '}
                      {formatNumericHours(option.data.route.duration * 1000, t)}
                    </Button>
                  )
                );
              })}
            </Stack>
          )}
          {error && (
            <Alert severity="error">
              {t(`tollsPreference${error.type}`)}: {t(error.key)}
            </Alert>
          )}
          {quote && (
            <Stack spacing={1} aria-live="polite">
              {plan.profile === 'truck' && (
                <Alert severity="warning">{t('tollsTruckLimits')}</Alert>
              )}
              {quote.total > 0 &&
                alternatives.find((item) => item.data === quote)?.type === 'free' && (
                  <Alert severity="warning">{t('tollsFreeWarning')}</Alert>
                )}
              <Typography variant="h6">
                {quote.total === null ? t('tollsPending') : money(quote.total)}
              </Typography>
              {preserveRoute && !quote.complete && (
                <Alert severity="warning">
                  {t('tollsPartial')} · {t('tollsKnown')}: {money(quote.knownTotal)}
                  {quote.pendingSections > 0 &&
                    ` · ${quote.pendingSections} ${t('tollsUnmatchedSections')}`}
                </Alert>
              )}
              <Typography variant="body2">
                {t(plan.profile === 'truck' ? 'routingTruck' : 'routingCar')} · {axles}{' '}
                {t('tollsAxles').toLowerCase()} · {extraAxles} {t('tollsExtraAxles').toLowerCase()}
              </Typography>
              <Typography variant="body2">
                {formatDistance(quote.route.distance, distanceUnit, t)} ·{' '}
                {formatNumericHours(quote.route.duration * 1000, t)}
              </Typography>
              {quote.charges.length === 0 && quote.total === 0 && (
                <Typography variant="body2">{t('tollsNoCharges')}</Typography>
              )}
              {!preserveRoute && (
                <Button
                  type="button"
                  onClick={() =>
                    onRoute(
                      showing
                        ? null
                        : { ...quote.route, charges: quote.charges, tollTotal: money(quote.total) },
                    )
                  }
                >
                  {t(showing ? 'tollsBackRoute' : 'tollsShowRoute')}
                </Button>
              )}
              <Accordion
                elevation={0}
                disableGutters
                sx={{ bgcolor: 'transparent', '&::before': { display: 'none' } }}
              >
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Typography variant="body2">{t('tollsDetails')}</Typography>
                </AccordionSummary>
                <AccordionDetails>
                  <Stack spacing={1}>
                    {quote.charges.map((charge, index) => (
                      <Box key={index} sx={{ py: 1 }}>
                        <Typography variant="subtitle2">
                          {t('tollsCharge')} {index + 1} ·{' '}
                          {charge.amount === null ? t('tollsPending') : money(charge.amount)}
                        </Typography>
                        {charge.tariffDate && (
                          <Typography variant="caption" color="text.secondary">
                            {t('tollsTariffUpdated')}: {charge.tariffDate.split(' ')[0]}
                          </Typography>
                        )}
                        {charge.description && (
                          <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>
                            {charge.description}
                          </Typography>
                        )}
                      </Box>
                    ))}
                    {quote.roadWarning && <Alert severity="warning">{t('tollsRoadWarning')}</Alert>}
                    <Typography variant="body2" color="text.secondary">
                      {t(preserveRoute ? 'tollsCatalogMapHelp' : 'tollsMapHelp')}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {t('tollsCalculated')}: {formatTime(quote.calculatedAt, 'minutes')}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {preserveRoute ? `INEGI · RNC ${quote.edition}` : t('tollsTariffDate')}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {t('tollsLimits')}
                    </Typography>
                    {!preserveRoute && (
                      <Stack
                        direction="row"
                        spacing={2}
                        alignItems="center"
                        sx={{ bgcolor: 'common.white', p: 1, borderRadius: 1 }}
                      >
                        <Box
                          component="img"
                          src="/inegi.svg"
                          alt="INEGI"
                          sx={{ width: 110, height: 30, objectFit: 'contain' }}
                        />
                        <Box
                          component="img"
                          src="/sakbe.png"
                          alt="SAKBÉ API de Ruteo"
                          sx={{ width: 90, height: 35, objectFit: 'contain' }}
                        />
                      </Stack>
                    )}
                    <Link
                      href={
                        preserveRoute ? quote.source : 'https://www.inegi.org.mx/servicios/Ruteo/'
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                      variant="caption"
                    >
                      {preserveRoute
                        ? `INEGI · RNC ${quote.edition}`
                        : `${quote.source} · INEGI — API de Ruteo SAKBÉ`}
                    </Link>
                  </Stack>
                </AccordionDetails>
              </Accordion>
            </Stack>
          )}
        </Stack>
      </AccordionDetails>
    </Accordion>
  );
};
export default TollPanel;
