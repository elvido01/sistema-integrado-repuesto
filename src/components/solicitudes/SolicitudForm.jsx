import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Save, Loader2, Search, UserSearch, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import SearchableSelect from '@/components/common/SearchableSelect';
import ProductSearchModal from '@/components/ventas/ProductSearchModal';
import { supabase } from '@/lib/customSupabaseClient';

const emptyLine = () => ({
    _key: Date.now() + Math.random(),
    producto_id: null,
    producto_display: '',
    producto_texto: '',
    es_texto_libre: false,
    cantidad_solicitada: 1,
});

const SolicitudForm = ({ isOpen, onClose, onSave, userId }) => {
    const [buscarCliente, setBuscarCliente] = useState(false);
    const [saving, setSaving] = useState(false);
    const [isProductSearchOpen, setIsProductSearchOpen] = useState(false);
    const [activeLineIdx, setActiveLineIdx] = useState(null);

    const [clientes, setClientes] = useState([]);

    const [clienteData, setClienteData] = useState({
        cliente_id: null,
        cliente_nombre: '',
        cliente_telefono: '',
    });

    const [lines, setLines] = useState([emptyLine()]);
    const [notas, setNotas] = useState('');

    // Fetch clients only when toggled
    useEffect(() => {
        if (!isOpen || !buscarCliente) return;
        const fetchClientes = async () => {
            const { data } = await supabase
                .from('clientes')
                .select('id, nombre, telefono')
                .eq('activo', true)
                .order('nombre');
            setClientes(data || []);
        };
        fetchClientes();
    }, [isOpen, buscarCliente]);

    const clienteOptions = useMemo(
        () => clientes.map((c) => ({ value: c.id, label: c.nombre })),
        [clientes]
    );

    const resetForm = useCallback(() => {
        setClienteData({ cliente_id: null, cliente_nombre: '', cliente_telefono: '' });
        setLines([emptyLine()]);
        setNotas('');
        setBuscarCliente(false);
        setActiveLineIdx(null);
    }, []);

    useEffect(() => {
        if (isOpen) resetForm();
    }, [isOpen, resetForm]);

    // Product search callback
    const handleProductSelect = (product) => {
        if (activeLineIdx === null) return;
        setLines((prev) =>
            prev.map((line, i) =>
                i === activeLineIdx
                    ? { ...line, producto_id: product.id, producto_display: `${product.codigo} — ${product.descripcion}` }
                    : line
            )
        );
        setIsProductSearchOpen(false);
        setActiveLineIdx(null);
    };

    const openProductSearch = (idx) => {
        setActiveLineIdx(idx);
        setIsProductSearchOpen(true);
    };

    const addLine = () => setLines((prev) => [...prev, emptyLine()]);

    const removeLine = (idx) => {
        if (lines.length <= 1) return;
        setLines((prev) => prev.filter((_, i) => i !== idx));
    };

    const updateLine = (idx, field, value) => {
        setLines((prev) =>
            prev.map((line, i) => (i === idx ? { ...line, [field]: value } : line))
        );
    };

    const handleSubmit = async () => {
        // Validate client
        const hasCliente = buscarCliente
            ? clienteData.cliente_id
            : clienteData.cliente_nombre.trim();
        if (!hasCliente) return;

        // Validate at least one product
        const validLines = lines.filter((l) =>
            l.es_texto_libre ? l.producto_texto.trim() : l.producto_id
        );
        if (validLines.length === 0) return;

        setSaving(true);
        try {
            // Save one row per product line (same client)
            for (const line of validLines) {
                const payload = {
                    creado_por: userId,
                    cantidad_solicitada: parseFloat(line.cantidad_solicitada) || 1,
                    notas: notas || null,
                };

                if (buscarCliente) {
                    payload.cliente_id = clienteData.cliente_id;
                } else {
                    payload.cliente_nombre = clienteData.cliente_nombre.trim();
                    payload.cliente_telefono = clienteData.cliente_telefono.trim() || null;
                }

                if (line.es_texto_libre) {
                    payload.producto_texto = line.producto_texto.trim();
                } else {
                    payload.producto_id = line.producto_id;
                }

                await onSave(payload);
            }
            onClose();
        } catch {
            // toast handled by onSave
        } finally {
            setSaving(false);
        }
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    <motion.div
                        key="sol-backdrop"
                        className="fixed inset-0 z-40 bg-black/50"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                    />
                    <motion.div
                        key="sol-panel"
                        className="fixed inset-0 z-50 flex items-center justify-center p-4"
                        initial={{ opacity: 0, scale: 0.97, y: 10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.97, y: 10 }}
                    >
                        <div className="relative bg-white rounded-lg border-2 border-morla-gold shadow-2xl w-full max-w-2xl mx-4 flex flex-col" onClick={(e) => e.stopPropagation()}>
                            {/* Header */}
                            <div className="bg-morla-blue text-white px-4 py-2.5 flex items-center justify-between rounded-t-lg">
                                <h2 className="text-sm font-bold uppercase tracking-wider">Nueva Solicitud</h2>
                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-white hover:bg-white/20" onClick={onClose}>
                                    <X className="w-4 h-4" />
                                </Button>
                            </div>

                            {/* Body */}
                            <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
                                {/* ── CLIENTE ── */}
                                <fieldset className="border border-gray-200 rounded-md p-3 space-y-2">
                                    <legend className="text-[11px] font-bold text-gray-500 uppercase px-1">Cliente</legend>

                                    <div className="flex items-center gap-2">
                                        <Checkbox id="chk-buscar-cli" checked={buscarCliente} onCheckedChange={(v) => setBuscarCliente(!!v)} />
                                        <Label htmlFor="chk-buscar-cli" className="text-xs cursor-pointer flex items-center gap-1">
                                            <UserSearch className="w-3 h-3" /> Buscar cliente registrado
                                        </Label>
                                    </div>

                                    {buscarCliente ? (
                                        <SearchableSelect
                                            placeholder="Seleccionar cliente..."
                                            options={clienteOptions}
                                            value={clienteData.cliente_id || ''}
                                            onChange={(v) => setClienteData((f) => ({ ...f, cliente_id: v }))}
                                        />
                                    ) : (
                                        <div className="grid grid-cols-2 gap-3">
                                            <div>
                                                <Label className="text-[11px] font-bold text-gray-600 uppercase">Nombre</Label>
                                                <Input
                                                    value={clienteData.cliente_nombre}
                                                    onChange={(e) => setClienteData((f) => ({ ...f, cliente_nombre: e.target.value }))}
                                                    className="h-8 text-xs"
                                                    placeholder="Nombre del cliente"
                                                    autoFocus
                                                />
                                            </div>
                                            <div>
                                                <Label className="text-[11px] font-bold text-gray-600 uppercase">Teléfono</Label>
                                                <Input
                                                    value={clienteData.cliente_telefono}
                                                    onChange={(e) => setClienteData((f) => ({ ...f, cliente_telefono: e.target.value }))}
                                                    className="h-8 text-xs"
                                                    placeholder="809-000-0000"
                                                />
                                            </div>
                                        </div>
                                    )}
                                </fieldset>

                                {/* ── PRODUCTOS (multi-line) ── */}
                                <fieldset className="border border-gray-200 rounded-md p-3 space-y-2">
                                    <legend className="text-[11px] font-bold text-gray-500 uppercase px-1">Productos Solicitados</legend>

                                    <div className="space-y-2">
                                        {lines.map((line, idx) => (
                                            <div key={line._key} className="flex items-center gap-2 bg-gray-50/60 rounded p-2 border border-gray-100">
                                                {/* Qty */}
                                                <Input
                                                    type="number"
                                                    min="1"
                                                    value={line.cantidad_solicitada}
                                                    onChange={(e) => updateLine(idx, 'cantidad_solicitada', e.target.value)}
                                                    className="h-7 w-16 text-xs text-center"
                                                    title="Cantidad"
                                                />

                                                {/* Product selector OR free text */}
                                                <div className="flex-1 flex items-center gap-1">
                                                    {line.es_texto_libre ? (
                                                        <Input
                                                            value={line.producto_texto}
                                                            onChange={(e) => updateLine(idx, 'producto_texto', e.target.value)}
                                                            className="h-7 text-xs flex-1"
                                                            placeholder="Describir producto..."
                                                        />
                                                    ) : (
                                                        <>
                                                            <Input
                                                                value={line.producto_display}
                                                                readOnly
                                                                className="h-7 text-xs flex-1 bg-white cursor-pointer"
                                                                placeholder="Clic buscar..."
                                                                onClick={() => openProductSearch(idx)}
                                                            />
                                                            <Button
                                                                type="button"
                                                                size="sm"
                                                                variant="outline"
                                                                className="h-7 px-2 text-[10px]"
                                                                onClick={() => openProductSearch(idx)}
                                                            >
                                                                <Search className="w-3 h-3" />
                                                            </Button>
                                                        </>
                                                    )}
                                                </div>

                                                {/* Toggle libre */}
                                                <div className="flex items-center gap-1" title="Producto no en inventario">
                                                    <Checkbox
                                                        checked={line.es_texto_libre}
                                                        onCheckedChange={(v) => {
                                                            updateLine(idx, 'es_texto_libre', !!v);
                                                            if (v) {
                                                                updateLine(idx, 'producto_id', null);
                                                                updateLine(idx, 'producto_display', '');
                                                            }
                                                        }}
                                                        className="h-3.5 w-3.5"
                                                    />
                                                    <span className="text-[9px] text-gray-400 whitespace-nowrap">Libre</span>
                                                </div>

                                                {/* Remove */}
                                                {lines.length > 1 && (
                                                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-red-400 hover:text-red-600 hover:bg-red-50" onClick={() => removeLine(idx)}>
                                                        <Trash2 className="w-3.5 h-3.5" />
                                                    </Button>
                                                )}
                                            </div>
                                        ))}
                                    </div>

                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        className="h-7 text-[10px] w-full border-dashed"
                                        onClick={addLine}
                                    >
                                        <Plus className="w-3 h-3 mr-1" /> Agregar otro producto
                                    </Button>
                                </fieldset>

                                {/* ── NOTAS ── */}
                                <div>
                                    <Label className="text-[11px] font-bold text-gray-600 uppercase">Notas</Label>
                                    <Textarea
                                        value={notas}
                                        onChange={(e) => setNotas(e.target.value)}
                                        className="text-xs min-h-[36px] resize-none"
                                        placeholder="Observaciones..."
                                    />
                                </div>
                            </div>

                            {/* Footer */}
                            <div className="border-t bg-gray-50 px-4 py-3 flex items-center justify-between rounded-b-lg">
                                <span className="text-[10px] text-gray-400">{lines.length} producto{lines.length !== 1 ? 's' : ''}</span>
                                <div className="flex gap-3">
                                    <Button variant="outline" size="sm" onClick={onClose} className="h-8 text-xs">Cancelar</Button>
                                    <Button
                                        size="sm"
                                        className="h-8 text-xs bg-morla-blue text-white hover:bg-morla-blue/90"
                                        onClick={handleSubmit}
                                        disabled={saving}
                                    >
                                        {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Save className="w-4 h-4 mr-1" />}
                                        Guardar
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </motion.div>

                    {/* Product Search Modal */}
                    <ProductSearchModal
                        isOpen={isProductSearchOpen}
                        onClose={() => setIsProductSearchOpen(false)}
                        onSelectProduct={handleProductSelect}
                    />
                </>
            )}
        </AnimatePresence>
    );
};

export default SolicitudForm;
