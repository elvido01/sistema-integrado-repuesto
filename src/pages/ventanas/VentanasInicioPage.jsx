// =====================================================================
// Ventanas y aluminio · Inicio (09/11/2026)
// ---------------------------------------------------------------------
// La entrada rápida del taller (como el inicio de Desglo): un botón por
// sistema para crear el proyecto y medir con ese tipo de ventana ya
// escogido, accesos a Cotizar / Facturar / Recibo / Barras y los proyectos
// recientes. Solo empresas tipo 'aluminio' (Sidebar soloTipos).
// =====================================================================
import React, { useCallback, useEffect, useState } from 'react';
import { Helmet } from 'react-helmet';
import { LayoutGrid, Plus, FileText, ShoppingCart, Receipt, Scissors, FolderKanban, DollarSign, Loader2, RefreshCw, ChevronRight } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { usePanels } from '@/contexts/PanelContext';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import NuevoProyectoModal from '@/components/ventanas/NuevoProyectoModal';
import ProyectoVentanaModal from '@/components/ventanas/ProyectoVentanaModal';
import CalculadoraBarras from '@/components/ventanas/CalculadoraBarras';
import { estadoProyecto, numeroProyecto } from '@/lib/ventanas';

export default function VentanasInicioPage() {
  const { tenantId } = useAuth();
  const { openPanel } = usePanels();
  const { toast } = useToast();
  const [cargando, setCargando] = useState(true);
  const [sistemas, setSistemas] = useState([]);
  const [recientes, setRecientes] = useState([]);
  const [ultimoNumero, setUltimoNumero] = useState(0);
  const [conteo, setConteo] = useState(new Map());
  const [nuevo, setNuevo] = useState(null);           // { sistema } | {} (sin sistema)
  const [abierto, setAbierto] = useState(null);       // { id, sistema }
  const [barras, setBarras] = useState(false);

  const error = useCallback((t, d) => toast({ title: t, description: d ? String(d) : undefined, variant: 'destructive' }), [toast]);

  const cargar = useCallback(async () => {
    if (!tenantId) return;
    setCargando(true);
    try {
      const { count } = await supabase.from('vent_sistemas').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId);
      if (!count) await supabase.rpc('vent_preparar_empresa');
      const [si, pr] = await Promise.all([
        supabase.from('vent_sistemas').select('id, nombre, activo, orden').eq('tenant_id', tenantId).eq('activo', true).order('orden'),
        supabase.from('vent_proyectos').select('id, numero, nombre, estado, cliente_nombre, updated_at, clientes(nombre)')
          .eq('tenant_id', tenantId).order('numero', { ascending: false }).limit(8),
      ]);
      if (si.error || pr.error) throw (si.error || pr.error);
      setSistemas(si.data || []);
      setRecientes(pr.data || []);
      setUltimoNumero(pr.data?.[0]?.numero || 0);
      const ids = (pr.data || []).map((p) => p.id);
      if (ids.length) {
        const { data: me } = await supabase.from('vent_medidas').select('proyecto_id, cantidad').eq('tenant_id', tenantId).in('proyecto_id', ids);
        const c = new Map();
        for (const m of me || []) c.set(m.proyecto_id, (c.get(m.proyecto_id) || 0) + Number(m.cantidad || 0));
        setConteo(c);
      }
    } catch (e) {
      error('No se pudo cargar el inicio', e?.message);
    } finally {
      setCargando(false);
    }
  }, [tenantId, error]);
  useEffect(() => { cargar(); }, [cargar]);

  const accesos = [
    { t: 'Cotizar', icon: FileText, onClick: () => openPanel('cotizaciones') },
    { t: 'Facturar', icon: ShoppingCart, onClick: () => openPanel('ventas') },
    { t: 'Recibo', icon: Receipt, onClick: () => openPanel('recibo-ingreso') },
    { t: 'Barras', icon: Scissors, onClick: () => setBarras(true) },
    { t: 'Proyectos', icon: FolderKanban, onClick: () => openPanel('vent-proyectos') },
    { t: 'Precios', icon: DollarSign, onClick: () => openPanel('vent-precios') },
  ];

  return (
    <div className="h-full overflow-y-auto p-6 bg-gray-50">
      <Helmet><title>Inicio — Ventanas</title></Helmet>
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <LayoutGrid className="w-6 h-6 text-blue-700" />
          <h1 className="text-xl font-black text-gray-900 uppercase">Ventanas</h1>
          <Button className="ml-auto" variant="outline" onClick={cargar} disabled={cargando}>
            <RefreshCw className={`w-4 h-4 mr-1 ${cargando ? 'animate-spin' : ''}`} /> Actualizar
          </Button>
        </div>

        <section>
          <h2 className="text-sm font-bold text-gray-700 mb-2">Crear proyecto</h2>
          {cargando ? <Loader2 className="w-6 h-6 animate-spin text-blue-600" /> : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
              <button type="button" onClick={() => setNuevo({})}
                className="rounded-lg border-2 border-blue-300 bg-blue-50 p-3 text-left hover:bg-blue-100">
                <Plus className="w-5 h-5 text-blue-700" />
                <div className="font-bold text-blue-800 mt-1">Nuevo proyecto</div>
                <div className="text-[11px] text-gray-500">Puertas, ventanas, varios tipos</div>
              </button>
              {sistemas.map((s) => (
                <button key={s.id} type="button" onClick={() => setNuevo({ sistema: s })}
                  className="rounded-lg border border-gray-200 bg-white p-3 text-left hover:border-blue-300 hover:shadow-sm">
                  <Plus className="w-4 h-4 text-white bg-blue-600 rounded" />
                  <div className="font-semibold text-gray-800 mt-1 leading-tight">{s.nombre}</div>
                </button>
              ))}
            </div>
          )}
        </section>

        <section>
          <h2 className="text-sm font-bold text-gray-700 mb-2">Acceso rápido</h2>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
            {accesos.map((a) => (
              <button key={a.t} type="button" onClick={a.onClick}
                className="rounded-lg border border-gray-200 bg-white p-3 flex flex-col items-center gap-1 hover:border-blue-300 hover:shadow-sm">
                <span className="w-10 h-10 rounded-lg bg-blue-700 text-white flex items-center justify-center"><a.icon className="w-5 h-5" /></span>
                <span className="text-sm font-semibold text-gray-800">{a.t}</span>
              </button>
            ))}
          </div>
        </section>

        <section>
          <div className="flex items-center mb-2">
            <h2 className="text-sm font-bold text-gray-700">Proyectos recientes</h2>
            <button type="button" className="ml-auto text-sm font-semibold text-blue-700" onClick={() => openPanel('vent-proyectos')}>Ver todos</button>
          </div>
          {!cargando && !recientes.length ? (
            <div className="rounded-lg border border-dashed border-gray-300 bg-white py-10 text-center text-gray-500">
              No hay proyectos todavía.
              <div className="mt-3"><Button onClick={() => setNuevo({})}><Plus className="w-4 h-4 mr-1" /> Crear proyecto</Button></div>
            </div>
          ) : (
            <div className="space-y-2">
              {recientes.map((p) => {
                const est = estadoProyecto(p.estado);
                return (
                  <button key={p.id} type="button" onClick={() => setAbierto({ id: p.id })}
                    className="w-full text-left rounded-lg border border-gray-200 bg-white p-3 flex items-center gap-3 hover:border-blue-300">
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-gray-900 truncate">{p.nombre}</div>
                      <div className="text-xs text-gray-500">{numeroProyecto(p.numero)} · {p.clientes?.nombre || p.cliente_nombre || 'Cliente por defecto'}</div>
                    </div>
                    <span className="text-xs text-gray-500">{conteo.get(p.id) || 0} ventana(s)</span>
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border whitespace-nowrap ${est.c}`}>{est.t}</span>
                    <ChevronRight className="w-4 h-4 text-gray-400" />
                  </button>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {nuevo && (
        <NuevoProyectoModal tenantId={tenantId} siguiente={ultimoNumero + 1} sistemaNombre={nuevo.sistema?.nombre || null}
          onClose={() => setNuevo(null)} onError={error}
          onCreado={(p) => { const s = nuevo.sistema?.id || null; setNuevo(null); cargar(); setAbierto({ id: p.id, sistema: s }); }} />
      )}
      {abierto && (
        <ProyectoVentanaModal proyectoId={abierto.id} sistemaInicial={abierto.sistema || null} tenantId={tenantId}
          onClose={() => { setAbierto(null); cargar(); }} onError={error} />
      )}
      {barras && <CalculadoraBarras tenantId={tenantId} onClose={() => setBarras(false)} />}
    </div>
  );
}
