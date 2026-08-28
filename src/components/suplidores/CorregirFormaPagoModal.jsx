// ============================================================
// CorregirFormaPagoModal.jsx — Arreglar de dónde salió un pago
// ------------------------------------------------------------
// (2026-08-20) MotoPréstamos le pagó RD$90,000 a Caminero Motors y al
// digitarlo quedó como EFECTIVO, siendo una salida de la cuenta de Odalys.
// Hubo que arreglarlo escribiendo SQL contra producción — que es como se
// arregla algo exactamente una vez: a la segunda nadie se acuerda de que
// también había que tocar el movimiento bancario, y queda un pago corregido
// a medias.
//
// >>> LO QUE SE PUEDE CAMBIAR AQUÍ, Y LO QUE NO <<<
// Solo la forma de pago y la cuenta. El monto y las compras a las que se
// aplicó no se tocan, y no es pereza: cambiar el monto obliga a rehacer el
// detalle y el balance del suplidor, y eso ya es un pago distinto, no una
// corrección. Para eso está anular y volver a hacerlo.
//
// Equivocarse de forma de pago no cambia cuánto se pagó ni a quién: solo de
// dónde salió. Por eso se arregla sin deshacer nada.
// ============================================================
import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2, RefreshCw, Wallet } from 'lucide-react';
import CuentaBancariaSelect from '@/components/bancos/CuentaBancariaSelect';
import { formatInTimeZone } from '@/lib/dateUtils';
import { hayQuePreguntarCuenta, salidaParaLaCuenta } from '@/lib/saleDeLaCuenta';

const FORMAS = ['Efectivo', 'Transferencia', 'Cheque', 'Tarjeta'];
// (2026-08-28) Antes esto era `forma === Transferencia || Cheque` a secas y
// el selector traía moneda="DOP" clavado: pagándole a TERUEL en dólares en
// efectivo no había forma de decir que salieron de la caja en dólares —la
// cuenta ni siquiera aparecía en la lista—. La regla vive ahora en
// saleDeLaCuenta.js, la misma que usa la pantalla de pago.
const SALE_DE_CUENTA = (forma, hayDolares = false) =>
  hayQuePreguntarCuenta([{ forma }], hayDolares);

const dolares = (n) => Number(n || 0).toLocaleString('es-DO', {
  minimumFractionDigits: 2, maximumFractionDigits: 2,
});

const pesos = (n) => Number(n || 0).toLocaleString('es-DO', {
  minimumFractionDigits: 2, maximumFractionDigits: 2,
});

const formaActual = (formasPago) => {
  const arr = Array.isArray(formasPago) ? formasPago : [];
  if (!arr.length) return '—';
  return arr.map((f) => f?.forma).filter(Boolean).join(' / ') || '—';
};

// Una fila del Reporte viene del select de Supabase; la lista de aqui viene
// del RPC. Se llevan al mismo molde para no tener dos formas de leer un pago.
const normalizar = (p) => (p ? {
  id: p.id,
  numero: p.numero,
  fecha: p.fecha,
  monto_pagado: p.monto_pagado,
  formas_pago: p.formas_pago,
  anulado: p.anulado,
  suplidor: p.suplidor || p.proveedores?.nombre || '',
  cuenta_id: p.cuenta_id ?? null,
  cuenta_nombre: p.cuenta_nombre ?? null,
  // Sin la tasa no se puede saber cuántos dólares salen de una caja en
  // dólares, y grabarlo en pesos le dejaría el saldo inventado.
  total_usd: p.total_usd ?? null,
  tasa_cambio: p.tasa_cambio ?? null,
} : null);

