import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '@/lib/customSupabaseClient';
import { clearDgiiSimulacionState, loadDgiiSimulacionState, saveDgiiSimulacionState } from '@/lib/dgiiCertificacionStorage';
import { downloadRepresentacionImpresa } from '@/lib/dgiiRepresentacionImpresa';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { CheckCircle2, Clock, Download, FileCode2, FileSpreadsheet, FileText, Loader2, Play, RotateCcw, XCircle } from 'lucide-react';

const CERTIFICACION_AMBIENTE = 'CerteCF';

const ESTADOS = {
  pending: { label: 'Pendiente', icon: Clock, color: 'text-gray-500' },
  sending: { label: 'Enviando...', icon: Loader2, color: 'text-blue-600 animate-spin' },
  checking: { label: 'Consultando...', icon: Loader2, color: 'text-blue-600 animate-spin' },
  aceptado: { label: 'Aceptado', icon: CheckCircle2, color: 'text-emerald-600' },
  aceptado_condicional: { label: 'Aceptado cond.', icon: CheckCircle2, color: 'text-amber-600' },
  enviado: { label: 'Recibido DGII', icon: Clock, color: 'text-blue-600' },
  rechazado: { label: 'Rechazado', icon: XCircle, color: 'text-red-600' },
  error: { label: 'Error', icon: XCircle, color: 'text-red-600' },
};

const FINAL_ESTADOS = new Set(['aceptado', 'aceptado_condicional', 'rechazado']);
const ACCEPTED_ESTADOS = new Set(['aceptado', 'aceptado_condicional']);

const responseText = (value) => {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(responseText).join(' ');
  if (typeof value === 'object') {
    return [value.response, value.estado, value.Estado, value.valor, value.Valor, value.mensaje, value.Mensaje, value.raw]
      .map(responseText)
      .filter(Boolean)
      .join(' ');
  }
  return String(value);
};

