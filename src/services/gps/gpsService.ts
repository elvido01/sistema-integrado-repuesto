import { buildMockAlerts, CAMINERO_TENANT_ID, mockGpsDevices, mockGpsHistory, mockGpsPositions } from './mockGpsData';
import { MockGpsProvider } from './providers/MockGpsProvider';

const provider = new MockGpsProvider();

const latestByDevice = () => new Map(mockGpsPositions.map(p => [p.gps_device_id, p]));

export const getRiskLevel = (diasAtraso = 0, deviceStatus = 'activo') => {
  if (deviceStatus === 'sin_senal') return 'sin_senal';
  if (diasAtraso > 15) return 'critico';
  if (diasAtraso > 7) return 'alto';
  if (diasAtraso > 0) return 'medio';
  return 'bajo';
};

export const getGpsDashboardStats = async (empresaId = CAMINERO_TENANT_ID) => {
  const devices = await getGpsDevices(empresaId);
  const alerts = await getGpsAlerts(empresaId);
  return {
    totalActivos: devices.filter(d => ['activo', 'instalado'].includes(d.estado)).length,
    sinSenal: devices.filter(d => d.estado === 'sin_senal' || d.riesgo === 'sin_senal').length,
    clientesAlDia: devices.filter(d => Number(d.dias_atraso || 0) === 0 && d.cliente_id).length,
    clientesAtrasados: devices.filter(d => Number(d.dias_atraso || 0) > 0).length,
    clientesCriticos: devices.filter(d => Number(d.dias_atraso || 0) > 15).length,
    fueraGeocerca: alerts.filter(a => a.tipo === 'fuera_geocerca').length,
    alertasHoy: alerts.length,
    recuperacionSugerida: devices
      .filter(d => ['alto', 'critico'].includes(d.riesgo))
      .reduce((acc, d) => acc + Number(d.cuota_vencida || 0), 0),
  };
};

export const getGpsDevices = async (empresaId = CAMINERO_TENANT_ID) => {
  const latest = latestByDevice();
  const devices = (await provider.getDevices()).filter(d => d.empresa_id === empresaId);
  return devices.map(device => {
    const position = latest.get(device.id);
    return {
      ...device,
      latest_position: position || null,
      last_connection_at: position?.recorded_at || null,
      riesgo: getRiskLevel(device.dias_atraso, device.estado),
    };
  });
};

export const getGpsDeviceById = async (id: string) => {
  const devices = await getGpsDevices();
  return devices.find(d => d.id === id) || null;
};

export const getGpsPositions = async (deviceId: string) => mockGpsHistory.filter(p => p.gps_device_id === deviceId);

export const getLatestPositions = async (empresaId = CAMINERO_TENANT_ID) => {
  const devices = await getGpsDevices(empresaId);
  return devices
    .filter(d => d.latest_position)
    .map(d => ({ ...d.latest_position, device: d }));
};

export const getGpsAlerts = async (empresaId = CAMINERO_TENANT_ID) =>
  buildMockAlerts().filter(alert => alert.empresa_id === empresaId);

export const markAlertAsResolved = async (alertId: string) => ({
  ok: true,
  alertId,
  estado: 'resuelta',
  resolved_at: new Date().toISOString(),
});

export const assignGpsToVehicle = async (data: any) => ({
  ok: true,
  id: `assign-${Date.now()}`,
  estado: 'activo',
  ...data,
});

export const createGpsDevice = async (data: any) => ({
  ok: true,
  id: `gps-${Date.now()}`,
  empresa_id: CAMINERO_TENANT_ID,
  estado: 'en_inventario',
  proveedor: 'MockGps',
  ...data,
});

export const updateGpsDevice = async (id: string, data: any) => ({
  ok: true,
  id,
  ...data,
});

export const getFinancialRiskRows = async (empresaId = CAMINERO_TENANT_ID) => {
  const devices = await getGpsDevices(empresaId);
  return devices
    .filter(d => d.cliente_id)
    .map(d => ({
      id: d.id,
      cliente: d.cliente,
      telefono: d.telefono,
      moto: d.moto,
      placa: d.placa,
      cuota_vencida: d.cuota_vencida,
      dias_atraso: d.dias_atraso,
      balance_pendiente: d.balance_pendiente,
      ultima_ubicacion: d.latest_position,
      estado_gps: d.estado,
      riesgo: d.riesgo,
      accion: d.riesgo === 'critico'
        ? 'Validar ubicacion y preparar recuperacion.'
        : d.riesgo === 'alto'
          ? 'Contactar hoy y confirmar promesa.'
          : d.riesgo === 'medio'
            ? 'Recordatorio preventivo.'
            : 'Monitoreo normal.',
    }));
};

export const getGpsProvider = () => provider;
