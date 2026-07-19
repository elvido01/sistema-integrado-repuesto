import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Loader2, RefreshCw, Users, Wallet, HandCoins, Ban, Plus, Pencil } from 'lucide-react';
import { formatFechaDMY } from '@/lib/dateUtils';
import { calcularDetalleNomina, pendienteAdelanto } from '@/lib/nominaUtils';

const money = (v) => `RD$ ${new Intl.NumberFormat('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(v) || 0)}`;
const hoyTZ = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santo_Domingo' });

const FRECUENCIAS = [
  { value: 'quincenal', label: 'Quincenal' },
  { value: 'semanal', label: 'Semanal' },
  { value: 'mensual', label: 'Mensual' },
];

// Período sugerido según la frecuencia y la fecha de hoy
function periodoSugerido(frecuencia) {
  const hoy = new Date(`${hoyTZ()}T12:00:00`);
  const y = hoy.getFullYear(), m = hoy.getMonth(), d = hoy.getDate();
  const iso = (dt) => dt.toLocaleDateString('en-CA');
  if (frecuencia === 'quincenal') {
    if (d <= 15) return { desde: iso(new Date(y, m, 1)), hasta: iso(new Date(y, m, 15)) };
    return { desde: iso(new Date(y, m, 16)), hasta: iso(new Date(y, m + 1, 0)) };
  }
  if (frecuencia === 'semanal') {
    const dow = (hoy.getDay() + 6) % 7; // lunes = 0
    const lunes = new Date(y, m, d - dow);
    const sabado = new Date(y, m, d - dow + 5);
    return { desde: iso(lunes), hasta: iso(sabado) };
  }
  return { desde: iso(new Date(y, m, 1)), hasta: iso(new Date(y, m + 1, 0)) };
}

const EMPLEADO_VACIO = {
  nombre: '', cedula: '', telefono: '', puesto: '', sueldo_mensual: '',
  frecuencia_pago: 'quincenal', cotiza_tss: false, activo: true,
};

