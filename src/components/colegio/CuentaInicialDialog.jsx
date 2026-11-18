// Cuenta inicial del estudiante: lo que YA pagó este año antes del sistema.
//
// El colegio entra a mitad del año. Al terminar la ficha marca qué meses y qué
// conceptos del año ya pagó en papel (no todos están al día, ni siempre
// seguido). Se crea la cuenta completa y lo marcado queda saldado SIN recibo:
// no es dinero que entró hoy a la caja. Ver sql/edu_cuenta_inicial_pagado_antes.sql.
import React, { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { mesesDelAnio, hoyRD } from '@/lib/colegio';

const n2 = (v) => Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const campo = 'h-9 rounded-md border border-gray-300 px-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-300';
const ANUALES = ['inscripcion', 'reservacion', 'utileria', 'bilingue'];
const clave = (m) => `${m.anio}-${String(m.mes).padStart(2, '0')}-01`;

export default function CuentaInicialDialog({ estudiante, anio, tenantId, onClose, onDone, onError }) {
  const [conceptos, setConceptos] = useState([]);
  const [salaTareas, setSalaTareas] = useState(0);
  const [pagados, setPagados] = useState(() => new Set());
  const [anualesPagados, setAnualesPagados] = useState(() => new Set());
  const [conRecargo, setConRecargo] = useState(false);
  const [guardando, setGuardando] = useState(false);

  const hoy = hoyRD();
  const mesHoy = `${hoy.slice(0, 7)}-01`;
  const meses = useMemo(() => mesesDelAnio(anio), [anio]);
  // Desde cuándo estudia: a quien entró a mitad de año no se le crean los meses de antes.
  const [desde, setDesde] = useState(() => (meses[0] ? clave(meses[0]) : ''));
  const suyos = meses.filter((m) => clave(m) >= desde);
  // Hasta el mes en curso se pregunta; lo que viene se cobra normal.
  const corridos = suyos.filter((m) => clave(m) <= mesHoy);
  const porVenir = suyos.length - corridos.length;

  useEffect(() => {
    // Los mismos que crea edu_preparar_cuenta: anuales obligatorios de su condición.
    supabase.from('edu_conceptos').select('id, tipo, nombre, monto, moneda, aplica_a, activo, frecuencia, obligatorio')
      .eq('tenant_id', tenantId).eq('activo', true).in('tipo', [...ANUALES, 'sala_tareas'])
      .then(({ data, error }) => {
        if (error) return onError('No se pudieron leer los conceptos', error.message);
        setSalaTareas(Number((data || []).find((c) => c.tipo === 'sala_tareas')?.monto || 0));
        const anuales = (data || []).filter((c) => ANUALES.includes(c.tipo)
          && c.frecuencia === 'anual' && c.obligatorio
          && (c.aplica_a === 'todos' || c.aplica_a === estudiante.condicion));
        setConceptos(anuales);
        // A mitad de año lo normal es que lo anual ya esté pagado.
        setAnualesPagados(new Set(anuales.map((c) => c.tipo)));
      });
  }, [tenantId, estudiante.condicion]); // eslint-disable-line react-hooks/exhaustive-deps

  const mensual = Number(estudiante.tarifa_mensual || 0) * (1 - Number(estudiante.beca_pct || 0) / 100)
    + (estudiante.sala_tareas ? salaTareas : 0);
  const mesesDebe = corridos.filter((m) => !pagados.has(clave(m)));
  // Deuda de antes del sistema = meses anteriores al mes en curso. Sin la
  // opción de recargo, ninguno de ellos lo cogerá nunca.
  const atrasados = mesesDebe.filter((m) => clave(m) < mesHoy);
  const anualesDebeDOP = conceptos.filter((c) => !anualesPagados.has(c.tipo) && c.moneda === 'DOP')
    .reduce((s, c) => s + Number(c.monto || 0), 0);
  const anualesDebeUSD = conceptos.filter((c) => !anualesPagados.has(c.tipo) && c.moneda === 'USD')
    .reduce((s, c) => s + Number(c.monto || 0), 0);
  const debe = mesesDebe.length * mensual + anualesDebeDOP;

  const pagoHasta = (k) => setPagados(new Set(k ? corridos.filter((m) => clave(m) <= k).map(clave) : []));
  const cambiarDesde = (k) => { setDesde(k); setPagados((p) => new Set([...p].filter((x) => x >= k))); };
  const alternar = (set, setter, k) => { const n = new Set(set); n.has(k) ? n.delete(k) : n.add(k); setter(n); };

  const guardar = async () => {
    setGuardando(true);
    const { data, error } = await supabase.rpc('edu_cuenta_inicial', {
      p_estudiante: estudiante.id,
      p_meses_pagados: [...pagados],
      p_anuales_pagados: [...anualesPagados],
      p_con_recargo: conRecargo,
      p_desde: desde || null,
    });
    setGuardando(false);
    if (error) return onError('No se pudo guardar la cuenta', error.message);
    return onDone(data);
  };

  return (
    <Dialog open onOpenChange={(v) => !v && !guardando && onClose()}>
      <DialogContent className="max-w-lg max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Lo que ya pagó en {anio?.nombre} · {estudiante.nombres} {estudiante.apellidos}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-gray-600">
          Marca lo que pagó <b>antes del sistema</b>. Queda saldado sin recibo (no es dinero de la caja de hoy).
          Lo que no marques queda como deuda.
        </p>

        <label className="flex items-center justify-between gap-2 text-sm">
          <span className="text-xs font-bold text-gray-600 uppercase">Empezó a estudiar en</span>
          <select className={`${campo} h-8`} value={desde} onChange={(e) => cambiarDesde(e.target.value)}>
            {meses.map((m) => <option key={clave(m)} value={clave(m)}>{m.nombre}</option>)}
          </select>
        </label>

        <div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold text-gray-600 uppercase">Mensualidades (RD${n2(mensual)})</span>
            <select className={`${campo} h-8`} defaultValue="" onChange={(e) => pagoHasta(e.target.value)}>
              <option value="">Pagó hasta…</option>
              <option value="">Ningún mes</option>
              {corridos.map((m) => <option key={clave(m)} value={clave(m)}>{m.nombre}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-1 mt-2">
            {corridos.map((m) => {
              const k = clave(m);
              return (
                <label key={k} className={`flex items-center gap-2 rounded border px-2 py-1 text-sm cursor-pointer ${pagados.has(k) ? 'border-emerald-300 bg-emerald-50' : 'border-gray-200'}`}>
                  <input type="checkbox" checked={pagados.has(k)} onChange={() => alternar(pagados, setPagados, k)} />
                  {m.nombre} {pagados.has(k) ? <span className="text-xs text-emerald-700 ml-auto">pagado</span> : <span className="text-xs text-red-600 ml-auto">debe</span>}
                </label>
              );
            })}
          </div>
          {porVenir > 0 && <p className="text-xs text-gray-500 mt-1">Los {porVenir} meses que faltan del año se cobran normal.</p>}
        </div>

        {conceptos.length > 0 && (
          <div>
            <span className="text-xs font-bold text-gray-600 uppercase">Del año</span>
            <div className="grid grid-cols-1 gap-1 mt-2">
              {conceptos.map((c) => (
                <label key={c.id} className={`flex items-center gap-2 rounded border px-2 py-1 text-sm cursor-pointer ${anualesPagados.has(c.tipo) ? 'border-emerald-300 bg-emerald-50' : 'border-gray-200'}`}>
                  <input type="checkbox" checked={anualesPagados.has(c.tipo)} onChange={() => alternar(anualesPagados, setAnualesPagados, c.tipo)} />
                  {c.nombre} <span className="text-gray-500">({c.moneda === 'USD' ? 'US$' : 'RD$'}{n2(c.monto)})</span>
                  {anualesPagados.has(c.tipo) ? <span className="text-xs text-emerald-700 ml-auto">pagado</span> : <span className="text-xs text-red-600 ml-auto">debe</span>}
                </label>
              ))}
            </div>
          </div>
        )}

        {atrasados.length > 0 && (
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1" checked={conRecargo} onChange={(e) => setConRecargo(e.target.checked)} />
            <span>Cobrarle recargo a {atrasados.length === 1 ? 'el mes' : `los ${atrasados.length} meses`} de antes del sistema que debe ({atrasados.map((m) => m.nombre.split(' ')[0]).join(', ')}) cuando le toque. Si no lo marcas, esos meses nunca cogen recargo.</span>
          </label>
        )}

        <div className="rounded bg-gray-50 border border-gray-200 px-3 py-2 text-sm">
          Debe hoy: <b className={debe > 0 ? 'text-red-700' : 'text-emerald-700'}>RD${n2(debe)}</b>
          {anualesDebeUSD > 0 && <> + <b className="text-red-700">US${n2(anualesDebeUSD)}</b></>}
          {conRecargo && atrasados.length > 0 && <span className="text-gray-500"> (más los recargos)</span>}
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose} disabled={guardando}>Más tarde</Button>
          <Button onClick={guardar} disabled={guardando}>
            {guardando && <Loader2 className="w-4 h-4 mr-1 animate-spin" />} Guardar cuenta
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
