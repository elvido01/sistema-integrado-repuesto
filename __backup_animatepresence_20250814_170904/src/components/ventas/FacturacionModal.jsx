import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Search, Calendar as CalendarIcon, Save, XCircle, Trash2, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';
import { formatInTimeZone } from '@/lib/dateUtils';
import { useVentas } from '@/hooks/useVentas';
import ProductSearchModal from '@/components/ventas/ProductSearchModal';
import ClienteSearchModal from '@/components/ventas/ClienteSearchModal';
import CotizacionSearchModal from '@/components/ventas/CotizacionSearchModal';
import { generateFacturaPDF } from '@/components/common/PDFGenerator';

const FacturacionModal = ({ isOpen, onClose, onConfirm, isSaving, totals, paymentType, setPaymentType, diasCredito, setDiasCredito, montoRecibido, setMontoRecibido, cambio, cliente }) => {
  const { toast } = useToast();
  const {
    items,
    itemCode, setItemCode,
    addProductToInvoice,
    handleUpdateItem,
    handleDeleteItem,
    handleAddProductByCode,
    handleSelectCotizacion,
    date, setDate,
    handleSelectCliente
  } = useVentas();

  const [isProductSearchOpen, setIsProductSearchOpen] = useState(false);
  const [isClienteSearchOpen, setIsClienteSearchOpen] = useState(false);
  const [isCotizacionSearchOpen, setIsCotizacionSearchOpen] = useState(false);
  const itemCodeInputRef = useRef(null);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (!isOpen) return;

      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
      if (event.key === 'F10') {
        event.preventDefault();
        onConfirm();
      }
      if (event.ctrlKey && (event.key === 'b' || event.key === 'B')) {
        event.preventDefault();
        itemCodeInputRef.current?.focus();
      }
      if (event.key === 'F6') {
        event.preventDefault();
        setIsProductSearchOpen(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, onConfirm]);

  const handleNotImplemented = (feature) => {
    toast({
      title: `ðŸš§ ${feature} no implementado`,
      description: "Esta funciÃ³n aÃºn no estÃ¡ disponible.",
    });
  };

  const emptyRowsCount = Math.max(0, 10 - items.length);
  const emptyRows = Array.from({ length: emptyRowsCount }, (_, i) => i);

  return (
    <>
      
    param($m)
    $attrs = $m.Groups[1].Value
    if ($attrs -notmatch 'mode=') { return "<AnimatePresence$attrs mode=""sync"">" }
    return $m.Value
  
        {isOpen && (
          <motion.div
            key="facturacion-modal-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/30 z-40 flex items-center justify-center p-4"
            onClick={onClose}
          >
            <motion.div
              key="facturacion-modal-panel"
              initial={{ scale: 0.95, y: -20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: -20, opacity: 0 }}
              transition={{ duration: 0.2, ease: 'easeInOut' }}
              className="relative flex flex-col bg-gray-100 rounded-lg shadow-2xl w-full max-w-[1200px] h-full max-h-[95vh] border-2 border-blue-500"
              onClick={(e) => e.stopPropagation()}
            >
              <header className="sticky top-0 bg-blue-600 text-white px-6 py-3 flex items-center justify-between rounded-t-md z-10">
                <div className="flex items-center gap-4">
                  <h2 className="text-lg font-bold">FACTURACIÃ“N</h2>
                  <Button variant="ghost" size="sm" className="text-white hover:bg-white/20 hover:text-white" onClick={() => setIsCotizacionSearchOpen(true)}>
                    <FileText className="mr-2 h-4 w-4" />
                    Cargar CotizaciÃ³n
                  </Button>
                </div>
                <button onClick={onClose} className="text-gray-300 hover:text-white"><X className="w-6 h-6" /></button>
              </header>

              <main className="flex-1 overflow-y-auto p-4">
                <div className="grid grid-cols-12 gap-4">
                  <div className="col-span-12 md:col-span-8 bg-white p-4 rounded-md shadow-sm">
                    <h3 className="font-bold text-blue-600 mb-2">Datos del Cliente</h3>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      <div className="relative">
                        <Label htmlFor="cliente">Cliente</Label>
                        <Input id="cliente" value={cliente.nombre} readOnly className="pl-10" />
                        <button onClick={() => setIsClienteSearchOpen(true)} className="absolute left-3 top-[2.1rem] -translate-y-1/2 text-gray-400 hover:text-blue-600">
                          <Search className="w-5 h-5" />
                        </button>
                      </div>
                      <div><Label htmlFor="rnc">RNC</Label><Input id="rnc" value={cliente.rnc} readOnly /></div>
                      <div className="lg:col-span-2"><Label>Nombre</Label><p className="p-2 bg-gray-100 rounded-md text-sm min-h-[38px]">{cliente.nombre}</p></div>
                      <div className="lg:col-span-2"><Label>DirecciÃ³n</Label><p className="p-2 bg-gray-100 rounded-md text-sm min-h-[38px]">{cliente.direccion}</p></div>
                      <div><Label>TelÃ©fonos</Label><p className="p-2 bg-gray-100 rounded-md text-sm min-h-[38px]">{cliente.telefono}</p></div>
                      <div><Label>CrÃ©dito</Label><p className="p-2 bg-gray-100 rounded-md text-sm min-h-[38px]">{cliente.autorizar_credito ? `Disponible (${cliente.dias_credito} dÃ­as)` : 'No Autorizado'}</p></div>
                    </div>
                  </div>
                  <div className="col-span-12 md:col-span-4 bg-white p-4 rounded-md shadow-sm">
                    <h3 className="font-bold text-blue-600 mb-2">Detalles de la Factura</h3>
                    <div className="space-y-4">
                      <div className="flex gap-2">
                        <div className="w-20"><Label>NÂº</Label><p className="p-2 bg-gray-100 rounded-md text-sm text-center font-bold">NUEVA</p></div>
                        <div className="flex-1"><Label>Fecha</Label>
                          <Popover><PopoverTrigger asChild><Button variant={"outline"} className={cn("w-full justify-start text-left font-normal", !date && "text-muted-foreground")}><CalendarIcon className="mr-2 h-4 w-4" />{date ? formatInTimeZone(date, "PPP") : <span>Pick a date</span>}</Button></PopoverTrigger><PopoverContent className="w-auto p-0"><Calendar mode="single" selected={date} onSelect={setDate} initialFocus /></PopoverContent></Popover>
                        </div>
                      </div>
                      <div><Label>Tipo NCF</Label><Select><SelectTrigger><SelectValue placeholder="Consumidor Final" /></SelectTrigger><SelectContent></SelectContent></Select></div>
                      <div><Label>NCF</Label><p className="p-2 bg-gray-100 rounded-md text-sm">B0200000001</p></div>
                      <div><Label>Vendedor</Label><Select><SelectTrigger><SelectValue placeholder="Repuestos Morla" /></SelectTrigger><SelectContent></SelectContent></Select></div>
                      <div><Label>AlmacÃ©n</Label><Select><SelectTrigger><SelectValue placeholder="A01 - PRINCIPAL" /></SelectTrigger><SelectContent></SelectContent></Select></div>
                    </div>
                  </div>
                </div>

                <div className="col-span-12 mt-4 bg-white rounded-md shadow-sm">
                  <div className="h-[450px] overflow-y-auto">
                    <Table>
                      <TableHeader className="sticky top-0 bg-gray-200 z-10">
                        <TableRow>
                          <TableHead className="w-[120px]">CÃ“DIGO</TableHead>
                          <TableHead>DESCRIPCIÃ“N</TableHead>
                          <TableHead className="w-[120px]">UBICACIÃ“N</TableHead>
                          <TableHead className="w-[80px]">CANT.</TableHead>
                          <TableHead className="w-[100px]">UND</TableHead>
                          <TableHead className="w-[120px] text-right">PRECIO</TableHead>
                          <TableHead className="w-[100px] text-right">DESC.</TableHead>
                          <TableHead className="w-[100px] text-right">ITBIS</TableHead>
                          <TableHead className="w-[140px] text-right">IMPORTE</TableHead>
                          <TableHead className="w-[50px]"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        <TableRow className="sticky top-12 bg-white z-10">
                          <TableCell>
                            <Input
                              ref={itemCodeInputRef}
                              placeholder="Ctrl+B..."
                              value={itemCode}
                              onChange={(e) => setItemCode(e.target.value)}
                              onKeyDown={(e) => e.key === 'Enter' && handleAddProductByCode(itemCode)}
                            />
                          </TableCell>
                          <TableCell colSpan={9}>
                            <Button variant="outline" className="w-full justify-start" onClick={() => setIsProductSearchOpen(true)}>
                              <Search className="mr-2 h-4 w-4" /> F6 - Buscar producto por descripciÃ³n...
                            </Button>
                          </TableCell>
                        </TableRow>
                        {items.map((item) => (
                          <TableRow key={item.id}>
                            <TableCell>{item.codigo}</TableCell>
                            <TableCell className="font-medium">{item.descripcion}</TableCell>
                            <TableCell>{item.ubicacion || '-'}</TableCell>
                            <TableCell><Input type="number" value={item.cantidad} onChange={(e) => handleUpdateItem(item.id, 'cantidad', e.target.value)} className="w-full text-center" /></TableCell>
                            <TableCell>{item.unidad}</TableCell>
                            <TableCell><Input type="number" value={item.precio} onChange={(e) => handleUpdateItem(item.id, 'precio', e.target.value)} className="w-full text-right" /></TableCell>
                            <TableCell><Input type="number" value={item.descuento} onChange={(e) => handleUpdateItem(item.id, 'descuento', e.target.value)} className="w-full text-right" /></TableCell>
                            <TableCell className="text-right">{item.itbis.toFixed(2)}</TableCell>
                            <TableCell className="text-right font-bold">{item.importe.toFixed(2)}</TableCell>
                            <TableCell>
                              <Button variant="ghost" size="icon" className="text-red-500 hover:text-red-700" onClick={() => handleDeleteItem(item.id)}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                        {emptyRows.map(i => (
                          <TableRow key={`empty-${i}`}><TableCell colSpan={10} className="h-8 border-b border-dotted border-gray-300"></TableCell></TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>

                <div className="grid grid-cols-12 gap-4 mt-4">
                  <div className="col-span-12 lg:col-span-4 bg-white p-4 rounded-md shadow-sm">
                    <h3 className="font-bold text-blue-600 mb-2">Formas de Pago</h3>
                    <RadioGroup value={paymentType} onValueChange={setPaymentType} className="flex gap-4 mb-4">
                      <div className="flex items-center space-x-2"><RadioGroupItem value="contado" id="contado" /><Label htmlFor="contado">Contado</Label></div>
                      <div className="flex items-center space-x-2"><RadioGroupItem value="credito" id="credito" disabled={!cliente.autorizar_credito} /><Label htmlFor="credito">CrÃ©dito</Label></div>
                    </RadioGroup>
                    {paymentType === 'credito' && (
                      <div><Label>DÃ­as de crÃ©dito</Label><Input type="number" value={diasCredito} onChange={(e) => setDiasCredito(e.target.value)} /></div>
                    )}
                    <div className="flex gap-2 my-2"><div className="flex-1"><Label>Forma de pago</Label><Select><SelectTrigger><SelectValue placeholder="Efectivo" /></SelectTrigger><SelectContent></SelectContent></Select></div><div><Label>Monto</Label><Input type="number" className="w-32" value={montoRecibido} onChange={(e) => setMontoRecibido(e.target.value)} /></div></div>
                    <div className="h-20 border rounded-md bg-gray-50 mb-2"></div>
                    <div className="flex justify-between font-bold"><p>Recibido:</p><p>{parseFloat(montoRecibido || 0).toFixed(2)}</p></div>
                    <div className="flex justify-between font-bold"><p>Cambio:</p><p>{cambio > 0 ? cambio.toFixed(2) : '0.00'}</p></div>
                  </div>
                  <div className="col-span-12 lg:col-span-8 bg-white p-4 rounded-md shadow-sm flex items-center justify-center">
                    <div className="w-full max-w-sm space-y-1 text-blue-800 font-semibold">
                      <div className="flex justify-between"><p>Sub-Total</p><p>{totals.subTotal.toFixed(2)}</p></div>
                      <div className="flex justify-between"><p>Descuento Items</p><p>{totals.totalDescuento.toFixed(2)}</p></div>
                      <div className="flex justify-between"><p>TOTAL ITBIS</p><p>{totals.totalItbis.toFixed(2)}</p></div>
                      <hr className="my-2 border-gray-300" />
                      <div className="flex justify-between text-red-600 text-2xl font-bold"><p>TOTAL FACTURA</p><p>{totals.totalFactura.toFixed(2)}</p></div>
                    </div>
                  </div>
                </div>
              </main>

              <footer className="sticky bottom-0 bg-gray-200 px-6 py-3 flex items-center justify-between rounded-b-md border-t">
                <TooltipProvider>
                  <div className="flex gap-2">
                    {['F6-Buscar', 'F7-Recargo', 'F8-Descuento', 'F9-Pagos'].map(tip => (
                      <Tooltip key={tip}>
                        <TooltipTrigger asChild><Button variant="ghost" size="sm" className="text-gray-500" onClick={() => handleNotImplemented(tip)}>{tip.split('-')[0]}</Button></TooltipTrigger>
                        <TooltipContent><p>{tip.split('-')[1]}</p></TooltipContent>
                      </Tooltip>
                    ))}
                  </div>
                </TooltipProvider>
                <div className="flex gap-4">
                  <Button variant="outline" onClick={onClose}><XCircle className="w-4 h-4 mr-2" />ESC â€“ Salir</Button>
                  <Button className="bg-blue-600 hover:bg-blue-700 text-white" onClick={onConfirm} disabled={isSaving}><Save className="w-4 h-4 mr-2" />{isSaving ? 'Guardando...' : 'F10 â€“ Grabar'}</Button>
                </div>
              </footer>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      <ProductSearchModal
        isOpen={isProductSearchOpen}
        onClose={() => setIsProductSearchOpen(false)}
        onSelectProduct={(product) => {
          addProductToInvoice(product);
          setIsProductSearchOpen(false);
        }}
      />
      <ClienteSearchModal
        isOpen={isClienteSearchOpen}
        onClose={() => setIsClienteSearchOpen(false)}
        onSelectCliente={(c) => {
          handleSelectCliente(c);
          setIsClienteSearchOpen(false);
        }}
      />
      <CotizacionSearchModal
        isOpen={isCotizacionSearchOpen}
        onClose={() => setIsCotizacionSearchOpen(false)}
        onSelectCotizacion={(cotizacion) => {
          handleSelectCotizacion(cotizacion);
          setIsCotizacionSearchOpen(false);
        }}
      />
    </>
  );
};

export default FacturacionModal;