function normalizeDgiiStatus(payload) {
  if (payload && typeof payload.response === 'string') {
    const r = payload.response.trim().toLowerCase();
    if (r.includes('aceptado cond')) return { estado: 'aceptado_condicional', error: null, payload };
    if (r.includes('aceptado')) return { estado: 'aceptado', error: null, payload };
    if (r.includes('rechaz')) return { estado: 'rechazado', error: payload.response, payload };
  }
  const estadoPayload = payload?.estado || payload || {};
  const rawEstado = String(estadoPayload.estado || estadoPayload.Estado || '').trim().toLowerCase();
  const text = responseText(estadoPayload).toLowerCase();
  if (rawEstado.includes('aceptado cond') || text.includes('aceptado cond')) return { estado: 'aceptado_condicional', error: null, payload: estadoPayload };
  if (rawEstado.includes('aceptado') || text.includes('aceptado')) return { estado: 'aceptado', error: null, payload: estadoPayload };
  if (rawEstado.includes('rechaz') || text.includes('rechaz')) return { estado: 'rechazado', error: responseText(estadoPayload) || 'Rechazado por DGII', payload: estadoPayload };
  if (rawEstado.includes('proces') || rawEstado.includes('pend') || rawEstado.includes('recib')) return { estado: 'enviado', error: null, payload: estadoPayload };
  return { estado: rawEstado || 'enviado', error: null, payload: estadoPayload };
}

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function downloadXml(xml, fileName) {
  const blob = new Blob([xml], { type: 'application/xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const getXmlFirmadoCaso = (caso) => caso?.manualEcf?.xml_firmado || caso?.xmlFirmado || '';

const getRepresentacionFileName = (caso) => {
  const encfName = String(caso?.manualEcf?.encf || caso?.encf || 'ecf').trim();
  const tipoName = caso?.rfce ? '32-RFCE' : String(caso?.tipo || 'ecf').trim();
  return `${tipoName}_${encfName}_RI.pdf`;
};

const encf = (tipo, seq) => `E${tipo}${String(seq).padStart(10, '0')}`;

const sanitizeCasoForStorage = (caso) => ({
  ...caso,
  estado: caso.estado === 'sending' || caso.estado === 'checking' ? 'enviado' : caso.estado,
});

const getInitialCasos = () => {
  const saved = loadDgiiSimulacionState();
  if (saved?.casos?.length) return saved.casos.map(sanitizeCasoForStorage);
  return generarCasos();
};

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

// Convierte las filas del xlsx oficial DGII (Paso 4) a casos del runner.
// El xlsx tiene hojas ECF (comprobantes individuales) y RFCE (resúmenes).
//
// ORDEN OBLIGATORIO DGII (paso 4):
//   FASE 1: 31, 32 (>=250K), 41, 43, 44, 45, 46, 47 (documentos base)
//   FASE 2: 33, 34 (notas — requieren referencia a un e-CF de fase 1)
//   FASE 3: 32 RFCE (resumen consumo <250K)
//   FASE 4: 32 individual (<250K) — solo después de que el RFCE esté aceptado
function casosDesdeXlsx(sheets) {
  const ecfRows = sheets.ECF || [];
  const rfceRows = sheets.RFCE || [];
  const rfceEncfs = new Set(rfceRows.map((r) => String(r.ENCF || '').trim()));
  const monto = (row, ...keys) => {
    for (const key of keys) {
      const value = row[key];
      if (value !== undefined && value !== null && String(value).trim() !== '') {
        return Number(String(value).replace(/,/g, '')) || 0;
      }
    }
    return 0;
  };

  const fase1 = [];
  const fase2 = [];
  const fase4 = [];
  for (const row of ecfRows) {
    const tipo = String(row.TipoeCF || row.TipoECF || '').trim();
    const encfRow = String(row.ENCF || row['e-NCF'] || '').trim();
    if (!tipo || !encfRow) continue;
    const montoTotal = monto(row, 'MontoTotal', 'Monto Total', 'Monto');
    const montoBase = monto(row, 'MontoGravadoI1', 'Monto Gravado I1', 'MontoGravadoTotal', 'Monto Gravado Total');
    const totalItbis = monto(row, 'TotalITBIS1', 'Total ITBIS1', 'TotalITBIS', 'Total ITBIS');
    const fechaVenc = String(row.FechaVencimientoSecuencia || row['Fecha Vencimiento Secuencia'] || '').trim();
    const ncfModificado = String(row.NCFModificado || row['NCF Modificado'] || '').trim();
    const fechaNcfModificado = String(row.FechaNCFModificado || row['Fecha NCF Modificado'] || '').trim();
    // Tipo 32 que ALSO aparece en RFCE → es individual fase 4 (manual / sin envío API)
    const tieneRfceAsociado = tipo === '32' && rfceEncfs.has(encfRow);
    const caso = {
      id: `${tipo}-${encfRow}`,
      tipo,
      label: `${row.CasoPrueba || `Tipo ${tipo}`}`,
      encf: encfRow,
      fecha_vencimiento_secuencia: fechaVenc || null,
      estado: 'pending',
      monto: montoTotal || null,
      monto_base: montoBase || null,
      total_itbis: totalItbis || null,
      rfce: false,
      referencia: ncfModificado ? { encf: ncfModificado, fecha: fechaNcfModificado || null } : null,
      row,
    };
    if (tipo === '33' || tipo === '34') {
      caso.fase = 2;
      fase2.push(caso);
    } else if (tieneRfceAsociado) {
      caso.fase = 4;
      fase4.push(caso);
    } else {
      caso.fase = 1;
      fase1.push(caso);
    }
  }

  // FASE 3: RFCE resúmenes (uno por cada fila de la hoja RFCE)
  const fase3 = rfceRows.map((row) => {
    const tipo = String(row.TipoeCF || '32').trim();
    const encfRow = String(row.ENCF || '').trim();
    const fechaVenc = String(row.FechaVencimientoSecuencia || '').trim();
    const montoTotal = monto(row, 'MontoTotal', 'Monto Total', 'Monto');
    const montoBase = monto(row, 'MontoGravadoI1', 'Monto Gravado I1', 'MontoGravadoTotal', 'Monto Gravado Total');
    const totalItbis = monto(row, 'TotalITBIS1', 'Total ITBIS1', 'TotalITBIS', 'Total ITBIS');
    return {
      id: `RFCE-${encfRow}`,
      tipo,
      label: `RFCE ${row.CasoPrueba || encfRow}`,
      encf: encfRow,
      fecha_vencimiento_secuencia: fechaVenc || null,
      estado: 'pending',
      monto: montoTotal || null,
      monto_base: montoBase || null,
      total_itbis: totalItbis || null,
      rfce: true,
      fase: 3,
      row,
    };
  });

  // Orden final estricto: fase1 → fase2 → fase3 → fase4
  return [...fase1, ...fase2, ...fase3, ...fase4];
}

// Generación local (deprecated — solo fallback si no hay xlsx)
function generarCasos() {
  const base = Math.floor(Date.now() / 1000) % 7000000 + 1000000;
  let seq = base;
  const now = new Date();
  const fechaRef = `${String(now.getDate()).padStart(2, '0')}-${String(now.getMonth() + 1).padStart(2, '0')}-${now.getFullYear()}`;
  const casos = [];
  const push = (tipo, count, label, extra = {}) => {
    for (let i = 0; i < count; i++) {
      casos.push({
        id: `${tipo}-${i + 1}`,
        tipo,
        label: `${label} ${i + 1}`,
        encf: encf(tipo, seq++),
        estado: 'pending',
        monto: extra.monto,
        monto_base: extra.monto_base,
        total_itbis: extra.total_itbis,
        rfce: !!extra.rfce,
      });
    }
  };

  push('31', 4, 'Credito fiscal', { monto_base: 1000, monto: 1180, total_itbis: 180 });
  push('32', 2, 'Consumo >= 250K', { monto_base: 250000, monto: 295000, total_itbis: 45000 });

  const consumoMayor1 = encf('32', base + 4);
  const consumoMayor2 = encf('32', base + 5);

  casos.push({
    id: '33-1',
    tipo: '33',
    label: 'Nota debito',
    encf: encf('33', seq++),
    estado: 'pending',
    monto_base: 500,
    monto: 590,
    total_itbis: 90,
    referencia: { encf: consumoMayor1, fecha: fechaRef },
  });
  for (let i = 0; i < 2; i++) {
    casos.push({
      id: `34-${i + 1}`,
      tipo: '34',
      label: `Nota credito ${i + 1}`,
      encf: encf('34', seq++),
      estado: 'pending',
      monto_base: 500,
      monto: 590,
      total_itbis: 90,
      referencia: { encf: i === 0 ? consumoMayor1 : consumoMayor2, fecha: fechaRef },
    });
  }

  push('41', 2, 'Compras', { monto_base: 1000, monto: 1180, total_itbis: 180 });
  push('43', 2, 'Gastos menores', { monto_base: 1000, monto: 1000 });
  push('44', 2, 'Regimen especial', { monto_base: 1000, monto: 1180, total_itbis: 180 });
  push('45', 2, 'Gubernamental', { monto_base: 1000, monto: 1180, total_itbis: 180 });
  push('46', 2, 'Exportacion', { monto_base: 1180, monto: 1180 });
  push('47', 2, 'Pago exterior', { monto_base: 1180, monto: 1180 });
  push('32', 4, 'Consumo < 250K RFCE', { monto_base: 1000, monto: 1180, total_itbis: 180, rfce: true });

  return casos;
}

const DgiiSimulacionRunner = () => {
  const { toast } = useToast();
  const fileInputRef = useRef(null);
  const [casos, setCasos] = useState(getInitialCasos);
  const [running, setRunning] = useState(false);
  const [consultingAll, setConsultingAll] = useState(false);
  const [modal, setModal] = useState(null);
  // Fecha de vencimiento de secuencia (la que DGII registró para tu RNC).
  // Se encuentra en el xlsx del Paso 2 columna FechaVencimientoSecuencia.
  // Si se carga el xlsx aquí, la auto-detectamos.
  const [fechaVencimiento, setFechaVencimiento] = useState('');
  const [fileName, setFileName] = useState(null);
  const [configDgii, setConfigDgii] = useState(null);
  const fechaVencimientoEfectiva = useMemo(
    () => (fechaVencimiento || configDgii?.fecha_vencimiento_secuencia || '').trim(),
    [fechaVencimiento, configDgii?.fecha_vencimiento_secuencia]
  );

  useEffect(() => {
    let alive = true;
    const cargarConfig = async () => {
      try {
        const { data } = await supabase.functions.invoke('emitir-fiscal', {
          body: { action: 'dgii_certificate_info' },
        });
        if (!alive || !data?.ok) return;
        setConfigDgii(data);
        if (data.fecha_vencimiento_secuencia) {
          setFechaVencimiento(data.fecha_vencimiento_secuencia);
        }
      } catch (_) {
        // La simulacion puede seguir si el usuario escribe la fecha manualmente.
      }
    };
    cargarConfig();
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    const tieneResultado = casos.some(c => c.trackId || c.xmlFirmado || c.manualEcf?.xml_firmado || ACCEPTED_ESTADOS.has(c.estado) || c.estado === 'rechazado' || c.estado === 'error');
    if (!tieneResultado) return;
    const completado = casos.length > 0 && casos.every(c => ACCEPTED_ESTADOS.has(c.estado));
    saveDgiiSimulacionState(casos.map(sanitizeCasoForStorage), {
      paso4Completado: completado,
      completadoAt: completado ? new Date().toISOString() : null,
    });
  }, [casos]);

  // Carga opcional: el usuario puede cargar el xlsx del Paso 2 (set oficial)
  // para que extraigamos automáticamente la FechaVencimientoSecuencia.
  const handleFile = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.name.toLowerCase().endsWith('.xlsx')) {
      toast({ title: 'Formato inválido', description: 'Sube el archivo .xlsx que DGII generó para tu RNC (Paso 2)', variant: 'destructive' });
      e.target.value = '';
      return;
    }
    try {
      const sheets = await parseXlsx(f);
      const ecfRows = sheets.ECF || [];
      const rfceRows = sheets.RFCE || [];
      const todasLasFilas = [...ecfRows, ...rfceRows];
      const fechaDetectada = todasLasFilas
        .map(r => String(r.FechaVencimientoSecuencia || r['Fecha Vencimiento Secuencia'] || '').trim())
        .find(Boolean);
      if (!fechaDetectada) {
        toast({ title: 'Sin FechaVencimientoSecuencia', description: 'No encontré la columna en el xlsx.', variant: 'destructive' });
        return;
      }
      setFechaVencimiento(fechaDetectada);
      const casosOficiales = casosDesdeXlsx(sheets);
      if (casosOficiales.length) setCasos(casosOficiales);
      setFileName(f.name);
      toast({
        title: '✓ Datos detectados del xlsx',
        description: `${casosOficiales.length ? `${casosOficiales.length} casos cargados. ` : ''}FechaVencimientoSecuencia = ${fechaDetectada}`,
      });
    } catch (err) {
      toast({ title: 'Error leyendo xlsx', description: err.message, variant: 'destructive' });
    }
    e.target.value = '';
  };

  const resumen = useMemo(() => {
    const aceptados = casos.filter(c => ACCEPTED_ESTADOS.has(c.estado)).length;
    const errores = casos.filter(c => c.estado === 'error' || c.estado === 'rechazado').length;
    const pendientes = casos.length - aceptados - errores;
    return { aceptados, errores, pendientes };
  }, [casos]);

  const porTipo = useMemo(() => {
    const out = {};
    for (const c of casos) {
      const key = c.rfce ? '32 RFCE' : c.tipo;
      out[key] ||= { total: 0, ok: 0 };
      out[key].total++;
      if (ACCEPTED_ESTADOS.has(c.estado)) out[key].ok++;
    }
    return out;
  }, [casos]);

  const enviarCaso = async (caso) => {
    if (configDgii?.ambiente && configDgii.ambiente !== CERTIFICACION_AMBIENTE) {
      throw new Error(`El certificado esta configurado en ${configDgii.ambiente}. Para el Paso 4 debes guardar Ambiente = ${CERTIFICACION_AMBIENTE}.`);
    }
    const { data, error } = await supabase.functions.invoke('emitir-fiscal', {
      body: {
        action: 'dgii_simulacion_send_case',
        caso: { ...caso, fecha_vencimiento_secuencia: fechaVencimientoEfectiva || caso.fecha_vencimiento_secuencia },
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
    if (!data?.ok) throw new Error(data?.error || 'DGII no acepto el comprobante');
    return data;
  };

  // Genera y firma el XML del caso SIN enviarlo a DGII. Útil cuando el Paso 4
  // ya está cerrado en el portal pero necesitamos un XML firmado para subir
  // manualmente al Paso 5 (Representación Impresa).
  const firmarSoloCaso = async (caso) => {
    try {
      const { data, error } = await supabase.functions.invoke('emitir-fiscal', {
        body: {
          action: 'dgii_simulacion_send_case',
          caso: {
            ...caso,
            fecha_vencimiento_secuencia: fechaVencimientoEfectiva || caso.fecha_vencimiento_secuencia,
            sign_only: true,
          },
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
      if (!data?.ok || !data?.xml_firmado) throw new Error(data?.error || 'No se pudo firmar el XML');
      downloadXml(data.xml_firmado, data.file_name || `${caso.encf}.xml`);
      toast({ title: '✓ XML firmado descargado', description: `${data.file_name || caso.encf} listo para subir al Paso 5.` });
    } catch (err) {
      toast({ title: 'Error firmando', description: err.message, variant: 'destructive' });
    }
  };

  const consultarTrackId = async (trackId) => {
    const { data, error } = await supabase.functions.invoke('emitir-fiscal', {
      body: { action: 'dgii_certif_check_status', ambiente: CERTIFICACION_AMBIENTE, track_id: trackId },
    });
    if (error) throw error;
    return data;
  };

  const esperarEstadoFinal = async (trackId, maxIntentos = 7) => {
    let last = null;
    for (let intento = 0; intento < maxIntentos; intento++) {
      if (intento > 0) await delay(3500);
      last = normalizeDgiiStatus(await consultarTrackId(trackId));
      if (FINAL_ESTADOS.has(last.estado)) return last;
    }
    return last || { estado: 'enviado', error: null, payload: null };
  };

  const correrTodos = async () => {
    if (running) return;
    if (!fechaVencimientoEfectiva) {
      toast({
        title: 'Falta FechaVencimientoSecuencia',
        description: 'Guarda la fecha en Configuracion DGII o cargala desde el xlsx oficial.',
        variant: 'destructive',
      });
      return;
    }
    if (!confirm(`Enviar ${casos.length} comprobantes de simulacion a DGII (${CERTIFICACION_AMBIENTE})?\n\nSe usara FechaVencimientoSecuencia = ${fechaVencimientoEfectiva}.\n\nSe usaran secuencias nuevas de esta corrida. Si reinicias las pruebas en DGII, usa "Nueva corrida" antes de reenviar.`)) return;
    setRunning(true);
    const aceptadosEnCorrida = new Set(casos.filter(c => ACCEPTED_ESTADOS.has(c.estado)).map(c => String(c.encf)));
    for (let i = 0; i < casos.length; i++) {
      const caso = casos[i];
      if (ACCEPTED_ESTADOS.has(caso.estado)) continue;
      const refEncf = caso.referencia?.encf ? String(caso.referencia.encf) : '';
      if ((caso.tipo === '33' || caso.tipo === '34') && refEncf && !aceptadosEnCorrida.has(refEncf)) {
        setCasos(prev => prev.map((c, idx) => idx === i ? {
          ...c,
          estado: 'error',
          error: `No se envia: el e-NCF de referencia ${refEncf} debe estar aceptado primero.`,
        } : c));
        continue;
      }
      setCasos(prev => prev.map((c, idx) => idx === i ? { ...c, estado: 'sending', error: null, response: null, trackId: null } : c));
      try {
        const result = await enviarCaso(caso);
        let final = normalizeDgiiStatus(result.response_payload || { estado: result.estado_dgii || 'enviado' });
        setCasos(prev => prev.map((c, idx) => idx === i ? {
          ...c,
          estado: result.track_id ? 'checking' : final.estado,
          trackId: result.track_id,
          response: result.response_payload,
          manualEcf: result.manual_ecf || null,
          xmlFirmado: result.xml_firmado || null,
          fileName: result.file_name || null,
          error: null,
        } : c));
        if (result.track_id && !FINAL_ESTADOS.has(final.estado)) {
          final = await esperarEstadoFinal(result.track_id);
        }
        setCasos(prev => prev.map((c, idx) => idx === i ? {
          ...c,
          estado: final.estado,
          response: final.payload || result.response_payload,
          error: final.error,
        } : c));
        if (ACCEPTED_ESTADOS.has(final.estado)) {
          aceptadosEnCorrida.add(String(caso.encf));
        } else if (FINAL_ESTADOS.has(final.estado)) {
          toast({
            title: 'DGII rechazo un comprobante',
            description: `Se detuvo la corrida en ${caso.encf}. Corrige ese caso y usa "Nueva corrida" antes de reenviar.`,
            variant: 'destructive',
          });
          setRunning(false);
          return;
        }
      } catch (err) {
        setCasos(prev => prev.map((c, idx) => idx === i ? { ...c, estado: 'error', error: err.message } : c));
        toast({
          title: 'Corrida detenida',
          description: `Error en ${caso.encf}: ${err.message}`,
          variant: 'destructive',
        });
        setRunning(false);
        return;
      }
    }
    setRunning(false);
    toast({ title: 'Simulacion completada', description: 'Revisa estados y descarga los XML de consumo < 250K si aplica.' });
  };

  const consultarTodos = async () => {
    if (running || consultingAll) return;
    const indices = casos.map((caso, idx) => ({ caso, idx })).filter(({ caso }) => caso.trackId);
    if (!indices.length) return;
    setConsultingAll(true);
    for (const { caso, idx } of indices) {
      setCasos(prev => prev.map((c, i) => i === idx ? { ...c, estado: 'checking' } : c));
      try {
        const normalized = normalizeDgiiStatus(await consultarTrackId(caso.trackId));
        setCasos(prev => prev.map((c, i) => i === idx ? {
          ...c,
          estado: normalized.estado,
          response: normalized.payload,
          error: normalized.error,
        } : c));
      } catch (err) {
        setCasos(prev => prev.map((c, i) => i === idx ? { ...c, estado: 'error', error: err.message } : c));
      }
    }
    setConsultingAll(false);
  };

  const limpiarSet = () => {
    if (running || consultingAll) return;
    if (!confirm('Nueva corrida?\n\nSe generan nuevas secuencias eNCF para evitar reutilizar.')) return;
    clearDgiiSimulacionState();
    setCasos(generarCasos());
  };

  const descargarRepresentacion = async (caso) => {
    const xml = getXmlFirmadoCaso(caso);
    if (!xml) {
      toast({
        title: 'XML firmado no disponible',
        description: 'Primero envia y acepta este caso para poder generar su representacion impresa.',
        variant: 'destructive',
      });
      return;
    }
    try {
      await downloadRepresentacionImpresa(xml, { fileName: getRepresentacionFileName(caso), ambiente: CERTIFICACION_AMBIENTE });
      toast({
        title: 'Representacion generada',
        description: `${caso.encf} lista para subir en el Paso 5.`,
      });
    } catch (err) {
      toast({ title: 'No se pudo generar la RI', description: err.message, variant: 'destructive' });
    }
  };

  const descargarRepresentacionesAceptadas = async () => {
    const listos = casos.filter((caso) => ACCEPTED_ESTADOS.has(caso.estado) && getXmlFirmadoCaso(caso));
    if (!listos.length) {
      toast({
        title: 'No hay representaciones listas',
        description: 'Necesitas comprobantes aceptados con XML firmado disponible.',
        variant: 'destructive',
      });
      return;
    }
    for (const caso of listos) {
      await descargarRepresentacion(caso);
      await delay(250);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-cyan-200 bg-cyan-50 p-4 text-[12px] text-cyan-950">
        <p className="font-bold mb-1 flex items-center gap-2">
          <FileCode2 className="w-4 h-4" /> Pruebas de Simulación e-CF (Paso 4)
        </p>
        <p>
          Genera comprobantes de simulación por tipo, los firma con tu .p12 y los envía a CerteCF. El Paso 4 NO emite un xlsx — las secuencias las generamos dinámicamente. <b>Lo único que necesita DGII es la <code className="bg-white px-1 rounded">FechaVencimientoSecuencia</code></b> que registró para tu RNC (la misma que aparece en el xlsx del Paso 2).
        </p>
        <p className="mt-1">
          <b>Orden obligatorio:</b> Fase 1 (31, 32≥250K, 41, 43-47) → Fase 2 (33, 34) → Fase 3 (RFCE) → Fase 4 (32 individual manual).
        </p>
      </div>

      {/* Input de fecha de vencimiento + opcional xlsx para auto-detectar */}
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-2">
        <p className="text-[11px] font-bold text-amber-900">FechaVencimientoSecuencia</p>
        {configDgii?.ambiente && configDgii.ambiente !== CERTIFICACION_AMBIENTE && (
          <div className="rounded border border-red-200 bg-red-50 px-2 py-1.5 text-[11px] font-semibold text-red-700">
            La configuracion DGII esta en {configDgii.ambiente}. El Paso 4 oficial se autentica y envia por {CERTIFICACION_AMBIENTE}; cambia el ambiente en la configuracion y guarda antes de enviar.
          </div>
        )}
        {configDgii?.fecha_vencimiento_secuencia && !fechaVencimiento && (
          <div className="rounded border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-[11px] font-semibold text-emerald-700">
            Usando automaticamente la fecha guardada en configuracion: {configDgii.fecha_vencimiento_secuencia}
          </div>
        )}
        {configDgii?.fecha_vencimiento_secuencia && fechaVencimiento && configDgii.fecha_vencimiento_secuencia !== fechaVencimiento && (
          <div className="rounded border border-orange-200 bg-orange-50 px-2 py-1.5 text-[11px] font-semibold text-orange-700">
            Aviso: la fecha escrita ({fechaVencimiento}) no coincide con la guardada en configuracion ({configDgii.fecha_vencimiento_secuencia}). Guarda la correcta en configuracion para evitar rechazos.
          </div>
        )}
        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="text"
            value={fechaVencimiento}
            onChange={(e) => setFechaVencimiento(e.target.value)}
            placeholder={configDgii?.fecha_vencimiento_secuencia || 'DD-MM-YYYY  ej: 31-12-2028'}
            className="border border-gray-300 rounded px-3 py-1.5 text-[12px] w-48"
          />
          <span className="text-[10px] text-gray-600">o detectar automáticamente:</span>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx"
            onChange={handleFile}
            className="hidden"
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={running || consultingAll}
            className="border-blue-300 text-blue-700 hover:bg-blue-50 h-7 text-[11px]"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 mr-1.5" />
            Cargar xlsx del Paso 2
          </Button>
          {fileName && (
            <span className="text-[10px] text-emerald-700">✓ {fileName}</span>
          )}
        </div>
        <p className="text-[10px] text-amber-800">
          Se usa automaticamente la fecha guardada en Configuracion DGII. Este campo solo es necesario si quieres sobrescribirla o detectarla desde el xlsx oficial.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-[11px]">
        {Object.entries(porTipo).map(([tipo, data]) => (
          <div key={tipo} className="border rounded p-2 bg-white">
            <span className="font-bold text-slate-900">{data.ok}/{data.total}</span> Tipo {tipo}
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <Button
          onClick={correrTodos}
          disabled={running || !fechaVencimientoEfectiva}
          className="bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50"
          title={!fechaVencimientoEfectiva ? 'Guarda o carga la FechaVencimientoSecuencia' : `FechaVencimientoSecuencia: ${fechaVencimientoEfectiva}`}
        >
          {running ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Play className="w-4 h-4 mr-2" />}
          {running ? 'Enviando...' : `Enviar ${casos.length} comprobantes`}
        </Button>
        {casos.some(c => c.trackId) && (
          <Button variant="outline" onClick={consultarTodos} disabled={running || consultingAll} className="border-blue-300 text-blue-700 hover:bg-blue-100">
            {consultingAll ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Clock className="w-4 h-4 mr-2" />}
            Consultar enviados
          </Button>
        )}
        <Button variant="outline" onClick={limpiarSet} disabled={running || consultingAll} className="border-amber-300 text-amber-700 hover:bg-amber-50">
          <RotateCcw className="w-4 h-4 mr-2" /> Nueva corrida
        </Button>
        {casos.some(c => ACCEPTED_ESTADOS.has(c.estado) && getXmlFirmadoCaso(c)) && (
          <Button variant="outline" onClick={descargarRepresentacionesAceptadas} disabled={running || consultingAll} className="border-emerald-300 text-emerald-700 hover:bg-emerald-50">
            <FileText className="w-4 h-4 mr-2" /> RI aceptadas
          </Button>
        )}
        <div className="text-[12px] text-gray-600">
          <span className="font-bold text-emerald-700">{resumen.aceptados}</span> aceptados |{' '}
          <span className="font-bold text-red-700">{resumen.errores}</span> errores |{' '}
          <span className="font-bold text-gray-500">{resumen.pendientes}</span> pendientes
        </div>
      </div>

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setModal(null)}>
          <div className="bg-white rounded-lg shadow-2xl max-w-2xl w-full max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b bg-cyan-50">
              <h3 className="text-sm font-bold text-cyan-950">{modal.title}</h3>
              <button onClick={() => setModal(null)} className="text-gray-500 hover:text-gray-800 text-xl leading-none">&times;</button>
            </div>
            <textarea readOnly value={modal.content} className="m-4 h-80 font-mono text-[11px] p-2 border rounded bg-slate-50" />
          </div>
        </div>
      )}

      <div className="border rounded-lg overflow-hidden bg-white">
        <table className="w-full text-[11px]">
          <thead className="bg-gray-100 text-gray-700 uppercase text-[10px]">
            <tr>
              <th className="px-2 py-2 text-left">#</th>
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
                <tr key={caso.id} className="border-t hover:bg-gray-50">
                  <td className="px-2 py-1 text-gray-500">{idx + 1}</td>
                  <td className="px-2 py-1 font-mono">{caso.rfce ? '32 RFCE' : caso.tipo}</td>
                  <td className="px-2 py-1 font-mono">{caso.encf}</td>
                  <td className="px-2 py-1 text-gray-600">{caso.label}</td>
                  <td className="px-2 py-1">
                    <span className={`inline-flex items-center gap-1 ${meta.color}`}>
                      <Icon className="w-3.5 h-3.5" /> {meta.label}
                    </span>
                  </td>
                  <td className="px-2 py-1 font-mono text-[10px] max-w-[330px] truncate" title={caso.error || caso.trackId || ''}>
                    {caso.error ? (
                      <button className="text-red-700 hover:underline" onClick={() => setModal({ title: `Error ${caso.encf}`, content: caso.error })}>
                        {caso.error}
                      </button>
                    ) : caso.trackId || '-'}
                  </td>
                  <td className="px-2 py-1 whitespace-nowrap">
                    {caso.response && (
                      <Button variant="ghost" size="sm" onClick={() => setModal({ title: `Respuesta ${caso.encf}`, content: JSON.stringify(caso.response, null, 2) })} className="h-6 px-2 text-[10px] text-blue-700">
                        Ver
                      </Button>
                    )}
                    {caso.manualEcf?.xml_firmado && (
                      <Button variant="ghost" size="sm" onClick={() => downloadXml(caso.manualEcf.xml_firmado, caso.manualEcf.file_name || `${caso.encf}.xml`)} className="h-6 px-2 text-[10px] text-purple-700">
                        <Download className="w-3 h-3 mr-1" /> XML
                      </Button>
                    )}
                    {caso.xmlFirmado && (
                      <Button variant="ghost" size="sm" onClick={() => downloadXml(caso.xmlFirmado, caso.fileName || `${caso.encf}.xml`)} className="h-6 px-2 text-[10px] text-purple-700">
                        <Download className="w-3 h-3 mr-1" /> Enviado
                      </Button>
                    )}
                    {ACCEPTED_ESTADOS.has(caso.estado) && getXmlFirmadoCaso(caso) && (
                      <Button variant="ghost" size="sm" onClick={() => descargarRepresentacion(caso)} className="h-6 px-2 text-[10px] text-emerald-700">
                        <FileText className="w-3 h-3 mr-1" /> RI
                      </Button>
                    )}
                    {/* Solo firmar (NO enviar a DGII) — útil si el Paso 4 ya está cerrado */}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => firmarSoloCaso(caso)}
                      className="h-6 px-2 text-[10px] text-amber-700 hover:bg-amber-50"
                      title="Genera y firma el XML sin enviarlo por el servicio web. Ese XML puede no aparecer en ConsultaTimbre hasta ser recibido por DGII."
                    >
                      <Download className="w-3 h-3 mr-1" /> Solo firmar
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default DgiiSimulacionRunner;
