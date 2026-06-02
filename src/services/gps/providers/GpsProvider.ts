export interface GpsProvider {
  getDevices(): Promise<any[]>;
  getLatestPosition(imei: string): Promise<any>;
  getPositionHistory(imei: string, from: string, to: string): Promise<any[]>;
  sendCommand?(imei: string, command: string): Promise<any>;
}
