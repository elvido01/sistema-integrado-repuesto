// =====================================================================
// Caja del Colegio (centros educativos, 06/11/2026)
// ---------------------------------------------------------------------
// Se busca al estudiante o a la familia y salen TODOS los hermanos con lo
// que deben: a ese padre se le cobra por sus hijos de una vez. Se marca qué
// se paga (la mensualidad completa o la mitad; el año completo con su
// descuento; el Sistema Bilingüe en US$ a la tasa del día), las formas de
// pago, y sale el recibo en ticket o en hoja con la tarjeta del año.
// Todo lo hace la base en una sola transacción (edu_cobrar): el cobro
// también crea el Recibo de Ingreso normal → entra solo en el Cierre de Caja.
// SQL: sql/centros_educativos_caja.sql
// =====================================================================
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet';
import { Wallet, Search, Loader2, Printer, Plus, Trash2, Ban, RefreshCw, CalendarPlus, CalendarCheck, FileText, X, UserMinus } from 'lucide-react';
import { imprimirEstadoCuenta } from '@/lib/colegioReportes';
import FacturaFiscalDialog from '@/components/colegio/FacturaFiscalDialog';
import { supabase } from '@/lib/customSupabaseClient';
import MontoInput from '@/components/ui/MontoInput';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import CuentaBancariaSelect from '@/components/bancos/CuentaBancariaSelect';
import { printHtmlSmart, isSilentPrintEnabled } from '@/lib/printHtmlSmart';
import { reciboColegioTicketHTML, reciboColegioHojaHTML, numeroRecibo } from '@/lib/printColegio';
import { mesesDelAnio, MESES, hoyRD, pendienteDe, quitarTildes, TANDAS_NOMBRE as TANDAS, ESTADO_ESTUDIANTE } from '@/lib/colegio';

const n2 = (v) => Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const campo = 'h-9 rounded-md border border-gray-300 px-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-300';
// 'Efectivo en dólares': el Cierre de Caja lo cuenta como efectivo (el nombre lleva
// "efectivo"), igual que el desglose de la gaveta que cuenta los dólares × tasa.
const FORMAS = ['Efectivo', 'Transferencia', 'Tarjeta', 'Cheque', 'Efectivo en dólares'];
const conBanco = (f) => ['Transferencia', 'Tarjeta', 'Cheque'].includes(f);

