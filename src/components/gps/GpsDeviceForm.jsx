import React from 'react';
import { Save } from 'lucide-react';

const GpsDeviceForm = () => (
  <div className="rounded-lg border bg-white p-4">
    <h3 className="font-black text-slate-900">Registrar dispositivo GPS</h3>
    <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
      {['IMEI', 'Modelo', 'SIM', 'Proveedor'].map(label => (
        <label key={label} className="text-sm font-semibold text-slate-700">
          {label}
          <input className="mt-1 h-10 w-full rounded-md border px-3 text-sm" placeholder={label} />
        </label>
      ))}
    </div>
    <button className="mt-4 inline-flex h-10 items-center gap-2 rounded-md bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-700">
      <Save className="h-4 w-4" /> Guardar demo
    </button>
  </div>
);

export default GpsDeviceForm;
