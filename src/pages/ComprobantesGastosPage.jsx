// ============================================================
// Comprobantes de gastos — ayudante contable, Fase 2 (12/11/2026)
// ------------------------------------------------------------
// La factura del supermercado, la gasolinera, la ferretería: se sube la
// foto, el sistema la lee (leer-comprobante) y queda "por revisar". Al
// aprobarla entra al 606 y al ITBIS estimado (Mi Contabilidad).
// No toca caja, inventario ni cuentas por pagar: es solo el documento
// fiscal. La foto se achica antes de subir (lib/imagenComprobante).
// Datos: tabla gastos_comprobantes (sql/ayudante_contable_fase2.sql);
// el trigger limpia RNC/NCF, pone el nombre de la DGII y deja los avisos.
// ============================================================
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Helmet } from 'react-helmet';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Loader2, Upload, RefreshCw, CheckCircle2, AlertTriangle, Ban, Receipt } from 'lucide-react';
import { formatFechaDMY } from '@/lib/dateUtils';
import { achicarFoto, rutaComprobante, fechaValida, TIPOS_GASTO_606, FORMAS_PAGO_606 } from '@/lib/imagenComprobante';

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const fmt = (v) => new Intl.NumberFormat('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(v) || 0);
const hoyRD = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santo_Domingo' });
const estadoDe = (f) => (
  f.estado === 'por_revisar' ? ['Por revisar', 'bg-amber-100 text-amber-800']
  : f.estado === 'descartado' ? ['Descartado', 'bg-slate-100 text-slate-500']
  : f.entra_606 ? ['Aprobado · va al 606', 'bg-emerald-100 text-emerald-800']
  : ['Aprobado · NO entra al 606', 'bg-rose-100 text-rose-800']
);
const VACIO = { fecha: '', rnc: '', proveedor_nombre: '', ncf: '', tipo_bs: 2, monto_gravado: '', monto_exento: '', itbis: '', propina: '', total: '', forma_pago: '01', nota: '' };

const ComprobantesGastosPage = () => {
  const { tenantId } = useAuth();
  const { toast } = useToast();
  const inputRef = useRef(null);
  const [periodo, setPeriodo] = useState(() => { const [y, m] = hoyRD().split('-').map(Number); return { anio: y, mes: m }; });
  const [filas, setFilas] = useState([]);
  const [loading, setLoading] = useState(false);
  const [subiendo, setSubiendo] = useState(null);       // "2 de 5"
  const [edit, setEdit] = useState(null);               // fila en el diálogo
  const [form, setForm] = useState(VACIO);
  const [fotoUrl, setFotoUrl] = useState(null);
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    const desde = `${periodo.anio}-${String(periodo.mes).padStart(2, '0')}-01`;
    const sig = periodo.mes === 12 ? `${periodo.anio + 1}-01-01` : `${periodo.anio}-${String(periodo.mes + 1).padStart(2, '0')}-01`;
    // Los del mes + TODO lo que esté por revisar, sea de la fecha que sea: si la
    // fecha se leyó mal (05/11 como 11 de mayo), el comprobante no se pierde.
    const { data, error } = await supabase.from('gastos_comprobantes').select('*')
      .or(`and(fecha.gte.${desde},fecha.lt.${sig}),estado.eq.por_revisar`)
      .order('fecha', { ascending: false }).order('creado_at', { ascending: false }).limit(1000);
    if (error) toast({ variant: 'destructive', title: 'No se pudo cargar', description: error.message });
    else setFilas(data || []);
    setLoading(false);
  }, [tenantId, periodo, toast]);

  useEffect(() => { cargar(); }, [cargar]);

  const totales = useMemo(() => filas.reduce((t, f) => {
    // Solo cuenta lo aprobado que de verdad entra al 606 (el consumo o lo sin NCF no resta).
    if (f.estado === 'aprobado' && f.entra_606) { t.aprobados++; t.itbis += Number(f.itbis) || 0; }
    else if (f.estado === 'aprobado') t.fuera++;
    else if (f.estado === 'por_revisar') t.porRevisar++;
    return t;
  }, { aprobados: 0, porRevisar: 0, itbis: 0, fuera: 0 }), [filas]);

  // Subir fotos: achicar → guardar → leer → crear la fila "por revisar".
  const subir = async (archivos) => {
    const lista = Array.from(archivos || []).filter((a) => a.type.startsWith('image/'));
    if (!lista.length) return;
    let creados = 0, sinLeer = 0, repetidos = 0, ilegibles = 0;
    // Una foto que no llegó a registrarse no se queda ocupando espacio.
    const quitarFoto = (path) => supabase.storage.from('comprobantes').remove([path]).catch(() => {});
    for (let i = 0; i < lista.length; i++) {
      setSubiendo(`${i + 1} de ${lista.length}`);
      let path = null;
      try {
        const foto = await achicarFoto(lista[i]);
        if (!foto) { ilegibles++; continue; }   // el navegador no la pudo abrir (HEIC, archivo dañado)
        path = rutaComprobante(tenantId);
        const { error: eUp } = await supabase.storage.from('comprobantes').upload(path, foto, { contentType: 'image/jpeg' });
        if (eUp) throw new Error(eUp.message);

        let d = {};
        const { data: r, error: eFn } = await supabase.functions.invoke('leer-comprobante', { body: { path } });
        if (eFn || !r?.ok) sinLeer++; else d = r.datos || {};

        const { error: eIns } = await supabase.from('gastos_comprobantes').insert({
          tenant_id: tenantId, fecha: fechaValida(d.fecha) ? d.fecha : hoyRD(), rnc: d.rnc || '', proveedor_nombre: d.proveedor_nombre || null,
          ncf: d.ncf || '', tipo_bs: d.tipo_bs || 2, monto_gravado: d.monto_gravado || 0, monto_exento: d.monto_exento || 0,
          itbis: d.itbis || 0, propina: d.propina || 0, total: d.total || 0, forma_pago: d.forma_pago || '01',
          imagen_path: path, lectura: d, origen: 'web',
        }).select('id');
        if (eIns) {
          await quitarFoto(path);
          if (/gastos_comprobantes_unico/.test(eIns.message)) repetidos++;
          else throw new Error(eIns.message);
        } else creados++;
      } catch (e) {
        toast({ variant: 'destructive', title: `No se pudo subir ${lista[i].name}`, description: e.message });
      }
    }
    setSubiendo(null);
    if (inputRef.current) inputRef.current.value = '';
    toast({
      title: `${creados} comprobante(s) subido(s)`,
      description: [
        sinLeer ? `${sinLeer} no se pudieron leer: complete los datos a mano.` : null,
        repetidos ? `${repetidos} ya estaban registrados (mismo RNC y NCF) y no se repitieron.` : null,
        ilegibles ? `${ilegibles} foto(s) no se pudieron abrir (¿formato HEIC del iPhone?): guárdelas como JPG o tómelas desde la app.` : null,
        'Revise cada uno y apruébelo para que entre al 606.',
      ].filter(Boolean).join(' '),
      duration: 9000,
    });
    cargar();
  };

  const abrir = async (f) => {
    setEdit(f);
    setForm({
      fecha: f.fecha, rnc: f.rnc || '', proveedor_nombre: f.proveedor_nombre || '', ncf: f.ncf || '', tipo_bs: f.tipo_bs || 2,
      monto_gravado: String(f.monto_gravado ?? ''), monto_exento: String(f.monto_exento ?? ''), itbis: String(f.itbis ?? ''),
      propina: String(f.propina ?? ''), total: String(f.total ?? ''), forma_pago: f.forma_pago || '01', nota: f.nota || '',
    });
    setFotoUrl(null);
    if (f.imagen_path) {
      const { data } = await supabase.storage.from('comprobantes').createSignedUrl(f.imagen_path, 600);
      setFotoUrl(data?.signedUrl || null);
    }
  };

  const num = (v) => { const n = Number(String(v ?? '').replace(/,/g, '')); return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : 0; };

  const guardar = async (estado) => {
    if (!edit) return;
    if (!fechaValida(form.fecha)) { toast({ variant: 'destructive', title: 'Fecha inválida', description: 'Revise la fecha de la factura.' }); return; }
    setGuardando(true);
    const { data, error } = await supabase.from('gastos_comprobantes').update({
      fecha: form.fecha, rnc: form.rnc, proveedor_nombre: form.proveedor_nombre.trim() || null, ncf: form.ncf,
      tipo_bs: Number(form.tipo_bs), monto_gravado: num(form.monto_gravado), monto_exento: num(form.monto_exento),
      itbis: num(form.itbis), propina: num(form.propina), total: num(form.total), forma_pago: form.forma_pago,
      nota: form.nota.trim() || null, ...(estado ? { estado } : {}),
    }).eq('id', edit.id).select('*');
    setGuardando(false);
    if (error) {
      toast({
        variant: 'destructive', title: 'No se pudo guardar',
        description: /gastos_comprobantes_unico/.test(error.message) ? 'Ya hay otro comprobante con ese mismo RNC y NCF.' : error.message,
      });
      return;
    }
    const fila = data?.[0];
    if (!fila) { toast({ variant: 'destructive', title: 'No se guardó', description: 'El comprobante ya no existe o no tiene permiso.' }); return; }
    if (estado === 'aprobado' && !fila.entra_606) {
      toast({ variant: 'destructive', title: 'Aprobado, pero NO entra al 606', description: fila.avisos?.join(' ') || 'Revise el NCF y el RNC.', duration: 12000 });
    } else if (estado === 'aprobado' && fila.avisos?.length) {
      toast({ title: 'Aprobado con avisos', description: fila.avisos.join(' '), duration: 10000 });
    } else if (estado) toast({ title: estado === 'aprobado' ? 'Aprobado: entra al 606' : 'Descartado' });
    setEdit(null);
    cargar();
  };

  const campo = (k) => ({ value: form[k], onChange: (e) => setForm((p) => ({ ...p, [k]: e.target.value })) });
  const anios = [periodo.anio - 1, periodo.anio, periodo.anio + 1];

  return (
    <div className="p-3 bg-slate-100 min-h-full">
      <Helmet><title>Comprobantes de Gastos</title></Helmet>
      <div className="max-w-6xl mx-auto space-y-3">
        <div className="bg-white rounded-lg border shadow-sm p-3 flex flex-wrap items-center gap-2">
          <Receipt className="w-5 h-5 text-blue-700" />
          <h1 className="text-lg font-extrabold text-slate-800 mr-auto">Comprobantes de Gastos</h1>
          <select value={periodo.mes} onChange={(e) => setPeriodo((p) => ({ ...p, mes: Number(e.target.value) }))}
            className="h-9 rounded-md border border-slate-300 bg-white px-2 text-sm">
            {MESES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
          <select value={periodo.anio} onChange={(e) => setPeriodo((p) => ({ ...p, anio: Number(e.target.value) }))}
            className="h-9 rounded-md border border-slate-300 bg-white px-2 text-sm">
            {anios.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          <Button variant="outline" size="sm" onClick={cargar} disabled={loading}><RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /></Button>
          <input ref={inputRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => subir(e.target.files)} />
          <Button onClick={() => inputRef.current?.click()} disabled={!!subiendo}>
            {subiendo ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" />Subiendo {subiendo}…</> : <><Upload className="w-4 h-4 mr-1" />Subir fotos de facturas</>}
          </Button>
        </div>

        <div className="bg-white rounded-lg border shadow-sm px-3 py-2 text-xs text-slate-600 flex flex-wrap gap-x-5 gap-y-1">
          <span>Aprobados: <b>{totales.aprobados}</b> · ITBIS que restan: <b className="text-emerald-700">RD$ {fmt(totales.itbis)}</b></span>
          <span>Por revisar: <b className={totales.porRevisar ? 'text-amber-700' : ''}>{totales.porRevisar}</b></span>
          {totales.fuera > 0 && <span className="text-rose-700">Aprobados que NO entran al 606: <b>{totales.fuera}</b></span>}
          <span className="text-slate-400">Solo cuentan los aprobados. La foto se guarda achicada y se conserva (la ley pide 10 años).</span>
        </div>

        <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
          <div className="overflow-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-100 text-gray-700 font-bold border-b">
                <tr>
                  <th className="text-left px-2 py-1.5">Fecha</th>
                  <th className="text-left px-2 py-1.5">Suplidor</th>
                  <th className="text-left px-2 py-1.5">RNC</th>
                  <th className="text-left px-2 py-1.5">NCF</th>
                  <th className="text-right px-2 py-1.5">ITBIS</th>
                  <th className="text-right px-2 py-1.5">Total</th>
                  <th className="text-left px-2 py-1.5">Estado</th>
                  <th className="px-2 py-1.5"></th>
                </tr>
              </thead>
              <tbody>
                {loading && !filas.length && <tr><td colSpan={8} className="p-8 text-center text-slate-400"><Loader2 className="w-5 h-5 animate-spin inline" /></td></tr>}
                {!loading && !filas.length && (
                  <tr><td colSpan={8} className="p-10 text-center text-slate-400 italic">
                    No hay comprobantes en {MESES[periodo.mes - 1]}. Suba la foto de cada factura de gasto que tenga NCF a nombre de la empresa.
                  </td></tr>
                )}
                {filas.map((f) => {
                  const [txt, tono] = estadoDe(f);
                  return (
                    <tr key={f.id} className="border-b last:border-0 hover:bg-slate-50 cursor-pointer" onClick={() => abrir(f)}>
                      <td className="px-2 py-1.5 whitespace-nowrap">{formatFechaDMY(f.fecha)}</td>
                      <td className="px-2 py-1.5 truncate max-w-[220px]">{f.proveedor_nombre || <span className="text-slate-400">—</span>}</td>
                      <td className="px-2 py-1.5 font-mono">{f.rnc || '—'}</td>
                      <td className="px-2 py-1.5 font-mono">{f.ncf || '—'}</td>
                      <td className="px-2 py-1.5 text-right">{fmt(f.itbis)}</td>
                      <td className="px-2 py-1.5 text-right font-semibold">{fmt(f.total)}</td>
                      <td className="px-2 py-1.5">
                        <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${tono}`}>{txt}</span>
                        {f.estado !== 'descartado' && f.avisos?.length > 0 && (
                          <span className="ml-1 inline-flex items-center text-amber-700" title={f.avisos.join('\n')}>
                            <AlertTriangle className="w-3.5 h-3.5" /> {f.avisos.length}
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-1.5 text-right text-blue-700 font-semibold">Revisar</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Revisar un comprobante */}
      <Dialog open={!!edit} onOpenChange={(o) => { if (!o) setEdit(null); }}>
        <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Revisar comprobante</DialogTitle></DialogHeader>
          {edit && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-slate-100 rounded-md border min-h-[300px] flex items-center justify-center overflow-hidden">
                {fotoUrl ? (
                  <a href={fotoUrl} target="_blank" rel="noopener noreferrer" title="Abrir la foto en grande">
                    <img src={fotoUrl} alt="Comprobante" className="max-h-[70vh] w-full object-contain" />
                  </a>
                ) : <span className="text-xs text-slate-400">{edit.imagen_path ? 'Cargando la foto…' : 'Sin foto'}</span>}
              </div>
              <div className="space-y-2">
                {edit.avisos?.length > 0 && (
                  <div className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900 space-y-0.5">
                    {edit.avisos.map((a) => <div key={a}>• {a}</div>)}
                  </div>
                )}
                <div className="grid grid-cols-2 gap-2">
                  <div><Label className="text-xs">Fecha de la factura</Label><Input type="date" className="h-8 text-sm" {...campo('fecha')} /></div>
                  <div><Label className="text-xs">NCF</Label><Input className="h-8 text-sm font-mono uppercase" placeholder="B0100001234" {...campo('ncf')} /></div>
                  <div><Label className="text-xs">RNC o cédula del suplidor</Label><Input className="h-8 text-sm font-mono" inputMode="numeric" {...campo('rnc')} /></div>
                  <div><Label className="text-xs">Nombre del suplidor</Label><Input className="h-8 text-sm" placeholder="Se completa con la DGII" {...campo('proveedor_nombre')} /></div>
                  <div><Label className="text-xs">Monto gravado (sin ITBIS)</Label><Input className="h-8 text-sm text-right" inputMode="decimal" {...campo('monto_gravado')} /></div>
                  <div><Label className="text-xs">Monto exento</Label><Input className="h-8 text-sm text-right" inputMode="decimal" {...campo('monto_exento')} /></div>
                  <div><Label className="text-xs">ITBIS</Label><Input className="h-8 text-sm text-right" inputMode="decimal" {...campo('itbis')} /></div>
                  <div><Label className="text-xs">Propina legal</Label><Input className="h-8 text-sm text-right" inputMode="decimal" {...campo('propina')} /></div>
                  <div><Label className="text-xs">Total</Label><Input className="h-8 text-sm text-right font-bold" inputMode="decimal" {...campo('total')} /></div>
                  <div>
                    <Label className="text-xs">Forma de pago</Label>
                    <select className="h-8 w-full rounded-md border border-input bg-white px-2 text-sm" {...campo('forma_pago')}>
                      {FORMAS_PAGO_606.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Tipo de gasto (606)</Label>
                  <select className="h-8 w-full rounded-md border border-input bg-white px-2 text-sm" {...campo('tipo_bs')}>
                    {TIPOS_GASTO_606.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
                <div><Label className="text-xs">Nota</Label><Input className="h-8 text-sm" {...campo('nota')} /></div>
                <div className="text-[11px] text-slate-500">
                  Compare los datos con la foto. Al guardar, el sistema revisa el NCF y busca el RNC en el listado de la DGII.
                </div>
              </div>
            </div>
          )}
          <DialogFooter className="gap-2 flex-wrap">
            <Button variant="ghost" className="text-rose-700 mr-auto" disabled={guardando} onClick={() => guardar('descartado')}>
              <Ban className="w-4 h-4 mr-1" />Descartar
            </Button>
            <Button variant="outline" disabled={guardando} onClick={() => guardar(edit?.estado === 'descartado' ? 'por_revisar' : null)}>Guardar sin aprobar</Button>
            <Button disabled={guardando} onClick={() => guardar('aprobado')}>
              {guardando ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-1" />}Aprobar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ComprobantesGastosPage;