/** Arma los datos de impresión de un recibo ya guardado (sirve también para reimprimir). */
export async function datosReciboColegio(pagoId, tenantId) {
  const { data: p, error } = await supabase.from('edu_pagos').select('*').eq('id', pagoId).eq('tenant_id', tenantId).single();
  if (error) throw error;
  const [li, fa, emp, us, ri] = await Promise.all([
    supabase.from('edu_pago_lineas').select('*, edu_cargos(anio_id, tipo)').eq('pago_id', pagoId).eq('tenant_id', tenantId).order('created_at'),
    supabase.from('edu_familias').select('*').eq('id', p.familia_id).eq('tenant_id', tenantId).single(),
    supabase.from('config_empresa').select('nombre, rnc, direccion1, direccion2, telefono, logo_url, slogan').eq('tenant_id', tenantId).single(),
    p.usuario_id ? supabase.from('profiles').select('full_name, email').eq('id', p.usuario_id).maybeSingle() : Promise.resolve({ data: null }),
    p.recibo_ingreso_id ? supabase.from('recibos_ingreso').select('numero').eq('id', p.recibo_ingreso_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  // El año escolar es el de los cargos de ESTE recibo (al reimprimir uno viejo no sale el año nuevo).
  // La reservación del año próximo no decide la tarjeta: manda el resto de las líneas.
  const anioId = ((li.data || []).find((l) => l.edu_cargos?.anio_id && l.edu_cargos.tipo !== 'reservacion')
    || (li.data || []).find((l) => l.edu_cargos?.anio_id))?.edu_cargos.anio_id;
  const an = anioId ? await supabase.from('edu_anios').select('*').eq('id', anioId).eq('tenant_id', tenantId).maybeSingle() : { data: null };
  const idsEst = [...new Set((li.data || []).map((l) => l.estudiante_id))];
  const [es, cu, ca, cfg] = await Promise.all([
    supabase.from('edu_estudiantes').select('*').in('id', idsEst).eq('tenant_id', tenantId),
    supabase.from('edu_cursos').select('id, nombre').eq('tenant_id', tenantId),
    an.data ? supabase.from('edu_cargos').select('*').in('estudiante_id', idsEst).eq('anio_id', an.data.id).eq('tenant_id', tenantId).neq('estado', 'anulado')
      : Promise.resolve({ data: [] }),
    supabase.from('edu_config').select('*').eq('tenant_id', tenantId).maybeSingle(),
  ]);
  const cursoN = new Map((cu.data || []).map((c) => [c.id, c.nombre]));
  const enEste = new Set(p.anulado ? [] : (li.data || []).map((l) => l.cargo_id));
  const orden = { reservacion: 1, inscripcion: 1, utileria: 2, bilingue: 3, mensualidad: 4, sala_tareas: 5, recargo: 6, otro: 7 };
  const estudiantes = (es.data || []).map((e) => {
    const cargos = (ca.data || []).filter((c) => c.estudiante_id === e.id)
      .sort((a, b) => (orden[a.tipo] - orden[b.tipo]) || String(a.periodo || '').localeCompare(String(b.periodo || '')));
    return {
      id: e.id, nombre: `${e.nombres} ${e.apellidos}`, curso: cursoN.get(e.curso_id) || '', tanda: TANDAS[e.tanda] || '',
      condicion: e.condicion, tarifa: e.tarifa_mensual, beca_pct: e.beca_pct,
      lineas: (li.data || []).filter((l) => l.estudiante_id === e.id),
      tarjeta: cargos.filter((c) => ['reservacion', 'inscripcion', 'utileria', 'bilingue', 'mensualidad'].includes(c.tipo))
        .map((c) => ({ ...c, esteRecibo: enEste.has(c.id) })),
      pendiente: cargos.filter((c) => c.moneda === 'DOP').reduce((s, c) => s + pendienteDe(c), 0),
    };
  });
  // Próximo pago: el primer mes pendiente de cualquiera de los hermanos.
  const prox = (ca.data || []).filter((c) => c.tipo === 'mensualidad' && pendienteDe(c) > 0).map((c) => c.periodo).sort()[0];
  const dia = cfg.data?.dia_limite_pago || 5;
  const e0 = emp.data || {};
  return {
    colegio: { nombre: e0.nombre, rnc: e0.rnc, direccion: [e0.direccion1, e0.direccion2].filter(Boolean).join(', '), telefono: e0.telefono, logo_url: e0.logo_url, slogan: e0.slogan },
    pago: { ...p, usuario: us.data?.full_name || us.data?.email || '', recibo_ingreso: ri.data?.numero || '' },
    familia: { ...fa.data, telefono: fa.data?.tutor_telefono || fa.data?.madre_celular || fa.data?.padre_celular || '' },
    anio: an.data, estudiantes,
    proximoPago: prox ? `${MESES[Number(prox.slice(5, 7)) - 1].toLowerCase()}, del 1 al ${dia}` : '',
    reglaRecargo: cfg.data?.recargo_monto > 0
      ? `Pagos del 1 al ${dia} de cada mes; desde el día 1 del mes siguiente se aplica un recargo de RD$${n2(cfg.data.recargo_monto)}.` : '',
  };
}

export async function imprimirReciboColegio(pagoId, tenantId, formato) {
  const d = await datosReciboColegio(pagoId, tenantId);
  if (formato === 'hoja') await printHtmlSmart(reciboColegioHojaHTML(d), { tipo: 'carta' });
  else if (!(await imprimirReciboNativo(d))) await printHtmlSmart(reciboColegioTicketHTML(d), { tipo: 'ticket', anchoMM: 80 });
}

// Con el agente de impresión: letras de la impresora (mismo tamaño que la
// factura de Repuestos Morla). Sin agente o sin impresora térmica → imagen.
// Si el envío al agente falla NO se repite como imagen: el ticket pudo haber
// salido (agente lento) y serían dos recibos; el error se ve y se reimprime.
const TERMICAS = ['Star TSP143', 'TSP143', 'TSP100', 'POS-80', 'POS80', 'XP-80', 'EPSON TM', 'Thermal', 'Receipt'];
async function imprimirReciboNativo(d) {
  if (!isSilentPrintEnabled()) return false;
  let impresora; let escpos; let recibo; let adaptador;
  try {
    let agente;
    [agente, recibo, adaptador] = await Promise.all([
      import('@/services/motoflowPrintAgent'), import('@/services/escposReceipt'), import('@/services/printerAdapter'),
    ]);
    if (!(await agente.agentIsAvailable())) return false;
    impresora = await adaptador.findReceiptPrinter(TERMICAS);
    escpos = recibo.buildReciboColegioEscPos(d);
  } catch (e) {
    console.warn('[colegio] sin impresora para el recibo nativo, uso imagen:', e?.message || e);
    return false;
  }
  // Logo arriba. Si no carga en 3 s (o falla), el recibo sale sin él: no se
  // queda esperando (y no salen dos al darle otra vez).
  let logo = '';
  try {
    const modo = adaptador.esImpresoraStar(impresora) ? 'star' : 'escpos';
    if (d.colegio?.logo_url) {
      let reloj;
      const g = await Promise.race([
        logoEnGrises(d.colegio.logo_url, recibo.LOGO_PUNTOS),
        new Promise((_, mal) => { reloj = setTimeout(() => mal(new Error('el logo tardó mucho')), 3000); }),
      ]).finally(() => clearTimeout(reloj));
      logo = recibo.logoEscPos(recibo.logoDesdeGrises(g.gris, g.w, g.h, modo), modo);
    }
  } catch (e) {
    console.warn('[colegio] recibo sin logo:', e?.message || e);
  }
  await adaptador.printEscPosPorAgente(impresora, escpos, logo);
  return true;
}

// Búsqueda: palabras sin puntuación (máx. 5) y su patrón sin tildes para la base.
export const palabrasDeBusqueda = (q) => quitarTildes(q).replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean).slice(0, 5);
const CLASE = { a: '[aáà]', e: '[eéè]', i: '[iíì]', o: '[oóò]', u: '[uúüù]', n: '[nñ]' };
export const patronSinTildes = (palabra) => Array.from(palabra, (c) => CLASE[c] || c).join('');

// Logo → grises al ancho pedido (se guarda mientras la página esté abierta).
// · Alto máximo 1.5 × ancho: un logo vertical no gasta medio rollo.
// · Se achica por mitades (de un golpe se pierden las letras finas), pero el
//   primer lienzo va a 8× el ancho final (y de ahí por mitades): una foto de 6000 px no traba la caja.
// · Transparente = blanco.
const cacheLogo = new Map();
function logoEnGrises(url, anchoMax) {
  const clave = `${url}|${anchoMax}`;
  if (!cacheLogo.has(clave)) {
    cacheLogo.set(clave, new Promise((ok, mal) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          if (!img.naturalWidth || !img.naturalHeight) throw new Error('El logo no tiene tamaño (¿SVG?)');
          const proporcion = img.naturalHeight / img.naturalWidth;
          const w = proporcion > 1.5 ? Math.max(1, Math.round(anchoMax * 1.5 / proporcion)) : anchoMax;
          const h = Math.max(1, Math.round(w * proporcion));
          const lienzo = (cw, ch) => {
            const c = document.createElement('canvas'); c.width = cw; c.height = ch;
            const x = c.getContext('2d'); x.imageSmoothingQuality = 'high';
            return [c, x];
          };
          const w0 = Math.min(img.naturalWidth, w * 8); const h0 = Math.max(1, Math.round(w0 * proporcion));
          let [src, sx] = lienzo(w0, h0);
          sx.fillStyle = '#fff'; sx.fillRect(0, 0, w0, h0); sx.drawImage(img, 0, 0, w0, h0);
          while (src.width / 2 >= w * 1.5) {
            const [half, hx] = lienzo(Math.round(src.width / 2), Math.round(src.height / 2));
            hx.drawImage(src, 0, 0, half.width, half.height);
            src = half;
          }
          const [, cx] = lienzo(w, h);
          cx.drawImage(src, 0, 0, w, h);
          const px = cx.getImageData(0, 0, w, h).data;
          const gris = new Uint8Array(w * h);
          for (let i = 0; i < w * h; i++) gris[i] = Math.round(px[i * 4] * 0.299 + px[i * 4 + 1] * 0.587 + px[i * 4 + 2] * 0.114);
          ok({ w, h, gris });
        } catch (e) { mal(e); }
      };
      img.onerror = () => mal(new Error('No se pudo cargar el logo'));
      img.src = url;
    }).catch((e) => { cacheLogo.delete(clave); throw e; }));
  }
  return cacheLogo.get(clave);
}

const FORMA_INICIAL = { forma: 'Efectivo', monto: '', referencia: '', cuenta_id: null, banco: '', alias: '' };

