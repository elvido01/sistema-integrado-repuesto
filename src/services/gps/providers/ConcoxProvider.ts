import type { GpsProvider } from './GpsProvider';

export class ConcoxProvider implements GpsProvider {
  async getDevices(): Promise<any[]> {
    throw new Error('ConcoxProvider pendiente de configurar.');
  }

  async getLatestPosition(): Promise<any> {
    throw new Error('ConcoxProvider pendiente de configurar.');
  }

  async getPositionHistory(): Promise<any[]> {
    throw new Error('ConcoxProvider pendiente de configurar.');
  }
}
