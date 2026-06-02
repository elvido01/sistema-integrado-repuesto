import type { GpsProvider } from './GpsProvider';

export class TeltonikaProvider implements GpsProvider {
  async getDevices(): Promise<any[]> {
    throw new Error('TeltonikaProvider pendiente de configurar.');
  }

  async getLatestPosition(): Promise<any> {
    throw new Error('TeltonikaProvider pendiente de configurar.');
  }

  async getPositionHistory(): Promise<any[]> {
    throw new Error('TeltonikaProvider pendiente de configurar.');
  }
}
