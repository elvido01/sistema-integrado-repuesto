import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Helmet } from 'react-helmet';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Search, Printer, Save, RefreshCw, FileText, Edit, Loader2, X, RotateCw, Image as ImageIcon, Upload, Trash2 } from 'lucide-react';
import { formatInTimeZone, getCurrentDateInTimeZone, formatDateForSupabase } from '@/lib/dateUtils';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

const CLAUSULAS_DEFAULT = [
  '1RO. NO INCLUYE COSTO DE PLACA Y MATRICULA.',
  '2DO. NO SE ACEPTAN DEVOLUCIONES.',
  '3RO. TIENE SOLO 1,000 KILOMETRO DE GARANTIA EN LA MAQUINA.',
  '4TO. NO SE PUEDE ATRASAR CON UN MES Y TRES DIAS. PUEDE SER LLAMADO O ENVIADO A BUSCAR, EL COSTO DE COBRADOR ES CARGADO A SU CUENTA AUTOMATICAMENTE.',
];

const normalizeDocument = (value) => String(value || '').replace(/[^a-z0-9]/gi, '').toUpperCase();

const getDocumentSearchVariants = (term) => {
  const clean = normalizeDocument(term);
  const variants = new Set([String(term || '').trim()]);
  if (clean) variants.add(clean);
  if (/^\d{11}$/.test(clean)) {
    variants.add(`${clean.slice(0, 3)}-${clean.slice(3, 10)}-${clean.slice(10)}`);
  }
  return [...variants].filter(Boolean);
};

const buildIlikeOr = (column, values) => values
  .map((value) => `${column}.ilike.%${String(value).replace(/[%*,]/g, '')}%`)
  .join(',');

