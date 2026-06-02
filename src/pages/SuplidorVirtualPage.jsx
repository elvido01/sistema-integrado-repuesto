// ============================================================
// SuplidorVirtualPage.jsx
// ============================================================
// Panel que lista los productos enviados al "Suplidor Virtual"
// (marcados como agotados al suplidor original).
//
// Acciones por fila:
//  - Ver detalles
//  - Cancelar (devuelve disponibilidad inmediatamente)
//  - Marcar como comprado (estado = 'comprado')
//
// Filtros:
//  - estado (pendiente | comprado | expirado | cancelado | todos)
//  - suplidor original
// ============================================================

import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, PackageX, RotateCcw, CheckCircle2, X, RefreshCw, Search, ArrowLeft, Trash2 } from 'lucide-react';

const ESTADO_LABELS = {
    pendiente: { label: 'Pendiente', color: 'bg-amber-100 text-amber-800 border-amber-300' },
    comprado: { label: 'Comprado', color: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
    expirado: { label: 'Expirado', color: 'bg-slate-100 text-slate-600 border-slate-300' },
    cancelado: { label: 'Cancelado', color: 'bg-rose-100 text-rose-700 border-rose-300' },
};

const diasRestantes = (expira_at) => {
    if (!expira_at) return null;
    const diff = (new Date(expira_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    return Math.floor(diff);
};

export default function SuplidorVirtualPage({ onBack = null }) {
    const { toast } = useToast();
    const { tenantId } = useAuth();
    const [loading, setLoading] = useState(true);
    const [items, setItems] = useState([]);
    const [filtroEstado, setFiltroEstado] = useState('pendiente');
    const [filtroSuplidor, setFiltroSuplidor] = useState('');
    const [busqueda, setBusqueda] = useState('');
    const [suplidores, setSuplidores] = useState([]);
    const [notaGeneral, setNotaGeneral] = useState('');
    const notaStorageKey = useMemo(
        () => `suplidor_virtual_nota_general_${tenantId || 'local'}`,
        [tenantId]
    );

    const cargar = useCallback(async () => {
        if (!tenantId) return;
        setLoading(true);
        try {
            let query = supabase
                .from('suplidor_virtual_items')
                .select(`
                    id, producto_id, suplidor_original_id, codigo, descripcion,
                    cantidad_sugerida, precio_referencia, estado,
                    marcado_at, expira_at, comprado_a_suplidor_id,
                    suplidor_original:proveedores!suplidor_virtual_items_suplidor_original_id_fkey(id, nombre)
                `)
                .eq('tenant_id', tenantId)
                .order('marcado_at', { ascending: false })
                .limit(500);

            if (filtroEstado !== 'todos') {
                query = query.eq('estado', filtroEstado);
            }
            if (filtroSuplidor) {
                query = query.eq('suplidor_original_id', filtroSuplidor);
            }

            const { data, error } = await query;
            if (error) throw error;
            setItems(data || []);
        } catch (err) {
            console.error('[SuplidorVirtualPage] error cargando:', err);
            toast({ variant: 'destructive', title: 'Error', description: err.message });
        } finally {
            setLoading(false);
        }
    }, [tenantId, filtroEstado, filtroSuplidor, toast]);

    useEffect(() => {
        if (!tenantId) return;
        supabase
            .from('proveedores')
            .select('id, nombre')
            .eq('tenant_id', tenantId)
            .order('nombre')
            .then(({ data }) => setSuplidores(data || []));
    }, [tenantId]);

    useEffect(() => { cargar(); }, [cargar]);

    useEffect(() => {
        setNotaGeneral(localStorage.getItem(notaStorageKey) || '');
    }, [notaStorageKey]);

    const handleNotaGeneralChange = (value) => {
        const next = value.slice(0, 50);
        setNotaGeneral(next);
        localStorage.setItem(notaStorageKey, next);
    };

    const borrarNotaGeneral = () => {
        setNotaGeneral('');
        localStorage.removeItem(notaStorageKey);
        toast({ title: 'Nota borrada' });
    };

    const itemsFiltrados = useMemo(() => {
        if (!busqueda.trim()) return items;
        const q = busqueda.trim().toLowerCase();
        return items.filter((it) =>
            (it.codigo || '').toLowerCase().includes(q) ||
            (it.descripcion || '').toLowerCase().includes(q)
        );
    }, [items, busqueda]);

    const cambiarEstado = async (id, nuevoEstado) => {
        try {
            const { error } = await supabase
                .from('suplidor_virtual_items')
                .update({ estado: nuevoEstado, updated_at: new Date().toISOString() })
                .eq('id', id);
            if (error) throw error;
            toast({ title: 'Actualizado', description: `Item marcado como ${ESTADO_LABELS[nuevoEstado]?.label || nuevoEstado}.` });
            cargar();
        } catch (err) {
            toast({ variant: 'destructive', title: 'Error', description: err.message });
        }
    };

    const resumen = useMemo(() => {
        const r = { pendiente: 0, comprado: 0, expirado: 0, cancelado: 0, por_expirar: 0 };
        for (const it of items) {
            r[it.estado] = (r[it.estado] || 0) + 1;
            if (it.estado === 'pendiente') {
                const d = diasRestantes(it.expira_at);
                if (d !== null && d <= 7 && d >= 0) r.por_expirar += 1;
            }
        }
        return r;
    }, [items]);

    return (
        <div className="flex flex-col h-full">
            {/* Header */}
            <div className="flex items-center justify-between mb-3 p-2 bg-slate-200 border border-slate-300 rounded-sm">
                <div className="flex items-center gap-3">
                    {onBack && (
                        <Button variant="ghost" size="sm" className="h-9" onClick={onBack} title="Volver a Órdenes de Compra">
                            <ArrowLeft className="h-4 w-4 mr-1" /> Volver
                        </Button>
                    )}
                    <div className="bg-amber-500 text-white p-2 rounded">
                        <PackageX className="h-5 w-5" />
                    </div>
                    <div>
                        <h2 className="text-lg font-bold text-slate-800">Suplidor Virtual</h2>
                        <p className="text-[11px] text-slate-500">Productos agotados al suplidor original. Quedan bloqueados 30 días.</p>
                    </div>
                </div>
                <Button variant="outline" onClick={cargar} disabled={loading}>
                    <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                    Refrescar
                </Button>
            </div>

                {/* Tarjetas resumen */}
                {filtroEstado === 'todos' && (
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-4">
                        <ResumenCard label="Pendientes" value={resumen.pendiente} color="amber" />
                        <ResumenCard label="Por expirar (≤7d)" value={resumen.por_expirar} color="red" />
                        <ResumenCard label="Comprados" value={resumen.comprado} color="emerald" />
                        <ResumenCard label="Expirados" value={resumen.expirado} color="slate" />
                        <ResumenCard label="Cancelados" value={resumen.cancelado} color="rose" />
                    </div>
                )}

                {/* Filtros */}
                <div className="bg-white border border-slate-200 rounded p-3 mb-3 flex flex-wrap gap-3 items-end">
                    <div>
                        <Label className="text-[10px] uppercase font-bold text-slate-500">Estado</Label>
                        <Select value={filtroEstado} onValueChange={setFiltroEstado}>
                            <SelectTrigger className="h-9 w-44 text-xs">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="pendiente">Solo pendientes</SelectItem>
                                <SelectItem value="comprado">Comprados</SelectItem>
                                <SelectItem value="expirado">Expirados</SelectItem>
                                <SelectItem value="cancelado">Cancelados</SelectItem>
                                <SelectItem value="todos">Todos</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div>
                        <Label className="text-[10px] uppercase font-bold text-slate-500">Suplidor original</Label>
                        <Select value={filtroSuplidor || 'all'} onValueChange={(v) => setFiltroSuplidor(v === 'all' ? '' : v)}>
                            <SelectTrigger className="h-9 w-56 text-xs">
                                <SelectValue placeholder="Todos" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Todos los suplidores</SelectItem>
                                {suplidores.map((s) => (
                                    <SelectItem key={s.id} value={s.id}>{s.nombre}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="flex-1 min-w-[200px]">
                        <Label className="text-[10px] uppercase font-bold text-slate-500">Buscar código/descripción</Label>
                        <div className="relative">
                            <Search className="absolute left-2 top-2.5 h-4 w-4 text-slate-400" />
                            <Input
                                value={busqueda}
                                onChange={(e) => setBusqueda(e.target.value)}
                                placeholder="Buscar..."
                                className="h-9 pl-8 text-xs"
                            />
                        </div>
                    </div>
                </div>

                <div className="bg-white border border-slate-200 rounded p-3 mb-3 flex items-end gap-2">
                    <div className="flex-1">
                        <Label className="text-[10px] uppercase font-bold text-slate-500">Notas</Label>
                        <Textarea
                            value={notaGeneral}
                            onChange={(e) => handleNotaGeneralChange(e.target.value)}
                            maxLength={50}
                            rows={2}
                            placeholder="Nota rápida..."
                            className="mt-1 min-h-[46px] text-xs resize-none"
                        />
                    </div>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={borrarNotaGeneral}
                        disabled={!notaGeneral}
                        className="h-9 text-red-600 border-red-200 hover:bg-red-50"
                    >
                        <Trash2 className="h-4 w-4 mr-1" />
                        Borrar
                    </Button>
                </div>

                {/* Tabla */}
                <div className="bg-white border border-slate-200 rounded overflow-hidden">
                    <Table>
                        <TableHeader className="bg-slate-50">
                            <TableRow className="[&_th]:py-2 [&_th]:text-[11px] [&_th]:uppercase [&_th]:text-slate-600">
                                <TableHead className="w-28">Código</TableHead>
                                <TableHead>Descripción</TableHead>
                                <TableHead className="w-40">Suplidor original</TableHead>
                                <TableHead className="w-20 text-center">Cant.</TableHead>
                                <TableHead className="w-28 text-right">Precio ref.</TableHead>
                                <TableHead className="w-32 text-center">Marcado</TableHead>
                                <TableHead className="w-28 text-center">Estado</TableHead>
                                <TableHead className="w-28 text-center">Días rest.</TableHead>
                                <TableHead className="w-40 text-center">Acciones</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading ? (
                                <TableRow><TableCell colSpan={9} className="text-center py-10 text-slate-500">
                                    <Loader2 className="h-5 w-5 animate-spin inline mr-2" /> Cargando...
                                </TableCell></TableRow>
                            ) : itemsFiltrados.length === 0 ? (
                                <TableRow><TableCell colSpan={9} className="text-center py-10 text-slate-400 italic">
                                    No hay items {filtroEstado !== 'todos' ? ESTADO_LABELS[filtroEstado]?.label.toLowerCase() : ''}.
                                </TableCell></TableRow>
                            ) : (
                                itemsFiltrados.map((it) => {
                                    const dias = diasRestantes(it.expira_at);
                                    const estadoStyle = ESTADO_LABELS[it.estado] || ESTADO_LABELS.pendiente;
                                    const isPendiente = it.estado === 'pendiente';
                                    return (
                                        <TableRow
                                            key={it.id}
                                            className="hover:bg-slate-50 [&_td]:py-1.5 [&_td]:text-xs"
                                        >
                                            <TableCell className="font-mono font-semibold text-slate-700">{it.codigo || '—'}</TableCell>
                                            <TableCell className="uppercase truncate max-w-[300px]">{it.descripcion || '—'}</TableCell>
                                            <TableCell className="text-slate-600 truncate max-w-[160px]">{it.suplidor_original?.nombre || '—'}</TableCell>
                                            <TableCell className="text-center font-semibold">{Number(it.cantidad_sugerida || 0).toFixed(2)}</TableCell>
                                            <TableCell className="text-right font-mono">{it.precio_referencia != null ? Number(it.precio_referencia).toFixed(2) : '—'}</TableCell>
                                            <TableCell className="text-center text-slate-500">
                                                {new Date(it.marcado_at).toLocaleDateString('es-DO', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                                            </TableCell>
                                            <TableCell className="text-center">
                                                <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold border ${estadoStyle.color}`}>
                                                    {estadoStyle.label}
                                                </span>
                                            </TableCell>
                                            <TableCell className="text-center">
                                                {isPendiente ? (
                                                    <span className={`font-bold ${dias <= 7 ? 'text-red-600' : 'text-slate-700'}`}>
                                                        {dias != null && dias >= 0 ? `${dias}d` : 'venc.'}
                                                    </span>
                                                ) : (
                                                    <span className="text-slate-400">—</span>
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                {isPendiente && (
                                                    <div className="flex justify-center gap-1">
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            className="h-7 px-2 text-[10px] border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                                                            onClick={() => cambiarEstado(it.id, 'comprado')}
                                                            title="Marcar como comprado a otro suplidor"
                                                        >
                                                            <CheckCircle2 className="h-3 w-3 mr-1" /> Comprado
                                                        </Button>
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            className="h-7 px-2 text-[10px] border-slate-300 text-slate-700 hover:bg-slate-50"
                                                            onClick={() => cambiarEstado(it.id, 'cancelado')}
                                                            title="Cancelar y devolver disponibilidad al suplidor original"
                                                        >
                                                            <X className="h-3 w-3 mr-1" /> Cancelar
                                                        </Button>
                                                    </div>
                                                )}
                                                {it.estado === 'expirado' && (
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        className="h-7 px-2 text-[10px] text-amber-700"
                                                        onClick={async () => {
                                                            const { error } = await supabase
                                                                .from('suplidor_virtual_items')
                                                                .update({
                                                                    estado: 'pendiente',
                                                                    expira_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
                                                                    updated_at: new Date().toISOString(),
                                                                })
                                                                .eq('id', it.id);
                                                            if (error) toast({ variant: 'destructive', title: 'Error', description: error.message });
                                                            else { toast({ title: 'Reactivado', description: 'Producto bloqueado 30 días más.' }); cargar(); }
                                                        }}
                                                    >
                                                        <RotateCcw className="h-3 w-3 mr-1" /> Reactivar 30d
                                                    </Button>
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    );
                                })
                            )}
                        </TableBody>
                    </Table>
                </div>

            <p className="text-[10px] text-slate-400 mt-3 italic">
                💡 Tip: durante los 30 días que un producto está pendiente, la "Orden Automática" no lo sugerirá para su suplidor original. Si necesitas que vuelva antes, cancélalo aquí.
            </p>
        </div>
    );
}

function ResumenCard({ label, value, color }) {
    const colorMap = {
        amber: 'bg-amber-50 border-amber-200 text-amber-700',
        red: 'bg-red-50 border-red-200 text-red-700',
        emerald: 'bg-emerald-50 border-emerald-200 text-emerald-700',
        slate: 'bg-slate-50 border-slate-200 text-slate-600',
        rose: 'bg-rose-50 border-rose-200 text-rose-700',
    };
    return (
        <div className={`border rounded p-2 text-center ${colorMap[color] || colorMap.slate}`}>
            <div className="text-2xl font-bold">{value}</div>
            <div className="text-[10px] uppercase tracking-wide font-semibold">{label}</div>
        </div>
    );
}
