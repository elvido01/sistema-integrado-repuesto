// =====================================================================
// ¿Qué se vende? Bien, servicio o inmueble (27/10/2026)
// ---------------------------------------------------------------------
// · Bien      — lo de siempre: lleva inventario.
// · Servicio  — no lleva inventario (la base ignora sus movimientos) y en la
//               factura electrónica va como servicio. Su tipo decide las
//               retenciones cuando el cliente es agente de retención.
// · Inmueble  — un solar/propiedad: único (existencia 1) y SIN ITBIS (la
//               transferencia de inmuebles no está gravada). Lo que se venda
//               amueblado va en otra línea, como bien.
// Ver sql/tipos_empresa_servicios_inmobiliaria.sql
// =====================================================================
import React from 'react';
import { Package, Wrench, Landmark } from 'lucide-react';

const OPCIONES = [
  { v: 'bien', t: 'Bien', d: 'Lleva inventario', Icon: Package },
  { v: 'servicio', t: 'Servicio', d: 'Sin inventario', Icon: Wrench },
  { v: 'inmueble', t: 'Inmueble', d: 'Solar / propiedad, sin ITBIS', Icon: Landmark },
];

const campo = 'h-8 w-full rounded border border-gray-300 bg-white px-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400';

export default function NaturalezaProducto({ formData, setFormData }) {
  const nat = formData.naturaleza || 'bien';
  const inm = formData.datos_inmueble || {};
  const setInm = (k, v) => setFormData((p) => ({ ...p, datos_inmueble: { ...(p.datos_inmueble || {}), [k]: v } }));

  const elegir = (v) => setFormData((p) => ({
    ...p,
    naturaleza: v,
    servicio_tipo: v === 'servicio' ? (p.servicio_tipo || 'profesional') : null,
    // El inmueble no lleva ITBIS; al volver a bien/servicio se propone el 18%.
    itbis_pct: v === 'inmueble' ? 0 : (p.naturaleza === 'inmueble' ? 0.18 : p.itbis_pct),
  }));

  return (
    <div className="mb-2 rounded-md border border-blue-200 bg-blue-50/40 p-3">
      <div className="text-[11px] font-bold uppercase text-gray-700 mb-2">¿Qué vendes con este código?</div>
      <div className="grid grid-cols-3 gap-2">
        {OPCIONES.map(({ v, t, d, Icon }) => (
          <button key={v} type="button" onClick={() => elegir(v)}
            className={`flex items-center gap-2 rounded-lg border px-2 py-2 text-left transition-colors ${
              nat === v ? 'border-blue-600 bg-white ring-1 ring-blue-600' : 'border-gray-200 bg-white/60 hover:bg-white'}`}>
            <Icon className={`h-4 w-4 shrink-0 ${nat === v ? 'text-blue-600' : 'text-gray-400'}`} />
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-gray-800">{t}</span>
              <span className="block text-[10px] text-gray-500 truncate">{d}</span>
            </span>
          </button>
        ))}
      </div>

      {nat === 'servicio' && (
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2 items-end">
          <label className="block">
            <span className="text-[11px] font-semibold text-gray-600">Tipo de servicio (decide las retenciones)</span>
            <select className={campo} value={formData.servicio_tipo || 'profesional'}
              onChange={(e) => setFormData((p) => ({ ...p, servicio_tipo: e.target.value }))}>
              <option value="profesional">Profesional (honorarios, asesoría, mantenimiento)</option>
              <option value="alquiler">Alquiler (local, vivienda, equipo)</option>
              <option value="otro">Otro (sin retención)</option>
            </select>
          </label>
          <p className="text-[10px] text-gray-500 leading-snug">
            El alquiler de <b>vivienda familiar</b> es exento de ITBIS: ponle ITBIS 0%. El de local comercial lleva 18%.
          </p>
        </div>
      )}

      {nat === 'inmueble' && (
        <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-2">
          <label className="block">
            <span className="text-[11px] font-semibold text-gray-600">Designación catastral</span>
            <input className={campo} value={inm.designacion_catastral || ''} onChange={(e) => setInm('designacion_catastral', e.target.value.toUpperCase())} />
          </label>
          <label className="block">
            <span className="text-[11px] font-semibold text-gray-600">Matrícula / Nº de título</span>
            <input className={campo} value={inm.matricula || ''} onChange={(e) => setInm('matricula', e.target.value.toUpperCase())} />
          </label>
          <label className="block">
            <span className="text-[11px] font-semibold text-gray-600">Metros²</span>
            <input className={campo} inputMode="decimal" value={inm.metros || ''} onChange={(e) => setInm('metros', e.target.value.replace(/[^0-9.]/g, ''))} />
          </label>
          <label className="block col-span-2">
            <span className="text-[11px] font-semibold text-gray-600">Ubicación (proyecto, manzana, lote, sector)</span>
            <input className={campo} value={inm.ubicacion || ''} onChange={(e) => setInm('ubicacion', e.target.value)} />
          </label>
          <label className="block">
            <span className="text-[11px] font-semibold text-gray-600">Estado del título</span>
            <select className={campo} value={inm.estado_titulo || 'con_titulo'} onChange={(e) => setInm('estado_titulo', e.target.value)}>
              <option value="con_titulo">Con título (deslindado)</option>
              <option value="en_deslinde">En deslinde</option>
              <option value="sin_deslinde">Sin deslinde</option>
            </select>
          </label>
          <p className="col-span-2 sm:col-span-3 text-[10px] text-gray-500 leading-snug">
            Sin ITBIS (la transferencia de inmuebles no está gravada). El 3% de transferencia lo paga el comprador en la DGII
            dentro de 6 meses: se sigue en <b>Transacciones → Inmuebles Vendidos</b>. Un solar sin deslinde no se puede titular.
          </p>
        </div>
      )}
    </div>
  );
}
