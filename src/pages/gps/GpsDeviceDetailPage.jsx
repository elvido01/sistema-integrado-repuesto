import React from 'react';
import { BatteryCharging, MapPin, RadioTower, Smartphone } from 'lucide-react';
import GpsMap from '@/components/gps/GpsMap';
import GpsStatusBadge from '@/components/gps/GpsStatusBadge';
import GpsTimeline from '@/components/gps/GpsTimeline';
import RiskBadge from '@/components/gps/RiskBadge';
import { useGpsData } from '@/hooks/gps/useGpsData';
import { getGpsAlerts, getGpsDeviceById, getGpsPositions } from '@/services/gps/gpsService';
import GpsPageShell from './GpsPageShell';

const GpsDeviceDetailPage = ({ extraData }) => {
  const deviceId = extraData?.deviceId || 'gps-001';
  const { data, loading } = useGpsData(async () => {
    const [device, positions, alerts] = await Promise.all([
      getGpsDeviceById(deviceId),
      getGpsPositions(deviceId),
      getGpsAlerts(),
    ]);
    return {
      device,
      positions,
      alerts: alerts.filter(a => a.gps_device_id === deviceId),
    };
  }, [deviceId]);

  const latest = data?.device?.latest_position;
  const mapPosition = latest ? [{ ...latest, device: data.device }] : [];

  return (
    <GpsPageShell active="gps-dispositivos" title="Detalle del GPS" subtitle="Expediente tecnico, financiero y recorrido de la unidad.">
      {loading || !data?.device ? <div className="rounded-lg border bg-white p-6">Cargando detalle...</div> : (
        <div className="grid grid-cols-1 xl:grid-cols-[420px_1fr] gap-4">
          <div className="space-y-4">
            <div className="rounded-lg border bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase text-slate-500">IMEI {data.device.imei}</p>
                  <h2 className="text-xl font-black text-slate-900">{data.device.modelo}</h2>
                </div>
                <GpsStatusBadge status={data.device.estado} />
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-slate-500">Cliente</span><p className="font-bold">{data.device.cliente}</p></div>
                <div><span className="text-slate-500">Telefono</span><p className="font-bold">{data.device.telefono}</p></div>
                <div><span className="text-slate-500">Moto</span><p className="font-bold">{data.device.moto}</p></div>
                <div><span className="text-slate-500">Placa</span><p className="font-bold">{data.device.placa}</p></div>
                <div><span className="text-slate-500">Balance</span><p className="font-bold">RD${Number(data.device.balance_pendiente || 0).toLocaleString('es-DO')}</p></div>
                <div><span className="text-slate-500">Riesgo</span><p><RiskBadge value={data.device.riesgo} /></p></div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border bg-white p-4"><RadioTower className="h-5 w-5 text-blue-600" /><p className="mt-2 text-xs text-slate-500">GSM</p><p className="font-black">{latest?.gsm_signal ?? 0}%</p></div>
              <div className="rounded-lg border bg-white p-4"><BatteryCharging className="h-5 w-5 text-amber-600" /><p className="mt-2 text-xs text-slate-500">Bateria</p><p className="font-black">{latest?.battery_level ?? 0}%</p></div>
              <div className="rounded-lg border bg-white p-4"><Smartphone className="h-5 w-5 text-emerald-600" /><p className="mt-2 text-xs text-slate-500">Ignicion</p><p className="font-black">{latest?.ignition ? 'Encendida' : 'Apagada'}</p></div>
              <div className="rounded-lg border bg-white p-4"><MapPin className="h-5 w-5 text-red-600" /><p className="mt-2 text-xs text-slate-500">Velocidad</p><p className="font-black">{latest?.speed ?? 0} km/h</p></div>
            </div>
            <GpsTimeline positions={data.positions} alerts={data.alerts} />
          </div>
          <div className="space-y-4">
            <GpsMap positions={mapPosition} height={420} />
            <div className="rounded-lg border bg-white p-4">
              <h3 className="font-black text-slate-900">Historial de posiciones</h3>
              <div className="mt-3 max-h-72 overflow-y-auto divide-y">
                {data.positions.map(pos => (
                  <div key={pos.id} className="flex items-center justify-between py-2 text-sm">
                    <span className="font-semibold">{pos.lat}, {pos.lng}</span>
                    <span className="text-slate-500">{new Date(pos.recorded_at).toLocaleString('es-DO')}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </GpsPageShell>
  );
};

export default GpsDeviceDetailPage;
