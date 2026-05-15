import React, { useMemo, useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Loader2, Upload, CheckCircle2, XCircle, Clock, Play, FileSpreadsheet } from 'lucide-react';

// Lee xlsx en cliente y devuelve { ECF: [...], RFCE: [...] }
async function parseXlsx(file) {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const out = {};
  for (const name of wb.SheetNames) {
    out[name] = XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: '' });
  }
  return out;
}

const ESTADOS = {
  pending: { label: 'Pendiente', icon: Clock, color: 'text-gray-500' },
  sending: { label: 'Procesando...', icon: Loader2, color: 'text-blue-600 animate-spin' },
  checking: { label: 'Consultando DGII...', icon: Loader2, color: 'text-blue-600 animate-spin' },
  aceptado: { label: 'Aceptado', icon: CheckCircle2, color: 'text-emerald-600' },
  aceptado_condicional: { label: 'Aceptado (cond.)', icon: CheckCircle2, color: 'text-amber-600' },
  enviado: { label: 'Recibido DGII', icon: Clock, color: 'text-blue-600' },
  descargado: { label: 'Descargado (sube manual)', icon: CheckCircle2, color: 'text-purple-600' },
  rechazado: { label: 'Rechazado', icon: XCircle, color: 'text-red-600' },
  error: { label: 'Error', icon: XCircle, color: 'text-red-600' },
};

const CERTIFICACION_AMBIENTE = 'CerteCF';
const FINAL_ESTADOS = new Set(['aceptado', 'aceptado_condicional', 'rechazado']);
const ACCEPTED_ESTADOS = new Set(['aceptado', 'aceptado_condicional']);
const LOCAL_READY_ESTADOS = new Set(['descargado']);

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function normalizeDgiiStatus(payload) {
  const estadoPayload = payload?.estado || payload || {};
  const rawEstado = String(estadoPayload.estado || estadoPayload.Estado || '').trim().toLowerCase();
  const mensajes = estadoPayload.mensajes || estadoPayload.Mensajes || [];
  const messageText = Array.isArray(mensajes)
    ? mensajes.map(m => `${m.codigo || m.Codigo || ''} ${m.valor || m.Valor || ''}`.trim()).filter(Boolean).join(' | ')
    : '';

  if (rawEstado.includes('aceptado cond')) return { estado: 'aceptado_condicional', error: null, payload: estadoPayload };
  if (rawEstado.includes('aceptado')) return { estado: 'aceptado', error: null, payload: estadoPayload };
  if (rawEstado.includes('rechaz')) return { estado: 'rechazado', error: messageText || rawEstado || 'Rechazado por DGII', payload: estadoPayload };
  if (rawEstado.includes('proces') || rawEstado.includes('pend') || rawEstado.includes('recib')) return { estado: 'enviado', error: null, payload: estadoPayload };
  return { estado: rawEstado || 'enviado', error: messageText || null, payload: estadoPayload };
}

