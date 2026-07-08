// ============================================================
// SuplidorVirtualMenu.jsx
// ============================================================
// Menú contextual que aparece al hacer clic derecho sobre una
// línea de detalle en Orden de Compra. Permite "enviar" el
// producto al Suplidor Virtual (regla de negocio: queda bloqueado
// 30 días para que el sistema no lo pida al suplidor original).
// ============================================================

import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { Button } from '@/components/ui/button';
import { PackageX, Loader2, X, Eye, Link2 } from 'lucide-react';

export default function SuplidorVirtualMenu({
    contextMenu,           // { detalle, x, y } | null
    suplidor_actual_id,    // uuid del suplidor de la OC actual (opcional)
    orden_compra_id,       // uuid de la OC si ya está guardada (opcional)
    onClose,               // () => void
    onSent,                // (detalle) => void — el padre debe sacar la línea de la OC
    onViewProduct,         // (detalle) => void — abre Información de la Mercancía (opcional)
    onLinkEquivalent,      // (detalle) => void — relacionar con un producto equivalente (opcional)
}) {
    const { toast } = useToast();
    const { tenantId, user } = useAuth();
    const [loading, setLoading] = useState(false);
    const [confirmOpen, setConfirmOpen] = useState(false);

    useEffect(() => {
        if (!contextMenu) {
            setConfirmOpen(false);
            return;
        }
        const onDocClick = (e) => {
            if (!e.target.closest('[data-supvirt-menu]')) onClose();
        };
        const onEsc = (e) => { if (e.key === 'Escape') onClose(); };
        setTimeout(() => {
            document.addEventListener('mousedown', onDocClick);
            document.addEventListener('keydown', onEsc);
        }, 0);
        return () => {
            document.removeEventListener('mousedown', onDocClick);
            document.removeEventListener('keydown', onEsc);
        };
    }, [contextMenu, onClose]);

    const handleEnviar = async () => {
        if (!contextMenu?.detalle) return;
        const detalle = contextMenu.detalle;

        if (!detalle.producto_id) {
            toast({
                variant: 'destructive',
                title: 'Producto sin ID',
                description: 'Este detalle no tiene producto_id. Guarda el producto en mercancías primero.',
            });
            onClose();
            return;
        }
        if (!tenantId) {
            toast({ variant: 'destructive', title: 'Sin tenant', description: 'No se pudo identificar el tenant.' });
            onClose();
            return;
        }

        setLoading(true);
        try {
            const { data: existing, error: existErr } = await supabase
                .from('suplidor_virtual_items')
                .select('id, expira_at')
                .eq('tenant_id', tenantId)
                .eq('producto_id', detalle.producto_id)
                .eq('estado', 'pendiente')
                .gt('expira_at', new Date().toISOString())
                .maybeSingle();

            if (existErr) throw existErr;

            if (existing) {
                const exp = new Date(existing.expira_at);
                toast({
                    title: 'Ya está en Suplidor Virtual',
                    description: `Este producto ya está pendiente hasta ${exp.toLocaleDateString('es-DO')}.`,
                });
                onSent?.(detalle);
                onClose();
                return;
            }

            const { error: insErr } = await supabase
                .from('suplidor_virtual_items')
                .insert({
                    tenant_id: tenantId,
                    producto_id: detalle.producto_id,
                    suplidor_original_id: suplidor_actual_id || null,
                    codigo: detalle.codigo || null,
                    descripcion: detalle.descripcion || null,
                    cantidad_sugerida: Number(detalle.cantidad) || 1,
                    precio_referencia: Number(detalle.precio) || null,
                    orden_compra_origen_id: orden_compra_id || null,
                    created_by: user?.id || null,
                });

            if (insErr) throw insErr;

            toast({
                title: '📦 Enviado a Suplidor Virtual',
                description: `${detalle.codigo || 'Producto'} quedó bloqueado por 30 días para el suplidor original.`,
                duration: 5000,
            });
            onSent?.(detalle);
            onClose();
        } catch (err) {
            console.error('[SuplidorVirtual] error:', err);
            toast({
                variant: 'destructive',
                title: 'Error',
                description: err.message || 'No se pudo enviar a Suplidor Virtual.',
            });
        } finally {
            setLoading(false);
        }
    };

    if (!contextMenu) return null;
    const { x, y, detalle } = contextMenu;

    if (confirmOpen) {
        return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" data-supvirt-menu>
                <div className="bg-white rounded-md shadow-2xl border border-slate-200 max-w-md w-full p-5">
                    <div className="flex items-start gap-3 mb-3">
                        <PackageX className="h-6 w-6 text-amber-600 flex-shrink-0 mt-0.5" />
                        <div className="flex-1">
                            <h3 className="text-lg font-bold text-slate-800">Enviar a Suplidor Virtual</h3>
                            <p className="text-sm text-slate-600 mt-1">
                                <span className="font-semibold">{detalle.codigo}</span> — {detalle.descripcion}
                            </p>
                        </div>
                        <button onClick={onClose} className="text-slate-400 hover:text-slate-700">
                            <X className="h-4 w-4" />
                        </button>
                    </div>

                    <div className="bg-amber-50 border border-amber-200 rounded p-3 text-xs text-slate-700 mb-4">
                        <p className="font-semibold mb-1">¿Qué hace esta acción?</p>
                        <ul className="list-disc list-inside space-y-1 text-[11px]">
                            <li>Mueve la línea de esta OC al Suplidor Virtual.</li>
                            <li>Bloquea el producto <strong>30 días</strong> para que el sistema no lo sugiera al suplidor original.</li>
                            <li>Podrás verlo y comprarlo a otro suplidor desde el panel "Suplidor Virtual".</li>
                        </ul>
                    </div>

                    <div className="flex justify-end gap-2">
                        <Button variant="outline" onClick={onClose} disabled={loading}>
                            Cancelar
                        </Button>
                        <Button
                            className="bg-amber-600 hover:bg-amber-700 text-white"
                            onClick={handleEnviar}
                            disabled={loading}
                        >
                            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <PackageX className="h-4 w-4 mr-1" />}
                            Confirmar envío
                        </Button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div
            data-supvirt-menu
            className="fixed z-50 bg-white rounded-md shadow-2xl border border-slate-300 py-1 min-w-[260px]"
            style={{ left: Math.min(x, window.innerWidth - 280), top: Math.min(y, window.innerHeight - 80) }}
        >
            <div className="px-3 py-2 border-b border-slate-100 text-[11px] text-slate-500 uppercase tracking-wide font-bold">
                {detalle.codigo || 'Producto'}
            </div>
            {onViewProduct && (
                <button
                    onClick={() => { onViewProduct(detalle); onClose(); }}
                    className="w-full text-left px-3 py-2 hover:bg-blue-50 flex items-center gap-2 text-sm border-b border-slate-100"
                >
                    <Eye className="h-4 w-4 text-blue-600" />
                    <span className="font-medium text-slate-800">Ver producto</span>
                </button>
            )}
            {onLinkEquivalent && (
                <button
                    onClick={() => { onLinkEquivalent(detalle); onClose(); }}
                    className="w-full text-left px-3 py-2 hover:bg-purple-50 flex items-center gap-2 text-sm border-b border-slate-100"
                    title="Agrupa este producto con un equivalente de otra marca: la Orden Automática los tratará como el mismo stock"
                >
                    <Link2 className="h-4 w-4 text-purple-600" />
                    <span className="font-medium text-slate-800">Relacionar equivalentes</span>
                </button>
            )}
            <button
                onClick={() => setConfirmOpen(true)}
                className="w-full text-left px-3 py-2 hover:bg-amber-50 flex items-center gap-2 text-sm"
            >
                <PackageX className="h-4 w-4 text-amber-600" />
                <span className="font-medium text-slate-800">Enviar a Suplidor Virtual</span>
            </button>
            <div className="px-3 py-1.5 text-[10px] text-slate-400 border-t border-slate-100">
                Bloquea el producto 30 días para el suplidor original
            </div>
        </div>
    );
}
