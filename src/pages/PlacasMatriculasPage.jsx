// =====================================================================
// PLACA Y MATRÍCULA (27/11/2026)
// =====================================================================
// Lista de vehículos con su placa, matrícula y en qué estado están, como la
// "Lista de Vehículos" del sistema viejo. MotoPréstamos Los Naranjos registra
// aquí las placas y matrículas que tiene en existencia AUNQUE LA MOTO AÚN NO SE
// HAYA VENDIDO. Los datos son los de Notas y Comentarios (misma tabla
// documentacion_clientes): al ponerle el cliente ("Vendido a"), la unidad sale
// en la ficha del cliente con sus imágenes y su bitácora.
// =====================================================================
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { usePanels } from '@/contexts/PanelContext';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Loader2, Pencil, Plus, RefreshCw, Search, StickyNote, Trash2, UserX, X } from 'lucide-react';
import ClienteSearchModal from '@/components/ventas/ClienteSearchModal';
import { borrarDocumentacion } from '@/lib/documentosCliente';

const TIPOS = ['MOTOCICLETAS', 'PASOLA', 'CUATRIMOTOR', 'AUTOMÓVIL', 'OTRO'];
// Los mismos estados que usa Notas y Comentarios para la placa y la matrícula.
const ESTADOS = ['EN TRAMITE', 'EN CAMINERO MOTORS', 'ENTREGADA'];
const estadoBadge = (estado) => ({
  'EN TRAMITE': 'bg-red-50 text-red-700 border-red-200',
  'ENTREGADA': 'bg-green-50 text-green-700 border-green-200',
  'EN CAMINERO MOTORS': 'bg-yellow-50 text-yellow-700 border-yellow-200',
}[estado] || 'bg-slate-50 text-slate-500 border-slate-200');
const estadoLabel = (e) => (e === 'EN TRAMITE' ? 'EN TRÁMITE' : e);

const vacio = {
  tipo_vehiculo: 'MOTOCICLETAS', marca: '', modelo: '', chasis: '', placa: '', placa_estado: '',
  matricula: '', anio: '', color: '', motor: '',
  cliente_id: null, cliente_nombre: '', documento_identidad: '', telefono: '',
};

const norm = (v) => String(v || '').toLowerCase().trim();
const may = (v) => String(v || '').trim().toUpperCase();

const Badge = ({ estado }) => (estado
  ? <span className={`inline-block text-[10px] font-bold px-1.5 py-0.5 rounded border ${estadoBadge(estado)}`}>{estadoLabel(estado)}</span>
  : <span className="text-slate-300">—</span>);

