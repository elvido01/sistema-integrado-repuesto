import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, ExternalLink, FileText, Loader2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/customSupabaseClient';
import { DGII_SIMULACION_STATE_EVENT, loadDgiiSimulacionState } from '@/lib/dgiiCertificacionStorage';
import { downloadRepresentacionImpresa, downloadRepresentacionImpresaFromData, getRepresentacionQrUrl, parseEcfXml } from '@/lib/dgiiRepresentacionImpresa';

const ACCEPTED_ESTADOS = new Set(['aceptado', 'aceptado_condicional']);

const REQUERIDOS_PASO_5 = [
  { key: '31', label: 'Tipo 31' },
  { key: '32_mayor', label: 'Tipo 32 >= RD$250mil', match: (d) => d.tipo === '32' && Number(d.montoTotal) >= 250000 },
  { key: '33', label: 'Tipo 33' },
  { key: '34', label: 'Tipo 34' },
  { key: '41', label: 'Tipo 41' },
  { key: '43', label: 'Tipo 43' },
  { key: '44', label: 'Tipo 44' },
  { key: '45', label: 'Tipo 45' },
  { key: '46', label: 'Tipo 46' },
  { key: '47', label: 'Tipo 47' },
  { key: '32_menor', label: 'Tipo 32 < RD$250mil', match: (d) => d.tipo === '32' && Number(d.montoTotal) < 250000 },
];

const xmlFromCaso = (caso) => caso?.manualEcf?.xml_firmado || caso?.xmlFirmado || '';

const getSlotForData = (data) => REQUERIDOS_PASO_5.find(req => req.match ? req.match(data) : data.tipo === req.key);

const getSlotFileName = (slot) => `${slot.key}_${slot.label.replace(/[^\w]+/g, '_')}_${slot.data.encf}_RI.pdf`;

const normalizeText = (value) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase();

const numberFromValue = (value) => Number(String(value || '').replace(/,/g, '')) || 0;

const normalizeDgiiStatus = (payload) => {
  if (payload && typeof payload.response === 'string') {
    const response = payload.response.trim().toLowerCase();
    if (response.includes('aceptado cond')) return { estado: 'aceptado_condicional', mensaje: payload.response };
    if (response.includes('aceptado')) return { estado: 'aceptado', mensaje: payload.response };
    if (response.includes('rechaz')) return { estado: 'rechazado', mensaje: payload.response };
  }

  const estadoPayload = payload?.estado || payload || {};
  const rawEstado = String(estadoPayload.estado || estadoPayload.Estado || '').trim().toLowerCase();
  const mensajes = estadoPayload.mensajes || estadoPayload.Mensajes || [];
  const mensaje = Array.isArray(mensajes)
    ? mensajes.map(m => `${m.codigo || m.Codigo || ''} ${m.valor || m.Valor || ''}`.trim()).filter(Boolean).join(' | ')
    : String(mensajes || '');

  if (rawEstado.includes('aceptado cond')) return { estado: 'aceptado_condicional', mensaje };
  if (rawEstado.includes('aceptado')) return { estado: 'aceptado', mensaje };
  if (rawEstado.includes('rechaz')) return { estado: 'rechazado', mensaje: mensaje || rawEstado };
  if (rawEstado.includes('proces') || rawEstado.includes('pend') || rawEstado.includes('recib')) return { estado: 'enviado', mensaje };
  return { estado: rawEstado || 'enviado', mensaje };
};

const montoFromCaso = (caso) => {
  const row = caso?.row || {};
  return numberFromValue(
    caso?.monto
    || caso?.monto_total
    || row.MontoTotal
    || row['Monto Total']
    || row.Monto
  );
};

