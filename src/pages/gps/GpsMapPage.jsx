import React from 'react';
import GpsMap from '@/components/gps/GpsMap';
import { useGpsData } from '@/hooks/gps/useGpsData';
import { getLatestPositions } from '@/services/gps/gpsService';
import GpsPageShell from './GpsPageShell';

const GpsMapPage = () => {
  const { data: positions, loading } = useGpsData(() => getLatestPositions(), []);
  return (
    <GpsPageShell active="gps-mapa" title="Mapa de unidades" subtitle="Ubicacion actual y estado financiero por motocicleta.">
      {loading ? <div className="rounded-lg border bg-white p-6">Cargando mapa...</div> : <GpsMap positions={positions || []} height={620} />}
    </GpsPageShell>
  );
};

export default GpsMapPage;
