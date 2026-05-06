import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Helmet } from 'react-helmet';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Loader2,
  RefreshCcw,
  CheckCircle2,
  AlertCircle,
  Clock,
  XCircle,
  FileSearch,
  Send,
  Ban,
} from 'lucide-react';

const TIPOS_ECF = [
  { value: 'all', label: 'Todos los tipos' },
  { value: '31', label: '31 — Crédito Fiscal (B2B)' },
  { value: '32', label: '32 — Consumo (B2C)' },
  { value: '33', label: '33 — Nota de Débito' },
  { value: '34', label: '34 — Nota de Crédito' },
  { value: '41', label: '41 — Compras' },
  { value: '43', label: '43 — Gastos Menores' },
  { value: '44', label: '44 — Régimen Especial' },
  { value: '45', label: '45 — Gubernamental' },
  { value: '46', label: '46 — Exportación' },
  { value: '47', label: '47 — Pagos al Exterior' },
];

const ESTADOS = [
  { value: 'all', label: 'Todos los estados' },
  { value: 'procesando', label: 'Procesando' },
  { value: 'emitido', label: 'Emitido' },
  { value: 'error', label: 'Error' },
  { value: 'anulado', label: 'Anulado' },
];

function StatusBadge({ doc }) {
  const estado = doc.estado_dgii || doc.estado;

  if (estado === 'aceptado') {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] bg-emerald-100 text-emerald-700 font-bold px-2 py-0.5 rounded">
        <CheckCircle2 className="w-3 h-3" /> Aceptado
      </span>
    );
  }
  if (estado === 'aceptado_condicional') {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] bg-amber-100 text-amber-700 font-bold px-2 py-0.5 rounded">
        <AlertCircle className="w-3 h-3" /> Condicional
      </span>
    );
  }
  if (estado === 'rechazado') {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] bg-red-100 text-red-700 font-bold px-2 py-0.5 rounded">
        <XCircle className="w-3 h-3" /> Rechazado
      </span>
    );
  }
  if (estado === 'enviado' || estado === 'enviado_rfce') {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] bg-blue-100 text-blue-700 font-bold px-2 py-0.5 rounded">
        <Clock className="w-3 h-3" /> {estado === 'enviado_rfce' ? 'En batch RFCE' : 'Esperando ARECF'}
      </span>
    );
  }
  if (estado === 'error') {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] bg-red-100 text-red-700 font-bold px-2 py-0.5 rounded">
        <XCircle className="w-3 h-3" /> Error
      </span>
    );
  }
  if (estado === 'anulado') {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] bg-slate-200 text-slate-700 font-bold px-2 py-0.5 rounded">
        <Ban className="w-3 h-3" /> Anulado
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[10px] bg-slate-100 text-slate-600 font-bold px-2 py-0.5 rounded">
      <Loader2 className="w-3 h-3 animate-spin" /> {estado || 'Pendiente'}
    </span>
  );
}

