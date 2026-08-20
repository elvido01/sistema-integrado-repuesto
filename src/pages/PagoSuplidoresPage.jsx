import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatInTimeZone, getCurrentDateInTimeZone, formatDateForSupabase } from '@/lib/dateUtils';
import { Save, X, Loader2, FilePlus, Trash2, PlusCircle, Printer, ChevronDown, Search } from 'lucide-react';
import { usePanels } from '@/contexts/PanelContext';
import { Checkbox } from '@/components/ui/checkbox';
import { generatePagoSuplidorPDF } from '@/components/common/PDFGenerator';
import { printPagoSuplidorPOS } from '@/lib/printPOS';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import CuentaBancariaSelect from '@/components/bancos/CuentaBancariaSelect';
import CorregirFormaPagoModal from '@/components/suplidores/CorregirFormaPagoModal';
import { fmtMontoInput, parseMontoInput } from '@/lib/numberFormat';

const initialState = {
  numero: '',
  fecha: getCurrentDateInTimeZone(),
  suplidorId: null,
  suplidorNombre: '',
  balanceAnterior: 0,
  totalPagado: 0,
  balanceActual: 0,
  balanceUsd: 0,
  totalPagadoUsd: 0,
  balanceActualUsd: 0,
  imprimir: true,
};

const toMoney = (value) => Math.round((Number(value) || 0) * 100) / 100;

// Fecha (columna DATE del RPC) como día calendario, sin corrimiento de zona
// horaria: 'YYYY-MM-DD' → 'DD/MM/YYYY'. new Date('YYYY-MM-DD') la parsea en
// UTC y en RD (UTC-4) se veía un día menos (05/06 salía 04/06).
const fmtFechaDMY = (f) => {
  if (!f) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(f));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(f);
};

// Orden de las deudas: la que PRIMERO se vence va arriba (pagarés de una
// misma factura salen 2/6, 3/6, 4/6... por su vencimiento). Desempate por
// emisión y luego por la referencia (número de pagaré).
const getCompraVenceTime = (compra) => {
  const rawDate = compra.fecha_vencimiento || compra.fecha_emision;
  const time = rawDate ? new Date(rawDate).getTime() : Infinity;
  return Number.isNaN(time) ? Infinity : time;
};
const compararCompras = (a, b) => {
  const dv = getCompraVenceTime(a) - getCompraVenceTime(b);
  if (dv !== 0) return dv;
  const de = new Date(a.fecha_emision || 0).getTime() - new Date(b.fecha_emision || 0).getTime();
  if (de !== 0) return de;
  return String(a.referencia || '').localeCompare(String(b.referencia || ''));
};

