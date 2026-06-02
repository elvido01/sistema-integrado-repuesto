import React from 'react';
import { BellRing, Plus } from 'lucide-react';
import GpsDashboardStats from '@/components/gps/GpsDashboardStats';
import GpsMap from '@/components/gps/GpsMap';
import GpsAlertTable from '@/components/gps/GpsAlertTable';
import { useGpsData } from '@/hooks/gps/useGpsData';
import { getGpsAlerts, getGpsDashboardStats, getLatestPositions, markAlertAsResolved } from '@/services/gps/gpsService';
import GpsPageShell from './GpsPageShell';

const GpsDashboardPage = () => {
  const { data, loading } = useGpsData(async () => {
    const [stats, positions, alerts] = await Promise.all([
      getGpsDashboardStats(),
      getLatestPositions(),
      getGpsAlerts(),
    ]);
    return { stats, positions, alerts };
  }, []);

  return (
    <GpsPageShell
      active="gps-dashboard"
      title="Dashboard GPS"
      subtitle="Vista ejecutiva de GPS, cartera financiada y recuperacion."
      actions={<button className="inline-flex h-10 items-center gap-2 rounded-md bg-blue-600 px-4 text-sm font-bold text-white"><Plus className="h-4 w-4" /> Registrar GPS</button>}
    >
      {loading ? <div className="rounded-lg border bg-white p-6 text-slate-500">Cargando modulo GPS...</div> : (
        <div className="space-y-4">
          <GpsDashboardStats stats={data?.stats} />
          <div className="grid grid-cols-1 xl:grid-cols-[1fr_520px] gap-4">
            <GpsMap positions={data?.positions || []} height={360} compact />
            <div className="rounded-lg border bg-white p-4">
              <h2 className="mb-3 flex items-center gap-2 font-black text-slate-900"><BellRing className="h-5 w-5 text-amber-600" /> Ultimas alertas</h2>
              <GpsAlertTable alerts={(data?.alerts || []).slice(0, 5)} onResolve={markAlertAsResolved} />
            </div>
          </div>
        </div>
      )}
    </GpsPageShell>
  );
};

export default GpsDashboardPage;
