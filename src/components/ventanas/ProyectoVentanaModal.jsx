// =====================================================================
// Proyecto de ventanas (09/11/2026): datos, estado, cita y CONTROL DE
// MEDIDAS. Cada ventana: sistema, hojas (las que admite el sistema), ancho
// y alto en pulgadas ("40 1 4" = 40 1/4), cantidad, color y ubicación.
// Fuera de 6"–400" avisa "Revise la medida" y no la agrega.
// =====================================================================
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Trash2, Pencil, Ruler, Printer } from 'lucide-react';
import { DesgloseVentanas, MaterialesVentanas } from '@/components/ventanas/DesgloseProyecto';
import PresupuestoProyecto from '@/components/ventanas/PresupuestoProyecto';
import { useToast } from '@/components/ui/use-toast';
import { desgloseProyectoHTML } from '@/lib/printVentanas';
import { printHtmlSmart } from '@/lib/printHtmlSmart';
import { supabase } from '@/lib/customSupabaseClient';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ESTADOS_PROYECTO, estadoProyecto, numeroProyecto, leerPulgadas, pulgadasTexto, medidaRazonable, COLORES_ALUMINIO } from '@/lib/ventanas';

const campo = 'h-10 w-full rounded-md border border-gray-300 px-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-300';
const etiqueta = 'text-[11px] font-bold text-gray-600 uppercase';
const MEDIDA_VACIA = { ancho: '', alto: '', cantidad: '1', color: '', ubicacion: '' };

