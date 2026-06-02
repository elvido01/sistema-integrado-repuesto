import React from 'react';
import { CircleDot } from 'lucide-react';

const GpsTimeline = ({ positions = [], alerts = [] }) => {
  const events = [
    ...positions.slice(0, 6).map(p => ({ id: p.id, title: p.event_type || 'position', text: `${p.lat}, ${p.lng} - ${p.speed || 0} km/h`, date: p.recorded_at })),
    ...alerts.slice(0, 4).map(a => ({ id: a.id, title: a.titulo, text: a.descripcion, date: a.created_at })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return (
    <div className="rounded-lg border bg-white p-4">
      <h3 className="font-black text-slate-900">Timeline financiero + GPS</h3>
      <div className="mt-4 space-y-3">
        {events.map(event => (
          <div key={event.id} className="flex gap-3">
            <CircleDot className="mt-0.5 h-4 w-4 text-blue-600" />
            <div>
              <p className="text-sm font-bold text-slate-900">{event.title}</p>
              <p className="text-xs text-slate-500">{event.text}</p>
              <p className="text-[11px] text-slate-400">{new Date(event.date).toLocaleString('es-DO')}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default GpsTimeline;