const caseMatchesSlot = (caso, slot) => {
  const tipo = String(caso?.tipo || '').trim();
  const monto = montoFromCaso(caso);
  const label = normalizeText(`${caso?.label || ''} ${caso?.row?.CasoPrueba || ''}`);
  const esMayor250 = monto >= 250000 || label.includes('>= 250') || label.includes('mayor');
  const esMenor250 = caso?.rfce || (monto > 0 && monto < 250000) || label.includes('< 250') || label.includes('menor');
  if (slot.key === '32_mayor') return tipo === '32' && !caso?.rfce && esMayor250;
  if (slot.key === '32_menor') return tipo === '32' && esMenor250;
  return tipo === slot.key;
};

const pickCaseForSlot = (casos, slot) => {
  const matches = casos.filter(caso => caseMatchesSlot(caso, slot));
  if (slot.key === '32_menor') return matches.find(caso => caso.rfce) || matches[0] || null;
  return matches[0] || null;
};

const buildSlots = (casos, manualXmls = []) => {
  const accepted = casos
    .filter(c => ACCEPTED_ESTADOS.has(c.estado) && xmlFromCaso(c))
    .map((caso) => {
      try {
        return { source: 'caso', caso, xml: xmlFromCaso(caso), data: parseEcfXml(xmlFromCaso(caso)), trackId: caso.trackId || null };
      } catch (_) {
        return null;
      }
    })
    .filter(Boolean);

  const manuales = manualXmls.map((entry) => ({
    source: 'manual',
    caso: null,
    xml: entry.xml,
    data: entry.data,
    trackId: entry.trackId || null,
    fileName: entry.fileName,
    sourceCaseLabel: entry.sourceCaseLabel,
  }));

  const disponibles = [...accepted, ...manuales];

  return REQUERIDOS_PASO_5.map((req) => {
    const found = disponibles.find(({ data }) => req.match ? req.match(data) : data.tipo === req.key);
    return { ...req, entry: found || null, caso: found?.caso || null, data: found?.data || null, xml: found?.xml || '' };
  });
};

