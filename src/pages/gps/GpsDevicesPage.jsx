import React from 'react';
import { Plus } from 'lucide-react';
import GpsDeviceCard from '@/components/gps/GpsDeviceCard';
import GpsDeviceForm from '@/components/gps/GpsDeviceForm';
import { useGpsData } from '@/hooks/gps/useGpsData';
import { getGpsDevices } from '@/services/gps/gpsService';
import { usePanels } from '@/contexts/panelCore';
import GpsPageShell from './GpsPageShell';

const GpsDevicesPage = () => {
  const { openPanel } = usePanels();
  const { data: devices, loading } = useGpsData(() => getGpsDevices(), []);
  return (
    <GpsPageShell active="gps-dispositivos" title="Dispositivos GPS" subtitle="Inventario, asignacion y estado tecnico de equipos.">
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_380px] gap-4">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {loading ? <div className="rounded-lg border bg-white p-6">Cargando...</div> : devices?.map(device => (
            <GpsDeviceCard key={device.id} device={device} onOpen={(d) => openPanel('gps-dispositivo-detalle', { deviceId: d.id })} />
          ))}
        </div>
        <div className="space-y-4">
          <GpsDeviceForm />
          <div className="rounded-lg border bg-white p-4 text-sm text-slate-600">
            <h3 className="font-black text-slate-900">Acciones permitidas</h3>
            <p className="mt-2">Solo admin/gerente debe asociar o desactivar GPS cuando se conecte a Supabase real.</p>
            <button className="mt-4 inline-flex h-10 items-center gap-2 rounded-md border px-3 font-bold hover:bg-slate-50"><Plus className="h-4 w-4" /> Asociar demo</button>
          </div>
        </div>
      </div>
    </GpsPageShell>
  );
};

export default GpsDevicesPage;
