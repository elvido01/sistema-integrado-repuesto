import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Copy, Inbox, Loader2, PlayCircle, RefreshCw, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/customSupabaseClient';

// ============================================================
// Pasos 7-11 de la certificacion DGII: servicios de RECEPTOR.
// La edge function publica `dgii-receptor` atiende las rutas fijas
// /fe/... ; aqui solo se muestran las URL a declarar en el portal,
// se corre un self-test end-to-end y se ve el log de recepciones.
// ============================================================

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://zdvxowpuklbypweyqqki.supabase.co';
const RECEPTOR_BASE = `${SUPABASE_URL.replace(/\/$/, '')}/functions/v1/dgii-receptor`;
// El portal DGII antepone "https://" y agrega el sufijo /fe/... fijo:
const BASE_SIN_PROTOCOLO = RECEPTOR_BASE.replace(/^https?:\/\//, '');

const URLS_PORTAL = [
  { label: 'Servicio de Autenticación', base: BASE_SIN_PROTOCOLO, sufijo: '/fe/autenticacion/api/[semilla|ValidacionCertificado]' },
  { label: 'Servicio de Recepción', base: BASE_SIN_PROTOCOLO, sufijo: '/fe/recepcion/api/ecf' },
  { label: 'Servicio de Aprobación Comercial', base: BASE_SIN_PROTOCOLO, sufijo: '/fe/aprobacioncomercial/api/ecf' },
];

const fmtFecha = (iso) => {
  try {
    return new Date(iso).toLocaleString('es-DO', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch (_) {
    return iso;
  }
};

const estadoBadge = (row) => {
  if (row.tipo === 'ECF') {
    return row.estado === '0'
      ? { text: 'Recibido (ARECF 0)', cls: 'bg-emerald-100 text-emerald-800' }
      : { text: `No recibido (motivo ${row.motivo || '?'})`, cls: 'bg-red-100 text-red-700' };
  }
  if (row.tipo === 'ACECF') {
    return row.estado === 'OK'
      ? { text: 'AC OK', cls: 'bg-emerald-100 text-emerald-800' }
      : { text: `AC ${row.estado}`, cls: 'bg-red-100 text-red-700' };
  }
  if (row.tipo === 'TOKEN') {
    return row.estado === 'emitido'
      ? { text: 'Token emitido', cls: 'bg-blue-100 text-blue-800' }
      : { text: 'Token rechazado', cls: 'bg-red-100 text-red-700' };
  }
  return { text: `${row.tipo} ${row.estado || ''}`.trim(), cls: 'bg-slate-100 text-slate-700' };
};

const DgiiRecepcionRunner = ({ configInfo }) => {
  const { toast } = useToast();
  const [testing, setTesting] = useState(false);
  const [pasos, setPasos] = useState([]); // { nombre, ok, detalle }
  const [recepciones, setRecepciones] = useState([]);
  const [loadingLog, setLoadingLog] = useState(false);

  const copiar = (texto, label) => {
    navigator.clipboard.writeText(texto).then(() => {
      toast({ title: 'Copiado', description: `${label}: ${texto}` });
    });
  };

  const cargarLog = useCallback(async () => {
    setLoadingLog(true);
    try {
      const { data, error } = await supabase
        .from('dgii_recepciones')
        .select('id, created_at, tipo, encf, tipo_ecf, rnc_emisor, estado, motivo, es_prueba, token_valido')
        .in('tipo', ['ECF', 'ACECF', 'TOKEN'])
        .order('created_at', { ascending: false })
        .limit(25);
      if (error) throw error;
      setRecepciones(data || []);
    } catch (err) {
      // Tabla aun no creada (falta correr sql/dgii_receptor.sql) u otro error.
      setRecepciones([]);
      console.warn('dgii_recepciones:', err.message);
    } finally {
      setLoadingLog(false);
    }
  }, []);

  useEffect(() => { cargarLog(); }, [cargarLog]);

  const selfTest = async () => {
    setTesting(true);
    const resultados = [];
    const rnc = String(configInfo?.rnc_emisor || '').replace(/\D/g, '');
    try {
      // 1. Semilla
      const rSemilla = await fetch(`${RECEPTOR_BASE}/fe/autenticacion/api/semilla`, { headers: { 'x-selftest': '1' } });
      const semillaXml = await rSemilla.text();
      const okSemilla = rSemilla.ok && semillaXml.includes('<valor>');
      resultados.push({ nombre: '1. Semilla (GET /fe/autenticacion/api/semilla)', ok: okSemilla, detalle: okSemilla ? 'SemillaModel con valor y fecha' : `HTTP ${rSemilla.status}: ${semillaXml.slice(0, 160)}` });
      if (!okSemilla) throw new Error('semilla');

      // 2. Token (la DGII firmaria la semilla; el HMAC del valor es lo que validamos)
      const fdTok = new FormData();
      fdTok.append('xml', new Blob([semillaXml], { type: 'text/xml' }), 'semilla_firmada.xml');
      const rTok = await fetch(`${RECEPTOR_BASE}/fe/autenticacion/api/validacioncertificado`, { method: 'POST', body: fdTok, headers: { 'x-selftest': '1' } });
      const tokJson = await rTok.json().catch(() => ({}));
      const okTok = rTok.ok && !!tokJson.token;
      resultados.push({ nombre: '2. Token (POST /fe/autenticacion/api/validacioncertificado)', ok: okTok, detalle: okTok ? `token emitido · expira ${tokJson.expira}` : `HTTP ${rTok.status}: ${JSON.stringify(tokJson).slice(0, 160)}` });
      if (!okTok) throw new Error('token');

      // 3. Recepcion e-CF (XML minimo tipo 31 dirigido a nuestro RNC)
      const fakeEcf =
        `<?xml version="1.0" encoding="utf-8"?>` +
        `<ECF xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><Encabezado><Version>1.0</Version>` +
        `<IdDoc><TipoeCF>31</TipoeCF><eNCF>E31${String(Date.now()).slice(-10)}</eNCF></IdDoc>` +
        `<Emisor><RNCEmisor>999999999</RNCEmisor></Emisor>` +
        `<Comprador><RNCComprador>${rnc}</RNCComprador></Comprador></Encabezado>` +
        `<Signature xmlns="http://www.w3.org/2000/09/xmldsig#"><SignatureValue>SELFTEST</SignatureValue></Signature></ECF>`;
      const fdEcf = new FormData();
      fdEcf.append('xml', new Blob([fakeEcf], { type: 'text/xml' }), 'ecf_selftest.xml');
      const rEcf = await fetch(`${RECEPTOR_BASE}/fe/recepcion/api/ecf`, {
        method: 'POST', body: fdEcf,
        headers: { 'x-selftest': '1', Authorization: `Bearer ${tokJson.token}` },
      });
      const arecf = await rEcf.text();
      const estadoM = arecf.match(/<Estado>(\d)<\/Estado>/);
      const okEcf = rEcf.ok && !!estadoM && arecf.includes('<SignatureValue>');
      resultados.push({
        nombre: '3. Recepción e-CF → ARECF firmado (POST /fe/recepcion/api/ecf)',
        ok: okEcf && estadoM?.[1] === '0',
        detalle: okEcf
          ? `ARECF Estado ${estadoM[1]}${estadoM[1] === '0' ? ' (e-CF Recibido) · firmado con el certificado del tenant' : ' — revisar motivo'}`
          : `HTTP ${rEcf.status}: ${arecf.slice(0, 200)}`,
      });

      // 4. Aprobacion comercial
      const fakeAc =
        `<?xml version="1.0" encoding="utf-8"?>` +
        `<ACECF><DetalleAprobacionComercial><Version>1.0</Version>` +
        `<RNCEmisor>${rnc}</RNCEmisor><RNCComprador>999999999</RNCComprador>` +
        `<eNCF>E31SELFTEST0001</eNCF><Estado>1</Estado></DetalleAprobacionComercial></ACECF>`;
      const fdAc = new FormData();
      fdAc.append('xml', new Blob([fakeAc], { type: 'text/xml' }), 'acecf_selftest.xml');
      const rAc = await fetch(`${RECEPTOR_BASE}/fe/aprobacioncomercial/api/ecf`, {
        method: 'POST', body: fdAc,
        headers: { 'x-selftest': '1', Authorization: `Bearer ${tokJson.token}` },
      });
      const acJson = await rAc.json().catch(() => ({}));
      const okAc = rAc.ok && acJson.estado === 'OK';
      resultados.push({ nombre: '4. Aprobación Comercial (POST /fe/aprobacioncomercial/api/ecf)', ok: okAc, detalle: okAc ? 'respuesta {"estado":"OK"}' : `HTTP ${rAc.status}: ${JSON.stringify(acJson).slice(0, 160)}` });

      const todos = resultados.every(r => r.ok);
      toast({
        title: todos ? 'Receptor funcionando ✔' : 'Self-test con fallos',
        description: todos ? 'Los 4 servicios respondieron correctamente.' : 'Revisa el detalle de cada paso.',
        variant: todos ? 'default' : 'destructive',
      });
    } catch (_) {
      toast({ title: 'Self-test detenido', description: 'Un paso previo falló; revisa el detalle.', variant: 'destructive' });
    } finally {
      setPasos(resultados);
      setTesting(false);
      cargarLog();
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-4 text-[12px] text-indigo-950">
        <p className="font-bold mb-1 flex items-center gap-2">
          <Inbox className="w-4 h-4" /> Pasos 7-11: Servicios de Receptor (Recepción e-CF y Aprobación Comercial)
        </p>
        <p>
          En el Paso 7 (y luego en el 12 para producción) el portal DGII pide la <b>base</b> de cada servicio — el sufijo <code>/fe/...</code> lo agrega el portal.
          En los pasos 8-11 la DGII envía e-CF y Aprobaciones Comerciales de prueba a estas URL y este sistema responde solo
          (ARECF firmado para e-CF, «OK» para aprobaciones). Antes de marcar «listo para recepción» en el portal, corre el self-test.
        </p>
      </div>

      <div className="border rounded-lg bg-white p-3 space-y-2">
        <p className="text-[11px] font-bold text-slate-700 uppercase">URLs para pegar en el portal DGII (Paso 7 y Paso 12)</p>
        {URLS_PORTAL.map((u) => (
          <div key={u.label} className="flex items-center justify-between gap-2 text-[11px] border rounded p-2">
            <div className="min-w-0">
              <p className="font-bold text-slate-800">{u.label}</p>
              <p className="font-mono text-slate-600 break-all">https:// <b className="text-indigo-700">{u.base}</b> <span className="text-slate-400">{u.sufijo}</span></p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => copiar(u.base, u.label)} className="h-7 px-2 text-[10px] shrink-0">
              <Copy className="w-3 h-3 mr-1" /> Copiar base
            </Button>
          </div>
        ))}
        <p className="text-[10px] text-slate-500">
          En el campo del portal se escribe solo la parte en azul (sin «https://», el portal ya lo antepone).
        </p>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <Button onClick={selfTest} disabled={testing} className="bg-indigo-600 hover:bg-indigo-700 text-white">
          {testing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <PlayCircle className="w-4 h-4 mr-2" />}
          Probar receptor (semilla → token → e-CF → AC)
        </Button>
        <Button variant="outline" onClick={cargarLog} disabled={loadingLog} className="border-slate-300 text-slate-700">
          {loadingLog ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
          Refrescar log
        </Button>
      </div>

      {pasos.length > 0 && (
        <div className="border rounded-lg bg-white p-3 space-y-1.5">
          <p className="text-[11px] font-bold text-slate-700 uppercase">Resultado del self-test</p>
          {pasos.map((p) => (
            <div key={p.nombre} className="flex items-start gap-2 text-[11px]">
              {p.ok
                ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 mt-0.5 shrink-0" />
                : <XCircle className="w-3.5 h-3.5 text-red-600 mt-0.5 shrink-0" />}
              <div className="min-w-0">
                <p className="font-bold text-slate-800">{p.nombre}</p>
                <p className={`break-all ${p.ok ? 'text-slate-600' : 'text-red-700'}`}>{p.detalle}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="border rounded-lg bg-white p-3">
        <p className="text-[11px] font-bold text-slate-700 uppercase mb-2">
          Últimas recepciones {recepciones.length ? `(${recepciones.length})` : ''}
        </p>
        {recepciones.length === 0 ? (
          <p className="text-[11px] text-slate-500">
            Sin registros todavía. (Si nunca corriste 📄 sql/dgii_receptor.sql en el SQL Editor, la tabla no existe y el log quedará vacío.)
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="text-left text-slate-500 border-b">
                  <th className="py-1 pr-2">Fecha</th>
                  <th className="py-1 pr-2">Tipo</th>
                  <th className="py-1 pr-2">e-NCF</th>
                  <th className="py-1 pr-2">RNC Emisor</th>
                  <th className="py-1 pr-2">Resultado</th>
                </tr>
              </thead>
              <tbody>
                {recepciones.map((r) => {
                  const badge = estadoBadge(r);
                  return (
                    <tr key={r.id} className="border-b last:border-b-0">
                      <td className="py-1 pr-2 whitespace-nowrap font-mono">{fmtFecha(r.created_at)}</td>
                      <td className="py-1 pr-2 font-bold">{r.tipo}{r.tipo_ecf ? ` (${r.tipo_ecf})` : ''}</td>
                      <td className="py-1 pr-2 font-mono">{r.encf || '-'}</td>
                      <td className="py-1 pr-2 font-mono">{r.rnc_emisor || '-'}</td>
                      <td className="py-1 pr-2">
                        <span className={`px-1.5 py-0.5 rounded font-bold ${badge.cls}`}>{badge.text}</span>
                        {r.es_prueba && <span className="ml-1 px-1 py-0.5 rounded bg-amber-100 text-amber-800 font-bold">TEST</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default DgiiRecepcionRunner;