// pagoInicial: se entro desde una fila concreta (el Reporte), asi que ya se
// sabe cual es y no hay que buscarlo en la lista. Eso ademas alcanza pagos
// mas viejos que los 30 ultimos, que desde aqui no se podian tocar.
export default function CorregirFormaPagoModal({ open, onClose, onCorregido, pagoInicial = null }) {
  const { toast } = useToast();
  const [pagos, setPagos] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [seleccion, setSeleccion] = useState(null);
  const [forma, setForma] = useState('Efectivo');
  const [referencia, setReferencia] = useState('');
  const [cuentaId, setCuentaId] = useState(null);
  const [cuentaSel, setCuentaSel] = useState(null); // completa: hace falta su MONEDA
  const [guardando, setGuardando] = useState(false);

  // Un pago en dólares: la deuda vivía en US$ y se pagó a una tasa. Eso es lo
  // que convierte al efectivo en una salida de cuenta.
  const enDolares = Number(seleccion?.total_usd) > 0 && Number(seleccion?.tasa_cambio) > 0;
  const salida = salidaParaLaCuenta(
    [{ forma, monto: Number(seleccion?.monto_pagado) || 0 }],
    cuentaSel, seleccion?.tasa_cambio);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const { data, error } = await supabase.rpc('get_pagos_suplidores_recientes', { p_limit: 30 });
      if (error) throw error;
      setPagos(Array.isArray(data) ? data : []);
    } catch (e) {
      toast({ variant: 'destructive', title: 'No se pudo cargar', description: e.message });
    } finally {
      setCargando(false);
    }
  }, [toast]);

  const elegir = useCallback((p) => {
    setSeleccion(p);
    const arr = Array.isArray(p?.formas_pago) ? p.formas_pago : [];
    setForma(arr[0]?.forma || 'Efectivo');
    setReferencia(arr[0]?.referencia || '');
    setCuentaId(p?.cuenta_id || null);
    setCuentaSel(null);
  }, []);

  useEffect(() => {
    if (!open) return;
    cargar();
    if (pagoInicial) elegir(normalizar(pagoInicial));
    else setSeleccion(null);
  }, [open, cargar, pagoInicial, elegir]);

  // El Reporte no sabe de que cuenta salio el pago: eso vive en el
  // movimiento bancario y solo lo saca el RPC. Si el pago esta entre los
  // recientes se completa, y sin pisar nada de lo que ya se haya tecleado.
  useEffect(() => {
    if (!pagoInicial) return;
    const conCuenta = pagos.find((p) => p.id === pagoInicial.id);
    if (!conCuenta) return;
    setSeleccion((s) => (s && s.id === conCuenta.id && s.cuenta_nombre == null
      ? { ...s, cuenta_id: conCuenta.cuenta_id, cuenta_nombre: conCuenta.cuenta_nombre }
      : s));
    setCuentaId((c) => c ?? conCuenta.cuenta_id ?? null);
  }, [pagos, pagoInicial]);

  const guardar = async () => {
    if (!seleccion) return;
    if (SALE_DE_CUENTA(forma, enDolares) && !cuentaId) {
      toast({ variant: 'destructive', title: 'Falta la cuenta', description: 'Dime de qué cuenta salió el dinero.' });
      return;
    }
    setGuardando(true);
    try {
      // Una sola forma por el monto completo: es lo que cubre el error que
      // esto viene a arreglar (se eligió mal de dónde salió). Repartir un
      // pago entre varias cuentas se hace al crearlo.
      const formas = [{
        id: 1,
        forma,
        monto: Number(seleccion.monto_pagado) || 0,
        referencia: referencia.trim(),
      }];

      const { data, error } = await supabase.rpc('corregir_forma_pago_suplidor', {
        p_pago_id: seleccion.id,
        p_formas_pago: formas,
        // La cuenta va siempre que se haya elegido: el RPC decide si le
        // toca el saldo (una caja en dólares sí, aunque sea efectivo; una
        // cuenta en pesos con efectivo no, que ya lo resta el cierre).
        p_cuenta_id: SALE_DE_CUENTA(forma, enDolares) ? cuentaId : null,
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.motivo || 'No se pudo corregir');

      toast({
        title: `${data.numero} corregido`,
        description: Number(data.monto_cuenta) > 0
          ? `Ahora sale de ${data.cuenta || 'la cuenta'} por ${data.moneda_cuenta === 'USD' ? `US$ ${dolares(data.monto_cuenta)}` : `RD$ ${pesos(data.monto_cuenta)}`}.`
          : 'Ahora figura como efectivo en pesos: no toca ninguna cuenta, lo resta el cierre de caja.',
      });
      await cargar();
      onCorregido?.();
      // Desde una fila del Reporte no hay a donde volver dentro del modal.
      if (pagoInicial) onClose?.();
      else setSeleccion(null);
    } catch (e) {
      toast({ variant: 'destructive', title: 'No se corrigió', description: e.message });
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose?.()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wallet className="w-5 h-5 text-morla-blue" /> Corregir forma de pago
          </DialogTitle>
        </DialogHeader>

        <p className="text-xs text-slate-500 -mt-2">
          Cambia de dónde salió el dinero. El monto y las facturas a las que se aplicó
          no se tocan: para eso hay que anular el pago y volver a hacerlo.
        </p>

        {/* Entrando desde una fila del Reporte ya se sabe cual es: la lista
            de los ultimos 30 solo estorbaria, y ademas no lo alcanzaria si
            el pago es viejo. */}
        {!pagoInicial && (
          <>
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-600 uppercase">Últimos pagos</span>
            <Button size="sm" variant="outline" onClick={cargar} disabled={cargando}>
              <RefreshCw className={`h-4 w-4 ${cargando ? 'animate-spin' : ''}`} />
            </Button>
          </div>

          <div className="max-h-[240px] overflow-y-auto border rounded-md">
            {pagos.length === 0 && !cargando && (
              <p className="text-sm text-slate-500 p-4 text-center">No hay pagos registrados.</p>
            )}
            {pagos.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => elegir(p)}
                disabled={p.anulado}
                className={`w-full text-left px-3 py-2 border-b last:border-b-0 text-sm flex items-center gap-3 transition-colors
                  ${seleccion?.id === p.id ? 'bg-blue-50' : 'hover:bg-slate-50'}
                  ${p.anulado ? 'opacity-40 cursor-not-allowed' : ''}`}
              >
                <span className="font-mono font-bold text-morla-blue w-[92px] flex-shrink-0">{p.numero}</span>
                <span className="flex-1 truncate">{p.suplidor || 'Sin suplidor'}</span>
                <span className="text-slate-500 w-[70px] flex-shrink-0">{formatInTimeZone(p.fecha, 'dd/MM/yy')}</span>
                <span className="font-bold w-[110px] text-right flex-shrink-0">RD$ {pesos(p.monto_pagado)}</span>
                {/* De dónde salió: sin esto hay que adivinar cuál de los pagos
                    "Transferencia" es el que está mal. */}
                <span className="text-[11px] text-slate-500 w-[170px] truncate flex-shrink-0">
                  {formaActual(p.formas_pago)}
                  {p.cuenta_nombre ? ` · ${p.cuenta_nombre}` : ''}
                </span>
                {p.anulado && <span className="text-[10px] font-bold text-red-500">ANULADO</span>}
              </button>
            ))}
          </div>
          </>
        )}

        {seleccion && (
          <div className="border rounded-md p-3 space-y-3 bg-slate-50">
            <p className="text-sm">
              <b className="font-mono">{seleccion.numero}</b> — {seleccion.suplidor} —
              <b> RD$ {pesos(seleccion.monto_pagado)}</b>
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Forma de pago</Label>
                <Select value={forma} onValueChange={setForma}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {FORMAS.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Referencia</Label>
                <Input value={referencia} onChange={(e) => setReferencia(e.target.value)}
                       className="h-9" placeholder="No. de transferencia, cheque..." />
              </div>
            </div>

            {SALE_DE_CUENTA(forma, enDolares) && (
              // autoDefault en false: en una corrección, una cuenta
              // preseleccionada sola es exactamente cómo nació el error que
              // se viene a arreglar. Aquí se elige a propósito.
              //
              // Y sin filtro de moneda: con moneda="DOP" la caja en dólares
              // ni salía en la lista, que es justo la que hacía falta para
              // arreglar un pago hecho con billetes verdes.
              <CuentaBancariaSelect value={cuentaId} onChange={setCuentaId} onSelect={setCuentaSel}
                                    contexto="pago_suplidor"
                                    autoDefault={false}
                                    label={forma === 'Efectivo' ? 'Sale de la caja en dólares' : 'Sale de la cuenta'} />
            )}

            {/* Lo que va a pasar, dicho antes de que pase. Este botón mueve el
                saldo de una cuenta: enterarse después no sirve de nada. */}
            <p className="text-[11px] text-slate-500">
              {salida.faltaTasa
                ? <b className="text-rose-600">Este pago no tiene tasa del día guardada: no se puede saber cuántos dólares salieron de la caja.</b>
                : salida.monto > 0
                  ? `Se le restarán ${cuentaSel?.moneda === 'USD' ? `US$ ${dolares(salida.monto)}` : `RD$ ${pesos(salida.monto)}`} a la cuenta elegida${seleccion.cuenta_nombre ? `, y se le devolverán a ${seleccion.cuenta_nombre}` : ''}.`
                  : `Dejará de restarle a ${seleccion.cuenta_nombre || 'cualquier cuenta'} y pasará a contar como efectivo del día.`}
            </p>

            {enDolares && (
              <p className="text-[11px] text-blue-700">
                Este pago fue de US$ {dolares(seleccion.total_usd)} a la tasa de {pesos(seleccion.tasa_cambio)}.
                Si los dólares salieron de una caja en dólares, elígela aquí aunque la
                forma diga Efectivo: es el único sitio donde el cierre de caja no los ve.
              </p>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" disabled={guardando}
                      onClick={() => (pagoInicial ? onClose?.() : setSeleccion(null))}>
                Cancelar
              </Button>
              <Button size="sm" onClick={guardar} disabled={guardando}>
                {guardando ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                Corregir
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
