import React from 'react';
import GpsAlertTable from '@/components/gps/GpsAlertTable';
import { useGpsData } from '@/hooks/gps/useGpsData';
import { getGpsAlerts, markAlertAsResolved } from '@/services/gps/gpsService';
import GpsPageShell from './GpsPageShell';

const GpsAlertsPage = () => {
  const { data: alerts, loading } = useGpsData(() => getGpsAlerts(), []);
  return (
    <GpsPageShell active="gps-alertas" title="Alertas GPS" subtitle="Alertas financieras y tecnicas para monitoreo y recuperacion.">
      {loading ? <div className="rounded-lg border bg-white p-6">Cargando alertas...</div> : <GpsAlertTable alerts={alerts || []} onResolve={markAlertAsResolved} />}
    </GpsPageShell>
  );
};

export default GpsAlertsPage;
