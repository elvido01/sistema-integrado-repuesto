import { mockGpsDevices, mockGpsHistory, mockGpsPositions } from '../mockGpsData';
import type { GpsProvider } from './GpsProvider';

export class MockGpsProvider implements GpsProvider {
  async getDevices() {
    return mockGpsDevices;
  }

  async getLatestPosition(imei: string) {
    const device = mockGpsDevices.find(d => d.imei === imei);
    if (!device) return null;
    return mockGpsPositions.find(p => p.gps_device_id === device.id) || null;
  }

  async getPositionHistory(imei: string) {
    const device = mockGpsDevices.find(d => d.imei === imei);
    if (!device) return [];
    return mockGpsHistory.filter(p => p.gps_device_id === device.id);
  }

  async sendCommand(imei: string, command: string) {
    return {
      ok: true,
      imei,
      command,
      mode: 'mock',
      note: 'Comando simulado. Corte remoto no esta habilitado en UI.',
    };
  }
}
