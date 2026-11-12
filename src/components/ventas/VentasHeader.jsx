import React, { useEffect, useState } from 'react';
import { Search, Calendar as CalendarIcon, X, Loader2, FileEdit, FileText, ClipboardList, Monitor, ChevronDown, ChevronUp, UserSearch } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { format } from 'date-fns';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { esClienteGenerico } from '@/lib/clienteGenerico';
import { formatoDocDgii, docFiscalValido, soloDigitos } from '@/lib/docFiscal';

const VentasHeader = ({
  cliente,
  date,
  setDate,
  onClienteSearch,
  onSelectCliente,
  onClearCliente,
  onSearchClienteByCodigo,
  clienteCodigoInput,
  setClienteCodigoInput,
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
  ncfPreview,
  // (28/10/2026) Moneda de la factura (RD$/US$) y su tasa. Solo se muestra
  // si quien llama pasa setMoneda (hoy: servicios e inmobiliarias).
  moneda = 'DOP',
  setMoneda,
  tasaCambio = '',
  setTasaCambio,
  // (11/11/2026) Lupa del RNC: busca/crea el cliente con los datos de la DGII.
  onBuscarRnc,
  // (11/11/2026) Vista de teléfono: misma lógica, otra forma (ver más abajo).
  movil = false,
  onVistaCompleta,
}) => {
  const { empresa } = useAuth();
  const nombreEmpresa = empresa?.nombre || 'Sistema';

  const isGeneric = !cliente?.id ||
    esClienteGenerico(cliente) ||
    cliente.nombre?.toUpperCase().includes('GENERICO');

  // El RNC se escribe aquí (si quien llama pasa onBuscarRnc): Enter o la lupa
  // lo buscan en la DGII y escogen/crean el cliente.
  //  - Cliente genérico: salir del campo con un RNC completo también lo busca.
  //  - (11/11/2026) Cliente ya escogido: se puede corregir el RNC, pero SOLO se
  //    aplica con Enter o la lupa (nunca por perder el foco); vacío + Enter =
  //    quitar el cliente. Si la búsqueda falla, o se sale sin aplicar, vuelve
  //    el RNC del cliente: nunca queda a la vista uno que no es el de la factura.
  //  - Editando una factura ya hecha no se toca (su comprobante ya salió).
  const rncCliente = !isGeneric && docFiscalValido(cliente?.rnc) ? formatoDocDgii(cliente.rnc) : '';
  const [rncInput, setRncInput] = useState(rncCliente);
  const [buscandoRnc, setBuscandoRnc] = useState(false);
  useEffect(() => { setRncInput(rncCliente); }, [cliente, rncCliente]);
  const puedeBuscarRnc = !!onBuscarRnc && !editingFacturaNumero;
  const cambioRnc = soloDigitos(rncInput) !== soloDigitos(rncCliente);
  const buscarRnc = async () => {
    if (!puedeBuscarRnc || buscandoRnc || !cambioRnc) return;
    setBuscandoRnc(true);
    try {
      const ok = await onBuscarRnc(soloDigitos(rncInput) ? rncInput.trim() : '');
      if (!ok) setRncInput(rncCliente);
    } finally { setBuscandoRnc(false); }
  };

  const [masDatos, setMasDatos] = useState(false);

  // Mismo comportamiento del RNC en las dos vistas (Enter/lupa aplican, Esc
  // deshace, salir del campo con genérico busca, con cliente escogido revierte).
  const rncCampo = {
    value: rncInput,
    onChange: (e) => setRncInput(e.target.value.replace(/[^0-9-]/g, '').slice(0, 13)),
    // Si se sale del campo con un RNC/cédula completo, se aplica solo:
    // un número a la vista que no entra en la factura confunde.
    onBlur: () => {
      if (buscandoRnc) return;
      if (isGeneric) {
        setRncInput((v) => formatoDocDgii(v));
        if (docFiscalValido(rncInput)) buscarRnc();
      } else if (cambioRnc) {
        setRncInput(rncCliente); // sin Enter no se aplica: vuelve el del cliente
      }
    },
    onKeyDown: (e) => {
      if (e.key === 'Enter') { e.preventDefault(); buscarRnc(); }
      // F10 con un RNC escrito sin aplicar: primero se aplica (la
      // factura no se graba con un RNC distinto al que se ve).
      if (e.key === 'F10' && cambioRnc) { e.preventDefault(); e.stopPropagation(); buscarRnc(); }
      // Escape deshace lo escrito (y no cierra la venta).
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setRncInput(rncCliente); }
    },
  };
  const rncMalo = cambioRnc && rncInput.trim() && !docFiscalValido(rncInput);

  const handleClienteCodigoKeyDown = (e) => {
    if (e.key === 'Enter' && clienteCodigoInput.trim()) {
      onSearchClienteByCodigo(clienteCodigoInput.trim());
    }
  };

  const handleBuscarClick = () => {
    if (clienteCodigoInput.trim()) {
      onSearchClienteByCodigo(clienteCodigoInput.trim());
    } else {
      onClienteSearch();
    }
  };

  // ===== Vista de teléfono (11/11/2026) =====
  // Lo mismo de abajo, apilado y para dedos: cliente (RNC con lupa), el
  // comprobante como etiqueta y lo demás (fecha, vendedor, almacén, código del
  // cliente) escondido en "Más datos".
  if (movil) {
    const numero = editingFacturaNumero || nextFacturaNumero || '---';
    return (
      <div className="border-b-2 border-gray-400 bg-[#f0efe8]">
        <div className="flex h-11 items-center gap-1 bg-[#0a1e3a] px-2 text-white">
          <button type="button" onClick={onEditFactura} title="Editar factura"
            className={`flex h-9 w-9 items-center justify-center rounded border border-white/20 ${isEditingNumero ? 'bg-white/20' : ''}`}>
            <FileEdit className="h-4 w-4" />
          </button>
          <button type="button" onClick={onCotizacionesClick} title="Cotizaciones"
            className="flex h-9 w-9 items-center justify-center rounded border border-white/20">
            <FileText className="h-4 w-4" />
          </button>
          <button type="button" onClick={onPedidosClick} title="Facturas pedidos"
            className="flex h-9 w-9 items-center justify-center rounded border border-white/20">
            <ClipboardList className="h-4 w-4" />
          </button>
          {isEditingNumero ? (
            <div className="ml-auto flex items-center gap-1">
              <Input autoFocus inputMode="numeric"
                className="h-9 w-28 rounded bg-white px-2 text-base font-black text-red-600"
                placeholder="Nº factura" value={editNumero}
                onChange={(e) => setEditNumero(e.target.value)}
                onFocus={(e) => e.target.select()}
                onKeyDown={(e) => e.key === 'Enter' && onSearchInvoice()} />
              <button type="button" onClick={onSearchInvoice} className="h-9 rounded bg-white px-2 text-xs font-black text-[#0a1e3a]">Abrir</button>
              <button type="button" onClick={onEditFactura} className="flex h-9 w-7 items-center justify-center"><X className="h-4 w-4" /></button>
            </div>
          ) : (
            <div className={`ml-auto rounded px-2 py-1 text-xs font-black ${editingFacturaNumero ? 'bg-orange-600' : 'bg-red-600'}`}>
              {loadingNumero ? <Loader2 className="h-3 w-3 animate-spin" /> : `${editingFacturaNumero ? 'Editando' : 'Nº'} ${numero}`}
            </div>
          )}
          {onVistaCompleta && !isEditingNumero && (
            <button type="button" onClick={onVistaCompleta} title="Ver la versión completa"
              className="flex h-9 w-9 items-center justify-center rounded border border-white/20">
              <Monitor className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="space-y-2 p-2">
          {/* Cliente: RNC con lupa (DGII) o el buscador de clientes */}
          <div className="flex gap-1.5">
            {puedeBuscarRnc ? (
              <div className="flex min-w-0 flex-1 gap-1">
                <Input inputMode="numeric" autoComplete="off"
                  className={`h-11 min-w-0 flex-1 rounded-md bg-white text-base font-semibold text-[#0a1e3a] ${rncMalo ? 'border-red-500 bg-red-50' : 'border-blue-300'}`}
                  placeholder="RNC o cédula"
                  {...rncCampo} />
                <button type="button" disabled={buscandoRnc || !cambioRnc} onClick={buscarRnc} title="Buscar en la DGII"
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-[#0a1e3a] text-white disabled:opacity-40">
                  {buscandoRnc ? <Loader2 className="h-5 w-5 animate-spin" /> : <Search className="h-5 w-5" />}
                </button>
              </div>
            ) : (
              <div className="flex h-11 min-w-0 flex-1 items-center rounded-md border bg-gray-50 px-3 text-sm text-gray-700">
                RNC: {cliente?.rnc ? formatoDocDgii(cliente.rnc) : '—'}
              </div>
            )}
            <button type="button" onClick={onClienteSearch} title="Buscar cliente"
              className="flex h-11 shrink-0 items-center gap-1 rounded-md border border-[#0a1e3a] bg-white px-3 text-sm font-bold text-[#0a1e3a]">
              <UserSearch className="h-5 w-5" /> Cliente
            </button>
          </div>

          {isGeneric ? (
            <Input
              className="h-11 rounded-md border-yellow-400 bg-yellow-50 text-base uppercase text-[#0a1e3a]"
              value={manualClienteNombre}
              onChange={(e) => setManualClienteNombre(e.target.value)}
              placeholder="Nombre del cliente (opcional)" />
          ) : (
            <div className="flex items-start gap-2 rounded-md border bg-white px-3 py-2">
              <div className="min-w-0 flex-1">
                <div className="truncate text-base font-black uppercase text-[#0a1e3a]">{cliente?.nombre}</div>
                <div className="truncate text-xs text-gray-500">
                  {[cliente?.codigo, cliente?.telefono].filter(Boolean).join(' · ')}
                  {cliente?.autorizar_credito && <span className="ml-1 font-bold text-blue-700">· crédito</span>}
                  {cliente?.agente_retencion && <span className="ml-1 font-bold text-amber-700">· agente de retención</span>}
                </div>
              </div>
              {/* Quita SOLO el cliente (vuelve el genérico); las líneas se quedan. */}
              {puedeBuscarRnc && (
                <button type="button" title="Quitar el cliente"
                  onClick={() => { setRncInput(''); onBuscarRnc(''); }}
                  className="p-1 text-gray-400"><X className="h-5 w-5" /></button>
              )}
            </div>
          )}

          {/* Comprobante: tipo + número que va a salir */}
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="rounded-full bg-[#0a1e3a] px-2.5 py-1 font-black text-white">
              {ncfPreview?.nombre || 'Comprobante…'}
              {ncfPreview?.electronico && <span className="ml-1 text-emerald-300">e-CF</span>}
            </span>
            <span className={`rounded-full border px-2.5 py-1 font-mono font-bold ${
              ncfPreview?.ncf ? 'border-yellow-400 bg-yellow-50 text-yellow-800'
                : ncfPreview?.aviso ? 'border-red-400 bg-red-50 text-red-700' : 'border-gray-300 bg-white text-gray-400'}`}>
              {ncfPreview?.ncf || ncfPreview?.aviso || '—'}
            </span>
            {ncfPreview?.quedan != null && ncfPreview.quedan <= 50 && (
              <span className="font-bold text-orange-600">quedan {ncfPreview.quedan}</span>
            )}
            {ncfPreview?.motivo && <span className="w-full text-red-600">{ncfPreview.motivo}</span>}
          </div>

          {setMoneda && (
            <div className="flex items-center gap-2">
              <select value={moneda} onChange={(e) => setMoneda(e.target.value)}
                className={`h-10 flex-1 rounded-md border px-2 text-sm font-bold ${moneda === 'USD' ? 'border-emerald-500 bg-emerald-50 text-emerald-800' : 'border-gray-300 bg-white text-[#0a1e3a]'}`}>
                <option value="DOP">RD$ PESOS</option>
                <option value="USD">US$ DÓLARES</option>
              </select>
              {moneda === 'USD' && (
                <Input className="h-10 w-32 rounded-md border-emerald-500 bg-white text-right text-base font-bold"
                  inputMode="decimal" placeholder="Tasa" value={tasaCambio}
                  onChange={(e) => setTasaCambio?.(e.target.value.replace(/[^0-9.]/g, ''))} />
              )}
            </div>
          )}

          <button type="button" onClick={() => setMasDatos((v) => !v)}
            className="flex w-full items-center justify-center gap-1 text-xs font-bold uppercase text-gray-500">
            {masDatos ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />} Más datos (fecha, vendedor, almacén)
          </button>
          {masDatos && (
            <div className="grid grid-cols-2 gap-2 rounded-md border bg-white p-2">
              <div className="col-span-2 flex gap-1">
                <Input className="h-10 flex-1 rounded-md text-base uppercase" placeholder="Código del cliente"
                  value={clienteCodigoInput}
                  onChange={(e) => setClienteCodigoInput(e.target.value.toUpperCase())}
                  onKeyDown={handleClienteCodigoKeyDown} />
                <button type="button" onClick={handleBuscarClick} className="h-10 rounded-md bg-[#0a1e3a] px-3 text-xs font-bold text-white">Buscar</button>
              </div>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="col-span-2 h-10 justify-start text-sm">
                    <CalendarIcon className="mr-2 h-4 w-4" /> {date ? format(date, 'dd/MM/yyyy') : '---'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={date} onSelect={setDate} initialFocus /></PopoverContent>
              </Popover>
              <Select value={selectedVendedor} onValueChange={onVendedorChange}>
                <SelectTrigger className="h-10 text-xs font-bold"><SelectValue placeholder="VENDEDOR" /></SelectTrigger>
                <SelectContent className="bg-white">
                  {vendedores.map((v) => <SelectItem key={v.id} value={v.id} className="text-sm">{v.nombre?.toUpperCase()}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={selectedAlmacen} onValueChange={onAlmacenChange}>
                <SelectTrigger className="h-10 text-xs font-bold"><SelectValue placeholder="ALMACÉN" /></SelectTrigger>
                <SelectContent className="bg-white">
                  {almacenes.map((a) => <SelectItem key={a.id} value={a.id} className="text-sm">{a.nombre?.toUpperCase()}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[#f0efe8] space-y-0 border-b-2 border-gray-500">
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
          {nombreEmpresa} <span className="text-blue-300 mx-2">|</span> FACTURACIÓN
        </h1>

        <div className="flex items-center gap-2">
          <div className="text-[10px] font-black px-1.5 py-0.5 border border-white/20 uppercase tracking-widest">v2.0 PRO</div>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-0 p-1 px-1.5">
        {/* Client Data Section */}
        <div className="col-span-8 bg-[#faf9f4] border-2 border-gray-400 mb-0">
          <div className="py-0.5 px-2 bg-gradient-to-r from-[#d4d4cc] to-[#c8c8c0] border-b-2 border-gray-500">
            <h2 className="text-[12px] font-black text-[#0a1e3a] uppercase tracking-wider inline-block">DATOS DEL CLIENTE</h2>
            <span className="float-right text-[10px] text-[#0a1e3a]/60 font-bold tracking-widest uppercase mt-0.5">TECLA F3 PARA BUSCAR</span>
          </div>
          <div className="p-1 px-2 grid grid-cols-12 gap-x-2 gap-y-1 items-center">
            {/* Row 1: Code and Search */}
            <div className="col-span-2 text-right">
              <Label htmlFor="cliente-id" className="text-[11px] font-black text-gray-500 uppercase tracking-tight">CLIENTE ID:</Label>
            </div>
            <div className="col-span-4 flex gap-0.5 relative">
              <div className="relative flex-grow">
                <Search className="absolute left-1 top-1/2 transform -translate-y-1/2 w-3 h-3 text-gray-400" />
                <Input
                  id="cliente-id"
                  className="h-5 pl-5 text-[11px] font-medium border-gray-300 rounded-none bg-white focus:ring-0 focus:border-blue-500 uppercase text-[#0a1e3a]"
                  placeholder="CÓDIGO DEL CLIENTE..."
                  value={clienteCodigoInput}
                  onChange={(e) => setClienteCodigoInput(e.target.value.toUpperCase())}
                  onKeyDown={handleClienteCodigoKeyDown}
                />
              </div>
              <Button
                variant="default"
                size="sm"
                className="h-5 px-3 bg-[#0a1e3a] hover:bg-[#0a1e3a]/90 text-white rounded-none font-bold text-[10px] tracking-wider uppercase border border-[#0a1e3a]"
                onClick={handleBuscarClick}
              >
                <Search className="w-3 h-3 mr-1" />
                BUSCAR
              </Button>
            </div>

            <div className="col-span-1 text-right">
              <Label className="text-[11px] font-black text-gray-500 uppercase tracking-tight">RNC:</Label>
            </div>
            <div className="col-span-3">
              {puedeBuscarRnc ? (
                <div className="flex gap-0.5">
                  <Input
                    className={`h-5 text-[11px] font-medium rounded-none bg-white text-[#0a1e3a] uppercase ${rncMalo ? 'border-red-500 bg-red-50' : 'border-blue-300'}`}
                    placeholder="RNC O CÉDULA + ENTER"
                    title="Escribe el RNC o la cédula y pulsa Enter (o la lupa): se busca en la DGII y el cliente se crea solo. Para cambiarlo, corrígelo aquí y pulsa Enter; bórralo todo y Enter para volver al cliente genérico. Esc deshace."
                    {...rncCampo}
                  />
                  <Button type="button" variant="default" size="sm" disabled={buscandoRnc || !cambioRnc}
                    title="Buscar en la DGII"
                    className="h-5 w-6 p-0 bg-[#0a1e3a] hover:bg-[#0a1e3a]/90 text-white rounded-none"
                    onClick={buscarRnc}>
                    {buscandoRnc ? <Loader2 className="w-3 h-3 animate-spin" /> : <Search className="w-3 h-3" />}
                  </Button>
                </div>
              ) : (
                <Input
                  className="h-5 text-[11px] font-medium border-gray-300 rounded-none bg-gray-50 text-gray-700 uppercase"
                  value={cliente?.rnc ? formatoDocDgii(cliente.rnc) : '000000000'}
                  readOnly
                />
              )}
            </div>
            <div className="col-span-2"></div>

            {/* Row 2: Name */}
            <div className="col-span-2 text-right">
              <Label htmlFor="nombre" className="text-[11px] font-black text-gray-500 uppercase tracking-tight">NOMBRE:</Label>
            </div>
            <div className={setMoneda ? 'col-span-5' : 'col-span-8'}>
              <Input
                id="nombre"
                className={`h-5 text-[11px] font-medium border-gray-300 rounded-none bg-white focus:ring-0 text-[#0a1e3a] uppercase shadow-sm ${isGeneric ? 'border-yellow-400 bg-yellow-50' : ''}`}
                value={isGeneric ? manualClienteNombre : (cliente?.nombre || 'CLIENTE GENERICO')}
                onChange={(e) => isGeneric && setManualClienteNombre(e.target.value)}
                readOnly={!isGeneric}
                placeholder={isGeneric ? "ESCRIBA NOMBRE O VEHICULO DEL CLIENTE..." : ""}
              />
            </div>
            {setMoneda ? (
              <div className="col-span-5 flex items-center gap-1">
                <Label className="text-[11px] font-black text-gray-500 uppercase tracking-tight">MONEDA:</Label>
                <select
                  value={moneda}
                  onChange={(e) => setMoneda(e.target.value)}
                  className={`h-5 rounded-none border px-1 text-[11px] font-bold ${moneda === 'USD' ? 'border-emerald-500 bg-emerald-50 text-emerald-800' : 'border-gray-300 bg-white text-[#0a1e3a]'}`}
                >
                  <option value="DOP">RD$ PESOS</option>
                  <option value="USD">US$ DÓLARES</option>
                </select>
                {moneda === 'USD' && (
                  <>
                    <Label className="ml-1 text-[11px] font-black text-gray-500 uppercase tracking-tight">TASA:</Label>
                    <Input
                      className="h-5 w-20 rounded-none border-emerald-500 bg-white px-1 text-right text-[11px] font-bold"
                      inputMode="decimal"
                      placeholder="RD$ x US$"
                      value={tasaCambio}
                      onChange={(e) => setTasaCambio?.(e.target.value.replace(/[^0-9.]/g, ''))}
                    />
                  </>
                )}
              </div>
            ) : (
            <div className="col-span-2"></div>
            )}

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
        <div className="col-span-4 bg-[#faf9f4] border-2 border-gray-400">
          <div className="px-2 py-0.5 bg-gradient-to-r from-[#d4d4cc] to-[#c8c8c0] border-b-2 border-gray-500">
            <div className="flex items-center justify-between h-6">
              <h2 className="text-[11px] font-black text-[#0a1e3a] uppercase tracking-wide whitespace-nowrap">DETALLES FACTURA</h2>

              <div className="flex items-center gap-1">
                <span className="text-[10px] font-black text-gray-600 uppercase">FECHA:</span>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="h-5 text-[10px] font-bold border-gray-300 rounded-none bg-white hover:bg-blue-50 justify-start px-1.5 shadow-sm w-[95px]">
                      <CalendarIcon className="w-3 h-3 mr-1 text-[#0a1e3a]" />
                      {date ? format(date, 'dd/MM/yyyy') : '---'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={date} onSelect={setDate} initialFocus /></PopoverContent>
                </Popover>

                {isEditingNumero ? (
                  <div className="flex items-center gap-0.5">
                    <Input
                      autoFocus
                      className="h-5 w-16 text-[10px] font-black px-1 bg-red-50 border-red-200 text-red-600 uppercase"
                      placeholder="Nº..."
                      value={editNumero}
                      onChange={(e) => setEditNumero(e.target.value)}
                      onFocus={(e) => e.target.select()}
                      onKeyDown={(e) => e.key === 'Enter' && onSearchInvoice()}
                      title="Trae la última factura. Enter para abrirla, o escribe otro número (de cualquier día)."
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
                  <div className={`text-white text-[10px] px-2 py-0.5 font-black uppercase rounded shadow-sm min-w-[100px] text-center ${editingFacturaNumero ? 'bg-orange-600' : 'bg-red-600'}`}>
                    {loadingNumero ? <Loader2 className="w-3 h-3 animate-spin mx-auto" /> : `Nº ${editingFacturaNumero || nextFacturaNumero || '---'}`}
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="p-1 px-2 space-y-0.5">
            {/* Row 1: Comprobante */}
            <div className="grid grid-cols-4 gap-x-1.5 gap-y-1 items-center">
              <Label className="col-span-1 text-[10px] font-black text-gray-400 uppercase tracking-tight text-right">COMPROB:</Label>
              {ncfPreview?.electronico ? (
                <div className="col-span-3 h-5 text-[10px] font-bold border border-gray-300 bg-white flex items-center px-2 shadow-sm"
                  title={ncfPreview.motivo ? 'El cliente está marcado crédito fiscal, pero su RNC/cédula no es válido (9 u 11 dígitos, no todo ceros): corrígelo en la ficha del cliente y vuelve a escogerlo.' : undefined}>
                  {ncfPreview.nombre} <span className="ml-1 text-emerald-600">(ELECTRÓNICA)</span>
                  {ncfPreview.motivo && <span className="ml-1 text-red-600">· {ncfPreview.motivo}</span>}
                </div>
              ) : (
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
              )}

              <Label className="col-span-1 text-[12px] font-black text-gray-300 uppercase tracking-tight text-right">NCF:</Label>
              <div className={`col-span-3 border h-5 text-[12px] font-mono font-bold flex items-center px-2 rounded-none ${
                ncfPreview?.ncf
                  ? 'bg-yellow-50 border-yellow-400 text-yellow-700'
                  : ncfPreview?.aviso
                    ? 'bg-red-50 border-red-400 text-red-700'
                    : 'bg-slate-50 border-gray-200 text-slate-400'
              }`} title={ncfPreview?.quedan != null ? `Quedan ${ncfPreview.quedan} números en esta secuencia` : undefined}>
                {ncfPreview?.ncf || ncfPreview?.aviso || '—'}
                {ncfPreview?.quedan != null && ncfPreview.quedan <= 50 && (
                  <span className="ml-auto text-[9px] font-sans text-orange-600">quedan {ncfPreview.quedan}</span>
                )}
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
