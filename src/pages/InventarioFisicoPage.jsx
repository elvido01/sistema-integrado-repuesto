import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Search, Printer, X, Loader2, FileSpreadsheet, MapPin } from 'lucide-react';
import { usePanels } from '@/contexts/PanelContext';
import { useCatalogData } from '@/hooks/useSupabase';
import { exportToExcel } from '@/lib/excelExport';
import SearchableSelect from '@/components/common/SearchableSelect';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import ProductFormModal from '@/components/products/ProductFormModal';
import { getCurrentDateInTimeZone, formatDateForSupabase } from '@/lib/dateUtils';

const InventarioFisicoPage = () => {
  const { empresa } = useAuth();
    const { toast } = useToast();
    const { closePanel } = usePanels();
    const { ubicaciones = [], almacenes = [] } = useCatalogData() ?? {};

    const [loading, setLoading] = useState(false);
    const [selectedUbicacion, setSelectedUbicacion] = useState('none');
    const [products, setProducts] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [editModalOpen, setEditModalOpen] = useState(false);
    const [editingProduct, setEditingProduct] = useState(null);

    const handleRowDoubleClick = useCallback(async (product) => {
        // Abrir modal inmediatamente con datos básicos
        const initial = { ...product, tipo_id: product.tipo_id?.toString() || '', marca_id: product.marca_id?.toString() || '', suplidor_id: product.suplidor_id?.toString() || '', modelos_ids: product.modelos_ids || [] };
        setEditingProduct(initial);
        setEditModalOpen(true);
        try {
            const { data, error } = await supabase
                .from('productos')
                .select('*, presentaciones(*), tipo:tipos_producto(id, nombre), marca:marcas(id, nombre), modelo:modelos(id, nombre), suplidor:proveedores(id, nombre)')
                .eq('id', product.id)
                .single();
            if (error) throw error;
            const { data: stockData } = await supabase.rpc('get_stock_actual', { producto_uuid: product.id });
            setEditingProduct({
                ...data,
                tipo_id: data.tipo?.id?.toString() || data.tipo_id?.toString() || '',
                marca_id: data.marca?.id?.toString() || data.marca_id?.toString() || '',
                modelos_ids: data.modelos_ids || (data.modelo_id ? [data.modelo_id] : []),
                suplidor_id: data.suplidor?.id?.toString() || data.suplidor_id?.toString() || '',
                existencia: stockData || 0,
            });
        } catch (err) {
            console.error('Error al cargar detalles del producto:', err);
        }
    }, []);

    const fetchInventory = useCallback(async () => {
        if (selectedUbicacion === 'none' && !searchTerm) {
            toast({ title: 'Aviso', description: 'Por favor seleccione una ubicación o ingrese un código para consultar.' });
            return;
        }

        setLoading(true);
        try {
            const { data, error } = await supabase.rpc('get_inventario_fisico', {
                p_ubicacion: selectedUbicacion,
                p_search: searchTerm
            });

            if (error) throw error;

            setProducts(data || []);
        } catch (error) {
            toast({
                variant: 'destructive',
                title: 'Error al cargar inventario',
                description: error.message,
            });
        } finally {
            setLoading(false);
        }
    }, [selectedUbicacion, searchTerm, toast]);

    const handleSaveProduct = useCallback(async (productData, presentations, isEditing) => {
        // MISMO PROCEDIMIENTO QUE ProductsPage.handleSaveProduct para no
        // alterar el sistema: el ajuste de existencia genera una Entrada o
        // Salida real (con secuencia EM/SA) en vez de un movimiento AJUSTE
        // suelto. Esto mantiene la trazabilidad consistente entre módulos.
        try {
            const parseNumeric = (v) => {
                const n = parseFloat(v);
                return isNaN(n) ? 0 : n;
            };

            const { existencia, ...productDataWithoutStock } = productData;
            const productPayload = {
                ...productDataWithoutStock,
                costo: parseNumeric(productData.costo),
                precio: parseNumeric(productData.precio),
                itbis_pct: parseNumeric(productData.itbis_pct),
                min_stock: parseNumeric(productData.min_stock),
                max_stock: parseNumeric(productData.max_stock),
                garantia_meses: parseInt(productData.garantia_meses, 10) || 0,
            };

            let savedProduct = null;

            if (isEditing) {
                const { id, ...updateData } = productPayload;
                const { data, error } = await supabase
                    .from('productos')
                    .update(updateData)
                    .eq('id', id)
                    .select()
                    .single();
                if (error) throw error;
                savedProduct = data;
            } else {
                // Esta página normalmente solo edita, pero soportamos crear por seguridad.
                delete productPayload.id;
                const { data, error } = await supabase
                    .from('productos')
                    .insert(productPayload)
                    .select()
                    .single();
                if (error) throw error;
                savedProduct = data;
            }

            if (savedProduct) {
                // Presentaciones: mismo patrón keep/delete que ProductsPage
                if (isEditing) {
                    const keepIds = (presentations || [])
                        .map(p => p.id)
                        .filter(id => id && !id.toString().startsWith('new-'));

                    let deleteQuery = supabase
                        .from('presentaciones')
                        .delete()
                        .eq('producto_id', savedProduct.id);

                    if (keepIds.length > 0) {
                        deleteQuery = deleteQuery.not('id', 'in', `(${keepIds.join(',')})`);
                    }
                    const { error: delError } = await deleteQuery;
                    if (delError) console.error('Error eliminando presentaciones:', delError);
                }

                if (presentations && presentations.length > 0) {
                    const presentationsToUpsert = presentations.map((p) => {
                        const { id, ...rest } = p;
                        const presentationPayload = {
                            ...rest,
                            producto_id: savedProduct.id,
                            cantidad: parseNumeric(p.cantidad),
                            costo: parseNumeric(p.costo),
                            margen_pct: parseNumeric(p.margen_pct),
                            precio1: parseNumeric(p.precio1),
                            descuento_pct: parseNumeric(p.descuento_pct),
                            precio_final: parseNumeric(p.precio_final),
                        };
                        if (id && !id.toString().startsWith('new-')) {
                            presentationPayload.id = id;
                        }
                        return presentationPayload;
                    });

                    const { error: presError } = await supabase.from('presentaciones').upsert(presentationsToUpsert);
                    if (presError) throw presError;
                }

                // Ajuste de inventario: crear ENTRADA o SALIDA real según diferencia
                const currentExistencia = editingProduct?.existencia || 0;
                const newExistencia = existencia || 0;
                const diff = parseFloat(newExistencia) - parseFloat(currentExistencia);

                if (Math.abs(diff) > 0.001) {
                    const almacenId = almacenes[0]?.id;
                    if (!almacenId) {
                        toast({
                            variant: 'destructive',
                            title: 'Falta el Almacén Principal',
                            description: 'Se guardó la mercancía, pero no se generó el ajuste porque no existe almacén. Crea el Almacén Principal en Inventario → Almacenes.',
                        });
                        setEditModalOpen(false);
                        setEditingProduct(null);
                        fetchInventory();
                        return;
                    }

                    const mainPresentation = (presentations || []).find(p => p.afecta_ft) || (presentations || [])[0];
                    const unitToUse = mainPresentation ? mainPresentation.tipo : 'UND - Unidad';

                    if (diff > 0) {
                        const { data: numData } = await supabase.rpc('get_next_entrada_numero');
                        const entradaData = {
                            numero: numData,
                            fecha: formatDateForSupabase(getCurrentDateInTimeZone()),
                            referencia: `AJUSTE DESDE INVENTARIO FÍSICO`,
                            concepto: 'AJUSTE DE INVENTARIO',
                            almacen_id: almacenId,
                            notas: `Ajuste desde Inventario Físico por Ubicación, producto ${savedProduct.codigo}`,
                            total_costo: (diff * savedProduct.costo) || 0,
                        };
                        const detallesData = [{
                            producto_id: savedProduct.id,
                            codigo: savedProduct.codigo,
                            descripcion: savedProduct.descripcion,
                            cantidad: diff,
                            unidad: unitToUse,
                            costo_unitario: savedProduct.costo || 0,
                            importe: (diff * savedProduct.costo) || 0,
                        }];

                        const { error: entError } = await supabase.rpc('crear_entrada_inventario', {
                            p_entrada_data: entradaData,
                            p_detalles_data: detallesData,
                            p_tipo_movimiento: 'AJUSTE',
                        });

                        if (entError) {
                            console.error('Error creating auto entrada:', entError);
                            toast({ variant: 'destructive', title: 'Advertencia', description: 'Se guardó la mercancía pero falló el ajuste automático de entrada.' });
                        } else {
                            toast({ title: 'Ajuste automático', description: `Se autogeneró una Entrada de Mercancía (${numData}) por +${diff} uds.` });
                        }
                    } else {
                        const absDiff = Math.abs(diff);
                        const { data: numData } = await supabase.rpc('get_next_salida_numero');
                        const salidaData = {
                            numero: numData,
                            fecha: formatDateForSupabase(getCurrentDateInTimeZone()),
                            referencia: `AJUSTE DESDE INVENTARIO FÍSICO`,
                            concepto: 'AJUSTE DE SALIDA',
                            almacen_id: almacenId,
                            notas: `Ajuste desde Inventario Físico por Ubicación, producto ${savedProduct.codigo}`,
                            total_costo: (absDiff * savedProduct.costo) || 0,
                        };
                        const detallesData = [{
                            producto_id: savedProduct.id,
                            codigo: savedProduct.codigo,
                            descripcion: savedProduct.descripcion,
                            cantidad: absDiff,
                            unidad: unitToUse,
                            costo_unitario: savedProduct.costo || 0,
                            importe: (absDiff * savedProduct.costo) || 0,
                        }];

                        const { error: salError } = await supabase.rpc('crear_salida_inventario', {
                            p_salida_data: salidaData,
                            p_detalles_data: detallesData,
                            p_tipo_movimiento: 'AJUSTE',
                        });

                        if (salError) {
                            console.error('Error creating auto salida:', salError);
                            toast({ variant: 'destructive', title: 'Advertencia', description: 'Se guardó la mercancía pero falló el ajuste automático de salida.' });
                        } else {
                            toast({ title: 'Ajuste automático', description: `Se autogeneró una Salida de Mercancía (${numData}) por -${absDiff} uds.` });
                        }
                    }
                } else {
                    toast({ title: 'Producto actualizado', description: 'Los cambios se guardaron correctamente.' });
                }
            }

            setEditModalOpen(false);
            setEditingProduct(null);
            fetchInventory();
        } catch (err) {
            toast({ variant: 'destructive', title: 'Error', description: err.message });
        }
    }, [toast, fetchInventory, editingProduct, almacenes]);

    const filteredProducts = products;

    const handleExport = () => {
        if (filteredProducts.length === 0) {
            toast({ title: 'Aviso', description: 'No hay datos para exportar.' });
            return;
        }

        const dataToExport = filteredProducts.map(p => ({
            'Código': p.codigo,
            'Descripción': p.descripcion,
            'Referencia': p.referencia,
            'Ubicación': p.ubicacion,
            'Existencia': p.existencia
        }));

        exportToExcel(dataToExport, `Inventario_Fisico_${selectedUbicacion}`);
    };

    const handlePrint = () => {
        if (filteredProducts.length === 0) {
            toast({ title: 'Aviso', description: 'No hay datos para imprimir.' });
            return;
        }

        const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Inventario Físico - ${selectedUbicacion}</title>
        <style>
          body { font-family: Arial, sans-serif; font-size: 12px; margin: 20px; }
          .header { text-align: center; margin-bottom: 20px; border-bottom: 2px solid #000; padding-bottom: 10px; }
          .header h1 { margin: 0; font-size: 18px; }
          .info { margin-bottom: 10px; font-weight: bold; }
          table { width: 100%; border-collapse: collapse; margin-top: 10px; }
          th, td { border: 1px solid #ccc; padding: 6px; text-align: left; }
          th { background-color: #f2f2f2; }
          .text-right { text-align: right; }
          @media print {
            .no-print { display: none; }
          }
        </style>
      </head>
      <body onload="window.print()">
        <div class="header">
          <h1>MotoFlow</h1>
          <p>Inventario Físico por Ubicación</p>
        </div>
        <div class="info">
          Ubicación: ${selectedUbicacion === 'all' ? 'TODAS' : selectedUbicacion}<br/>
          Fecha: ${new Date().toLocaleDateString()}<br/>
          Artículos: ${filteredProducts.length}
        </div>
        <table>
          <thead>
            <tr>
              <th>CÓDIGO</th>
              <th>DESCRIPCIÓN</th>
              <th>REFERENCIA</th>
              <th>UBICACIÓN</th>
              <th class="text-right">EXISTENCIA</th>
            </tr>
          </thead>
          <tbody>
            ${filteredProducts.map(p => `
              <tr>
                <td>${p.codigo}</td>
                <td>${p.descripcion}</td>
                <td>${p.referencia || 'N/A'}</td>
                <td>${p.ubicacion}</td>
                <td class="text-right">${p.existencia}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </body>
      </html>
    `;

        const printWindow = window.open('', '_blank');
        printWindow.document.write(html);
        printWindow.document.close();
    };

    const totals = useMemo(() => {
        return filteredProducts.reduce((acc, p) => acc + (p.existencia || 0), 0);
    }, [filteredProducts]);

    return (
        <>
            <Helmet>
                <title>Inventario Físico por Ubicación — {empresa?.nombre || 'Sistema'}</title>
            </Helmet>

            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-4 bg-gray-100 min-h-full flex flex-col"
            >
                <div className="bg-white p-6 rounded-lg shadow-md flex-grow flex flex-col">
                    {/* Header */}
                    <div className="bg-morla-blue text-white text-center py-3 rounded-t-lg mb-6">
                        <h1 className="text-white text-2xl font-bold uppercase tracking-tight">
                            Inventario Físico por Ubicación
                        </h1>
                    </div>

                    {/* Filters Area */}
                    <div className="flex flex-col md:flex-row gap-4 mb-6 p-4 border border-slate-200 rounded-lg bg-slate-50/50 items-end">
                        <div className="flex-1 space-y-2">
                            <Label className="text-slate-600 font-semibold flex items-center gap-2">
                                <MapPin className="w-4 h-4" /> Seleccionar Ubicación
                            </Label>
                            <SearchableSelect
                                placeholder="--- BUSCAR UBICACIÓN ---"
                                allowCustomValue
                                options={[
                                    { value: 'none', label: '--- SELECCIONE UBICACIÓN ---' },
                                    { value: 'all', label: '--- TODAS LAS UBICACIONES ---' },
                                    ...ubicaciones.map(a => ({ value: a.nombre, label: a.nombre }))
                                ]}
                                value={selectedUbicacion}
                                onChange={setSelectedUbicacion}
                            />
                        </div>

                        <div className="flex-1 space-y-2">
                            <Label className="text-slate-600 font-semibold">Buscar en Resultados</Label>
                            <div className="relative">
                                <Search className="absolute left-2 top-2.5 h-4 w-4 text-slate-400" />
                                <input
                                    type="text"
                                    placeholder="Código, descripción o referencia..."
                                    className="w-full pl-8 pr-4 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-morla-blue/50 text-sm"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && fetchInventory()}
                                />
                            </div>
                        </div>

                        <div className="flex gap-2">
                            <Button onClick={fetchInventory} disabled={loading} className="bg-morla-blue hover:bg-morla-blue/90 text-white font-bold">
                                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />} CONSULTAR
                            </Button>
                        </div>
                    </div>

                    {/* Table Area */}
                    <ScrollArea className="flex-grow border border-slate-200 rounded-lg bg-white overflow-hidden">
                        <Table>
                            <TableHeader className="bg-slate-100 sticky top-0 z-10 border-b">
                                <TableRow>
                                    <TableHead className="font-bold text-slate-700 w-[150px]">CÓDIGO</TableHead>
                                    <TableHead className="font-bold text-slate-700">DESCRIPCIÓN</TableHead>
                                    <TableHead className="font-bold text-slate-700">REFERENCIA</TableHead>
                                    <TableHead className="font-bold text-slate-700 w-[150px]">UBICACIÓN</TableHead>
                                    <TableHead className="font-bold text-slate-700 text-right w-[120px]">EXISTENCIA</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {loading ? (
                                    <TableRow>
                                        <TableCell colSpan={5} className="text-center h-64">
                                            <div className="flex flex-col items-center gap-2">
                                                <Loader2 className="h-8 w-8 animate-spin text-morla-blue" />
                                                <span className="text-slate-500 font-medium">Cargando inventario...</span>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ) : filteredProducts.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={5} className="text-center h-64 text-slate-400 italic">
                                            {selectedUbicacion === 'none' && !searchTerm
                                                ? 'Seleccione una ubicación o ingrese un código y presione CONSULTAR.'
                                                : 'No se encontraron artículos para esta consulta.'}
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    filteredProducts.map((p) => (
                                        <TableRow key={p.id} className="hover:bg-slate-50 transition-colors cursor-pointer" onDoubleClick={() => handleRowDoubleClick(p)}>
                                            <TableCell className="font-mono text-xs font-semibold">{p.codigo}</TableCell>
                                            <TableCell className="uppercase text-xs">{p.descripcion}</TableCell>
                                            <TableCell className="text-xs text-slate-500">{p.referencia || '---'}</TableCell>
                                            <TableCell className="text-xs font-medium text-blue-700">{p.ubicacion}</TableCell>
                                            <TableCell className="text-right font-bold text-sm text-green-700">{p.existencia}</TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                            {filteredProducts.length > 0 && !loading && (
                                <TableFooter className="bg-slate-100 font-bold sticky bottom-0 z-10 border-t">
                                    <TableRow>
                                        <TableCell colSpan={4} className="text-right uppercase text-slate-600">Total Artículos: {filteredProducts.length} | Existencia Total →</TableCell>
                                        <TableCell className="text-right text-morla-blue text-lg">{totals}</TableCell>
                                    </TableRow>
                                </TableFooter>
                            )}
                        </Table>
                    </ScrollArea>

                    {/* Actions Area */}
                    <div className="mt-6 flex flex-wrap justify-end items-center gap-3 pt-4 border-t border-slate-200">
                        <Button variant="outline" onClick={handleExport} disabled={loading || filteredProducts.length === 0} className="border-green-600 text-green-700 hover:bg-green-50">
                            <FileSpreadsheet className="mr-2 h-4 w-4" /> EXCEL (F6)
                        </Button>
                        <Button variant="outline" onClick={handlePrint} disabled={loading || filteredProducts.length === 0} className="border-morla-blue text-morla-blue hover:bg-blue-50">
                            <Printer className="mr-2 h-4 w-4" /> IMPRIMIR (F5)
                        </Button>
                        <Button variant="ghost" onClick={() => closePanel('inventario-fisico')} className="text-slate-500 hover:bg-slate-100">
                            <X className="mr-2 h-4 w-4" /> ESC - SALIR
                        </Button>
                    </div>
                </div>
            </motion.div>

            <ProductFormModal
                isOpen={editModalOpen}
                onClose={() => { setEditModalOpen(false); setEditingProduct(null); }}
                onSave={handleSaveProduct}
                product={editingProduct}
            />
        </>
    );
};

export default InventarioFisicoPage;
