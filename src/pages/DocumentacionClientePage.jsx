import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Download, Eye, FileImage, Loader2, Plus, Printer, RefreshCw, Save, Search, Trash2, Upload, X } from 'lucide-react';

const BUCKET = 'documentacion-clientes';
const CAMINERO_TENANT_ID = 'b39506c3-27dc-467d-830b-096731b83113';

const emptyForm = {
  cliente_id: '',
  cliente_nombre: '',
  documento_identidad: '',
  telefono: '',
  chasis: '',
  placa: '',
  placa_estado: '',
  matricula: '',
  notas: '',
};

const docFields = [
  { key: 'cedula_pasaporte_path', label: 'Cédula / Pasaporte' },
  { key: 'matricula_moto_path', label: 'Matrícula Moto' },
  { key: 'placa_path', label: 'Placa' },
  { key: 'autorizacion_path', label: 'Autorización' },
  { key: 'carta_saldo_path', label: 'Carta de Saldo' },
];

const normalize = (value) => String(value || '').toLowerCase().trim();

const placaEstadoStyles = {
  'EN TRAMITE': {
    label: 'EN TRÁMITE',
    marker: 'border-red-600 bg-red-600',
    badge: 'bg-red-50 text-red-700 border-red-200',
  },
  'EN CAMINERO MOTORS': {
    label: 'EN CAMINERO MOTORS',
    marker: 'border-yellow-400 bg-yellow-400',
    badge: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  },
  ENTREGADA: {
    label: 'ENTREGADA',
    marker: 'border-green-600 bg-green-600',
    badge: 'bg-green-50 text-green-700 border-green-200',
  },
};

const getPlacaEstadoStyle = (estado) => placaEstadoStyles[estado] || {
  label: estado || '',
  marker: 'border-slate-300 bg-slate-300',
  badge: 'bg-slate-50 text-slate-600 border-slate-200',
};

