import React, { useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { CheckCircle2, Clock, FileCheck2, Loader2, Play, RotateCcw, Upload, XCircle } from 'lucide-react';

async function parseXlsx(file) {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array', cellDates: true });
  const rows = [];
  for (const name of wb.SheetNames) {
    const sheetRows = XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: '' });
    rows.push(...sheetRows.map((row) => ({ row, sheet: name })));
  }
  return rows;
}

const ESTADOS = {
  pending: { label: 'Pendiente', icon: Clock, color: 'text-gray-500' },
  sending: { label: 'Enviando...', icon: Loader2, color: 'text-blue-600 animate-spin' },
  aceptado: { label: 'Aceptada', icon: CheckCircle2, color: 'text-emerald-600' },
  rechazado: { label: 'Rechazada', icon: XCircle, color: 'text-red-600' },
  error: { label: 'Error', icon: XCircle, color: 'text-red-600' },
};

const pick = (row, ...keys) => {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null && String(row[key]).trim() !== '') return row[key];
  }
  return '';
};

const formatDate = (value) => {
  if (value instanceof Date) return value.toLocaleDateString('es-DO');
  return String(value || '');
};

const responseText = (value) => {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(responseText).join(' ');
  if (typeof value === 'object') {
    return [value.response, value.estado, value.Estado, value.mensaje, value.Mensaje, value.raw]
      .map(responseText)
      .filter(Boolean)
      .join(' ');
  }
  return String(value);
};

const normalizeResult = (data) => {
  const text = responseText(data?.response_payload || data).toLowerCase();
  if (text.includes('rechaz')) return 'rechazado';
  if (text.includes('acept') || data?.ok) return 'aceptado';
  return 'aceptado';
};

