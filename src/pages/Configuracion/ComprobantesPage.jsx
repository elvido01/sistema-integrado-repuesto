import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Plus, Pencil, Trash2 } from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

const TIPOS_NCF = [
  { value: '01', label: '01 - Facturas de Credito Fiscal' },
  { value: '02', label: '02 - Facturas de Consumo' },
  { value: '03', label: '03 - Notas de Debito' },
  { value: '04', label: '04 - Notas de Credito' },
  { value: '11', label: '11 - Registro de Proveedores Informales' },
  { value: '12', label: '12 - Registro Unico de Ingresos' },
  { value: '13', label: '13 - Gastos Menores' },
  { value: '14', label: '14 - Regimenes Especiales de Tributacion' },
  { value: '15', label: '15 - Gubernamentales' },
  { value: '16', label: '16 - Comprobantes para Exportaciones' },
  { value: '17', label: '17 - Comprobantes para pagos al Exterior' },
];

const emptyForm = {
  fecha_solicitud: new Date().toISOString().split('T')[0],
  fecha_vencimiento: new Date().toISOString().split('T')[0],
  serie: '',
  tipo_ncf: '01',
  secuencia_desde: '',
  secuencia_hasta: '',
  ultimo_emitido: '',
  nombre_emisor: '',
  alerta_cuando_queden: '10',
};

