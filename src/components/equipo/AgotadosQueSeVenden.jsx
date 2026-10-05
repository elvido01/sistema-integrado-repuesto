import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { AlertTriangle, Check, ChevronDown, Loader2, PackageX, RefreshCw } from 'lucide-react';

// AGOTADOS QUE SE VENDEN — lo que la gente compra y no está en el estante.
//
// (04/10/2026) Cada cliente que pide una pieza que no hay compra en otra
// tienda, y además ya no se lleva lo demás. Aquí salen las piezas con 4+
// facturas en 90 días que están en 0 o se acaban en menos de 2 semanas. Un
// grupo de equivalentes que suma existencia cuenta como una sola pieza: si
// el hermano tiene, no falta (ver sql/promocionar_lo_que_se_vende.sql).
//
// "Pedir" la pone en el borrador (orden Pendiente) de SU suplidor, como hace
// la venta cuando algo se acaba. Solo la pieza sin suplidor asignado va a
// Suplidor Virtual, donde se elige a quién (sql/agotados_a_la_orden_del_suplidor.sql,
// 05/10/2026: "tiene suplidor, debe enviarlo a la orden de compra de su
// suplidor asignado"). Lo que ya está en una orden
// abierta se muestra aparte con la fecha: una orden vieja que no llega es un
// reclamo al suplidor, no "ya pedido".

const dinero = (n) => `RD$${Math.round(Number(n) || 0).toLocaleString('es-DO')}`;

const diasDesde = (fecha) => {
  if (!fecha) return null;
  const d = new Date(`${String(fecha).slice(0, 10)}T12:00:00`);
  return Math.max(0, Math.round((Date.now() - d.getTime()) / 86400000));
};

const VIEJA = 21; // días: una orden abierta más vieja que esto ya es reclamo