export default function CajaColegioPage() {
  const { tenantId, profile } = useAuth();
  const { toast } = useToast();
  const [buscar, setBuscar] = useState('');
  const [resultados, setResultados] = useState([]);
  const [familia, setFamilia] = useState(null);
  const [estudiantes, setEstudiantes] = useState([]);
  const [cargos, setCargos] = useState([]);
  const [cursos, setCursos] = useState(new Map());
  const [anio, setAnio] = useState(null);
  const [anios, setAnios] = useState(new Map());   // id → año (para las deudas viejas y la reservación del próximo)
  const [reservando, setReservando] = useState(null);
  const [confirmando, setConfirmando] = useState(null);
  const [facturar, setFacturar] = useState(false);   // factura con crédito fiscal de la familia abierta
  const [cfg, setCfg] = useState(null);
  const [conceptos, setConceptos] = useState([]);
  const [sel, setSel] = useState({});          // cargo_id → 'completo' | 'medio'
  const [anioCompleto, setAnioCompleto] = useState({});   // estudiante_id → bool
  const [tasa, setTasa] = useState('');
  const [formas, setFormas] = useState([{ ...FORMA_INICIAL }]);
  const [formato, setFormato] = useState(() => { try { return localStorage.getItem('colegio_formato_recibo') || 'ticket'; } catch { return 'ticket'; } });
  const [cobrando, setCobrando] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [recibosHoy, setRecibosHoy] = useState([]);
  const [preparar, setPreparar] = useState(null);   // estudiante a preparar
  const [agregar, setAgregar] = useState(null);     // estudiante al que agregar cargo
  // La misma regla que la base (dueño/admin de ESTE colegio, o superadmin); mientras responde, el rol del perfil.
  const [esDireccion, setEsDireccion] = useState(['admin', 'owner'].includes(profile?.role));
  useEffect(() => {
    if (!tenantId) return;
    supabase.rpc('edu_soy_direccion').then(({ data, error: e }) => { if (!e) setEsDireccion(!!data); });
  }, [tenantId]);

  const error = useCallback((t, d) => toast({ title: t, description: d ? String(d) : undefined, variant: 'destructive' }), [toast]);

  // Datos fijos del colegio
  useEffect(() => {
    if (!tenantId) return;
    (async () => {
      const [cu, an, cf, co] = await Promise.all([
        supabase.from('edu_cursos').select('id, nombre').eq('tenant_id', tenantId),
        supabase.from('edu_anios').select('*').eq('tenant_id', tenantId).order('anio_inicio'),
        supabase.from('edu_config').select('*').eq('tenant_id', tenantId).maybeSingle(),
        supabase.from('edu_conceptos').select('*').eq('tenant_id', tenantId).eq('activo', true).order('orden'),
      ]);
      setCursos(new Map((cu.data || []).map((c) => [c.id, c.nombre])));
      setAnios(new Map((an.data || []).map((a) => [a.id, a])));
      setAnio((an.data || []).find((a) => a.actual) || null); setCfg(cf.data || null); setConceptos(co.data || []);
    })();
  }, [tenantId]);

  const cargarRecibosHoy = useCallback(async () => {
    if (!tenantId) return;
    const { data } = await supabase.from('edu_pagos').select('id, numero, total, anulado, created_at, familia_id, edu_familias(nombre)')
      .eq('tenant_id', tenantId).eq('fecha', hoyRD()).order('numero', { ascending: false });
    setRecibosHoy(data || []);
  }, [tenantId]);
  useEffect(() => { cargarRecibosHoy(); }, [cargarRecibosHoy]);

  // Buscar por estudiante, matrícula, familia o padres
  const busquedaRef = React.useRef(0);
  useEffect(() => {
    const q = buscar.trim();
    const yo = ++busquedaRef.current;
    if (q.length < 2) { setResultados([]); return undefined; }
    const t = setTimeout(async () => {
      const esNum = /^\d+$/.test(q);
      // (08/11/2026) Cada palabra por separado, en cualquier campo: "ANA BATIS"
      // no encontraba a ANA (nombre) BATISTA (apellido) porque se buscaba la
      // frase entera. Vocales y ñ valen con o sin tilde (PEREZ = PÉREZ,
      // PENA = PEÑA): en la base con una expresión [eé], [nñ]… exacta, así no
      // trae de más; una coma o un punto no cuentan.
      const palabras = palabrasDeBusqueda(q);
      if (!esNum && !palabras.length) { if (yo === busquedaRef.current) setResultados([]); return; }
      let qe = supabase.from('edu_estudiantes').select('id, nombres, apellidos, matricula, familia_id, curso_id, estado').eq('tenant_id', tenantId);
      let qf = supabase.from('edu_familias').select('id, nombre, madre_nombre, padre_nombre, tutor_nombre').eq('tenant_id', tenantId);
      if (esNum) qe = qe.eq('matricula', Number(q));
      else for (const w of palabras.map(patronSinTildes)) {
        qe = qe.or(`nombres.imatch.${w},apellidos.imatch.${w}`);
        qf = qf.or(`nombre.imatch.${w},madre_nombre.imatch.${w},padre_nombre.imatch.${w},tutor_nombre.imatch.${w}`);
      }
      const [es, fa] = await Promise.all([
        qe.order('apellidos').order('nombres').limit(12),
        esNum || !palabras.length ? Promise.resolve({ data: [] }) : qf.order('nombre').limit(8),
      ]);
      const r = [
        ...(es.data || []).map((e) => ({ tipo: 'est', id: e.id, familia_id: e.familia_id, titulo: `${e.nombres} ${e.apellidos}`, sub: `Mat. ${e.matricula} · ${cursos.get(e.curso_id) || ''}${e.estado !== 'activo' ? ` · ${ESTADO_ESTUDIANTE[e.estado] || e.estado}` : ''}` })),
        ...(fa.data || []).map((f) => ({ tipo: 'fam', id: f.id, familia_id: f.id, titulo: `Familia ${f.nombre}`, sub: [f.madre_nombre, f.padre_nombre, f.tutor_nombre].filter(Boolean).join(' / ') })),
      ];
      if (yo === busquedaRef.current) setResultados(r);   // una respuesta vieja no pisa la nueva
    }, 250);
    return () => clearTimeout(t);
  }, [buscar, tenantId, cursos]);

  const abrirFamilia = useCallback(async (familiaId) => {
    if (!anio) return error('Un momento', 'Todavía se está cargando el año escolar. Vuelve a intentarlo.');
    setCargando(true);
    try {
      // Recargos al día (no duplica) ANTES de leer lo que debe.
      const { error: eR } = await supabase.rpc('edu_aplicar_recargos');
      if (eR) throw eR;
      const [fa, es] = await Promise.all([
        supabase.from('edu_familias').select('*').eq('id', familiaId).eq('tenant_id', tenantId).single(),
        supabase.from('edu_estudiantes').select('*').eq('familia_id', familiaId).eq('tenant_id', tenantId).order('matricula'),
      ]);
      if (fa.error) throw fa.error;
      const ids = (es.data || []).map((e) => e.id);
      // Todo lo de la familia: el año actual, lo que quedó debiendo de años
      // anteriores y la reservación del año próximo.
      const [{ data: ca, error: eC }, { data: an }] = await Promise.all([
        ids.length
          ? supabase.from('edu_cargos').select('*').in('estudiante_id', ids).eq('tenant_id', tenantId).neq('estado', 'anulado')
          : Promise.resolve({ data: [] }),
        supabase.from('edu_anios').select('*').eq('tenant_id', tenantId),   // la reservación pudo crear el año próximo
      ]);
      if (eC) throw eC;
      const mapa = new Map((an || []).map((a) => [a.id, a]));
      // El año actual se relee: el panel sigue montado aunque en Configuración se cambie de año.
      const actual = [...mapa.values()].find((a) => a.actual) || anio;
      const visibles = (ca || []).filter((c) => c.anio_id === actual.id || pendienteDe(c) > 0
        || (c.tipo === 'reservacion' && (mapa.get(c.anio_id)?.anio_inicio ?? 0) > actual.anio_inicio));
      setAnios(mapa);
      if (actual.id !== anio.id) setAnio(actual);
      setFamilia(fa.data); setEstudiantes(es.data || []); setCargos(visibles);
      setSel({}); setAnioCompleto({}); setTasa('');
      setFormas([{ ...FORMA_INICIAL }]);
      setBuscar(''); setResultados([]);
    } catch (e) {
      error('No se pudo abrir la familia', e?.message);
    } finally {
      setCargando(false);
    }
  }, [tenantId, anio, error]);

  const buscadorRef = React.useRef(null);
  // La familia que está en pantalla AHORA (la respuesta de un cobro puede
  // llegar cuando la cajera ya abrió otra).
  const familiaAbierta = React.useRef(null);
  useEffect(() => { familiaAbierta.current = familia?.id || null; }, [familia]);
  // El cursor al buscador, solo si esta pestaña es la que se ve (las
  // escondidas siguen montadas con pointer-events-none).
  const enfocarBuscador = () => setTimeout(() => {
    const el = buscadorRef.current;
    if (el && !el.closest('.pointer-events-none') && document.visibilityState === 'visible') el.focus();
  }, 0);
  const cerrarFamilia = () => {
    setFamilia(null); setEstudiantes([]); setCargos([]);
    setSel({}); setAnioCompleto({}); setTasa('');
    setFormas([{ ...FORMA_INICIAL }]);
    setBuscar(''); setResultados([]);
    enfocarBuscador();
  };

  // ── Lo que se va a cobrar ──
  const lineas = useMemo(() => {
    const pct = Number(cfg?.descuento_anual_pct || 0);
    return cargos.filter((c) => sel[c.id]).map((c) => {
      let monto = pendienteDe(c);
      if (c.tipo === 'mensualidad' && c.anio_id === anio?.id && anioCompleto[c.estudiante_id]) monto = Math.round(Number(c.monto) * (1 - pct / 100) * 100) / 100;
      else if (c.tipo === 'mensualidad' && sel[c.id] === 'medio') monto = Math.round(Number(c.monto) / 2 * 100) / 100;
      const rd = c.moneda === 'USD' ? Math.round(monto * Number(tasa || 0) * 100) / 100 : monto;
      return { cargo: c, monto, rd };
    });
  }, [cargos, sel, anioCompleto, cfg, tasa, anio]);
  const total = lineas.reduce((s, l) => s + l.rd, 0);
  const hayUSD = lineas.some((l) => l.cargo.moneda === 'USD');
  const sumaFormas = formas.reduce((s, f) => s + (Number(f.monto) || 0), 0);

  // Una sola forma: se llena sola con el total.
  useEffect(() => {
    setFormas((fs) => (fs.length === 1 ? [{ ...fs[0], monto: total ? String(total.toFixed(2)) : '' }] : fs));
  }, [total]);

  const alternar = (c) => setSel((s) => { const n = { ...s }; if (n[c.id]) delete n[c.id]; else n[c.id] = 'completo'; return n; });

  const marcarAnioCompleto = (est, on) => {
    // Solo las mensualidades del año actual (una deuda del año pasado no lleva el descuento).
    const mens = cargos.filter((c) => c.estudiante_id === est.id && c.tipo === 'mensualidad' && c.anio_id === anio?.id && pendienteDe(c) > 0);
    if (on && mens.some((c) => Number(c.pagado) > 0)) {
      return error('No se puede', 'El año completo es con las mensualidades sin abonar (hay una con medio mes pagado).');
    }
    setAnioCompleto((a) => ({ ...a, [est.id]: on }));
    setSel((s) => { const n = { ...s }; mens.forEach((c) => { if (on) n[c.id] = 'completo'; else delete n[c.id]; }); return n; });
    return undefined;
  };

  const cobrar = async () => {
    if (!lineas.length) return error('Nada que cobrar', 'Marca lo que el padre va a pagar.');
    if (hayUSD && !(Number(tasa) > 0)) return error('Falta la tasa', 'Escribe la tasa del dólar de hoy para el Sistema Bilingüe.');
    if (Math.abs(sumaFormas - total) > 0.01) return error('Las formas de pago no cuadran', `Suman RD$${n2(sumaFormas)} y el total es RD$${n2(total)}.`);
    if (formas.some((f) => conBanco(f.forma) && Number(f.monto) > 0 && !f.cuenta_id)) return error('Falta la cuenta', 'Escoge a qué cuenta bancaria entró la transferencia, tarjeta o cheque.');
    setCobrando(true);
    const fid = familia.id;
    let cobrado = null;
    try {
      const { data, error: e } = await supabase.rpc('edu_cobrar', {
        p_familia: fid,
        p_lineas: lineas.map((l) => ({ cargo_id: l.cargo.id, monto: l.monto })),
        p_formas: formas.filter((f) => Number(f.monto) > 0).map((f) => ({
          forma: f.forma, monto: Number(f.monto), referencia: f.referencia || null,
          cuenta_id: conBanco(f.forma) ? f.cuenta_id : null, banco: conBanco(f.forma) ? f.banco || null : null, alias: conBanco(f.forma) ? f.alias || null : null,
        })),
        p_tasa: hayUSD ? Number(tasa) : null,
        p_anio_completo: Object.entries(anioCompleto).filter(([, on]) => on).map(([id]) => id),
      });
      if (e) throw e;
      cobrado = data;
    } catch (e) {
      error('No se pudo cobrar', e?.message);
      // El cobro pudo grabarse aunque la respuesta no llegara (red): se
      // vuelve a leer la familia, así lo ya pagado no queda marcado para
      // cobrarlo otra vez.
      if (familiaAbierta.current === fid) abrirFamilia(fid);
    } finally {
      setCobrando(false);
    }
    if (!cobrado) return;
    // (08/11/2026) Cobrado: la familia se cierra en seguida (antes de
    // imprimir) para que no se le cobre dos veces; el buscador queda listo
    // para la siguiente. Si la cajera ya abrió otra familia, esa no se toca.
    if (familiaAbierta.current === fid) cerrarFamilia();
    toast({ title: `Cobrado ${numeroRecibo(cobrado.numero)}`, description: `RD$${n2(cobrado.total)} · Recibo de ingreso ${cobrado.recibo_ingreso}` });
    cargarRecibosHoy();
    if (formato !== 'ninguno') {
      try { await imprimirReciboColegio(cobrado.pago_id, tenantId, formato); } catch (pe) { error('Se cobró, pero no se pudo imprimir', pe?.message); }
      if (!familiaAbierta.current) enfocarBuscador();   // el diálogo de imprimir se lleva el cursor
    }
  };

  const anular = async (r) => {
    const motivo = window.prompt(`Motivo para anular ${numeroRecibo(r.numero)} (RD$${n2(r.total)}):`, '');
    if (motivo === null) return;
    const { error: e } = await supabase.rpc('edu_anular_pago', { p_pago: r.id, p_motivo: motivo });
    if (e) return error('No se pudo anular', e.message);
    toast({ title: `${numeroRecibo(r.numero)} anulado` });
    cargarRecibosHoy();
    if (familia?.id === r.familia_id) abrirFamilia(familia.id);
  };

  // Reservación de cupo del año próximo: queda como un cargo más para cobrarlo ahora.
  const reservar = async (e) => {
    setReservando(e.id);
    const { error: er } = await supabase.rpc('edu_reservar_cupo', { p_estudiante: e.id });
    setReservando(null);
    if (er) return error('No se pudo reservar', er.message);
    toast({ title: `Cupo reservado para ${e.nombres}`, description: 'Márcalo y cóbralo con lo demás.' });
    return abrirFamilia(familia.id);
  };

  // Estudiante 'por confirmar' tras el cambio de año. Sigue SOLO pagando la
  // reservación (lo hace la base al quedar pagada). Si se fue: retirado y se
  // quitan los cargos del año sin pagar (lo del año viejo se sigue debiendo).
  const noSigue = async (e) => {
    const motivo = window.prompt(`¿Por qué no sigue ${e.nombres} ${e.apellidos}? (por ejemplo: se fue a otro colegio)`, '');
    if (motivo === null) return undefined;
    setConfirmando(e.id);
    const { error: er } = await supabase.rpc('edu_no_continua', { p_estudiante: e.id, p_motivo: motivo });
    setConfirmando(null);
    if (er) return error('No se pudo retirar', er.message);
    toast({ title: `${e.nombres} quedó retirado` });
    return abrirFamilia(familia.id);
  };

  // Quitar un cargo sin pagos (retiro, error al cargarlo): solo la dirección.
  const anularCargo = async (c) => {
    const motivo = window.prompt(`Motivo para quitar "${c.descripcion}":`, '');
    if (motivo === null) return;
    const { error: er } = await supabase.rpc('edu_anular_cargo', { p_cargo: c.id, p_motivo: motivo });
    if (er) { error('No se pudo quitar', er.message); return; }
    toast({ title: `${c.descripcion} quitado` });
    abrirFamilia(familia.id);
  };

  const cambiarFormato = (v) => { setFormato(v); try { localStorage.setItem('colegio_formato_recibo', v); } catch { /* sin almacenamiento */ } };
  const setForma = (i, k, v) => setFormas((fs) => fs.map((f, j) => (j === i ? { ...f, [k]: v } : f)));

  return (
    <div className="h-full overflow-y-auto bg-gray-50 p-4 md:p-6">
      <Helmet><title>Caja del Colegio</title></Helmet>
      <div className="max-w-7xl mx-auto space-y-4">
        <div className="flex items-center gap-2">
          <Wallet className="w-6 h-6 text-blue-700" />
          <div>
            <h1 className="text-lg font-black text-gray-800 uppercase tracking-wide">Caja del Colegio</h1>
            <p className="text-xs text-gray-500">Año escolar {anio?.nombre || '—'} · cada cobro entra solo en el Cierre de Caja</p>
          </div>
        </div>

        <div className="relative bg-white border border-gray-200 rounded-lg p-3">
          <Search className="w-4 h-4 text-gray-400 absolute left-5 top-5.5" style={{ top: 22 }} />
          <input ref={buscadorRef} autoFocus className={`${campo} w-full pl-8`} disabled={!anio}
            placeholder={anio ? 'Buscar estudiante, matrícula, familia, madre o padre…' : 'Cargando el año escolar…'}
            value={buscar} onChange={(e) => setBuscar(e.target.value)} />
          {resultados.length > 0 && (
            <div className="absolute left-3 right-3 top-14 z-20 bg-white border rounded-md shadow-lg divide-y max-h-80 overflow-y-auto">
              {resultados.map((r) => (
                <button key={`${r.tipo}-${r.id}`} type="button" className="w-full text-left px-3 py-2 hover:bg-blue-50 text-sm" onClick={() => abrirFamilia(r.familia_id)}>
                  <b>{r.titulo}</b> <span className="text-gray-500">· {r.sub}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {cargando && <div className="py-10 flex justify-center"><Loader2 className="w-7 h-7 animate-spin text-blue-600" /></div>}

        {familia && !cargando && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* ── Estudiantes y cargos ── */}
            <div className="lg:col-span-2 space-y-3">
              <div className="bg-white border border-gray-200 rounded-lg px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="font-black text-gray-800">Familia {familia.nombre}</div>
                  <Button size="sm" variant="outline" title="Todos los hijos en una sola hoja"
                    onClick={() => imprimirEstadoCuenta(familia.id, tenantId).catch((e) => error('No se pudo imprimir', e?.message))}>
                    <FileText className="w-4 h-4 mr-1" /> Estado de cuenta
                  </Button>
                  <Button size="sm" variant="outline" title="Factura con NCF B01 para el padre que la pide (gastos educativos)" onClick={() => setFacturar(true)}>
                    Factura crédito fiscal
                  </Button>
                </div>
                <div className="text-xs text-gray-500">
                  {[familia.madre_nombre && `Madre: ${familia.madre_nombre} ${familia.madre_celular || ''}`, familia.padre_nombre && `Padre: ${familia.padre_nombre} ${familia.padre_celular || ''}`, familia.tutor_nombre && `Tutor: ${familia.tutor_nombre} ${familia.tutor_telefono || ''}`].filter(Boolean).join(' · ')}
                </div>
                <div className="mt-1 text-sm">
                  Debe la familia: <b className="text-red-700">RD${n2(cargos.filter((c) => c.moneda === 'DOP').reduce((s, c) => s + pendienteDe(c), 0))}</b>
                  {cargos.some((c) => c.moneda === 'USD' && pendienteDe(c) > 0) && <> + <b className="text-red-700">US${n2(cargos.filter((c) => c.moneda === 'USD').reduce((s, c) => s + pendienteDe(c), 0))}</b></>}
                </div>
              </div>

              {estudiantes.map((e) => {
                const suyos = cargos.filter((c) => c.estudiante_id === e.id);
                const pendientes = suyos.filter((c) => pendienteDe(c) > 0)
                  .sort((a, b) => String(a.periodo || '0').localeCompare(String(b.periodo || '0')) || a.tipo.localeCompare(b.tipo));
                const pagados = suyos.filter((c) => pendienteDe(c) <= 0);
                const hayMensPend = pendientes.some((c) => c.tipo === 'mensualidad' && c.anio_id === anio?.id);
                const anioSig = anio ? `${anio.anio_inicio + 1}-${anio.anio_inicio + 2}` : '';
                // Por confirmar: su reservación es la del año que ya corre (no anulada).
                const reservaActual = e.estado === 'por_confirmar' ? suyos.find((c) => c.tipo === 'reservacion' && c.anio_id === anio?.id && pendienteDe(c) > 0) : null;
                const reservaSig = suyos.find((c) => c.tipo === 'reservacion' && (anios.get(c.anio_id)?.anio_inicio ?? 0) > (anio?.anio_inicio ?? 0));
                return (
                  <div key={e.id} className={`bg-white border rounded-lg ${e.estado === 'por_confirmar' ? 'border-amber-300' : e.estado !== 'activo' ? 'opacity-60' : 'border-gray-200'}`}>
                    <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 border-b bg-gray-50 rounded-t-lg">
                      <div>
                        <b>{e.nombres} {e.apellidos}</b>
                        <span className="text-xs text-gray-500"> · Mat. {e.matricula} · {cursos.get(e.curso_id) || ''} · {TANDAS[e.tanda] || ''} · RD${n2(e.tarifa_mensual)}{Number(e.beca_pct) > 0 ? ` (beca ${Number(e.beca_pct)}%)` : ''}{e.estado !== 'activo' && e.estado !== 'por_confirmar' ? ` · ${ESTADO_ESTUDIANTE[e.estado] || e.estado}` : ''}</span>
                      </div>
                      <div className="flex flex-wrap gap-1 items-center">
                        {e.estado === 'por_confirmar' && (
                          <>
                            <span className="text-xs font-semibold text-amber-800 bg-amber-50 rounded px-2 py-1">
                              {reservaActual ? `Por confirmar: cobra la reservación (${n2(pendienteDe(reservaActual))}) y entra al aula` : `Por confirmar en ${anio?.nombre || ''}: sigue al pagar la reservación`}
                            </span>
                            {!reservaActual && (
                              <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" disabled={reservando === e.id} onClick={() => reservar(e)} title="Carga la reservación del año; al cobrarla completa queda confirmado, entra al aula y se le prepara la cuenta">
                                {reservando === e.id ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <CalendarCheck className="w-4 h-4 mr-1" />} Reservar cupo {anio?.nombre}
                              </Button>
                            )}
                            <Button size="sm" variant="outline" disabled={confirmando === e.id} onClick={() => noSigue(e)} title="Se fue: queda retirado (lo que debe del año viejo se sigue cobrando)">
                              {confirmando === e.id ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <UserMinus className="w-4 h-4 mr-1" />} No sigue
                            </Button>
                          </>
                        )}
                        {e.estado === 'activo' && reservaSig && pendienteDe(reservaSig) <= 0 && (
                          <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 rounded px-2 py-1">✓ Cupo {anios.get(reservaSig.anio_id)?.nombre} reservado</span>
                        )}
                        {e.estado === 'activo' && !reservaSig && (
                          <Button size="sm" variant="outline" disabled={reservando === e.id} onClick={() => reservar(e)} title="Cobrar ahora la reservación de cupo del año que viene">
                            {reservando === e.id ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <CalendarCheck className="w-4 h-4 mr-1" />} Reservar cupo {anioSig}
                          </Button>
                        )}
                        {e.estado === 'activo' && (
                          <Button size="sm" variant="outline" onClick={() => setPreparar(e)} title="Crear las mensualidades y conceptos del año">
                            <CalendarPlus className="w-4 h-4 mr-1" /> {suyos.length ? 'Completar cuenta' : 'Preparar cuenta del año'}
                          </Button>
                        )}
                        {e.estado === 'activo' && suyos.length > 0 && (
                          <Button size="sm" variant="ghost" onClick={() => setAgregar(e)} title="Agregar otro concepto"><Plus className="w-4 h-4" /></Button>
                        )}
                      </div>
                    </div>
                    {suyos.length === 0 ? (
                      <div className="px-4 py-4 text-sm text-gray-500">{e.estado === 'por_confirmar'
                        ? 'No debe nada. Para que siga, pulsa "Reservar cupo" y cobra la reservación: al quedar pagada entra al aula y se le prepara la cuenta.'
                        : 'Este estudiante todavía no tiene la cuenta del año. Púlsale "Preparar cuenta del año".'}</div>
                    ) : (
                      <div className="px-4 py-2">
                        {hayMensPend && Number(cfg?.descuento_anual_pct) > 0 && (
                          <label className="flex items-center gap-2 text-sm py-1 text-emerald-800">
                            <input type="checkbox" checked={!!anioCompleto[e.id]} onChange={(ev) => marcarAnioCompleto(e, ev.target.checked)} />
                            Pagar todas las mensualidades que faltan con {Number(cfg.descuento_anual_pct)}% de descuento
                          </label>
                        )}
                        <table className="w-full text-sm">
                          <tbody>
                            {pendientes.map((c) => {
                              const marcado = !!sel[c.id];
                              const delAnioCompleto = !!anioCompleto[e.id] && c.tipo === 'mensualidad' && c.anio_id === anio?.id;
                              const medioPosible = c.tipo === 'mensualidad' && cfg?.permite_medio_mes && Number(c.pagado) === 0 && !delAnioCompleto;
                              const vencido = c.vence && c.vence < hoyRD();
                              const otroAnio = c.anio_id !== anio?.id ? anios.get(c.anio_id)?.nombre : null;
                              return (
                                <tr key={c.id} className="border-b last:border-0">
                                  <td className="py-1.5 w-8"><input type="checkbox" checked={marcado} disabled={delAnioCompleto} onChange={() => alternar(c)} /></td>
                                  <td className={vencido ? 'text-red-700' : ''}>
                                    {c.descripcion}{c.es_tercero ? <span className="text-[10px] text-gray-400"> (se le paga a la compañía)</span> : ''}
                                    {otroAnio && c.tipo !== 'reservacion' && <span className="ml-1 text-[10px] font-bold uppercase bg-amber-100 text-amber-800 rounded px-1.5 py-0.5">año {otroAnio}</span>}
                                    {Number(c.pagado) > 0 && <span className="text-xs text-gray-500"> · abonado {c.moneda === 'USD' ? 'US$' : 'RD$'}{n2(c.pagado)}</span>}
                                  </td>
                                  <td className="w-40">
                                    {medioPosible && marcado && (
                                      <select className={`${campo} h-7 text-xs`} value={sel[c.id]} onChange={(ev) => setSel((s) => ({ ...s, [c.id]: ev.target.value }))}>
                                        <option value="completo">Mes completo</option>
                                        <option value="medio">Medio mes</option>
                                      </select>
                                    )}
                                  </td>
                                  <td className="text-right font-mono w-32">{c.moneda === 'USD' ? 'US$' : 'RD$'}{n2(pendienteDe(c))}</td>
                                  <td className="w-8 text-right">
                                    {esDireccion && Number(c.pagado) === 0 && (
                                      <button type="button" title="Quitar este cargo (solo la dirección)" className="text-gray-300 hover:text-red-600" onClick={() => anularCargo(c)}>
                                        <X className="w-4 h-4" />
                                      </button>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                        {pagados.length > 0 && (
                          <details className="mt-1 text-xs text-gray-500">
                            <summary className="cursor-pointer">{pagados.length} pagados</summary>
                            <div className="mt-1 flex flex-wrap gap-1">
                              {pagados.map((c) => <span key={c.id} className="bg-emerald-50 text-emerald-800 rounded px-2 py-0.5">✓ {c.descripcion}</span>)}
                            </div>
                          </details>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* ── Cobro ── */}
            <div className="space-y-3">
              <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3 lg:sticky lg:top-2">
                <div className="text-xs font-bold text-gray-500 uppercase">A cobrar</div>
                {lineas.length === 0 ? <div className="text-sm text-gray-400">Marca lo que va a pagar.</div> : (
                  <div className="text-sm space-y-0.5 max-h-48 overflow-y-auto">
                    {lineas.map((l) => (
                      <div key={l.cargo.id} className="flex justify-between gap-2">
                        <span className="truncate">{l.cargo.descripcion}{sel[l.cargo.id] === 'medio' ? ' (medio)' : ''}</span>
                        <span className="font-mono">{l.cargo.moneda === 'USD' ? `US$${n2(l.monto)}` : n2(l.rd)}</span>
                      </div>
                    ))}
                  </div>
                )}
                {hayUSD && (
                  <label className="block text-xs font-bold text-gray-600 uppercase">
                    Tasa del dólar hoy (RD$ por US$)
                    <input type="number" min="0" step="0.01" className={`${campo} w-full mt-1`} value={tasa} onChange={(e) => setTasa(e.target.value)} />
                  </label>
                )}
                <div className="flex justify-between items-baseline border-t pt-2">
                  <span className="font-black">TOTAL</span>
                  <span className="text-2xl font-black font-mono">RD${n2(total)}</span>
                </div>

                <div className="text-xs font-bold text-gray-500 uppercase">Formas de pago</div>
                {formas.map((f, i) => (
                  <div key={i} className="rounded-md border border-gray-200 p-2 space-y-2">
                    <div className="flex gap-2">
                      <select className={`${campo} flex-1`} value={f.forma} onChange={(e) => setForma(i, 'forma', e.target.value)}>
                        {FORMAS.map((x) => <option key={x} value={x}>{x}</option>)}
                      </select>
                      <MontoInput className={`${campo} w-32 text-right`} value={f.monto} onChange={(v) => setForma(i, 'monto', v)} />
                      {formas.length > 1 && <Button size="sm" variant="ghost" onClick={() => setFormas((fs) => fs.filter((_, j) => j !== i))}><Trash2 className="w-4 h-4" /></Button>}
                    </div>
                    {conBanco(f.forma) && (
                      <>
                        <CuentaBancariaSelect value={f.cuenta_id} contexto="recibo" label="Entró a la cuenta"
                          onChange={(id) => setForma(i, 'cuenta_id', id)}
                          onSelect={(cta) => setFormas((fs) => fs.map((x, j) => (j === i ? { ...x, banco: cta?.banco || '', alias: cta?.alias || '' } : x)))} />
                        <input className={`${campo} w-full`} placeholder="Referencia / número" value={f.referencia} onChange={(e) => setForma(i, 'referencia', e.target.value)} />
                      </>
                    )}
                  </div>
                ))}
                <div className="flex justify-between text-xs">
                  <button type="button" className="text-blue-700 underline" onClick={() => setFormas((fs) => [...fs, { forma: 'Transferencia', monto: '', referencia: '', cuenta_id: null, banco: '', alias: '' }])}>
                    + Otra forma de pago
                  </button>
                  <span className={Math.abs(sumaFormas - total) > 0.01 ? 'text-red-700 font-semibold' : 'text-gray-500'}>Suman RD${n2(sumaFormas)}</span>
                </div>

                <div className="flex items-center gap-2 text-sm">
                  <Printer className="w-4 h-4 text-gray-500" />
                  <select className={`${campo} flex-1`} value={formato} onChange={(e) => cambiarFormato(e.target.value)}>
                    <option value="ticket">Imprimir ticket</option>
                    <option value="hoja">Imprimir hoja (con tarjeta del año)</option>
                    <option value="ninguno">No imprimir</option>
                  </select>
                </div>
                <Button className="w-full h-11 text-base" onClick={cobrar} disabled={cobrando || !lineas.length}>
                  {cobrando ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <Wallet className="w-5 h-5 mr-2" />} Cobrar RD${n2(total)}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* ── Recibos de hoy ── */}
        <div className="bg-white border border-gray-200 rounded-lg">
          <div className="flex items-center justify-between px-4 py-2 border-b">
            <b className="text-sm">Recibos de hoy</b>
            <Button size="sm" variant="ghost" onClick={cargarRecibosHoy}><RefreshCw className="w-4 h-4" /></Button>
          </div>
          {recibosHoy.length === 0 ? <div className="px-4 py-4 text-sm text-gray-400">Todavía no hay cobros hoy.</div> : (
            <table className="w-full text-sm">
              <tbody>
                {recibosHoy.map((r) => (
                  <tr key={r.id} className={`border-b last:border-0 ${r.anulado ? 'text-gray-400 line-through' : ''}`}>
                    <td className="py-1.5 px-4 font-mono">{numeroRecibo(r.numero)}</td>
                    <td>{new Date(r.created_at).toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit' })}</td>
                    <td>Familia {r.edu_familias?.nombre || ''}</td>
                    <td className="text-right font-mono">RD${n2(r.total)}</td>
                    <td className="text-right pr-3 whitespace-nowrap">
                      <Button size="sm" variant="ghost" title="Ticket" onClick={() => imprimirReciboColegio(r.id, tenantId, 'ticket').catch((e) => error('No se pudo imprimir', e?.message))}><Printer className="w-4 h-4" /></Button>
                      <Button size="sm" variant="ghost" title="Hoja" onClick={() => imprimirReciboColegio(r.id, tenantId, 'hoja').catch((e) => error('No se pudo imprimir', e?.message))}>Hoja</Button>
                      {esDireccion && !r.anulado && <Button size="sm" variant="ghost" title="Anular" onClick={() => anular(r)}><Ban className="w-4 h-4 text-red-600" /></Button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {preparar && (
        <PrepararCuentaDialog estudiante={preparar} anio={anio} onClose={() => setPreparar(null)} onError={error}
          onDone={(n) => { setPreparar(null); toast({ title: n ? `Cuenta preparada: ${n} cargos` : 'La cuenta ya estaba completa' }); abrirFamilia(familia.id); }} />
      )}
      {facturar && familia && (
        <FacturaFiscalDialog familia={familia} tenantId={tenantId} esDireccion={esDireccion} onClose={() => setFacturar(false)} onError={error}
          onDone={(r) => { setFacturar(false); toast({ title: `Factura ${r.ncf} emitida`, description: `RD${n2(r.total)}${r.restantes != null && r.restantes <= 10 ? ` · quedan ${r.restantes} NCF B01` : ''}` }); abrirFamilia(familia.id); }} />
      )}
      {agregar && (
        <AgregarCargoDialog estudiante={agregar} conceptos={conceptos} onClose={() => setAgregar(null)} onError={error}
          onDone={() => { setAgregar(null); toast({ title: 'Cargo agregado' }); abrirFamilia(familia.id); }} />
      )}
    </div>
  );
}

// Preparar la cuenta del año: desde qué mes se cobra (el colegio entra al
// sistema a mitad de año: lo anterior ya se pagó en papel) y si se cargan
// los conceptos anuales (inscripción/reservación, utilería, Sistema Bilingüe).
function PrepararCuentaDialog({ estudiante, anio, onClose, onDone, onError }) {
  const meses = mesesDelAnio(anio);   // abrirFamilia ya exige el año
  const hoy = hoyRD().slice(0, 7);
  const porDefecto = meses.find((m) => `${m.anio}-${String(m.mes).padStart(2, '0')}` >= hoy) || meses[0];
  const [desde, setDesde] = useState(porDefecto ? `${porDefecto.anio}-${String(porDefecto.mes).padStart(2, '0')}-01` : '');
  const [anuales, setAnuales] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const ok = async () => {
    if (!anio || !desde) return onError('Falta el año escolar', 'Configura el año escolar actual antes de preparar cuentas.');
    setGuardando(true);
    const { data, error } = await supabase.rpc('edu_preparar_cuenta', { p_estudiante: estudiante.id, p_desde: desde || null, p_anuales: anuales });
    setGuardando(false);
    if (error) return onError('No se pudo preparar la cuenta', error.message);
    return onDone(data);
  };
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Cuenta {anio?.nombre} · {estudiante.nombres} {estudiante.apellidos}</DialogTitle></DialogHeader>
        <label className="block text-xs font-bold text-gray-600 uppercase">
          Cobrar mensualidades desde
          <select className={`${campo} w-full mt-1`} value={desde} onChange={(e) => setDesde(e.target.value)}>
            {meses.map((m) => { const v = `${m.anio}-${String(m.mes).padStart(2, '0')}-01`; return <option key={v} value={v}>{m.nombre}</option>; })}
          </select>
          <span className="block normal-case font-normal text-gray-500 mt-1">Los meses de antes se toman como ya pagados (se cobraron antes del sistema).</span>
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-1" checked={anuales} onChange={(e) => setAnuales(e.target.checked)} />
          <span>Cargar también {estudiante.condicion === 'nuevo' ? 'la inscripción' : 'la reservación de cupo'}, la utilería y el Sistema Bilingüe (márcalo si todavía no los ha pagado).</span>
        </label>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={ok} disabled={guardando}>{guardando && <Loader2 className="w-4 h-4 mr-1 animate-spin" />} Preparar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AgregarCargoDialog({ estudiante, conceptos, onClose, onDone, onError }) {
  const opciones = conceptos.filter((c) => !['mensualidad', 'recargo'].includes(c.tipo));
  const [concepto, setConcepto] = useState(opciones[0]?.id || '');
  const c = opciones.find((x) => x.id === concepto);
  const [monto, setMonto] = useState(c ? String(Math.round(Number(c.monto) * 100) / 100) : '');
  useEffect(() => { if (c) setMonto(String(Math.round(Number(c.monto) * 100) / 100)); }, [concepto]); // eslint-disable-line react-hooks/exhaustive-deps
  const [guardando, setGuardando] = useState(false);
  const ok = async () => {
    setGuardando(true);
    const { error } = await supabase.rpc('edu_agregar_cargo', { p_estudiante: estudiante.id, p_concepto: concepto, p_monto: Number(monto) || null });
    setGuardando(false);
    if (error) return onError('No se pudo agregar', error.message);
    return onDone();
  };
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Agregar cargo · {estudiante.nombres}</DialogTitle></DialogHeader>
        <label className="block text-xs font-bold text-gray-600 uppercase">
          Concepto
          <select className={`${campo} w-full mt-1`} value={concepto} onChange={(e) => setConcepto(e.target.value)}>
            {opciones.map((o) => <option key={o.id} value={o.id}>{o.nombre} ({o.moneda === 'USD' ? 'US$' : 'RD$'}{n2(o.monto)})</option>)}
          </select>
        </label>
        <label className="block text-xs font-bold text-gray-600 uppercase">
          Monto {c?.moneda === 'USD' ? 'US$' : 'RD$'}
          <MontoInput className={`${campo} w-full mt-1`} value={monto} onChange={(v) => setMonto(v)} />
        </label>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={ok} disabled={guardando || !concepto}>Agregar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
