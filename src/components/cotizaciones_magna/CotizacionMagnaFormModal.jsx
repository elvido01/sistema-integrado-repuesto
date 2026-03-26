import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Save, X, PlusCircle, Trash2 } from 'lucide-react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from '@/components/ui/dialog';

const ITBIS_PCT = 0.18;
const emptyLine = () => ({ id: crypto.randomUUID(), numero_orden: '', chasis: '', valor_repuestos: '', valor_mano_obra: '' });

const CotizacionMagnaFormModal = ({ isOpen, onClose, editingCotizacion }) => {
    const { toast } = useToast();
    const [saving, setSaving] = useState(false);
    const [loading, setLoading] = useState(false);

    const [lines, setLines] = useState([emptyLine()]);
    const [notas, setNotas] = useState('');

    // Load existing detail lines when editing
    useEffect(() => {
        if (!isOpen) return;
        if (editingCotizacion) {
            setNotas(editingCotizacion.notas || '');
            setLoading(true);
            supabase
                .from('cotizaciones_magna_detalle')
                .select('*')
                .eq('cotizacion_id', editingCotizacion.id)
                .order('created_at', { ascending: true })
                .then(({ data, error }) => {
                    if (error) {
                        console.error('Error loading detail lines:', error);
                        setLines([emptyLine()]);
                    } else if (data && data.length > 0) {
                        setLines(data.map(d => ({
                            id: d.id,
                            numero_orden: d.numero_orden || '',
                            chasis: d.chasis || '',
                            valor_repuestos: d.valor_repuestos?.toString() || '0',
                            valor_mano_obra: d.valor_mano_obra?.toString() || '0',
                        })));
                    } else {
                        setLines([emptyLine()]);
                    }
                    setLoading(false);
                });
        } else {
            setLines([emptyLine()]);
            setNotas('');
        }
    }, [isOpen, editingCotizacion]);

    const handleLineChange = (idx, field, value) => {
        setLines(prev => prev.map((l, i) => i === idx ? { ...l, [field]: value } : l));
    };

    const addLine = () => setLines(prev => [...prev, emptyLine()]);

    const removeLine = (idx) => {
        if (lines.length <= 1) return;
        setLines(prev => prev.filter((_, i) => i !== idx));
    };

    // Calculated totals across all lines
    const linesCalc = lines.map(l => ({
        repuestos: parseFloat(l.valor_repuestos) || 0,
        manoObra: parseFloat(l.valor_mano_obra) || 0,
    }));
    const totalRepuestos = linesCalc.reduce((s, l) => s + l.repuestos, 0);
    const totalManoObra = linesCalc.reduce((s, l) => s + l.manoObra, 0);
    const subtotal = totalRepuestos + totalManoObra;
    const itbis = subtotal * ITBIS_PCT;
    const total = subtotal + itbis;

    const formatCurrency = (val) =>
        new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP', minimumFractionDigits: 2 }).format(val);

    const handleSave = async () => {
        // Validate at least one line has numero_orden
        const hasValid = lines.some(l => l.numero_orden.trim());
        if (!hasValid) {
            toast({ variant: 'destructive', title: 'Error', description: 'Al menos una línea debe tener número de orden.' });
            return;
        }

        setSaving(true);
        try {
            const headerPayload = {
                subtotal,
                itbis,
                total,
                notas: notas.trim() || null,
                updated_at: new Date().toISOString(),
            };

            let cotizacionId;

            if (editingCotizacion) {
                cotizacionId = editingCotizacion.id;
                const { error } = await supabase
                    .from('cotizaciones_magna')
                    .update(headerPayload)
                    .eq('id', cotizacionId);
                if (error) throw error;

                // Delete old detail lines and re-insert
                const { error: delErr } = await supabase
                    .from('cotizaciones_magna_detalle')
                    .delete()
                    .eq('cotizacion_id', cotizacionId);
                if (delErr) throw delErr;
            } else {
                const { data: { user } } = await supabase.auth.getUser();
                headerPayload.usuario_id = user?.id || null;

                const { data: inserted, error } = await supabase
                    .from('cotizaciones_magna')
                    .insert(headerPayload)
                    .select('id')
                    .single();
                if (error) throw error;
                cotizacionId = inserted.id;
            }

            // Insert detail lines
            const detailRows = lines
                .filter(l => l.numero_orden.trim() || l.chasis.trim() || (parseFloat(l.valor_repuestos) || 0) > 0 || (parseFloat(l.valor_mano_obra) || 0) > 0)
                .map(l => ({
                    cotizacion_id: cotizacionId,
                    numero_orden: l.numero_orden.trim(),
                    chasis: l.chasis.trim(),
                    valor_repuestos: parseFloat(l.valor_repuestos) || 0,
                    valor_mano_obra: parseFloat(l.valor_mano_obra) || 0,
                }));

            if (detailRows.length > 0) {
                const { error: detErr } = await supabase
                    .from('cotizaciones_magna_detalle')
                    .insert(detailRows);
                if (detErr) throw detErr;
            }

            toast({
                title: editingCotizacion ? 'Actualizada' : 'Creada',
                description: `Cotización Magna ${editingCotizacion ? 'actualizada' : 'creada'} con ${detailRows.length} línea(s).`,
            });
            onClose(true);
        } catch (err) {
            console.error('Error saving cotización magna:', err);
            toast({ variant: 'destructive', title: 'Error', description: err.message || 'No se pudo guardar.' });
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(false); }}>
            <DialogContent className="sm:max-w-[750px] max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="text-lg font-bold text-morla-blue">
                        {editingCotizacion ? 'Modificar Cotización Magna' : 'Nueva Cotización Magna'}
                    </DialogTitle>
                </DialogHeader>

                {loading ? (
                    <div className="flex justify-center py-10">
                        <Loader2 className="h-8 w-8 animate-spin text-morla-blue" />
                    </div>
                ) : (
                    <div className="space-y-4 py-2">
                        {/* Lines table */}
                        <div>
                            <div className="flex items-center justify-between mb-2">
                                <Label className="text-sm font-bold">Líneas de Cotización</Label>
                                <Button type="button" size="sm" variant="outline" onClick={addLine} className="h-7 text-xs gap-1">
                                    <PlusCircle className="w-3.5 h-3.5" /> Agregar Línea
                                </Button>
                            </div>

                            <div className="border rounded-lg overflow-hidden">
                                {/* Header */}
                                <div className="grid grid-cols-[1fr_1fr_120px_120px_36px] bg-gray-100 text-xs font-bold text-gray-600 uppercase">
                                    <div className="px-3 py-2 border-r">No. Orden</div>
                                    <div className="px-3 py-2 border-r">Chasis</div>
                                    <div className="px-3 py-2 border-r text-right">Repuestos</div>
                                    <div className="px-3 py-2 border-r text-right">Mano Obra</div>
                                    <div className="px-3 py-2"></div>
                                </div>

                                {/* Rows */}
                                {lines.map((line, idx) => (
                                    <div key={line.id} className="grid grid-cols-[1fr_1fr_120px_120px_36px] border-t">
                                        <div className="px-1 py-1 border-r">
                                            <Input
                                                value={line.numero_orden}
                                                onChange={e => handleLineChange(idx, 'numero_orden', e.target.value)}
                                                placeholder="ORD-001"
                                                className="h-8 text-sm border-0 shadow-none focus-visible:ring-0"
                                            />
                                        </div>
                                        <div className="px-1 py-1 border-r">
                                            <Input
                                                value={line.chasis}
                                                onChange={e => handleLineChange(idx, 'chasis', e.target.value)}
                                                placeholder="Chasis"
                                                className="h-8 text-sm border-0 shadow-none focus-visible:ring-0"
                                            />
                                        </div>
                                        <div className="px-1 py-1 border-r">
                                            <Input
                                                type="number"
                                                min="0"
                                                step="0.01"
                                                value={line.valor_repuestos}
                                                onChange={e => handleLineChange(idx, 'valor_repuestos', e.target.value)}
                                                className="h-8 text-sm text-right border-0 shadow-none focus-visible:ring-0"
                                            />
                                        </div>
                                        <div className="px-1 py-1 border-r">
                                            <Input
                                                type="number"
                                                min="0"
                                                step="0.01"
                                                value={line.valor_mano_obra}
                                                onChange={e => handleLineChange(idx, 'valor_mano_obra', e.target.value)}
                                                className="h-8 text-sm text-right border-0 shadow-none focus-visible:ring-0"
                                            />
                                        </div>
                                        <div className="flex items-center justify-center py-1">
                                            <button
                                                type="button"
                                                onClick={() => removeLine(idx)}
                                                disabled={lines.length <= 1}
                                                className="text-red-400 hover:text-red-600 disabled:opacity-30 disabled:cursor-not-allowed"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Totals */}
                        <div className="bg-gray-50 border rounded-lg p-4 space-y-2">
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-600">Total Repuestos:</span>
                                <span className="font-semibold">{formatCurrency(totalRepuestos)}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-600">Total Mano de Obra:</span>
                                <span className="font-semibold">{formatCurrency(totalManoObra)}</span>
                            </div>
                            <div className="flex justify-between text-sm border-t pt-2">
                                <span className="text-gray-600">Subtotal:</span>
                                <span className="font-semibold">{formatCurrency(subtotal)}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-600">ITBIS (18%):</span>
                                <span className="font-semibold">{formatCurrency(itbis)}</span>
                            </div>
                            <div className="flex justify-between text-base border-t pt-2 mt-2">
                                <span className="font-bold text-morla-blue">TOTAL:</span>
                                <span className="font-bold text-morla-blue text-lg">{formatCurrency(total)}</span>
                            </div>
                        </div>

                        {/* Notas */}
                        <div>
                            <Label htmlFor="notas" className="text-sm font-semibold">Notas</Label>
                            <textarea
                                id="notas"
                                value={notas}
                                onChange={(e) => setNotas(e.target.value)}
                                placeholder="Observaciones adicionales..."
                                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                rows={2}
                            />
                        </div>
                    </div>
                )}

                <DialogFooter>
                    <Button variant="outline" onClick={() => onClose(false)} disabled={saving}>
                        <X className="w-4 h-4 mr-1" /> Cancelar
                    </Button>
                    <Button onClick={handleSave} disabled={saving || loading} className="bg-green-600 hover:bg-green-700">
                        {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
                        {editingCotizacion ? 'Actualizar' : 'Guardar'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

export default CotizacionMagnaFormModal;