const CartaRutaPage = () => {
  const { empresa, tenantId } = useAuth();
  const { toast } = useToast();

  // ── States ──
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [cartas, setCartas] = useState([]);
  const [selectedCarta, setSelectedCarta] = useState(null);
  const [isLoadingList, setIsLoadingList] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const [isUploadingImg, setIsUploadingImg] = useState(false);
  const imgInputRef = useRef(null);

  // ── Form State ──
  const [form, setForm] = useState({
    solicitud_id: null,
    solicitud_numero: '',
    venta_id: null,
    venta_numero: '',
    fecha_emision_original: null,
    fecha: getCurrentDateInTimeZone(),
    // Cliente
    cliente_nombre: '',
    cliente_cedula: '',
    // Moto
    tipo: 'MOTOCICLETA',
    marca: '',
    modelo: '',
    color: '',
    anio: '',
    chasis: '',
    motor: '',
    placa: 'TRAMITE',
    condicion: 'NUEVA',
    // Financiamiento
    inicial: 0,
    cuota_mensual: 0,
    tiempo_meses: 0,
    valor_contado: 0,
    descripcion_factura: '',
    // Cláusulas
    clausulas: CLAUSULAS_DEFAULT.join('\n'),
    // Imagen adjunta (foto moto / documento)
    imagen_url: '',
  });

  const searchRef = useRef(null);

  // ── Cargar lista de cartas existentes ──
  const fetchCartas = useCallback(async () => {
    setIsLoadingList(true);
    const { data, error } = await supabase
      .from('cartas_ruta')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(6);

    if (error) {
      // Si la tabla no existe todavía, no mostrar error
      console.warn('cartas_ruta table may not exist yet:', error.message);
      setCartas([]);
    } else {
      setCartas(data || []);
    }
    setIsLoadingList(false);
  }, []);

  useEffect(() => { fetchCartas(); }, [fetchCartas]);

  // ── Búsqueda inteligente: detecta tipo del término ──
  // Números → # solicitud o # venta
  // 11 dígitos con guiones → cédula
  // Texto largo sin espacios → chasis
  // Texto con espacios → nombre
  const handleSearch = async () => {
    const term = searchTerm.trim();
    if (!term) return;
    setIsSearching(true);

    try {
      const isNumeric = /^\d+$/.test(term);
      const cedulaClean = normalizeDocument(term);
      const isCedula = /^\d{11}$/.test(cedulaClean);
      const hasSpace = /\s/.test(term);
      const isDocumentLike = !hasSpace && cedulaClean.length >= 5 && /[0-9]/.test(cedulaClean);
      // Formato estándar RD cuando llegan 11 dígitos puros: XXX-XXXXXXX-X
      const cedulaFormatted = isCedula
        ? `${cedulaClean.slice(0,3)}-${cedulaClean.slice(3,10)}-${cedulaClean.slice(10)}`
        : '';
      const documentVariants = getDocumentSearchVariants(term);
      const results = [];

      // 1) Buscar en cartas existentes primero (para renovaciones)
      let cartasQuery = supabase.from('cartas_ruta').select('*');

      if (isDocumentLike) {
        const identityFilters = buildIlikeOr('cliente_cedula', documentVariants);
        if (isNumeric) {
          cartasQuery = cartasQuery.or(`numero.eq.${term},venta_numero.eq.${term},solicitud_numero.eq.${term},${identityFilters}`);
        } else {
          cartasQuery = cartasQuery.or(`${identityFilters},chasis.ilike.%${term}%`);
        }
      } else if (isCedula) {
        // Cubre: término tal cual, limpio sin guiones, y re-formateado con guiones
        const variants = [
          `cliente_cedula.ilike.%${term}%`,
          `cliente_cedula.ilike.%${cedulaClean}%`,
          `cliente_cedula.ilike.%${cedulaFormatted}%`,
        ];
        cartasQuery = cartasQuery.or(variants.join(','));
      } else if (isNumeric) {
        // Prioridad: número propio de carta, luego venta/solicitud
        cartasQuery = cartasQuery.or(`numero.eq.${term},venta_numero.eq.${term},solicitud_numero.eq.${term}`);
      } else if (!hasSpace) {
        cartasQuery = cartasQuery.ilike('chasis', `%${term}%`);
      } else {
        cartasQuery = cartasQuery.ilike('cliente_nombre', `%${term}%`);
      }

      const { data: cartasData } = await cartasQuery.order('fecha', { ascending: false }).limit(30);
      if (cartasData?.length > 0) {
        cartasData.forEach(c => results.push({ ...c, _tipo: 'carta' }));
      }

      // 2) Buscar en facturas (ventas) por # venta o cliente
      if (isNumeric) {
        const { data: facturaData } = await supabase
          .from('facturas')
          .select('*, clientes(*), facturas_detalle(*, productos(*))')
          .eq('numero', term)
          .neq('estado', 'ANULADA')
          .maybeSingle();
        if (facturaData) results.push({ ...facturaData, _tipo: 'venta' });
      }
      if (isDocumentLike) {
        const { data: clientesByDoc } = await supabase
          .from('clientes')
          .select('id')
          .or(buildIlikeOr('rnc', documentVariants))
          .limit(25);

        const clienteIds = (clientesByDoc || []).map(c => c.id).filter(Boolean);
        if (clienteIds.length) {
          const { data: facturasByDoc } = await supabase
            .from('facturas')
            .select('*, clientes(*), facturas_detalle(*, productos(*))')
            .in('cliente_id', clienteIds)
            .neq('estado', 'ANULADA')
            .order('fecha', { ascending: false })
            .limit(10);
          facturasByDoc?.forEach(f => results.push({ ...f, _tipo: 'venta' }));
        }
      }

      // 3) Buscar en solicitudes por # solicitud o chasis
      let solQuery = supabase.from('solicitudes_compras').select('*, clientes(nombre, rnc)');
      if (isDocumentLike) {
        const docFilters = [
          buildIlikeOr('cliente_rnc', documentVariants),
          buildIlikeOr('cliente_nombre', documentVariants),
        ].filter(Boolean).join(',');
        if (isNumeric) {
          solQuery = solQuery.or(`numero.eq.${parseInt(term) || 0},${docFilters}`);
        } else {
          solQuery = solQuery.or(`${docFilters},chasis.ilike.%${term}%`);
        }
      } else if (isNumeric) {
        solQuery = solQuery.eq('numero', parseInt(term) || 0);
      } else if (!hasSpace) {
        solQuery = solQuery.ilike('chasis', `%${term}%`);
      } else {
        solQuery = solQuery.ilike('cliente_nombre', `%${term}%`);
      }
      const { data: solData } = await solQuery.order('fecha', { ascending: false }).limit(10);
      if (solData?.length > 0) {
        solData.forEach(s => results.push({ ...s, _tipo: 'solicitud' }));
      }

      const uniqueResults = results.filter((item, index, self) =>
        index === self.findIndex(x => x._tipo === item._tipo && x.id === item.id)
      );

      if (uniqueResults.length === 0) {
        toast({ title: 'Sin resultados', description: `No se encontró información con "${term}".` });
        return;
      }

      if (uniqueResults.length === 1) {
        const r = uniqueResults[0];
        if (r._tipo === 'carta') loadCarta(r);
        else if (r._tipo === 'venta') loadFromVenta(r);
        else if (r._tipo === 'solicitud') loadFromSolicitud(r);
      } else {
        setSearchResults(uniqueResults);
      }
    } catch (error) {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    } finally {
      setIsSearching(false);
    }
  };

  // ── Cargar datos desde una Venta (factura) ──
  const loadFromVenta = async (venta) => {
    const cliente = venta.clientes || {};
    // Buscar el primer producto de la factura que sea motocicleta (tenga chasis)
    const detalles = venta.facturas_detalle || [];
    const motoDetalle = detalles.find(d => d.productos?.chasis) || detalles[0];
    const producto = motoDetalle?.productos || {};

    // Resolver marca/modelo desde catálogos
    let marcaNombre = '';
    let modeloNombre = '';
    if (producto.marca_id) {
      const { data: m } = await supabase.from('marcas').select('nombre').eq('id', producto.marca_id).maybeSingle();
      marcaNombre = m?.nombre || '';
    }
    if (producto.modelos_ids?.length > 0) {
      const { data: mods } = await supabase.from('modelos').select('nombre').in('id', producto.modelos_ids);
      modeloNombre = mods?.map(m => m.nombre).join(', ') || '';
    }

    // Generar descripción de factura desde la venta
    const total = parseFloat(venta.total) || 0;
    const formaPago = (venta.forma_pago || '').toUpperCase();
    let descFactura = '';
    if (formaPago.includes('CREDITO') || formaPago.includes('CRÉDITO')) {
      descFactura = `VENTA A CRÉDITO POR RD$ ${total.toLocaleString('en-US', { minimumFractionDigits: 2 })}.`;
    } else {
      descFactura = `VENTA DE CONTADO POR RD$ ${total.toLocaleString('en-US', { minimumFractionDigits: 2 })}.`;
    }

    setForm({
      solicitud_id: null,
      solicitud_numero: '',
      venta_id: venta.id,
      venta_numero: venta.numero || '',
      fecha_emision_original: null,
      fecha: getCurrentDateInTimeZone(),
      cliente_nombre: (cliente.nombre || '').toUpperCase(),
      cliente_cedula: cliente.rnc || '',
      tipo: 'MOTOCICLETA',
      marca: marcaNombre.toUpperCase(),
      modelo: modeloNombre.toUpperCase(),
      color: (producto.color || '').toUpperCase(),
      anio: producto.anio || '',
      chasis: (producto.chasis || '').toUpperCase(),
      motor: (producto.motor || '').toUpperCase(),
      placa: 'TRAMITE',
      condicion: producto.condicion || 'NUEVA',
      inicial: 0,
      cuota_mensual: 0,
      tiempo_meses: 0,
      valor_contado: total,
      descripcion_factura: descFactura,
      clausulas: CLAUSULAS_DEFAULT.join('\n'),
    });
    setSelectedCarta(null);
    setSearchResults([]);
    toast({ title: 'Venta cargada', description: `Factura #${venta.numero} — ${cliente.nombre || ''}` });
  };

  // ── Cargar datos de una solicitud al formulario ──
  const loadFromSolicitud = (sol) => {
    const clienteNombre = sol.cliente_nombre || sol.clientes?.nombre || '';
    const clienteCedula = sol.cliente_rnc || sol.clientes?.rnc || '';
    const inicial = parseFloat(sol.inicial) || 0;
    const cuota = parseFloat(sol.cuota_mensual) || 0;
    const meses = parseInt(sol.tiempo_meses) || 0;
    const valorContado = parseFloat(sol.valor_contado) || 0;

    // Generar descripción de factura automática
    let descFactura = '';
    if (meses > 0 && cuota > 0) {
      descFactura = `UN INICIAL DE ${inicial.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Y RESTA ${meses} PAGOS DE ${cuota.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} PESOS MENSUALES.`;
    } else {
      descFactura = `VENTA DE CONTADO POR RD$ ${valorContado.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}.`;
    }

    setForm({
      solicitud_id: sol.id,
      solicitud_numero: sol.numero || '',
      venta_id: null,
      venta_numero: '',
      fecha_emision_original: null,
      fecha: getCurrentDateInTimeZone(),
      cliente_nombre: clienteNombre.toUpperCase(),
      cliente_cedula: clienteCedula,
      tipo: 'MOTOCICLETA',
      marca: (sol.marca || '').toUpperCase(),
      modelo: (sol.modelo || '').toUpperCase(),
      color: (sol.color || '').toUpperCase(),
      anio: sol.anio || '',
      chasis: (sol.chasis || '').toUpperCase(),
      motor: (sol.motor || '').toUpperCase(),
      placa: 'TRAMITE',
      condicion: sol.condicion || 'NUEVA',
      inicial,
      cuota_mensual: cuota,
      tiempo_meses: meses,
      valor_contado: valorContado,
      descripcion_factura: descFactura,
      clausulas: CLAUSULAS_DEFAULT.join('\n'),
    });

    setSearchResults([]);
    toast({ title: 'Solicitud cargada', description: `Solicitud #${sol.numero} — ${clienteNombre}` });
  };

  // ── Cargar carta existente para editar ──
  const loadCarta = (carta) => {
    setForm({
      ...carta,
      clausulas: carta.clausulas || CLAUSULAS_DEFAULT.join('\n'),
      fecha: carta.fecha ? new Date(carta.fecha + 'T00:00:00') : getCurrentDateInTimeZone(),
    });
    setSelectedCarta(carta);
    setSearchResults([]);
  };

  // ── Guardar carta de ruta ──
  const handleSave = async () => {
    if (!form.cliente_nombre.trim()) {
      toast({ variant: 'destructive', title: 'Error', description: 'Debe ingresar el nombre del cliente.' });
      return;
    }
    if (!form.chasis.trim()) {
      toast({ variant: 'destructive', title: 'Error', description: 'Debe ingresar el número de chasis.' });
      return;
    }

    setIsSaving(true);
    const fechaStr = formatDateForSupabase(form.fecha);
    const fechaOriginal = form.fecha_emision_original || (selectedCarta?.fecha_emision_original) || fechaStr;
    const payload = {
      tenant_id: tenantId,
      solicitud_id: form.solicitud_id,
      solicitud_numero: form.solicitud_numero,
      venta_id: form.venta_id,
      venta_numero: form.venta_numero,
      fecha_emision_original: fechaOriginal,
      fecha: fechaStr,
      cliente_nombre: form.cliente_nombre,
      cliente_cedula: form.cliente_cedula,
      tipo: form.tipo,
      marca: form.marca,
      modelo: form.modelo,
      color: form.color,
      anio: form.anio ? parseInt(form.anio) : null,
      chasis: form.chasis,
      motor: form.motor,
      placa: form.placa,
      condicion: form.condicion,
      inicial: form.inicial,
      cuota_mensual: form.cuota_mensual,
      tiempo_meses: form.tiempo_meses,
      valor_contado: form.valor_contado,
      descripcion_factura: form.descripcion_factura,
      clausulas: form.clausulas,
      imagen_url: form.imagen_url || null,
    };

    try {
      if (selectedCarta?.id) {
        const { error } = await supabase.from('cartas_ruta').update(payload).eq('id', selectedCarta.id);
        if (error) throw error;
        toast({ title: 'Carta actualizada', description: 'La Carta de Ruta se actualizó correctamente.' });
      } else {
        const { data, error } = await supabase.from('cartas_ruta').insert(payload).select().single();
        if (error) throw error;
        setSelectedCarta(data);
        toast({ title: 'Carta guardada', description: 'La Carta de Ruta se guardó correctamente.' });
      }
      fetchCartas();
    } catch (error) {
      toast({ variant: 'destructive', title: 'Error al guardar', description: error.message });
    } finally {
      setIsSaving(false);
    }
  };

  // ── Renovar: actualiza fecha a hoy + imprime ──
  const handleRenovar = async () => {
    if (!selectedCarta?.id) {
      toast({ variant: 'destructive', title: 'Error', description: 'Primero cargue una carta existente para renovarla.' });
      return;
    }
    const hoy = getCurrentDateInTimeZone();
    const hoyStr = formatDateForSupabase(hoy);
    const fechaOriginal = selectedCarta.fecha_emision_original || selectedCarta.fecha || hoyStr;

    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('cartas_ruta')
        .update({ fecha: hoyStr, fecha_emision_original: fechaOriginal })
        .eq('id', selectedCarta.id);
      if (error) throw error;

      setForm(prev => ({ ...prev, fecha: hoy, fecha_emision_original: fechaOriginal }));
      setSelectedCarta(prev => ({ ...prev, fecha: hoyStr, fecha_emision_original: fechaOriginal }));
      toast({ title: 'Carta renovada', description: 'Fecha actualizada a hoy. Abriendo impresión...' });
      fetchCartas();
      setTimeout(() => handlePrint(), 300);
    } catch (error) {
      toast({ variant: 'destructive', title: 'Error al renovar', description: error.message });
    } finally {
      setIsSaving(false);
    }
  };

  // ── Limpiar formulario ──
  const handleNew = () => {
    setForm({
      solicitud_id: null, solicitud_numero: '',
      venta_id: null, venta_numero: '', fecha_emision_original: null,
      fecha: getCurrentDateInTimeZone(),
      cliente_nombre: '', cliente_cedula: '',
      tipo: 'MOTOCICLETA', marca: '', modelo: '', color: '', anio: '', chasis: '', motor: '', placa: 'TRAMITE', condicion: 'NUEVA',
      inicial: 0, cuota_mensual: 0, tiempo_meses: 0, valor_contado: 0, descripcion_factura: '',
      clausulas: CLAUSULAS_DEFAULT.join('\n'),
      imagen_url: '',
    });
    setSelectedCarta(null);
    setSearchResults([]);
    setSearchTerm('');
    searchRef.current?.focus();
  };

  // ── Formatear fecha estilo carta ──
  const formatFechaCarta = (date) => {
    try {
      const d = date instanceof Date ? date : new Date(date);
      const dia = d.getDate();
      const meses = ['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'];
      const mes = meses[d.getMonth()];
      const year = d.getFullYear();
      return `${dia}/${mes}/${year}`;
    } catch { return '---'; }
  };

  // ── Imprimir Carta de Ruta ──
  const handlePrint = () => {
    if (!form.cliente_nombre) {
      toast({ variant: 'destructive', title: 'Error', description: 'No hay datos para imprimir.' });
      return;
    }

    const clausulasArr = (form.clausulas || '').split('\n').filter(c => c.trim());
    const fechaStr = formatFechaCarta(form.fecha);

    const printWindow = window.open('', '_blank', 'width=816,height=1056');
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Carta de Ruta #${selectedCarta?.numero || '—'}</title>
        <style>
          @page { size: letter; margin: 15mm 20mm; }
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: 'Times New Roman', serif; font-size: 13px; color: #000; padding: 20px 30px; }
          .header { position: relative; margin-bottom: 20px; min-height: 110px; }
          .header-center { text-align: center; }
          .header-right { position: absolute; right: 0; top: 40px; text-align: right; }
          .carta-label-num { font-size: 13px; font-weight: bold; color: #000; letter-spacing: 1px; }
          .header-logo { max-height: 110px; max-width: 280px; object-fit: contain; }
          .logo-text { font-size: 28px; font-weight: bold; letter-spacing: 3px; margin-bottom: 2px; }
          .subtitle { font-size: 14px; font-weight: bold; letter-spacing: 2px; color: #b22222; }
          .subtitle-rnc { font-size: 12px; color: #000; margin-top: 2px; }
          .subtitle-main { font-size: 16px; font-weight: bold; letter-spacing: 2px; text-decoration: underline; margin-top: 6px; }
          .rnc { font-size: 12px; font-style: italic; }
          .fecha { text-align: right; font-size: 14px; font-weight: bold; margin-top: -10px; margin-bottom: 20px; }
          .cliente { margin-bottom: 18px; font-size: 14px; line-height: 1.8; }
          .cliente strong { font-weight: bold; }
          .seccion-titulo { text-align: center; font-weight: bold; font-size: 13px; margin: 12px 0 4px; text-decoration: underline; }
          .separador { text-align: center; font-size: 10px; letter-spacing: 2px; color: #333; margin: 2px 0; }
          .desc-factura { text-align: center; font-size: 13px; font-weight: bold; margin: 6px 20px; }
          .moto-grid { display: grid; grid-template-columns: max-content max-content; gap: 4px 60px; margin: 10px auto; justify-content: center; font-size: 13px; line-height: 1.8; }
          .moto-grid div { font-weight: bold; }
          .clausulas { margin: 18px 10px; font-size: 12px; line-height: 1.7; }
          .firmas { margin-top: 50px; }
          .firma-center { text-align: center; margin-bottom: 40px; }
          .firma-center .linea, .firma-row .linea { border-top: 1px solid #000; display: inline-block; width: 250px; margin-top: 30px; }
          .firma-row { display: flex; justify-content: space-between; margin-top: 20px; }
          .firma-item { text-align: center; width: 45%; }
          .firma-item .linea { width: 200px; }
          .firma-label { font-weight: bold; font-size: 13px; margin-top: 4px; }
          .footer { text-align: center; margin-top: 40px; font-size: 11px; border-top: 1px solid #ccc; padding-top: 8px; line-height: 1.5; }
          @media print { body { padding: 0; } }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="header-center">
            ${empresa?.logo_url
              ? `<img src="${empresa.logo_url}" alt="Logo" class="header-logo" crossorigin="anonymous" />`
              : `<div class="logo-text">${(empresa?.nombre || 'CAMINERO MOTORS').toUpperCase()}</div>`
            }
            ${empresa?.rnc ? `<div class="subtitle-rnc">RNC: ${empresa.rnc}</div>` : ''}
            <div class="subtitle">CARTA DE RUTA</div>
          </div>
          <div class="header-right">
            <div class="carta-label-num">CARTA DE RUTA${selectedCarta?.numero ? `&nbsp;&nbsp;Nº ${String(selectedCarta.numero).padStart(5, '0')}` : ''}</div>
          </div>
        </div>

        <div class="fecha">Fecha: ${fechaStr}</div>

        <div class="cliente">
          <div><strong>NOMBRE:</strong> ${form.cliente_nombre}</div>
          <div><strong>CEDULA :</strong> ${form.cliente_cedula}</div>
        </div>

        <div class="seccion-titulo">DESCRIPCIÓN DE FACTURA</div>
        <div class="separador">${'*'.repeat(60)}</div>
        <div class="desc-factura">${form.descripcion_factura}</div>

        <div class="separador" style="margin-top:12px">${'*'.repeat(60)}</div>
        <div class="seccion-titulo">DESCRIPCION DE LA MOTOCICLETA</div>
        <div class="separador">${'*'.repeat(60)}</div>

        <div class="moto-grid">
          <div>TIPO: ${form.tipo}</div>
          <div>CHASIS: ${form.chasis}</div>
          <div>MARCA: ${form.marca}</div>
          <div>MOTOR: ${form.motor}</div>
          <div>COLOR: ${form.color}</div>
          <div>PLACA: ${form.placa}</div>
          <div>MODELO: ${form.modelo}</div>
          <div>AÑO: ${form.anio}</div>
        </div>

        <div class="clausulas">
          ${clausulasArr.map(c => `<div>${c}</div>`).join('')}
        </div>

        <div class="firmas">
          <div class="firma-center">
            <div class="linea"></div>
            <div class="firma-label">COMPRADOR</div>
          </div>
          <div class="firma-row">
            <div class="firma-item">
              <div class="linea"></div>
              <div class="firma-label">REALIZADO</div>
            </div>
            <div class="firma-item">
              <div class="linea"></div>
              <div class="firma-label">DESPACHADO</div>
            </div>
          </div>
        </div>

        <div class="footer">
          ${[empresa?.direccion1, empresa?.direccion2, empresa?.direccion].filter(Boolean).join(', ') || ''}<br/>
          ${empresa?.telefono ? `Teléfonos: ${empresa.telefono}` : ''}
          ${empresa?.email ? ` &bull; ${empresa.email}` : ''}
        </div>

        <script>
          window.onload = function() { window.print(); };
        </script>
      </body>
      </html>
    `);
    printWindow.document.close();
  };

  const updateField = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  // ── Subir imagen adjunta ──
  const handleImagenUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast({ variant: 'destructive', title: 'Archivo inválido', description: 'Selecciona una imagen (JPG, PNG, etc.).' });
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      toast({ variant: 'destructive', title: 'Imagen muy grande', description: 'Máximo 8 MB.' });
      return;
    }
    setIsUploadingImg(true);
    try {
      const ext = file.name.split('.').pop();
      const fileName = `cartas-ruta/${tenantId}/carta_${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('product-images')
        .upload(fileName, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;
      const { data: urlData } = supabase.storage.from('product-images').getPublicUrl(fileName);
      updateField('imagen_url', urlData.publicUrl);
      toast({ title: 'Imagen cargada', description: 'Recuerda guardar la carta para conservarla.' });
    } catch (err) {
      toast({ variant: 'destructive', title: 'Error al subir', description: err.message });
    } finally {
      setIsUploadingImg(false);
      if (imgInputRef.current) imgInputRef.current.value = '';
    }
  };

  // ── Quitar imagen ──
  const handleRemoveImagen = () => {
    updateField('imagen_url', '');
    toast({ title: 'Imagen quitada', description: 'Guarda la carta para aplicar el cambio.' });
  };

  // ── Imprimir SOLO la imagen (individual) ──
  const handlePrintImagen = () => {
    if (!form.imagen_url) {
      toast({ variant: 'destructive', title: 'Sin imagen', description: 'No hay imagen para imprimir.' });
      return;
    }
    const titulo = `Imagen — Carta ${selectedCarta?.numero ? `Nº ${String(selectedCarta.numero).padStart(5, '0')}` : ''} ${form.cliente_nombre || ''}`.trim();
    const w = window.open('', '_blank', 'width=816,height=1056');
    w.document.write(`
      <!DOCTYPE html><html><head><meta charset="utf-8"/><title>${titulo}</title>
      <style>
        @page { size: letter; margin: 10mm; }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Times New Roman', serif; text-align: center; padding: 10px; }
        .cap { font-size: 13px; font-weight: bold; margin-bottom: 8px; color: #000; }
        .meta { font-size: 11px; color: #333; margin-bottom: 12px; }
        img { max-width: 100%; max-height: 90vh; object-fit: contain; border: 1px solid #ccc; }
        @media print { body { padding: 0; } .meta { color:#000; } }
      </style></head><body>
        <div class="cap">${(form.cliente_nombre || '').toUpperCase()}${form.chasis ? ` — CHASIS: ${form.chasis}` : ''}</div>
        <div class="meta">${form.marca || ''} ${form.modelo || ''} ${form.color || ''} ${form.placa ? `· Placa: ${form.placa}` : ''}</div>
        <img src="${form.imagen_url}" alt="Imagen carta" crossorigin="anonymous" />
        <script>
          var img = document.querySelector('img');
          if (img.complete) { window.print(); }
          else { img.onload = function(){ window.print(); }; img.onerror = function(){ window.print(); }; }
        </script>
      </body></html>
    `);
    w.document.close();
  };

  return (
    <>
      <Helmet><title>Carta de Ruta — {empresa?.nombre || 'Sistema'}</title></Helmet>

      <div className="h-full flex flex-col p-4 bg-gray-50 space-y-3">
        {/* Header */}
        <div className="bg-white p-3 rounded-lg shadow-sm border flex justify-between items-center">
          <h1 className="text-xl font-bold text-blue-800 flex items-center gap-2">
            <FileText className="w-5 h-5" /> Carta de Ruta
          </h1>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                ref={searchRef}
                placeholder="# Solicitud, # Venta, Chasis, Cédula, RNC, Pasaporte o Nombre..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleSearch(); }}
                className="pl-8 w-96 h-9"
              />
            </div>
            <Button variant="secondary" className="h-9" onClick={handleSearch} disabled={isSearching}>
              {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Buscar'}
            </Button>
            <Button variant="outline" className="h-9" onClick={handleNew}><RefreshCw className="h-4 w-4 mr-1" /> Nueva</Button>
          </div>
        </div>

        {/* Resultados de búsqueda */}
        {searchResults.length > 0 && (
          <div className="bg-white p-3 rounded-lg shadow-sm border max-h-64 overflow-y-auto">
            <div className="flex justify-between items-center mb-2">
              <Label className="text-xs font-bold text-slate-500 uppercase">
                {searchResults.length} resultado{searchResults.length !== 1 ? 's' : ''} — Seleccione uno
              </Label>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setSearchResults([])}><X className="h-3 w-3" /></Button>
            </div>
            <Table className="text-xs">
              <TableHeader>
                <TableRow className="bg-slate-50">
                  <TableHead>Tipo</TableHead>
                  <TableHead>#</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Marca / Modelo</TableHead>
                  <TableHead>Chasis</TableHead>
                  <TableHead>Fecha</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {searchResults.map(r => {
                  const tipo = r._tipo;
                  const badge = tipo === 'carta'
                    ? { txt: 'CARTA', cls: 'bg-blue-100 text-blue-700' }
                    : tipo === 'venta'
                      ? { txt: 'VENTA', cls: 'bg-green-100 text-green-700' }
                      : { txt: 'SOLICITUD', cls: 'bg-amber-100 text-amber-700' };
                  const numero = tipo === 'carta'
                    ? (r.numero ? `CR-${String(r.numero).padStart(5, '0')}` : (r.venta_numero || r.solicitud_numero || '—'))
                    : r.numero;
                  const cliente = r.cliente_nombre || r.clientes?.nombre || '';
                  const marca = r.marca || (r.facturas_detalle?.[0]?.productos?.chasis ? 'Motocicleta' : '—');
                  const modelo = r.modelo || '';
                  const chasis = r.chasis || r.facturas_detalle?.find(d => d.productos?.chasis)?.productos?.chasis || '—';
                  return (
                    <TableRow
                      key={`${tipo}-${r.id}`}
                      className="cursor-pointer hover:bg-blue-50"
                      onClick={() => {
                        if (tipo === 'carta') loadCarta(r);
                        else if (tipo === 'venta') loadFromVenta(r);
                        else loadFromSolicitud(r);
                      }}
                    >
                      <TableCell>
                        <span className={`px-2 py-0.5 rounded text-[9px] font-bold ${badge.cls}`}>{badge.txt}</span>
                      </TableCell>
                      <TableCell className="font-bold">{numero}</TableCell>
                      <TableCell className="truncate max-w-[160px]">{cliente}</TableCell>
                      <TableCell>{marca} {modelo}</TableCell>
                      <TableCell className="font-mono text-[10px]">{chasis}</TableCell>
                      <TableCell>{r.fecha ? formatInTimeZone(new Date(r.fecha), 'dd/MM/yyyy') : '---'}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Formulario principal */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 flex-grow min-h-0">
          {/* Columna izquierda: Datos del formulario */}
          <div className="lg:col-span-2 bg-white rounded-lg shadow-sm border p-4 space-y-3 overflow-y-auto">
            {/* Fecha */}
            <div className="flex items-center gap-4 pb-2 border-b">
              <Label className="text-xs font-bold text-slate-500 w-24">FECHA CARTA</Label>
              <Input
                type="date"
                value={form.fecha instanceof Date ? format(form.fecha, 'yyyy-MM-dd') : (form.fecha || '')}
                onChange={e => updateField('fecha', e.target.value ? new Date(e.target.value + 'T00:00:00') : '')}
                className="h-8 w-44 text-sm font-bold"
              />
              <span className="text-xs text-amber-600 font-medium">⚠ Renovar cada 3 meses</span>
              <div className="ml-auto flex items-center gap-2">
                {form.fecha_emision_original && (
                  <span className="text-[10px] text-slate-500 italic">
                    Emitida: {formatInTimeZone(new Date(form.fecha_emision_original), 'dd/MM/yyyy')}
                  </span>
                )}
                {form.solicitud_numero && (
                  <span className="text-xs bg-amber-100 text-amber-700 px-2 py-1 rounded font-bold">
                    Solicitud #{form.solicitud_numero}
                  </span>
                )}
                {form.venta_numero && (
                  <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded font-bold">
                    Factura #{form.venta_numero}
                  </span>
                )}
              </div>
            </div>

            {/* Cliente */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-[10px] font-bold text-slate-500 uppercase">Nombre del Comprador</Label>
                <Input value={form.cliente_nombre} onChange={e => updateField('cliente_nombre', e.target.value.toUpperCase())} className="h-8 text-sm font-bold" placeholder="NOMBRE COMPLETO" />
              </div>
              <div>
                <Label className="text-[10px] font-bold text-slate-500 uppercase">Cédula / Pasaporte</Label>
                <Input value={form.cliente_cedula} onChange={e => updateField('cliente_cedula', e.target.value)} className="h-8 text-sm" placeholder="000-0000000-0" />
              </div>
            </div>

            {/* Descripción de Factura */}
            <div>
              <Label className="text-[10px] font-bold text-slate-500 uppercase">Descripción de Factura</Label>
              <Textarea value={form.descripcion_factura} onChange={e => updateField('descripcion_factura', e.target.value.toUpperCase())} rows={2} className="text-sm font-semibold" placeholder="UN INICIAL DE ... Y RESTA ... PAGOS DE ... PESOS MENSUALES." />
            </div>

            {/* Datos de la Motocicleta */}
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg space-y-2">
              <Label className="text-[10px] font-extrabold text-amber-800 uppercase tracking-wide">Descripción de la Motocicleta</Label>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <div>
                  <Label className="text-[9px] text-slate-500 uppercase font-bold">Tipo</Label>
                  <Input value={form.tipo} onChange={e => updateField('tipo', e.target.value.toUpperCase())} className="h-7 text-xs font-bold" />
                </div>
                <div>
                  <Label className="text-[9px] text-slate-500 uppercase font-bold">Marca</Label>
                  <Input value={form.marca} onChange={e => updateField('marca', e.target.value.toUpperCase())} className="h-7 text-xs font-bold" />
                </div>
                <div>
                  <Label className="text-[9px] text-slate-500 uppercase font-bold">Modelo</Label>
                  <Input value={form.modelo} onChange={e => updateField('modelo', e.target.value.toUpperCase())} className="h-7 text-xs font-bold" />
                </div>
                <div>
                  <Label className="text-[9px] text-slate-500 uppercase font-bold">Color</Label>
                  <Input value={form.color} onChange={e => updateField('color', e.target.value.toUpperCase())} className="h-7 text-xs font-bold" />
                </div>
                <div>
                  <Label className="text-[9px] text-slate-500 uppercase font-bold">Año</Label>
                  <Input type="number" value={form.anio} onChange={e => updateField('anio', e.target.value)} className="h-7 text-xs font-bold" />
                </div>
                <div>
                  <Label className="text-[9px] text-slate-500 uppercase font-bold">Chasis</Label>
                  <Input value={form.chasis} onChange={e => updateField('chasis', e.target.value.toUpperCase())} className="h-7 text-xs font-mono font-bold" />
                </div>
                <div>
                  <Label className="text-[9px] text-slate-500 uppercase font-bold">Motor</Label>
                  <Input value={form.motor} onChange={e => updateField('motor', e.target.value.toUpperCase())} className="h-7 text-xs font-mono font-bold" />
                </div>
                <div>
                  <Label className="text-[9px] text-slate-500 uppercase font-bold">Placa</Label>
                  <Input value={form.placa} onChange={e => updateField('placa', e.target.value.toUpperCase())} className="h-7 text-xs font-bold bg-yellow-50 border-yellow-300" />
                </div>
              </div>
            </div>

            {/* Cláusulas editables */}
            <div>
              <Label className="text-[10px] font-bold text-slate-500 uppercase">Cláusulas / Condiciones</Label>
              <Textarea value={form.clausulas} onChange={e => updateField('clausulas', e.target.value)} rows={5} className="text-xs leading-relaxed" />
            </div>

            {/* Imagen adjunta */}
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-[10px] font-extrabold text-slate-600 uppercase tracking-wide flex items-center gap-1">
                  <ImageIcon className="h-3.5 w-3.5" /> Imagen adjunta (foto moto / documento)
                </Label>
                <input
                  ref={imgInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleImagenUpload}
                />
                {!form.imagen_url ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => imgInputRef.current?.click()}
                    disabled={isUploadingImg}
                  >
                    {isUploadingImg ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Upload className="h-3 w-3 mr-1" />}
                    Subir imagen
                  </Button>
                ) : (
                  <div className="flex gap-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs"
                      onClick={() => imgInputRef.current?.click()}
                      disabled={isUploadingImg}
                    >
                      {isUploadingImg ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <RefreshCw className="h-3 w-3 mr-1" />}
                      Cambiar
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs text-rose-600 border-rose-300 hover:bg-rose-50"
                      onClick={handleRemoveImagen}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                )}
              </div>

              {form.imagen_url ? (
                <div className="flex flex-col items-center gap-2">
                  <img
                    src={form.imagen_url}
                    alt="Imagen de la carta"
                    className="max-h-64 max-w-full object-contain rounded border border-slate-300 bg-white"
                  />
                  <Button
                    type="button"
                    className="h-9 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold w-full"
                    onClick={handlePrintImagen}
                  >
                    <Printer className="h-4 w-4 mr-2" /> IMPRIMIR IMAGEN (INDIVIDUAL)
                  </Button>
                </div>
              ) : (
                <p className="text-[11px] text-slate-400 italic text-center py-3">
                  Sin imagen. Sube una foto de la moto o un documento para verla aquí e imprimirla por separado.
                </p>
              )}
            </div>
          </div>

          {/* Columna derecha: Lista de cartas + acciones */}
          <div className="flex flex-col gap-3">
            {/* Acciones */}
            <div className="bg-white rounded-lg shadow-sm border p-3 space-y-2">
              <Button className="w-full h-10 bg-blue-700 hover:bg-blue-800 text-white font-bold" onClick={handleSave} disabled={isSaving}>
                {isSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                {selectedCarta ? 'ACTUALIZAR CARTA' : 'GUARDAR CARTA'}
              </Button>
              {selectedCarta?.id && (
                <Button className="w-full h-10 bg-emerald-600 hover:bg-emerald-700 text-white font-bold" onClick={handleRenovar} disabled={isSaving}>
                  {isSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RotateCw className="h-4 w-4 mr-2" />}
                  🔄 RENOVAR (FECHA HOY + IMPRIMIR)
                </Button>
              )}
              <Button className="w-full h-10 bg-slate-800 hover:bg-slate-700 text-white font-bold" onClick={handlePrint} disabled={!form.cliente_nombre}>
                <Printer className="h-4 w-4 mr-2" /> IMPRIMIR CARTA
              </Button>
              <Button variant="outline" className="w-full h-9" onClick={handleNew}>
                <RefreshCw className="h-4 w-4 mr-2" /> NUEVA CARTA
              </Button>
            </div>

            {/* Lista de cartas guardadas */}
            <div className="bg-white rounded-lg shadow-sm border p-2 flex-grow min-h-0 overflow-hidden flex flex-col">
              <Label className="text-[10px] font-bold text-slate-500 uppercase px-1 mb-1">Cartas Guardadas</Label>
              <div className="flex-grow overflow-y-auto">
                <Table className="text-[11px]">
                  <TableHeader className="sticky top-0 bg-slate-50">
                    <TableRow>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Chasis</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoadingList ? (
                      <TableRow><TableCell colSpan={3} className="text-center"><Loader2 className="h-4 w-4 animate-spin mx-auto" /></TableCell></TableRow>
                    ) : cartas.length === 0 ? (
                      <TableRow><TableCell colSpan={3} className="text-center text-slate-400 py-4">Sin cartas</TableCell></TableRow>
                    ) : cartas.slice(0, 6).map(c => (
                      <TableRow
                        key={c.id}
                        className={`cursor-pointer hover:bg-blue-50 ${selectedCarta?.id === c.id ? 'bg-blue-100' : ''}`}
                        onClick={() => loadCarta(c)}
                      >
                        <TableCell>{c.fecha ? formatInTimeZone(new Date(c.fecha + 'T00:00:00'), 'dd/MM/yyyy') : '---'}</TableCell>
                        <TableCell className="truncate max-w-[120px]">{c.cliente_nombre}</TableCell>
                        <TableCell className="font-mono text-[9px]">{c.chasis?.slice(-8)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default CartaRutaPage;