const NominaPage = () => {
  const { toast } = useToast();
  const [tab, setTab] = useState('nominas');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  const [empleados, setEmpleados] = useState([]);
  const [nominas, setNominas] = useState([]);
  const [adelantos, setAdelantos] = useState([]);

  // detalle de la nómina seleccionada
  const [nominaSel, setNominaSel] = useState(null);
  const [detalle, setDetalle] = useState([]);

  // modales
  const [empEdit, setEmpEdit] = useState(null);          // empleado en edición (o EMPLEADO_VACIO)
  const [genOpen, setGenOpen] = useState(false);
  const [genForm, setGenForm] = useState({ frecuencia: 'quincenal', ...periodoSugerido('quincenal'), fecha_pago: hoyTZ() });
  const [pagarOpen, setPagarOpen] = useState(false);
  const [formaPago, setFormaPago] = useState('Efectivo');
  const [adelOpen, setAdelOpen] = useState(false);
  const [adelForm, setAdelForm] = useState({ empleado_id: '', monto: '', descripcion: '' });
  const [lineaEdit, setLineaEdit] = useState(null);      // línea de detalle en edición
  const [lineaForm, setLineaForm] = useState({ otros_ingresos: '', otros_descuentos: '', adelanto: '', notas: '' });

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const [emp, nom, adel] = await Promise.all([
        supabase.from('empleados').select('*').order('nombre'),
        supabase.from('nominas').select('*').order('numero', { ascending: false }).limit(60),
        supabase.from('nomina_adelantos_pendientes').select('*').order('fecha', { ascending: false }).limit(200),
      ]);
      if (emp.error) throw emp.error;
      if (nom.error) throw nom.error;
      if (adel.error) throw adel.error;
      setEmpleados(emp.data || []);
      setNominas(nom.data || []);
      setAdelantos(adel.data || []);
    } catch (e) {
      toast({ variant: 'destructive', title: 'No se pudo cargar Nómina', description: e.message });
    }
    setLoading(false);
  }, [toast]);

  useEffect(() => { cargar(); }, [cargar]);

  const abrirNomina = useCallback(async (n) => {
    setNominaSel(n);
    const { data, error } = await supabase.from('nomina_detalle')
      .select('*, empleados(nombre, puesto)').eq('nomina_id', n.id).order('id');
    if (error) { toast({ variant: 'destructive', title: 'Error', description: error.message }); return; }
    setDetalle(data || []);
  }, [toast]);

  const refrescarSeleccion = useCallback(async (nominaId) => {
    await cargar();
    const { data } = await supabase.from('nominas').select('*').eq('id', nominaId).single();
    if (data) await abrirNomina(data);
  }, [cargar, abrirNomina]);

  // ------- empleados -------
  const guardarEmpleado = async () => {
    const f = empEdit;
    if (!f.nombre.trim()) { toast({ variant: 'destructive', title: 'Falta el nombre' }); return; }
    const sueldo = Number(String(f.sueldo_mensual).replace(/,/g, '')) || 0;
    setBusy(true);
    try {
      const payload = {
        nombre: f.nombre.trim(), cedula: f.cedula || null, telefono: f.telefono || null,
        puesto: f.puesto || null, sueldo_mensual: sueldo, frecuencia_pago: f.frecuencia_pago,
        cotiza_tss: !!f.cotiza_tss, activo: !!f.activo,
      };
      const q = f.id
        ? supabase.from('empleados').update(payload).eq('id', f.id)
        : supabase.from('empleados').insert(payload);
      const { error } = await q;
      if (error) throw error;
      toast({ title: f.id ? 'Empleado actualizado' : 'Empleado creado' });
      setEmpEdit(null);
      await cargar();
    } catch (e) {
      toast({ variant: 'destructive', title: 'No se pudo guardar', description: e.message });
    }
    setBusy(false);
  };

  // ------- nóminas -------
  const generar = async () => {
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc('nomina_generar', {
        p_frecuencia: genForm.frecuencia, p_desde: genForm.desde,
        p_hasta: genForm.hasta, p_fecha_pago: genForm.fecha_pago,
      });
      if (error) throw error;
      toast({ title: `Nómina generada (${data.empleados} empleados)`, description: `Neto: ${money(data.total_neto)} — ya aparece en Compromisos a Pagar` });
      setGenOpen(false);
      await refrescarSeleccion(data.nomina_id);
      setTab('nominas');
    } catch (e) {
      toast({ variant: 'destructive', title: 'No se pudo generar', description: e.message });
    }
    setBusy(false);
  };

  const pagar = async () => {
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc('nomina_pagar', { p_nomina_id: nominaSel.id, p_forma_pago: formaPago });
      if (error) throw error;
      toast({ title: 'Nómina pagada', description: `${money(data.total_neto)} (${formaPago}) — compromiso saldado` });
      setPagarOpen(false);
      await refrescarSeleccion(nominaSel.id);
    } catch (e) {
      toast({ variant: 'destructive', title: 'No se pudo pagar', description: e.message });
    }
    setBusy(false);
  };

  const anular = async () => {
    setBusy(true);
    try {
      const { error } = await supabase.rpc('nomina_anular', { p_nomina_id: nominaSel.id });
      if (error) throw error;
      toast({ title: 'Nómina anulada', description: 'Los adelantos propuestos quedaron pendientes de nuevo.' });
      await refrescarSeleccion(nominaSel.id);
    } catch (e) {
      toast({ variant: 'destructive', title: 'No se pudo anular', description: e.message });
    }
    setBusy(false);
  };

  const abrirLinea = (d) => {
    setLineaForm({
      otros_ingresos: String(d.otros_ingresos || ''),
      otros_descuentos: String(d.otros_descuentos || ''),
      adelanto: String(d.adelantos || ''),
      notas: d.notas || '',
    });
    setLineaEdit(d);
  };

  const guardarLinea = async () => {
    setBusy(true);
    try {
      const { error } = await supabase.rpc('nomina_actualizar_detalle', {
        p_detalle_id: lineaEdit.id,
        p_otros_ingresos: lineaForm.otros_ingresos === '' ? null : Number(lineaForm.otros_ingresos) || 0,
        p_otros_descuentos: lineaForm.otros_descuentos === '' ? null : Number(lineaForm.otros_descuentos) || 0,
        p_adelanto_descuento: lineaForm.adelanto === '' ? null : Number(lineaForm.adelanto) || 0,
        p_notas: lineaForm.notas.trim() || null,
      });
      if (error) throw error;
      toast({ title: 'Línea actualizada' });
      setLineaEdit(null);
      await refrescarSeleccion(nominaSel.id);
    } catch (e) {
      toast({ variant: 'destructive', title: 'No se pudo actualizar', description: e.message });
    }
    setBusy(false);
  };

  // ------- adelantos -------
  const registrarAdelanto = async () => {
    const monto = Number(String(adelForm.monto).replace(/,/g, '')) || 0;
    if (!adelForm.empleado_id || monto <= 0) {
      toast({ variant: 'destructive', title: 'Elige el empleado y un monto válido' });
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.rpc('nomina_registrar_adelanto', {
        p_empleado_id: adelForm.empleado_id, p_monto: monto,
        p_descripcion: adelForm.descripcion.trim() || null,
      });
      if (error) throw error;
      toast({ title: 'Adelanto registrado', description: 'Salió por Gastos Diarios de hoy y se descontará en la próxima nómina.' });
      setAdelOpen(false);
      setAdelForm({ empleado_id: '', monto: '', descripcion: '' });
      await cargar();
    } catch (e) {
      toast({ variant: 'destructive', title: 'No se pudo registrar', description: e.message });
    }
    setBusy(false);
  };

  // ------- resumen -------
  const resumen = useMemo(() => {
    const activos = empleados.filter((e) => e.activo);
    const pendiente = adelantos.reduce((s, a) => s + pendienteAdelanto(a), 0);
    const proxima = activos.reduce((s, e) => s + calcularDetalleNomina(e, {}).neto, 0);
    const borradores = nominas.filter((n) => n.estado === 'borrador').length;
    return { activos: activos.length, pendiente, proxima, borradores };
  }, [empleados, adelantos, nominas]);

  const estadoTone = (e) => e === 'pagada' ? 'bg-emerald-100 text-emerald-700'
    : e === 'anulada' ? 'bg-slate-200 text-slate-500' : 'bg-amber-100 text-amber-700';

  const chip = (valor, etiqueta, tone) => (
    <div className={`rounded-lg px-3 py-2 text-center ${tone}`}>
      <div className="text-lg font-bold leading-none">{valor}</div>
      <div className="text-[11px] mt-1">{etiqueta}</div>
    </div>
  );

  return (
    <div className="p-4 space-y-4">
      <Helmet><title>Nómina</title></Helmet>

      <div className="flex flex-wrap items-center gap-3">
        <Wallet className="w-6 h-6 text-emerald-600" />
        <h1 className="text-xl font-bold">Nómina</h1>
        <span className="text-sm text-muted-foreground">Sueldos, TSS opcional, adelantos por gastos diarios y pago vía Compromisos.</span>
        <Button variant="outline" size="sm" className="ml-auto" onClick={cargar} disabled={loading}>
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
        </Button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {chip(resumen.activos, 'Empleados activos', 'bg-indigo-50 text-indigo-800')}
        {chip(money(resumen.proxima), 'Neto estimado por período', 'bg-emerald-50 text-emerald-800')}
        {chip(money(resumen.pendiente), 'Adelantos pendientes', 'bg-amber-50 text-amber-800')}
        {chip(resumen.borradores, 'Nóminas en borrador', 'bg-rose-50 text-rose-800')}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {[['nominas', 'Nóminas'], ['empleados', 'Empleados'], ['adelantos', 'Adelantos']].map(([id, label]) => (
          <Button key={id} size="sm" variant={tab === id ? 'default' : 'outline'} onClick={() => setTab(id)}>{label}</Button>
        ))}
        {tab === 'nominas' && (
          <Button size="sm" className="ml-auto" onClick={() => { setGenForm({ frecuencia: 'quincenal', ...periodoSugerido('quincenal'), fecha_pago: hoyTZ() }); setGenOpen(true); }}>
            <Plus className="w-4 h-4 mr-1" />Generar nómina
          </Button>
        )}
        {tab === 'empleados' && (
          <Button size="sm" className="ml-auto" onClick={() => setEmpEdit({ ...EMPLEADO_VACIO })}>
            <Plus className="w-4 h-4 mr-1" />Nuevo empleado
          </Button>
        )}
        {tab === 'adelantos' && (
          <Button size="sm" className="ml-auto" onClick={() => setAdelOpen(true)}>
            <HandCoins className="w-4 h-4 mr-1" />Registrar adelanto
          </Button>
        )}
      </div>

      {/* ================= NÓMINAS ================= */}
      {tab === 'nominas' && (
        <div className="grid lg:grid-cols-2 gap-4">
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/60 text-left">
                <tr><th className="px-3 py-2">#</th><th className="px-3 py-2">Período</th><th className="px-3 py-2">Frecuencia</th>
                    <th className="px-3 py-2">Pago</th><th className="px-3 py-2 text-right">Neto</th><th className="px-3 py-2">Estado</th></tr>
              </thead>
              <tbody>
                {nominas.length === 0 ? (
                  <tr><td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">Sin nóminas todavía — genera la primera.</td></tr>
                ) : nominas.map((n) => (
                  <tr key={n.id} className={`border-t cursor-pointer hover:bg-muted/30 ${nominaSel?.id === n.id ? 'bg-muted/40' : ''}`}
                      onClick={() => abrirNomina(n)}>
                    <td className="px-3 py-2">{n.numero}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{formatFechaDMY(n.fecha_desde)} – {formatFechaDMY(n.fecha_hasta)}</td>
                    <td className="px-3 py-2">{n.frecuencia}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{formatFechaDMY(n.fecha_pago)}</td>
                    <td className="px-3 py-2 text-right font-medium">{money(n.total_neto)}</td>
                    <td className="px-3 py-2"><span className={`px-2 py-0.5 rounded-full text-xs ${estadoTone(n.estado)}`}>{n.estado}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="rounded-lg border p-3">
            {!nominaSel ? (
              <div className="text-center text-muted-foreground py-10">Selecciona una nómina para ver el detalle.</div>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <div className="font-semibold">Nómina #{nominaSel.numero} · {nominaSel.frecuencia}</div>
                  <span className={`px-2 py-0.5 rounded-full text-xs ${estadoTone(nominaSel.estado)}`}>{nominaSel.estado}</span>
                  {nominaSel.estado === 'borrador' && (
                    <div className="ml-auto flex gap-2">
                      <Button size="sm" onClick={() => setPagarOpen(true)}><Wallet className="w-4 h-4 mr-1" />Pagar</Button>
                      <Button size="sm" variant="outline" className="text-red-600 border-red-300" onClick={anular} disabled={busy}>
                        <Ban className="w-4 h-4 mr-1" />Anular
                      </Button>
                    </div>
                  )}
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/60 text-left">
                      <tr><th className="px-2 py-1">Empleado</th><th className="px-2 py-1 text-right">Sueldo</th>
                          <th className="px-2 py-1 text-right">TSS</th><th className="px-2 py-1 text-right">ISR</th>
                          <th className="px-2 py-1 text-right">Adelantos</th><th className="px-2 py-1 text-right">Otros +/-</th>
                          <th className="px-2 py-1 text-right">Neto</th><th className="px-2 py-1"></th></tr>
                    </thead>
                    <tbody>
                      {detalle.map((d) => (
                        <tr key={d.id} className="border-t">
                          <td className="px-2 py-1">{d.empleados?.nombre}</td>
                          <td className="px-2 py-1 text-right">{money(d.sueldo_base)}</td>
                          <td className="px-2 py-1 text-right">{money(Number(d.tss_afp) + Number(d.tss_sfs))}</td>
                          <td className="px-2 py-1 text-right">{money(d.isr)}</td>
                          <td className="px-2 py-1 text-right text-amber-700">{money(d.adelantos)}</td>
                          <td className="px-2 py-1 text-right">{money(Number(d.otros_ingresos) - Number(d.otros_descuentos))}</td>
                          <td className="px-2 py-1 text-right font-semibold">{money(d.neto)}</td>
                          <td className="px-2 py-1">
                            {nominaSel.estado === 'borrador' && (
                              <Button size="sm" variant="ghost" title="Editar línea (otros +/- y adelanto fraccionable)"
                                onClick={() => abrirLinea(d)}><Pencil className="w-4 h-4" /></Button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t font-semibold">
                        <td className="px-2 py-1">Totales</td>
                        <td className="px-2 py-1 text-right">{money(nominaSel.total_bruto)}</td>
                        <td className="px-2 py-1 text-right">{money(nominaSel.total_tss)}</td>
                        <td className="px-2 py-1 text-right">{money(nominaSel.total_isr)}</td>
                        <td className="px-2 py-1 text-right">{money(nominaSel.total_adelantos)}</td>
                        <td className="px-2 py-1 text-right">{money(Number(nominaSel.total_otros_ingresos) - Number(nominaSel.total_otros_descuentos))}</td>
                        <td className="px-2 py-1 text-right">{money(nominaSel.total_neto)}</td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  El neto de la nómina vive como compromiso en el dashboard (Compromisos a Pagar) hasta que se paga.
                  Los adelantos no se restan dos veces: salieron de caja el día que se dieron.
                </p>
              </>
            )}
          </div>
        </div>
      )}

      {/* ================= EMPLEADOS ================= */}
      {tab === 'empleados' && (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 text-left">
              <tr><th className="px-3 py-2">Nombre</th><th className="px-3 py-2">Puesto</th><th className="px-3 py-2">Teléfono</th>
                  <th className="px-3 py-2 text-right">Sueldo mensual</th><th className="px-3 py-2">Frecuencia</th>
                  <th className="px-3 py-2">TSS</th><th className="px-3 py-2">Estado</th><th className="px-3 py-2"></th></tr>
            </thead>
            <tbody>
              {empleados.length === 0 ? (
                <tr><td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">Sin empleados — crea el primero.</td></tr>
              ) : empleados.map((e) => (
                <tr key={e.id} className="border-t hover:bg-muted/30">
                  <td className="px-3 py-2 font-medium">{e.nombre}</td>
                  <td className="px-3 py-2">{e.puesto || '—'}</td>
                  <td className="px-3 py-2">{e.telefono || '—'}</td>
                  <td className="px-3 py-2 text-right">{money(e.sueldo_mensual)}</td>
                  <td className="px-3 py-2">{e.frecuencia_pago}</td>
                  <td className="px-3 py-2">{e.cotiza_tss ? 'Cotiza' : 'No'}</td>
                  <td className="px-3 py-2">
                    <span className={`px-2 py-0.5 rounded-full text-xs ${e.activo ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-500'}`}>
                      {e.activo ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <Button size="sm" variant="ghost" onClick={() => setEmpEdit({ ...e })}><Pencil className="w-4 h-4" /></Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ================= ADELANTOS ================= */}
      {tab === 'adelantos' && (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 text-left">
              <tr><th className="px-3 py-2">Empleado</th><th className="px-3 py-2">Fecha</th>
                  <th className="px-3 py-2 text-right">Monto</th><th className="px-3 py-2 text-right">Descontado</th>
                  <th className="px-3 py-2 text-right">Pendiente</th></tr>
            </thead>
            <tbody>
              {adelantos.length === 0 ? (
                <tr><td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">
                  Sin adelantos. Al registrar uno, sale por Gastos Diarios de hoy y se descuenta en la próxima nómina.
                </td></tr>
              ) : adelantos.map((a) => (
                <tr key={a.gasto_id} className="border-t">
                  <td className="px-3 py-2 font-medium">{a.empleado}</td>
                  <td className="px-3 py-2">{formatFechaDMY(a.fecha)}</td>
                  <td className="px-3 py-2 text-right">{money(a.monto)}</td>
                  <td className="px-3 py-2 text-right">{money(a.descontado)}</td>
                  <td className={`px-3 py-2 text-right font-semibold ${pendienteAdelanto(a) > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>
                    {money(a.pendiente)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ---------- modal empleado ---------- */}
      <Dialog open={!!empEdit} onOpenChange={(o) => !o && setEmpEdit(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{empEdit?.id ? 'Editar empleado' : 'Nuevo empleado'}</DialogTitle></DialogHeader>
          {empEdit && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="text-sm font-medium">Nombre *</label>
                  <Input value={empEdit.nombre} onChange={(e) => setEmpEdit((p) => ({ ...p, nombre: e.target.value }))} />
                </div>
                <div><label className="text-sm font-medium">Cédula</label>
                  <Input value={empEdit.cedula || ''} onChange={(e) => setEmpEdit((p) => ({ ...p, cedula: e.target.value }))} /></div>
                <div><label className="text-sm font-medium">Teléfono</label>
                  <Input value={empEdit.telefono || ''} onChange={(e) => setEmpEdit((p) => ({ ...p, telefono: e.target.value }))} /></div>
                <div><label className="text-sm font-medium">Puesto</label>
                  <Input value={empEdit.puesto || ''} onChange={(e) => setEmpEdit((p) => ({ ...p, puesto: e.target.value }))} /></div>
                <div><label className="text-sm font-medium">Sueldo mensual (RD$)</label>
                  <Input type="number" value={empEdit.sueldo_mensual} onChange={(e) => setEmpEdit((p) => ({ ...p, sueldo_mensual: e.target.value }))} /></div>
                <div>
                  <label className="text-sm font-medium">Frecuencia de pago</label>
                  <Select value={empEdit.frecuencia_pago} onValueChange={(v) => setEmpEdit((p) => ({ ...p, frecuencia_pago: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{FRECUENCIAS.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="flex items-end gap-4 pb-1">
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={!!empEdit.cotiza_tss}
                      onChange={(e) => setEmpEdit((p) => ({ ...p, cotiza_tss: e.target.checked }))} />
                    Cotiza TSS (AFP+SFS)
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={!!empEdit.activo}
                      onChange={(e) => setEmpEdit((p) => ({ ...p, activo: e.target.checked }))} />
                    Activo
                  </label>
                </div>
              </div>
              {empEdit.sueldo_mensual > 0 && (
                <p className="text-xs text-muted-foreground">
                  Estimado por {empEdit.frecuencia_pago}: {money(calcularDetalleNomina({
                    sueldo_mensual: Number(empEdit.sueldo_mensual) || 0,
                    frecuencia_pago: empEdit.frecuencia_pago,
                    cotiza_tss: !!empEdit.cotiza_tss,
                  }, {}).neto)} neto
                </p>
              )}
            </div>
          )}
          <DialogFooter>
            <DialogClose asChild><Button variant="outline" disabled={busy}>Cancelar</Button></DialogClose>
            <Button onClick={guardarEmpleado} disabled={busy}>
              {busy ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---------- modal generar ---------- */}
      <Dialog open={genOpen} onOpenChange={setGenOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Generar nómina</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium">Frecuencia</label>
              <Select value={genForm.frecuencia}
                onValueChange={(v) => setGenForm({ frecuencia: v, ...periodoSugerido(v), fecha_pago: hoyTZ() })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{FRECUENCIAS.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-sm font-medium">Desde</label>
                <Input type="date" value={genForm.desde} onChange={(e) => setGenForm((p) => ({ ...p, desde: e.target.value }))} /></div>
              <div><label className="text-sm font-medium">Hasta</label>
                <Input type="date" value={genForm.hasta} onChange={(e) => setGenForm((p) => ({ ...p, hasta: e.target.value }))} /></div>
            </div>
            <div><label className="text-sm font-medium">Fecha de pago</label>
              <Input type="date" value={genForm.fecha_pago} onChange={(e) => setGenForm((p) => ({ ...p, fecha_pago: e.target.value }))} /></div>
            <p className="text-xs text-muted-foreground">
              Entra todo empleado ACTIVO con esa frecuencia. Los adelantos pendientes se proponen completos
              (puedes fraccionarlos línea por línea antes de pagar). El neto aparece de una vez en Compromisos a Pagar.
            </p>
          </div>
          <DialogFooter>
            <DialogClose asChild><Button variant="outline" disabled={busy}>Cancelar</Button></DialogClose>
            <Button onClick={generar} disabled={busy}>
              {busy ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}Generar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---------- modal pagar ---------- */}
      <Dialog open={pagarOpen} onOpenChange={setPagarOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Pagar nómina #{nominaSel?.numero}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="text-2xl font-bold text-center">{money(nominaSel?.total_neto)}</div>
            <div>
              <label className="text-sm font-medium">Forma de pago</label>
              <Select value={formaPago} onValueChange={setFormaPago}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Efectivo">Efectivo</SelectItem>
                  <SelectItem value="Transferencia">Transferencia</SelectItem>
                  <SelectItem value="Cheque">Cheque</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild><Button variant="outline" disabled={busy}>Cancelar</Button></DialogClose>
            <Button onClick={pagar} disabled={busy}>
              {busy ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}Confirmar pago
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---------- modal línea ---------- */}
      <Dialog open={!!lineaEdit} onOpenChange={(o) => !o && setLineaEdit(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Editar línea — {lineaEdit?.empleados?.nombre}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-sm font-medium">Otros ingresos (bono/extra)</label>
                <Input type="number" value={lineaForm.otros_ingresos}
                  onChange={(e) => setLineaForm((p) => ({ ...p, otros_ingresos: e.target.value }))} /></div>
              <div><label className="text-sm font-medium">Otros descuentos</label>
                <Input type="number" value={lineaForm.otros_descuentos}
                  onChange={(e) => setLineaForm((p) => ({ ...p, otros_descuentos: e.target.value }))} /></div>
            </div>
            <div>
              <label className="text-sm font-medium">Descuento de adelantos en ESTA nómina</label>
              <Input type="number" value={lineaForm.adelanto}
                onChange={(e) => setLineaForm((p) => ({ ...p, adelanto: e.target.value }))} />
              <p className="text-xs text-muted-foreground mt-1">
                Bájalo para fraccionar: lo que no se descuente aquí queda pendiente para la próxima nómina.
              </p>
            </div>
            <div><label className="text-sm font-medium">Nota</label>
              <Textarea rows={2} value={lineaForm.notas}
                onChange={(e) => setLineaForm((p) => ({ ...p, notas: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <DialogClose asChild><Button variant="outline" disabled={busy}>Cancelar</Button></DialogClose>
            <Button onClick={guardarLinea} disabled={busy}>
              {busy ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---------- modal adelanto ---------- */}
      <Dialog open={adelOpen} onOpenChange={setAdelOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Registrar adelanto de sueldo</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium">Empleado</label>
              <Select value={adelForm.empleado_id} onValueChange={(v) => setAdelForm((p) => ({ ...p, empleado_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Elegir empleado…" /></SelectTrigger>
                <SelectContent>
                  {empleados.filter((e) => e.activo).map((e) => (
                    <SelectItem key={e.id} value={e.id}>{e.nombre} ({e.frecuencia_pago})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div><label className="text-sm font-medium">Monto (RD$)</label>
              <Input type="number" value={adelForm.monto}
                onChange={(e) => setAdelForm((p) => ({ ...p, monto: e.target.value }))} /></div>
            <div><label className="text-sm font-medium">Nota</label>
              <Input value={adelForm.descripcion} placeholder="ej. avance para medicinas"
                onChange={(e) => setAdelForm((p) => ({ ...p, descripcion: e.target.value }))} /></div>
            <p className="text-xs text-muted-foreground">
              Sale HOY por Gastos Diarios (cuadra con el cierre de caja) y el sistema lo propone como
              descuento en la próxima nómina del empleado — fraccionable si hace falta.
            </p>
          </div>
          <DialogFooter>
            <DialogClose asChild><Button variant="outline" disabled={busy}>Cancelar</Button></DialogClose>
            <Button onClick={registrarAdelanto} disabled={busy}>
              {busy ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}<Users className="w-4 h-4 mr-1" />Registrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default NominaPage;