const DgiiMonitorPage = () => {
  const { toast } = useToast();
  const today = new Date();
  const firstDayMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const fmtDate = (d) => d.toISOString().split('T')[0];

  const [documentos, setDocumentos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    tipo_ecf: 'all',
    estado: 'all',
    desde: fmtDate(firstDayMonth),
    hasta: fmtDate(today),
  });
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [retryingId, setRetryingId] = useState(null);
  const [consultando, setConsultando] = useState(null);
  const [xmlPreview, setXmlPreview] = useState(null);

  const fetchDocumentos = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('emitir-fiscal', {
        body: {
          action: 'dgii_list_documentos',
          tipo_ecf: filters.tipo_ecf === 'all' ? null : filters.tipo_ecf,
          estado: filters.estado === 'all' ? null : filters.estado,
          desde: `${filters.desde}T00:00:00.000Z`,
          hasta: `${filters.hasta}T23:59:59.999Z`,
          limit: 500,
        },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || 'No se pudieron cargar');
      setDocumentos(data.documentos || []);
    } catch (err) {
      toast({
        title: 'Error',
        description: err.message || 'No se pudieron cargar los documentos.',
        variant: 'destructive',
      });
      setDocumentos([]);
    } finally {
      setLoading(false);
    }
  }, [filters, toast]);

  useEffect(() => {
    fetchDocumentos();
  }, [fetchDocumentos]);

  const [anulandoId, setAnulandoId] = useState(null);

  const handleAnular = async (doc) => {
    if (!doc.encf) {
      toast({ title: 'Sin e-NCF', description: 'No hay e-NCF asignado.', variant: 'destructive' });
      return;
    }
    const confirmText = `Vas a ANULAR el e-CF ${doc.encf}.\n\n` +
      `Esta acción se reporta a DGII y NO se puede deshacer.\n\n` +
      `¿Continuar?`;
    if (!confirm(confirmText)) return;

    setAnulandoId(doc.id);
    try {
      const { data, error } = await supabase.functions.invoke('emitir-fiscal', {
        body: {
          action: 'dgii_anular_ecf',
          ncf_inicial: doc.encf,
          ncf_final: doc.encf,
        },
      });
      if (error) {
        let msg = error.message;
        try {
          if (error.context?.json) {
            const parsed = await error.context.json();
            if (parsed?.error) msg = parsed.error;
          }
        } catch (_) {}
        throw new Error(msg);
      }
      if (!data?.ok) throw new Error(data?.error || 'No se pudo anular');
      toast({
        title: '✅ e-CF anulado',
        description: `${doc.encf} anulado en DGII (${data.ambiente}).`,
      });
      await fetchDocumentos();
    } catch (err) {
      toast({ title: 'Error anulando', description: err.message, variant: 'destructive' });
    } finally {
      setAnulandoId(null);
    }
  };

  const handleConsultarEstado = async (doc) => {
    if (!doc.track_id) {
      toast({ title: 'Sin TrackId', description: 'Este documento no tiene TrackId aún.', variant: 'destructive' });
      return;
    }
    setConsultando(doc.id);
    try {
      const { data, error } = await supabase.functions.invoke('emitir-fiscal', {
        body: {
          action: 'dgii_consultar_estado',
          track_id: doc.track_id,
          documento_id: doc.id,
        },
      });
      if (error) throw error;
      toast({
        title: 'Estado actualizado',
        description: `${doc.encf} → ${data?.estado || 'sin cambios'}`,
      });
      await fetchDocumentos();
    } catch (err) {
      toast({ title: 'Error', description: err.message || 'No se pudo consultar', variant: 'destructive' });
    } finally {
      setConsultando(null);
    }
  };

  const handleRetry = async (doc) => {
    if (!doc.factura_id) {
      toast({ title: 'Sin factura', description: 'Este documento no tiene factura asociada.', variant: 'destructive' });
      return;
    }
    setRetryingId(doc.id);
    try {
      const { data, error } = await supabase.functions.invoke('emitir-fiscal', {
        body: {
          action: 'dgii_send_to_dgii',
          factura_id: doc.factura_id,
        },
      });
      if (error) {
        let msg = error.message;
        try {
          if (error.context?.json) {
            const parsed = await error.context.json();
            if (parsed?.error) msg = parsed.error;
          }
        } catch (_) {}
        throw new Error(msg);
      }
      if (!data?.ok) throw new Error(data?.error || 'No se pudo reintentar');
      toast({
        title: '✅ Reenviado',
        description: `e-NCF: ${data.encf} · TrackId: ${data.trackId}`,
      });
      await fetchDocumentos();
    } catch (err) {
      toast({ title: 'Error en reenvío', description: err.message, variant: 'destructive' });
    } finally {
      setRetryingId(null);
    }
  };

  const handleVerXml = async (doc) => {
    if (!doc.xml_firmado_path) {
      toast({ title: 'Sin XML', description: 'Este documento aún no tiene XML firmado.', variant: 'destructive' });
      return;
    }
    try {
      const { data, error } = await supabase.storage
        .from('ecf-xmls')
        .download(doc.xml_firmado_path);
      if (error) throw error;
      const xml = await data.text();
      setXmlPreview({ encf: doc.encf, xml });
    } catch (err) {
      toast({ title: 'Error', description: err.message || 'No se pudo descargar el XML', variant: 'destructive' });
    }
  };

  // Resumen de stats
  const stats = useMemo(() => {
    return documentos.reduce((acc, d) => {
      const e = d.estado_dgii || d.estado;
      acc.total++;
      if (e === 'aceptado') acc.aceptados++;
      else if (e === 'rechazado' || d.estado === 'error') acc.errores++;
      else if (e === 'enviado' || e === 'enviado_rfce') acc.enviados++;
      else if (d.estado === 'anulado') acc.anulados++;
      else acc.pendientes++;
      return acc;
    }, { total: 0, aceptados: 0, errores: 0, enviados: 0, anulados: 0, pendientes: 0 });
  }, [documentos]);

  return (
    <div className="p-4 md:p-6 max-w-[1400px] mx-auto">
      <Helmet>
        <title>Monitor e-CF DGII</title>
      </Helmet>

      <div className="mb-4">
        <h1 className="text-2xl font-bold text-morla-blue">Monitor e-CF DGII</h1>
        <p className="text-sm text-slate-500">
          Documentos fiscales electrónicos emitidos vía DGII directo. Estados, consulta de TrackId y reenvío de errores.
        </p>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
        <div className="bg-slate-100 rounded-lg p-3">
          <div className="text-[10px] uppercase font-bold text-slate-500">Total</div>
          <div className="text-2xl font-black text-slate-800">{stats.total}</div>
        </div>
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
          <div className="text-[10px] uppercase font-bold text-emerald-700">Aceptados</div>
          <div className="text-2xl font-black text-emerald-700">{stats.aceptados}</div>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
          <div className="text-[10px] uppercase font-bold text-blue-700">Esperando ARECF</div>
          <div className="text-2xl font-black text-blue-700">{stats.enviados}</div>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
          <div className="text-[10px] uppercase font-bold text-red-700">Errores</div>
          <div className="text-2xl font-black text-red-700">{stats.errores}</div>
        </div>
        <div className="bg-slate-200 rounded-lg p-3">
          <div className="text-[10px] uppercase font-bold text-slate-700">Anulados</div>
          <div className="text-2xl font-black text-slate-700">{stats.anulados}</div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white border rounded-lg p-3 mb-4 grid grid-cols-1 md:grid-cols-5 gap-3">
        <div>
          <Label className="text-[10px] font-bold uppercase">Tipo</Label>
          <Select value={filters.tipo_ecf} onValueChange={(v) => setFilters((f) => ({ ...f, tipo_ecf: v }))}>
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TIPOS_ECF.map((t) => (
                <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-[10px] font-bold uppercase">Estado</Label>
          <Select value={filters.estado} onValueChange={(v) => setFilters((f) => ({ ...f, estado: v }))}>
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ESTADOS.map((e) => (
                <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-[10px] font-bold uppercase">Desde</Label>
          <Input type="date" value={filters.desde} onChange={(e) => setFilters((f) => ({ ...f, desde: e.target.value }))} />
        </div>
        <div>
          <Label className="text-[10px] font-bold uppercase">Hasta</Label>
          <Input type="date" value={filters.hasta} onChange={(e) => setFilters((f) => ({ ...f, hasta: e.target.value }))} />
        </div>
        <div className="flex items-end">
          <Button onClick={fetchDocumentos} disabled={loading} className="w-full">
            {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCcw className="w-4 h-4 mr-2" />}
            Actualizar
          </Button>
        </div>
      </div>

      {/* Tabla */}
      <div className="bg-white border rounded-lg overflow-hidden">
        <Table>
          <TableHeader className="bg-slate-50">
            <TableRow>
              <TableHead className="text-[11px]">Fecha</TableHead>
              <TableHead className="text-[11px]">Tipo</TableHead>
              <TableHead className="text-[11px]">e-NCF</TableHead>
              <TableHead className="text-[11px]">TrackId</TableHead>
              <TableHead className="text-[11px]">Ambiente</TableHead>
              <TableHead className="text-[11px]">Estado</TableHead>
              <TableHead className="text-[11px] text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-10">
                  <Loader2 className="w-6 h-6 animate-spin inline-block mr-2" /> Cargando...
                </TableCell>
              </TableRow>
            ) : documentos.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-10 text-slate-400 italic">
                  Sin documentos en el rango seleccionado.
                </TableCell>
              </TableRow>
            ) : (
              documentos.map((d) => (
                <TableRow key={d.id} className={`hover:bg-slate-50 ${selectedDoc?.id === d.id ? 'bg-blue-50' : ''}`}>
                  <TableCell className="text-[11px] font-mono">
                    {d.created_at ? new Date(d.created_at).toLocaleDateString('es-DO') : '—'}
                  </TableCell>
                  <TableCell className="text-[11px]">
                    <span className="inline-block bg-slate-100 px-2 py-0.5 rounded font-bold">
                      {d.tipo_ecf || '—'}
                    </span>
                  </TableCell>
                  <TableCell className="text-[11px] font-mono font-bold">{d.encf || '—'}</TableCell>
                  <TableCell className="text-[10px] font-mono text-slate-500 truncate max-w-[120px]" title={d.track_id}>
                    {d.track_id ? d.track_id.slice(0, 12) + '...' : '—'}
                  </TableCell>
                  <TableCell className="text-[11px]">
                    <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                      d.ambiente === 'Produccion' ? 'bg-red-100 text-red-700' :
                      d.ambiente === 'CerteCF' ? 'bg-amber-100 text-amber-700' :
                      'bg-blue-100 text-blue-700'
                    }`}>
                      {d.ambiente || 'TesteCF'}
                    </span>
                  </TableCell>
                  <TableCell><StatusBadge doc={d} /></TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      {d.xml_firmado_path && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleVerXml(d)}
                          className="h-7 px-2"
                          title="Ver XML firmado"
                        >
                          <FileSearch className="w-3.5 h-3.5" />
                        </Button>
                      )}
                      {d.track_id && (d.estado_dgii === 'enviado' || d.estado_dgii === 'enviado_rfce') && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleConsultarEstado(d)}
                          disabled={consultando === d.id}
                          className="h-7 px-2"
                          title="Consultar estado en DGII"
                        >
                          {consultando === d.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCcw className="w-3.5 h-3.5" />}
                        </Button>
                      )}
                      {(d.estado === 'error' || d.estado_dgii === 'rechazado') && d.factura_id && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleRetry(d)}
                          disabled={retryingId === d.id}
                          className="h-7 px-2 border-amber-300 text-amber-700"
                          title="Reenviar a DGII"
                        >
                          {retryingId === d.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                        </Button>
                      )}
                      {d.encf && d.estado !== 'anulado' && d.estado_dgii !== 'anulado' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleAnular(d)}
                          disabled={anulandoId === d.id}
                          className="h-7 px-2 border-red-300 text-red-700 hover:bg-red-50"
                          title="Anular e-CF en DGII (irreversible)"
                        >
                          {anulandoId === d.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Ban className="w-3.5 h-3.5" />}
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Detalle expandible — error message */}
      {documentos.some((d) => d.error_message) && (
        <div className="mt-3 bg-red-50 border border-red-200 rounded-lg p-3">
          <div className="text-[11px] font-bold text-red-700 uppercase mb-2">Errores recientes</div>
          {documentos.filter((d) => d.error_message).slice(0, 5).map((d) => (
            <div key={d.id} className="text-[11px] text-red-700 mb-1">
              <span className="font-mono font-bold">{d.encf || d.id.slice(0, 8)}:</span>{' '}
              <span>{d.error_message}</span>
            </div>
          ))}
        </div>
      )}

      {/* Modal XML preview */}
      {xmlPreview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setXmlPreview(null)}
        >
          <div
            className="bg-white rounded-lg shadow-2xl max-w-4xl w-full max-h-[85vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b bg-blue-50">
              <h3 className="text-sm font-bold text-blue-900">XML Firmado — {xmlPreview.encf}</h3>
              <Button variant="ghost" size="sm" onClick={() => setXmlPreview(null)}>
                ✕
              </Button>
            </div>
            <div className="p-4 overflow-auto flex-1 bg-slate-900">
              <pre className="text-[11px] text-emerald-300 font-mono whitespace-pre-wrap break-all">{xmlPreview.xml}</pre>
            </div>
            <div className="px-4 py-2 border-t bg-slate-50 flex justify-end">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  navigator.clipboard?.writeText(xmlPreview.xml);
                  toast({ title: 'Copiado al portapapeles' });
                }}
              >
                Copiar
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DgiiMonitorPage;