export function AgotadosQueSeVenden() {
  const { toast } = useToast();
  const [piezas, setPiezas] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [pidiendo, setPidiendo] = useState(null);
  const [pedidas, setPedidas] = useState(() => new Map());   // producto_id → texto del destino
  const [verPedidas, setVerPedidas] = useState(false);

  const cargar = useCallback(() => {
    setCargando(true);
    supabase.rpc('equipo_agotados_que_se_venden', { p_limite: 40 }).then(({ data, error }) => {
      setCargando(false);
      if (error) return;
      setPiezas(Array.isArray(data) ? data : []);
      setPedidas(new Map());
    });
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const pedir = async (p) => {
    setPidiendo(p.producto_id);
    const { data, error } = await supabase.rpc('equipo_agotado_pedir', {
      p_producto_id: p.producto_id, p_cantidad: p.sugerido,
    });
    setPidiendo(null);
    if (error || !data?.ok) {
      toast({ variant: 'destructive', title: 'No se pudo pedir', description: error?.message || 'Inténtalo otra vez.' });
      return;
    }
    const aOrden = data.destino === 'orden';
    setPedidas((m) => new Map(m).set(p.producto_id, aOrden ? `En ${data.numero}` : 'En Suplidor Virtual'));
    toast(aOrden ? {
      title: data.ya_estaba ? `Ya estaba en la ${data.numero}` : `Agregada a la ${data.numero}`,
      description: `${p.descripcion} → orden de ${data.suplidor || 'su suplidor'}.`,
    } : {
      title: data.ya_estaba ? 'Ya estaba en Suplidor Virtual' : 'Enviada a Suplidor Virtual',
      description: `${p.descripcion} no tiene suplidor asignado: elige allí a quién se la pides.`,
    });
  };

  const sinPedir = piezas.filter((p) => !p.en_orden && !p.en_suplidor_virtual);
  const yaPedidas = piezas.filter((p) => p.en_orden || p.en_suplidor_virtual);
  const viejas = yaPedidas.filter((p) => p.en_orden && diasDesde(p.en_orden.fecha) > VIEJA).length;
  const ventaEnRiesgo = sinPedir.reduce((s, p) => s + (Number(p.venta_mes) || 0), 0);

  const Existencia = ({ p }) => (
    p.conteo_raro ? (
      <span className="flex items-center gap-1 text-amber-700"
        title="Se vendió más de lo que el sistema tenía. Puede que sí haya en el estante: cuéntalo y ajusta.">
        <AlertTriangle className="h-3 w-3" /> el sistema dice {Number(p.existencia)}: cuenta el estante
      </span>
    ) : (
      <span className={Number(p.existencia) <= 0 ? 'font-semibold text-red-700' : 'text-amber-700'}>
        {Number(p.existencia) <= 0 ? 'Agotado' : `Quedan ${Number(p.existencia)}`}
      </span>
    )
  );

  const Fila = ({ p, accion }) => (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 border-b border-slate-100 py-1.5 last:border-0">
      <div className="min-w-0 flex-1">
        <p className="truncate text-[11px] font-bold text-slate-800" title={p.descripcion}>
          {p.descripcion}
          {p.es_grupo && <span className="ml-1 font-normal text-slate-400">(con sus equivalentes)</span>}
        </p>
        <p className="flex flex-wrap gap-x-2 text-[10px] text-slate-500">
          <span>{p.codigo}</span>
          <Existencia p={p} />
          <span>{Number(p.vendidos_30d)} vendidos en 30 días · {Number(p.facturas_90d)} facturas en 90</span>
        </p>
      </div>
      <span className="text-[10px] font-semibold text-slate-600" title="Lo que vende al mes (promedio de 90 días)">
        {dinero(p.venta_mes)}/mes
      </span>
      {accion}
    </div>
  );

  return (
    <div className="mb-4 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="flex items-center gap-1.5 text-sm font-bold text-slate-800">
          <PackageX className="h-4 w-4 text-red-600" />
          Agotados que se venden
        </span>
        <p className="flex-1 text-[11px] text-slate-500">
          Lo que la gente compra seguido y no está en el estante. Cada cliente que no lo
          encuentra compra en otra tienda.
        </p>
        {sinPedir.length > 0 && (
          <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-bold text-red-700"
            title="Venta de un mes de las piezas que nadie ha pedido todavía">
            {sinPedir.length} sin pedir · {dinero(ventaEnRiesgo)}/mes
          </span>
        )}
        <button type="button" onClick={cargar} disabled={cargando}
          className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold text-slate-500 hover:bg-slate-100 hover:text-slate-800 disabled:opacity-40">
          <RefreshCw className={`h-3.5 w-3.5 ${cargando ? 'animate-spin' : ''}`} />
          Actualizar
        </button>
      </div>

      {cargando && piezas.length === 0 && (
        <p className="py-2 text-center text-[11px] text-slate-400">Buscando lo que se está acabando…</p>
      )}

      {!cargando && piezas.length === 0 && (
        <p className="py-2 text-center text-[11px] text-slate-400">
          Nada de lo que se vende seguido está agotado.
        </p>
      )}

      {sinPedir.length > 0 && (
        <div>
          {sinPedir.map((p) => {
            const hecha = pedidas.get(p.producto_id);
            return (
              <Fila key={p.producto_id} p={p} accion={hecha ? (
                <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-700">
                  <Check className="h-3 w-3" /> {hecha}
                </span>
              ) : (
                <button type="button" onClick={() => pedir(p)} disabled={!!pidiendo}
                  title="La agrega a la orden de su suplidor con la cantidad de un mes de venta (sin suplidor: a Suplidor Virtual)"
                  className="flex items-center gap-1 rounded bg-red-600 px-2 py-1 text-[10px] font-bold text-white hover:bg-red-700 disabled:opacity-50">
                  {pidiendo === p.producto_id && <Loader2 className="h-3 w-3 animate-spin" />}
                  Pedir {Number(p.sugerido)}
                </button>
              )} />
            );
          })}
        </div>
      )}

      {yaPedidas.length > 0 && (
        <div className="mt-2">
          <button type="button" onClick={() => setVerPedidas((v) => !v)}
            className="flex items-center gap-1 text-[11px] font-semibold text-slate-600 hover:text-slate-900">
            <ChevronDown className={`h-3.5 w-3.5 transition ${verPedidas ? 'rotate-180' : ''}`} />
            {yaPedidas.length} ya pedidas
            {viejas > 0 && (
              <span className="ml-1 rounded-full bg-amber-100 px-1.5 text-[10px] font-bold text-amber-800">
                {viejas} en órdenes de más de {VIEJA} días: reclámalas al suplidor
              </span>
            )}
          </button>
          {verPedidas && (
            <div className="mt-1">
              {yaPedidas.map((p) => {
                const dias = p.en_orden ? diasDesde(p.en_orden.fecha) : null;
                const vieja = dias !== null && dias > VIEJA;
                return (
                  <Fila key={p.producto_id} p={p} accion={
                    <span className={`text-[10px] font-semibold ${vieja ? 'text-amber-700' : 'text-slate-500'}`}>
                      {p.en_orden
                        ? `${p.en_orden.numero} · ${p.en_orden.estado} · hace ${dias} días`
                        : 'En Suplidor Virtual'}
                    </span>
                  } />
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
