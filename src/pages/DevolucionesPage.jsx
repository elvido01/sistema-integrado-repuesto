import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { usePanels } from '@/contexts/PanelContext';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Save, X, Loader2, Search, CalendarPlus as CalendarIcon, Printer, AlertTriangle } from 'lucide-react';
import { formatInTimeZone, getCurrentDateInTimeZone, formatDateForSupabase } from '@/lib/dateUtils';
import { es } from 'date-fns/locale';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { printDevolucionPOS } from '@/lib/printPOS';
import { efectivoDevuelto } from '@/lib/devolucionEfectivo';
import { useAuth } from '@/contexts/SupabaseAuthContext';

const DevolucionesPage = () => {
  const { empresa, tenantId } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const { activePanel } = usePanels();
  const [isSaving, setIsSaving] = useState(false);
  const [facturaNumero, setFacturaNumero] = useState('');
  const [isSearching, setIsSearching] = useState(false);

  const [fecha, setFecha] = useState(getCurrentDateInTimeZone());
  const [factura, setFactura] = useState(null);
  const [cliente, setCliente] = useState(null);
  const [availableItems, setAvailableItems] = useState([]); // All items in the invoice
  const [itemsADevolver, setItemsADevolver] = useState([]); // Items explicitly added for return
  const [stagingItem, setStagingItem] = useState({
    id: '',
    codigo: '',
    descripcion: '',
    cantidad: 0,
    precio: 0,
    itbis: 0,
    descuento: 0,
    importe: 0,
    ubicacion: ''
  });
  const [notas, setNotas] = useState('');
  const [motivo, setMotivo] = useState('');
  const [imprimir, setImprimir] = useState(false);
  const [emitirDgii, setEmitirDgii] = useState(false);
  const [emitiendoDgii, setEmitiendoDgii] = useState(false);
  // Devolución ya grabada de esta factura que quedó SIN su nota de crédito
  // (la DGII no respondió, etc.): se puede reintentar.
  const [notaPendiente, setNotaPendiente] = useState(null);

  // (14/11/2026) Factura con comprobante electrónico (E31/E32) de hace 30 días
  // o menos: lleva nota de crédito E34. Pasados 30 días la nota ya no rebaja el
  // ITBIS: el emisor no la emite sola (hay que consultarlo con el contador).
  const ecfDeFactura = (f) => (/^E3[12]\d{10}$/.test(String(f?.ncf || '')) ? f.ncf : null);
  const enRD = (v) => {
    const t = String(v || '');
    if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
    const d = new Date(t);
    return isNaN(d.getTime()) ? t.slice(0, 10) : d.toLocaleDateString('en-CA', { timeZone: 'America/Santo_Domingo' });
  };
  const diasDeFactura = (f) => {
    const hoy = enRD(new Date().toISOString());
    const fe = enRD(f?.fecha);
    return Math.round((Date.parse(`${hoy}T12:00:00Z`) - Date.parse(`${fe}T12:00:00Z`)) / 86400000);
  };

  // Emite la nota de crédito electrónica de una devolución YA grabada. Si falla,
  // la devolución queda y se reintenta buscando la factura otra vez.
  const emitirNota = async (devolucionId, razon) => {
    setEmitiendoDgii(true);
    try {
      const { data, error } = await supabase.functions.invoke('emitir-fiscal', {
        body: { action: 'dgii_emitir_nota_credito', devolucion_id: devolucionId, razon_modificacion: razon || undefined },
      });
      if (error) {
        let msg = error.message;
        try { const j = await error.context?.json?.(); if (j?.error) msg = j.error; } catch { /* sin cuerpo */ }
        throw new Error(msg);
      }
      if (!data?.ok) throw new Error(data?.error || 'La DGII no aceptó la nota');
      if (data.aviso) toast({ variant: 'destructive', title: 'Revise esta nota de crédito', description: data.aviso, duration: 20000 });
      toast({
        title: data.ya_emitida ? 'Esta devolución ya tenía su nota de crédito' : '🧾 Nota de crédito enviada a la DGII',
        description: `e-NCF ${data.encf}${data.encf_modificado ? ` · modifica ${data.encf_modificado}` : ''}. La DGII confirma en unos minutos (Monitor DGII).`,
        duration: 10000,
      });
      setNotaPendiente(null);
      return true;
    } catch (e) {
      toast({
        variant: 'destructive',
        title: 'La devolución quedó guardada, pero la nota de crédito no salió',
        description: `${e.message} · Para reintentar, busque la factura otra vez en Devoluciones.`,
        duration: 15000,
      });
      return false;
    } finally {
      setEmitiendoDgii(false);
    }
  };
  // (10/10/2026) Número de la última devolución grabada. El número lo pone la
  // base al grabar (secuencia compartida entre empresas): antes no se sabe.
  // Queda visible hasta que se busque otra factura.
  const [numeroGuardado, setNumeroGuardado] = useState(null);

  const handleSearchFactura = async () => {
    if (!facturaNumero) {
      toast({ variant: 'destructive', title: 'Error', description: 'Por favor, ingrese un número de factura.' });
      return;
    }
    setIsSearching(true);
    resetForm(false);
    setNumeroGuardado(null);

    try {
      // 1. Check if a return already exists for this invoice
      const { data: existingReturn, error: checkError } = await supabase
        .from('devoluciones')
        .select('id, numero, encf, notas, factura:facturas(ncf, fecha), documento:documentos_fiscales!devoluciones_documento_fiscal_id_fkey(estado_dgii)')
        .eq('tenant_id', tenantId)
        .eq('factura_id', (await supabase.from('facturas').select('id').eq('tenant_id', tenantId).eq('numero', facturaNumero).single()).data?.id)
        .maybeSingle();

      if (existingReturn) {
        // Quedó sin su nota de crédito: se ofrece reintentarla.
        if ((!existingReturn.encf || existingReturn.documento?.estado_dgii === 'rechazado') && ecfDeFactura(existingReturn.factura)) {
          setNotaPendiente(existingReturn);
        }
        toast({
          variant: 'destructive',
          title: 'Factura ya devuelta',
          description: `Esta factura ya tiene una devolución registrada (#${existingReturn.numero}). Solo se permite una devolución por factura.`
        });
        return;
      }

      const { data: facturaData, error: facturaError } = await supabase
        .from('facturas')
        .select('*, cliente:clientes(*)')
        .eq('tenant_id', tenantId)
        .eq('numero', facturaNumero)
        .single();

      if (facturaError || !facturaData) {
        toast({ variant: 'destructive', title: 'No Encontrada', description: 'Factura no encontrada. Verifique el número e intente nuevamente.' });
        throw new Error('Factura no encontrada');
      }

      const { data: detallesData, error: detallesError } = await supabase
        .from('facturas_detalle')
        .select('*, producto:productos(ubicacion)')
        .eq('tenant_id', tenantId)
        .eq('factura_id', facturaData.id);

      if (detallesError) throw detallesError;

      setFactura(facturaData);
      setCliente(facturaData.cliente);
      // Con comprobante electrónico y 30 días o menos: la nota va marcada.
      setEmitirDgii(!!ecfDeFactura(facturaData) && diasDeFactura(facturaData) <= 30);
      setAvailableItems(detallesData.map(d => ({
        ...d,
        ubicacion: d.producto?.ubicacion || 'N/A'
      })));
      setItemsADevolver([]); // Start empty as per video request
      resetStaging();

    } catch (error) {
      console.error("Error buscando factura:", error);
    } finally {
      setIsSearching(false);
    }
  };

  const resetStaging = () => {
    setStagingItem({
      id: '',
      codigo: '',
      descripcion: '',
      cantidad: 0,
      precio: 0,
      itbis: 0,
      descuento: 0,
      importe: 0,
      ubicacion: ''
    });
  };

  const handleSelectItem = (val) => {
    if (val === 'ALL') {
      handleIncludeAll();
      return;
    }

    const item = availableItems.find(i => i.id === val);
    if (!item) return;

    setStagingItem({
      ...item,
      cantidad: item.cantidad // Iniciar con la cantidad completa original
    });
  };

  const handleIncludeAll = () => {
    setItemsADevolver(availableItems.map(item => ({
      ...item,
      cantidad_devuelta: item.cantidad
    })));
    resetStaging();
  };

  const handleAddToReturnList = () => {
    if (!stagingItem.id) return;

    // Validar si ya está en la lista
    if (itemsADevolver.some(i => i.id === stagingItem.id)) {
      toast({ title: 'Aviso', description: 'Este artículo ya está en la lista de devolución.' });
      return;
    }

    // Validar cantidad
    if (stagingItem.cantidad <= 0) {
      toast({ variant: 'destructive', title: 'Error', description: 'La cantidad a devolver debe ser mayor a cero.' });
      return;
    }

    setItemsADevolver([...itemsADevolver, {
      ...stagingItem,
      cantidad_devuelta: stagingItem.cantidad
    }]);
    resetStaging();
  };

  const handleQtyChange = (id, newQty) => {
    setItemsADevolver(itemsADevolver.map(d => {
      if (d.id === id) {
        const originalQtyInFactura = availableItems.find(ai => ai.id === id)?.cantidad || 0;
        const qtyToReturn = Math.max(0, Math.min(originalQtyInFactura, parseFloat(newQty) || 0));
        return { ...d, cantidad_devuelta: qtyToReturn };
      }
      return d;
    }));
  };

  const totals = useMemo(() => {
    return itemsADevolver.reduce((acc, item) => {
      const ratio = item.cantidad_devuelta / item.cantidad;
      const subtotal = item.precio * item.cantidad_devuelta;
      const descuento = item.descuento * ratio;
      const itbis = item.itbis * ratio;

      acc.subtotal += subtotal;
      acc.descuento += descuento;
      acc.itbis += itbis;
      return acc;
    }, { subtotal: 0, descuento: 0, itbis: 0 });
  }, [itemsADevolver]);

  const totalDevolucion = useMemo(() => {
    return totals.subtotal - totals.descuento + totals.itbis;
  }, [totals]);

  // (20/11/2026) Contado a un cliente que retiene: la retención no se cobró,
  // así que tampoco se devuelve. La nota de crédito sigue siendo por el total.
  // El servidor guarda este mismo número en devoluciones.efectivo_devuelto.
  const efectivoADevolver = factura ? efectivoDevuelto(totalDevolucion, factura) : totalDevolucion;
  const facturaContadoConRetencion = efectivoADevolver < totalDevolucion - 0.004;

  const handleSave = async () => {
    if (!factura) {
      toast({ variant: 'destructive', title: 'Error', description: 'Debe cargar una factura.' });
      return;
    }
    if (itemsADevolver.length === 0) {
      toast({ variant: 'destructive', title: 'Error', description: 'Debe seleccionar al menos un artículo para devolver.' });
      return;
    }
    setIsSaving(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();

      // 1. Insertar en devoluciones
      const { data: devolucion, error: devError } = await supabase.from('devoluciones').insert({
        tenant_id: tenantId,
        fecha_devolucion: formatDateForSupabase(fecha),
        factura_id: factura.id,
        // >>> UNA VENTA DE CONTADO NO TIENE CLIENTE, Y ESO ES NORMAL <<<
        // (2026-08-17) Grabar una devolución reventaba con "Cannot read
        // properties of null (reading 'id')". La factura traía el uuid de
        // ceros —el "Cliente Genérico"— pero esa fila pertenece a Repuestos
        // Morla, y la pantalla la busca filtrando por LA EMPRESA DEL USUARIO.
        // Desde Caminero no aparece, `cliente` queda null, y aquí se caía.
        //
        // Se guarda null a propósito, y no el uuid de ceros: apuntar al
        // cliente de otra empresa es justo lo que no debe hacerse, y hay
        // llave foránea contra `clientes`. Null dice la verdad — no había
        // cliente registrado — y el nombre queda igual en cliente_info.
        cliente_id: cliente?.id ?? null,
        cliente_info: cliente
          ? { nombre: cliente.nombre, rnc: cliente.rnc, direccion: cliente.direccion, telefono: cliente.telefono }
          : {
              nombre: factura.manual_cliente_nombre?.trim() || 'Consumidor final',
              rnc: null, direccion: null, telefono: null,
            },
        subtotal: totals.subtotal,
        descuento_total: totals.descuento,
        itbis_total: totals.itbis,
        total_devolucion: totalDevolucion,
        // El motivo se guarda como prefijo de notas para no requerir migracion.
        notas: motivo ? `[Motivo: ${motivo}]${notas ? ' ' + notas : ''}` : notas,
        usuario_id: user?.id
      }).select().single();
      if (devError) throw devError;

      // 2. Insertar en devoluciones_detalle
      const detallesDevolucion = itemsADevolver.filter(i => i.cantidad_devuelta > 0).map(d => {
        const ratio = d.cantidad_devuelta / d.cantidad;
        return {
          tenant_id: tenantId,
          devolucion_id: devolucion.id,
          producto_id: d.producto_id,
          cantidad: d.cantidad_devuelta,
          precio: d.precio,
          descuento: d.descuento * ratio,
          itbis: d.itbis * ratio,
          importe: d.precio * d.cantidad_devuelta
        };
      });
      const { error: detError } = await supabase.from('devoluciones_detalle').insert(detallesDevolucion);
      if (detError) throw detError;

      // 3. Actualizar inventario
      const movimientosInventario = itemsADevolver.map(d => ({
        tenant_id: tenantId,
        producto_id: d.producto_id,
        tipo: 'ENTRADA',
        cantidad: d.cantidad_devuelta,
        referencia_doc: `DEVOLUCION-${devolucion.numero}`,
        fecha: formatDateForSupabase(fecha),
        usuario_id: user?.id
      }));
      const { error: invError } = await supabase.from('inventario_movimientos').insert(movimientosInventario);
      if (invError) throw invError;

      const facturaEsCredito = String(factura.forma_pago || '').toUpperCase() === 'CREDITO';
      if (facturaEsCredito) {
        const pendienteNuevo = Math.max(0, Number(factura.monto_pendiente || 0) - totalDevolucion);
        const { error: facturaUpdateError } = await supabase
          .from('facturas')
          .update({
            monto_pendiente: pendienteNuevo,
            estado: pendienteNuevo <= 0.01 ? 'PAGADA' : factura.estado
          })
          .eq('tenant_id', tenantId)
          .eq('id', factura.id);
        if (facturaUpdateError) throw facturaUpdateError;

        // El balance solo se recalcula si hay a QUIÉN recalcularlo. Sin
        // cliente registrado no hay cuenta que cuadrar, y sin este guardia
        // se caía igual que arriba — solo que en una factura a crédito, que
        // es cuando más duele.
        if (cliente?.id) {
          const { data: pendientesCliente, error: balanceError } = await supabase
            .from('facturas')
            .select('monto_pendiente')
            .eq('tenant_id', tenantId)
            .eq('cliente_id', cliente.id)
            .eq('estado', 'PENDIENTE');
          if (balanceError) throw balanceError;

          const balance = (pendientesCliente || []).reduce((sum, f) => sum + (Number(f.monto_pendiente) || 0), 0);
          const { error: clienteUpdateError } = await supabase
            .from('clientes')
            .update({ balance })
            .eq('tenant_id', tenantId)
            .eq('id', cliente.id);
          if (clienteUpdateError) throw clienteUpdateError;
        }
      }

      setNumeroGuardado(devolucion.numero);
      toast({
        title: `✅ Devolución DV-${devolucion.numero} guardada`,
        description: facturaContadoConRetencion
          ? `Artículos reintegrados al inventario. Entrega al cliente RD$ ${efectivoADevolver.toFixed(2)} (la retención no se le cobró).`
          : 'Artículos reintegrados al inventario.',
      });

      if (imprimir) {
        printDevolucionPOS(devolucion, factura, cliente, detallesDevolucion);
      }

      // Nota de crédito electrónica (E34): la devolución ya quedó grabada; si
      // la nota falla, se reintenta buscando la factura de nuevo.
      if (emitirDgii && ecfDeFactura(factura)) {
        await emitirNota(devolucion.id, motivo || notas);
      }

      resetForm(true);

    } catch (error) {
      toast({ variant: 'destructive', title: 'Error al guardar', description: error.message });
    } finally {
      setIsSaving(false);
    }
  };

  const resetForm = (fullReset = true) => {
    if (fullReset) {
      setFacturaNumero('');
    }
    setFactura(null);
    setCliente(null);
    setAvailableItems([]);
    setItemsADevolver([]);
    resetStaging();
    setNotas('');
    setMotivo('');
    setFecha(getCurrentDateInTimeZone());
    setImprimir(false);
    setEmitirDgii(false);
    setNotaPendiente(null);
  };

  const handleKeyDown = useCallback((e) => {
    // Escondida, esta pestaña oía las teclas de las demás: F10 grababa la
    // devolución y Escape movía el historial del navegador desde otra pantalla.
    if (activePanel !== 'devoluciones') return;
    if (e.key === 'Escape' && e.defaultPrevented) return; // era de un diálogo
    if (e.key === 'F10') { e.preventDefault(); document.getElementById('save-trigger')?.click(); }
    if (e.key === 'Escape') { e.preventDefault(); navigate(-1); }
  }, [navigate, activePanel]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return (
    <>
      <Helmet><title>Devoluciones — MotoFlow</title></Helmet>
      <div className="h-full flex flex-col p-2 bg-gray-100 space-y-2 overflow-y-auto">

        {/* Title Bar */}
        <div className="bg-[#a3c2f0] py-0.5 px-4 flex justify-center items-center border-b border-blue-400 shadow-sm shrink-0">
          <h2 className="text-base font-bold text-slate-800 tracking-widest uppercase flex items-center gap-4">
            DEVOLUCION
          </h2>
        </div>

        {/* Top Section: Split Header */}
        <div className="grid grid-cols-12 gap-2 shrink-0">

          {/* Box 1: Detalles de la Devolución */}
          <div className="col-span-4 bg-[#f8f9fa] border-2 border-slate-300 rounded p-3 relative shadow-sm">
            <span className="absolute -top-3 left-3 bg-[#f8f9fa] px-2 text-[10px] font-black text-slate-500 uppercase">Detalles de la Devolución</span>
            <div className="space-y-2">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Label className="text-[10px] font-bold text-slate-600 uppercase w-16">NUMERO</Label>
                  <Input readOnly value={numeroGuardado ? `DV-${numeroGuardado}` : 'NUEVA'} title={numeroGuardado ? 'Última devolución grabada' : 'El número se asigna al grabar'} className={`h-7 w-20 bg-white border-slate-400 text-center font-bold ${numeroGuardado ? 'text-red-600' : 'text-slate-400'}`} />
                </div>
                <div className="flex items-center gap-2">
                  <Label className="text-[10px] font-bold text-slate-600 uppercase">FECHA</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="h-7 border-slate-400 text-xs px-2 bg-white flex items-center gap-2">
                        {formatInTimeZone(fecha, "dd/MM/yyyy")}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={fecha} onSelect={setFecha} locale={es} /></PopoverContent>
                  </Popover>
                </div>
              </div>

              <div className="space-y-2 pt-1">
                <RadioGroup defaultValue="factura" className="flex gap-4">
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="factura" id="t-ft" className="w-3 h-3 border-slate-500 text-blue-600" />
                    <Label htmlFor="t-ft" className="text-[10px] font-bold text-slate-700">FT - Factura</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="proforma" id="t-fp" className="w-3 h-3 border-slate-500 text-blue-600" />
                    <Label htmlFor="t-fp" className="text-[10px] font-bold text-slate-700">FP - Proforma</Label>
                  </div>
                </RadioGroup>

                <div className="flex items-center gap-3">
                  <Label className="text-[11px] font-black text-slate-800 uppercase">Factura #</Label>
                  <div className="flex items-center gap-1">
                    <Input
                      value={facturaNumero}
                      onChange={e => setFacturaNumero(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleSearchFactura()}
                      className="h-7 w-24 border-blue-600 focus:ring-0 font-bold bg-white"
                    />
                    <Button size="icon" onClick={handleSearchFactura} className="h-7 w-7 bg-blue-600 hover:bg-blue-700 text-white shadow-md">
                      {isSearching ? <Loader2 className="h-3 w-3 animate-spin" /> : <Search className="h-3 w-3" />}
                    </Button>
                  </div>
                  <span className="text-[11px] font-black text-slate-800 uppercase ml-2">
                    {factura?.forma_pago || '---'}
                  </span>
                </div>

                <div className="pt-1 border-t border-dashed border-slate-300">
                  <div className="flex items-center gap-2">
                    <Label className="text-[10px] font-bold text-red-600 uppercase whitespace-nowrap">NCF</Label>
                    <Input readOnly value={factura?.ncf || ''} className="h-7 flex-grow border-slate-400 text-center font-mono text-xs bg-slate-50" />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Box 2: Datos de Cliente */}
          <div className="col-span-8 bg-[#f8f9fa] border-2 border-slate-300 rounded p-3 relative shadow-sm flex flex-col justify-start">
            <span className="absolute -top-3 left-3 bg-[#f8f9fa] px-2 text-[10px] font-black text-slate-500 uppercase">Datos de Cliente</span>
            <div className="grid grid-cols-12 gap-x-4 gap-y-1.5">
              <div className="col-span-7 flex items-center gap-3">
                <Label className="text-[10px] font-bold text-slate-600 uppercase w-16 text-right">Cliente</Label>
                <Input readOnly value={cliente?.codigo || ''} className="h-7 flex-grow font-mono text-[11px] bg-slate-50 border-slate-300" />
              </div>
              <div className="col-span-5 flex items-center gap-3">
                <Label className="text-[10px] font-bold text-slate-600 uppercase w-12 text-right">RNC</Label>
                <Input readOnly value={cliente?.rnc || ''} className="h-7 flex-grow font-mono text-[11px] bg-slate-50 border-slate-300" />
              </div>

              <div className="col-span-12 flex items-center gap-3">
                <Label className="text-[10px] font-bold text-slate-600 uppercase w-16 text-right">Nombre</Label>
                <Input readOnly value={cliente?.nombre || ''} className="h-7 flex-grow font-bold text-[11px] bg-slate-50 border-slate-300" />
              </div>

              <div className="col-span-12 flex items-start gap-3">
                <Label className="text-[10px] font-bold text-slate-600 uppercase w-16 text-right mt-1.5">Direccion</Label>
                <Textarea readOnly value={cliente?.direccion || ''} className="min-h-[32px] h-8 flex-grow text-[11px] bg-slate-50 border-slate-300 resize-none p-1.5" />
              </div>

              <div className="col-span-12 flex items-center gap-3">
                <Label className="text-[10px] font-bold text-slate-600 uppercase w-16 text-right">Telefonos</Label>
                <Input readOnly value={cliente?.telefono || ''} className="h-7 flex-grow font-mono text-[11px] bg-slate-50 border-slate-300" />
              </div>
            </div>
          </div>
        </div>

        {/* Main Section: Table and Staging Row */}
        <div className="flex-grow bg-white border-2 border-slate-300 rounded shadow-inner flex flex-col overflow-hidden">
          <div className="overflow-y-auto flex-grow">
            <Table>
              <TableHeader className="sticky top-0 bg-slate-100 z-20 shadow-sm border-b-2 border-slate-400">
                {/* Yellow Staging Row Header (Placeholder/Logic Row) */}
                <TableRow className="bg-[#ffffdf] hover:bg-[#ffffdf] border-b-2 border-slate-500 h-10 group">
                  <TableCell colSpan={2} className="p-1">
                    <Select disabled={!factura} onValueChange={handleSelectItem} value={stagingItem.id}>
                      <SelectTrigger className="w-full h-8 border-slate-400 bg-white text-xs">
                        <SelectValue placeholder="--^-- Seleccione la Mercancia que desea Devolver --^--" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ALL" className="text-xs font-bold text-blue-700">{"\u00BB\u00BB\u00BB"} Incluir Todos</SelectItem>
                        {availableItems.filter(ai => !itemsADevolver.some(idv => idv.id === ai.id)).map(d => (
                          <SelectItem key={d.id} value={d.id} className="text-xs">
                            {d.codigo} - {d.descripcion}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="p-1">
                    <Input
                      type="number"
                      value={stagingItem.cantidad}
                      onChange={e => setStagingItem({ ...stagingItem, cantidad: parseFloat(e.target.value) || 0 })}
                      className="h-7 text-center font-bold bg-white border-slate-400 text-xs"
                    />
                  </TableCell>
                  <TableCell className="p-1"><Input value="UND" readOnly className="h-7 text-center bg-slate-50 border-slate-400 text-[10px]" /></TableCell>
                  <TableCell className="p-1"><Input value={stagingItem.ubicacion || ''} readOnly className="h-7 text-center bg-slate-50 border-slate-400 text-xs" /></TableCell>
                  <TableCell className="p-1"><Input value={stagingItem.precio.toFixed(2)} readOnly className="h-7 text-right font-bold bg-slate-50 border-slate-400 text-xs" /></TableCell>
                  <TableCell className="p-1"><Input value={(stagingItem.descuento * (stagingItem.cantidad / (stagingItem.cantidad || 1))).toFixed(2)} readOnly className="h-7 text-right font-bold bg-slate-50 border-slate-400 text-xs" /></TableCell>
                  <TableCell className="p-1"><Input value={(stagingItem.itbis * (stagingItem.cantidad / (stagingItem.cantidad || 1))).toFixed(2)} readOnly className="h-7 text-right bg-slate-50 border-slate-400 text-xs" /></TableCell>
                  <TableCell className="p-1 flex items-center gap-1">
                    <Input value={(stagingItem.precio * stagingItem.cantidad).toFixed(2)} readOnly className="h-7 text-right bg-slate-50 border-slate-400 font-bold text-xs flex-grow" />
                    <Button onClick={handleAddToReturnList} size="icon" variant="ghost" className="h-7 w-7 bg-slate-300 hover:bg-slate-400 text-slate-800 font-bold text-xs border border-slate-400">Ok</Button>
                  </TableCell>
                </TableRow>

                <TableRow className="bg-slate-50 h-8">
                  <TableHead className="text-[10px] font-black uppercase text-slate-800 border-r py-0 h-8">CODIGO</TableHead>
                  <TableHead className="text-[10px] font-black uppercase text-slate-800 border-r py-0 h-8 flex-grow">DESCRIPCION</TableHead>
                  <TableHead className="text-[10px] font-black uppercase text-slate-800 border-r py-0 h-8 text-center w-20">CANT.</TableHead>
                  <TableHead className="text-[10px] font-black uppercase text-slate-800 border-r py-0 h-8 text-center w-16">UND</TableHead>
                  <TableHead className="text-[10px] font-black uppercase text-slate-800 border-r py-0 h-8 text-center w-16">ALM</TableHead>
                  <TableHead className="text-[10px] font-black uppercase text-slate-800 border-r py-0 h-8 text-right w-24">PRECIO</TableHead>
                  <TableHead className="text-[10px] font-black uppercase text-slate-800 border-r py-0 h-8 text-right w-20">DESC.</TableHead>
                  <TableHead className="text-[10px] font-black uppercase text-slate-800 border-r py-0 h-8 text-right w-24">ITBIS</TableHead>
                  <TableHead className="text-[10px] font-black uppercase text-slate-800 py-0 h-8 text-right w-32">IMPORTE</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {itemsADevolver.length === 0 ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <TableRow key={i} className="h-7 border-b border-slate-200">
                      {Array.from({ length: 9 }).map((_, j) => (
                        <TableCell key={j} className="p-0 border-r border-slate-100 last:border-r-0 h-7" />
                      ))}
                    </TableRow>
                  ))
                ) : (
                  <>
                    {itemsADevolver.map(d => (
                      <TableRow key={d.id} className="h-8 hover:bg-slate-50 border-b border-slate-200">
                        <TableCell className="py-1 text-[11px] font-mono border-r border-slate-200">{d.codigo}</TableCell>
                        <TableCell className="py-1 text-[11px] border-r border-slate-200">{d.descripcion?.toUpperCase()}</TableCell>
                        <TableCell className="py-1 border-r border-slate-200">
                          <Input
                            type="number"
                            value={d.cantidad_devuelta}
                            onChange={e => handleQtyChange(d.id, e.target.value)}
                            className="h-6 w-16 mx-auto text-center font-bold bg-yellow-100 border-slate-400 text-xs"
                          />
                        </TableCell>
                        <TableCell className="py-1 text-[10px] text-center border-r border-slate-200">UND</TableCell>
                        <TableCell className="py-1 text-[10px] text-center border-r border-slate-200">{d.ubicacion}</TableCell>
                        <TableCell className="py-1 text-right text-[11px] border-r border-slate-200 font-mono">{d.precio.toFixed(2)}</TableCell>
                        <TableCell className="py-1 text-right text-[11px] border-r border-slate-200 text-red-600 font-mono">{((d.descuento / d.cantidad) * d.cantidad_devuelta).toFixed(2)}</TableCell>
                        <TableCell className="py-1 text-right text-[11px] border-r border-slate-200 font-mono">{((d.itbis / d.cantidad) * d.cantidad_devuelta).toFixed(2)}</TableCell>
                        <TableCell className="py-1 text-right text-[11px] font-bold font-mono">{(d.precio * d.cantidad_devuelta).toFixed(2)}</TableCell>
                      </TableRow>
                    ))}
                    {Array.from({ length: Math.max(0, 8 - itemsADevolver.length) }).map((_, i) => (
                      <TableRow key={`empty-${i}`} className="h-7 border-b border-slate-200">
                        {Array.from({ length: 9 }).map((_, j) => (
                          <TableCell key={j} className="p-0 border-r border-slate-100 last:border-r-0 h-7" />
                        ))}
                      </TableRow>
                    ))}
                  </>
                )}
              </TableBody>
            </Table>
          </div>
        </div>

        {/* Footer Area */}
        <div className="grid grid-cols-12 gap-2 shrink-0">

          {/* Left: Notas + Motivo */}
          <div className="col-span-8 flex flex-col gap-2">
            {/* Notes Box */}
            <div className="bg-[#f8f9fa] border-2 border-slate-300 rounded p-3 relative shadow-sm flex-grow">
              <span className="absolute -top-3 left-3 bg-[#f8f9fa] px-2 text-[10px] font-black text-slate-500 uppercase">Notas y Comentarios</span>
              <Textarea
                value={notas}
                onChange={e => setNotas(e.target.value)}
                className="w-full h-20 text-[11px] bg-white border-slate-300 resize-none"
                placeholder="Ingrese notas sobre la devolución aquí..."
              />
            </div>

            {/* Motivo de devolución (campo nuevo) */}
            <div className="bg-[#f8f9fa] border-2 border-slate-300 rounded p-3 relative shadow-sm">
              <span className="absolute -top-3 left-3 bg-[#f8f9fa] px-2 text-[10px] font-black text-slate-500 uppercase">Motivo de la Devolución</span>
              <Select value={motivo} onValueChange={setMotivo}>
                <SelectTrigger className="h-8 bg-white border-slate-400 text-xs">
                  <SelectValue placeholder="Seleccione el motivo..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Defectuoso">Producto defectuoso</SelectItem>
                  <SelectItem value="Equivocado">Producto equivocado</SelectItem>
                  <SelectItem value="Garantia">Garantía</SelectItem>
                  <SelectItem value="No le sirvio">No le sirvió al cliente</SelectItem>
                  <SelectItem value="Cliente desistio">Cliente desistió de la compra</SelectItem>
                  <SelectItem value="Otro">Otro</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Totals and checkboxes */}
          <div className="col-span-4 flex flex-col gap-2">

            {/* Totals Box */}
            <div className="bg-white border-2 border-slate-300 rounded shadow-sm p-3 space-y-1">
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-bold text-slate-600 uppercase">Sub-Total</span>
                <span className="font-mono text-xs font-bold">{totals.subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-bold text-slate-600 uppercase">Descuento</span>
                <span className="font-mono text-xs font-bold text-red-600">{totals.descuento.toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-bold text-slate-600 uppercase">Recargo</span>
                <span className="font-mono text-xs font-bold">0.00</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-bold text-slate-600 uppercase">TOTAL ITBIS</span>
                <span className="font-mono text-xs font-bold">{totals.itbis.toFixed(2)}</span>
              </div>
              <div className="h-px bg-slate-300 my-1" />
              <div className="flex justify-between items-center">
                <span className="text-[11px] font-black text-slate-800 uppercase">TOTAL DEVOLUCION</span>
                <span className="font-mono text-base font-black text-blue-800">{totalDevolucion.toFixed(2)}</span>
              </div>
              {facturaContadoConRetencion && (
                <div className="mt-1 rounded bg-amber-50 border border-amber-200 px-2 py-1">
                  <div className="flex justify-between items-center">
                    <span className="text-[11px] font-black text-amber-900 uppercase">A devolver al cliente</span>
                    <span className="font-mono text-base font-black text-amber-900">{efectivoADevolver.toFixed(2)}</span>
                  </div>
                  <p className="text-[10px] text-amber-800">El cliente retuvo {Number(factura.retenido_no_cobrado).toFixed(2)} en esta factura: esa parte no se cobró y no se devuelve.</p>
                </div>
              )}
            </div>

            {/* Print Checkbox */}
            <div className="flex items-center gap-2 px-1">
              <Checkbox id="imprimir" checked={imprimir} onCheckedChange={setImprimir} className="border-slate-400" />
              <Label htmlFor="imprimir" className="text-[10px] font-bold text-slate-600 uppercase cursor-pointer">Imprimir comprobante al grabar</Label>
            </div>

            {/* Emitir Nota de Credito DGII */}
            <div className="flex items-center gap-2 px-1">
              <Checkbox
                id="emitir-dgii"
                checked={emitirDgii}
                onCheckedChange={setEmitirDgii}
                disabled={!factura || !ecfDeFactura(factura) || diasDeFactura(factura) > 30}
                className="border-slate-400"
              />
              <Label
                htmlFor="emitir-dgii"
                className={`text-[10px] font-bold uppercase cursor-pointer ${(!factura || !ecfDeFactura(factura)) ? 'text-slate-400' : 'text-emerald-700'}`}
              >
                Emitir nota de crédito electrónica (E34) {emitiendoDgii && <Loader2 className="inline w-3 h-3 animate-spin ml-1" />}
              </Label>
            </div>
            {factura && ecfDeFactura(factura) && diasDeFactura(factura) > 30 && (
              <p className="text-[10px] text-amber-700 italic px-1">
                La factura tiene {diasDeFactura(factura)} días: pasados 30 la nota ya no rebaja el ITBIS. Consúltelo con su contador; la devolución se puede grabar sin nota.
              </p>
            )}
            {notaPendiente && (
              <div className="mx-1 rounded border border-amber-300 bg-amber-50 p-2 text-[11px] text-amber-900">
                {notaPendiente.documento?.estado_dgii === 'rechazado'
                  ? `La DGII rechazó la nota ${notaPendiente.encf} de la devolución DV-${notaPendiente.numero}: se rehace con otro número.`
                  : `La devolución DV-${notaPendiente.numero} de esta factura quedó sin su nota de crédito.`}
                <button
                  type="button"
                  disabled={emitiendoDgii}
                  onClick={() => emitirNota(notaPendiente.id)}
                  className="ml-2 rounded bg-emerald-600 px-2 py-0.5 font-bold text-white disabled:opacity-50"
                >
                  {emitiendoDgii ? 'Enviando…' : 'Emitir nota ahora'}
                </button>
              </div>
            )}
            {factura && !ecfDeFactura(factura) && (
              <p className="text-[10px] text-amber-600 italic px-1">
                La factura original no tiene e-NCF DGII — no se puede emitir Nota Tipo 34.
              </p>
            )}
          </div>
        </div>

        {/* Barra de acciones — ancho completo abajo */}
        <div className="flex gap-3 shrink-0 pt-1">
          <Button
            variant="outline"
            onClick={() => navigate(-1)}
            className="flex-1 h-11 bg-slate-100 hover:bg-slate-200 border-slate-400 text-xs font-black uppercase text-slate-700 shadow-sm"
          >
            <X className="w-4 h-4 mr-2" /> ESC - Retornar
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                id="save-trigger"
                className="flex-1 h-11 bg-[#a3c2f0] hover:bg-[#92b1e0] border-2 border-blue-400 text-xs font-black uppercase text-slate-800 shadow-md"
                disabled={isSaving || !factura}
              >
                {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />} F10 - Grabar
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle className="flex items-center gap-2"><AlertTriangle className="text-yellow-500 h-5 w-5" /> ¿Confirmar Devolución?</AlertDialogTitle>
                <AlertDialogDescription className="text-sm">
                  ¿Está seguro que desea grabar esta devolución? Esta acción reintegrará los artículos al inventario.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="text-xs uppercase font-bold">Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={handleSave} className="bg-blue-600 hover:bg-blue-700 text-xs uppercase font-bold text-white">Confirmar</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    </>
  );
};

export default DevolucionesPage;
