import React, { useMemo, useState } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Search, Plus, Trash2 } from 'lucide-react';
import ClienteSearchModal from '@/components/ventas/ClienteSearchModal';
import CuentaBancariaSelect from '@/components/bancos/CuentaBancariaSelect';
import { imprimirInformePrestamo } from '@/lib/printInformePrestamo';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { calcAmortizacion, round2 } from './amortizacion';
import { formatFechaDMY, formatDateForSupabase, getCurrentDateInTimeZone } from '@/lib/dateUtils';
import { fmtMontoInput, parseMontoInput } from '@/lib/numberFormat';

const fmt = (v) => new Intl.NumberFormat('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(v) || 0);

// Hoy en Santo Domingo. Se apoya en dateUtils y no en toISOString(), que
// devuelve UTC: en RD (UTC-4) eso adelanta el día desde las ocho de la noche y
// un préstamo originado un jueves a las 9 pm salía fechado el viernes.
//
// Y no se calcula a mano con el reloj del navegador porque el sistema corre en
// varias PC: si una tiene la zona horaria mal puesta, dateUtils acierta igual.
const hoyLocal = () => formatDateForSupabase(getCurrentDateInTimeZone());

// Suma un mes a una fecha YYYY-MM-DD. Aritmética de calendario pura — aquí no
// hay zona horaria de por medio porque no hay hora.
const mesDespues = (iso) => {
  const [a, m, dd] = String(iso || '').split('-').map(Number);
  const base = (a && m && dd) ? new Date(a, m - 1, dd) : new Date();
  base.setMonth(base.getMonth() + 1);
  const mes = String(base.getMonth() + 1).padStart(2, '0');
  const dia = String(base.getDate()).padStart(2, '0');
  return `${base.getFullYear()}-${mes}-${dia}`;
};

// Cuándo vence la PRIMERA cuota, según cada cuánto se cobra.
//
// (2026-08-24) Antes siempre proponía un mes, fuera cual fuera la
// frecuencia: un préstamo diario abierto el 24/08 pedía su primera cuota el
// 24/09. Un mes entero sin cobrar en un préstamo que se cobra todos los días.
const unPeriodoDespues = (iso, frecuencia) => {
  if (frecuencia === 'mensual') return mesDespues(iso);
  const dias = frecuencia === 'diario' ? 1 : frecuencia === 'semanal' ? 7 : 15;
  const [a, m, dd] = String(iso || '').split('-').map(Number);
  const base = (a && m && dd) ? new Date(a, m - 1, dd) : new Date();
  base.setDate(base.getDate() + dias);
  const mes = String(base.getMonth() + 1).padStart(2, '0');
  const dia = String(base.getDate()).padStart(2, '0');
  return `${base.getFullYear()}-${mes}-${dia}`;
};

const proximoMes = () => mesDespues(hoyLocal());

// Funcion y no objeto: si fuera un objeto, hoyLocal() se evaluaria UNA vez al
// cargar el modulo. En una tienda la pestana se queda abierta de un dia para
// otro, y despues de medianoche el formulario propondria la fecha de ayer.
const initial = () => ({
  tipo: 'financiamiento',
  metodo: 'simple',
  frecuencia: 'mensual',
  monto: '',
  tasa: '',
  plazo: '',
  mora: '',
  fechaInicio: hoyLocal(),   // cuando EMPEZO el prestamo, no cuando se digita
  fechaPrimera: proximoMes(),
  garantia: '',
  notas: '',
  cuotaAjustada: '', // cuota redondeada por el operador (opcional)
  desembolso: 'efectivo', // efectivo resta de la caja del día; transferencia/cheque del excedente
});

const NuevoPrestamoModal = ({ isOpen, onClose }) => {
  const { toast } = useToast();
  const { empresa } = useAuth();
  const [form, setForm] = useState(initial);
  const [cliente, setCliente] = useState(null);
  const [buscarOpen, setBuscarOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  // Reparto del desembolso por cuenta (transferencia/cheque). Una fila por
  // cuenta: se puede sacar todo de una o partirlo entre varias.
  const [lineas, setLineas] = useState([{ id: 1, cuenta_id: '', monto: '' }]);

  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  // Al cambiar la fecha del préstamo, la primera cuota lo sigue — pero SOLO si
  // nadie la había movido a mano. Arrastrarla siempre le borraría al operador
  // la fecha que acaba de teclear; no arrastrarla nunca deja un préstamo
  // fechado hace dos semanas con la primera cuota a un mes de HOY, que son dos
  // semanas regaladas.
  const cambiarFechaInicio = (nueva) => {
    setForm((p) => ({
      ...p,
      fechaInicio: nueva,
      fechaPrimera: p.fechaPrimera === unPeriodoDespues(p.fechaInicio, p.frecuencia)
        ? unPeriodoDespues(nueva, p.frecuencia)
        : p.fechaPrimera,
    }));
  };

  // Cambiar la frecuencia mueve la primera cuota con ella, bajo la misma
  // regla: solo si nadie la había tocado a mano. Pasar a diario y dejar la
  // primera cuota a un mes es regalar el mes.
  const cambiarFrecuencia = (nueva) => {
    setForm((p) => ({
      ...p,
      frecuencia: nueva,
      fechaPrimera: p.fechaPrimera === unPeriodoDespues(p.fechaInicio, p.frecuencia)
        ? unPeriodoDespues(p.fechaInicio, nueva)
        : p.fechaPrimera,
    }));
  };

  const porBanco = form.desembolso === 'transferencia' || form.desembolso === 'cheque';
  const capital = Number(form.monto) || 0;
  const totalLineas = useMemo(
    () => lineas.reduce((a, l) => a + (Number(l.monto) || 0), 0),
    [lineas]
  );
  const faltaRepartir = round2(capital - totalLineas);

  const setLinea = (id, campo, valor) =>
    setLineas((ls) => ls.map((l) => (l.id === id ? { ...l, [campo]: valor } : l)));
  const addLinea = () => setLineas((ls) => [...ls, { id: Date.now(), cuenta_id: '', monto: '' }]);
  const delLinea = (id) => setLineas((ls) => (ls.length > 1 ? ls.filter((l) => l.id !== id) : ls));

  // Cuota base (sin ajuste) → "Monto de las Cuotas"
  const baseCuotas = useMemo(
    () => calcAmortizacion({
      monto: form.monto, tasa: form.tasa, plazo: form.plazo,
      metodo: form.metodo, frecuencia: form.frecuencia, fechaPrimera: form.fechaPrimera,
    }),
    [form.monto, form.tasa, form.plazo, form.metodo, form.frecuencia, form.fechaPrimera]
  );
  const montoCuotaBase = baseCuotas.length ? baseCuotas[0].monto_cuota : 0;
  const adj = round2(form.cuotaAjustada);

  // Cuotas finales (con cuota ajustada si el operador la puso)
  const cuotas = useMemo(
    () => calcAmortizacion({
      monto: form.monto, tasa: form.tasa, plazo: form.plazo,
      metodo: form.metodo, frecuencia: form.frecuencia, fechaPrimera: form.fechaPrimera,
      cuotaAjustada: adj,
    }),
    [form.monto, form.tasa, form.plazo, form.metodo, form.frecuencia, form.fechaPrimera, adj]
  );

  const masAjustes = adj > 0 ? round2(adj - montoCuotaBase) : 0;
  const totalInteres = cuotas.reduce((a, c) => a + c.interes, 0);
  const totalAPagar = cuotas.reduce((a, c) => a + c.monto_cuota, 0);

  // Redondear la cuota hacia arriba (al múltiplo elegido)
  const redondear = (mult) => {
    if (!(montoCuotaBase > 0)) return;
    set('cuotaAjustada', String(Math.ceil(montoCuotaBase / mult) * mult));
  };

  const reset = () => { setForm(initial()); setCliente(null); setLineas([{ id: 1, cuenta_id: '', monto: '' }]); };

  const handleGuardar = async () => {
    if (!cliente?.id) { toast({ variant: 'destructive', title: 'Selecciona un cliente' }); return; }
    if (!(Number(form.monto) > 0) || !(parseInt(form.plazo, 10) > 0)) {
      toast({ variant: 'destructive', title: 'Monto y plazo son requeridos' });
      return;
    }
    // Desembolso por banco: cada cuenta con su monto, y la suma debe dar el capital.
    let repartos = [];
    if (porBanco) {
      repartos = lineas
        .map((l) => ({ cuenta_id: l.cuenta_id, monto: Number(l.monto) || 0 }))
        .filter((l) => l.cuenta_id && l.monto > 0);
      if (!repartos.length) {
        toast({ variant: 'destructive', title: 'Falta la cuenta', description: 'Elige de qué cuenta sale el desembolso y cuánto.' });
        return;
      }
      if (Math.abs(faltaRepartir) > 0.01) {
        toast({
          variant: 'destructive',
          title: 'El reparto no cuadra',
          description: faltaRepartir > 0
            ? `Faltan RD$ ${fmt(faltaRepartir)} por repartir entre las cuentas.`
            : `Te pasaste por RD$ ${fmt(Math.abs(faltaRepartir))}.`,
        });
        return;
      }
      const usadas = repartos.map((r) => r.cuenta_id);
      if (new Set(usadas).size !== usadas.length) {
        toast({ variant: 'destructive', title: 'Cuenta repetida', description: 'No repitas la misma cuenta en dos líneas.' });
        return;
      }
    }
    setSaving(true);
    try {
      const { data, error } = await supabase.rpc('crear_prestamo', {
        p_cliente_id: cliente.id,
        p_monto: Number(form.monto),
        p_tasa: Number(form.tasa) || 0,
        p_plazo: parseInt(form.plazo, 10),
        p_metodo: form.metodo,
        p_frecuencia: form.frecuencia,
        p_mora_pct: Number(form.mora) || 0,
        p_tipo: form.tipo,
        p_fecha_primera: form.fechaPrimera || null,
        p_fecha_inicio: form.fechaInicio || null,
        p_garantia: form.garantia || null,
        p_notas: form.notas || null,
        p_cuota_ajustada: adj > 0 ? adj : null,
        p_desembolso: form.desembolso || 'efectivo',
      });
      if (error) throw error;

      // Una SALIDA por cuenta: queda en el historial de cada una con el monto,
      // el nombre del cliente y el número del préstamo.
      if (porBanco && repartos.length) {
        const fallidas = [];
        for (const r of repartos) {
          const { error: movErr } = await supabase.rpc('registrar_movimiento_bancario_compartido', {
            p_cuenta_id: r.cuenta_id,
            p_tipo: 'SALIDA',
            p_monto: r.monto,
            p_concepto: `Desembolso préstamo ${data?.numero || ''} — ${cliente.nombre}`.trim(),
            p_referencia: data?.numero || null,
            p_origen_tipo: 'desembolso',
            p_origen_id: null,
            p_fecha: null,
          });
          if (movErr) fallidas.push(movErr.message);
        }
        if (fallidas.length) {
          toast({
            variant: 'destructive',
            title: 'Préstamo creado, pero el banco no cuadró',
            description: `No se registró la salida en ${fallidas.length} cuenta(s): ${fallidas[0]}. Regístrala a mano en Cuentas Bancarias.`,
          });
        }
      }

      // Informe del préstamo en hoja carta, igual que la reimpresión.
      try {
        await imprimirInformePrestamo({ prestamoId: data?.id, clienteId: cliente.id, empresa });
      } catch (impErr) {
        toast({
          variant: 'destructive',
          title: 'Préstamo creado, pero no se imprimió',
          description: `${impErr.message}. Imprímelo desde la lista de Préstamos.`,
        });
      }

      toast({ title: 'Préstamo creado', description: `${data?.numero} · ${cliente.nombre}` });
      reset();
      onClose(true);
    } catch (e) {
      toast({ variant: 'destructive', title: 'No se pudo crear el préstamo', description: e.message });
    }
    setSaving(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={() => onClose(false)}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nuevo Préstamo</DialogTitle>
          <DialogDescription>Originar un préstamo y generar su tabla de cuotas.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Cliente */}
          <div className="space-y-1.5">
            <Label>Cliente</Label>
            <div className="flex gap-2">
              <Input readOnly value={cliente ? `${cliente.codigo || ''} ${cliente.nombre}`.trim() : ''} placeholder="Selecciona un cliente" />
              <Button type="button" variant="outline" onClick={() => setBuscarOpen(true)}><Search className="w-4 h-4 mr-1" />Buscar</Button>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Select value={form.tipo} onValueChange={(v) => set('tipo', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="financiamiento">Financiamiento de moto</SelectItem>
                  <SelectItem value="personal">Préstamo personal</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Monto (capital)</Label>
              <Input type="text" inputMode="decimal" className="text-right" value={fmtMontoInput(form.monto)} onChange={(e) => set('monto', parseMontoInput(e.target.value))} placeholder="0.00" />
            </div>
            <div className="space-y-1.5">
              <Label>Tasa % mensual</Label>
              <Input type="number" value={form.tasa} onChange={(e) => set('tasa', e.target.value)} placeholder="Ej: 5" />
            </div>
            <div className="space-y-1.5">
              <Label>Plazo (cuotas)</Label>
              <Input type="number" value={form.plazo} onChange={(e) => set('plazo', e.target.value)} placeholder="Ej: 12" />
            </div>
            <div className="space-y-1.5">
              <Label>Frecuencia</Label>
              <Select value={form.frecuencia} onValueChange={cambiarFrecuencia}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="mensual">Mensual</SelectItem>
                  <SelectItem value="quincenal">Quincenal</SelectItem>
                  <SelectItem value="semanal">Semanal</SelectItem>
                  {/* Diario faltaba SOLO aquí. El motor ya sabía: amortizacion.js
                      lo reparte y calc_amortizacion en la base también, desde
                      sql/fix_prestamo_diario_fechas.sql (2026-08-06). Sin esta
                      línea, un préstamo diario había que meterlo por otro lado
                      — y así nació PT-0026602, con 365 cuotas repartidas a un
                      mes cada una: terminaba en 2056. */}
                  <SelectItem value="diario">Diario</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Método de interés</Label>
              <Select value={form.metodo} onValueChange={(v) => set('metodo', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="simple">Cuotas Fijas (interés simple)</SelectItem>
                  <SelectItem value="frances">Sobre Saldo Insoluto (francés)</SelectItem>
                  <SelectItem value="vencimiento">A Vencimiento (interés periódico, capital al final)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Mora % (por mes atraso)</Label>
              <Input type="number" value={form.mora} onChange={(e) => set('mora', e.target.value)} placeholder="Ej: 5" />
            </div>
            {/* La fecha en que el préstamo EMPEZÓ, que no siempre es hoy: uno
                mal digitado se anula con nota de crédito y se vuelve a entrar
                con el monto bueno, pero conservando su fecha original. Si
                entra fechado hoy, el cliente se ahorra los días corridos y el
                papel dice una fecha que no es la que firmó. */}
            <div className="space-y-1.5">
              <Label>Fecha del préstamo</Label>
              <Input
                type="date"
                value={form.fechaInicio}
                max={hoyLocal()}
                onChange={(e) => cambiarFechaInicio(e.target.value)}
              />
              <p className="text-[11px] text-muted-foreground leading-snug">
                Hoy por defecto. Se puede atrasar; no adelantar.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>1ª cuota vence</Label>
              <Input type="date" value={form.fechaPrimera} onChange={(e) => set('fechaPrimera', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Garantía</Label>
              <Input value={form.garantia} onChange={(e) => set('garantia', e.target.value)} placeholder="Matrícula / vehículo" />
            </div>
            <div className="space-y-1.5">
              <Label>Desembolso</Label>
              <Select value={form.desembolso} onValueChange={(v) => set('desembolso', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="efectivo">Efectivo</SelectItem>
                  <SelectItem value="transferencia">Transferencia</SelectItem>
                  <SelectItem value="cheque">Cheque</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[10px] text-slate-500 italic leading-tight">
                Efectivo resta de la caja del día; transferencia y cheque, del excedente.
              </p>
            </div>
          </div>

          {/* Reparto del desembolso: de qué cuenta(s) sale el dinero.
              Se puede sacar todo de una o partirlo entre varias. */}
          {porBanco && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-bold uppercase text-slate-600">
                  ¿De cuál cuenta sale el dinero?
                </Label>
                <span className={`text-xs font-bold ${Math.abs(faltaRepartir) < 0.01 ? 'text-emerald-600' : 'text-red-600'}`}>
                  {Math.abs(faltaRepartir) < 0.01
                    ? `✓ Repartido RD$ ${fmt(totalLineas)}`
                    : faltaRepartir > 0
                      ? `Faltan RD$ ${fmt(faltaRepartir)}`
                      : `Sobran RD$ ${fmt(Math.abs(faltaRepartir))}`}
                </span>
              </div>

              {lineas.map((l, i) => (
                <div key={l.id} className="grid grid-cols-[1fr_140px_auto] gap-2 items-end">
                  <CuentaBancariaSelect
                    value={l.cuenta_id}
                    onChange={(v) => setLinea(l.id, 'cuenta_id', v)}
                    moneda="DOP"
                    autoDefault={i === 0}
                    label={null}
                  />
                  <Input
                    type="text" inputMode="decimal" placeholder="Monto" value={fmtMontoInput(l.monto)}
                    onChange={(e) => setLinea(l.id, 'monto', parseMontoInput(e.target.value))}
                    className="text-right"
                  />
                  <Button variant="ghost" size="icon" className="h-9 w-9"
                    onClick={() => delLinea(l.id)} disabled={lineas.length === 1} title="Quitar">
                    <Trash2 className="w-4 h-4 text-red-500" />
                  </Button>
                </div>
              ))}

              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="text-xs" onClick={addLinea}>
                  <Plus className="w-3.5 h-3.5 mr-1" />Otra cuenta
                </Button>
                {capital > 0 && lineas.length === 1 && (
                  <Button variant="outline" size="sm" className="text-xs"
                    onClick={() => setLinea(lineas[0].id, 'monto', String(capital))}>
                    Poner todo ({fmt(capital)})
                  </Button>
                )}
              </div>
              <p className="text-[10px] text-slate-500 italic leading-tight">
                Cada cuenta registra su salida con el monto, el cliente y el número del préstamo.
              </p>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Notas</Label>
            <Input value={form.notas} onChange={(e) => set('notas', e.target.value)} />
          </div>

          {/* Resultado (cuota ajustable, como el sistema viejo) */}
          <div className="border rounded-md bg-emerald-50/40 p-3">
            <div className="text-xs font-bold text-emerald-700 uppercase mb-2">Resultado</div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 items-end">
              <div className="space-y-1">
                <Label className="text-[11px] text-slate-500">Monto de las Cuotas</Label>
                <div className="h-9 flex items-center px-2 bg-white border rounded font-semibold">{fmt(montoCuotaBase)}</div>
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] text-slate-500">Más Ajustes</Label>
                <div className={`h-9 flex items-center px-2 bg-white border rounded font-semibold ${masAjustes < 0 ? 'text-red-600' : 'text-emerald-700'}`}>{fmt(masAjustes)}</div>
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] font-bold text-emerald-800">Cuota Ajustada</Label>
                <Input
                  type="text" inputMode="decimal" value={fmtMontoInput(form.cuotaAjustada)}
                  onChange={(e) => set('cuotaAjustada', parseMontoInput(e.target.value))}
                  placeholder={fmt(montoCuotaBase)}
                  className="h-9 font-bold border-emerald-300"
                />
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <span className="text-[11px] text-slate-500">Redondear a:</span>
              {[1, 5, 10, 50, 100].map((m) => (
                <Button key={m} type="button" size="sm" variant="outline" className="h-6 px-2 text-[11px]" onClick={() => redondear(m)}>{m}</Button>
              ))}
              {form.cuotaAjustada !== '' && (
                <Button type="button" size="sm" variant="ghost" className="h-6 px-2 text-[11px] text-slate-500" onClick={() => set('cuotaAjustada', '')}>Quitar ajuste</Button>
              )}
              <div className="ml-auto text-[11px] text-slate-600">
                Total Intereses: <b>{fmt(totalInteres)}</b> · Total a Pagar: <b>{fmt(totalAPagar)}</b>
              </div>
            </div>
          </div>

          {/* Vista previa de la amortización */}
          <div className="border rounded-md">
            <div className="flex items-center justify-between px-3 py-2 bg-slate-50 border-b text-xs font-bold text-slate-600">
              <span>Vista previa de cuotas ({cuotas.length})</span>
              <span>Interés: {fmt(totalInteres)} · Total a pagar: {fmt(totalAPagar)}</span>
            </div>
            <div className="max-h-52 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-white border-b text-slate-500">
                  <tr>
                    <th className="text-left p-2">#</th>
                    <th className="text-left p-2">Vence</th>
                    <th className="text-right p-2">Capital</th>
                    <th className="text-right p-2">Interés</th>
                    <th className="text-right p-2">Cuota</th>
                  </tr>
                </thead>
                <tbody>
                  {cuotas.length === 0 && (
                    <tr><td colSpan={5} className="p-3 text-center text-slate-400">Ingresa monto y plazo para ver las cuotas.</td></tr>
                  )}
                  {cuotas.map((c) => (
                    <tr key={c.numero_cuota} className="border-b last:border-0">
                      <td className="p-2">{c.numero_cuota}</td>
                      <td className="p-2">{formatFechaDMY(c.fecha_vencimiento)}</td>
                      <td className="p-2 text-right">{fmt(c.capital)}</td>
                      <td className="p-2 text-right">{fmt(c.interes)}</td>
                      <td className="p-2 text-right font-semibold">{fmt(c.monto_cuota)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="secondary" onClick={() => onClose(false)}>Cancelar</Button>
          <Button type="button" onClick={handleGuardar} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            Crear Préstamo
          </Button>
        </DialogFooter>
      </DialogContent>

      <ClienteSearchModal
        isOpen={buscarOpen}
        onClose={() => setBuscarOpen(false)}
        onSelectCliente={(c) => { setCliente(c); setBuscarOpen(false); }}
      />
    </Dialog>
  );
};

export default NuevoPrestamoModal;
