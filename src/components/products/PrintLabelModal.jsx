import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Printer, MapPin } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { qzEnsureConnection, qzFindBestPrinter, qzPrintRawEpl } from "@/services/qzTrayService";
import { buildEplLabel } from "@/services/eplLabel";
import { webUsbPrintEpl, isWebUsbSupported } from "@/services/webUsbPrintService";
import { useAuth } from "@/contexts/SupabaseAuthContext";

const PREFERRED_PRINTERS = [
    "ZEBRA_LP2824_ETIQUETAS",
    "ZDesigner LP 2824 (Copiar 1)",
    "ZDesigner LP 2824",
    "LP 2824",
    "4BARCODE 4B-2074B",
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

const PrintLabelModal = ({ isOpen, onClose, product }) => {
    const { toast } = useToast();
    const { empresa } = useAuth();
    const empresaNombre = empresa?.nombre || 'Sistema';
    const [individualQty, setIndividualQty] = useState(1);
    const [priceType, setPriceType] = useState('alpha');
    const [showLocation, setShowLocation] = useState(true);
    const [isPrintingSingle, setIsPrintingSingle] = useState(false);
    const [labelPrintMethod, setLabelPrintMethod] = useState(() => localStorage.getItem('label_print_method') || 'qz');

    useEffect(() => {
        if (isOpen) {
            setIndividualQty(1);
        } else {
            // Red de seguridad: Radix Dialog a veces deja `pointer-events: none`
            // pegado en <body> cuando el modal se abre desde un ContextMenu.
            // Esto bloquea toda la UI hasta recargar.
            const t = setTimeout(() => {
                if (document.body.style.pointerEvents === 'none') {
                    document.body.style.pointerEvents = '';
                }
            }, 200);
            return () => clearTimeout(t);
        }
    }, [isOpen]);

    const handlePrintSingle = async () => {
        if (!product || isPrintingSingle) return;
        const qty = parseInt(individualQty) || 1;
        setIsPrintingSingle(true);
        toast({ title: 'Preparando impresión', description: labelPrintMethod === 'webusb' ? 'Conectando via WebUSB...' : 'Conectando con QZ Tray...' });
        try {
            const displayPrice = priceType === 'numeric'
                ? product.precio
                : encodeAlphaPrice(product.precio);
            const ubicacion = product.ubicacion || 'N/A';
            const epl = buildEplLabel({
                descripcion: product.descripcion,
                codigo: product.codigo,
                precio: displayPrice,
                ubicacion,
                includeUb: showLocation && ubicacion !== 'N/A',
                copies: qty,
                empresaNombre
            });

            if (labelPrintMethod === 'webusb') {
                await webUsbPrintEpl(epl);
            } else {
                await qzEnsureConnection();
                const printerName = await qzFindBestPrinter(PREFERRED_PRINTERS);
                await qzPrintRawEpl(printerName, epl);
            }

            toast({ title: 'Impresión completada', description: `Se imprimieron ${qty} etiquetas de ${product.codigo}.` });
            onClose();
        } catch (err) {
            console.error(`[${labelPrintMethod}] Error printing single:`, err);
            toast({ variant: 'destructive', title: 'Error de impresión', description: err?.message || 'No se pudo imprimir.' });
        } finally {
            setIsPrintingSingle(false);
        }
    };

    if (!product) return null;

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle className="text-morla-blue font-bold uppercase tracking-widest flex items-center gap-2">
                        <Printer className="w-5 h-5" /> Impresión de Etiquetas
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    <div className="space-y-2 bg-slate-50 border border-slate-200 rounded p-3">
                        <div>
                            <span className="text-[9px] font-bold text-slate-400 uppercase">Descripción</span>
                            <p className="text-xs font-bold text-slate-800 uppercase leading-tight">{product.descripcion}</p>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            <div>
                                <span className="text-[9px] font-bold text-slate-400 uppercase">Referencia</span>
                                <p className="text-xs font-medium text-slate-600">{product.referencia || 'N/A'}</p>
                            </div>
                            <div>
                                <span className="text-[9px] font-bold text-slate-400 uppercase">Precio</span>
                                <p className="text-xs font-black text-morla-blue">
                                    {priceType === 'numeric'
                                        ? `$${(product.precio || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`
                                        : encodeAlphaPrice(product.precio)}
                                </p>
                            </div>
                        </div>
                        <div>
                            <span className="text-[9px] font-bold text-slate-400 uppercase">Ubicación</span>
                            <p className="text-xs font-medium text-slate-600 flex items-center gap-1">
                                <MapPin className="h-3 w-3 text-slate-400" />
                                {product.ubicacion || 'N/A'}
                            </p>
                        </div>
                    </div>

                    <div className="space-y-4 border-t pt-4">
                        <div className="space-y-2">
                            <Label className="text-xs font-bold text-slate-600 uppercase">Formato de Precio</Label>
                            <RadioGroup value={priceType} onValueChange={setPriceType} className="flex gap-4">
                                <div className="flex items-center space-x-2">
                                    <RadioGroupItem value="numeric" id="numeric" className="w-4 h-4" />
                                    <Label htmlFor="numeric" className="text-xs cursor-pointer">Numérico</Label>
                                </div>
                                <div className="flex items-center space-x-2">
                                    <RadioGroupItem value="alpha" id="alpha" className="w-4 h-4" />
                                    <Label htmlFor="alpha" className="text-xs cursor-pointer font-bold italic">Alfabetico (Enc.)</Label>
                                </div>
                            </RadioGroup>
                        </div>

                        <div className="flex items-center justify-between pt-2">
                            <div className="flex items-center gap-2">
                                <MapPin className="h-4 w-4 text-slate-400" />
                                <Label htmlFor="show-location" className="text-xs cursor-pointer font-bold uppercase">Incluir Ubicación</Label>
                            </div>
                            <Switch
                                id="show-location"
                                checked={showLocation}
                                onCheckedChange={setShowLocation}
                            />
                        </div>

                        <div className="space-y-2">
                            <Label className="text-xs font-bold text-slate-600 uppercase">Método de Impresión</Label>
                            <Select value={labelPrintMethod} onValueChange={(v) => { setLabelPrintMethod(v); localStorage.setItem('label_print_method', v); }}>
                                <SelectTrigger className="h-9 text-xs font-bold border-slate-300">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="qz">QZ Tray (Nativo)</SelectItem>
                                    <SelectItem value="webusb" disabled={!isWebUsbSupported()}>WebUSB (Sin Instalar)</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="individual-qty" className="text-xs font-bold text-slate-600 uppercase">Cantidad a Imprimir</Label>
                            <Input
                                id="individual-qty"
                                type="number"
                                min="1"
                                value={individualQty}
                                onChange={(e) => setIndividualQty(parseInt(e.target.value) || 1)}
                                className="h-10 border-slate-300 font-black text-center text-lg bg-yellow-50"
                            />
                        </div>
                    </div>
                </div>

                <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={onClose} disabled={isPrintingSingle}>
                        Cancelar
                    </Button>
                    <Button
                        onClick={handlePrintSingle}
                        disabled={isPrintingSingle}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold tracking-wider uppercase"
                    >
                        {isPrintingSingle
                            ? <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Enviando...</>
                            : <><Printer className="mr-1.5 h-4 w-4" /> Imprimir</>}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
};

export default PrintLabelModal;
