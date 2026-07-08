import React, { useCallback, useState } from 'react';
import { Helmet } from 'react-helmet';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { usePanels } from '@/contexts/PanelContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Download, Eye, FileImage, List, Loader2, Plus, Printer, Save, Search, Trash2, Upload, X } from 'lucide-react';
import ClienteSearchModal from '@/components/ventas/ClienteSearchModal';

// ── Documentación (misma tabla/bucket que Documentación Cliente) ──
const BUCKET = 'documentacion-clientes';
const docFields = [
  { key: 'cedula_pasaporte_path', label: 'Cédula / Pasaporte' },
  { key: 'matricula_moto_path', label: 'Matrícula Moto' },
  { key: 'placa_path', label: 'Placa' },
  { key: 'autorizacion_path', label: 'Autorización' },
  { key: 'carta_saldo_path', label: 'Carta de Saldo' },
];
const ESTADOS_DOC = ['EN TRAMITE', 'ENTREGADA', 'EN CAMINERO MOTORS'];
const estadoBadge = (estado) => ({
  'EN TRAMITE': 'bg-red-50 text-red-700 border-red-200',
  'ENTREGADA': 'bg-green-50 text-green-700 border-green-200',
  'EN CAMINERO MOTORS': 'bg-yellow-50 text-yellow-700 border-yellow-200',
}[estado] || 'bg-slate-50 text-slate-500 border-slate-200');

const emptyDocForm = { chasis: '', placa: '', placa_estado: '', matricula: '' };

const fdate = (d) => {
  if (!d) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(d);
};
const fhora = (ts) => {
  if (!ts) return '';
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit' });
};

