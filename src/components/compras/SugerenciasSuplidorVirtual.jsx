// ============================================================
// SugerenciasSuplidorVirtual.jsx
// ============================================================
// La lista de pendientes del Suplidor Virtual se asoma dentro de la Orden de
// Compra: al elegir el suplidor, aparece lo que PARECE de él.
//
// «Acabo de agregar GUIA VALVULA PLATINA 125, pero si no entro ahí no recuerdo
//  que lo anoté. Si me aparece sugerido en la compra de MAGNA, que es el
//  suplidor que más mercancía PLATINA le compro, no se quedaría en el olvido.»
//
// De dónde sale la adivinanza: get_sugerencias_suplidor_virtual() mira sus
// propias compras y su catálogo, y devuelve el suplidor que más manda en esas
// palabras, el porcentaje y LAS PALABRAS que decidieron. Nada entra solo a la
// orden — el dueño agrega, o dice "no es de aquí" y eso queda aprendido.
// ============================================================

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { PackageX, Loader2, Plus, X, ChevronDown, ChevronRight, Clock } from 'lucide-react';

const norm = (s) => String(s || '').trim().toUpperCase();

const colorConfianza = (c) => {
    if (c == null) return 'bg-slate-100 text-slate-500 border-slate-200';
    if (c >= 60) return 'bg-emerald-100 text-emerald-700 border-emerald-300';
    if (c >= 40) return 'bg-amber-100 text-amber-700 border-amber-300';
    return 'bg-slate-100 text-slate-600 border-slate-300';
};

