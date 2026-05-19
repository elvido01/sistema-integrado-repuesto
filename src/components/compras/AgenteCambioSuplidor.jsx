// ============================================================
// AgenteCambioSuplidor.jsx
// ============================================================
// Componente del agente "Sustituto de Suplidor".
//
// Uso (desde OrdenCompraPage):
//   const [contextMenu, setContextMenu] = useState(null);
//   ...
//   <TableRow onContextMenu={(e) => {
//     e.preventDefault();
//     setContextMenu({ detalle: d, x: e.clientX, y: e.clientY });
//   }}>
//   ...
//   <AgenteCambioSuplidor
//     contextMenu={contextMenu}
//     suplidor_actual_id={selectedSuplidorId}
//     onClose={() => setContextMenu(null)}
//     onCrearOC={(recomendacion, detalle) => handleCrearOCBorrador(recomendacion, detalle)}
//   />
// ============================================================

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Zap, AlertTriangle, Loader2, X, CheckCircle, TrendingUp } from 'lucide-react';

export default function AgenteCambioSuplidor({
    contextMenu,        // { detalle, x, y } | null
    suplidor_actual_id, // uuid del suplidor de la OC actual
    onClose,            // () => void — cierra el menú
    onCrearOC,          // (recomendacion, detalle) => void — callback al hacer "crear OC borrador"
}) {
    const { toast } = useToast();
    const [loading, setLoading] = useState(false);
    const [recomendacion, setRecomendacion] = useState(null);
    const [error, setError] = useState(null);
    const [creditos, setCreditos] = useState(null);

    // Cierra el menú al hacer clic fuera o ESC
    useEffect(() => {
        if (!contextMenu) return;
        const onDocClick = (e) => {
            // Si el clic NO es dentro del menú flotante, cerrar
            if (!e.target.closest('[data-agent-menu]')) onClose();
        };
        const onEsc = (e) => { if (e.key === 'Escape') onClose(); };
        // Defer 1 tick para que el evento que abrió el menú no lo cierre
        setTimeout(() => {
            document.addEventListener('mousedown', onDocClick);
            document.addEventListener('keydown', onEsc);
        }, 0);
        return () => {
            document.removeEventListener('mousedown', onDocClick);
            document.removeEventListener('keydown', onEsc);
        };
    }, [contextMenu, onClose]);

    const handleAgotado = async () => {
        if (!contextMenu?.detalle) return;
        const detalle = contextMenu.detalle;
        if (!detalle.producto_id) {
            toast({ variant: 'destructive', title: 'Producto sin ID', description: 'Este detalle no tiene producto_id asociado.' });
            onClose();
            return;
        }

        setLoading(true);
        setError(null);
        setRecomendacion(null);

        try {
            const { data, error: invokeErr } = await supabase.functions.invoke('motoflow-agent', {
                body: {
                    agent_key: 'cambio_suplidor',
                    payload: {
                        producto_id: detalle.producto_id,
                        suplidor_original_id: suplidor_actual_id || null,
                        cantidad: detalle.cantidad || 1,
                    },
                },
            });

            if (invokeErr) {
                let msg = invokeErr.message;
                try {
                    if (invokeErr.context?.json) {
                        const parsed = await invokeErr.context.json();
                        if (parsed?.mensaje) msg = parsed.mensaje;
                        else if (parsed?.error) msg = parsed.error;
                    }
                } catch (_) { /* ignore */ }
                throw new Error(msg);
            }

            if (!data?.ok) {
                throw new Error(data?.mensaje || data?.error || 'El agente devolvió un error');
            }

            setRecomendacion({ ...data.resultado, _detalleOriginal: detalle });
            setCreditos(data.creditos);
        } catch (err) {
            setError(err.message || String(err));
        } finally {
            setLoading(false);
        }
    };

    const cerrarTodo = () => {
        setRecomendacion(null);
        setError(null);
        setCreditos(null);
        onClose();
    };

    const handleCrearOCClick = () => {
        if (!recomendacion || !onCrearOC) return;
        onCrearOC(recomendacion, recomendacion._detalleOriginal);
        cerrarTodo();
    };

    if (!contextMenu) return null;

    return (
        <>
            {/* ─── Menú flotante (contextual) ─── */}
            {!loading && !recomendacion && !error && (
                <div
                    data-agent-menu
                    className="fixed z-[100] bg-white border border-slate-300 shadow-2xl rounded-md py-1 min-w-[260px]"
                    style={{ top: contextMenu.y, left: contextMenu.x }}
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="px-3 py-1.5 text-[10px] font-bold text-slate-400 uppercase border-b border-slate-100">
                        Acciones del agente IA
                    </div>
                    <button
                        onClick={handleAgotado}
                        className="w-full px-3 py-2 text-left hover:bg-amber-50 text-xs flex items-center gap-2 group"
                    >
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                        <div className="flex-1">
                            <div className="font-bold text-slate-800">⚠️ Producto agotado al suplidor</div>
                            <div className="text-[10px] text-slate-500">El agente recomendará otro suplidor</div>
                        </div>
                        <Zap className="w-3.5 h-3.5 text-purple-500 group-hover:text-purple-700" />
                    </button>
                </div>
            )}

            {/* ─── Modal de carga ─── */}
            {loading && (
                <div data-agent-menu className="fixed inset-0 z-[200] bg-black/40 flex items-center justify-center">
                    <div className="bg-white rounded-lg shadow-2xl p-6 max-w-sm text-center">
                        <Loader2 className="w-10 h-10 text-purple-600 animate-spin mx-auto mb-3" />
                        <p className="font-bold text-slate-700">Consultando al agente...</p>
                        <p className="text-xs text-slate-500 mt-1">Analizando historial de compras</p>
                    </div>
                </div>
            )}

            {/* ─── Modal de error ─── */}
            {error && (
                <div data-agent-menu className="fixed inset-0 z-[200] bg-black/40 flex items-center justify-center p-4">
                    <div className="bg-white rounded-lg shadow-2xl max-w-md w-full">
                        <div className="flex items-center justify-between px-4 py-3 border-b bg-red-50">
                            <div className="flex items-center gap-2">
                                <AlertTriangle className="w-5 h-5 text-red-600" />
                                <h3 className="font-bold text-red-900">Error del agente</h3>
                            </div>
                            <button onClick={cerrarTodo}><X className="w-4 h-4 text-slate-500" /></button>
                        </div>
                        <div className="p-4">
                            <p className="text-sm text-slate-700">{error}</p>
                        </div>
                        <div className="flex justify-end px-4 py-3 border-t bg-slate-50">
                            <Button onClick={cerrarTodo} variant="outline" size="sm">Cerrar</Button>
                        </div>
                    </div>
                </div>
            )}

            {/* ─── Modal de recomendación ─── */}
            {recomendacion && (
                <div data-agent-menu className="fixed inset-0 z-[200] bg-black/40 flex items-center justify-center p-4">
                    <div className="bg-white rounded-lg shadow-2xl max-w-lg w-full max-h-[85vh] flex flex-col">
                        {/* Header */}
                        <div className="flex items-center justify-between px-4 py-3 border-b bg-gradient-to-r from-purple-50 to-blue-50">
                            <div className="flex items-center gap-2">
                                <Zap className="w-5 h-5 text-purple-600" />
                                <h3 className="font-bold text-slate-800">🤖 Recomendación del Agente</h3>
                            </div>
                            <button onClick={cerrarTodo}><X className="w-4 h-4 text-slate-500" /></button>
                        </div>

                        {/* Body */}
                        <div className="p-4 space-y-3 overflow-y-auto">
                            {/* Producto */}
                            <div className="bg-slate-50 rounded p-3 text-xs">
                                <div className="text-[10px] font-bold text-slate-400 uppercase">Producto</div>
                                <div className="font-mono text-slate-700">{recomendacion.historico_resumen?.producto_codigo}</div>
                                <div className="font-medium text-slate-800">{recomendacion.historico_resumen?.producto_descripcion}</div>
                            </div>

                            {/* Recomendación principal */}
                            {recomendacion.suplidor_recomendado_id ? (
                                <div className={`border-2 rounded-lg p-4 ${
                                    recomendacion.confianza === 'alta' ? 'border-emerald-300 bg-emerald-50' :
                                    recomendacion.confianza === 'media' ? 'border-amber-300 bg-amber-50' :
                                    'border-slate-300 bg-slate-50'
                                }`}>
                                    <div className="flex items-center gap-2 mb-2">
                                        <CheckCircle className={`w-5 h-5 ${
                                            recomendacion.confianza === 'alta' ? 'text-emerald-600' :
                                            recomendacion.confianza === 'media' ? 'text-amber-600' :
                                            'text-slate-600'
                                        }`} />
                                        <span className="font-bold text-slate-900">Suplidor recomendado:</span>
                                    </div>
                                    <p className="text-lg font-black text-slate-900">{recomendacion.suplidor_recomendado_nombre}</p>
                                    <div className="flex items-center gap-3 mt-2 text-xs">
                                        <span className={`px-2 py-0.5 rounded-full font-bold uppercase ${
                                            recomendacion.confianza === 'alta' ? 'bg-emerald-200 text-emerald-900' :
                                            recomendacion.confianza === 'media' ? 'bg-amber-200 text-amber-900' :
                                            'bg-slate-200 text-slate-700'
                                        }`}>
                                            Confianza {recomendacion.confianza}
                                        </span>
                                        {recomendacion.precio_estimado != null && (
                                            <span className="text-slate-700">
                                                💰 Precio estimado: <b>RD$ {recomendacion.precio_estimado.toFixed(2)}</b>
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-xs italic text-slate-700 mt-2">{recomendacion.razon}</p>
                                </div>
                            ) : (
                                <div className="border-2 border-slate-300 rounded-lg p-4 bg-slate-50">
                                    <p className="font-bold text-slate-700">Sin recomendación clara</p>
                                    <p className="text-xs text-slate-600 mt-1">{recomendacion.razon}</p>
                                </div>
                            )}

                            {/* Alternativas */}
                            {recomendacion.alternativas?.length > 0 && (
                                <details className="text-xs">
                                    <summary className="cursor-pointer font-bold text-slate-600 hover:text-slate-800 flex items-center gap-1">
                                        <TrendingUp className="w-3 h-3" />
                                        Ver {recomendacion.alternativas.length} alternativa{recomendacion.alternativas.length > 1 ? 's' : ''}
                                    </summary>
                                    <div className="mt-2 space-y-1">
                                        {recomendacion.alternativas.map((a, i) => (
                                            <div key={i} className="flex items-center justify-between bg-white border border-slate-200 rounded p-2">
                                                <div>
                                                    <div className="font-bold text-slate-800">{a.suplidor_nombre}</div>
                                                    <div className="text-[10px] text-slate-500">{a.nota}</div>
                                                </div>
                                                <div className="text-right">
                                                    <div className="text-[10px] text-slate-400 uppercase">Score</div>
                                                    <div className="font-bold text-blue-700">{a.score}</div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </details>
                            )}

                            {/* Historial resumen */}
                            <div className="text-[10px] text-slate-500 italic">
                                Análisis sobre {recomendacion.historico_resumen?.compras_totales || 0} compras
                                de {recomendacion.historico_resumen?.suplidores_distintos || 0} suplidores
                                en los últimos 18 meses.
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="flex items-center justify-between gap-2 px-4 py-3 border-t bg-slate-50">
                            <div className="text-[10px] text-slate-500">
                                Créditos hoy: <b className="text-slate-700">{creditos?.restante}/{creditos?.limite}</b>
                            </div>
                            <div className="flex gap-2">
                                <Button onClick={cerrarTodo} variant="outline" size="sm">Cancelar</Button>
                                {recomendacion.action === 'crear_oc_borrador' && recomendacion.suplidor_recomendado_id && onCrearOC && (
                                    <Button onClick={handleCrearOCClick} className="bg-emerald-600 hover:bg-emerald-700 text-white" size="sm">
                                        ✅ Crear OC borrador
                                    </Button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