const PagoSuplidoresPage = () => {
  const { toast } = useToast();
  const { empresa, tenantId } = useAuth();
  const { closePanel } = usePanels();
  const [pago, setPago] = useState(initialState);
  const [suplidores, setSuplidores] = useState([]);
  const [compras, setCompras] = useState([]);
  const [formasPago, setFormasPago] = useState([{ id: 1, forma: 'Efectivo', monto: 0, referencia: '' }]);
  const [cuentaId, setCuentaId] = useState(null); // cuenta de donde sale la transferencia/cheque
  const [corregirAbierto, setCorregirAbierto] = useState(false);
  // La cuenta completa, no solo su id: hace falta su MONEDA para saber en
  // qué se le descuenta. A una caja chica en dólares no se le pueden restar
  // pesos.
  const [cuentaSel, setCuentaSel] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [suplidorSearch, setSuplidorSearch] = useState('');
  const [suplidorPopoverOpen, setSuplidorPopoverOpen] = useState(false);
  const [paperSize, setPaperSize] = useState('4inch'); // 4inch (POS térmico) por defecto
  // Suplidor que factura en US$: la deuda vive en dólares y se paga a la tasa de HOY
  const [monedaUSD, setMonedaUSD] = useState(false);
  const [tasa, setTasa] = useState(0); // RD$ por US$ del día del pago

  const esFilaUSD = useCallback((c) => c.moneda === 'USD' && Number(c.pendiente_usd) > 0, []);

  const filteredSuplidores = useMemo(() => {
    const q = suplidorSearch.trim().toLowerCase();
    if (!q) return suplidores;
    return suplidores.filter(s => (s.nombre || '').toLowerCase().includes(q));
  }, [suplidores, suplidorSearch]);

  const formatCurrency = (value) => new Intl.NumberFormat('es-DO', { style: 'decimal', minimumFractionDigits: 2 }).format(value);

  const fetchInitialData = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data: suplidoresData, error: suplidoresError } = await supabase.from('proveedores').select('id, nombre, moneda').eq('activo', true);
      if (suplidoresError) throw suplidoresError;
      setSuplidores(suplidoresData);

      const { data: nextNumData, error: nextNumError } = await supabase.rpc('get_next_pago_suplidor_numero');
      if (nextNumError) throw nextNumError;
      setPago(prev => ({ ...prev, numero: nextNumData }));
    } catch (error) {
      toast({ variant: 'destructive', title: 'Error al cargar datos iniciales', description: error.message });
    }
    setIsLoading(false);
  }, [toast]);

  useEffect(() => {
    fetchInitialData();
  }, [fetchInitialData]);

  const handleSuplidorSelect = async (suplidorId) => {
    if (!suplidorId) {
      setPago(prev => ({ ...prev, suplidorId: null, suplidorNombre: '', balanceAnterior: 0, balanceUsd: 0 }));
      setCompras([]);
      setMonedaUSD(false);
      return;
    }
    setIsLoading(true);
    const selectedSuplidor = suplidores.find(s => s.id === suplidorId);
    const isUSD = selectedSuplidor?.moneda === 'USD';
    setMonedaUSD(isUSD);
    if (isUSD) {
      const { data: tasaData } = await supabase.rpc('get_tasa_dia');
      setTasa(prev => (prev > 0 ? prev : Number(tasaData) || 0));
    }
    try {
      const { data, error } = await supabase.rpc('get_compras_pendientes_suplidor', { p_suplidor_id: suplidorId });
      if (error) throw error;

      // Ordenar por fecha de emision ascendente: la factura mas vieja primero.
      const comprasConAbono = data
        .map(c => ({ ...c, abono: 0 }))
        .sort(compararCompras);
      // El balance de las compras en US$ se lleva en dólares; el de las de pesos, en RD$
      const balanceAnterior = comprasConAbono.reduce((sum, c) => sum + (esFilaUSD(c) ? 0 : Number(c.monto_pendiente)), 0);
      const balanceUsd = comprasConAbono.reduce((sum, c) => sum + (esFilaUSD(c) ? Number(c.pendiente_usd) : 0), 0);

      setCompras(comprasConAbono);
      setPago(prev => ({
        ...prev,
        suplidorId,
        suplidorNombre: selectedSuplidor?.nombre || '',
        balanceAnterior,
        balanceActual: balanceAnterior,
        balanceUsd,
        balanceActualUsd: balanceUsd,
        fecha: getCurrentDateInTimeZone(),
      }));
    } catch (error) {
      toast({ variant: 'destructive', title: 'Error al cargar compras pendientes', description: error.message });
    }
    setIsLoading(false);
  };

  const handleAbonoChange = (compraId, abono) => {
    const abonoValue = parseFloat(abono) || 0;
    setCompras(compras.map(c => {
      if (c.id === compraId) {
        // Compras en US$ se abonan en dólares; en pesos, en RD$
        const montoPendiente = esFilaUSD(c) ? Number(c.pendiente_usd) : parseFloat(c.monto_pendiente);
        const newAbono = Math.min(Math.max(0, abonoValue), montoPendiente);
        return { ...c, abono: newAbono };
      }
      return c;
    }));
  };

  // Reparte un total en RD$ (lo que sale de caja) entre las facturas, la más
  // vieja primero. Las facturas en US$ consumen su equivalente a la tasa del día.
  const distribuirPagoEnCompras = useCallback((montoTotal) => {
    const totalDisponible = Math.max(0, toMoney(montoTotal));

    setCompras(prevCompras => {
      let restante = totalDisponible;
      const abonosPorCompra = new Map();
      const ordenadas = [...prevCompras].sort(compararCompras);

      ordenadas.forEach((compra) => {
        const esU = esFilaUSD(compra) && tasa > 0;
        const pendienteRD = esU
          ? toMoney(Number(compra.pendiente_usd) * tasa)
          : Math.max(0, Number(compra.monto_pendiente) || 0);
        const abonoRD = Math.min(pendienteRD, restante);
        abonosPorCompra.set(compra.id, esU ? toMoney(abonoRD / tasa) : toMoney(abonoRD));
        restante = toMoney(restante - abonoRD);
      });

      return prevCompras.map(compra => ({
        ...compra,
        abono: abonosPorCompra.get(compra.id) || 0,
      }));
    });
  }, [esFilaUSD, tasa]);

  // Abonos separados por moneda (el abono de cada fila está en SU moneda)
  const totalAbonosDop = useMemo(() => {
    return compras.reduce((sum, c) => sum + (esFilaUSD(c) ? 0 : Number(c.abono)), 0);
  }, [compras, esFilaUSD]);
  const totalAbonosUsd = useMemo(() => {
    return compras.reduce((sum, c) => sum + (esFilaUSD(c) ? Number(c.abono) : 0), 0);
  }, [compras, esFilaUSD]);
  // Total que sale de caja/banco en RD$ (los US$ se compran a la tasa del día)
  const totalAbonos = useMemo(() => {
    return toMoney(totalAbonosDop + totalAbonosUsd * (tasa || 0));
  }, [totalAbonosDop, totalAbonosUsd, tasa]);

  useEffect(() => {
    const balanceActual = pago.balanceAnterior - totalAbonosDop;
    const balanceActualUsd = (pago.balanceUsd || 0) - totalAbonosUsd;
    setPago(prev => ({ ...prev, totalPagado: totalAbonos, totalPagadoUsd: totalAbonosUsd, balanceActual, balanceActualUsd }));
    if (formasPago.length === 1) {
      setFormasPago([{ ...formasPago[0], monto: totalAbonos }]);
    }
  }, [totalAbonos, totalAbonosDop, totalAbonosUsd, pago.balanceAnterior, pago.balanceUsd]);

  const handleFormaPagoChange = (id, field, value) => {
    const nextFormasPago = formasPago.map(p => p.id === id ? { ...p, [field]: value } : p);
    setFormasPago(nextFormasPago);

    if (field === 'monto') {
      const totalFormas = nextFormasPago.reduce((sum, p) => sum + (Number(p.monto) || 0), 0);
      distribuirPagoEnCompras(totalFormas);
    }
  };

  const addFormaPago = () => {
    setFormasPago([...formasPago, { id: Date.now(), forma: 'Efectivo', monto: 0, referencia: '' }]);
  };

  const removeFormaPago = (id) => {
    if (formasPago.length > 1) {
      const nextFormasPago = formasPago.filter(p => p.id !== id);
      setFormasPago(nextFormasPago);
      const totalFormas = nextFormasPago.reduce((sum, p) => sum + (Number(p.monto) || 0), 0);
      distribuirPagoEnCompras(totalFormas);
    }
  };

  const totalPagadoFormas = useMemo(() => {
    return formasPago.reduce((sum, p) => sum + Number(p.monto), 0);
  }, [formasPago]);

  const handleSave = async () => {
    if (!pago.suplidorId) {
      toast({ variant: 'destructive', title: 'Error de validación', description: 'Debe seleccionar un suplidor.' });
      return;
    }
    if (totalAbonos <= 0) {
      toast({ variant: 'destructive', title: 'Error de validación', description: 'Debe ingresar al menos un abono.' });
      return;
    }
    if (Math.abs(totalAbonos - totalPagadoFormas) > 0.01) {
      toast({ variant: 'destructive', title: 'Error de validación', description: 'El total de formas de pago no coincide con el total a pagar.' });
      return;
    }
    if (totalAbonosUsd > 0 && !(tasa > 0)) {
      toast({ variant: 'destructive', title: 'Falta la tasa del día', description: 'Este suplidor se paga en dólares. Indica la tasa de cambio de HOY para calcular los pesos.' });
      return;
    }
    // Sin tasa no hay forma de saber cuántos dólares salen de la cuenta, y
    // grabarlo en pesos le dejaría el saldo inventado.
    if (cuentaSel?.moneda === 'USD' && !(tasa > 0)) {
      toast({ variant: 'destructive', title: 'Falta la tasa del día', description: `La cuenta ${cuentaSel.banco} está en dólares: indica la tasa de HOY para saber cuánto sale de ella.` });
      return;
    }

    setIsSaving(true);
    const pagoData = {
      fecha: formatDateForSupabase(pago.fecha),
      suplidor_id: pago.suplidorId,
      total_pagado: totalAbonos,
      concepto: 'Pago a suplidor',
      formas_pago: formasPago,
      // Pago en dólares: tasa de HOY y total en US$ (la diferencia cambiaria
      // la calcula y guarda el RPC contra la tasa de cada compra)
      tasa_cambio: totalAbonosUsd > 0 ? tasa : null,
      total_usd: totalAbonosUsd > 0 ? toMoney(totalAbonosUsd) : null,
    };

    const detallesData = compras
      .filter(c => c.abono > 0)
      .map(c => (esFilaUSD(c)
        ? { compra_id: c.id, monto_abonado: toMoney(c.abono * tasa), abonado_usd: toMoney(c.abono) }
        : { compra_id: c.id, monto_abonado: c.abono }));

    try {
      const { data, error } = await supabase.rpc('procesar_pago_suplidor', {
        p_pago_data: pagoData,
        p_detalles_data: detallesData,
      });

      if (error) throw error;

      // Salida de la cuenta bancaria por la porción no-efectivo (transferencia/cheque).
      const montoBanco = formasPago
        .filter(f => f.forma === 'Transferencia' || f.forma === 'Cheque')
        .reduce((s, f) => s + (Number(f.monto) || 0), 0);
      if (cuentaId && montoBanco > 0) {
        const ref = formasPago.find(f => f.forma === 'Transferencia' || f.forma === 'Cheque')?.referencia || String(data || '');
        // Las formas de pago se digitan en RD$. Si la cuenta lleva dólares,
        // lo que sale de ELLA son dólares: se convierte a la misma tasa con
        // la que se calculó el pago, para no restarle pesos a una cuenta en
        // US$ y dejarle el saldo inventado.
        const esCuentaUSD = cuentaSel?.moneda === 'USD';
        const montoCuenta = esCuentaUSD && tasa > 0 ? toMoney(montoBanco / tasa) : montoBanco;
        // RPC COMPARTIDO: la cuenta puede ser la de la financiera vinculada
        // (ej. Caminero paga desde la 004 de MotoPréstamos).
        supabase.rpc('registrar_movimiento_bancario_compartido', {
          p_cuenta_id: cuentaId, p_tipo: 'SALIDA', p_monto: montoCuenta,
          p_concepto: `Pago suplidor ${pago.suplidorNombre || ''} (${data || ''})`.trim(),
          p_referencia: ref, p_origen_tipo: 'pago_suplidor', p_origen_id: null, p_fecha: null,
        }).then(() => {}, () => {});
      }

      // >>> QUE EL DINERO LLEGUE A LA OTRA EMPRESA <<<
      // Si lo que se paga son cuentas por pagar nacidas de un financiamiento
      // del dealer, ese pago es un INGRESO para el dealer y hay que abonarlo
      // a sus facturas. Nadie va a ir a la otra empresa a hacer ese recibo a
      // mano: se olvida, y el hueco entre los dos libros se abre en silencio
      // (llegó a RD$144,400 antes de que alguien lo notara).
      //
      // El RPC se encarga de decidir si aplica: si el pago no viene de un
      // financiamiento, contesta que no y aquí no se dice nada.
      try {
        const { data: pagoRow } = await supabase
          .from('pagos_suplidores')
          .select('id')
          .eq('numero', data)
          .eq('tenant_id', tenantId)
          .maybeSingle();

        if (pagoRow?.id) {
          // Efectivo: las dos empresas comparten las cuentas físicas, así que
          // acreditar una cuenta haría desaparecer la salida que acaba de
          // registrarse. El dinero salió del banco y quedó en mano.
          const { data: sinc } = await supabase.rpc('sincronizar_pago_a_dealer', {
            p_pago_id: pagoRow.id,
            p_forma: 'Efectivo',
          });
          if (sinc?.ok && !sinc?.ya_estaba) {
            toast({
              title: 'Registrado también en el dealer',
              description: `Recibo ${sinc.recibo} por RD$ ${Number(sinc.total || 0).toLocaleString('es-DO', { minimumFractionDigits: 2 })} abonado a ${sinc.facturas} factura(s).`,
            });
          }
        }
      } catch (e) {
        // Que falle no puede tumbar un pago ya grabado. Se avisa para que se
        // corrija, porque si nadie lo ve los dos libros se separan.
        toast({
          variant: 'destructive',
          title: 'El pago se grabó, pero no llegó al dealer',
          description: `${e.message}. Regístralo en la otra empresa o vuelve a intentarlo.`,
          duration: 9000,
        });
      }

      // La tasa usada queda como la tasa del día de la empresa
      if (totalAbonosUsd > 0 && tasa > 0) supabase.rpc('set_tasa_dia', { p_tasa: tasa }).then(() => {}, () => {});

      toast({ title: 'Éxito', description: `Pago ${data} guardado correctamente.` });

      if (pago.imprimir) {
        const enrichedDetalles = detallesData.map(d => {
          const original = compras.find(c => c.id === d.compra_id);
          return { ...d, fecha_emision: original?.fecha_emision, referencia: original?.referencia, monto_pendiente: original?.monto_pendiente, pendiente_usd: original?.pendiente_usd, moneda: original?.moneda };
        });

        if (paperSize === 'pdf') {
          generatePagoSuplidorPDF(
            { ...pagoData, numero: data },
            pago.suplidorNombre,
            enrichedDetalles,
            formasPago,
            empresa
          );
        } else {
          printPagoSuplidorPOS(
            { ...pagoData, numero: data },
            pago.suplidorNombre,
            enrichedDetalles,
            formasPago,
            paperSize
          );
        }
      }

      // En lugar de resetear todo el formulario, refrescamos los datos del suplidor actual
      const currentSuplidorId = pago.suplidorId;
      const currentSuplidorNombre = pago.suplidorNombre;

      // Limpiar datos del pago anterior pero mantener el suplidor
      setPago({
        ...initialState,
        suplidorId: currentSuplidorId,
        suplidorNombre: currentSuplidorNombre,
      });
      setFormasPago([{ id: 1, forma: 'Efectivo', monto: 0, referencia: '' }]);

      // Re-cargar compras pendientes
      handleSuplidorSelect(currentSuplidorId);

    } catch (error) {
      toast({ variant: 'destructive', title: 'Error al guardar el pago', description: error.message });
    } finally {
      setIsSaving(false);
    }
  };

  const resetForm = useCallback(() => {
    setPago(initialState);
    setCompras([]);
    setFormasPago([{ id: 1, forma: 'Efectivo', monto: 0, referencia: '' }]);
    setMonedaUSD(false);
    fetchInitialData();
  }, [fetchInitialData]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'F10') {
      e.preventDefault();
      handleSave();
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      closePanel('pago-suplidores');
    }
  }, [handleSave, closePanel]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return (
    <>
      <Helmet>
        <title>Pago a Suplidores — {empresa?.nombre || 'Sistema'}</title>
      </Helmet>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="p-1 md:p-4 bg-gray-100 min-h-full flex flex-col"
      >
        <div className="bg-white p-4 rounded-lg shadow-md flex-grow flex flex-col">
          <div className="bg-morla-blue text-white py-2 rounded-t-lg mb-4 relative">
            <h1 className="text-white font-black tracking-[0.25em] italic uppercase text-lg drop-shadow-sm text-center">PAGO A SUPLIDORES</h1>
            {/* Equivocarse de forma de pago no cambia cuanto se pago ni a
                quien: solo de donde salio. Eso se arregla aqui, sin anular
                nada y sin que nadie tenga que escribir SQL. */}
            <button
              type="button"
              onClick={() => setCorregirAbierto(true)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-bold uppercase tracking-wide bg-white/15 hover:bg-white/25 px-3 py-1 rounded transition-colors"
              title="Cambiar de qué cuenta salió un pago ya hecho"
            >
              Corregir forma de pago
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-4">
            <div className="lg:col-span-2 space-y-4 p-4 border rounded-lg">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label>No. Pago</Label>
                  <Input value={pago.numero} readOnly disabled className="bg-gray-100" />
                </div>
                <div>
                  <Label>Fecha</Label>
                  <Input value={formatInTimeZone(pago.fecha, 'dd/MM/yyyy')} readOnly disabled className="bg-gray-100" />
                </div>
              </div>
              <div>
                <Label>Suplidor</Label>
                <Popover open={suplidorPopoverOpen} onOpenChange={setSuplidorPopoverOpen}>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      disabled={isLoading}
                      className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <span className={pago.suplidorNombre ? '' : 'text-muted-foreground'}>
                        {isLoading
                          ? 'Cargando suplidores...'
                          : pago.suplidorNombre || 'Seleccione un suplidor'}
                      </span>
                      <ChevronDown className="h-4 w-4 opacity-50 shrink-0 ml-2" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent
                    className="p-0 w-[var(--radix-popover-trigger-width)]"
                    align="start"
                    onOpenAutoFocus={(e) => {
                      e.preventDefault();
                      // Focus al input de búsqueda al abrir
                      setTimeout(() => {
                        document.getElementById('suplidor-search-input')?.focus();
                      }, 0);
                    }}
                  >
                    <div className="flex items-center border-b px-2">
                      <Search className="h-4 w-4 text-muted-foreground shrink-0" />
                      <Input
                        id="suplidor-search-input"
                        placeholder="Buscar suplidor..."
                        value={suplidorSearch}
                        onChange={(e) => setSuplidorSearch(e.target.value)}
                        className="h-9 border-0 focus-visible:ring-0 focus-visible:ring-offset-0 shadow-none"
                      />
                    </div>
                    <div className="max-h-60 overflow-y-auto p-1">
                      {filteredSuplidores.length === 0 ? (
                        <div className="px-2 py-3 text-sm text-center text-muted-foreground">
                          Sin resultados
                        </div>
                      ) : (
                        filteredSuplidores.map(s => (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => {
                              handleSuplidorSelect(s.id);
                              setSuplidorPopoverOpen(false);
                              setSuplidorSearch('');
                            }}
                            className={`w-full text-left px-2 py-2 text-sm rounded hover:bg-accent hover:text-accent-foreground cursor-pointer ${pago.suplidorId === s.id ? 'bg-accent font-semibold' : ''}`}
                          >
                            {s.nombre}
                          </button>
                        ))
                      )}
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div className="p-2 bg-gray-50 rounded">
                  <span className="font-semibold">Balance Anterior:</span>
                  {monedaUSD ? (
                    <span className="font-bold ml-2 text-red-600">
                      US$ {formatCurrency(pago.balanceUsd)}
                      {pago.balanceAnterior > 0 && <span className="text-gray-500 font-semibold"> + RD$ {formatCurrency(pago.balanceAnterior)}</span>}
                    </span>
                  ) : (
                    <span className="font-bold ml-2 text-red-600">{formatCurrency(pago.balanceAnterior)}</span>
                  )}
                </div>
                {monedaUSD && (
                  <div className="p-2 bg-emerald-50 border border-emerald-300 rounded flex items-center gap-2">
                    <span className="font-bold text-emerald-800 text-xs uppercase whitespace-nowrap">💵 Tasa del día</span>
                    <Input
                      type="number"
                      step="0.01"
                      value={tasa || ''}
                      onChange={(e) => setTasa(parseFloat(e.target.value) || 0)}
                      placeholder="RD$ x US$"
                      className="h-8 w-28 text-right font-bold bg-white border-emerald-400"
                    />
                    <span className="text-[11px] text-emerald-700">Los abonos se digitan en US$</span>
                  </div>
                )}
              </div>
            </div>

            <div className="p-4 border rounded-lg">
              <h3 className="font-bold mb-2 border-b pb-1">Formas de Pago</h3>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {formasPago.map((fp) => (
                  <div key={fp.id} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-center">
                    <Select value={fp.forma} onValueChange={(v) => handleFormaPagoChange(fp.id, 'forma', v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Efectivo">Efectivo</SelectItem>
                        <SelectItem value="Cheque">Cheque</SelectItem>
                        <SelectItem value="Transferencia">Transferencia</SelectItem>
                        <SelectItem value="Tarjeta de Crédito">T. Crédito</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input type="text" inputMode="decimal" placeholder="Monto" value={fmtMontoInput(fp.monto)} onChange={(e) => handleFormaPagoChange(fp.id, 'monto', parseMontoInput(e.target.value))} className="text-right" />
                    <Button variant="ghost" size="icon" onClick={() => removeFormaPago(fp.id)} disabled={formasPago.length === 1}>
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                    {fp.forma !== 'Efectivo' && (
                      <Input placeholder={fp.forma === 'Cheque' ? 'No. Cheque' : 'Referencia'} value={fp.referencia} onChange={(e) => handleFormaPagoChange(fp.id, 'referencia', e.target.value)} className="col-span-3" />
                    )}
                  </div>
                ))}
              </div>
              <Button variant="outline" size="sm" onClick={addFormaPago} className="mt-2 w-full">
                <PlusCircle className="h-4 w-4 mr-2" /> Añadir Forma de Pago
              </Button>
              {formasPago.some(f => f.forma === 'Transferencia' || f.forma === 'Cheque') && (
                <div className="mt-3">
                  {/* Sin filtro de moneda: a un suplidor en US$ se le puede
                      pagar comprando los dólares (cuenta en pesos) o con los
                      dólares que ya se tienen (caja chica en US$). Con el
                      filtro fijo en DOP la segunda ni aparecía. */}
                  <CuentaBancariaSelect value={cuentaId} onChange={setCuentaId} onSelect={setCuentaSel}
                    contexto="pago_suplidor" label="Sale de la cuenta" />
                  {cuentaSel?.moneda === 'USD' && (
                    <p className="mt-1 text-[11px] text-blue-700">
                      Es una cuenta en dólares: se le descuenta el equivalente en US$ a la tasa de {formatCurrency(tasa)}.
                      {!(tasa > 0) && <b className="block text-rose-600">Falta la tasa del día.</b>}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="flex-grow overflow-y-auto border rounded-lg">
            <Table>
              <TableHeader className="bg-gray-200">
                <TableRow>
                  <TableHead>Fecha Emisión</TableHead>
                  <TableHead>Fecha Vence</TableHead>
                  <TableHead>Referencia</TableHead>
                  <TableHead>Monto Total</TableHead>
                  <TableHead>Monto Pendiente</TableHead>
                  <TableHead className="w-[150px] text-right">Abono</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan="6" className="text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin" /></TableCell></TableRow>
                ) : compras.length === 0 ? (
                  <TableRow><TableCell colSpan="6" className="text-center text-muted-foreground py-8">Seleccione un suplidor para ver sus compras pendientes.</TableCell></TableRow>
                ) : (
                  compras.map(c => (
                    <TableRow key={c.id}>
                      <TableCell>{fmtFechaDMY(c.fecha_emision)}</TableCell>
                      <TableCell>{fmtFechaDMY(c.fecha_vencimiento)}</TableCell>
                      <TableCell>{c.referencia}</TableCell>
                      <TableCell>{esFilaUSD(c) ? <span className="text-emerald-800 font-semibold">US$ {formatCurrency(c.total_usd)}</span> : formatCurrency(c.monto_total)}</TableCell>
                      <TableCell
                        className="font-semibold cursor-pointer select-none hover:bg-emerald-50"
                        title="Doble clic: pasar todo el pendiente al abono"
                        onDoubleClick={() => handleAbonoChange(c.id, esFilaUSD(c) ? c.pendiente_usd : c.monto_pendiente)}
                      >
                        {esFilaUSD(c) ? (
                          <span className="text-emerald-800">
                            US$ {formatCurrency(c.pendiente_usd)}
                            {tasa > 0 && <span className="block text-[11px] text-gray-500 font-normal">≈ RD$ {formatCurrency(c.pendiente_usd * tasa)}</span>}
                          </span>
                        ) : formatCurrency(c.monto_pendiente)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Input type="text" inputMode="decimal" value={fmtMontoInput(c.abono)} onChange={(e) => handleAbonoChange(c.id, parseMontoInput(e.target.value))} className="text-right h-8 bg-yellow-100" />
                        {esFilaUSD(c) && c.abono > 0 && tasa > 0 && (
                          <div className="text-[11px] text-gray-500 mt-0.5">US$ {formatCurrency(c.abono)} ≈ RD$ {formatCurrency(c.abono * tasa)}</div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          <div className="mt-4 pt-4 border-t grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-3">
              <div className="flex items-center space-x-2">
                <Checkbox id="imprimir" checked={pago.imprimir} onCheckedChange={(checked) => setPago(prev => ({ ...prev, imprimir: checked }))} />
                <Label htmlFor="imprimir">Imprimir al guardar</Label>
              </div>
              {pago.imprimir && (
                <div>
                  <Label className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Tamaño Papel</Label>
                  <Select value={paperSize} onValueChange={setPaperSize}>
                    <SelectTrigger className="h-9 w-56 text-xs font-bold bg-white border-slate-400">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="4inch">📑 101.6mm (4 pulgadas)</SelectItem>
                      <SelectItem value="80mm">📑 80mm (3 pulgadas)</SelectItem>
                      <SelectItem value="pdf">📄 PDF (Carta)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
            <div className="space-y-2 text-right font-semibold">
              {monedaUSD ? (
                <>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Balance Anterior:</span>
                    <span>
                      US$ {formatCurrency(pago.balanceUsd)}
                      {pago.balanceAnterior > 0 && <span className="text-gray-500 font-semibold"> + RD$ {formatCurrency(pago.balanceAnterior)}</span>}
                    </span>
                  </div>
                  <div className="flex justify-between text-emerald-700"><span>Abono en US$:</span><span>US$ {formatCurrency(pago.totalPagadoUsd)}</span></div>
                  {totalAbonosDop > 0 && (
                    <div className="flex justify-between text-emerald-700"><span>Abono en RD$:</span><span>RD$ {formatCurrency(totalAbonosDop)}</span></div>
                  )}
                  <div className="flex justify-between text-blue-600"><span>Salen de caja (RD$ a tasa {formatCurrency(tasa)}):</span><span>RD$ {formatCurrency(pago.totalPagado)}</span></div>
                  <div className="flex justify-between text-red-600 text-lg border-t pt-1">
                    <span>Balance Actual:</span>
                    <span>
                      US$ {formatCurrency(pago.balanceActualUsd)}
                      {pago.balanceAnterior > 0 && <span className="text-gray-500 text-base font-semibold"> + RD$ {formatCurrency(pago.balanceActual)}</span>}
                    </span>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex justify-between"><span className="text-gray-600">Balance Anterior:</span><span>{formatCurrency(pago.balanceAnterior)}</span></div>
                  <div className="flex justify-between text-blue-600"><span>Total Pagado:</span><span>{formatCurrency(pago.totalPagado)}</span></div>
                  <div className="flex justify-between text-red-600 text-lg border-t pt-1"><span>Balance Actual:</span><span>{formatCurrency(pago.balanceActual)}</span></div>
                </>
              )}
            </div>
          </div>

          <div className="mt-6 flex justify-between items-center">
            <Button variant="outline" onClick={resetForm} disabled={isSaving}>
              <FilePlus className="mr-2 h-4 w-4" /> Nuevo
            </Button>
            <div className="flex space-x-4">
              <Button variant="outline" onClick={() => closePanel('pago-suplidores')} disabled={isSaving}>
                <X className="mr-2 h-4 w-4" /> ESC - Salir
              </Button>
              <Button className="bg-morla-blue hover:bg-morla-blue/90" onClick={handleSave} disabled={isSaving || isLoading}>
                {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />} F10 - Grabar
              </Button>
            </div>
          </div>
        </div>
      </motion.div>
      <CorregirFormaPagoModal
        open={corregirAbierto}
        onClose={() => setCorregirAbierto(false)}
      />
    </>
  );
};

export default PagoSuplidoresPage;