export default function PlacasMatriculasPage() {
  const { tenantId, user } = useAuth();
  const { openPanel, activePanel } = usePanels();
  const { toast } = useToast();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtros, setFiltros] = useState({ tipo: '', marca: '', modelo: '', estado: '', vendido: '', q: '' });
  const [abierto, setAbierto] = useState(false);
  const [editando, setEditando] = useState(null);
  const [form, setForm] = useState(vacio);
  const [guardando, setGuardando] = useState(false);
  const [buscarCliente, setBuscarCliente] = useState(false);
  const [catalogo, setCatalogo] = useState({ marcas: [], modelos: [] });

  const cargar = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('documentacion_clientes')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(2000);
    if (error) toast({ variant: 'destructive', title: 'No se pudo cargar la lista', description: error.message });
    setRows(data || []);
    setLoading(false);
  }, [toast]);

  useEffect(() => { cargar(); }, [cargar]);

  // Marcas y modelos ya cargados en la empresa: sugerencias, no obligatorio.
  useEffect(() => {
    if (!tenantId) return;
    (async () => {
      try {
        const [{ data: ms }, { data: mds }] = await Promise.all([
          supabase.from('marcas').select('id, nombre').eq('activo', true).order('nombre', { ascending: true }),
          supabase.from('modelos').select('marca_id, nombre').eq('activo', true).order('nombre', { ascending: true }),
        ]);
        setCatalogo({ marcas: ms || [], modelos: mds || [] });
      } catch (_) { /* solo sugerencias */ }
    })();
  }, [tenantId]);

  const opciones = useMemo(() => {
    const uniq = (arr) => [...new Set(arr.map(may).filter(Boolean))].sort();
    return {
      marcas: uniq([...rows.map((r) => r.marca), ...catalogo.marcas.map((m) => m.nombre)]),
      modelos: uniq([...rows.filter((r) => !filtros.marca || may(r.marca) === filtros.marca).map((r) => r.modelo)]),
    };
  }, [rows, catalogo, filtros.marca]);

  const modelosForm = useMemo(() => {
    const marca = may(form.marca);
    const idMarca = catalogo.marcas.find((m) => may(m.nombre) === marca)?.id;
    const deCatalogo = idMarca ? catalogo.modelos.filter((m) => m.marca_id === idMarca).map((m) => m.nombre) : [];
    const usados = rows.filter((r) => !marca || may(r.marca) === marca).map((r) => r.modelo);
    return [...new Set([...deCatalogo, ...usados].map(may).filter(Boolean))].sort();
  }, [form.marca, catalogo, rows]);

  const lista = useMemo(() => {
    const q = norm(filtros.q);
    return rows.filter((r) => {
      if (filtros.tipo && may(r.tipo_vehiculo) !== filtros.tipo) return false;
      if (filtros.marca && may(r.marca) !== filtros.marca) return false;
      if (filtros.modelo && may(r.modelo) !== filtros.modelo) return false;
      if (filtros.estado && r.placa_estado !== filtros.estado) return false;
      const vendido = !!(r.cliente_id || r.cliente_nombre);
      if (filtros.vendido === 'no' && vendido) return false;
      if (filtros.vendido === 'si' && !vendido) return false;
      if (!q) return true;
      return [r.chasis, r.placa, r.matricula, r.motor, r.cliente_nombre, r.documento_identidad, r.marca, r.modelo, r.color]
        .some((v) => norm(v).includes(q));
    });
  }, [rows, filtros]);

  const resumen = useMemo(() => ({
    total: lista.length,
    sinVender: lista.filter((r) => !r.cliente_id && !r.cliente_nombre).length,
    tramite: lista.filter((r) => r.placa_estado === 'EN TRAMITE').length,
  }), [lista]);

  const nuevo = () => { setEditando(null); setForm(vacio); setAbierto(true); };
  const editar = (r) => {
    setEditando(r);
    setForm({
      ...vacio,
      ...Object.fromEntries(Object.keys(vacio).map((k) => [k, r[k] ?? vacio[k]])),
      anio: r.anio ? String(r.anio) : '',
    });
    setAbierto(true);
  };
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e?.target ? e.target.value : e }));

  const guardar = useCallback(async () => {
    if (guardando) return;
    const chasis = may(form.chasis);
    const placa = may(form.placa);
    if (!chasis && !placa) {
      toast({ variant: 'destructive', title: 'Falta el chasis o la placa', description: 'Pon al menos uno de los dos.' });
      return;
    }
    const anio = form.anio ? Number(form.anio) : null;
    if (anio != null && (!Number.isInteger(anio) || anio < 1950 || anio > 2100)) {
      toast({ variant: 'destructive', title: 'Año inválido', description: 'Escribe el año con 4 cifras (ej. 2024).' });
      return;
    }
    const repetido = rows.find((r) => r.id !== editando?.id
      && ((chasis && may(r.chasis) === chasis) || (placa && may(r.placa) === placa)));
    if (repetido && !window.confirm(`Ya hay un registro con ${may(repetido.chasis) === chasis && chasis ? `el chasis ${chasis}` : `la placa ${placa}`}${repetido.cliente_nombre ? ` (${repetido.cliente_nombre})` : ''}. ¿Guardar otro igual?`)) return;

    const payload = {
      tipo_vehiculo: form.tipo_vehiculo || null,
      marca: may(form.marca) || null,
      modelo: may(form.modelo) || null,
      chasis: chasis || null,
      placa: placa || null,
      placa_estado: form.placa_estado || null,
      matricula: form.matricula || null,
      anio,
      color: may(form.color) || null,
      motor: may(form.motor) || null,
      cliente_id: form.cliente_id || null,
      cliente_nombre: form.cliente_nombre || null,
      documento_identidad: form.documento_identidad || null,
      telefono: form.telefono || null,
      updated_at: new Date().toISOString(),
    };
    setGuardando(true);
    try {
      let res;
      if (editando) {
        res = await supabase.from('documentacion_clientes').update(payload).eq('id', editando.id).select('id');
      } else {
        res = await supabase.from('documentacion_clientes')
          .insert({ ...payload, tenant_id: tenantId, created_by: user?.id || null }).select('id');
      }
      if (res.error) throw res.error;
      if (!res.data?.length) throw new Error('No se guardó: este registro no se puede editar desde esta empresa.');
      toast({ title: editando ? 'Vehículo actualizado' : 'Vehículo registrado', description: chasis || placa });
      setAbierto(false);
      cargar();
    } catch (e) {
      toast({ variant: 'destructive', title: 'No se pudo guardar', description: e.message });
    } finally {
      setGuardando(false);
    }
  }, [form, editando, rows, tenantId, user, guardando, toast, cargar]);

  // F8 guarda, como en el sistema viejo (solo con el formulario abierto y este panel delante).
  useEffect(() => {
    if (!abierto || activePanel !== 'placas-matriculas') return undefined;
    const onKey = (e) => { if (e.key === 'F8') { e.preventDefault(); guardar(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [abierto, activePanel, guardar]);

  const borrar = async (r) => {
    if (!window.confirm(`¿Borrar ${r.chasis || r.placa}${r.cliente_nombre ? ` de ${r.cliente_nombre}` : ''}? También se borran sus imágenes.`)) return;
    try {
      await borrarDocumentacion(r);
      toast({ title: 'Borrado' });
      cargar();
    } catch (e) {
      toast({ variant: 'destructive', title: 'No se pudo borrar', description: e.message });
    }
  };

  const verNotas = (r) => openPanel('notas-comentarios', { clienteId: r.cliente_id, cedula: r.documento_identidad, t: Date.now() });

  const elegirCliente = (c) => {
    setForm((f) => ({ ...f, cliente_id: c.id, cliente_nombre: c.nombre || '', documento_identidad: c.rnc || '', telefono: c.telefono || '' }));
    setBuscarCliente(false);
  };
  const quitarCliente = () => setForm((f) => ({ ...f, cliente_id: null, cliente_nombre: '', documento_identidad: '', telefono: '' }));

  const sel = 'h-9 rounded-md border border-slate-300 bg-white px-2 text-sm';

  return (
    <div className="p-3 md:p-4 space-y-3">
      <Helmet><title>Placa y Matrícula</title></Helmet>
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <div>
          <h1 className="text-lg font-bold text-slate-800">Placa y Matrícula</h1>
          <p className="text-xs text-slate-500">
            {resumen.total} vehículos · {resumen.sinVender} sin vender · {resumen.tramite} placas en trámite. Los datos son los mismos de Notas y Comentarios.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={cargar} disabled={loading}><RefreshCw className={`w-4 h-4 mr-1 ${loading ? 'animate-spin' : ''}`} />Actualizar</Button>
          <Button size="sm" onClick={nuevo}><Plus className="w-4 h-4 mr-1" />Agregar vehículo</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-6 gap-2 bg-slate-50 border rounded-lg p-2">
        <select className={sel} value={filtros.tipo} onChange={(e) => setFiltros((f) => ({ ...f, tipo: e.target.value }))}>
          <option value="">Tipo: todos</option>{TIPOS.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select className={sel} value={filtros.marca} onChange={(e) => setFiltros((f) => ({ ...f, marca: e.target.value, modelo: '' }))}>
          <option value="">Marca: todas</option>{opciones.marcas.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        <select className={sel} value={filtros.modelo} onChange={(e) => setFiltros((f) => ({ ...f, modelo: e.target.value }))}>
          <option value="">Modelo: todos</option>{opciones.modelos.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        <select className={sel} value={filtros.estado} onChange={(e) => setFiltros((f) => ({ ...f, estado: e.target.value }))}>
          <option value="">Estatus placa: todos</option>{ESTADOS.map((s) => <option key={s} value={s}>{estadoLabel(s)}</option>)}
        </select>
        <select className={sel} value={filtros.vendido} onChange={(e) => setFiltros((f) => ({ ...f, vendido: e.target.value }))}>
          <option value="">Vendidos y sin vender</option><option value="no">Sin vender (en existencia)</option><option value="si">Vendidos</option>
        </select>
        <div className="relative">
          <Search className="w-4 h-4 absolute left-2 top-2.5 text-slate-400" />
          <Input className="h-9 pl-7" placeholder="Buscar chasis, placa, cliente…" value={filtros.q} onChange={(e) => setFiltros((f) => ({ ...f, q: e.target.value }))} />
        </div>
      </div>

      <div className="border rounded-lg overflow-auto bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-100 text-slate-600 text-xs">
            <tr>
              <th className="text-left px-2 py-2">Chasis</th>
              <th className="text-left px-2 py-2">Placa</th>
              <th className="text-left px-2 py-2">Matrícula</th>
              <th className="text-left px-2 py-2">Marca / Modelo</th>
              <th className="text-left px-2 py-2">Año</th>
              <th className="text-left px-2 py-2">Color</th>
              <th className="text-left px-2 py-2">Vendido a</th>
              <th className="text-right px-2 py-2">Opciones</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} className="text-center py-8 text-slate-400"><Loader2 className="w-5 h-5 animate-spin inline" /></td></tr>
            ) : lista.length === 0 ? (
              <tr><td colSpan={8} className="text-center py-8 text-slate-400">No hay vehículos con ese filtro.</td></tr>
            ) : lista.map((r) => (
              <tr key={r.id} className="border-t hover:bg-slate-50">
                <td className="px-2 py-1.5 font-mono text-xs">{r.chasis || '—'}</td>
                <td className="px-2 py-1.5"><span className="font-mono text-xs mr-1">{r.placa || '—'}</span><Badge estado={r.placa_estado} /></td>
                <td className="px-2 py-1.5"><Badge estado={r.matricula} /></td>
                <td className="px-2 py-1.5 text-xs">{[r.marca, r.modelo].filter(Boolean).join(' · ') || '—'}{r.tipo_vehiculo && r.tipo_vehiculo !== 'MOTOCICLETAS' ? <span className="text-slate-400"> ({r.tipo_vehiculo})</span> : null}</td>
                <td className="px-2 py-1.5 text-xs">{r.anio || ''}</td>
                <td className="px-2 py-1.5 text-xs">{r.color || ''}</td>
                <td className="px-2 py-1.5 text-xs">{r.cliente_nombre || <span className="text-amber-700 font-semibold">SIN VENDER</span>}</td>
                <td className="px-2 py-1.5 text-right whitespace-nowrap">
                  <Button variant="ghost" size="sm" className="h-7 px-2" disabled={!r.cliente_id && !r.documento_identidad} title={r.cliente_nombre ? 'Ver en Notas y Comentarios' : 'Sin cliente todavía'} onClick={() => verNotas(r)}><StickyNote className="w-4 h-4" /></Button>
                  <Button variant="ghost" size="sm" className="h-7 px-2" title="Editar" onClick={() => editar(r)}><Pencil className="w-4 h-4" /></Button>
                  <Button variant="ghost" size="sm" className="h-7 px-2 text-red-600" title="Borrar" disabled={r.tenant_id !== tenantId} onClick={() => borrar(r)}><Trash2 className="w-4 h-4" /></Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={abierto} onOpenChange={(o) => { if (!guardando) setAbierto(o); }}>
        <DialogContent className="max-w-3xl">
          <DialogHeader><DialogTitle>Datos del vehículo {editando ? '(editando)' : '(nuevo)'}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div><Label>Tipo</Label>
              <select className={`${sel} w-full`} value={form.tipo_vehiculo} onChange={set('tipo_vehiculo')}>{TIPOS.map((t) => <option key={t} value={t}>{t}</option>)}</select>
            </div>
            <div><Label>Marca</Label><Input list="pm-marcas" value={form.marca} onChange={set('marca')} placeholder="Ej. X1000" /></div>
            <div><Label>Modelo</Label><Input list="pm-modelos" value={form.modelo} onChange={set('modelo')} placeholder="Ej. CG150" /></div>
            <div><Label>Chasis</Label><Input className="font-mono" value={form.chasis} onChange={set('chasis')} autoFocus /></div>
            <div><Label>Placa</Label><Input className="font-mono" value={form.placa} onChange={set('placa')} /></div>
            <div><Label>Estado de la placa</Label>
              <select className={`${sel} w-full`} value={form.placa_estado || ''} onChange={set('placa_estado')}>
                <option value="">—</option>{ESTADOS.map((s) => <option key={s} value={s}>{estadoLabel(s)}</option>)}
              </select>
            </div>
            <div><Label>Matrícula</Label>
              <select className={`${sel} w-full`} value={form.matricula || ''} onChange={set('matricula')}>
                <option value="">—</option>{ESTADOS.map((s) => <option key={s} value={s}>{estadoLabel(s)}</option>)}
              </select>
            </div>
            <div><Label>Año</Label><Input inputMode="numeric" maxLength={4} value={form.anio} onChange={(e) => set('anio')(e.target.value.replace(/\D/g, ''))} /></div>
            <div><Label>Color</Label><Input value={form.color} onChange={set('color')} /></div>
            <div className="md:col-span-3"><Label>Motor</Label><Input className="font-mono" value={form.motor} onChange={set('motor')} /></div>
            <div className="md:col-span-3">
              <Label>Vendido a</Label>
              <div className="flex gap-2 items-center">
                <div className="flex-1 h-9 rounded-md border border-slate-300 px-3 flex items-center text-sm bg-slate-50">
                  {form.cliente_nombre
                    ? <span><b>{form.cliente_nombre}</b>{form.documento_identidad ? <span className="text-slate-500"> · {form.documento_identidad}</span> : null}</span>
                    : <span className="text-slate-400">Cliente no asignado (en existencia)</span>}
                </div>
                <Button type="button" variant="outline" size="sm" onClick={() => setBuscarCliente(true)}><Search className="w-4 h-4 mr-1" />Cliente</Button>
                {form.cliente_nombre && <Button type="button" variant="ghost" size="sm" title="Quitar cliente" onClick={quitarCliente}><UserX className="w-4 h-4" /></Button>}
              </div>
            </div>
          </div>
          <datalist id="pm-marcas">{opciones.marcas.map((m) => <option key={m} value={m} />)}</datalist>
          <datalist id="pm-modelos">{modelosForm.map((m) => <option key={m} value={m} />)}</datalist>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAbierto(false)} disabled={guardando}><X className="w-4 h-4 mr-1" />Cancelar (Esc)</Button>
            <Button onClick={guardar} disabled={guardando}>{guardando ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}{editando ? 'Actualizar' : 'Guardar'} (F8)</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ClienteSearchModal isOpen={buscarCliente} onClose={() => setBuscarCliente(false)} onSelectCliente={elegirCliente} />
    </div>
  );
}