export default function SugerenciasSuplidorVirtual({
    suplidorId,                 // uuid del suplidor elegido en la orden
    suplidorNombre,             // para el texto
    descripcionesEnOrden = [],  // lo que ya está en la orden, para no repetir
    onAgregar,                  // (items[]) => void  — el padre mete las líneas
    recargar = 0,               // cambia este número para volver a preguntar
}) {
    const { toast } = useToast();
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(false);
    const [abierto, setAbierto] = useState(true);
    const [verOtros, setVerOtros] = useState(false);
    const [ocultos, setOcultos] = useState([]);   // ids descartados en esta sesión

    const cargar = useCallback(async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase.rpc('get_sugerencias_suplidor_virtual', {
                p_suplidor_id: null,
            });
            if (error) throw error;
            setItems(data || []);
        } catch (err) {
            // Si el SQL todavía no está corrido, la orden sigue funcionando igual.
            console.warn('[SuplidorVirtual] sugerencias no disponibles:', err.message);
            setItems([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { cargar(); }, [cargar, recargar]);

    const yaPuestas = useMemo(
        () => new Set((descripcionesEnOrden || []).map(norm)),
        [descripcionesEnOrden]
    );

    const disponibles = useMemo(
        () => items.filter((i) => !ocultos.includes(i.id) && !yaPuestas.has(norm(i.descripcion))),
        [items, ocultos, yaPuestas]
    );

    const deEste = useMemo(
        () => disponibles.filter((i) => i.suplidor_sugerido_id && i.suplidor_sugerido_id === suplidorId),
        [disponibles, suplidorId]
    );

    const otros = useMemo(
        () => disponibles.filter((i) => !i.suplidor_sugerido_id || i.suplidor_sugerido_id !== suplidorId),
        [disponibles, suplidorId]
    );

    const meter = (lista) => {
        if (!lista.length) return;
        onAgregar?.(lista);
        setOcultos((prev) => [...prev, ...lista.map((i) => i.id)]);
        toast({
            title: lista.length === 1 ? '📋 Pendiente agregado' : `📋 ${lista.length} pendientes agregados`,
            description: 'Se marcan como pedidos cuando grabes la orden.',
        });
    };

    const noEsDeAqui = async (item) => {
        setOcultos((prev) => [...prev, item.id]);
        try {
            const { error } = await supabase.rpc('aprender_suplidor_virtual', {
                p_item_id: item.id,
                p_suplidor_id: suplidorId,
                p_acierto: false,
            });
            if (error) throw error;
            toast({
                title: 'Anotado',
                description: `"${item.descripcion}" no se te va a sugerir más para ${suplidorNombre}.`,
            });
        } catch (err) {
            toast({ variant: 'destructive', title: 'No se pudo aprender', description: err.message });
        }
    };

    if (!suplidorId) return null;
    if (!loading && disponibles.length === 0) return null;

    return (
        <div className="mb-3 border border-amber-300 rounded bg-amber-50/70">
            {/* Franja */}
            <div className="flex items-center gap-2 px-3 py-2">
                <div className="bg-amber-500 text-white p-1.5 rounded">
                    <PackageX className="h-4 w-4" />
                </div>
                <div className="flex-1 text-xs text-slate-700">
                    {loading ? (
                        <span className="flex items-center gap-2 text-slate-500">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Revisando la lista de pendientes...
                        </span>
                    ) : deEste.length > 0 ? (
                        <>
                            <b className="text-amber-800">{deEste.length}</b> pendiente{deEste.length !== 1 ? 's' : ''} del
                            {' '}Suplidor Virtual parece{deEste.length !== 1 ? 'n' : ''} de{' '}
                            <b className="uppercase">{suplidorNombre || 'este suplidor'}</b>
                        </>
                    ) : (
                        <>Ninguno de los <b>{otros.length}</b> pendientes parece de <b className="uppercase">{suplidorNombre}</b></>
                    )}
                </div>

                {deEste.length > 0 && (
                    <>
                        <Button
                            size="sm"
                            className="h-7 px-2 text-[11px] bg-amber-600 hover:bg-amber-700 text-white"
                            onClick={() => meter(deEste)}
                        >
                            <Plus className="h-3 w-3 mr-1" /> Agregar {deEste.length === 1 ? 'el pendiente' : 'todos'}
                        </Button>
                        <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-[11px]"
                            onClick={() => setAbierto((v) => !v)}
                        >
                            {abierto ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                            {abierto ? 'Ocultar' : 'Ver'}
                        </Button>
                    </>
                )}
            </div>

            {/* Los que parecen de este suplidor */}
            {abierto && deEste.length > 0 && (
                <div className="border-t border-amber-200 divide-y divide-amber-100">
                    {deEste.map((it) => (
                        <Fila key={it.id} it={it} onMeter={() => meter([it])} onFuera={() => noEsDeAqui(it)} />
                    ))}
                </div>
            )}

            {/* El resto — para que nada se quede atrapado por una mala adivinanza */}
            {otros.length > 0 && (
                <div className="border-t border-amber-200">
                    <button
                        type="button"
                        onClick={() => setVerOtros((v) => !v)}
                        className="w-full text-left px-3 py-1.5 text-[11px] text-slate-600 hover:bg-amber-100/60 flex items-center gap-1"
                    >
                        {verOtros ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                        Ver los otros {otros.length} pendientes de la lista
                    </button>

                    {verOtros && (
                        <div className="divide-y divide-amber-100 max-h-64 overflow-y-auto">
                            {otros.map((it) => (
                                <Fila
                                    key={it.id}
                                    it={it}
                                    ajeno
                                    onMeter={() => meter([it])}
                                    onFuera={() => noEsDeAqui(it)}
                                />
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

function Fila({ it, onMeter, onFuera, ajeno = false }) {
    return (
        <div className="flex items-center gap-2 px-3 py-1.5 hover:bg-amber-100/50">
            <Button
                size="sm"
                variant="outline"
                className="h-6 px-2 text-[10px] border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                onClick={onMeter}
                title="Meter este pendiente en la orden"
            >
                <Plus className="h-3 w-3 mr-0.5" /> Agregar
            </Button>

            <span className="uppercase text-xs font-semibold text-slate-800 flex-1 truncate">
                {it.descripcion}
                {Number(it.cantidad_sugerida) > 1 && (
                    <span className="ml-1 text-slate-500 font-normal">× {Number(it.cantidad_sugerida)}</span>
                )}
            </span>

            {ajeno && (
                <span className="text-[10px] text-slate-500 truncate max-w-[170px]">
                    {it.suplidor_sugerido ? `parece de ${it.suplidor_sugerido}` : 'sin pista'}
                </span>
            )}

            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${colorConfianza(it.confianza)}`}>
                {it.confianza != null ? `${it.confianza}%` : '—'}
            </span>

            <span className="text-[10px] text-slate-500 truncate max-w-[190px]" title={it.motivo || ''}>
                {it.motivo}
            </span>

            {it.suplidor_original && (
                <span className="text-[10px] text-rose-600 truncate max-w-[150px]" title={`${it.suplidor_original} no la tenía`}>
                    {it.suplidor_original} no la tenía
                </span>
            )}

            <span className="text-[10px] text-slate-400 flex items-center gap-0.5 w-20 justify-end">
                <Clock className="h-3 w-3" />
                {it.dias_esperando}d
            </span>

            {!ajeno && (
                <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 px-1.5 text-[10px] text-slate-500 hover:text-rose-600"
                    onClick={onFuera}
                    title="No es de este suplidor — no me lo sugieras más aquí"
                >
                    <X className="h-3 w-3 mr-0.5" /> No es de aquí
                </Button>
            )}
        </div>
    );
}