export default function ProyectoVentanaModal({ proyectoId, tenantId, onClose, onError }) {
  const [cargando, setCargando] = useState(true);
  const [p, setP] = useState(null);
  const [sistemas, setSistemas] = useState([]);
  const [medidas, setMedidas] = useState([]);
  const [sistemaId, setSistemaId] = useState('');
  const [hojas, setHojas] = useState(2);
  const [m, setM] = useState(MEDIDA_VACIA);
  const [editando, setEditando] = useState(null);     // id de la medida que se corrige
  const [intento, setIntento] = useState(false);      // mostrar "Revise la medida" tras intentar agregar
  const [guardando, setGuardando] = useState(false);
  const anchoRef = useRef(null);
  const [tab, setTab] = useState('medidas');          // medidas | desglose | materiales | presupuesto
  const { toast } = useToast();
  const [piezasPorSistema, setPiezasPorSistema] = useState({});
  const [cfg, setCfg] = useState(null);
  const [imprimiendo, setImprimiendo] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    const [pr, si, me, pz, cf] = await Promise.all([
      supabase.from('vent_proyectos').select('*, clientes(nombre, telefono, direccion)').eq('id', proyectoId).eq('tenant_id', tenantId).single(),
      supabase.from('vent_sistemas').select('*').eq('tenant_id', tenantId).eq('activo', true).order('orden'),
      supabase.from('vent_medidas').select('*').eq('proyecto_id', proyectoId).eq('tenant_id', tenantId).order('orden').order('created_at'),
      supabase.from('vent_piezas').select('*').eq('tenant_id', tenantId).eq('activo', true).order('orden'),
      supabase.from('vent_config').select('*').eq('tenant_id', tenantId).maybeSingle(),
    ]);
    const porSistema = {};
    for (const x of pz.data || []) (porSistema[x.sistema_id] = porSistema[x.sistema_id] || []).push(x);
    setPiezasPorSistema(porSistema);
    setCfg(cf.data || null);
    setCargando(false);
    if (pr.error) { onError('No se pudo abrir el proyecto', pr.error.message); onClose(); return; }
    setP(pr.data);
    setSistemas(si.data || []);
    setMedidas(me.data || []);
    setSistemaId((actual) => actual || si.data?.[0]?.id || '');
  }, [proyectoId, tenantId, onError, onClose]);
  useEffect(() => { cargar(); }, [cargar]);

  const sistema = useMemo(() => sistemas.find((x) => x.id === sistemaId), [sistemas, sistemaId]);
  const nombreSistema = (id) => sistemas.find((x) => x.id === id)?.nombre || '—';
  useEffect(() => { if (sistema && !sistema.hojas.includes(hojas)) setHojas(sistema.hojas[0]); }, [sistema]); // eslint-disable-line react-hooks/exhaustive-deps

  const ancho = leerPulgadas(m.ancho);
  const alto = leerPulgadas(m.alto);
  const anchoMal = (intento || m.ancho) && !medidaRazonable(ancho);
  const altoMal = (intento || m.alto) && !medidaRazonable(alto);

  // Guarda un dato del proyecto (estado, cita, dirección…) y confirma que cambió.
  const guardarProyecto = async (cambios) => {
    const { data, error } = await supabase.from('vent_proyectos').update(cambios).eq('id', p.id).eq('tenant_id', tenantId).select('*, clientes(nombre, telefono, direccion)');
    if (error || !data?.length) return onError('No se guardó', error?.message || 'Sin permiso');
    setP(data[0]);
    return undefined;
  };

  const agregar = async () => {
    setIntento(true);
    if (!sistemaId) return onError('Falta el sistema', 'Escoge el tipo de ventana.');
    if (!medidaRazonable(ancho) || !medidaRazonable(alto)) return undefined;
    const cantidad = Math.max(1, parseInt(m.cantidad, 10) || 1);
    setGuardando(true);
    const fila = {
      tenant_id: tenantId, proyecto_id: p.id, sistema_id: sistemaId, hojas,
      ancho, alto, cantidad, color: m.color || null, ubicacion: m.ubicacion.trim() || null,
    };
    const res = editando
      ? await supabase.from('vent_medidas').update(fila).eq('id', editando).eq('tenant_id', tenantId).select('id')
      : await supabase.from('vent_medidas').insert({ ...fila, orden: medidas.length + 1 }).select('id');
    setGuardando(false);
    if (res.error || !res.data?.length) return onError('No se guardó la medida', res.error?.message || 'Sin permiso');
    setM((x) => ({ ...MEDIDA_VACIA, color: x.color }));   // el color se queda para la siguiente
    setEditando(null); setIntento(false);
    await cargar();
    anchoRef.current?.focus();
    return undefined;
  };

  const corregir = (me) => {
    setEditando(me.id); setSistemaId(me.sistema_id); setHojas(me.hojas);
    setM({ ancho: pulgadasTexto(me.ancho), alto: pulgadasTexto(me.alto), cantidad: String(me.cantidad), color: me.color || '', ubicacion: me.ubicacion || '' });
    anchoRef.current?.focus();
  };

  const borrar = async (me) => {
    if (!window.confirm(`¿Quitar la ventana ${pulgadasTexto(me.ancho)} x ${pulgadasTexto(me.alto)}?`)) return;
    const { data, error } = await supabase.from('vent_medidas').delete().eq('id', me.id).eq('tenant_id', tenantId).select('id');
    if (error || !data?.length) { onError('No se pudo quitar', error?.message || 'Sin permiso'); return; }
    setMedidas((ms) => ms.filter((x) => x.id !== me.id));
  };

  const totalVentanas = medidas.reduce((s, x) => s + Number(x.cantidad || 0), 0);

  // Marcar / desmarcar un corte hecho (taller).
  const marcarCorte = async (me, piezaId) => {
    const hechos = new Set(me.cortes_hechos || []);
    if (hechos.has(piezaId)) hechos.delete(piezaId); else hechos.add(piezaId);
    const nuevos = [...hechos];
    setMedidas((ms) => ms.map((x) => (x.id === me.id ? { ...x, cortes_hechos: nuevos } : x)));
    const { data, error } = await supabase.from('vent_medidas').update({ cortes_hechos: nuevos }).eq('id', me.id).eq('tenant_id', tenantId).select('id');
    if (error || !data?.length) { onError('No se guardó el corte', error?.message || 'Sin permiso'); cargar(); }
  };

  const imprimir = async () => {
    setImprimiendo(true);
    try {
      const { data: e } = await supabase.from('config_empresa').select('nombre, direccion1, direccion2, telefono, logo_url').eq('tenant_id', tenantId).maybeSingle();
      const empresa = e ? { nombre: e.nombre, logo_url: e.logo_url, telefono: e.telefono, direccion: [e.direccion1, e.direccion2].filter(Boolean).join(', ') } : {};
      await printHtmlSmart(desgloseProyectoHTML({ empresa, proyecto: p, medidas, nombreSistema, piezasPorSistema, cfg }), { tipo: 'carta' });
    } catch (err) {
      onError('No se pudo imprimir', err?.message);
    } finally {
      setImprimiendo(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{p ? `${p.nombre} · ${numeroProyecto(p.numero)}` : 'Proyecto'}</DialogTitle>
        </DialogHeader>
        {cargando && !p ? (
          <div className="py-12 flex justify-center"><Loader2 className="w-7 h-7 animate-spin text-blue-600" /></div>
        ) : p && (
          <div className="space-y-4">
            {/* Datos del proyecto */}
            <section className="rounded-lg border border-gray-200 p-3 grid grid-cols-1 md:grid-cols-4 gap-3">
              <div className="md:col-span-2">
                <span className={etiqueta}>Cliente</span>
                <div className="mt-1 text-sm font-semibold">{p.clientes?.nombre || p.cliente_nombre || 'Cliente por defecto'}</div>
                <div className="text-xs text-gray-500">{[p.direccion, p.telefono].filter(Boolean).join(' · ') || 'Sin dirección ni teléfono'}</div>
              </div>
              <label className="block"><span className={etiqueta}>Estado</span>
                <select className={`${campo} mt-1 ${estadoProyecto(p.estado).c}`} value={p.estado} onChange={(e) => guardarProyecto({ estado: e.target.value })}>
                  {ESTADOS_PROYECTO.map((x) => <option key={x.k} value={x.k}>{x.t}</option>)}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="block"><span className={etiqueta}>Cita</span>
                  <input type="date" className={`${campo} mt-1 px-1`} value={p.fecha_cita || ''} onChange={(e) => guardarProyecto({ fecha_cita: e.target.value || null })} />
                </label>
                <label className="block"><span className={etiqueta}>Hora</span>
                  <input type="time" className={`${campo} mt-1 px-1`} value={p.hora_cita?.slice(0, 5) || ''} onChange={(e) => guardarProyecto({ hora_cita: e.target.value || null })} />
                </label>
              </div>
            </section>

            <div className="flex flex-wrap items-center gap-2">
              {[['medidas', 'Medidas'], ['desglose', 'Desglose'], ['materiales', 'Materiales y barras'], ['presupuesto', 'Presupuesto']].map(([k, t]) => (
                <button key={k} type="button" onClick={() => setTab(k)}
                  className={`px-4 py-1.5 rounded-md text-sm font-semibold border ${tab === k ? 'bg-blue-700 text-white border-blue-700' : 'bg-white text-gray-600 border-gray-300'}`}>{t}</button>
              ))}
              <Button size="sm" variant="outline" className="ml-auto" onClick={imprimir} disabled={imprimiendo || !medidas.length}>
                {imprimiendo ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Printer className="w-4 h-4 mr-1" />} Imprimir / PDF
              </Button>
            </div>

            {tab === 'desglose' && <DesgloseVentanas medidas={medidas} nombreSistema={nombreSistema} piezasPorSistema={piezasPorSistema} onMarcar={marcarCorte} />}
            {tab === 'materiales' && <MaterialesVentanas medidas={medidas} piezasPorSistema={piezasPorSistema} cfg={cfg} />}
            {tab === 'presupuesto' && (
              <PresupuestoProyecto proyecto={p} medidas={medidas} nombreSistema={nombreSistema} tenantId={tenantId} onError={onError}
                onCotizado={(c) => { toast({ title: `Cotización ${c.numero} creada`, description: `RD${Number(c.total).toLocaleString('en-US', { minimumFractionDigits: 2 })} · el proyecto pasó a Cotizado` }); cargar(); }} />
            )}

            {tab === 'medidas' && <>
            {/* Control de medidas */}
            <section className="rounded-lg border border-blue-200 bg-blue-50/40 p-3 space-y-3">
              <h3 className="text-sm font-black text-blue-800 uppercase flex items-center gap-2"><Ruler className="w-4 h-4" /> Control de medidas (pulgadas)</h3>
              <div>
                <span className={etiqueta}>Tipo de ventana</span>
                <div className="mt-1 flex flex-wrap gap-2">
                  {sistemas.map((x) => (
                    <button key={x.id} type="button" onClick={() => setSistemaId(x.id)}
                      className={`text-xs font-semibold px-3 py-1.5 rounded-full border ${sistemaId === x.id ? 'bg-blue-700 text-white border-blue-700' : 'bg-white text-gray-700 border-gray-300 hover:border-blue-400'}`}>
                      {x.nombre}
                    </button>
                  ))}
                </div>
              </div>
              {sistema && (
                <div className="flex gap-2">
                  {sistema.hojas.map((h) => (
                    <button key={h} type="button" onClick={() => setHojas(h)}
                      className={`px-4 py-1.5 rounded-full text-sm font-semibold border ${hojas === h ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-gray-600 border-gray-300'}`}>
                      {h} {h === 1 ? 'Hoja' : 'Hojas'}
                    </button>
                  ))}
                </div>
              )}
              <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
                <label className="block md:col-span-1"><span className={etiqueta}>Ancho</span>
                  <input ref={anchoRef} inputMode="decimal" className={`${campo} mt-1 ${anchoMal ? 'border-red-500' : ''}`} placeholder='40 1 4'
                    value={m.ancho} onChange={(e) => setM((x) => ({ ...x, ancho: e.target.value }))} />
                  <span className={`text-[11px] ${anchoMal ? 'text-red-600' : 'text-gray-500'}`}>{anchoMal ? 'Revise la medida' : ancho != null ? `= ${pulgadasTexto(ancho)}"` : ' '}</span>
                </label>
                <label className="block md:col-span-1"><span className={etiqueta}>Alto</span>
                  <input inputMode="decimal" className={`${campo} mt-1 ${altoMal ? 'border-red-500' : ''}`} placeholder='40 1 8'
                    value={m.alto} onChange={(e) => setM((x) => ({ ...x, alto: e.target.value }))}
                    onKeyDown={(e) => e.key === 'Enter' && agregar()} />
                  <span className={`text-[11px] ${altoMal ? 'text-red-600' : 'text-gray-500'}`}>{altoMal ? 'Revise la medida' : alto != null ? `= ${pulgadasTexto(alto)}"` : ' '}</span>
                </label>
                <label className="block"><span className={etiqueta}>Cantidad</span>
                  <input inputMode="numeric" className={`${campo} mt-1`} value={m.cantidad} onChange={(e) => setM((x) => ({ ...x, cantidad: e.target.value.replace(/\D/g, '') }))} />
                </label>
                <label className="block"><span className={etiqueta}>Color</span>
                  <select className={`${campo} mt-1`} value={m.color} onChange={(e) => setM((x) => ({ ...x, color: e.target.value }))}>
                    <option value="">—</option>
                    {COLORES_ALUMINIO.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </label>
                <label className="block md:col-span-2"><span className={etiqueta}>Ubicación</span>
                  <input className={`${campo} mt-1`} placeholder="Sala, cocina, hab. 1…" value={m.ubicacion} onChange={(e) => setM((x) => ({ ...x, ubicacion: e.target.value }))}
                    onKeyDown={(e) => e.key === 'Enter' && agregar()} />
                </label>
              </div>
              <div className="flex gap-2">
                <Button onClick={agregar} disabled={guardando}>{guardando && <Loader2 className="w-4 h-4 mr-1 animate-spin" />} {editando ? 'Guardar corrección' : 'Agregar ventana'}</Button>
                {editando && <Button variant="ghost" onClick={() => { setEditando(null); setM(MEDIDA_VACIA); setIntento(false); }}>Cancelar corrección</Button>}
                <span className="ml-auto self-center text-xs text-gray-500">Fracciones: escribe el número y la fracción con espacios (40 1 4 = 40 1/4).</span>
              </div>
            </section>

            {/* Todas las medidas */}
            <section className="rounded-lg border border-gray-200">
              <div className="px-3 py-2 border-b text-sm font-bold text-gray-700">Todas las medidas · {totalVentanas} ventana(s)</div>
              {medidas.length ? (
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-[11px] uppercase text-gray-500 border-b">
                    <th className="py-1.5 px-3">#</th><th>Tipo</th><th>Hojas</th><th>Ancho × Alto</th><th className="text-center">Cant.</th><th>Color</th><th>Ubicación</th><th />
                  </tr></thead>
                  <tbody>
                    {medidas.map((me, i) => (
                      <tr key={me.id} className={`border-b last:border-0 ${editando === me.id ? 'bg-amber-50' : ''}`}>
                        <td className="py-1.5 px-3 text-gray-500">{i + 1}</td>
                        <td>{nombreSistema(me.sistema_id)}</td>
                        <td>{me.hojas}</td>
                        <td className="font-mono">{pulgadasTexto(me.ancho)}" × {pulgadasTexto(me.alto)}"</td>
                        <td className="text-center">{me.cantidad}</td>
                        <td>{me.color || '—'}</td>
                        <td className="text-gray-600">{me.ubicacion || ''}</td>
                        <td className="text-right pr-2 whitespace-nowrap">
                          <Button size="sm" variant="ghost" title="Corregir" onClick={() => corregir(me)}><Pencil className="w-4 h-4" /></Button>
                          <Button size="sm" variant="ghost" title="Quitar" onClick={() => borrar(me)}><Trash2 className="w-4 h-4 text-red-600" /></Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="py-8 text-center text-sm text-gray-400">Todavía no hay medidas. Agrega la primera ventana arriba.</div>
              )}
            </section>
            </>}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
