import React from 'react';
import { Search, Calendar as CalendarIcon, X, Loader2, FileEdit, FileText, ClipboardList } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { format } from 'date-fns';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

const VentasHeader = ({
  cliente,
  date,
  setDate,
  onClienteSearch,
  onSelectCliente,
  onClearCliente,
  vendedores = [],
  selectedVendedor,
  onVendedorChange,
  almacenes = [],
  selectedAlmacen,
  onAlmacenChange,
  nextFacturaNumero,
  loadingNumero,
  onEditFactura,
  onCotizacionesClick,
  onPedidosClick,
  isEditingNumero,
  editNumero,
  setEditNumero,
  onSearchInvoice,
  editingFacturaNumero,
  manualClienteNombre,
  setManualClienteNombre,
}) => {
  const isGeneric = !cliente?.id ||
    ['00000000-0000-0000-0000-000000000000', '2749fa36-3d7c-4bdf-ad61-df88eda8365a'].includes(cliente.id) ||
    cliente.nombre?.toUpperCase().includes('GENERICO');

  return (
    <div className="bg-white space-y-0.5 border-b border-gray-300">
      {/* Top Utility Bar - Solid Navy */}
      <div className="bg-[#0a1e3a] text-white flex items-center justify-between px-2 py-0.5 h-8">
        <TooltipProvider>
          <div className="flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className={`h-6.5 w-7 p-0 hover:bg-white/20 text-white rounded-none border border-white/20 ${isEditingNumero ? 'bg-white/20' : ''}`}
                  onClick={onEditFactura}
                >
                  <FileEdit className="w-3.5 h-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent className="bg-slate-800 text-white border-none text-[10px] font-bold">EDITAR FACTURA</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6.5 w-7 p-0 hover:bg-white/20 text-white rounded-none border border-white/20"
                  onClick={onCotizacionesClick}
                >
                  <FileText className="w-3.5 h-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent className="bg-slate-800 text-white border-none text-[10px] font-bold">COTIZACIONES</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6.5 w-7 p-0 hover:bg-white/20 text-white rounded-none border border-white/20"
                  onClick={onPedidosClick}
                >
                  <ClipboardList className="w-3.5 h-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent className="bg-slate-800 text-white border-none text-[10px] font-bold">FACTURAS PEDIDOS</TooltipContent>
            </Tooltip>
          </div>
        </TooltipProvider>

        <h1 className="flex-grow text-center text-[15px] font-black tracking-[0.2em] uppercase text-white">
          REPUESTOS MORLA <span className="text-blue-300 mx-2">|</span> FACTURACIÓN
        </h1>

        <div className="flex items-center gap-2">
          <div className="text-[10px] font-black px-1.5 py-0.5 border border-white/20 uppercase tracking-widest">v2.0 PRO</div>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-1 p-1 px-1.5">
        {/* Client Data Section */}
        <div className="col-span-8 modern-section-card bg-white border-t border-x border-gray-300 !rounded-none !shadow-none mb-0">
          <div className="py-0.5 px-2 bg-white border-b border-gray-200">
            <h2 className="text-[12px] font-bold text-[#0a1e3a] uppercase tracking-wider border-b-2 border-[#0a1e3a] inline-block pb-0.5">DATOS DEL CLIENTE</h2>
            <span className="float-right text-[10px] text-gray-400 font-bold tracking-widest uppercase mt-0.5">TECLA F3 PARA BUSCAR</span>
          </div>
          <div className="p-1 px-2 grid grid-cols-12 gap-x-2 gap-y-1 items-center">
            {/* Row 1: ID and Search */}
            <div className="col-span-2 text-right">
              <Label htmlFor="cliente-id" className="text-[11px] font-black text-gray-500 uppercase tracking-tight">CLIENTE ID:</Label>
            </div>
            <div className="col-span-4 flex gap-0.5 relative">
              <div className="relative flex-grow">
                <Search className="absolute left-1 top-1/2 transform -translate-y-1/2 w-3 h-3 text-gray-400" />
                <Input
                  id="cliente-id"
                  className="h-5 pl-5 text-[11px] font-medium border-gray-300 rounded-none bg-gray-50 focus:ring-0 focus:border-blue-500 uppercase text-[#0a1e3a]"
                  placeholder="000.000.00"
                  value={cliente ? cliente.id : ''}
                  readOnly
                  onClick={onClienteSearch}
                />
              </div>
              <Button
                variant="default"
                size="sm"
                className="h-5 px-3 bg-[#0a1e3a] hover:bg-[#0a1e3a]/90 text-white rounded-none font-bold text-[10px] tracking-wider uppercase border border-[#0a1e3a]"
                onClick={onClienteSearch}
              >
                <Search className="w-3 h-3 mr-1" />
                BUSCAR
              </Button>
            </div>

            <div className="col-span-1 text-right">
              <Label className="text-[11px] font-black text-gray-500 uppercase tracking-tight">RNC:</Label>
            </div>
            <div className="col-span-3">
              <Input
                className="h-5 text-[11px] font-medium border-gray-300 rounded-none bg-gray-50 text-gray-700 uppercase"
                value={cliente?.rnc || '000000000'}
                readOnly
              />
            </div>
            <div className="col-span-2"></div>

            {/* Row 2: Name */}
            <div className="col-span-2 text-right">
              <Label htmlFor="nombre" className="text-[11px] font-black text-gray-500 uppercase tracking-tight">NOMBRE:</Label>
            </div>
            <div className="col-span-8">
              <Input
                id="nombre"
                className={`h-5 text-[11px] font-medium border-gray-300 rounded-none bg-white focus:ring-0 text-[#0a1e3a] uppercase shadow-sm ${isGeneric ? 'border-yellow-400 bg-yellow-50' : ''}`}
                value={isGeneric ? manualClienteNombre : (cliente?.nombre || 'CLIENTE GENERICO')}
                onChange={(e) => isGeneric && setManualClienteNombre(e.target.value)}
                readOnly={!isGeneric}
                placeholder={isGeneric ? "ESCRIBA NOMBRE O VEHICULO DEL CLIENTE..." : ""}
              />
            </div>
            <div className="col-span-2"></div>

            {/* Row 3: Address and Tel */}
            <div className="col-span-2 text-right">
              <Label className="text-[11px] font-black text-gray-500 uppercase tracking-tight">DIRECCIÓN:</Label>
            </div>
            <div className="col-span-4">
              <Input
                className="h-5 text-[11px] font-medium border-gray-300 rounded-none bg-gray-50 text-gray-500 uppercase italic"
                value={cliente?.direccion || 'N/A'}
                readOnly
              />
            </div>
            <div className="col-span-1 text-right">
              <Label className="text-[11px] font-black text-gray-500 uppercase tracking-tight">TEL:</Label>
            </div>
            <div className="col-span-3">
              <Input
                className="h-5 text-[11px] font-medium border-gray-300 rounded-none bg-gray-50 text-gray-700 uppercase"
                value={cliente?.telefono || 'N/A'}
                readOnly
              />
            </div>
            <div className="col-span-2"></div>
          </div>
        </div>

        {/* Detalles de la Factura */}
        <div className="col-span-4 modern-section-card border-gray-300 !rounded-none !shadow-none">
          <div className="px-2 py-0.5 border-b border-gray-100 flex items-center justify-between h-7">
            <h2 className="text-[14px] font-black text-[#0a1e3a] uppercase tracking-wider border-b-2 border-[#0a1e3a] pb-0.5 mr-2">DETALLES FACTURA</h2>

            <div className="flex items-center gap-2">
              <span className="text-[12px] font-black text-gray-500 uppercase tracking-tight">FECHA:</span>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="h-5 text-[10px] font-bold border-gray-300 rounded-none bg-white hover:bg-blue-50 justify-start px-2 shadow-sm w-[110px]">
                    <CalendarIcon className="w-3 h-3 mr-1 text-[#0a1e3a]" />
                    {date ? format(date, 'dd/MM/yyyy') : '---'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={date} onSelect={setDate} initialFocus /></PopoverContent>
              </Popover>

              {isEditingNumero ? (
                <div className="flex items-center gap-1">
                  <Input
                    autoFocus
                    className="h-5 w-20 text-[10px] font-black px-1.5 bg-red-50 border-red-200 text-red-600 uppercase"
                    placeholder="Nº..."
                    value={editNumero}
                    onChange={(e) => setEditNumero(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && onSearchInvoice()}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5 text-gray-400 hover:text-red-600"
                    onClick={onEditFactura}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ) : (
                <div className={`text-white text-[11px] px-3 py-0.5 font-black uppercase rounded shadow-sm min-w-[140px] text-center ${editingFacturaNumero ? 'bg-orange-600' : 'bg-red-600'}`}>
                  {loadingNumero ? <Loader2 className="w-3 h-3 animate-spin mx-auto" /> : `Nº ${editingFacturaNumero || nextFacturaNumero || '---'}`}
                </div>
              )}
            </div>
          </div>
          <div className="p-1 px-2 space-y-0.5">
            {/* Row 1: Comprobante */}
            <div className="grid grid-cols-4 gap-x-1.5 gap-y-1 items-center">
              <Label className="col-span-1 text-[10px] font-black text-gray-400 uppercase tracking-tight text-right">COMPROB:</Label>
              <Select value={cliente?.tipo_ncf || '02'}>
                <SelectTrigger className="h-5 text-[10px] font-bold border-gray-300 rounded-none bg-white col-span-3 shadow-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-white">
                  <SelectItem value="01" className="text-xs font-semibold">B01 - CREDITO FISCAL</SelectItem>
                  <SelectItem value="02" className="text-xs font-semibold">B02 - CONSUMO</SelectItem>
                  <SelectItem value="14" className="text-xs font-semibold">B14 - ESPECIAL</SelectItem>
                </SelectContent>
              </Select>

              <Label className="col-span-1 text-[12px] font-black text-gray-300 uppercase tracking-tight text-right">NCF:</Label>
              <div className="col-span-3 bg-slate-50 border border-gray-200 h-5 text-[12px] font-mono font-bold flex items-center px-2 text-slate-400 rounded-none">
                B020000000001
              </div>

              <Label className="col-span-1 text-[10px] font-black text-gray-400 uppercase tracking-tight text-right">VENDEDOR:</Label>
              <Select value={selectedVendedor} onValueChange={onVendedorChange}>
                <SelectTrigger className="h-5 text-[10px] font-bold border-gray-300 rounded-none bg-white col-span-3 shadow-sm">
                  <SelectValue placeholder="VENDEDOR" />
                </SelectTrigger>
                <SelectContent className="bg-white">
                  {vendedores.map(v => <SelectItem key={v.id} value={v.id} className="text-xs font-semibold">{v.nombre?.toUpperCase()}</SelectItem>)}
                </SelectContent>
              </Select>

              <Label className="col-span-1 text-[10px] font-black text-gray-400 uppercase tracking-tight text-right">ALMACÉN:</Label>
              <Select value={selectedAlmacen} onValueChange={onAlmacenChange}>
                <SelectTrigger className="h-5 text-[10px] font-bold border-gray-300 rounded-none bg-white col-span-3 shadow-sm">
                  <SelectValue placeholder="ALMACEN" />
                </SelectTrigger>
                <SelectContent className="bg-white">
                  {almacenes.map(a => <SelectItem key={a.id} value={a.id} className="text-xs font-semibold">{a.nombre?.toUpperCase()}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VentasHeader;
