import React from 'react';
import GpsFinancialRiskTable from '@/components/gps/GpsFinancialRiskTable';
import { useGpsData } from '@/hooks/gps/useGpsData';
import { getFinancialRiskRows } from '@/services/gps/gpsService';
import GpsPageShell from './GpsPageShell';

const GpsFinancingPage = () => {
  const { data: rows, loading } = useGpsData(() => getFinancialRiskRows(), []);
  return (
    <GpsPageShell active="gps-financiamiento" title="Riesgo financiero" subtitle="Clientes financiados priorizados por atraso, ubicacion y estado del GPS.">
      {loading ? <div className="rounded-lg border bg-white p-6">Cargando cartera...</div> : <GpsFinancialRiskTable rows={rows || []} />}
    </GpsPageShell>
  );
};

export default GpsFinancingPage;
