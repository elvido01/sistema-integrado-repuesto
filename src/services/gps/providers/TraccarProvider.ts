import type { GpsProvider } from './GpsProvider';

export class TraccarProvider implements GpsProvider {
  async getDevices(): Promise<any[]> {
    throw new Error('TraccarProvider pendiente de configurar.');
  }

  async getLatestPosition(): Promise<any> {
    throw new Error('TraccarProvider pendiente de configurar.');
  }

  async getPositionHistory(): Promise<any[]> {
    throw new Error('TraccarProvider pendiente de configurar.');
  }
}
