// Buscador de un producto del catálogo de la empresa (código o descripción).
// value = { id, codigo, descripcion, precio, itbis_pct } | null.
import React, { useEffect, useState } from 'react';
import { Search, X } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';

export default function BuscarProducto({ tenantId, value, onChange, placeholder = 'Buscar producto del catálogo…', className = '' }) {
  const [q, setQ] = useState('');
  const [res, setRes] = useState([]);
  const [abierto, setAbierto] = useState(false);

  useEffect(() => {
    const t0 = q.trim().replace(/[%,()]/g, ' ');
    if (t0.length < 2) { setRes([]); return undefined; }
    const t = setTimeout(async () => {
      const { data } = await supabase.from('productos').select('id, codigo, descripcion, precio, itbis_pct')
        .eq('tenant_id', tenantId).eq('activo', true).or(`descripcion.ilike.%${t0}%,codigo.ilike.%${t0}%`).order('descripcion').limit(10);
      setRes(data || []);
    }, 250);
    return () => clearTimeout(t);
  }, [q, tenantId]);

  if (value) {
    return (
      <div className={`flex items-center justify-between gap-2 rounded-md border border-emerald-300 bg-emerald-50 px-2 h-8 text-xs ${className}`}>
        <span className="truncate"><b>{value.codigo}</b> · {value.descripcion}</span>
        <button type="button" onClick={() => onChange(null)} title="Quitar"><X className="w-3.5 h-3.5 text-gray-500" /></button>
      </div>
    );
  }
  return (
    <div className={`relative ${className}`}>
      <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2 top-2.5" />
      <input className="h-8 w-full rounded-md border border-gray-300 pl-7 pr-2 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-300"
        placeholder={placeholder} value={q} onFocus={() => setAbierto(true)} onBlur={() => setTimeout(() => setAbierto(false), 150)}
        onChange={(e) => setQ(e.target.value)} />
      {abierto && res.length > 0 && (
        <div className="absolute z-30 left-0 right-0 mt-1 bg-white border rounded-md shadow-lg divide-y max-h-60 overflow-auto">
          {res.map((p) => (
            <button key={p.id} type="button" onMouseDown={() => { onChange(p); setQ(''); setRes([]); }}
              className="w-full text-left px-2 py-1.5 hover:bg-blue-50 text-xs">
              <b>{p.codigo}</b> · {p.descripcion} <span className="text-gray-500">RD${Number(p.precio || 0).toLocaleString('en-US')}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
