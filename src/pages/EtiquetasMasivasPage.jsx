import React, { useState, useCallback, useRef } from 'react';
import { Helmet } from 'react-helmet';
import { Search, Printer, Barcode, AlertCircle, Loader2, ChevronRight, Check, X, MapPin } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';

// Services
import { qzEnsureConnection, qzFindBestPrinter, qzPrintRawEpl } from "@/services/qzTrayService";
import { buildEplLabel } from "@/services/eplLabel";

const PREFERRED_PRINTERS = [
    "ZDesigner LP 2824 (Copiar 1)",
    "ZDesigner LP 2824",
    "LP 2824"
];

const MURCIELAGO_KEY = {
    '1': 'M', '2': 'U', '3': 'R', '4': 'C', '5': 'I',
    '6': 'E', '7': 'L', '8': 'A', '9': 'G', '0': 'O'
};

const encodeAlphaPrice = (price) => {
    const formattedPrice = parseFloat(price || 0).toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
    return formattedPrice.split('').map(char => MURCIELAGO_KEY[char] || char).join('');
};

const EtiquetasMasivasPage = ({ extraData }) => {
    const { toast } = useToast();
    const [purchaseNumber, setPurchaseNumber] = useState('');
    const [loading, setLoading] = useState(false);
    const [isPrinting, setIsPrinting] = useState(false);
    const [items, setItems] = useState([]);
    const [priceType, setPriceType] = useState('alpha'); // 'alpha' or 'numeric'
    const [showLocation, setShowLocation] = useState(true);

    // NO LONGER USING REFS OR CURRENT PRINT ITEM FOR VISUAL CAPTURE

    const fetchPurchaseItems = useCallback(async (arg = null) => {
        const forcedNumber = (typeof arg === 'string' || typeof arg === 'number') ? arg : null;
        let targetNumber = forcedNumber || purchaseNumber;

        if (!targetNumber || typeof targetNumber === 'object') return;

        targetNumber = String(targetNumber).trim();
        if (!targetNumber) return;

        setLoading(true);
        setItems([]);
        try {
            const { data: purchase, error: pError } = await supabase
                .from('compras')
                .select('id')
                .ilike('numero', targetNumber)
                .maybeSingle();

            if (pError) throw pError;

            if (purchase) {
                const { data: details, error: dError } = await supabase
                    .from('compras_detalle')
                    .select('codigo, descripcion, cantidad, producto_id')
                    .eq('compra_id', purchase.id);

                if (dError) throw dError;

                const productIds = [...new Set(details.map(d => d.producto_id).filter(Boolean))];
                let productsMap = {};

                if (productIds.length > 0) {
                    const { data: productsData, error: productsError } = await supabase
                        .from('productos')
                        .select('id, precio, ubicacion')
                        .in('id', productIds);

                    if (!productsError && productsData) {
                        productsMap = productsData.reduce((acc, p) => ({ ...acc, [p.id]: p }), {});
                    }
                }

                const processedItems = details.map(d => {
                    const productInfo = productsMap[d.producto_id] || {};
                    return {
                        codigo: d.codigo,
                        descripcion: d.descripcion,
                        cantidadCompra: d.cantidad,
                        cantidadTickets: d.cantidad,
                        precio: productInfo.precio || 0,
                        ubicacion: productInfo.ubicacion || 'N/A',
                        selected: true,
                        printLocation: true
                    };
                });

                setItems(processedItems);
                toast({
                    title: 'Éxito',
                    description: `Se cargaron ${processedItems.length} artículos de la compra.`
                });
                return;
            }

            const { data: order, error: oError } = await supabase
                .from('ordenes_compra')
                .select('id')
                .ilike('numero', targetNumber)
                .maybeSingle();

            if (oError) throw oError;

            if (order) {
                const { data: oDetails, error: odError } = await supabase
                    .from('ordenes_compra_detalle')
                    .select('codigo, descripcion, cantidad, producto_id')
                    .eq('orden_compra_id', order.id);

                if (odError) throw odError;

                const productIds = [...new Set(oDetails.map(d => d.producto_id).filter(Boolean))];
                let productsMap = {};

                if (productIds.length > 0) {
                    const { data: productsData, error: productsError } = await supabase
                        .from('productos')
                        .select('id, precio, ubicacion')
                        .in('id', productIds);

                    if (!productsError && productsData) {
                        productsMap = productsData.reduce((acc, p) => ({ ...acc, [p.id]: p }), {});
                    }
                }

                const processedItems = oDetails.map(d => {
                    const productInfo = productsMap[d.producto_id] || {};
                    return {
                        codigo: d.codigo,
                        descripcion: d.descripcion,
                        cantidadCompra: d.cantidad,
                        cantidadTickets: d.cantidad,
                        precio: productInfo.precio || 0,
                        ubicacion: productInfo.ubicacion || 'N/A',
                        selected: true,
                        printLocation: true
                    };
                });

                setItems(processedItems);
                toast({
                    title: 'Éxito',
                    description: `Se cargaron ${processedItems.length} artículos de la Orden de Compra.`
                });
                return;
            }

            toast({
                variant: 'destructive',
                title: 'No encontrada',
                description: `No se encontró el documento con el número ${targetNumber}.`
            });
        } catch (error) {
            console.error('Error fetching document items:', error);
            toast({
                variant: 'destructive',
                title: 'Error de Carga',
                description: error.message || 'Ocurrió un error.'
            });
        } finally {
            setLoading(false);
        }
    }, [purchaseNumber, toast]);

    React.useEffect(() => {
        if (extraData?.docNumber) {
            setPurchaseNumber(extraData.docNumber);
            fetchPurchaseItems(extraData.docNumber);
        }
    }, [extraData, fetchPurchaseItems]);

    const handleQtyChange = (index, value) => {
        const newItems = [...items];
        newItems[index].cantidadTickets = parseInt(value) || 0;
        setItems(newItems);
    };

    const toggleSelection = (index) => {
        const newItems = [...items];
        newItems[index].selected = !newItems[index].selected;
        setItems(newItems);
    };

    const toggleItemLocation = (index) => {
        const newItems = [...items];
        newItems[index].printLocation = !newItems[index].printLocation;
        setItems(newItems);
    };

    const handleMasterLocationToggle = (checked) => {
        setShowLocation(checked);
        setItems(prev => prev.map(item => ({ ...item, printLocation: checked })));
    };

    const handlePrint = async () => {
        if (isPrinting) return;

        // Diagnóstico de items
        if (import.meta.env.DEV) {
            console.log("[QZ] handlePrint iniciado. itemsCount total:", items?.length || 0);
        }

        if (!Array.isArray(items) || items.length === 0) {
            toast({
                variant: 'destructive',
                title: 'No hay artículos',
                description: 'Cargue un documento (Orden/Pedido) antes de intentar imprimir.'
            });
            return;
        }

        const safeQty = (v) => {
            const n = Number(v ?? 1);
            return Number.isFinite(n) && n > 0 ? Math.floor(n) : 1;
        };
        const safeStr = (v, fallback = "") => (v ?? fallback).toString();

        const selectedItems = items.filter(item => item.selected && safeQty(item.cantidadTickets) > 0);

        if (selectedItems.length === 0) {
            toast({
                variant: 'destructive',
                title: 'Sin selección',
                description: 'Seleccione al menos un artículo con cantidad mayor a 0 para imprimir.'
            });
            return;
        }

        setIsPrinting(true);
        if (import.meta.env.DEV) {
            console.log("[QZ] Items seleccionados para imprimir:", selectedItems.length);
        }
        toast({ title: "Preparando impresión", description: "Conectando con QZ Tray..." });

        try {
            await qzEnsureConnection();
            console.log("[QZ] QZ conectado");

            const printerName = await qzFindBestPrinter(PREFERRED_PRINTERS);
            console.log("[QZ] Printer seleccionado:", printerName);

            let printedCount = 0;
            let skippedCount = 0;

            for (const item of selectedItems) {
                const descripcion = safeStr(item.descripcion);
                const codigo = safeStr(item.codigo);
                const qty = safeQty(item.cantidadTickets);
                const ubicacion = safeStr(item.ubicacion);

                // Validación mínima para no romper
                if (!codigo || codigo.trim().length < 3) {
                    console.warn("[QZ] Item saltado (datos incompletos):", descripcion);
                    skippedCount++;
                    continue;
                }

                const displayPrice = priceType === 'numeric'
                    ? item.precio
                    : encodeAlphaPrice(item.precio);

                const epl = buildEplLabel({
                    descripcion,
                    codigo,
                    precio: displayPrice,
                    ubicacion,
                    includeUb: showLocation && item.printLocation && ubicacion !== 'N/A',
                    copies: qty
                });

                console.log(`[QZ] Enviando EPL (${qty} copias) para ${codigo}`);
                await qzPrintRawEpl(printerName, epl);
                printedCount++;
            }

            if (skippedCount > 0) {
                toast({
                    variant: "warning",
                    title: "Impresión finalizada",
                    description: `Completado: ${printedCount}. Saltados por datos incompletos: ${skippedCount}.`
                });
            } else {
                toast({
                    title: "Impresión completada",
                    description: `Se enviaron ${printedCount} formatos de etiquetas correctamente.`
                });
            }

        } catch (err) {
            console.error("[QZ] Fallo crítico en batch:", err);
            toast({
                variant: 'destructive',
                title: 'Error de impresión',
                description: err?.message || "No se pudo completar la impresión masiva."
            });
        } finally {
            setIsPrinting(false);
        }
    };

    return (
        <div className="bg-gray-100 min-h-screen pb-8">
            <Helmet>
                <title>Impresión Masiva de Etiquetas - MORLA</title>
            </Helmet>

            <div className="bg-morla-blue shadow-md mb-6 border-b-2 border-morla-blue/20">
                <div className="container mx-auto px-4 h-14 flex items-center gap-4">
                    <Barcode className="text-white h-6 w-6" />
                    <h1 className="text-white font-black tracking-widest uppercase text-xl italic flex-1">
                        Imp. Etiquetas Masivas (ZPL DIRECTO)
                    </h1>
                </div>
            </div>

            {/* NO LONGER NEEDED HIDDEN CONTAINER FOR VISUAL CAPTURE */}

            <div className="container mx-auto px-4 space-y-6">
                <div className="grid grid-cols-12 gap-6">
                    <div className="col-span-12 lg:col-span-4 bg-white shadow-lg border-2 border-slate-300 rounded p-6 relative">
                        <span className="absolute -top-3 left-3 bg-white px-2 text-[10px] font-black text-slate-500 uppercase">Búsqueda por Compra</span>

                        <div className="space-y-4 pt-2">
                            <div className="space-y-2">
                                <Label htmlFor="purchase-number" className="text-[10px] font-bold text-slate-600 uppercase">Número de Compra</Label>
                                <div className="flex gap-2">
                                    <Input
                                        id="purchase-number"
                                        placeholder="Ej: COMP-0001"
                                        value={purchaseNumber}
                                        onChange={(e) => setPurchaseNumber(e.target.value)}
                                        onKeyDown={(e) => e.key === 'Enter' && fetchPurchaseItems()}
                                        className="h-9 border-slate-300 font-bold"
                                    />
                                    <Button
                                        onClick={() => fetchPurchaseItems()}
                                        disabled={loading || !purchaseNumber}
                                        className="bg-morla-blue hover:bg-morla-blue/90 h-9"
                                    >
                                        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronRight className="h-5 w-5" />}
                                    </Button>
                                </div>
                            </div>

                            <div className="pt-4 border-t border-dashed border-slate-300 space-y-4">
                                <div className="flex flex-col gap-3">
                                    <Label className="text-[10px] font-bold uppercase text-slate-500">Configuración EPL2 RAW</Label>

                                    <div className="space-y-2">
                                        <Label className="text-xs font-bold text-slate-600">Formato de Precio</Label>
                                        <RadioGroup value={priceType} onValueChange={setPriceType} className="flex gap-4">
                                            <div className="flex items-center space-x-2">
                                                <RadioGroupItem value="numeric" id="numeric" className="w-4 h-4" />
                                                <Label htmlFor="numeric" className="text-xs cursor-pointer">Numérico</Label>
                                            </div>
                                            <div className="flex items-center space-x-2">
                                                <RadioGroupItem value="alpha" id="alpha" className="w-4 h-4" />
                                                <Label htmlFor="alpha" className="text-xs cursor-pointer italic font-semibold">Alfabetico (Enc.)</Label>
                                            </div>
                                        </RadioGroup>
                                    </div>

                                    <div className="flex items-center justify-between pt-2">
                                        <div className="flex items-center gap-2">
                                            <MapPin className="h-4 w-4 text-slate-400" />
                                            <Label htmlFor="show-location" className="text-xs cursor-pointer">Incluir Ubicación (Todos)</Label>
                                        </div>
                                        <Switch
                                            id="show-location"
                                            checked={showLocation}
                                            onCheckedChange={handleMasterLocationToggle}
                                        />
                                    </div>
                                </div>
                            </div>

                            <Button
                                onClick={handlePrint}
                                disabled={items.length === 0 || isPrinting}
                                className="w-full mt-4 h-11 bg-green-600 hover:bg-green-700 text-white font-bold tracking-widest shadow-md uppercase text-xs"
                            >
                                {isPrinting ? (
                                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> ENVIANDO...</>
                                ) : (
                                    <><Printer className="mr-2 h-4 w-4" /> IMPRIMIR ETIQUETAS</>
                                )}
                            </Button>
                        </div>
                    </div>
                </div>

                <div className="col-span-12 lg:col-span-8 bg-white shadow-lg rounded border-2 border-slate-300 overflow-hidden flex flex-col min-h-[500px]">
                    <div className="flex flex-row items-center justify-between border-b bg-slate-50 p-4">
                        <div>
                            <h3 className="text-morla-blue font-bold text-base uppercase tracking-tight">Artículos Cargados</h3>
                            <p className="text-[10px] text-slate-500 font-medium">Ajuste las cantidades de tickets a imprimir.</p>
                        </div>
                        {items.length > 0 && (
                            <div className="bg-morla-blue/10 px-3 py-1 rounded-full border border-morla-blue/20">
                                <span className="text-[10px] font-black text-morla-blue uppercase">{items.length} ITÉMS</span>
                            </div>
                        )}
                    </div>

                    <div className="flex-grow overflow-auto">
                        {items.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center text-slate-300 gap-4 py-20">
                                <Barcode className="h-16 w-16 opacity-10" />
                                <p className="text-xs font-bold uppercase tracking-widest italic">No se han cargado artículos de compra</p>
                            </div>
                        ) : (
                            <Table>
                                <TableHeader className="sticky top-0 bg-slate-100 z-10 shadow-sm border-b border-slate-300">
                                    <TableRow className="h-10">
                                        <TableHead className="w-12 text-center text-[10px] font-black uppercase text-slate-700">OK</TableHead>
                                        <TableHead className="text-[10px] font-black uppercase text-slate-700">Código</TableHead>
                                        <TableHead className="text-[10px] font-black uppercase text-slate-700">Descripción</TableHead>
                                        <TableHead className="text-center text-[10px] font-black uppercase text-slate-700">Compra</TableHead>
                                        <TableHead className="w-24 text-center text-[10px] font-black uppercase text-slate-700">Tickets</TableHead>
                                        <TableHead className="text-right text-[10px] font-black uppercase text-slate-700">Precio</TableHead>
                                        <TableHead className="text-[10px] font-black uppercase text-slate-700">Ubicación</TableHead>
                                        <TableHead className="text-center text-[10px] font-black uppercase text-slate-700 w-12">Loc.</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {items.map((item, index) => (
                                        <TableRow key={index} className={`h-11 hover:bg-slate-50 transition-colors border-b border-slate-100 ${!item.selected ? 'opacity-40' : ''}`}>
                                            <TableCell className="text-center p-0">
                                                <button
                                                    onClick={() => toggleSelection(index)}
                                                    className={`p-1.5 rounded-md transition-all ${item.selected ? 'text-green-600 bg-green-50 shadow-sm scale-110' : 'text-slate-300'}`}
                                                >
                                                    {item.selected ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
                                                </button>
                                            </TableCell>
                                            <TableCell className="font-mono text-[10px] font-bold text-slate-600">{item.codigo}</TableCell>
                                            <TableCell className="max-w-[180px] truncate text-[10px] font-bold uppercase text-slate-800" title={item.descripcion}>
                                                {item.descripcion}
                                            </TableCell>
                                            <TableCell className="text-center font-black text-slate-500 text-xs">{item.cantidadCompra}</TableCell>
                                            <TableCell className="p-1">
                                                <Input
                                                    type="number"
                                                    min="0"
                                                    className="h-8 text-center font-black border-slate-300 focus:border-morla-blue text-xs bg-yellow-50"
                                                    value={item.cantidadTickets}
                                                    onChange={(e) => handleQtyChange(index, e.target.value)}
                                                    disabled={!item.selected}
                                                />
                                            </TableCell>
                                            <TableCell className="text-right font-bold text-morla-blue text-xs whitespace-nowrap">
                                                {priceType === 'numeric'
                                                    ? `$${item.precio.toLocaleString('en-US', { minimumFractionDigits: 2 })}`
                                                    : encodeAlphaPrice(item.precio)}
                                            </TableCell>
                                            <TableCell className="text-[9px]">
                                                <div className="flex items-center gap-1.5 text-slate-500 font-bold uppercase">
                                                    <MapPin className="h-3 w-3 text-slate-400" />
                                                    {item.ubicacion}
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-center p-1">
                                                <Switch
                                                    checked={item.printLocation}
                                                    onCheckedChange={() => toggleItemLocation(index)}
                                                    disabled={!item.selected}
                                                    className="scale-75"
                                                />
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        )}
                    </div>
                </div>
            </div>

            <div className="bg-orange-50/80 border-2 border-orange-200 rounded p-4 flex items-center gap-4 text-orange-800 shadow-sm mt-6">
                <div className="bg-orange-200 p-2 rounded-full shadow-inner">
                    <AlertCircle className="h-6 w-6 text-orange-600" />
                </div>
                <p className="text-xs font-bold uppercase tracking-tight leading-relaxed">
                    Módulo configurado para **ZDesigner LP 2824** (COMANDOS ZPL).
                    Impresión instantánea y de alta calidad sin capturas de pantalla.
                </p>
            </div>
        </div>
    );
};

export default EtiquetasMasivasPage;