const NotasComentariosPage = () => {
  const { toast } = useToast();
  const { tenantId, user, profile } = useAuth();
  const { closePanel, openPanel, activePanel } = usePanels();

  const [cliente, setCliente] = useState(null);
  const [codigoInput, setCodigoInput] = useState('');
  const [buscarOpen, setBuscarOpen] = useState(false);
  const [prestamos, setPrestamos] = useState([]);
  const [prestamoId, setPrestamoId] = useState('');
  const [notas, setNotas] = useState([]);
  const [nuevaNota, setNuevaNota] = useState('');
  const [loading, setLoading] = useState(false);
  const [guardando, setGuardando] = useState(false);

  // Documentación del cliente (unidades: chasis/placa/matrícula + imágenes)
  const [docs, setDocs] = useState([]);
  const [docEditing, setDocEditing] = useState(null);
  const [docForm, setDocForm] = useState(emptyDocForm);
  const [docFiles, setDocFiles] = useState({});
  const [docUrls, setDocUrls] = useState({});
  const [docSaving, setDocSaving] = useState(false);
  const [imagePreview, setImagePreview] = useState(null);

  const esAdmin = ['admin', 'owner', 'manager', 'gerente'].includes(profile?.role);

  const cargar = useCallback(async (clienteId, cedula) => {
    if (!clienteId) return;
    setLoading(true);
    try {
      // Las notas y la documentación de la empresa aliada (Caminero <->
      // Naranjos) se cruzan por cédula: el mismo cliente tiene otro id allá
      const ced = (cedula || '').trim();
      let notasQuery = supabase.from('cliente_notas')
        .select('id, fecha, nota, usuario_nombre, created_at, tenant_id, prestamo:prestamo_id (numero)')
        .order('created_at', { ascending: false });
      notasQuery = ced
        ? notasQuery.or(`cliente_id.eq.${clienteId},cliente_cedula.eq.${ced}`)
        : notasQuery.eq('cliente_id', clienteId);

      let docsQuery = supabase.from('documentacion_clientes')
        .select('*')
        .order('created_at', { ascending: false });
      docsQuery = ced
        ? docsQuery.or(`cliente_id.eq.${clienteId},documento_identidad.eq.${ced}`)
        : docsQuery.eq('cliente_id', clienteId);

      const [{ data: nts, error: e1 }, { data: prs, error: e2 }, { data: dcs, error: e3 }] = await Promise.all([
        notasQuery,
        supabase.from('prestamos')
          .select('id, numero, estado')
          .eq('cliente_id', clienteId)
          .order('created_at', { ascending: false }),
        docsQuery,
      ]);
      if (e1) throw e1;
      if (e2) throw e2;
      if (e3) throw e3;
      setNotas(nts || []);
      setPrestamos(prs || []);
      setDocs(dcs || []);
    } catch (e) {
      toast({ variant: 'destructive', title: 'No se pudieron cargar los datos del cliente', description: e.message });
      setNotas([]); setPrestamos([]); setDocs([]);
    }
    setLoading(false);
  }, [toast]);

  const seleccionarCliente = (c) => {
    setCliente(c); setBuscarOpen(false);
    setCodigoInput(c.codigo || c.rnc || '');
    setPrestamoId(''); setNuevaNota('');
    // El formulario de documentación queda desplegado y limpio para este cliente
    setDocEditing(null); setDocForm(emptyDocForm); setDocFiles({}); setDocUrls({});
    cargar(c.id, c.rnc);
  };

  const buscarPorCodigo = async () => {
    const q = codigoInput.trim();
    if (!q) return;
    try {
      const { data: cls, error } = await supabase
        .from('clientes').select('id, nombre, codigo, rnc, direccion, telefono')
        .or(`codigo.eq.${q},rnc.eq.${q}`).eq('activo', true).limit(1);
      if (error) throw error;
      if (cls && cls.length) seleccionarCliente(cls[0]);
      else toast({ variant: 'destructive', title: 'Cliente no encontrado', description: `No hay cliente con código/cédula ${q}.` });
    } catch (e) {
      toast({ variant: 'destructive', title: 'Error al buscar', description: e.message });
    }
  };

  // ── Notas ──
  const agregarNota = async () => {
    const texto = nuevaNota.trim();
    if (!cliente || !texto) return;
    setGuardando(true);
    try {
      const { error } = await supabase.from('cliente_notas').insert({
        tenant_id: tenantId,
        cliente_id: cliente.id,
        cliente_cedula: (cliente.rnc || '').trim() || null,
        prestamo_id: prestamoId || null,
        nota: texto,
        usuario_id: user?.id || null,
        usuario_nombre: profile?.nombre_completo || user?.email || null,
      });
      if (error) throw error;
      setNuevaNota('');
      await cargar(cliente.id, cliente.rnc);
    } catch (e) {
      toast({ variant: 'destructive', title: 'No se pudo guardar la nota', description: e.message });
    }
    setGuardando(false);
  };

  const eliminarNota = async (n) => {
    if (!window.confirm('¿Eliminar esta nota?')) return;
    try {
      const { error } = await supabase.from('cliente_notas').delete().eq('id', n.id);
      if (error) throw error;
      setNotas((prev) => prev.filter((x) => x.id !== n.id));
    } catch (e) {
      toast({ variant: 'destructive', title: 'No se pudo eliminar', description: e.message });
    }
  };

  // ── Documentación ──
  const getSignedUrls = async (record) => {
    const urls = {};
    await Promise.all(docFields.map(async (field) => {
      const path = record?.[field.key];
      if (!path) return;
      const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 10);
      if (data?.signedUrl) urls[field.key] = data.signedUrl;
    }));
    return urls;
  };

  const abrirDocNuevo = () => {
    setDocEditing(null);
    setDocForm(emptyDocForm);
    setDocFiles({}); setDocUrls({});
  };

  const abrirDocEditar = async (record) => {
    setDocEditing(record);
    setDocForm({
      chasis: record.chasis || '',
      placa: record.placa || '',
      placa_estado: record.placa_estado || '',
      matricula: record.matricula || '',
    });
    setDocFiles({});
    setDocUrls(await getSignedUrls(record));
  };

  const handleDocFile = (key, file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast({ variant: 'destructive', title: 'Archivo inválido', description: 'Solo se permiten imágenes.' });
      return;
    }
    setDocFiles((prev) => ({ ...prev, [key]: file }));
    setDocUrls((prev) => ({ ...prev, [key]: URL.createObjectURL(file) }));
  };

  const guardarDoc = async () => {
    if (!cliente && !docEditing) return;
    setDocSaving(true);
    try {
      const recordId = docEditing?.id || crypto.randomUUID();
      const uploaded = {};
      for (const field of docFields) {
        const file = docFiles[field.key];
        if (!file) continue;
        const ext = file.name.split('.').pop() || 'jpg';
        const path = `${tenantId}/${recordId}/${field.key.replace('_path', '')}-${Date.now()}.${ext}`;
        const { error } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: true, contentType: file.type });
        if (error) throw new Error(`No se pudo subir ${field.label}: ${error.message}`);
        if (docEditing?.[field.key]) {
          await supabase.storage.from(BUCKET).remove([docEditing[field.key]]).catch(() => {});
        }
        uploaded[field.key] = path;
      }

      // El cliente NO se re-digita: viene del cliente seleccionado (campos
      // unificados). Editar un registro de la empresa aliada no se lo apropia.
      const payload = {
        id: recordId,
        tenant_id: docEditing?.tenant_id || tenantId,
        cliente_id: docEditing ? (docEditing.cliente_id || cliente?.id || null) : cliente.id,
        cliente_nombre: docEditing?.cliente_nombre || (cliente?.nombre || '').toUpperCase(),
        documento_identidad: docEditing?.documento_identidad || (cliente?.rnc || ''),
        telefono: docEditing?.telefono || (cliente?.telefono || ''),
        chasis: docForm.chasis.trim().toUpperCase(),
        placa: docForm.placa.trim().toUpperCase(),
        placa_estado: docForm.placa_estado || null,
        matricula: docForm.matricula || null,
        notas: docEditing?.notas ?? null,
        updated_at: new Date().toISOString(),
        created_by: docEditing?.created_by || user?.id || null,
        ...uploaded,
      };

      const { error } = await supabase.from('documentacion_clientes').upsert(payload, { onConflict: 'id' });
      if (error) throw error;

      toast({ title: 'Documentación guardada' });
      abrirDocNuevo(); // formulario limpio, listo para la siguiente unidad
      if (cliente) cargar(cliente.id, cliente.rnc);
    } catch (e) {
      toast({ variant: 'destructive', title: 'Error guardando documentación', description: e.message });
    } finally {
      setDocSaving(false);
    }
  };

  const eliminarDoc = async (record) => {
    if (!window.confirm(`¿Borrar la documentación del chasis ${record.chasis || '(sin chasis)'}?`)) return;
    try {
      const paths = docFields.map((f) => record[f.key]).filter(Boolean);
      if (paths.length) await supabase.storage.from(BUCKET).remove(paths).catch(() => {});
      const { error } = await supabase.from('documentacion_clientes').delete().eq('id', record.id);
      if (error) throw error;
      toast({ title: 'Registro eliminado' });
      if (cliente) cargar(cliente.id, cliente.rnc);
    } catch (e) {
      toast({ variant: 'destructive', title: 'Error eliminando', description: e.message });
    }
  };

  const handleDownloadImage = (preview) => {
    if (!preview?.url) return;
    const a = document.createElement('a');
    a.href = preview.url; a.download = preview.label || 'documento';
    a.target = '_blank'; a.click();
  };

  const handlePrintImage = (preview) => {
    if (!preview?.url) return;
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(`
      <html><head><title>${preview.label}</title>
      <style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#fff;}img{max-width:100%;max-height:100vh;object-fit:contain;}</style>
      </head><body><img src="${preview.url}" alt="${preview.label}" onload="window.print()" /></body></html>
    `);
    win.document.close();
  };

  const countDocs = (r) => docFields.filter((f) => r[f.key]).length;

  return (
    <div className="p-1.5 bg-slate-100">
      <Helmet><title>Notas y Comentarios — Documentos</title></Helmet>
      <div className="bg-white rounded-lg shadow border w-full overflow-hidden">
        <div className="bg-gradient-to-r from-slate-300 to-slate-200 text-slate-800 text-center py-1 font-extrabold tracking-wide text-base">
          NOTAS Y COMENTARIOS — DOCUMENTACIÓN DEL CLIENTE
        </div>

        <div className="p-2 space-y-2">
          {/* Cliente (único: sirve para notas y documentación) */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-2 [&>*]:min-w-0">
            <div className="border rounded-md p-2 lg:col-span-2">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase whitespace-nowrap">Cliente</span>
                <Input
                  value={codigoInput}
                  onChange={(e) => setCodigoInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); buscarPorCodigo(); } }}
                  placeholder="Código o cédula" className="flex-1 h-8 text-sm"
                />
                <Button type="button" variant="outline" size="sm" onClick={() => setBuscarOpen(true)}>
                  <Search className="w-3.5 h-3.5 mr-1" />F3
                </Button>
              </div>
              <div className="mt-2 flex items-center gap-3 flex-wrap">
                <span className="text-sm font-bold text-blue-700 leading-tight truncate" title={cliente?.nombre || ''}>{cliente?.nombre || '—'}</span>
                {cliente?.rnc && <span className="text-xs text-slate-500">Cédula: <b>{cliente.rnc}</b></span>}
                {cliente?.telefono && <span className="text-xs text-slate-500">Tel: <b>{cliente.telefono}</b></span>}
              </div>
              <div className="text-xs text-slate-500 truncate" title={cliente?.direccion || ''}>{cliente?.direccion || '—'}</div>
            </div>
            <div className="border rounded-md p-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase">Préstamo (opcional)</span>
              <select
                value={prestamoId}
                onChange={(e) => setPrestamoId(e.target.value)}
                disabled={!cliente}
                className="mt-1 w-full h-8 text-sm border rounded-md px-2 bg-white disabled:bg-slate-50 disabled:text-slate-400"
              >
                <option value="">— Nota general del cliente —</option>
                {prestamos.map((p) => (
                  <option key={p.id} value={p.id}>{p.numero} ({p.estado})</option>
                ))}
              </select>
              <div className="mt-1 text-[11px] text-slate-400">Si eliges un préstamo, la nota queda ligada a él.</div>
            </div>
          </div>

          {/* Documentación del cliente (unidades con imágenes) */}
          <div className="border rounded-md p-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="text-[10px] font-bold text-slate-400 uppercase flex items-center gap-1">
                <FileImage className="w-3.5 h-3.5" /> Documentación (matrícula, placa, cédula…)
              </span>
              <div className="flex gap-1.5">
                <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => openPanel('documentacion-cliente')}>
                  <List className="w-3.5 h-3.5 mr-1" />Listado general
                </Button>
                <Button type="button" size="sm" className="h-7 text-xs" disabled={!cliente} onClick={abrirDocNuevo}>
                  <Plus className="w-3.5 h-3.5 mr-1" />Nueva documentación
                </Button>
              </div>
            </div>
            {/* Formulario SIEMPRE desplegado en la pantalla al elegir cliente */}
            {cliente && (
              <div className="mt-2 border-2 border-cyan-700 rounded-md overflow-hidden">
                <div className="bg-cyan-700 text-white px-3 py-1.5 text-sm font-bold uppercase flex items-center justify-between">
                  <span>Documentación {docEditing ? '(Editando)' : '(Creando)'} — {(docEditing?.cliente_nombre || cliente?.nombre || '').toUpperCase()}</span>
                </div>
                <div className="p-3 space-y-3 bg-white">
                  <div className="text-xs text-slate-500">
                    Cédula: <b>{docEditing?.documento_identidad || cliente?.rnc || '—'}</b>
                    {' · '}Tel: <b>{docEditing?.telefono || cliente?.telefono || '—'}</b>
                    {' — '}Las notas van en la bitácora de abajo, no aquí.
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    <div>
                      <Label>Chasis</Label>
                      <Input value={docForm.chasis} onChange={(e) => setDocForm((p) => ({ ...p, chasis: e.target.value.toUpperCase() }))} />
                    </div>
                    <div>
                      <Label>Placa</Label>
                      <Input value={docForm.placa} onChange={(e) => setDocForm((p) => ({ ...p, placa: e.target.value.toUpperCase() }))} placeholder="Número placa" />
                    </div>
                    <div>
                      <Label>Estado de la placa</Label>
                      <select
                        value={docForm.placa_estado}
                        onChange={(e) => setDocForm((p) => ({ ...p, placa_estado: e.target.value }))}
                        className="w-full h-10 border border-slate-300 rounded px-2 text-sm bg-white"
                      >
                        <option value="">Estado</option>
                        {ESTADOS_DOC.map((op) => <option key={op} value={op}>{op}</option>)}
                      </select>
                    </div>
                    <div>
                      <Label>Matrícula</Label>
                      <select
                        value={docForm.matricula}
                        onChange={(e) => setDocForm((p) => ({ ...p, matricula: e.target.value }))}
                        className="w-full h-10 border border-slate-300 rounded px-2 text-sm bg-white"
                      >
                        <option value="">Estado</option>
                        {ESTADOS_DOC.map((op) => <option key={op} value={op}>{op}</option>)}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                    {docFields.map((field) => (
                      <div key={field.key} className="border border-slate-300 rounded bg-slate-50 overflow-hidden">
                        <div className="px-2 py-1.5 bg-slate-100 border-b flex items-center justify-between gap-2">
                          <span className="text-[11px] font-bold text-slate-700 uppercase truncate">{field.label}</span>
                          {docUrls[field.key] && (
                            <button
                              type="button"
                              onClick={() => setImagePreview({ label: field.label, url: docUrls[field.key] })}
                              className="h-6 px-2 rounded bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 text-[10px] font-bold inline-flex items-center gap-1"
                              title="Vista previa"
                            >
                              <Eye className="h-3 w-3" />Ver
                            </button>
                          )}
                        </div>
                        <label className="block cursor-pointer">
                          <input type="file" accept="image/*" className="hidden" onChange={(e) => handleDocFile(field.key, e.target.files?.[0])} />
                          <div className="h-32 flex items-center justify-center bg-white">
                            {docUrls[field.key] ? (
                              <img src={docUrls[field.key]} alt={field.label} className="max-h-full max-w-full object-contain" />
                            ) : (
                              <div className="text-center text-slate-400">
                                <Upload className="h-7 w-7 mx-auto mb-1" />
                                <span className="text-xs">Cargar imagen</span>
                              </div>
                            )}
                          </div>
                        </label>
                        <div className="px-2 py-1 text-[10px] text-slate-500 truncate">
                          {docFiles[field.key]?.name || (docUrls[field.key] ? 'Imagen cargada' : 'Pendiente')}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="flex justify-end gap-2 border-t pt-2">
                    <Button variant="outline" size="sm" onClick={abrirDocNuevo} disabled={docSaving}>Limpiar</Button>
                    <Button size="sm" onClick={guardarDoc} disabled={docSaving} className="bg-emerald-700 hover:bg-emerald-800 text-white">
                      {docSaving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
                      {docEditing ? 'Actualizar' : 'Crear'}
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {!cliente ? (
              <div className="py-3 text-center text-xs italic text-slate-400">Selecciona un cliente para ver su documentación.</div>
            ) : docs.length === 0 ? null : (
              <div className="mt-2 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
                {docs.map((r) => (
                  <div key={r.id} className="border rounded-md p-2 bg-slate-50/60">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs font-bold truncate" title={r.chasis || ''}>{r.chasis || '(sin chasis)'}</span>
                      {r.tenant_id !== tenantId && (
                        <span className="px-1 rounded bg-amber-100 text-amber-800 text-[10px] font-bold" title="Registro de la empresa aliada">ALIADA</span>
                      )}
                    </div>
                    <div className="mt-1 flex items-center gap-1.5 flex-wrap text-[11px]">
                      {r.placa && <span className="font-mono">{r.placa}</span>}
                      {r.placa_estado && <span className={`px-1 rounded border text-[10px] font-bold ${estadoBadge(r.placa_estado)}`}>PLACA: {r.placa_estado}</span>}
                      {r.matricula && <span className={`px-1 rounded border text-[10px] font-bold ${estadoBadge(r.matricula)}`}>MATRÍCULA: {r.matricula}</span>}
                    </div>
                    <div className="mt-1.5 flex items-center justify-between gap-2">
                      <span className="text-[11px] text-slate-500">{countDocs(r)}/5 imágenes · {fdate(r.created_at)}</span>
                      <div className="flex gap-1">
                        <Button type="button" size="sm" variant="outline" className="h-6 px-2 text-[11px]" onClick={() => abrirDocEditar(r)}>
                          <Eye className="w-3 h-3 mr-1" />Ver / Editar
                        </Button>
                        {esAdmin && r.tenant_id === tenantId && (
                          <button type="button" onClick={() => eliminarDoc(r)} title="Eliminar documentación"
                                  className="text-slate-300 hover:text-red-600 transition-colors px-1">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Nueva nota */}
          <div className="border rounded-md p-2">
            <span className="text-[10px] font-bold text-slate-400 uppercase">Nueva nota / comentario</span>
            <Textarea
              value={nuevaNota}
              onChange={(e) => setNuevaNota(e.target.value)}
              disabled={!cliente}
              placeholder={cliente ? 'Escribe la nota o comentario…' : 'Selecciona un cliente primero'}
              className="mt-1 min-h-[64px] text-sm"
            />
            <div className="mt-2 flex justify-end">
              <Button type="button" size="sm" onClick={agregarNota} disabled={!cliente || !nuevaNota.trim() || guardando}>
                {guardando ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Plus className="w-4 h-4 mr-1" />}Agregar Nota
              </Button>
            </div>
          </div>

          {/* Historial */}
          <div className="border rounded-md overflow-hidden">
            <div className="overflow-y-auto h-[260px]">
              <table className="w-full text-xs">
                <thead className="bg-gray-100 text-gray-700 font-bold border-b sticky top-0">
                  <tr>
                    <th className="text-left px-2 py-1 w-24">Fecha</th>
                    <th className="text-left px-2 py-1 w-14">Hora</th>
                    <th className="text-left px-2 py-1 w-32">Usuario</th>
                    <th className="text-left px-2 py-1 w-28">Préstamo</th>
                    <th className="text-left px-2 py-1">Nota / Comentario</th>
                    {esAdmin && <th className="w-9"></th>}
                  </tr>
                </thead>
                <tbody>
                  {loading && <tr><td colSpan={6} className="p-6 text-center text-slate-400"><Loader2 className="w-5 h-5 animate-spin inline" /></td></tr>}
                  {!loading && !cliente && <tr><td colSpan={6} className="p-10 text-center italic text-slate-400">--- SELECCIONE UN CLIENTE ---</td></tr>}
                  {!loading && cliente && notas.length === 0 && <tr><td colSpan={6} className="p-10 text-center italic text-slate-400">Este cliente no tiene notas registradas.</td></tr>}
                  {!loading && cliente && notas.map((n, i) => (
                    <tr key={n.id} className={`border-b last:border-0 align-top ${i % 2 === 1 ? 'bg-[#eef6ff]' : 'bg-white'}`}>
                      <td className="px-2 py-1 whitespace-nowrap">{fdate(n.fecha)}</td>
                      <td className="px-2 py-1 whitespace-nowrap">{fhora(n.created_at)}</td>
                      <td className="px-2 py-1 truncate max-w-[130px]" title={n.usuario_nombre || ''}>
                        {n.usuario_nombre || '—'}
                        {n.tenant_id !== tenantId && (
                          <span className="ml-1 inline-block px-1 rounded bg-amber-100 text-amber-800 text-[10px] font-bold align-middle" title="Nota registrada por la empresa aliada">ALIADA</span>
                        )}
                      </td>
                      <td className="px-2 py-1 font-bold text-blue-900 whitespace-nowrap">{n.prestamo?.numero || ''}</td>
                      <td className="px-2 py-1 whitespace-pre-wrap">{n.nota}</td>
                      {esAdmin && (
                        <td className="px-1 py-1 text-center">
                          {n.tenant_id === tenantId && (
                            <button type="button" onClick={() => eliminarNota(n)} title="Eliminar nota"
                                    className="text-slate-300 hover:text-red-600 transition-colors">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Acciones */}
          <div className="flex items-center justify-between flex-wrap gap-3 border-t pt-2">
            <div className="text-xs text-slate-600">{cliente ? `${notas.length} nota${notas.length === 1 ? '' : 's'} · ${docs.length} documentación` : ''}</div>
            <Button type="button" variant="secondary" onClick={() => closePanel(activePanel)}><X className="w-4 h-4 mr-1" />Retornar</Button>
          </div>
        </div>
      </div>

      <ClienteSearchModal isOpen={buscarOpen} onClose={() => setBuscarOpen(false)} onSelectCliente={seleccionarCliente} />

      {/* Vista previa de imagen (ver / descargar / imprimir) */}
      <Dialog open={!!imagePreview} onOpenChange={(open) => !open && setImagePreview(null)}>
        <DialogContent className="max-w-4xl p-0 overflow-hidden [&>button]:text-white [&>button]:opacity-100 [&>button]:hover:bg-white/10 [&>button]:focus:ring-white">
          <DialogHeader className="px-4 py-3 bg-slate-800 text-white">
            <DialogTitle className="text-white">{imagePreview?.label}</DialogTitle>
          </DialogHeader>
          <div className="bg-slate-100 p-4 flex items-center justify-center min-h-[55vh]">
            {imagePreview?.url && (
              <img src={imagePreview.url} alt={imagePreview.label} className="max-h-[65vh] max-w-full object-contain bg-white shadow" />
            )}
          </div>
          <DialogFooter className="bg-white border-t px-4 py-3">
            <Button variant="outline" onClick={() => handleDownloadImage(imagePreview)} disabled={!imagePreview?.url}>
              <Download className="h-4 w-4 mr-1" />Descargar
            </Button>
            <Button onClick={() => handlePrintImage(imagePreview)} disabled={!imagePreview?.url} className="bg-slate-800 hover:bg-slate-700 text-white">
              <Printer className="h-4 w-4 mr-1" />Imprimir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default NotasComentariosPage;