const DgiiCertificacionRunner = () => {
  const { toast } = useToast();
  const fileInputRef = useRef(null);
  const [casos, setCasos] = useState([]); // [{ kind, row, casoPrueba, tipo, encf, estado, trackId, error, response }]
  const [running, setRunning] = useState(false);
  const [consultingAll, setConsultingAll] = useState(false);
  const [progreso, setProgreso] = useState({ ok: 0, err: 0 });

  const resumen = useMemo(() => {
    const aceptados = casos.filter(c => ACCEPTED_ESTADOS.has(c.estado)).length;
    const errores = casos.filter(c => c.estado === 'error' || c.estado === 'rechazado').length;
    const manualesListos = casos.filter(c => LOCAL_READY_ESTADOS.has(c.estado)).length;
    const pendientes = Math.max(0, casos.length - aceptados - errores - manualesListos);
    return { aceptados, errores, manualesListos, pendientes };
  }, [casos]);

  const handleFile = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.name.toLowerCase().endsWith('.xlsx')) {
      toast({ title: 'Formato invalido', description: 'Sube el archivo .xlsx que DGII generó para tu RNC', variant: 'destructive' });
      return;
    }
    try {
      const sheets = await parseXlsx(f);
      const rfceRows = sheets.RFCE || [];
      const rfceEncfs = new Set(rfceRows.map((r) => r.ENCF));
      // ECF row lookup por eNCF (para derivar codigo en RFCE)
      const ecfByEncf = Object.fromEntries((sheets.ECF || []).map((r) => [r.ENCF, r]));

      // FASE 1: ECFs tipos 31, 32 (>=250K), 41, 43, 44, 45, 46, 47
      // FASE 2: Notas (33, 34)
      // FASE 3: RFCE (resumen 32 < 250K)
      // FASE 4: ECF Tipo 32 < 250K (factura completa)
      const fase1 = [];
      const fase2 = [];
      const fase4 = [];
      for (const row of (sheets.ECF || [])) {
        const tipo = String(row.TipoeCF);
        const monto = Number(row.MontoTotal) || 0;
        const caso = {
          kind: 'ECF',
          row,
          casoPrueba: row.CasoPrueba,
          tipo,
          encf: row.ENCF,
          estado: 'pending',
        };
        if (tipo === '33' || tipo === '34') {
          fase2.push({ ...caso, fase: 2 });
        } else if (tipo === '32' && rfceEncfs.has(row.ENCF)) {
          // Tipo 32 con RFCE matching → fase 4 (despues del RFCE)
          fase4.push({ ...caso, fase: 4 });
        } else {
          fase1.push({ ...caso, fase: 1 });
        }
      }
      const fase3 = rfceRows.map((row) => ({
        kind: 'RFCE',
        row,
        ecfRowForRfce: ecfByEncf[row.ENCF] || null,
        casoPrueba: row.CasoPrueba,
        tipo: String(row.TipoeCF),
        encf: row.ENCF,
        estado: 'pending',
        fase: 3,
      }));

      // Orden final: fase1 → fase2 → fase3 → fase4
      const all = [...fase1, ...fase2, ...fase3, ...fase4];
      if (!all.length) {
        toast({ title: 'Archivo vacio', description: 'No se encontraron casos en las hojas ECF o RFCE.', variant: 'destructive' });
        return;
      }
      setCasos(all);
      setProgreso({ ok: 0, err: 0 });
      toast({
        title: '✓ Set cargado',
        description: `Fase 1: ${fase1.length} | Fase 2: ${fase2.length} | Fase 3 (RFCE): ${fase3.length} | Fase 4 (manual): ${fase4.length}`,
      });
    } catch (err) {
      toast({ title: 'Error leyendo xlsx', description: err.message, variant: 'destructive' });
    }
    e.target.value = '';
  };

  const enviarCaso = async (caso) => {
    console.log(`[Certif] Procesando Fase ${caso.fase} ${caso.kind} ${caso.encf} (${caso.casoPrueba})...`);

    // FASE 4: NO enviar via API. Solo generar XML firmado y descargar
    // para que el usuario lo suba manualmente en el portal DGII.
    if (caso.fase === 4) {
      const { data, error } = await supabase.functions.invoke('emitir-fiscal', {
        body: {
          action: 'dgii_certif_sign_only',
          ambiente: CERTIFICACION_AMBIENTE,
          row: caso.row,
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
      // Descargar XML firmado
      if (data?.xml_firmado) {
        const blob = new Blob([data.xml_firmado], { type: 'application/xml' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${caso.encf}_firmado.xml`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
      return {
        ok: true,
        encf: caso.encf,
        tipo_ecf: caso.tipo,
        kind: caso.kind,
        track_id: 'DESCARGADO (sube manual)',
        estado_dgii: 'descargado',
        xml_firmado_length: data?.xml_firmado_length,
      };
    }

    // FASE 1, 2, 3: enviar via API a DGII
    let ecfRow = null;
    if (caso.kind === 'RFCE') {
      ecfRow = caso.ecfRowForRfce || null;
      if (!ecfRow) console.warn(`[Certif] RFCE ${caso.encf}: sin ECF correspondiente`);
    }
    const { data, error } = await supabase.functions.invoke('emitir-fiscal', {
      body: {
        action: 'dgii_certif_send_row',
        ambiente: CERTIFICACION_AMBIENTE,
        row: caso.row,
        kind: caso.kind,
        ecf_row: ecfRow,
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
      console.error(`[Certif] ERROR ${caso.kind} ${caso.encf}:`, msg);
      throw new Error(msg);
    }
    if (!data?.ok) {
      console.warn(`[Certif] DGII rechazo ${caso.kind} ${caso.encf}:`, data);
    } else {
      console.log(`[Certif] OK ${caso.kind} ${caso.encf} -> trackId:`, data.track_id);
    }
    return data;
  };

  const consultarTrackId = async (trackId) => {
    const { data, error } = await supabase.functions.invoke('emitir-fiscal', {
      body: { action: 'dgii_certif_check_status', ambiente: CERTIFICACION_AMBIENTE, track_id: trackId },
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
    return data;
  };

  const esperarEstadoFinal = async (trackId, maxIntentos = 8) => {
    let last = null;
    for (let intento = 0; intento < maxIntentos; intento++) {
      if (intento > 0) await delay(3500);
      const data = await consultarTrackId(trackId);
      last = normalizeDgiiStatus(data);
      if (FINAL_ESTADOS.has(last.estado)) return last;
    }
    return last || { estado: 'enviado', error: null, payload: null };
  };

  const correrTodos = async () => {
    if (!casos.length || running) return;
    if (!confirm(`Enviar ${casos.length} casos a DGII?\n\nSe firmara cada uno con tu .p12 y se enviara al ambiente oficial de certificacion (${CERTIFICACION_AMBIENTE}).\n\nEsto puede tardar 1-3 minutos.`)) return;
    setRunning(true);
    let ok = 0, err = 0;
    const aceptadosEnCorrida = new Set(
      casos.filter(c => ACCEPTED_ESTADOS.has(c.estado)).map(c => String(c.encf))
    );
    for (let i = 0; i < casos.length; i++) {
      const casoActual = casos[i];
      if (ACCEPTED_ESTADOS.has(casoActual.estado) || LOCAL_READY_ESTADOS.has(casoActual.estado)) {
        if (ACCEPTED_ESTADOS.has(casoActual.estado)) aceptadosEnCorrida.add(String(casoActual.encf));
        ok++;
        setProgreso({ ok, err });
        continue;
      }
      const ncfModificado = String(casoActual?.row?.NCFModificado || '').trim();
      if ((casoActual.tipo === '33' || casoActual.tipo === '34') && ncfModificado && !aceptadosEnCorrida.has(ncfModificado)) {
        setCasos((prev) => prev.map((c, idx) => idx === i ? {
          ...c,
          estado: 'error',
          error: `Antes de enviar esta nota, el e-NCF modificado ${ncfModificado} debe estar Aceptado en ${CERTIFICACION_AMBIENTE}.`,
          step: 'orden_dgii',
          trackId: null,
        } : c));
        err++;
        setProgreso({ ok, err });
        continue;
      }
      if (casoActual.fase === 4 && !aceptadosEnCorrida.has(String(casoActual.encf))) {
        setCasos((prev) => prev.map((c, idx) => idx === i ? {
          ...c,
          estado: 'error',
          error: `Antes de descargar/subir manualmente esta factura, su RFCE ${casoActual.encf} debe estar Aceptado en ${CERTIFICACION_AMBIENTE}.`,
          step: 'orden_dgii',
          trackId: null,
        } : c));
        err++;
        setProgreso({ ok, err });
        continue;
      }
      // Limpiar error/trackId viejos al iniciar (evita confusion visual)
      setCasos((prev) => prev.map((c, idx) => idx === i
        ? { ...c, estado: 'sending', error: null, step: null, trackId: null }
        : c));
      try {
        const result = await enviarCaso(casos[i]);
        if (result.ok) {
          const initialEstado = (result.estado_dgii || 'enviado').toLowerCase();
          setCasos((prev) => prev.map((c, idx) => idx === i ? {
            ...c,
            estado: initialEstado,
            trackId: result.track_id,
            response: result.response_payload,
            xmlLength: result.xml_firmado_length,
            error: null,
            step: null,
          } : c));

          let final = normalizeDgiiStatus(result.response_payload || { estado: initialEstado });
          if (result.track_id && !String(result.track_id).startsWith('DESCARGADO') && !FINAL_ESTADOS.has(final.estado)) {
            setCasos((prev) => prev.map((c, idx) => idx === i ? { ...c, estado: 'checking' } : c));
            final = await esperarEstadoFinal(result.track_id);
          }

          setCasos((prev) => prev.map((c, idx) => idx === i ? {
            ...c,
            estado: final.estado,
            response: final.payload || result.response_payload,
            error: final.error,
            step: final.error ? 'dgii_status' : null,
          } : c));

          if (ACCEPTED_ESTADOS.has(final.estado)) {
            aceptadosEnCorrida.add(String(casos[i].encf));
            ok++;
          } else if (LOCAL_READY_ESTADOS.has(final.estado)) {
            ok++;
          } else {
            err++;
          }
        } else {
          setCasos((prev) => prev.map((c, idx) => idx === i ? {
            ...c,
            estado: 'error',
            error: result.error,
            step: result.step,
            trackId: null,
          } : c));
          err++;
        }
      } catch (e) {
        setCasos((prev) => prev.map((c, idx) => idx === i ? {
          ...c, estado: 'error', error: e.message, trackId: null,
        } : c));
        err++;
      }
      setProgreso({ ok, err });
    }
    setRunning(false);
    toast({
      title: 'Set completado',
      description: `${ok} ok / ${err} errores. Revisa cada fila para detalles.`,
      variant: err > 0 ? 'destructive' : 'default',
    });
  };

  const [estadoModal, setEstadoModal] = useState(null);

  const consultarEstado = async (idx) => {
    const caso = casos[idx];
    if (!caso) return;
    // Si no hay trackId (ej. RFCE que DGII acepta sin trackId), mostrar
    // la respuesta local que guardamos al enviar.
    if (!caso.trackId || String(caso.trackId).startsWith('DESCARGADO')) {
      setEstadoModal({
        titulo: `Respuesta local — ${caso.encf}`,
        encf: caso.encf,
        contenido: JSON.stringify({
          estado: caso.estado,
          kind: caso.kind,
          response: caso.response || null,
          xmlLength: caso.xmlLength || null,
          nota: String(caso.trackId || '').startsWith('DESCARGADO')
            ? 'Este caso es Fase 4 — XML descargado para subida manual. No tiene TrackId.'
            : 'Sin TrackId DGII (DGII aceptó directamente). Mostrando respuesta local.',
        }, null, 2),
      });
      return;
    }
    try {
      const data = await consultarTrackId(caso.trackId);
      const normalized = normalizeDgiiStatus(data);
      setCasos((prev) => prev.map((c, i) => i === idx ? {
        ...c,
        estado: normalized.estado,
        response: normalized.payload,
        error: normalized.error,
        step: normalized.error ? 'dgii_status' : null,
      } : c));
      setEstadoModal({
        titulo: `Estado en DGII — ${caso.encf}`,
        encf: caso.encf,
        trackId: caso.trackId,
        contenido: JSON.stringify(data?.estado || data, null, 2),
      });
      console.log(`[Certif] Estado ${caso.encf}:`, data);
    } catch (err) {
      setEstadoModal({ titulo: 'Error consultando', encf: caso.encf, contenido: err.message });
    }
  };

  const verErrorCompleto = (caso) => {
    setEstadoModal({
      titulo: `Error completo — ${caso.encf}`,
      encf: caso.encf,
      contenido: `Caso: ${caso.casoPrueba}\nTipo: ${caso.kind} ${caso.tipo}\neNCF: ${caso.encf}\nFase: ${caso.fase}\nStep: ${caso.step}\n\n${caso.error || ''}`,
    });
  };

  const reintentarUno = async (idx) => {
    if (running) return;
    const caso = casos[idx];
    const ncfModificado = String(caso?.row?.NCFModificado || '').trim();
    if ((caso?.tipo === '33' || caso?.tipo === '34') && ncfModificado && !casos.some(c => c.encf === ncfModificado && ACCEPTED_ESTADOS.has(c.estado))) {
      toast({
        title: 'Orden DGII',
        description: `Primero debe quedar aceptado ${ncfModificado} en ${CERTIFICACION_AMBIENTE}.`,
        variant: 'destructive',
      });
      return;
    }
    if (caso?.fase === 4 && !casos.some(c => c.encf === caso.encf && ACCEPTED_ESTADOS.has(c.estado))) {
      toast({
        title: 'RFCE pendiente',
        description: `Primero debe quedar aceptado el RFCE ${caso.encf} en ${CERTIFICACION_AMBIENTE}.`,
        variant: 'destructive',
      });
      return;
    }
    setCasos((prev) => prev.map((c, i) => i === idx
      ? { ...c, estado: 'sending', error: null, step: null, trackId: null }
      : c));
    try {
      const result = await enviarCaso(casos[idx]);
      if (result.ok) {
        let final = normalizeDgiiStatus(result.response_payload || { estado: result.estado_dgii || 'enviado' });
        if (result.track_id && !String(result.track_id).startsWith('DESCARGADO') && !FINAL_ESTADOS.has(final.estado)) {
          final = await esperarEstadoFinal(result.track_id);
        }
        setCasos((prev) => prev.map((c, i) => i === idx ? {
          ...c, estado: final.estado,
          trackId: result.track_id, response: final.payload || result.response_payload,
          error: final.error, step: final.error ? 'dgii_status' : null,
        } : c));
      } else {
        setCasos((prev) => prev.map((c, i) => i === idx ? {
          ...c, estado: 'error', error: result.error, step: result.step, trackId: null,
        } : c));
      }
    } catch (e) {
      setCasos((prev) => prev.map((c, i) => i === idx ? {
        ...c, estado: 'error', error: e.message, trackId: null,
      } : c));
    }
  };

  const consultarTodos = async () => {
    if (running || consultingAll) return;
    const indices = casos
      .map((caso, idx) => ({ caso, idx }))
      .filter(({ caso }) => caso.trackId && !String(caso.trackId).startsWith('DESCARGADO'));
    if (!indices.length) return;

    setConsultingAll(true);
    for (const { caso, idx } of indices) {
      setCasos((prev) => prev.map((c, i) => i === idx ? { ...c, estado: 'checking' } : c));
      try {
        const data = await consultarTrackId(caso.trackId);
        const normalized = normalizeDgiiStatus(data);
        setCasos((prev) => prev.map((c, i) => i === idx ? {
          ...c,
          estado: normalized.estado,
          response: normalized.payload,
          error: normalized.error,
          step: normalized.error ? 'dgii_status' : null,
        } : c));
      } catch (err) {
        setCasos((prev) => prev.map((c, i) => i === idx ? {
          ...c,
          estado: 'error',
          error: err.message,
          step: 'dgii_status',
        } : c));
      }
    }
    setConsultingAll(false);
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-[12px] text-blue-900">
        <p className="font-bold mb-1 flex items-center gap-2">
          <FileSpreadsheet className="w-4 h-4" /> Set de Pruebas DGII (Paso 2 — Certificación)
        </p>
        <p>
          Sube el archivo .xlsx que DGII generó para tu RNC en el portal de certificación.
          MotoFlow generará el XML de cada caso, lo firmará con tu .p12 y lo enviará al
          ambiente oficial <b>{CERTIFICACION_AMBIENTE}</b>. <b>Importante:</b> el archivo .xlsx debe descargarse una sola
          vez — DGII lo regenera con datos distintos cada descarga.
        </p>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx"
          onChange={handleFile}
          className="hidden"
        />
        <Button
          variant="outline"
          onClick={() => fileInputRef.current?.click()}
          disabled={running}
          className="border-blue-300 text-blue-700 hover:bg-blue-100"
        >
          <Upload className="w-4 h-4 mr-2" />
          Cargar .xlsx de DGII
        </Button>

        {casos.length > 0 && (
          <Button
            onClick={correrTodos}
            disabled={running}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {running ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Play className="w-4 h-4 mr-2" />}
            {running ? `Enviando ${progreso.ok + progreso.err}/${casos.length}...` : `Enviar ${casos.length} casos`}
          </Button>
        )}

        {casos.some(c => c.trackId && !String(c.trackId).startsWith('DESCARGADO')) && (
          <Button
            variant="outline"
            onClick={consultarTodos}
            disabled={running || consultingAll}
            className="border-blue-300 text-blue-700 hover:bg-blue-100"
          >
            {consultingAll ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Clock className="w-4 h-4 mr-2" />}
            Consultar enviados
          </Button>
        )}

        {casos.length > 0 && (
          <div className="text-[12px] text-gray-600">
            <span className="font-bold text-emerald-700">{resumen.aceptados}</span> aceptados ·{' '}
            {resumen.manualesListos > 0 && (
              <>
                <span className="font-bold text-purple-700">{resumen.manualesListos}</span> listos manual ·{' '}
              </>
            )}
            <span className="font-bold text-red-700">{resumen.errores}</span> errores ·{' '}
            <span className="font-bold text-gray-500">{resumen.pendientes}</span> pendientes
          </div>
        )}
      </div>

      {/* Modal de detalles (estado/error) — texto copiable */}
      {estadoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setEstadoModal(null)}>
          <div className="bg-white rounded-lg shadow-2xl max-w-2xl w-full max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b bg-blue-50">
              <h3 className="text-sm font-bold text-blue-900">{estadoModal.titulo}</h3>
              <button onClick={() => setEstadoModal(null)} className="text-gray-500 hover:text-gray-800 text-xl leading-none">&times;</button>
            </div>
            <div className="p-4 overflow-auto flex-1">
              <textarea
                readOnly
                value={estadoModal.contenido}
                className="w-full h-80 font-mono text-[11px] p-2 border rounded bg-slate-50 select-all"
                onFocus={(e) => e.target.select()}
              />
            </div>
            <div className="px-4 py-2 border-t bg-slate-50 flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  navigator.clipboard?.writeText(estadoModal.contenido);
                  toast({ title: 'Copiado al portapapeles' });
                }}
              >
                Copiar
              </Button>
              <Button size="sm" onClick={() => setEstadoModal(null)}>Cerrar</Button>
            </div>
          </div>
        </div>
      )}

      {/* Tabla de resultados */}
      {casos.length > 0 && (
        <div className="border rounded-lg overflow-hidden bg-white">
          <table className="w-full text-[11px]">
            <thead className="bg-gray-100 text-gray-700 uppercase text-[10px]">
              <tr>
                <th className="px-2 py-2 text-left">#</th>
                <th className="px-2 py-2 text-left">Fase</th>
                <th className="px-2 py-2 text-left">Tipo</th>
                <th className="px-2 py-2 text-left">e-NCF</th>
                <th className="px-2 py-2 text-left">Caso</th>
                <th className="px-2 py-2 text-left">Estado</th>
                <th className="px-2 py-2 text-left">TrackId / Error</th>
                <th className="px-2 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {casos.map((caso, idx) => {
                const meta = ESTADOS[caso.estado] || ESTADOS.pending;
                const Icon = meta.icon;
                return (
                  <tr key={idx} className="border-t hover:bg-gray-50">
                    <td className="px-2 py-1 text-gray-500">{idx + 1}</td>
                    <td className="px-2 py-1 text-center font-bold text-blue-700">
                      {caso.fase || '—'}
                    </td>
                    <td className="px-2 py-1 font-mono">
                      {caso.kind === 'RFCE' ? 'RFCE' : caso.tipo}
                    </td>
                    <td className="px-2 py-1 font-mono">{caso.encf}</td>
                    <td className="px-2 py-1 text-gray-600 truncate max-w-[180px]" title={caso.casoPrueba}>{caso.casoPrueba}</td>
                    <td className="px-2 py-1">
                      <span className={`inline-flex items-center gap-1 ${meta.color}`}>
                        <Icon className="w-3.5 h-3.5" />
                        {meta.label}
                      </span>
                    </td>
                    <td className="px-2 py-1 font-mono text-[10px] max-w-[300px] truncate" title={caso.error || caso.trackId || ''}>
                      {caso.error
                        ? <span
                            className="text-red-700 cursor-pointer hover:underline"
                            onClick={() => verErrorCompleto(caso)}
                            title="Click para ver mensaje completo y copiarlo"
                          >
                            [{caso.step}] {caso.error}
                          </span>
                        : caso.trackId || '—'}
                    </td>
                    <td className="px-2 py-1 whitespace-nowrap">
                      {(caso.estado === 'error' || caso.estado === 'rechazado') && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => reintentarUno(idx)}
                          disabled={running}
                          className="h-6 px-2 text-[10px]"
                        >
                          Reintentar
                        </Button>
                      )}
                      {(caso.trackId || caso.response || caso.estado === 'aceptado' || caso.estado === 'descargado' || caso.estado === 'enviado') && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => consultarEstado(idx)}
                          disabled={running}
                          className="h-6 px-2 text-[10px] text-blue-700"
                        >
                          Consultar
                        </Button>
                      )}
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

export default DgiiCertificacionRunner;
