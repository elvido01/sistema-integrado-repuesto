import React, { useMemo, useState } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { CheckCircle2, Clock, Download, FileCode2, Loader2, Play, RotateCcw, XCircle } from 'lucide-react';

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

const encf = (tipo, seq) => `E${tipo}${String(seq).padStart(10, '0')}`;

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
        rfce: !!extra.rfce,
      });
    }
  };

  push('31', 4, 'Credito fiscal', { monto: 1180 });
  push('32', 2, 'Consumo >= 250K', { monto: 300000 });

  casos.push({
    id: '33-1',
    tipo: '33',
    label: 'Nota debito',
    encf: encf('33', seq++),
    estado: 'pending',
    monto: 590,
    referencia: { encf: casos[0].encf, fecha: fechaRef },
  });
  for (let i = 0; i < 2; i++) {
    casos.push({
      id: `34-${i + 1}`,
      tipo: '34',
      label: `Nota credito ${i + 1}`,
      encf: encf('34', seq++),
      estado: 'pending',
      monto: 590,
      referencia: { encf: casos[i + 1].encf, fecha: fechaRef },
    });
  }

  push('41', 2, 'Compras', { monto: 1180 });
  push('43', 2, 'Gastos menores', { monto: 1180 });
  push('44', 2, 'Regimen especial', { monto: 1180 });
  push('45', 2, 'Gubernamental', { monto: 1180 });
  push('46', 2, 'Exportacion', { monto: 1180 });
  push('47', 2, 'Pago exterior', { monto: 1180 });
  push('32', 4, 'Consumo < 250K RFCE', { monto: 1180, rfce: true });

  return casos;
}

const DgiiSimulacionRunner = () => {
  const { toast } = useToast();
  const [casos, setCasos] = useState(() => generarCasos());
  const [running, setRunning] = useState(false);
  const [consultingAll, setConsultingAll] = useState(false);
  const [modal, setModal] = useState(null);

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
    const { data, error } = await supabase.functions.invoke('emitir-fiscal', {
      body: { action: 'dgii_simulacion_send_case', caso },
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
    if (!confirm(`Enviar ${casos.length} comprobantes de simulacion a DGII (${CERTIFICACION_AMBIENTE})?\n\nSe usaran secuencias nuevas de esta corrida. Si reinicias las pruebas en DGII, usa "Nueva corrida" antes de reenviar.`)) return;
    setRunning(true);
    for (let i = 0; i < casos.length; i++) {
      const caso = casos[i];
      if (ACCEPTED_ESTADOS.has(caso.estado)) continue;
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
      } catch (err) {
        setCasos(prev => prev.map((c, idx) => idx === i ? { ...c, estado: 'error', error: err.message } : c));
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

  const nuevaCorrida = () => {
    if (running || consultingAll) return;
    if (!confirm('Generar una corrida nueva?\n\nEsto cambia las secuencias e-NCF locales para evitar reutilizarlas en DGII.')) return;
    setCasos(generarCasos());
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-cyan-200 bg-cyan-50 p-4 text-[12px] text-cyan-950">
        <p className="font-bold mb-1 flex items-center gap-2">
          <FileCode2 className="w-4 h-4" /> Pruebas de Simulacion e-CF (Paso 4)
        </p>
        <p>
          Genera comprobantes de simulacion por tipo, los firma con tu .p12 y los envia a CerteCF. Los Tipo 32 menores de 250K se envian como RFCE y dejan el XML completo listo para subirlo en el portal DGII.
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
        <Button onClick={correrTodos} disabled={running} className="bg-emerald-600 hover:bg-emerald-700 text-white">
          {running ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Play className="w-4 h-4 mr-2" />}
          {running ? 'Enviando...' : `Enviar ${casos.length} comprobantes`}
        </Button>
        {casos.some(c => c.trackId) && (
          <Button variant="outline" onClick={consultarTodos} disabled={running || consultingAll} className="border-blue-300 text-blue-700 hover:bg-blue-100">
            {consultingAll ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Clock className="w-4 h-4 mr-2" />}
            Consultar enviados
          </Button>
        )}
        <Button variant="outline" onClick={nuevaCorrida} disabled={running || consultingAll} className="border-amber-300 text-amber-700 hover:bg-amber-50">
          <RotateCcw className="w-4 h-4 mr-2" /> Nueva corrida
        </Button>
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