const ComprobantesPage = () => {
  const { toast } = useToast();
  const { empresa, tenantId } = useAuth();
  const [secuencias, setSecuencias] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [filtro, setFiltro] = useState('*');
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const fetchSecuencias = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('secuencias_ncf')
        .select('*')
        .order('tipo_ncf', { ascending: true })
        .order('created_at', { ascending: false });

      if (filtro !== '*') {
        query = query.eq('tipo_ncf', filtro);
      }

      const { data, error } = await query;
      if (error) throw error;
      setSecuencias(data || []);
    } catch (err) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [filtro, toast]);

  useEffect(() => { fetchSecuencias(); }, [fetchSecuencias]);

  const resetForm = () => {
    setForm({ ...emptyForm, nombre_emisor: empresa?.nombre || '' });
    setEditingId(null);
  };

  useEffect(() => {
    if (empresa?.nombre && !editingId) {
      setForm(prev => ({ ...prev, nombre_emisor: prev.nombre_emisor || empresa.nombre }));
    }
  }, [empresa, editingId]);

  const handleNuevo = () => {
    resetForm();
  };

  const handleModificar = (seq) => {
    setEditingId(seq.id);
    setForm({
      fecha_solicitud: seq.fecha_solicitud,
      fecha_vencimiento: seq.fecha_vencimiento,
      serie: seq.serie || '',
      tipo_ncf: seq.tipo_ncf,
      secuencia_desde: String(seq.secuencia_desde),
      secuencia_hasta: String(seq.secuencia_hasta),
      ultimo_emitido: String(seq.ultimo_emitido || ''),
      nombre_emisor: seq.nombre_emisor || '',
      alerta_cuando_queden: String(seq.alerta_cuando_queden || 10),
    });
  };

  const handleBorrar = async () => {
    if (!deleteConfirm) return;
    try {
      const { error } = await supabase.from('secuencias_ncf').delete().eq('id', deleteConfirm);
      if (error) throw error;
      toast({ title: 'Eliminado', description: 'Secuencia eliminada correctamente.' });
      if (editingId === deleteConfirm) resetForm();
      fetchSecuencias();
    } catch (err) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setDeleteConfirm(null);
    }
  };

  const handleGrabar = async () => {
    if (!form.serie || !form.secuencia_desde || !form.secuencia_hasta || !form.nombre_emisor) {
      toast({ title: 'Datos incompletos', description: 'Complete Serie, Secuencia Desde, Hasta y Nombre.', variant: 'destructive' });
      return;
    }
    const desde = parseInt(form.secuencia_desde);
    const hasta = parseInt(form.secuencia_hasta);
    const ultimo = parseInt(form.ultimo_emitido) || 0;

    if (hasta <= desde) {
      toast({ title: 'Error', description: 'La secuencia "Hasta" debe ser mayor que "Desde".', variant: 'destructive' });
      return;
    }
    if (ultimo > 0 && (ultimo < desde || ultimo > hasta)) {
      toast({ title: 'Error', description: `El último emitido debe estar entre ${desde} y ${hasta}.`, variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      const payload = {
        tipo_ncf: form.tipo_ncf,
        serie: form.serie.toUpperCase(),
        secuencia_desde: desde,
        secuencia_hasta: hasta,
        ultimo_emitido: ultimo,
        fecha_solicitud: form.fecha_solicitud,
        fecha_vencimiento: form.fecha_vencimiento,
        nombre_emisor: form.nombre_emisor,
        alerta_cuando_queden: parseInt(form.alerta_cuando_queden) || 10,
      };

      if (!editingId) {
        payload.tenant_id = tenantId;
      }

      if (editingId) {
        payload.updated_at = new Date().toISOString();
        const { error } = await supabase.from('secuencias_ncf').update(payload).eq('id', editingId);
        if (error) throw error;
        toast({ title: 'Actualizado', description: 'Secuencia actualizada correctamente.' });
      } else {
        const { error } = await supabase.from('secuencias_ncf').insert(payload);
        if (error) throw error;
        toast({ title: 'Creado', description: 'Nueva secuencia creada correctamente.' });
      }

      resetForm();
      fetchSecuencias();
    } catch (err) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const buildNCF = (seq) => {
    if (!seq.ultimo_emitido || seq.ultimo_emitido === 0) return '—';
    return `${seq.serie}${seq.tipo_ncf}${String(seq.ultimo_emitido).padStart(8, '0')}`;
  };

  const buildNCFInicial = (seq) => `${seq.serie}${seq.tipo_ncf}${String(seq.secuencia_desde).padStart(8, '0')}`;
  const buildNCFFinal = (seq) => `${seq.serie}${seq.tipo_ncf}${String(seq.secuencia_hasta).padStart(8, '0')}`;

  const tipoLabel = (tipo) => TIPOS_NCF.find(t => t.value === tipo)?.label || tipo;

  return (
    <div className="h-full flex flex-col bg-[#f0f0f0]">
      {/* Header */}
      <div className="bg-gradient-to-r from-[#0a1e3a] to-[#1a3a5c] px-4 py-2">
        <h1 className="text-white text-lg font-bold text-center">Secuencia de Comprobantes Fiscales</h1>
      </div>

      <div className="flex-1 flex gap-0 overflow-hidden">
        {/* LEFT: Tabla */}
        <div className="flex-1 flex flex-col p-3 min-w-0">
          {/* Filtro + Botones */}
          <div className="flex items-center gap-2 mb-2">
            <Label className="text-xs font-bold whitespace-nowrap">Filtrar</Label>
            <Select value={filtro} onValueChange={setFiltro}>
              <SelectTrigger className="h-8 flex-1 text-xs border-gray-400 bg-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="*" className="text-xs font-bold">-*- Todos -*-</SelectItem>
                {TIPOS_NCF.map(t => (
                  <SelectItem key={t.value} value={t.value} className="text-xs">{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" className="h-8 bg-green-600 hover:bg-green-700 text-white font-bold text-xs px-3" onClick={handleNuevo}>
              <Plus className="w-3 h-3 mr-1" /> Nuevo
            </Button>
            <Button size="sm" className="h-8 bg-orange-500 hover:bg-orange-600 text-white font-bold text-xs px-3"
              disabled={!editingId}
              onClick={() => { if (editingId) handleModificar(secuencias.find(s => s.id === editingId)); }}>
              <Pencil className="w-3 h-3 mr-1" /> Modificar
            </Button>
            <Button size="sm" className="h-8 bg-red-600 hover:bg-red-700 text-white font-bold text-xs px-3"
              disabled={!editingId}
              onClick={() => editingId && setDeleteConfirm(editingId)}>
              <Trash2 className="w-3 h-3 mr-1" /> Borrar
            </Button>
          </div>

          {/* Tabla */}
          <div className="flex-1 border-2 border-gray-400 overflow-auto bg-white">
            {loading ? (
              <div className="flex items-center justify-center h-32">
                <Loader2 className="w-6 h-6 animate-spin" />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="bg-gradient-to-b from-[#d4d4cc] to-[#c0c0b8] hover:bg-[#c0c0b8]">
                    <TableHead className="text-[11px] font-black text-gray-800 h-7 px-2">Fecha</TableHead>
                    <TableHead className="text-[11px] font-black text-gray-800 h-7 px-2">Vence</TableHead>
                    <TableHead className="text-[11px] font-black text-gray-800 h-7 px-2">Sec. Inicial</TableHead>
                    <TableHead className="text-[11px] font-black text-gray-800 h-7 px-2">Sec. Final</TableHead>
                    <TableHead className="text-[11px] font-black text-gray-800 h-7 px-2">Sec. Actual</TableHead>
                    <TableHead className="text-[11px] font-black text-gray-800 h-7 px-2">Nombre</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {secuencias.map((seq, i) => (
                    <TableRow
                      key={seq.id}
                      className={`h-7 cursor-pointer transition-colors ${
                        editingId === seq.id
                          ? 'bg-orange-200 hover:bg-orange-200'
                          : i % 2 === 0 ? 'bg-[#e8f5e9] hover:bg-[#c8e6c9]' : 'bg-white hover:bg-[#e8f5e9]'
                      }`}
                      onClick={() => handleModificar(seq)}
                    >
                      <TableCell className="text-[11px] font-bold px-2 py-0.5">{seq.fecha_solicitud}</TableCell>
                      <TableCell className="text-[11px] font-bold px-2 py-0.5">{seq.fecha_vencimiento}</TableCell>
                      <TableCell className="text-[11px] font-bold px-2 py-0.5 text-blue-700">{buildNCFInicial(seq)}</TableCell>
                      <TableCell className="text-[11px] font-bold px-2 py-0.5 text-red-600">{buildNCFFinal(seq)}</TableCell>
                      <TableCell className="text-[11px] font-black px-2 py-0.5 text-green-700">{buildNCF(seq)}</TableCell>
                      <TableCell className="text-[11px] font-medium px-2 py-0.5 truncate max-w-[150px]">{seq.nombre_emisor}</TableCell>
                    </TableRow>
                  ))}
                  {/* Filas vacías */}
                  {Array.from({ length: Math.max(0, 10 - secuencias.length) }).map((_, i) => (
                    <TableRow key={`e-${i}`} className={`h-7 ${i % 2 === 0 ? 'bg-[#e8f5e9]' : 'bg-white'}`}>
                      <TableCell className="px-2 py-0.5" />
                      <TableCell className="px-2 py-0.5" />
                      <TableCell className="px-2 py-0.5" />
                      <TableCell className="px-2 py-0.5" />
                      <TableCell className="px-2 py-0.5" />
                      <TableCell className="px-2 py-0.5" />
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </div>

        {/* RIGHT: Formulario */}
        <div className="w-[300px] flex-shrink-0 border-l-2 border-gray-400 bg-[#f5f5f0] flex flex-col">
          {/* Campos del formulario - scrollable */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            <div className="space-y-1">
              <Label className="text-[11px] font-bold text-gray-600">Fecha de Solicitud</Label>
              <Input type="date" className="h-7 text-xs border-gray-400 bg-white"
                value={form.fecha_solicitud}
                onChange={e => setForm(p => ({ ...p, fecha_solicitud: e.target.value }))} />
            </div>

            <div className="space-y-1">
              <Label className="text-[11px] font-bold text-gray-600">Fecha de Vencimiento</Label>
              <Input type="date" className="h-7 text-xs border-gray-400 bg-white"
                value={form.fecha_vencimiento}
                onChange={e => setForm(p => ({ ...p, fecha_vencimiento: e.target.value }))} />
            </div>

            <div className="space-y-1">
              <Label className="text-[11px] font-bold text-gray-600">Serie (X)</Label>
              <Input className="h-7 text-xs border-gray-400 bg-white uppercase font-bold w-20"
                maxLength={5}
                value={form.serie}
                onChange={e => setForm(p => ({ ...p, serie: e.target.value.toUpperCase() }))} />
            </div>

            <div className="space-y-1">
              <Label className="text-[11px] font-bold text-gray-600">Tipo</Label>
              <Select value={form.tipo_ncf} onValueChange={v => setForm(p => ({ ...p, tipo_ncf: v }))}>
                <SelectTrigger className="h-7 text-xs border-gray-400 bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIPOS_NCF.map(t => (
                    <SelectItem key={t.value} value={t.value} className="text-xs">{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-[11px] font-bold text-gray-600">Secuencia Desde</Label>
                <Input type="number" className="h-7 text-xs border-gray-400 bg-white font-bold"
                  value={form.secuencia_desde}
                  onChange={e => setForm(p => ({ ...p, secuencia_desde: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] font-bold text-gray-600">Hasta</Label>
                <Input type="number" className="h-7 text-xs border-gray-400 bg-white font-bold"
                  value={form.secuencia_hasta}
                  onChange={e => setForm(p => ({ ...p, secuencia_hasta: e.target.value }))} />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-[11px] font-bold text-gray-600">Ultimo NCF emitido</Label>
              <Input type="number" className="h-7 text-xs border-gray-400 bg-white font-bold"
                placeholder="0"
                value={form.ultimo_emitido}
                onChange={e => setForm(p => ({ ...p, ultimo_emitido: e.target.value }))} />
              <p className="text-[9px] text-gray-500 italic">Editar para saltar secuencia</p>
            </div>

            <div className="space-y-1">
              <Label className="text-[11px] font-bold text-gray-600">Nombre del Emisor</Label>
              <Input className="h-7 text-xs border-gray-400 bg-white font-bold"
                value={form.nombre_emisor}
                onChange={e => setForm(p => ({ ...p, nombre_emisor: e.target.value }))} />
            </div>

            <div className="space-y-1">
              <Label className="text-[11px] font-bold text-gray-600 leading-tight">
                Emitir aviso para nuevas solicitudes de comprobante, cuando queden
              </Label>
              <Input type="number" className="h-7 text-xs border-gray-400 bg-white font-bold w-20"
                value={form.alerta_cuando_queden}
                onChange={e => setForm(p => ({ ...p, alerta_cuando_queden: e.target.value }))} />
            </div>
          </div>

          {/* Botones - siempre visibles al fondo */}
          <div className="flex gap-3 p-3 border-t-2 border-gray-400 bg-[#f5f5f0]">
            <Button variant="outline" className="flex-1 h-9 font-bold text-sm border-2 border-gray-400 text-orange-600 hover:text-orange-700 hover:bg-orange-50" onClick={resetForm}>
              Cancelar
            </Button>
            <Button className="flex-1 h-9 font-bold text-sm bg-[#0a1e3a] hover:bg-[#0a1e3a]/90 text-white border-2 border-gray-600" onClick={handleGrabar} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
              Grabar
            </Button>
          </div>
        </div>
      </div>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Eliminacion</AlertDialogTitle>
            <AlertDialogDescription>
              Esta seguro de eliminar esta secuencia de comprobantes? Esta accion no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={handleBorrar}>
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default ComprobantesPage;
