import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet';
import { addDays, differenceInCalendarDays } from 'date-fns';
import {
  AlertTriangle,
  BellRing,
  Clock,
  DollarSign,
  Loader2,
  PackageX,
  RefreshCw,
  ShieldAlert,
  TrendingDown,
} from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useToast } from '@/components/ui/use-toast';
import { useCatalogData } from '@/hooks/useSupabase';
import { getCurrentDateInTimeZone, formatDateForSupabase } from '@/lib/dateUtils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import ProductFormModal from '@/components/products/ProductFormModal';

const money = (value) => Number(value || 0).toLocaleString('es-DO', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const pct = (value) => `${Number(value || 0).toFixed(2)}%`;

const toDateOnly = (value) => {
  if (!value) return null;
  const d = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
};

const severityRank = { critica: 0, alta: 1, media: 2, baja: 3 };

const AlertasGerencialesPage = () => {
  const { empresa, tenantId } = useAuth();
  const { toast } = useToast();
  const { almacenes = [] } = useCatalogData() ?? {};
  const [loading, setLoading] = useState(true);
  const [productLoading, setProductLoading] = useState(false);
  const [productos, setProductos] = useState([]);
  const [movimientos, setMovimientos] = useState([]);
  const [facturasPendientes, setFacturasPendientes] = useState([]);
  const [comprasPendientes, setComprasPendientes] = useState([]);
  const [pagosSuplidoresDetalle, setPagosSuplidoresDetalle] = useState([]);
  const [pagosSuplidores, setPagosSuplidores] = useState([]);
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [lastSync, setLastSync] = useState(null);

  const cargar = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const [productosRes, movRes, facturasRes, comprasRes, pagosDetalleRes, pagosRes] = await Promise.all([
        supabase
          .from('productos')
          .select('id, codigo, descripcion, costo, precio, min_stock, max_stock, activo, presentaciones(*)')
          .eq('activo', true)
          .order('codigo', { ascending: true })
          .limit(2500),
        supabase
          .from('inventario_movimientos')
          .select('producto_id, cantidad, fecha, tipo')
          .order('fecha', { ascending: false })
          .limit(50000),
        supabase
          .from('facturas')
          .select('id, numero, fecha, dias_credito, total, monto_pendiente, clientes(nombre)')
          .eq('estado', 'PENDIENTE')
          .gt('monto_pendiente', 0)
          .order('fecha', { ascending: true })
          .limit(300),
        supabase
          .from('compras')
          .select('id, numero, referencia, fecha, dias_credito, total_compra, monto_pendiente, monto_pagado, estado, suplidor_id, proveedores(nombre)')
          .ilike('forma_pago', 'CREDITO')
          .order('fecha', { ascending: true })
          .limit(300),
        supabase
          .from('pagos_suplidores_detalle')
          .select('pago_id, compra_id, monto_abonado, pagos_suplidores!inner(anulado)')
          .eq('pagos_suplidores.anulado', false)
          .limit(10000),
        supabase
          .from('pagos_suplidores')
          .select('id, suplidor_id, monto_pagado, anulado')
          .eq('anulado', false)
          .limit(10000),
      ]);

      if (productosRes.error) throw productosRes.error;
      if (movRes.error) throw movRes.error;
      if (facturasRes.error) throw facturasRes.error;
      if (comprasRes.error) throw comprasRes.error;
      if (pagosDetalleRes.error) throw pagosDetalleRes.error;
      if (pagosRes.error) throw pagosRes.error;

      setProductos(productosRes.data || []);
      setMovimientos(movRes.data || []);
      setFacturasPendientes(facturasRes.data || []);
      setComprasPendientes(comprasRes.data || []);
      setPagosSuplidoresDetalle(pagosDetalleRes.data || []);
      setPagosSuplidores(pagosRes.data || []);
      setLastSync(new Date());
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'No se pudieron cargar las alertas',
        description: error.message,
      });
    } finally {
      setLoading(false);
    }
  }, [tenantId, toast]);

  const abrirProducto = useCallback(async (productoId) => {
    if (!productoId) return;
    setProductLoading(true);
    try {
      const { data, error } = await supabase
        .from('productos')
        .select('*, presentaciones(*)')
        .eq('id', productoId)
        .single();
      if (error) throw error;

      const { data: stockData } = await supabase.rpc('get_stock_actual', { producto_uuid: productoId });
      setSelectedProduct({ ...data, existencia: stockData || 0 });
      setIsProductModalOpen(true);
    } catch (error) {
      toast({ variant: 'destructive', title: 'No se pudo abrir la mercancía', description: error.message });
    } finally {
      setProductLoading(false);
    }
  }, [toast]);

  const handleSaveProduct = useCallback(async (productData, presentations, isEditing) => {
    try {
      let savedProduct;
      const parseNumeric = (value) => {
        const parsed = parseFloat(value);
        return isNaN(parsed) ? 0 : parsed;
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

      if (!isEditing) delete productPayload.id;

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
        toast({ title: 'Éxito', description: 'Producto actualizado correctamente.' });
      } else {
        const { data, error } = await supabase.from('productos').insert(productPayload).select().single();
        if (error) throw error;
        savedProduct = data;
        toast({ title: 'Éxito', description: 'Producto creado correctamente.' });
      }

      if (savedProduct) {
        const keepIds = presentations
          .map(p => p.id)
          .filter(id => id && !id.toString().startsWith('new-'));

        if (isEditing) {
          let deleteQuery = supabase.from('presentaciones').delete().eq('producto_id', savedProduct.id);
          if (keepIds.length > 0) deleteQuery = deleteQuery.not('id', 'in', `(${keepIds.join(',')})`);
          const { error: delError } = await deleteQuery;
          if (delError) console.error('Error eliminando presentaciones:', delError);
        }

        if (presentations.length > 0) {
          const presentationsToUpsert = presentations.map((p) => {
            const { id, ...rest } = p;
            const presentationPayload = {
              ...rest,
              producto_id: savedProduct.id,
              cantidad: parseNumeric(p.cantidad),
              costo: parseNumeric(p.costo),
              margen_pct: parseNumeric(p.margen_pct),
              precio1: parseNumeric(p.precio1),
              precio2: parseNumeric(p.precio2),
              precio3: parseNumeric(p.precio3),
              descuento_pct: parseNumeric(p.descuento_pct),
              precio_final: parseNumeric(p.precio_final),
            };
            if (id && !id.toString().startsWith('new-')) presentationPayload.id = id;
            return presentationPayload;
          });

          const { error: presError } = await supabase.from('presentaciones').upsert(presentationsToUpsert);
          if (presError) throw presError;
        }

        const currentExistencia = selectedProduct?.existencia || 0;
        const newExistencia = productData.existencia || 0;
        const diff = parseFloat(newExistencia) - parseFloat(currentExistencia);

        if (Math.abs(diff) > 0.001) {
          const almacenId = almacenes[0]?.id;
          if (!almacenId) {
            toast({
              variant: 'destructive',
              title: 'Falta el Almacén Principal',
              description: 'La mercancía se guardó, pero no se pudo generar el ajuste de inventario.',
            });
            setIsProductModalOpen(false);
            cargar();
            return;
          }

          const mainPresentation = presentations.find(p => p.afecta_ft) || presentations[0];
          const unitToUse = mainPresentation ? mainPresentation.tipo : 'UND - Unidad';

          if (diff > 0) {
            const { data: numData } = await supabase.rpc('get_next_entrada_numero');
            const entradaData = {
              numero: numData,
              fecha: formatDateForSupabase(getCurrentDateInTimeZone()),
              referencia: 'AJUSTE DESDE ALERTA',
              concepto: 'AJUSTE DE INVENTARIO',
              almacen_id: almacenId,
              notas: `Ajuste automático creado desde Alertas Gerenciales para ${savedProduct.codigo}`,
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
            if (entError) toast({ variant: 'destructive', title: 'Advertencia', description: 'Se guardó la mercancía pero falló el ajuste de entrada.' });
          } else {
            const absDiff = Math.abs(diff);
            const { data: numData } = await supabase.rpc('get_next_salida_numero');
            const salidaData = {
              numero: numData,
              fecha: formatDateForSupabase(getCurrentDateInTimeZone()),
              referencia: 'AJUSTE DESDE ALERTA',
              concepto: 'AJUSTE DE SALIDA',
              almacen_id: almacenId,
              notas: `Ajuste automático creado desde Alertas Gerenciales para ${savedProduct.codigo}`,
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
            if (salError) toast({ variant: 'destructive', title: 'Advertencia', description: 'Se guardó la mercancía pero falló el ajuste de salida.' });
          }
        }
      }

      setIsProductModalOpen(false);
      setSelectedProduct(null);
      cargar();
    } catch (error) {
      toast({ variant: 'destructive', title: 'Error al guardar el producto', description: error.message });
    }
  }, [almacenes, cargar, selectedProduct?.existencia, toast]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const stockPorProducto = useMemo(() => {
    return movimientos.reduce((acc, mov) => {
      acc[mov.producto_id] = (acc[mov.producto_id] || 0) + Number(mov.cantidad || 0);
      return acc;
    }, {});
  }, [movimientos]);

  const ultimaSalidaPorProducto = useMemo(() => {
    return movimientos.reduce((acc, mov) => {
      if (Number(mov.cantidad || 0) >= 0) return acc;
      const fecha = new Date(mov.fecha);
      if (!acc[mov.producto_id] || fecha > acc[mov.producto_id]) acc[mov.producto_id] = fecha;
      return acc;
    }, {});
  }, [movimientos]);

  const pagosPorCompra = useMemo(() => {
    return pagosSuplidoresDetalle.reduce((acc, detalle) => {
      acc[detalle.compra_id] = (acc[detalle.compra_id] || 0) + Number(detalle.monto_abonado || 0);
      return acc;
    }, {});
  }, [pagosSuplidoresDetalle]);

  const pagosDetallePorPago = useMemo(() => {
    return pagosSuplidoresDetalle.reduce((acc, detalle) => {
      acc[detalle.pago_id] = (acc[detalle.pago_id] || 0) + Number(detalle.monto_abonado || 0);
      return acc;
    }, {});
  }, [pagosSuplidoresDetalle]);

  const pagosGeneralesPorSuplidor = useMemo(() => {
    return pagosSuplidores.reduce((acc, pago) => {
      const montoSinDetalle = Math.max(0, Number(pago.monto_pagado || 0) - Number(pagosDetallePorPago[pago.id] || 0));
      if (montoSinDetalle <= 0) return acc;
      acc[pago.suplidor_id] = (acc[pago.suplidor_id] || 0) + montoSinDetalle;
      return acc;
    }, {});
  }, [pagosSuplidores, pagosDetallePorPago]);

  const alertas = useMemo(() => {
    const hoy = new Date();
    const precio2Desc = Number(empresa?.precio2_descuento_pct ?? 10);
    const precio3Desc = Number(empresa?.precio3_descuento_pct ?? 15);

    const items = [];

    productos.forEach(producto => {
      const stock = Number(stockPorProducto[producto.id] || 0);
      const minStock = Number(producto.min_stock || 0);
      const maxStock = Number(producto.max_stock || 0);
      const presentaciones = producto.presentaciones?.length ? producto.presentaciones : [];

      presentaciones.forEach(pres => {
        const costo = Number(pres.costo || producto.costo || 0);
        const precio1 = Number(pres.precio1 || producto.precio || 0);
        const precio2 = Number(pres.precio2 || 0);
        const precio3 = Number(pres.precio3 || 0);
        const descuento = Number(pres.descuento_pct || 0);
        const precioFinal = precio1 * (1 - descuento / 100);
        const utilidad = precioFinal - costo;
        const margenReal = precioFinal > 0 ? (utilidad / precioFinal) * 100 : 0;

        if (pres.auto_precio2 && precio2 > 0 && precio2 < costo) {
          items.push({
            id: `p2-${producto.id}-${pres.id}`,
            productoId: producto.id,
            tipo: 'Precios',
            severidad: 'critica',
            titulo: 'P2 por debajo del costo',
            detalle: `${producto.codigo} - ${producto.descripcion}`,
            impacto: `P2 RD$ ${money(precio2)} vs costo RD$ ${money(costo)}. Pierde RD$ ${money(costo - precio2)}.`,
            accion: `Reducir descuento P2 por debajo de ${pct(Math.max(0, (1 - costo / Math.max(precio1, 1)) * 100))} o subir P1.`,
          });
        }

        if (pres.auto_precio3 && precio3 > 0 && precio3 < costo) {
          items.push({
            id: `p3-${producto.id}-${pres.id}`,
            productoId: producto.id,
            tipo: 'Precios',
            severidad: 'critica',
            titulo: 'P3 por debajo del costo',
            detalle: `${producto.codigo} - ${producto.descripcion}`,
            impacto: `P3 RD$ ${money(precio3)} vs costo RD$ ${money(costo)}. Pierde RD$ ${money(costo - precio3)}.`,
            accion: `Reducir descuento P3 por debajo de ${pct(Math.max(0, (1 - costo / Math.max(precio1, 1)) * 100))} o subir P1.`,
          });
        }

        if (precioFinal > 0 && costo > 0 && margenReal < 10) {
          items.push({
            id: `margen-${producto.id}-${pres.id}`,
            productoId: producto.id,
            tipo: 'Precios',
            severidad: margenReal < 3 ? 'critica' : 'alta',
            titulo: 'Margen real bajo',
            detalle: `${producto.codigo} - ${producto.descripcion}`,
            impacto: `Ganancia RD$ ${money(utilidad)} | margen real ${pct(margenReal)}.`,
            accion: 'Revisar costo reciente, descuento y precio de lista.',
          });
        }
      });

      if (stock <= 0) {
        items.push({
          id: `stock-cero-${producto.id}`,
          productoId: producto.id,
          tipo: 'Inventario',
          severidad: 'alta',
          titulo: 'Mercancia agotada',
          detalle: `${producto.codigo} - ${producto.descripcion}`,
          impacto: 'No hay existencia disponible para vender.',
          accion: 'Revisar orden de compra o suplidor principal.',
        });
      } else if (minStock > 0 && stock <= minStock) {
        items.push({
          id: `stock-bajo-${producto.id}`,
          productoId: producto.id,
          tipo: 'Inventario',
          severidad: 'media',
          titulo: 'Stock bajo',
          detalle: `${producto.codigo} - ${producto.descripcion}`,
          impacto: `Existencia ${stock} | minimo ${minStock}.`,
          accion: 'Preparar reposicion antes de quedarse sin venta.',
        });
      }

      const ultimaSalida = ultimaSalidaPorProducto[producto.id];
      const diasSinVenta = ultimaSalida ? differenceInCalendarDays(hoy, ultimaSalida) : 999;
      if (stock > 0 && diasSinVenta >= 90) {
        items.push({
          id: `lento-${producto.id}`,
          productoId: producto.id,
          tipo: 'Inventario',
          severidad: maxStock > 0 && stock > maxStock ? 'alta' : 'media',
          titulo: 'Mercancia lenta',
          detalle: `${producto.codigo} - ${producto.descripcion}`,
          impacto: ultimaSalida ? `${diasSinVenta} dias sin salida. Existencia ${stock}.` : `Sin salida en los ultimos 180 dias. Existencia ${stock}.`,
          accion: 'Evaluar promocion, transferencia o no reponer.',
        });
      }

      if (maxStock > 0 && stock > maxStock) {
        items.push({
          id: `sobrestock-${producto.id}`,
          productoId: producto.id,
          tipo: 'Inventario',
          severidad: 'media',
          titulo: 'Sobreinventario',
          detalle: `${producto.codigo} - ${producto.descripcion}`,
          impacto: `Existencia ${stock} | maximo ${maxStock}.`,
          accion: 'Evitar nueva compra hasta normalizar rotacion.',
        });
      }
    });

    facturasPendientes.forEach(factura => {
      const fecha = toDateOnly(factura.fecha);
      const vence = fecha ? addDays(fecha, Number(factura.dias_credito || 0)) : null;
      const dias = vence ? differenceInCalendarDays(hoy, vence) : 0;
      if (dias > 0) {
        items.push({
          id: `cxcorar-${factura.id}`,
          tipo: 'Cobros',
          severidad: dias > 15 ? 'alta' : 'media',
          titulo: 'Factura por cobrar vencida',
          detalle: `${factura.numero} - ${factura.clientes?.nombre || 'Cliente'}`,
          impacto: `Vencida hace ${dias} dias. Pendiente RD$ ${money(factura.monto_pendiente)}.`,
          accion: 'Gestionar cobro antes de vender mas credito.',
        });
      }
    });

    const comprasParaAlertar = comprasPendientes
      .map(compra => {
        const total = Number(compra.total_compra || 0);
        const pagadoDirecto = Math.max(Number(compra.monto_pagado || 0), Number(pagosPorCompra[compra.id] || 0));
        const pendienteDirecto = Math.max(0, total - pagadoDirecto);
        const pendienteGuardado = Math.max(0, Number(compra.monto_pendiente ?? pendienteDirecto));
        const pendienteBase = Math.min(pendienteGuardado, pendienteDirecto);

        return { ...compra, pendienteBase, pendienteReal: pendienteBase };
      })
      .sort((a, b) => new Date(a.fecha || 0) - new Date(b.fecha || 0));

    const pagosGeneralesRestantes = { ...pagosGeneralesPorSuplidor };
    comprasParaAlertar.forEach(compra => {
      if (compra.pendienteBase <= 0.01 || !compra.suplidor_id) return;
      const disponible = Number(pagosGeneralesRestantes[compra.suplidor_id] || 0);
      if (disponible <= 0) return;
      const aplicado = Math.min(disponible, compra.pendienteBase);
      compra.pendienteReal = Math.max(0, compra.pendienteBase - aplicado);
      pagosGeneralesRestantes[compra.suplidor_id] = disponible - aplicado;
    });

    comprasParaAlertar.forEach(compra => {
      const total = Number(compra.total_compra || 0);
      const pendienteReal = Number(compra.pendienteReal || 0);
      const estadoPagado = String(compra.estado || '').toUpperCase() === 'PAGADA';
      if (total <= 0) return;
      if (estadoPagado || pendienteReal <= 0.01) return;
      const fecha = toDateOnly(compra.fecha);
      const vence = fecha ? addDays(fecha, Number(compra.dias_credito || 0)) : null;
      const dias = vence ? differenceInCalendarDays(hoy, vence) : 0;
      if (dias > 0) {
        items.push({
          id: `cxp-${compra.id}`,
          tipo: 'Pagos',
          severidad: dias > 15 ? 'alta' : 'media',
          titulo: 'Cuenta por pagar vencida',
          detalle: `${compra.numero || compra.referencia || 'Compra'} - ${compra.proveedores?.nombre || 'Suplidor'}`,
          impacto: `Vencida hace ${dias} dias. Pendiente RD$ ${money(pendienteReal)}.`,
          accion: 'Priorizar pago o negociar plazo con suplidor.',
        });
      }
    });

    return items.sort((a, b) => {
      const sev = severityRank[a.severidad] - severityRank[b.severidad];
      if (sev !== 0) return sev;
      return a.tipo.localeCompare(b.tipo);
    });
  }, [productos, stockPorProducto, ultimaSalidaPorProducto, facturasPendientes, comprasPendientes, pagosPorCompra, pagosGeneralesPorSuplidor, empresa]);

  const resumen = useMemo(() => {
    const base = { critica: 0, alta: 0, media: 0, baja: 0 };
    alertas.forEach(a => { base[a.severidad] += 1; });
    return base;
  }, [alertas]);

  const grupos = useMemo(() => {
    return ['Precios', 'Inventario', 'Cobros', 'Pagos'].map(tipo => ({
      tipo,
      alertas: alertas.filter(a => a.tipo === tipo).slice(0, 12),
    }));
  }, [alertas]);

  return (
    <>
      <Helmet><title>Alertas Gerenciales - {empresa?.nombre || 'Sistema'}</title></Helmet>
      <div className="h-full overflow-y-auto bg-slate-50 p-4 space-y-4">
        <div className="bg-white border rounded-lg p-4 shadow-sm">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
            <div>
              <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                <BellRing className="w-5 h-5 text-blue-600" /> Centro de Alertas Gerenciales
              </h1>
              <p className="text-xs text-slate-500 mt-1">
                Señales accionables para proteger margen, inventario y flujo de caja.
              </p>
            </div>
            <div className="flex items-center gap-2">
              {lastSync && <span className="text-[11px] text-slate-500">Actualizado {lastSync.toLocaleTimeString('es-DO')}</span>}
              {productLoading && <span className="text-[11px] text-blue-600 font-bold">Abriendo mercancía...</span>}
              <Button variant="outline" className="h-9" onClick={cargar} disabled={loading}>
                {loading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <RefreshCw className="w-4 h-4 mr-1" />}
                Actualizar
              </Button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Metric label="Criticas" value={resumen.critica} tone="red" icon={ShieldAlert} />
          <Metric label="Altas" value={resumen.alta} tone="amber" icon={AlertTriangle} />
          <Metric label="Medias" value={resumen.media} tone="blue" icon={Clock} />
          <Metric label="Total alertas" value={alertas.length} tone="slate" icon={BellRing} />
        </div>

        {loading ? (
          <div className="bg-white border rounded-lg p-10 flex items-center justify-center text-slate-500">
            <Loader2 className="w-5 h-5 animate-spin mr-2" /> Analizando datos gerenciales...
          </div>
        ) : alertas.length === 0 ? (
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-6 text-emerald-800">
            <h2 className="font-bold">Sin alertas importantes</h2>
            <p className="text-sm mt-1">No se detectaron pérdidas en precios, vencimientos críticos ni alertas fuertes de inventario.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 2xl:grid-cols-2 gap-4">
            {grupos.map(grupo => (
              <AlertGroup key={grupo.tipo} title={grupo.tipo} alertas={grupo.alertas} onOpenProduct={abrirProducto} />
            ))}
          </div>
        )}
      </div>
      <ProductFormModal
        isOpen={isProductModalOpen}
        onClose={() => {
          setIsProductModalOpen(false);
          setSelectedProduct(null);
        }}
        onSave={handleSaveProduct}
        product={selectedProduct}
      />
    </>
  );
};

const toneClasses = {
  red: 'bg-red-50 border-red-200 text-red-700',
  amber: 'bg-amber-50 border-amber-200 text-amber-700',
  blue: 'bg-blue-50 border-blue-200 text-blue-700',
  slate: 'bg-slate-50 border-slate-200 text-slate-700',
};

const Metric = ({ label, value, tone, icon: Icon }) => (
  <div className={`border rounded-lg p-4 ${toneClasses[tone] || toneClasses.slate}`}>
    <div className="flex items-center justify-between">
      <span className="text-xs font-bold uppercase">{label}</span>
      <Icon className="w-4 h-4" />
    </div>
    <div className="text-2xl font-black mt-2">{value}</div>
  </div>
);

const severityClasses = {
  critica: 'bg-red-100 text-red-700 border-red-200',
  alta: 'bg-amber-100 text-amber-700 border-amber-200',
  media: 'bg-blue-100 text-blue-700 border-blue-200',
  baja: 'bg-slate-100 text-slate-700 border-slate-200',
};

const groupIcons = {
  Precios: TrendingDown,
  Inventario: PackageX,
  Cobros: DollarSign,
  Pagos: AlertTriangle,
};

const AlertGroup = ({ title, alertas, onOpenProduct }) => {
  const Icon = groupIcons[title] || BellRing;

  return (
    <div className="bg-white border rounded-lg shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b flex items-center justify-between">
        <h2 className="font-bold text-slate-800 flex items-center gap-2">
          <Icon className="w-4 h-4 text-blue-600" /> {title}
        </h2>
        <Badge variant="outline">{alertas.length}</Badge>
      </div>

      {alertas.length === 0 ? (
        <div className="p-4 text-sm text-slate-500">Sin alertas en esta categoría.</div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50">
              <TableHead className="w-24">Nivel</TableHead>
              <TableHead>Alerta</TableHead>
              <TableHead>Impacto</TableHead>
              <TableHead>Acción sugerida</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {alertas.map(alerta => (
              <TableRow
                key={alerta.id}
                onDoubleClick={() => alerta.productoId && onOpenProduct?.(alerta.productoId)}
                title={alerta.productoId ? 'Doble clic para abrir la información de la mercancía' : ''}
                className={alerta.productoId ? 'cursor-pointer hover:bg-blue-50/60' : ''}
              >
                <TableCell>
                  <span className={`inline-flex border rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${severityClasses[alerta.severidad]}`}>
                    {alerta.severidad}
                  </span>
                </TableCell>
                <TableCell>
                  <div className="font-bold text-slate-800 text-sm">{alerta.titulo}</div>
                  <div className="text-xs text-slate-500 mt-0.5">{alerta.detalle}</div>
                </TableCell>
                <TableCell className="text-xs text-slate-600">{alerta.impacto}</TableCell>
                <TableCell className="text-xs text-slate-700 font-medium">{alerta.accion}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
};

export default AlertasGerencialesPage;
