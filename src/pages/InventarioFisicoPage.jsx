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

const InventarioFisicoPage = () => {
    const { toast } = useToast();
    const { closePanel } = usePanels();
    const { almacenes = [] } = useCatalogData() ?? {};

    const [loading, setLoading] = useState(false);
    const [selectedUbicacion, setSelectedUbicacion] = useState('none');
    const [products, setProducts] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');

    const fetchInventory = useCallback(async () => {
        if (selectedUbicacion === 'none' && !searchTerm) {
            toast({ title: 'Aviso', description: 'Por favor seleccione una ubicación o ingrese un código para consultar.' });
            return;
        }

        setLoading(true);
        try {
            let query = supabase
                .from('productos')
                .select('id, codigo, descripcion, referencia, ubicacion, activo')
                .eq('activo', true);

            if (selectedUbicacion !== 'none' && selectedUbicacion !== 'all') {
                // Usamos ilike para mayor flexibilidad con los nombres de ubicación
                query = query.ilike('ubicacion', `%${selectedUbicacion}%`);
            }

            if (searchTerm) {
                query = query.or(`codigo.ilike.%${searchTerm}%,descripcion.ilike.%${searchTerm}%,referencia.ilike.%${searchTerm}%`);
            }

            const { data, error } = await query.order('codigo');

            if (error) throw error;

            // Fetch stock for each product
            const productsWithStock = await Promise.all(
                (data || []).map(async (p) => {
                    const { data: stock } = await supabase.rpc('get_stock_actual', { producto_uuid: p.id });
                    return {
                        ...p,
                        existencia: stock || 0
                    };
                })
            );

            setProducts(productsWithStock);
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
          <h1>REPUESTOS MORLA</h1>
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
                <title>Inventario Físico por Ubicación - Repuestos Morla</title>
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
                                options={[
                                    { value: 'none', label: '--- SELECCIONE UBICACIÓN ---' },
                                    { value: 'all', label: '--- TODAS LAS UBICACIONES ---' },
                                    ...almacenes.map(a => ({ value: a.nombre, label: a.nombre }))
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
                                        <TableRow key={p.id} className="hover:bg-slate-50 transition-colors">
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
        </>
    );
};

export default InventarioFisicoPage;