export default function DocumentacionClientePage() {
  const { tenantId, user, empresa } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [records, setRecords] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [files, setFiles] = useState({});
  const [previewUrls, setPreviewUrls] = useState({});
  const [imagePreview, setImagePreview] = useState(null);

  const cargar = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const [{ data: docs, error: docsError }, { data: clientesData }] = await Promise.all([
        supabase
          .from('documentacion_clientes')
          // Sin filtro de tenant: la política RLS trae los registros propios
          // + los de la empresa aliada (Caminero <-> Naranjos comparten)
          .select('*, clientes(nombre, rnc, telefono)')
          .order('created_at', { ascending: false })
          .limit(500),
        supabase
          .from('clientes')
          .select('id, nombre, rnc, telefono')
          .eq('tenant_id', tenantId)
          .order('nombre')
          .limit(1000),
      ]);
      if (docsError) throw docsError;
      setRecords(docs || []);
      setClientes(clientesData || []);
    } catch (err) {
      toast({ variant: 'destructive', title: 'Error cargando documentación', description: err.message });
    } finally {
      setLoading(false);
    }
  }, [tenantId, toast]);

  useEffect(() => { cargar(); }, [cargar]);

  const filtered = useMemo(() => {
    const q = normalize(search);
    if (!q) return records;
    return records.filter((r) =>
      normalize(r.cliente_nombre || r.clientes?.nombre).includes(q) ||
      normalize(r.documento_identidad || r.clientes?.rnc).includes(q) ||
      normalize(r.chasis).includes(q) ||
      normalize(r.placa).includes(q) ||
      normalize(r.matricula).includes(q)
    );
  }, [records, search]);

  const openNew = () => {
    setEditing(null);
    setForm(emptyForm);
    setFiles({});
    setPreviewUrls({});
    setModalOpen(true);
  };

  const openEdit = async (record) => {
    setEditing(record);
    setForm({
      cliente_id: record.cliente_id || '',
      cliente_nombre: record.cliente_nombre || record.clientes?.nombre || '',
      documento_identidad: record.documento_identidad || record.clientes?.rnc || '',
      telefono: record.telefono || record.clientes?.telefono || '',
      chasis: record.chasis || '',
      placa: record.placa || '',
      placa_estado: record.placa_estado || '',
      matricula: record.matricula || '',
      notas: record.notas || '',
    });
    setFiles({});
    setPreviewUrls(await getSignedUrls(record));
    setModalOpen(true);
  };

  const updateField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleClienteSelect = (clienteId) => {
    const cliente = clientes.find((c) => c.id === clienteId);
    updateField('cliente_id', clienteId);
    if (cliente) {
      setForm((prev) => ({
        ...prev,
        cliente_id: cliente.id,
        cliente_nombre: cliente.nombre || '',
        documento_identidad: cliente.rnc || '',
        telefono: cliente.telefono || '',
      }));
    }
  };

  const handleFileChange = (key, file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast({ variant: 'destructive', title: 'Archivo inválido', description: 'Solo se permiten imágenes.' });
      return;
    }
    setFiles((prev) => ({ ...prev, [key]: file }));
    setPreviewUrls((prev) => ({ ...prev, [key]: URL.createObjectURL(file) }));
  };

  const uploadFiles = async (recordId, currentRecord = {}) => {
    const uploaded = {};
    for (const field of docFields) {
      const file = files[field.key];
      if (!file) continue;
      const ext = file.name.split('.').pop() || 'jpg';
      const path = `${tenantId}/${recordId}/${field.key.replace('_path', '')}-${Date.now()}.${ext}`;
      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { upsert: true, contentType: file.type });
      if (error) {
        throw new Error(`No se pudo subir ${field.label}: ${error.message}`);
      }
      if (currentRecord[field.key]) {
        await supabase.storage.from(BUCKET).remove([currentRecord[field.key]]).catch(() => {});
      }
      uploaded[field.key] = path;
    }
    return uploaded;
  };

  const handleSave = async () => {
    if (!tenantId) return;
    if (!form.cliente_nombre.trim()) {
      toast({ variant: 'destructive', title: 'Falta cliente', description: 'Indica el nombre del cliente.' });
      return;
    }
    setSaving(true);
    try {
      const recordId = editing?.id || crypto.randomUUID();
      const uploaded = await uploadFiles(recordId, editing || {});
      const payload = {
        id: recordId,
        // Editar un registro de la empresa aliada NO se lo apropia
        tenant_id: editing?.tenant_id || tenantId,
        cliente_id: form.cliente_id || null,
        cliente_nombre: form.cliente_nombre.trim().toUpperCase(),
        documento_identidad: form.documento_identidad.trim(),
        telefono: form.telefono.trim(),
        chasis: form.chasis.trim().toUpperCase(),
        placa: form.placa.trim().toUpperCase(),
        placa_estado: form.placa_estado || null,
        matricula: form.matricula || null,
        notas: form.notas.trim() || null,
        updated_at: new Date().toISOString(),
        created_by: editing?.created_by || user?.id || null,
        ...uploaded,
      };

      const { error } = await supabase
        .from('documentacion_clientes')
        .upsert(payload, { onConflict: 'id' });
      if (error) throw error;

      toast({ title: 'Documentación guardada', description: form.cliente_nombre });
      setModalOpen(false);
      cargar();
    } catch (err) {
      toast({ variant: 'destructive', title: 'Error guardando', description: err.message });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (record) => {
    if (!window.confirm(`¿Borrar documentación de ${record.cliente_nombre}?`)) return;
    try {
      const paths = docFields.map((f) => record[f.key]).filter(Boolean);
      if (paths.length) await supabase.storage.from(BUCKET).remove(paths);
      const { error } = await supabase.from('documentacion_clientes').delete().eq('id', record.id);
      if (error) throw error;
      toast({ title: 'Registro eliminado' });
      cargar();
    } catch (err) {
      toast({ variant: 'destructive', title: 'Error eliminando', description: err.message });
    }
  };

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

  const handlePrintImage = (preview) => {
    if (!preview?.url) return;
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(`
      <html>
        <head>
          <title>${preview.label}</title>
          <style>
            body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center; background: #fff; }
            img { max-width: 100%; max-height: 100vh; object-fit: contain; }
          </style>
        </head>
        <body>
          <img src="${preview.url}" alt="${preview.label}" onload="window.print()" />
        </body>
      </html>
    `);
    win.document.close();
  };

  const handleDownloadImage = async (preview) => {
    if (!preview?.url) return;
    const response = await fetch(preview.url);
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = `${preview.label.replace(/\s+/g, '_')}.jpg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(objectUrl);
  };

  const countDocs = (record) => docFields.filter((f) => record[f.key]).length;

  if (tenantId && tenantId !== CAMINERO_TENANT_ID) {
    return (
      <div className="h-full flex items-center justify-center bg-slate-100 p-6">
        <div className="bg-white border border-slate-200 rounded p-6 text-center max-w-md shadow-sm">
          <FileImage className="h-10 w-10 text-slate-400 mx-auto mb-3" />
          <h2 className="text-lg font-bold text-slate-800 mb-1">Módulo exclusivo</h2>
          <p className="text-sm text-slate-500">
            Documentación Cliente está habilitado solo para Caminero Motors.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-slate-100 p-3">
      <Helmet><title>Documentación Cliente - {empresa?.nombre || 'Sistema'}</title></Helmet>

      <div className="flex items-center justify-between bg-slate-200 border border-slate-300 rounded-sm px-3 py-2 mb-3">
        <div className="flex items-center gap-2">
          <FileImage className="h-5 w-5 text-blue-700" />
          <div>
            <h1 className="text-xl font-semibold text-slate-800">Documentación Cliente</h1>
            <p className="text-xs text-slate-500">Cédula, pasaporte, matrícula, placa, autorizaciones y cartas de saldo.</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={cargar} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} /> Refrescar
          </Button>
          <Button onClick={openNew} className="bg-slate-700 hover:bg-slate-800 text-white">
            <Plus className="h-4 w-4 mr-1" /> Agregar Documentación
          </Button>
        </div>
      </div>

      <div className="bg-white border border-slate-300 rounded-sm p-3 mb-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex items-center gap-2 max-w-xl flex-1">
            <Search className="h-4 w-4 text-slate-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por cliente, cédula/pasaporte, chasis, placa o matrícula..."
              className="h-9 bg-yellow-50"
            />
            {search && (
              <Button variant="ghost" size="sm" onClick={() => setSearch('')} className="h-9 w-9 p-0">
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3 text-[11px] font-bold text-slate-600">
            <span className="uppercase text-slate-400">Placa:</span>
            <PlacaEstadoLegend estado="EN TRAMITE" />
            <PlacaEstadoLegend estado="EN CAMINERO MOTORS" />
            <PlacaEstadoLegend estado="ENTREGADA" />
          </div>
        </div>
      </div>

      <div className="bg-white border border-slate-300 rounded-sm overflow-hidden flex-1">
        <Table>
          <TableHeader className="bg-slate-100">
            <TableRow>
              <TableHead>Cliente</TableHead>
              <TableHead className="w-40">Documento</TableHead>
              <TableHead className="w-40">Chasis</TableHead>
              <TableHead className="w-28">Placa</TableHead>
              <TableHead className="w-28">Matrícula</TableHead>
              <TableHead className="w-32 text-center">Imágenes</TableHead>
              <TableHead className="w-36 text-center">Fecha</TableHead>
              <TableHead className="w-44 text-center">Opciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-10 text-slate-500">
                  <Loader2 className="h-5 w-5 animate-spin inline mr-2" /> Cargando...
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-10 text-slate-400 italic">
                  No hay documentación registrada.
                </TableCell>
              </TableRow>
            ) : filtered.map((record) => (
              <TableRow key={record.id} className="hover:bg-slate-50">
                <TableCell className="font-semibold uppercase">
                  {record.cliente_nombre || record.clientes?.nombre}
                  {record.tenant_id !== tenantId && (
                    <span className="ml-1.5 inline-block px-1 rounded bg-amber-100 text-amber-800 text-[10px] font-bold align-middle" title="Registro de la empresa aliada">ALIADA</span>
                  )}
                </TableCell>
                <TableCell>{record.documento_identidad || record.clientes?.rnc || '-'}</TableCell>
                <TableCell className="font-mono text-xs">{record.chasis || '-'}</TableCell>
                <TableCell>
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <span>{record.placa || '-'}</span>
                      {record.placa_estado && <PlacaEstadoMarker estado={record.placa_estado} />}
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  {record.matricula ? getPlacaEstadoStyle(record.matricula).label : '-'}
                </TableCell>
                <TableCell className="text-center">
                  <Badge variant="secondary" className="bg-blue-50 text-blue-700 border-blue-200">
                    {countDocs(record)}/5
                  </Badge>
                </TableCell>
                <TableCell className="text-center text-xs text-slate-500">
                  {new Date(record.created_at).toLocaleDateString('es-DO')}
                </TableCell>
                <TableCell>
                  <div className="flex justify-center gap-1">
                    <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => openEdit(record)}>
                      Ver / Editar
                    </Button>
                    {record.tenant_id === tenantId && (
                      <Button size="sm" variant="outline" className="h-7 px-2 text-xs text-red-600 border-red-200 hover:bg-red-50" onClick={() => handleDelete(record)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-5xl p-0 gap-0 overflow-hidden">
          <DialogHeader className="bg-cyan-700 text-white px-5 py-3">
            <DialogTitle className="text-white uppercase">
              Datos de Documentación {editing ? '(Editando)' : '(Creando)'}
            </DialogTitle>
          </DialogHeader>

          <div className="p-4 space-y-4 max-h-[75vh] overflow-y-auto bg-white">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div className="md:col-span-2">
                <Label>Cliente registrado</Label>
                <select
                  value={form.cliente_id}
                  onChange={(e) => handleClienteSelect(e.target.value)}
                  className="w-full h-9 border border-slate-300 rounded px-2 text-sm bg-white"
                >
                  <option value="">Cliente no asignado</option>
                  {clientes.map((c) => (
                    <option key={c.id} value={c.id}>{c.nombre} {c.rnc ? `- ${c.rnc}` : ''}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label>Cédula o Pasaporte</Label>
                <Input value={form.documento_identidad} onChange={(e) => updateField('documento_identidad', e.target.value)} />
              </div>
              <div>
                <Label>Teléfono</Label>
                <Input value={form.telefono} onChange={(e) => updateField('telefono', e.target.value)} />
              </div>
              <div className="md:col-span-2">
                <Label>Nombre del cliente</Label>
                <Input value={form.cliente_nombre} onChange={(e) => updateField('cliente_nombre', e.target.value.toUpperCase())} className="font-semibold" />
              </div>
              <div>
                <Label>Chasis</Label>
                <Input value={form.chasis} onChange={(e) => updateField('chasis', e.target.value.toUpperCase())} />
              </div>
              <div>
                <Label>Placa</Label>
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    value={form.placa}
                    onChange={(e) => updateField('placa', e.target.value.toUpperCase())}
                    placeholder="Número placa"
                  />
                  <select
                    value={form.placa_estado}
                    onChange={(e) => updateField('placa_estado', e.target.value)}
                    className="w-full h-10 border border-slate-300 rounded px-2 text-sm bg-white"
                  >
                    <option value="">Estado</option>
                    <option value="EN TRAMITE">EN TRÁMITE</option>
                    <option value="ENTREGADA">ENTREGADA</option>
                    <option value="EN CAMINERO MOTORS">EN CAMINERO MOTORS</option>
                  </select>
                </div>
              </div>
              <div>
                <Label>Matrícula</Label>
                <select
                  value={form.matricula}
                  onChange={(e) => updateField('matricula', e.target.value)}
                  className="w-full h-10 border border-slate-300 rounded px-2 text-sm bg-white"
                >
                  <option value="">Estado</option>
                  <option value="EN TRAMITE">EN TRÁMITE</option>
                  <option value="ENTREGADA">ENTREGADA</option>
                  <option value="EN CAMINERO MOTORS">EN CAMINERO MOTORS</option>
                </select>
              </div>
              <div className="md:col-span-3">
                <Label>Notas</Label>
                <Textarea value={form.notas} onChange={(e) => updateField('notas', e.target.value)} rows={2} />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
              {docFields.map((field) => (
                <DocumentSlot
                  key={field.key}
                  label={field.label}
                  url={previewUrls[field.key]}
                  fileName={files[field.key]?.name}
                  onFile={(file) => handleFileChange(field.key, file)}
                  onPreview={() => setImagePreview({ label: field.label, url: previewUrls[field.key] })}
                />
              ))}
            </div>
          </div>

          <DialogFooter className="bg-slate-100 border-t px-4 py-3">
            <Button variant="outline" onClick={() => setModalOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving} className="bg-emerald-700 hover:bg-emerald-800 text-white">
              {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
              {editing ? 'Actualizar' : 'Crear'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
              <Download className="h-4 w-4 mr-1" />
              Descargar
            </Button>
            <Button onClick={() => handlePrintImage(imagePreview)} disabled={!imagePreview?.url} className="bg-slate-800 hover:bg-slate-700 text-white">
              <Printer className="h-4 w-4 mr-1" />
              Imprimir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DocumentSlot({ label, url, fileName, onFile, onPreview }) {
  return (
    <div className="border border-slate-300 rounded bg-slate-50 overflow-hidden">
      <div className="px-2 py-1.5 bg-slate-100 border-b flex items-center justify-between gap-2">
        <span className="text-[11px] font-bold text-slate-700 uppercase truncate">{label}</span>
        {url && (
          <button
            type="button"
            onClick={onPreview}
            className="h-6 px-2 rounded bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 text-[10px] font-bold inline-flex items-center gap-1"
            title="Vista previa"
          >
            <Eye className="h-3 w-3" />
            Ver
          </button>
        )}
      </div>
      <label className="block cursor-pointer">
        <input type="file" accept="image/*" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
        <div className="h-32 flex items-center justify-center bg-white">
          {url ? (
            <img src={url} alt={label} className="max-h-full max-w-full object-contain" />
          ) : (
            <div className="text-center text-slate-400">
              <Upload className="h-7 w-7 mx-auto mb-1" />
              <span className="text-xs">Cargar imagen</span>
            </div>
          )}
        </div>
      </label>
      <div className="px-2 py-1 text-[10px] text-slate-500 truncate">
        {fileName || (url ? 'Imagen cargada' : 'Pendiente')}
      </div>
    </div>
  );
}

function PlacaEstadoMarker({ estado }) {
  const style = getPlacaEstadoStyle(estado);
  return <span className={`inline-block w-3 h-3 rounded-[2px] border-2 ${style.marker}`} title={style.label} />;
}

function PlacaEstadoLegend({ estado }) {
  const style = getPlacaEstadoStyle(estado);
  return (
    <span className="inline-flex items-center gap-1.5">
      <PlacaEstadoMarker estado={estado} />
      <span>{style.label}</span>
    </span>
  );
}
