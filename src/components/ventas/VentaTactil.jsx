// ============================================================
// VentaTactil — punto de venta con pantalla táctil (11/11/2026)
// ============================================================
// Para el tipo de empresa CAFETERÍA (sql/tipo_cafeteria.sql). Es una capa
// encima de Ventas: las líneas van a la misma factura (useVentas) y "Cobrar"
// usa el mismo camino que F10 (grabar, imprimir, caja, cierre, e-CF).
// · Izquierda: pestañas por categoría (tipos de producto) y botones grandes.
// · Derecha: la orden, con + / − por línea, el total y el cobro.
// ============================================================
import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, Minus, Plus, Trash2, Search, Keyboard, Banknote, CreditCard, Landmark, X } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';

const fmt = (v) => `RD$${Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const r2 = (v) => Math.round(Number(v || 0) * 100) / 100;
const precioDe = (p) => {
  const pres = p.presentaciones || [];
  const main = pres.find((x) => x.afecta_ft) || pres[0];
  return main ? Number(main.precio1 || 0) : Number(p.precio || 0);
};
const FORMAS = [
  { v: 'EFECTIVO', t: 'Efectivo', Icon: Banknote },
  { v: 'TARJETA', t: 'Tarjeta', Icon: CreditCard },
  { v: 'TRANSFERENCIA', t: 'Transferencia', Icon: Landmark },
];
const BILLETES = [50, 100, 200, 500, 1000, 2000];

export default function VentaTactil({
  items, total, isSaving, onAgregar, onCantidad, onQuitar, onLimpiar, onCobrar, onSalir, titulo, visible = true,
}) {
  const [productos, setProductos] = useState([]);
  const [tipos, setTipos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState(null);
  const [cat, setCat] = useState('todos');
  const [buscar, setBuscar] = useState('');
  const [cobrando, setCobrando] = useState(false);
  const [forma, setForma] = useState('EFECTIVO');
  const [recibido, setRecibido] = useState('');

  const cargar = async () => {
    setCargando(true);
    const [{ data: p, error: e1 }, { data: t, error: e2 }] = await Promise.all([
      supabase.from('productos')
        .select('id, codigo, descripcion, precio, costo, itbis_pct, imagen_url, tipo_id, ubicacion, presentaciones(precio1, precio2, precio3, auto_precio2, auto_precio3, afecta_ft, descuento_pct, created_at)')
        .eq('activo', true).order('descripcion').limit(1000),
      supabase.from('tipos_producto').select('id, nombre').eq('activo', true).order('nombre'),
    ]);
    setErrorCarga(e1 || e2 ? (e1 || e2).message : null);
    setProductos(p || []);
    setTipos(t || []);
    setCargando(false);
  };
  useEffect(() => { cargar(); }, []);

  // Solo las categorías que tienen algo.
  const categorias = useMemo(() => {
    const usadas = new Set(productos.map((p) => p.tipo_id).filter(Boolean));
    return tipos.filter((t) => usadas.has(t.id));
  }, [productos, tipos]);

  const visibles = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    return productos.filter((p) => (cat === 'todos' || p.tipo_id === cat)
      && (!q || `${p.descripcion} ${p.codigo}`.toLowerCase().includes(q)));
  }, [productos, cat, buscar]);

  const totalR = r2(total);
  const recibidoN = forma === 'EFECTIVO' ? Number(recibido || 0) : totalR;
  const devuelta = r2(recibidoN - totalR);
  const puedeCobrar = items.length > 0 && totalR > 0 && !isSaving && (forma !== 'EFECTIVO' || recibidoN >= totalR);

  const abrirCobro = () => { setForma('EFECTIVO'); setRecibido(''); setCobrando(true); };
  const cobrar = () => {
    if (!puedeCobrar) return;
    onCobrar({ forma_pago: forma, recibido: forma === 'EFECTIVO' ? recibidoN : totalR });
    setCobrando(false);
  };

  // Va al body con z-50: tapa el menú lateral (también z-50, pero antes en la
  // página) y los diálogos que se abran después (imprimir, origen de la
  // venta) salen encima, porque Radix los agrega más abajo. Si el panel de
  // Ventas no está a la vista, se esconde sin desmontarse (conserva el menú
  // cargado y la orden).
  return createPortal(
    <div className={`fixed inset-0 z-50 bg-slate-100 flex-col select-none ${visible ? 'flex' : 'hidden'}`}>
      {/* Barra de arriba */}
      <div className="h-14 bg-slate-900 text-white flex items-center gap-3 px-4 flex-shrink-0">
        <div className="font-black tracking-wide text-lg truncate">{titulo || 'Punto de venta'}</div>
        <div className="relative ml-auto w-64 max-w-[40vw]">
          <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Buscar…"
            className="w-full h-9 rounded-lg bg-slate-800 border border-slate-700 pl-8 pr-2 text-sm outline-none focus:border-blue-400" />
        </div>
        <button type="button" onClick={onSalir} title="Volver a la factura normal (teclado)"
          className="h-9 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 flex items-center gap-1.5 text-sm">
          <Keyboard className="w-4 h-4" /> Factura normal
        </button>
      </div>

      <div className="flex-1 flex min-h-0">
        {/* Productos */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex gap-2 p-3 overflow-x-auto flex-shrink-0">
            {[{ id: 'todos', nombre: 'Todo' }, ...categorias].map((c) => (
              <button key={c.id} type="button" onClick={() => setCat(c.id)}
                className={`px-5 h-12 rounded-xl text-base font-bold whitespace-nowrap border ${cat === c.id ? 'bg-blue-700 text-white border-blue-700' : 'bg-white text-slate-700 border-slate-300'}`}>
                {c.nombre}
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-y-auto px-3 pb-3">
            {cargando ? (
              <div className="h-full flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div>
            ) : errorCarga ? (
              <div className="p-6 text-center text-red-700">No se pudo cargar el menú: {errorCarga}.{' '}
                <button type="button" className="underline font-bold" onClick={cargar}>Reintentar</button></div>
            ) : visibles.length === 0 ? (
              <div className="p-6 text-center text-slate-500">
                {productos.length === 0 ? 'Todavía no hay productos. Créalos en "Menú y Productos" con su categoría y precio.' : 'Nada con ese nombre.'}
              </div>
            ) : (
              <div className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(140px,1fr))]">
                {visibles.map((p) => (
                  <button key={p.id} type="button" onClick={() => onAgregar(p)}
                    className="h-32 rounded-2xl bg-white border border-slate-200 shadow-sm active:scale-[0.97] active:bg-blue-50 transition flex flex-col overflow-hidden text-left">
                    {p.imagen_url
                      ? <img src={p.imagen_url} alt="" className="h-16 w-full object-cover" loading="lazy" />
                      : <div className="h-16 w-full bg-gradient-to-br from-amber-100 to-orange-200 flex items-center justify-center text-2xl font-black text-orange-700/70">{String(p.descripcion || '?').trim().charAt(0)}</div>}
                    <div className="flex-1 px-2 py-1 flex flex-col justify-between min-h-0">
                      <div className="text-[13px] font-bold leading-tight text-slate-800 line-clamp-2">{p.descripcion}</div>
                      <div className="text-sm font-black text-blue-800">{fmt(precioDe(p))}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Orden */}
        <div className="w-[360px] max-w-[45vw] bg-white border-l border-slate-200 flex flex-col">
          <div className="px-4 py-3 border-b flex items-center justify-between">
            <div className="font-black text-slate-800">Orden</div>
            {items.length > 0 && (
              <button type="button" onClick={onLimpiar} className="text-sm text-red-600 font-semibold flex items-center gap-1">
                <X className="w-4 h-4" /> Vaciar
              </button>
            )}
          </div>
          <div className="flex-1 overflow-y-auto">
            {items.length === 0 ? (
              <div className="p-6 text-center text-slate-400">Toca un producto para agregarlo.</div>
            ) : items.map((it) => (
              <div key={it.id} className="px-3 py-2 border-b flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-slate-800 leading-tight truncate">{it.descripcion}</div>
                  <div className="text-xs text-slate-500">{fmt(it.precio)} c/u</div>
                </div>
                <button type="button" onClick={() => (Number(it.cantidad) <= 1 ? onQuitar(it.id) : onCantidad(it.id, Number(it.cantidad) - 1))}
                  className="w-10 h-10 rounded-xl border border-slate-300 flex items-center justify-center active:bg-slate-100">
                  {Number(it.cantidad) <= 1 ? <Trash2 className="w-4 h-4 text-red-600" /> : <Minus className="w-4 h-4" />}
                </button>
                <div className="w-8 text-center font-black text-lg">{Number(it.cantidad)}</div>
                <button type="button" onClick={() => onCantidad(it.id, Number(it.cantidad) + 1)}
                  className="w-10 h-10 rounded-xl border border-slate-300 flex items-center justify-center active:bg-slate-100">
                  <Plus className="w-4 h-4" />
                </button>
                <div className="w-20 text-right text-sm font-bold">{fmt(it.importe)}</div>
              </div>
            ))}
          </div>
          <div className="border-t p-4 space-y-3">
            <div className="flex items-baseline justify-between">
              <span className="text-slate-500 font-semibold">Total</span>
              <span className="text-3xl font-black text-slate-900">{fmt(totalR)}</span>
            </div>
            <button type="button" onClick={abrirCobro} disabled={!items.length || isSaving}
              className="w-full h-16 rounded-2xl bg-emerald-600 disabled:bg-slate-300 text-white text-xl font-black active:bg-emerald-700">
              {isSaving ? <Loader2 className="w-6 h-6 animate-spin mx-auto" /> : 'COBRAR'}
            </button>
          </div>
        </div>
      </div>

      {/* Cobro */}
      {cobrando && (
        <div className="absolute inset-0 bg-black/40 flex items-center justify-center p-4" onClick={() => setCobrando(false)}>
          <div className="bg-white rounded-3xl w-full max-w-lg p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-baseline justify-between">
              <span className="text-lg font-bold text-slate-600">A cobrar</span>
              <span className="text-4xl font-black">{fmt(totalR)}</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {FORMAS.map(({ v, t, Icon }) => (
                <button key={v} type="button" onClick={() => setForma(v)}
                  className={`h-16 rounded-2xl border-2 flex flex-col items-center justify-center font-bold ${forma === v ? 'border-blue-700 bg-blue-50 text-blue-800' : 'border-slate-200 text-slate-600'}`}>
                  <Icon className="w-5 h-5" /> {t}
                </button>
              ))}
            </div>
            {forma === 'EFECTIVO' && (
              <>
                <div className="grid grid-cols-4 gap-2">
                  <button type="button" onClick={() => setRecibido(String(totalR))}
                    className="h-12 rounded-xl bg-blue-700 text-white font-bold">Exacto</button>
                  {BILLETES.filter((b) => b >= totalR).map((b) => (
                    <button key={b} type="button" onClick={() => setRecibido(String(b))}
                      className={`h-12 rounded-xl border font-bold ${Number(recibido) === b ? 'bg-blue-50 border-blue-700 text-blue-800' : 'border-slate-300'}`}>
                      {b.toLocaleString('en-US')}
                    </button>
                  ))}
                </div>
                <label className="block">
                  <span className="text-sm font-semibold text-slate-600">Recibido</span>
                  <input inputMode="decimal" value={recibido} onChange={(e) => setRecibido(e.target.value.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1'))}
                    className="mt-1 w-full h-14 rounded-xl border border-slate-300 px-4 text-2xl font-black text-right" placeholder="0.00" />
                </label>
                <div className={`flex items-baseline justify-between rounded-xl px-4 py-3 ${devuelta >= 0 ? 'bg-emerald-50' : 'bg-red-50'}`}>
                  <span className="font-bold text-slate-600">{devuelta >= 0 ? 'Devuelta' : 'Falta'}</span>
                  <span className={`text-3xl font-black ${devuelta >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>{fmt(Math.abs(devuelta))}</span>
                </div>
              </>
            )}
            <div className="grid grid-cols-2 gap-3">
              <button type="button" onClick={() => setCobrando(false)} className="h-14 rounded-2xl border border-slate-300 font-bold text-slate-600">Volver</button>
              <button type="button" onClick={cobrar} disabled={!puedeCobrar}
                className="h-14 rounded-2xl bg-emerald-600 disabled:bg-slate-300 text-white text-lg font-black">Cobrar e imprimir</button>
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}