const DgiiRepresentacionImpresaRunner = ({ configInfo }) => {
  const { toast } = useToast();
  const ambienteQr = configInfo?.ambiente || 'CerteCF';
  const inputRef = useRef(null);
  const pad = (n) => String(n).padStart(2, '0');
  const today = new Date();
  const todayDgii = `${pad(today.getDate())}-${pad(today.getMonth() + 1)}-${today.getFullYear()}`;
  const [manualXmls, setManualXmls] = useState([]);
  const [trackChecks, setTrackChecks] = useState({});
  const [saved, setSaved] = useState(() => loadDgiiSimulacionState());
  const [preparingAuto, setPreparingAuto] = useState(false);
  const [manualData, setManualData] = useState({
    tipo: '31',
    encf: '',
    fechaEmision: todayDgii,
    montoTotal: '1180.00',
    fechaFirma: '',
    codigoSeguridad: '',
    rncComprador: '131880681',
    razonSocialComprador: 'COMPRADOR CERTIFICACION SRL',
  });
  const [generating, setGenerating] = useState(false);
  const casos = saved?.casos || [];

  useEffect(() => {
    const refreshSaved = () => setSaved(loadDgiiSimulacionState());
    window.addEventListener(DGII_SIMULACION_STATE_EVENT, refreshSaved);
    window.addEventListener('storage', refreshSaved);
    window.addEventListener('focus', refreshSaved);
    return () => {
      window.removeEventListener(DGII_SIMULACION_STATE_EVENT, refreshSaved);
      window.removeEventListener('storage', refreshSaved);
      window.removeEventListener('focus', refreshSaved);
    };
  }, []);

  const slots = useMemo(() => buildSlots(casos, manualXmls), [casos, manualXmls]);
  const completos = slots.filter(s => s.entry).length;
  const paso4Completado = saved?.paso4Completado || (casos.length > 0 && casos.every(c => ACCEPTED_ESTADOS.has(c.estado)));

  const seleccionAutomatica = useMemo(() => (
    REQUERIDOS_PASO_5.map((req) => {
      const slot = slots.find(s => s.key === req.key);
      return { ...req, entry: slot?.entry || null, caso: pickCaseForSlot(casos, req) };
    })
  ), [casos, slots]);

  const handleManualXml = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const loaded = [];
    for (const file of files) {
      if (!file.name.toLowerCase().endsWith('.xml')) continue;
      try {
        const xml = await file.text();
        const data = parseEcfXml(xml);
        loaded.push({ xml, data, fileName: file.name });
      } catch (err) {
        toast({ title: `No se pudo leer ${file.name}`, description: err.message, variant: 'destructive' });
      }
    }
    if (loaded.length) {
      setManualXmls(prev => [...prev, ...loaded]);
      toast({ title: 'XML cargados', description: `${loaded.length} XML firmado(s) listos para generar RI.` });
    }
    e.target.value = '';
  };

  const descargarSlot = async (slot) => {
    if (!slot.xml) return;
    await downloadRepresentacionImpresa(slot.xml, {
      fileName: getSlotFileName(slot),
      ambiente: ambienteQr,
    });
  };

  const abrirQrDgii = (data) => {
    if (!data) return;
    window.open(getRepresentacionQrUrl({ ...data, ambiente: ambienteQr }), '_blank', 'noopener,noreferrer');
  };

  const hasConsultaTimbreRisk = (entry) => {
    if (!entry) return false;
    return ambienteQr !== 'Produccion' && !entry.trackId;
  };

  const descargarTodas = async () => {
    setGenerating(true);
    try {
      for (const slot of slots.filter(s => s.entry)) {
        await descargarSlot(slot);
        await new Promise(resolve => setTimeout(resolve, 250));
      }
      toast({ title: 'RI generadas', description: 'Sube esos PDF en las casillas del Paso 5 de DGII.' });
    } catch (err) {
      toast({ title: 'No se pudieron generar todas', description: err.message, variant: 'destructive' });
    } finally {
      setGenerating(false);
    }
  };

  const descargarManual = async (entry) => {
    const slot = getSlotForData(entry.data);
    const prefix = slot ? `${slot.key}_${slot.label.replace(/[^\w]+/g, '_')}` : `Tipo_${entry.data.tipo}`;
    await downloadRepresentacionImpresa(entry.xml, { fileName: `${prefix}_${entry.data.encf}_RI.pdf`, ambiente: ambienteQr });
  };

  const prepararAutomaticoPaso5 = async () => {
    const slotsConEntry = slots.filter(s => s.entry);
    if (!casos.length && !slotsConEntry.length) {
      toast({ title: 'No hay casos del Paso 4', description: 'Primero carga/genera los casos de simulacion del Paso 4.', variant: 'destructive' });
      return;
    }

    if (slotsConEntry.length === REQUERIDOS_PASO_5.length) {
      toast({
        title: 'Paso 5 ya preparado',
        description: 'Las 11 representaciones impresas ya estan listas. Usa "Descargar RI disponibles".',
      });
      return;
    }

    const faltantes = seleccionAutomatica.filter(slot => !slot.entry && !slot.caso);
    if (faltantes.length) {
      toast({
        title: 'Faltan casos para Paso 5',
        description: `No encontre: ${faltantes.map(s => s.label).join(', ')}.`,
        variant: 'destructive',
      });
      return;
    }

    setPreparingAuto(true);
    try {
      const loaded = [];
      for (const slot of seleccionAutomatica) {
        if (slot.entry) {
          loaded.push({
            xml: slot.entry.xml,
            data: slot.entry.data,
            fileName: slot.entry.fileName || getSlotFileName({ ...slot, data: slot.entry.data }),
            sourceCaseLabel: slot.entry.sourceCaseLabel,
            trackId: slot.entry.trackId || null,
          });
          continue;
        }

        const caso = slot.caso;
        const existingXml = xmlFromCaso(caso);
        if (existingXml) {
          const data = parseEcfXml(existingXml);
          loaded.push({
            xml: existingXml,
            data,
            fileName: getSlotFileName({ ...slot, data }),
            sourceCaseLabel: caso.label,
            trackId: caso.trackId || null,
          });
          continue;
        }

        const { data, error } = await supabase.functions.invoke('emitir-fiscal', {
          body: {
            action: 'dgii_simulacion_send_case',
            caso: {
              ...caso,
              fecha_vencimiento_secuencia: configInfo?.fecha_vencimiento_secuencia || caso.fecha_vencimiento_secuencia,
              sign_only: true,
            },
          },
        });

        if (error) throw new Error(error.message || `No se pudo firmar ${caso.encf}`);
        if (!data?.ok || !data?.xml_firmado) throw new Error(data?.error || `No se pudo firmar ${caso.encf}`);

        const parsed = parseEcfXml(data.xml_firmado);
        loaded.push({
          xml: data.xml_firmado,
          data: parsed,
          fileName: data.file_name || getSlotFileName({ ...slot, data: parsed }),
          sourceCaseLabel: caso.label,
        });
      }

      setManualXmls(loaded);
      toast({ title: 'RI preparadas automaticamente', description: `${loaded.length} XML firmados listos. Ahora usa "Descargar RI disponibles".` });
    } catch (err) {
      toast({ title: 'No se pudo preparar Paso 5', description: err.message, variant: 'destructive' });
    } finally {
      setPreparingAuto(false);
    }
  };

  const generarManualPorTimbre = async () => {
    try {
      const rncEmisor = configInfo?.rnc_emisor || casos.find(c => c.response?.rnc)?.response?.rnc || '';
      const faltantes = [];
      if (!rncEmisor) faltantes.push('RNC emisor');
      if (!manualData.encf) faltantes.push('e-NCF aceptado');
      if (!manualData.fechaFirma) faltantes.push('FechaFirma');
      if (!manualData.codigoSeguridad) faltantes.push('CodigoSeguridad');
      if (!manualData.montoTotal) faltantes.push('MontoTotal');
      if (faltantes.length) {
        throw new Error(`Faltan: ${faltantes.join(', ')}. Si tienes el XML firmado, usa "Cargar XML firmados" y se llenan solos.`);
      }
      await downloadRepresentacionImpresaFromData({
        ...manualData,
        ambiente: ambienteQr,
        rncEmisor,
        razonSocialEmisor: configInfo?.nombre_emisor || 'D MARIO CASTRO TERMINACIONES & ALGO MAS SRL',
        nombreComercial: configInfo?.nombre_emisor || 'D MARIO CASTRO TERMINACIONES & ALGO MAS',
        direccionEmisor: 'C/Duarte esq. Baldomero Rijo',
      }, { fileName: `${manualData.encf || 'ECF'}_RI.pdf` });
    } catch (err) {
      toast({ title: 'No se pudo generar la RI', description: err.message, variant: 'destructive' });
    }
  };

  const confirmarRecepcionDgii = async (entry) => {
    if (!entry?.trackId) {
      toast({
        title: 'Sin TrackId DGII',
        description: 'Este XML/RI no tiene constancia local de recepcion por servicio web. ConsultaTimbre probablemente no lo encontrara.',
        variant: 'destructive',
      });
      return;
    }

    const key = entry.data?.encf || entry.trackId;
    setTrackChecks(prev => ({ ...prev, [key]: { loading: true } }));
    try {
      const { data, error } = await supabase.functions.invoke('emitir-fiscal', {
        body: { action: 'dgii_certif_check_status', ambiente: ambienteQr, track_id: entry.trackId },
      });
      if (error) throw new Error(error.message || 'No se pudo consultar el TrackId.');

      const normalized = normalizeDgiiStatus(data);
      setTrackChecks(prev => ({ ...prev, [key]: { loading: false, ...normalized, raw: data } }));
      toast({
        title: `DGII: ${normalized.estado}`,
        description: normalized.mensaje || `TrackId ${entry.trackId}`,
        variant: normalized.estado === 'rechazado' ? 'destructive' : 'default',
      });
    } catch (err) {
      setTrackChecks(prev => ({ ...prev, [key]: { loading: false, estado: 'error', mensaje: err.message } }));
      toast({ title: 'Error consultando DGII', description: err.message, variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-[12px] text-emerald-950">
        <p className="font-bold mb-1 flex items-center gap-2">
          <FileText className="w-4 h-4" /> Paso 5: Representacion Impresa
        </p>
        <p>
          Genera los PDF de Representacion Impresa desde los XML firmados aceptados en el Paso 4. Cada PDF incluye el QR de consulta DGII y debe subirse en la casilla correspondiente del portal.
        </p>
        <p className="mt-1">
          Estado local Paso 4: <b className={paso4Completado ? 'text-emerald-700' : 'text-amber-700'}>{paso4Completado ? 'aprobado / completo' : 'sin corrida completa guardada'}</b>. RI disponibles: <b>{completos}/{REQUERIDOS_PASO_5.length}</b>.
        </p>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <Button onClick={prepararAutomaticoPaso5} disabled={preparingAuto} className="bg-blue-700 hover:bg-blue-800 text-white">
          {preparingAuto ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
          Preparar Paso 5 automatico
        </Button>
        <Button onClick={descargarTodas} disabled={generating || completos === 0} className="bg-emerald-600 hover:bg-emerald-700 text-white">
          {generating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileText className="w-4 h-4 mr-2" />}
          Descargar RI disponibles
        </Button>
        <input ref={inputRef} type="file" accept=".xml" multiple className="hidden" onChange={handleManualXml} />
        <Button variant="outline" onClick={() => inputRef.current?.click()} className="border-blue-300 text-blue-700 hover:bg-blue-50">
          <Upload className="w-4 h-4 mr-2" /> Cargar XML firmados
        </Button>
      </div>

      <div className="rounded border border-blue-100 bg-blue-50 p-3 text-[11px] text-blue-950">
        <p className="font-bold mb-1">Seleccion automatica para las casillas DGII</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-1">
          {seleccionAutomatica.map(slot => (
            <p key={slot.key} className="font-mono">
              {slot.label}: {slot.entry
                ? `${slot.entry.data.encf} listo${slot.entry.source === 'manual' ? ' (manual)' : ''}`
                : slot.caso
                  ? `${slot.caso.label} - ${slot.caso.encf}`
                  : 'no encontrado'}
            </p>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px]">
        {slots.map((slot) => {
          const checkKey = slot.entry?.data?.encf || slot.entry?.trackId;
          const check = checkKey ? trackChecks[checkKey] : null;
          return (
          <div key={slot.key} className={`border rounded p-2 bg-white flex items-center justify-between gap-2 ${slot.entry ? 'border-emerald-200' : 'border-gray-200'}`}>
            <div>
              <p className="font-bold text-slate-800">{slot.label}</p>
              <p className={slot.entry ? 'text-emerald-700' : 'text-gray-500'}>
                {slot.entry ? `${slot.data.encf} listo${slot.entry.sourceCaseLabel ? ` (${slot.entry.sourceCaseLabel})` : slot.entry.source === 'manual' ? ' (manual)' : ''}` : 'pendiente de XML aceptado'}
              </p>
              {slot.entry && (
                <p className="mt-1 text-[10px] font-mono text-slate-500">
                  PDF: {getSlotFileName(slot)}
                </p>
              )}
              {slot.entry && (
                <p className={`mt-1 text-[10px] font-mono ${slot.entry.trackId ? 'text-blue-700' : 'text-amber-700'}`}>
                  TrackId: {slot.entry.trackId || 'SIN TRACKID'}
                </p>
              )}
              {check && !check.loading && (
                <p className={`mt-1 text-[10px] font-semibold ${check.estado === 'rechazado' || check.estado === 'error' ? 'text-red-700' : check.estado?.includes('aceptado') ? 'text-emerald-700' : 'text-blue-700'}`}>
                  Estado DGII: {check.estado}{check.mensaje ? ` - ${check.mensaje}` : ''}
                </p>
              )}
              {hasConsultaTimbreRisk(slot.entry) && (
                <p className="mt-1 max-w-md text-[10px] font-semibold text-amber-700">
                  Sin TrackId local. ConsultaTimbre solo encuentra e-CF recibidos por el servicio web de DGII.
                </p>
              )}
            </div>
            {slot.entry && (
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="sm" onClick={() => abrirQrDgii(slot.data)} className="h-7 px-2 text-[10px] text-blue-700">
                  <ExternalLink className="w-3 h-3 mr-1" /> QR
                </Button>
                <Button variant="ghost" size="sm" onClick={() => confirmarRecepcionDgii(slot.entry)} disabled={check?.loading} className="h-7 px-2 text-[10px] text-slate-700">
                  {check?.loading ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <CheckCircle2 className="w-3 h-3 mr-1" />}
                  DGII
                </Button>
                <Button variant="ghost" size="sm" onClick={() => descargarSlot(slot)} className="h-7 px-2 text-[10px] text-emerald-700">
                  <FileText className="w-3 h-3 mr-1" /> RI
                </Button>
              </div>
            )}
          </div>
          );
        })}
      </div>

      {manualXmls.length > 0 && (
        <div className="border rounded-lg bg-white p-3 space-y-2">
          <p className="text-[11px] font-bold text-slate-700 uppercase">XML cargados manualmente - verificacion antes de subir</p>
          {manualXmls.map((entry, idx) => (
            <div key={`${entry.fileName}-${idx}`} className="text-[11px] border-t first:border-t-0 py-2 space-y-2">
              {(() => {
                const slot = getSlotForData(entry.data);
                const qrUrl = getRepresentacionQrUrl({ ...entry.data, ambiente: ambienteQr });
                const checkKey = entry.data?.encf || entry.trackId;
                const check = checkKey ? trackChecks[checkKey] : null;
                return (
                  <>
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="font-bold text-emerald-700 flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Cargar en DGII: {slot?.label || `Tipo ${entry.data.tipo}`}
                        </p>
                        <p className="font-mono text-slate-700 break-all">
                          Archivo XML: {entry.fileName || '-'}
                        </p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-x-3 gap-y-1 font-mono text-slate-700">
                      <span>Tipo: {entry.data.tipo}</span>
                      <span>e-NCF: {entry.data.encf}</span>
                      <span>Monto: RD$ {entry.data.montoTotal}</span>
                      <span>Fecha: {entry.data.fechaEmision || '-'}</span>
                      <span>RNC Emisor: {entry.data.rncEmisor || '-'}</span>
                      <span>RNC Comprador: {entry.data.rncComprador || entry.data.identificadorExtranjero || '-'}</span>
                      <span>Fecha Firma: {entry.data.fechaFirma || '-'}</span>
                      <span>Seguridad: {entry.data.codigoSeguridad || '-'}</span>
                      <span>TrackId: {entry.trackId || 'SIN TRACKID'}</span>
                    </div>
                    {check && !check.loading && (
                      <p className={`text-[10px] font-semibold ${check.estado === 'rechazado' || check.estado === 'error' ? 'text-red-700' : check.estado?.includes('aceptado') ? 'text-emerald-700' : 'text-blue-700'}`}>
                        Estado DGII: {check.estado}{check.mensaje ? ` - ${check.mensaje}` : ''}
                      </p>
                    )}
                    <p className="font-mono text-[10px] text-slate-500 break-all">
                      QR: {qrUrl}
                    </p>
                  </>
                );
              })()}
              <span className="font-mono">{entry.data.encf} · Tipo {entry.data.tipo} · RD$ {entry.data.montoTotal}</span>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="sm" onClick={() => abrirQrDgii(entry.data)} className="h-7 px-2 text-[10px] text-blue-700 shrink-0">
                  <ExternalLink className="w-3 h-3 mr-1" /> Probar QR
                </Button>
                <Button variant="ghost" size="sm" onClick={() => confirmarRecepcionDgii(entry)} disabled={trackChecks[entry.data?.encf || entry.trackId]?.loading} className="h-7 px-2 text-[10px] text-slate-700 shrink-0">
                  {trackChecks[entry.data?.encf || entry.trackId]?.loading ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <CheckCircle2 className="w-3 h-3 mr-1" />}
                  DGII
                </Button>
                <Button variant="ghost" size="sm" onClick={() => descargarManual(entry)} className="h-7 px-2 text-[10px] text-emerald-700 shrink-0">
                  <FileText className="w-3 h-3 mr-1" /> RI
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="border rounded-lg bg-white p-3 space-y-3">
        <div>
          <p className="text-[11px] font-bold text-slate-700 uppercase">Generar RI por datos del timbre</p>
          <p className="text-[11px] text-amber-700">
            Usa esto solo si no tienes el XML en esta pantalla. FechaFirma es la etiqueta <code>FechaHoraFirma</code> del XML aceptado, no la FechaVencimientoSecuencia. CodigoSeguridad son los primeros 6 caracteres de <code>SignatureValue</code>.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
          <label className="space-y-1">
            <span className="text-[10px] font-bold text-slate-600">Tipo e-CF</span>
            <Input value={manualData.tipo} onChange={(e) => setManualData(s => ({ ...s, tipo: e.target.value }))} placeholder="31" />
          </label>
          <label className="space-y-1">
            <span className="text-[10px] font-bold text-slate-600">e-NCF aceptado</span>
            <Input value={manualData.encf} onChange={(e) => setManualData(s => ({ ...s, encf: e.target.value }))} placeholder="E310001969784" />
          </label>
          <label className="space-y-1">
            <span className="text-[10px] font-bold text-slate-600">FechaEmision</span>
            <Input value={manualData.fechaEmision} onChange={(e) => setManualData(s => ({ ...s, fechaEmision: e.target.value }))} placeholder="16-05-2026" />
          </label>
          <label className="space-y-1">
            <span className="text-[10px] font-bold text-slate-600">MontoTotal</span>
            <Input value={manualData.montoTotal} onChange={(e) => setManualData(s => ({ ...s, montoTotal: e.target.value }))} placeholder="1180.00" />
          </label>
          <label className="space-y-1">
            <span className="text-[10px] font-bold text-slate-600">FechaFirma / FechaHoraFirma</span>
            <Input value={manualData.fechaFirma} onChange={(e) => setManualData(s => ({ ...s, fechaFirma: e.target.value }))} placeholder="16-05-2026 22:16:40" />
          </label>
          <label className="space-y-1">
            <span className="text-[10px] font-bold text-slate-600">CodigoSeguridad</span>
            <Input value={manualData.codigoSeguridad} onChange={(e) => setManualData(s => ({ ...s, codigoSeguridad: e.target.value }))} placeholder="Primeros 6 de SignatureValue" />
          </label>
          <label className="space-y-1">
            <span className="text-[10px] font-bold text-slate-600">RNC comprador</span>
            <Input value={manualData.rncComprador} onChange={(e) => setManualData(s => ({ ...s, rncComprador: e.target.value }))} placeholder="131880681" />
          </label>
          <label className="space-y-1">
            <span className="text-[10px] font-bold text-slate-600">Razon comprador</span>
            <Input value={manualData.razonSocialComprador} onChange={(e) => setManualData(s => ({ ...s, razonSocialComprador: e.target.value }))} placeholder="COMPRADOR CERTIFICACION SRL" />
          </label>
        </div>
        <Button onClick={generarManualPorTimbre} variant="outline" className="border-emerald-300 text-emerald-700 hover:bg-emerald-50">
          <FileText className="w-4 h-4 mr-2" /> Generar RI manual
        </Button>
      </div>
    </div>
  );
};

export default DgiiRepresentacionImpresaRunner;