const DgiiAprobacionComercialRunner = () => {
  const { toast } = useToast();
  const fileInputRef = useRef(null);
  const [casos, setCasos] = useState([]);
  const [running, setRunning] = useState(false);
  const [modal, setModal] = useState(null);

  const resumen = useMemo(() => ({
    aceptados: casos.filter(c => c.estado === 'aceptado').length,
    errores: casos.filter(c => c.estado === 'error' || c.estado === 'rechazado').length,
    pendientes: casos.filter(c => c.estado === 'pending').length,
  }), [casos]);

  const handleFile = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.name.toLowerCase().endsWith('.xlsx')) {
      toast({ title: 'Formato invalido', description: 'Sube el .xlsx de Aprobaciones Comerciales descargado en DGII.', variant: 'destructive' });
      e.target.value = '';
      return;
    }
    try {
      const rows = await parseXlsx(f);
      const parsed = rows
        .filter(({ row }) => pick(row, 'eNCF', 'ENCF', 'NCFElectronico', 'NCF Electronico'))
        .map(({ row, sheet }, idx) => ({
          row,
          sheet,
          idx,
          encf: String(pick(row, 'eNCF', 'ENCF', 'NCFElectronico', 'NCF Electronico')).trim(),
          rncEmisor: String(pick(row, 'RNCEmisor', 'RNC Emisor', 'RNC del Emisor', 'RncEmisor')).replace(/\D/g, ''),
          fechaEmision: pick(row, 'FechaEmision', 'Fecha Emision'),
          montoTotal: pick(row, 'MontoTotal', 'Monto Total'),
          estadoAprobacion: String(pick(row, 'Estado', 'EstadoAprobacion', 'Estado Aprobacion') || '1'),
          estado: 'pending',
        }));
      if (!parsed.length) {
        throw new Error('No encontre filas con eNCF. Confirma que es el archivo de Aprobaciones Comerciales del paso 3.');
      }
      setCasos(parsed);
      toast({ title: 'Aprobaciones cargadas', description: `${parsed.length} fila(s) listas para enviar.` });
    } catch (err) {
      toast({ title: 'Error leyendo archivo', description: err.message, variant: 'destructive' });
    } finally {
      e.target.value = '';
    }
  };

  const enviarUno = async (caso) => {
    const { data, error } = await supabase.functions.invoke('emitir-fiscal', {
      body: { action: 'dgii_certif_send_acecf_row', row: caso.row },
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
    if (!data?.ok) throw new Error(data?.error || 'DGII no acepto la aprobacion comercial');
    return data;
  };

  const correrTodos = async () => {
    if (!casos.length || running) return;
    if (!confirm(`Enviar ${casos.length} aprobacion(es) comercial(es) a DGII CerteCF?\n\nSe firmaran con tu .p12 y se enviaran al servicio de Aprobacion Comercial.`)) return;
    setRunning(true);
    for (let i = 0; i < casos.length; i++) {
      const caso = casos[i];
      if (caso.estado === 'aceptado') continue;
      setCasos(prev => prev.map((c, idx) => idx === i ? { ...c, estado: 'sending', error: null, response: null } : c));
      try {
        const data = await enviarUno(caso);
        setCasos(prev => prev.map((c, idx) => idx === i ? {
          ...c,
          estado: normalizeResult(data),
          response: data.response_payload || data,
          error: null,
          xmlLength: data.xml_firmado_length,
        } : c));
      } catch (err) {
        setCasos(prev => prev.map((c, idx) => idx === i ? { ...c, estado: 'error', error: err.message } : c));
      }
    }
    setRunning(false);
    toast({ title: 'Paso 3 completado', description: 'Revisa el resumen y refresca el portal DGII.' });
  };

  const reiniciar = () => {
    if (running) return;
    setCasos(prev => prev.map(c => ({ ...c, estado: 'pending', error: null, response: null, xmlLength: null })));
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-[12px] text-emerald-900">
        <p className="font-bold mb-1 flex items-center gap-2">
          <FileCheck2 className="w-4 h-4" /> Aprobaciones Comerciales DGII (Paso 3)
        </p>
        <p>
          Carga el .xlsx de Aprobaciones Comerciales del portal. El sistema genera el ACECF, lo firma con tu certificado y lo envia a CerteCF.
        </p>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <input ref={fileInputRef} type="file" accept=".xlsx" onChange={handleFile} className="hidden" />
        <Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={running} className="border-emerald-300 text-emerald-700 hover:bg-emerald-100">
          <Upload className="w-4 h-4 mr-2" /> Cargar aprobaciones .xlsx
        </Button>
        {casos.length > 0 && (
          <Button onClick={correrTodos} disabled={running} className="bg-emerald-600 hover:bg-emerald-700 text-white">
            {running ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Play className="w-4 h-4 mr-2" />}
            {running ? 'Enviando...' : `Enviar ${casos.length} aprobaciones`}
          </Button>
        )}
        {casos.length > 0 && (
          <Button variant="outline" onClick={reiniciar} disabled={running} className="border-amber-300 text-amber-700 hover:bg-amber-50">
            <RotateCcw className="w-4 h-4 mr-2" /> Reiniciar estados
          </Button>
        )}
        {casos.length > 0 && (
          <div className="text-[12px] text-gray-600">
            <span className="font-bold text-emerald-700">{resumen.aceptados}</span> aceptadas |{' '}
            <span className="font-bold text-red-700">{resumen.errores}</span> errores |{' '}
            <span className="font-bold text-gray-500">{resumen.pendientes}</span> pendientes
          </div>
        )}
      </div>

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setModal(null)}>
          <div className="bg-white rounded-lg shadow-2xl max-w-2xl w-full max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b bg-emerald-50">
              <h3 className="text-sm font-bold text-emerald-900">{modal.title}</h3>
              <button onClick={() => setModal(null)} className="text-gray-500 hover:text-gray-800 text-xl leading-none">&times;</button>
            </div>
            <textarea readOnly value={modal.content} className="m-4 h-80 font-mono text-[11px] p-2 border rounded bg-slate-50" />
          </div>
        </div>
      )}

      {casos.length > 0 && (
        <div className="border rounded-lg overflow-hidden bg-white">
          <table className="w-full text-[11px]">
            <thead className="bg-gray-100 text-gray-700 uppercase text-[10px]">
              <tr>
                <th className="px-2 py-2 text-left">#</th>
                <th className="px-2 py-2 text-left">e-NCF</th>
                <th className="px-2 py-2 text-left">RNC Emisor</th>
                <th className="px-2 py-2 text-left">Fecha</th>
                <th className="px-2 py-2 text-left">Monto</th>
                <th className="px-2 py-2 text-left">Estado</th>
                <th className="px-2 py-2 text-left">Respuesta / Error</th>
              </tr>
            </thead>
            <tbody>
              {casos.map((caso, idx) => {
                const meta = ESTADOS[caso.estado] || ESTADOS.pending;
                const Icon = meta.icon;
                return (
                  <tr key={`${caso.encf}-${idx}`} className="border-t hover:bg-gray-50">
                    <td className="px-2 py-1 text-gray-500">{idx + 1}</td>
                    <td className="px-2 py-1 font-mono">{caso.encf}</td>
                    <td className="px-2 py-1 font-mono">{caso.rncEmisor || '-'}</td>
                    <td className="px-2 py-1">{formatDate(caso.fechaEmision)}</td>
                    <td className="px-2 py-1 font-mono">{caso.montoTotal}</td>
                    <td className="px-2 py-1">
                      <span className={`inline-flex items-center gap-1 ${meta.color}`}>
                        <Icon className="w-3.5 h-3.5" /> {meta.label}
                      </span>
                    </td>
                    <td className="px-2 py-1 max-w-[360px] truncate">
                      {caso.error ? (
                        <button className="text-red-700 hover:underline" onClick={() => setModal({ title: `Error ${caso.encf}`, content: caso.error })}>
                          {caso.error}
                        </button>
                      ) : caso.response ? (
                        <button className="text-blue-700 hover:underline" onClick={() => setModal({ title: `Respuesta ${caso.encf}`, content: JSON.stringify(caso.response, null, 2) })}>
                          Ver respuesta
                        </button>
                      ) : '-'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default DgiiAprobacionComercialRunner;
