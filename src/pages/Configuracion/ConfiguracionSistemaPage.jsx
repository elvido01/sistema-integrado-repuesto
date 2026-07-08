import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Save, Upload, Trash2, Building2, Globe, Phone, Mail, FileText, Coins, Percent, Calendar as CalendarIcon, Image as ImageIcon, Target, Printer, Zap, Download, MessageCircle, Banknote } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import PrinterSettings from '@/components/configuracion/PrinterSettings';
import IntegracionFiscalSettings from '@/components/configuracion/IntegracionFiscalSettings';

const WHATSAPP_EXTENSION_DOWNLOAD_VERSION = '2026-07-08-1';
const WHATSAPP_EXTENSION_DOWNLOAD_URL = `/downloads/motoflow-whatsapp-extension.zip?v=${WHATSAPP_EXTENSION_DOWNLOAD_VERSION}`;
const OMNI_BETA_EXTENSION_DOWNLOAD_URL = `/downloads/motoflow-omni-beta-extension.zip?v=${WHATSAPP_EXTENSION_DOWNLOAD_VERSION}`;

const ConfiguracionSistemaPage = () => {
    const { toast } = useToast();
    const { tenantId } = useAuth();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [uploading, setUploading] = useState(false);
    const fileInputRef = useRef(null);

    const [formData, setFormData] = useState({
        codigo: '03',
        rnc: '',
        nombre: '',
        direccion1: '',
        direccion2: '',
        email: '',
        telefono: '',
        fax: '',
        slogan: '',
        moneda_principal: 'DOP - PESOS',
        itbis_pct: 18,
        moneda_precios: 'DOP - PESOS',
        modo_fecha: 1,
        logo_url: '',
        meta_ventas: 150000,
        meta_flujo_neto_mensual: 0,
        incremento_meta_pct: 0,
        intervalo_meta: 'Ninguno',
        fecha_inicio_meta: null,
        tenant_id: null,
        limpiar_ordenes_compra_auto: false,
        modo_limpieza_orden: 'restar',
        formato_factura: 'pos_4inch',
        formato_precio_etiqueta: 'alpha',
        formato_comprobante_pago: 'pdf',
        formato_cierre_caja: 'pos_80mm',
        saldo_inicial_caja: 0,
        caja_historial_desde: '1970-01-01',
        precio2_descuento_pct: 10,
        precio3_descuento_pct: 15,
        margen_minimo_pct: 0,
        tipo_negocio: 'repuestos',
        incluir_existencias_cero_default: true,
        cobranza_hora_corte: '17:50',
        cobranza_buscador_telefono: '',
        financiamiento_tipo: 'propio',
        financiera_tenant_id: null,
        mora_pct_default: 0
    });

    const [financieras, setFinancieras] = useState([]);

    const [originalGoalData, setOriginalGoalData] = useState({
        meta_ventas: 150000,
        incremento_meta_pct: 0,
        intervalo_meta: 'Ninguno'
    });

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('config_empresa')
                .select('*')
                .eq('tenant_id', tenantId)
                .maybeSingle();

            if (error && error.code !== 'PGRST116') throw error;
            if (data) {
                setFormData({
                    codigo: data.codigo || '03',
                    rnc: data.rnc || '',
                    nombre: data.nombre || '',
                    direccion1: data.direccion1 || '',
                    direccion2: data.direccion2 || '',
                    email: data.email || '',
                    telefono: data.telefono || '',
                    fax: data.fax || '',
                    slogan: data.slogan || '',
                    moneda_principal: data.moneda_principal || 'DOP - PESOS',
                    itbis_pct: data.itbis_pct || 0,
                    moneda_precios: data.moneda_precios || 'DOP - PESOS',
                    modo_fecha: data.modo_fecha || 1,
                    logo_url: data.logo_url || '',
                    meta_ventas: data.meta_ventas || 150000,
                    meta_flujo_neto_mensual: data.meta_flujo_neto_mensual ?? 0,
                    incremento_meta_pct: data.incremento_meta_pct || 0,
                    intervalo_meta: data.intervalo_meta || 'Ninguno',
                    fecha_inicio_meta: data.fecha_inicio_meta || null,
                    tenant_id: data.tenant_id || tenantId,
                    limpiar_ordenes_compra_auto: false,
                    modo_limpieza_orden: 'restar',
                    formato_factura: data.formato_factura || 'pos_4inch',
                    formato_precio_etiqueta: data.formato_precio_etiqueta || 'alpha',
                    formato_comprobante_pago: data.formato_comprobante_pago || 'pdf',
                    formato_cierre_caja: data.formato_cierre_caja || 'pos_80mm',
                    saldo_inicial_caja: data.saldo_inicial_caja ?? 0,
                    caja_historial_desde: data.caja_historial_desde || '1970-01-01',
                    precio2_descuento_pct: data.precio2_descuento_pct ?? 10,
                    precio3_descuento_pct: data.precio3_descuento_pct ?? 15,
                    margen_minimo_pct: data.margen_minimo_pct ?? 0,
                    tipo_negocio: data.tipo_negocio || 'repuestos',
                    incluir_existencias_cero_default: data.incluir_existencias_cero_default ?? true,
                    cobranza_hora_corte: (data.cobranza_hora_corte || '17:50').slice(0, 5),
                    cobranza_buscador_telefono: data.cobranza_buscador_telefono || '',
                    financiamiento_tipo: data.financiamiento_tipo || 'propio',
                    financiera_tenant_id: data.financiera_tenant_id || null,
                    mora_pct_default: data.mora_pct_default ?? 0
                });
                
                setOriginalGoalData({
                    meta_ventas: data.meta_ventas || 150000,
                    incremento_meta_pct: data.incremento_meta_pct || 0,
                    intervalo_meta: data.intervalo_meta || 'Ninguno'
                });
            }
        } catch (error) {
            console.error('Error fetching config:', error);
            toast({ variant: 'destructive', title: 'Error', description: 'No se pudieron cargar los datos de la empresa.' });
        } finally {
            setLoading(false);
        }
    }, [toast]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    // Lista de empresas financieras (para seleccionar como "tercero")
    useEffect(() => {
        (async () => {
            const { data, error } = await supabase.rpc('get_financiera_tenants');
            if (!error && Array.isArray(data)) setFinancieras(data);
        })();
    }, []);

    const handleInputChange = (e) => {
        const { id, value } = e.target;
        setFormData(prev => ({ ...prev, [id]: value }));
    };

    const handleNumberChange = (e) => {
        const { id, value } = e.target;
        setFormData(prev => ({ ...prev, [id]: parseFloat(value) || 0 }));
    };

    const handleSelectChange = (id, value) => {
        setFormData(prev => ({ ...prev, [id]: value }));
    };

    const handleIntSelectChange = (id, value) => {
        setFormData(prev => ({ ...prev, [id]: parseInt(value, 10) }));
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            let dataToSave = {
                ...formData,
                limpiar_ordenes_compra_auto: false,
                modo_limpieza_orden: 'restar',
                updated_at: new Date().toISOString()
            };
            
            // Si cambian los parámetros de la meta, reiniciar la fecha base de cálculo del interés compuesto
            if (
                formData.meta_ventas !== originalGoalData.meta_ventas ||
                formData.incremento_meta_pct !== originalGoalData.incremento_meta_pct ||
                formData.intervalo_meta !== originalGoalData.intervalo_meta
            ) {
                dataToSave.fecha_inicio_meta = new Date().toISOString();
                setOriginalGoalData({
                    meta_ventas: formData.meta_ventas,
                    incremento_meta_pct: formData.incremento_meta_pct,
                    intervalo_meta: formData.intervalo_meta
                });
            }

            // Payload de guardado. Algunas columnas (features nuevas) pueden no
            // existir aún en la BD de una empresa si falta correr su migración;
            // si el upsert falla por una columna inexistente, la quitamos y
            // reintentamos para no bloquear el resto de la configuración.
            let payload = {
                ...dataToSave,
                tenant_id: tenantId,
                fecha_inicio_meta: dataToSave.fecha_inicio_meta || null,
                caja_historial_desde: dataToSave.caja_historial_desde || '1970-01-01'
            };

            let saveError = null;
            const omitidas = [];
            for (let intento = 0; intento < 8; intento++) {
                const res = await supabase
                    .from('config_empresa')
                    .upsert(payload, { onConflict: 'tenant_id' });
                saveError = res.error;
                if (!saveError) break;
                const m = String(saveError.message || '').match(/Could not find the '([^']+)' column/i);
                if (m && m[1] && Object.prototype.hasOwnProperty.call(payload, m[1])) {
                    omitidas.push(m[1]);
                    const { [m[1]]: _omit, ...rest } = payload;
                    payload = rest;
                    continue;
                }
                break;
            }

            if (saveError) throw saveError;
            if (omitidas.length) {
                console.warn('Columnas omitidas al guardar config (faltan migraciones):', omitidas);
            }
            toast({ title: 'Éxito', description: 'Configuración actualizada correctamente.' });
        } catch (error) {
            console.error('CRITICAL Error saving config:', error);
            toast({ variant: 'destructive', title: 'Error', description: `No se pudo guardar la configuración: ${error.message || 'Error desconocido'}` });
        } finally {
            setSaving(false);
        }
    };

    const handleLogoUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
        if (!validTypes.includes(file.type)) {
            toast({ variant: 'destructive', title: 'Formato no válido', description: 'Solo se permiten imágenes JPG, PNG o WebP.' });
            return;
        }

        setUploading(true);
        try {
            const ext = file.name.split('.').pop();
            const fileName = `logo_empresa_${Date.now()}.${ext}`;

            // Remove old logo if exists
            if (formData.logo_url) {
                const oldPath = formData.logo_url.split('/product-images/')[1]; // Reusing the same bucket for simplicity or use a new one
                if (oldPath) await supabase.storage.from('product-images').remove([oldPath]);
            }

            const { data, error } = await supabase.storage
                .from('product-images')
                .upload(`company/${fileName}`, file);

            if (error) throw error;

            const { data: urlData } = supabase.storage.from('product-images').getPublicUrl(data.path);
            setFormData(prev => ({ ...prev, logo_url: urlData.publicUrl }));
            toast({ title: 'Logo actualizado', description: 'El logo de la empresa ha sido cargado.' });
        } catch (error) {
            console.error('Error uploading logo:', error);
            toast({ variant: 'destructive', title: 'Error', description: 'No se pudo subir el logo.' });
        } finally {
            setUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const handleRemoveLogo = async () => {
        if (!formData.logo_url) return;
        setUploading(true);
        try {
            const oldPath = formData.logo_url.split('/product-images/')[1];
            if (oldPath) await supabase.storage.from('product-images').remove([oldPath]);
            setFormData(prev => ({ ...prev, logo_url: '' }));
            toast({ title: 'Logo eliminado', description: 'El logo ha sido removido.' });
        } catch (error) {
            console.error('Error removing logo:', error);
        } finally {
            setUploading(false);
        }
    };

    if (loading) {
        return <div className="h-full flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-morla-blue" /></div>;
    }

    return (
        <div className="p-6 bg-gray-50 h-full overflow-y-auto">
            <Card className="max-w-4xl mx-auto shadow-xl border-t-4 border-morla-blue">
                <CardHeader className="bg-white border-b">
                    <CardTitle className="flex items-center gap-2 text-morla-blue uppercase tracking-wider">
                        <Building2 className="w-5 h-5" />
                        Datos de la Empresa / Configuración del Sistema
                    </CardTitle>
                </CardHeader>
                <CardContent className="p-8 space-y-6">
                    {/* Visual Windows-like Container */}
                    <div className="border rounded-md p-6 bg-[#f0f0f0] shadow-inner space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
                            
                            {/* Logo Section */}
                            <div className="md:col-span-3 space-y-3">
                                <Label className="text-[11px] font-bold text-gray-600 uppercase block text-center">Logo de la Empresa</Label>
                                <div className="w-full aspect-square bg-white border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center relative overflow-hidden group">
                                    {uploading ? (
                                        <Loader2 className="h-8 w-8 animate-spin text-morla-blue" />
                                    ) : formData.logo_url ? (
                                        <>
                                            <img src={formData.logo_url} alt="Logo" className="max-w-full max-h-full object-contain" />
                                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                                                <Button size="icon" variant="destructive" className="h-8 w-8" onClick={handleRemoveLogo}><Trash2 className="w-4 h-4" /></Button>
                                                <Button size="icon" variant="secondary" className="h-8 w-8" onClick={() => fileInputRef.current?.click()}><Upload className="w-4 h-4" /></Button>
                                            </div>
                                        </>
                                    ) : (
                                        <div className="flex flex-col items-center text-center p-4 cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                                            <ImageIcon className="w-10 h-10 text-gray-300 mb-2" />
                                            <span className="text-[10px] text-gray-400 font-bold uppercase">Click para subir logo</span>
                                        </div>
                                    )}
	                                    <input ref={fileInputRef} type="file" className="hidden" accept="image/*" onChange={handleLogoUpload} />
	                                </div>
	                            </div>

                            {/* Main Info Section */}
                            <div className="md:col-span-9 space-y-4">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-1.5">
                                        <Label htmlFor="codigo" className="text-[11px] font-bold text-gray-700 uppercase">Código</Label>
                                        <Input id="codigo" value={formData.codigo} disabled className="h-9 bg-gray-100 font-mono" />
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label htmlFor="rnc" className="text-[11px] font-bold text-gray-700 uppercase">RNC</Label>
                                        <Input id="rnc" value={formData.rnc} onChange={handleInputChange} className="h-9" placeholder="000-00000-0" />
                                    </div>
                                </div>

                                <div className="space-y-1.5">
                                    <Label htmlFor="nombre" className="text-[11px] font-bold text-gray-700 uppercase">Nombre de la Empresa</Label>
                                    <Input id="nombre" value={formData.nombre} onChange={handleInputChange} className="h-9 font-bold text-morla-blue uppercase" />
                                </div>

                                <div className="space-y-2">
                                    <Label className="text-[11px] font-bold text-gray-700 uppercase">Dirección</Label>
                                    <Input id="direccion1" value={formData.direccion1} onChange={handleInputChange} className="h-9 text-xs mb-1" placeholder="Línea 1" />
                                    <Input id="direccion2" value={formData.direccion2} onChange={handleInputChange} className="h-9 text-xs" placeholder="Línea 2" />
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                             <div className="space-y-1.5">
                                <Label htmlFor="email" className="text-[11px] font-bold text-gray-700 uppercase">Email</Label>
                                <div className="flex items-center">
                                    <div className="bg-gray-200 border border-r-0 h-9 w-9 flex items-center justify-center rounded-l-md"><Mail className="w-4 h-4 text-gray-500" /></div>
                                    <Input id="email" type="email" value={formData.email} onChange={handleInputChange} className="h-9 rounded-l-none" />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                <div className="space-y-1.5">
                                    <Label htmlFor="telefono" className="text-[11px] font-bold text-gray-700 uppercase">Teléfono</Label>
                                    <Input id="telefono" value={formData.telefono} onChange={handleInputChange} className="h-9" />
                                </div>
                                <div className="space-y-1.5">
                                    <Label htmlFor="fax" className="text-[11px] font-bold text-gray-700 uppercase">Fax</Label>
                                    <Input id="fax" value={formData.fax} onChange={handleInputChange} className="h-9" />
                                </div>
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <Label htmlFor="slogan" className="text-[11px] font-bold text-gray-700 uppercase">Slogan / Frase</Label>
                            <Input id="slogan" value={formData.slogan} onChange={handleInputChange} className="h-9 italic text-gray-600" />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pt-2">
                            <div className="space-y-1.5">
                                <Label className="text-[11px] font-bold text-gray-700 uppercase">Moneda Principal</Label>
                                <Select value={formData.moneda_principal} onValueChange={(v) => handleSelectChange('moneda_principal', v)}>
                                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="DOP - PESOS">DOP - PESOS</SelectItem>
                                        <SelectItem value="USD - DOLARES">USD - DOLARES</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-[11px] font-bold text-gray-700 uppercase">% del ITBIS</Label>
                                <div className="flex items-center">
                                    <Input id="itbis_pct" type="number" value={formData.itbis_pct} onChange={handleNumberChange} className="h-9 rounded-r-none text-right font-bold" />
                                    <div className="bg-gray-200 border border-l-0 h-9 px-3 flex items-center justify-center rounded-r-md text-xs font-bold">%</div>
                                </div>
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-[11px] font-bold text-gray-700 uppercase">Moneda para Precios</Label>
                                <Select value={formData.moneda_precios} onValueChange={(v) => handleSelectChange('moneda_precios', v)}>
                                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="DOP - PESOS">DOP - PESOS</SelectItem>
                                        <SelectItem value="USD - DOLARES">USD - DOLARES</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <div className="pt-2">
                             <Label className="text-[11px] font-bold text-gray-700 uppercase mb-1 block">Utilizar Fecha</Label>
                             <Select value={String(formData.modo_fecha)} onValueChange={(v) => handleIntSelectChange('modo_fecha', v)}>
                                <SelectTrigger className="h-10 bg-white"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="1">1 = Controlada por el sistema</SelectItem>
                                    <SelectItem value="2">2 = Usar la fecha del servidor</SelectItem>
                                    <SelectItem value="3">3 = Usar la fecha de la computadora</SelectItem>
                                </SelectContent>
                             </Select>
                        </div>
                    </div>

                    {/* Configuración de precios automáticos */}
                    <div className="border rounded-md p-6 bg-white shadow-inner space-y-6">
                        <h3 className="text-sm font-bold text-morla-blue uppercase border-b pb-2 mb-4 flex items-center gap-2">
                           <Percent className="w-4 h-4" /> Configuración de Precios 2 y 3
                        </h3>
	                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-1.5">
                                <Label className="text-[11px] font-bold text-gray-700 uppercase">Descuento Automático P2</Label>
                                <div className="flex items-center">
                                    <Input id="precio2_descuento_pct" type="number" min="0" max="100" step="0.01" value={formData.precio2_descuento_pct} onChange={handleNumberChange} className="h-10 rounded-r-none font-bold text-right" />
                                    <div className="bg-blue-50 border border-l-0 border-blue-200 h-10 px-3 flex items-center justify-center rounded-r-md text-xs font-bold text-blue-700">%</div>
                                </div>
                                <p className="text-[10px] text-gray-500 italic">
                                    P2 se calcula restando este porcentaje a P1. Si queda con pérdida real, el cotejo se desactiva.
                                </p>
                            </div>

                            <div className="space-y-1.5">
                                <Label className="text-[11px] font-bold text-gray-700 uppercase">Descuento Automático P3</Label>
                                <div className="flex items-center">
                                    <Input id="precio3_descuento_pct" type="number" min="0" max="100" step="0.01" value={formData.precio3_descuento_pct} onChange={handleNumberChange} className="h-10 rounded-r-none font-bold text-right" />
                                    <div className="bg-blue-50 border border-l-0 border-blue-200 h-10 px-3 flex items-center justify-center rounded-r-md text-xs font-bold text-blue-700">%</div>
                                </div>
                                <p className="text-[10px] text-gray-500 italic">
                                    Útil para mayoristas: una empresa puede usar P2 -5% y P3 -8%, otra P2 -10% y P3 -15%.
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Tipo de empresa y control de venta bajo costo */}
                    <div className="border rounded-md p-6 bg-white shadow-inner space-y-6">
                        <h3 className="text-sm font-bold text-morla-blue uppercase border-b pb-2 mb-4 flex items-center gap-2">
                           <Percent className="w-4 h-4" /> Empresa y Control de Venta
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-1.5">
                                <Label className="text-[11px] font-bold text-gray-700 uppercase">Tipo de Empresa</Label>
                                <Select value={formData.tipo_negocio} onValueChange={(value) => setFormData(prev => ({ ...prev, tipo_negocio: value }))}>
                                    <SelectTrigger className="h-10 bg-white"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="repuestos">Repuestos / Piezas (código corto)</SelectItem>
                                        <SelectItem value="dealer">Dealer / Vehículos (chasis largo)</SelectItem>
                                        <SelectItem value="financiera">Financiera / Motopréstamos</SelectItem>
                                    </SelectContent>
                                </Select>
                                <p className="text-[10px] text-gray-500 italic">
                                    En <strong>Dealer</strong> y <strong>Financiera</strong> el código (chasis/VIN) se muestra completo en el buscador. En <strong>Repuestos</strong> el código va en columna angosta.
                                </p>
                            </div>

                            <div className="space-y-1.5">
                                <Label className="text-[11px] font-bold text-gray-700 uppercase">Margen Mínimo Exigido</Label>
                                <div className="flex items-center">
                                    <Input id="margen_minimo_pct" type="number" min="0" max="100" step="0.01" value={formData.margen_minimo_pct} onChange={handleNumberChange} className="h-10 rounded-r-none font-bold text-right" />
                                    <div className="bg-blue-50 border border-l-0 border-blue-200 h-10 px-3 flex items-center justify-center rounded-r-md text-xs font-bold text-blue-700">%</div>
                                </div>
                                <p className="text-[10px] text-gray-500 italic">
                                    El sistema bloquea facturar cualquier línea cuyo precio (ya con su descuento) sea menor a <strong>Costo + este margen</strong>. Con <strong>0%</strong> basta con vender por encima del costo (aunque sea un peso).
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Dynamic Goals Settings Section */}
                    <div className="border rounded-md p-6 bg-white shadow-inner space-y-6">
                        <h3 className="text-sm font-bold text-morla-blue uppercase border-b pb-2 mb-4 flex items-center gap-2">
                           <Target className="w-4 h-4" /> Configuración de Objetivos de Ventas (Auto-Escalable)
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                            <div className="space-y-1.5">
                                <Label className="text-[11px] font-bold text-gray-700 uppercase">Meta Original Mensual</Label>
                                <div className="flex items-center">
                                    <div className="bg-gray-200 border border-r-0 h-10 px-3 flex items-center justify-center rounded-l-md text-xs font-bold text-gray-500">RD$</div>
                                    <Input id="meta_ventas" type="number" value={formData.meta_ventas} onChange={handleNumberChange} className="h-10 rounded-l-none font-bold text-indigo-700 text-lg" />
                                </div>
                            </div>

                            <div className="space-y-1.5">
                                <Label className="text-[11px] font-bold text-gray-700 uppercase">Meta Flujo Neto Mensual (Dashboard)</Label>
                                <div className="flex items-center">
                                    <div className="bg-gray-200 border border-r-0 h-10 px-3 flex items-center justify-center rounded-l-md text-xs font-bold text-gray-500">RD$</div>
                                    <Input id="meta_flujo_neto_mensual" type="number" value={formData.meta_flujo_neto_mensual} onChange={handleNumberChange} className="h-10 rounded-l-none font-bold text-emerald-700 text-lg" />
                                </div>
                                <p className="text-[10px] text-gray-500 italic">
                                    Meta de dinero neto (cobros − pagos) para la tarjeta "Flujo neto acumulado" en Inicio.
                                </p>
                            </div>

                            <div className="space-y-1.5">
                                <Label className="text-[11px] font-bold text-gray-700 uppercase">Saldo Inicial Caja (Dashboard)</Label>
                                <div className="flex items-center">
                                    <div className="bg-gray-200 border border-r-0 h-10 px-3 flex items-center justify-center rounded-l-md text-xs font-bold text-gray-500">RD$</div>
                                    <Input id="saldo_inicial_caja" type="number" step="0.001" value={formData.saldo_inicial_caja} onChange={handleNumberChange} className="h-10 rounded-l-none font-bold text-emerald-700" />
                                </div>
                                <p className="text-[10px] text-gray-500 italic">
                                    Base usada para el campo Excedente en Inicio; luego se ajusta con entradas y salidas reales.
                                </p>
                            </div>

                            <div className="space-y-1.5">
                                <Label className="text-[11px] font-bold text-gray-700 uppercase">Historial Caja Desde</Label>
                                <Input
                                    id="caja_historial_desde"
                                    type="date"
                                    value={formData.caja_historial_desde || '1970-01-01'}
                                    onChange={handleInputChange}
                                    className="h-10 font-bold text-emerald-700"
                                />
                                <p className="text-[10px] text-gray-500 italic">
                                    El Dashboard ignora movimientos anteriores a esta fecha para reconstruir la caja.
                                </p>
                            </div>
                            
                            <div className="space-y-1.5">
                                <Label className="text-[11px] font-bold text-gray-700 uppercase">Incremento Automático(%)</Label>
                                <div className="flex items-center">
                                    <Input id="incremento_meta_pct" type="number" value={formData.incremento_meta_pct} onChange={handleNumberChange} className="h-10 rounded-r-none font-bold" />
                                    <div className="bg-emerald-50 border border-l-0 border-emerald-200 h-10 px-3 flex items-center justify-center rounded-r-md text-xs font-bold text-emerald-600">%</div>
                                </div>
                            </div>

                            <div className="space-y-1.5">
                                <Label className="text-[11px] font-bold text-gray-700 uppercase">¿Cada cuánto tiempo?</Label>
                                <Select value={formData.intervalo_meta} onValueChange={(v) => handleSelectChange('intervalo_meta', v)}>
                                    <SelectTrigger className="h-10 border-indigo-200 bg-indigo-50/30 text-indigo-700 font-bold"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="Ninguno">Ninguno Fijo (No subir)</SelectItem>
                                        <SelectItem value="Mensual">Mensual (Cada 30 d)</SelectItem>
                                        <SelectItem value="Trimestral">Trimestral (Cada 90 d)</SelectItem>
                                        <SelectItem value="Semestral">Semestral (Cada 180 d)</SelectItem>
                                        <SelectItem value="Anual">Anual (Cada 365 d)</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            
                            {formData.fecha_inicio_meta && formData.intervalo_meta !== 'Ninguno' && formData.incremento_meta_pct > 0 && (
                            <div className="md:col-span-3 bg-blue-50/50 p-3 rounded-md border border-blue-100/50 flex flex-col items-center justify-center">
                                <p className="text-xs text-blue-600 text-center font-medium">
                                   * La meta empezó a calcularse el <b>{new Date(formData.fecha_inicio_meta).toLocaleDateString('es-DO')}</b>.  El Dashboard aplicará interés compuesto del +{formData.incremento_meta_pct}% de forma {formData.intervalo_meta.toLowerCase()} automáticamente para desafiar a tu negocio.
                                </p>
                            </div>
                            )}
                        </div>
                    </div>

                    {/* Compras y Órdenes Section */}
                    <div className="border rounded-md p-6 bg-white shadow-inner space-y-6">
                        <h3 className="text-sm font-bold text-morla-blue uppercase border-b pb-2 mb-4 flex items-center gap-2">
                           <FileText className="w-4 h-4" /> Configuración de Órdenes de Compra
                        </h3>
                        <div className="hidden">
                            <div className="space-y-4">
                                <div className="flex items-center space-x-2">
                                    <input 
                                        type="checkbox" 
                                        id="limpiar_ordenes_compra_auto" 
                                        checked={formData.limpiar_ordenes_compra_auto}
                                        onChange={(e) => setFormData(prev => ({ ...prev, limpiar_ordenes_compra_auto: e.target.checked }))}
                                        className="h-4 w-4 rounded border-gray-300 text-morla-blue focus:ring-morla-blue"
                                    />
                                    <Label htmlFor="limpiar_ordenes_compra_auto" className="text-[11px] font-bold text-gray-700 uppercase">
                                        Limpiar órdenes pendientes automáticamente al comprar
                                    </Label>
                                </div>
                                <p className="text-[10px] text-gray-500 italic pl-6">
                                    Si está activo, al registrar una compra, el sistema buscará órdenes pendientes del mismo suplidor y descontará los artículos recibidos.
                                </p>
                            </div>

                            <div className="space-y-1.5 pt-1">
                                <Label className="text-[11px] font-bold text-gray-700 uppercase">Modo de Limpieza</Label>
                                <Select
                                    value={formData.modo_limpieza_orden}
                                    onValueChange={(v) => handleSelectChange('modo_limpieza_orden', v)}
                                    disabled={!formData.limpiar_ordenes_compra_auto}
                                >
                                    <SelectTrigger className="h-10 border-indigo-200 bg-indigo-50/30 text-indigo-700 font-bold"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="agresivo">Agresivo (Borrar aunque llegue parcial)</SelectItem>
                                        <SelectItem value="restar">Proporcional (Solo restar cantidad)</SelectItem>
                                    </SelectContent>
                                </Select>
                                <p className="text-[10px] text-gray-500 italic">
                                    <b>Agresivo:</b> Borra el artículo de la orden al primer ingreso. <br/>
                                    <b>Proporcional:</b> Solo borra si la cantidad comprada es igual o mayor a la pedida.
                                </p>
                            </div>
                        </div>
	                        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3">
	                            <p className="text-xs font-semibold text-emerald-800">
	                                La recepcion de compras descuenta cantidades contra ordenes enviadas y mantiene pendiente lo que no llego.
	                            </p>
	                            <p className="mt-1 text-[11px] text-emerald-700">
	                                El modo anterior de cerrar o limpiar ordenes automaticamente queda desactivado para proteger la rotacion y evitar perder visibilidad de mercancia solicitada.
	                            </p>
	                        </div>
                    </div>

                    {/* Búsqueda de Productos */}
                    <div className="border rounded-md p-6 bg-white shadow-inner space-y-6">
                        <h3 className="text-sm font-bold text-morla-blue uppercase border-b pb-2 mb-4 flex items-center gap-2">
                            <FileText className="w-4 h-4" /> Búsqueda de Productos
                        </h3>
                        <div className="space-y-3">
                            <div className="flex items-center space-x-2">
                                <input
                                    type="checkbox"
                                    id="incluir_existencias_cero_default"
                                    checked={formData.incluir_existencias_cero_default}
                                    onChange={(e) => setFormData(prev => ({ ...prev, incluir_existencias_cero_default: e.target.checked }))}
                                    className="h-4 w-4 rounded border-gray-300 text-morla-blue focus:ring-morla-blue"
                                />
                                <Label htmlFor="incluir_existencias_cero_default" className="text-[11px] font-bold text-gray-700 uppercase">
                                    Incluir productos sin existencia por defecto al buscar
                                </Label>
                            </div>
                            <p className="text-[10px] text-gray-500 italic pl-6">
                                Cuando el cajero abre el modal de búsqueda de productos (F2), el checkbox "Incluir Existencias en cero"
                                aparece <b>marcado</b> si esta opción está activa. Si está desactivada, el modal abre mostrando solo productos
                                con stock disponible (el cajero puede activar el checkbox manualmente si necesita ver todos).
                            </p>
                        </div>
                    </div>

                    {/* Sección de Impresión: Formato Factura y Etiquetas */}
                    <div className="border rounded-md p-6 bg-white shadow-inner space-y-6">
                        <h3 className="text-sm font-bold text-morla-blue uppercase border-b pb-2 mb-4 flex items-center gap-2">
                           <Printer className="w-4 h-4" /> Configuración de Impresión
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <Label className="text-[11px] font-bold text-gray-700 uppercase">Formato de Factura (Hoja)</Label>
                                <Select value={formData.formato_factura} onValueChange={(v) => handleSelectChange('formato_factura', v)}>
                                    <SelectTrigger className="h-10 border-indigo-200 bg-indigo-50/30 text-indigo-700 font-bold"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="pos_4inch">4 Pulgadas (Punto de Ventas)</SelectItem>
                                        <SelectItem value="half_page">8.5 x 5.5 (Media Página)</SelectItem>
                                        <SelectItem value="full_page">8.5 x 11 (Página Completa)</SelectItem>
                                    </SelectContent>
                                </Select>
                                <p className="text-[10px] text-gray-500 italic">
                                    Formato por defecto al imprimir facturas en el módulo de Ventas.
                                </p>
                            </div>

                            <div className="space-y-2">
                                <Label className="text-[11px] font-bold text-gray-700 uppercase">Formato de Precio en Etiquetas</Label>
                                <Select value={formData.formato_precio_etiqueta} onValueChange={(v) => handleSelectChange('formato_precio_etiqueta', v)}>
                                    <SelectTrigger className="h-10 border-indigo-200 bg-indigo-50/30 text-indigo-700 font-bold"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="numeric">Numérico ($1,250.00)</SelectItem>
                                        <SelectItem value="alpha">Alfabético (Enc.)</SelectItem>
                                    </SelectContent>
                                </Select>
                                <p className="text-[10px] text-gray-500 italic">
                                    Formato por defecto del precio en Impresión de Etiquetas Masivas. El usuario puede cambiarlo temporalmente desde el módulo.
                                </p>
                            </div>

                            <div className="space-y-2">
                                <Label className="text-[11px] font-bold text-gray-700 uppercase">Formato de Comprobante de Pago</Label>
                                <Select value={formData.formato_comprobante_pago} onValueChange={(v) => handleSelectChange('formato_comprobante_pago', v)}>
                                    <SelectTrigger className="h-10 border-indigo-200 bg-indigo-50/30 text-indigo-700 font-bold"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="pdf">PDF (Carta 8.5 x 11)</SelectItem>
                                        <SelectItem value="pos_4inch">Ticket 4 Pulgadas (POS)</SelectItem>
                                        <SelectItem value="pos_80mm">Ticket 80mm (POS)</SelectItem>
                                    </SelectContent>
                                </Select>
                                <p className="text-[10px] text-gray-500 italic">
                                    Formato del comprobante que se imprime al pagar compromisos, suplidores y gastos diarios desde el Inicio.
                                </p>
                            </div>

                            <div className="space-y-2">
                                <Label className="text-[11px] font-bold text-gray-700 uppercase">Formato de Cierre de Caja</Label>
                                <Select value={formData.formato_cierre_caja} onValueChange={(v) => handleSelectChange('formato_cierre_caja', v)}>
                                    <SelectTrigger className="h-10 border-indigo-200 bg-indigo-50/30 text-indigo-700 font-bold"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="pos_80mm">Ticket 80mm (POS)</SelectItem>
                                        <SelectItem value="carta">Carta (Hoja 8.5 x 11)</SelectItem>
                                    </SelectContent>
                                </Select>
                                <p className="text-[10px] text-gray-500 italic">
                                    Formato del impreso al cerrar el turno en Cierre de Caja.
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Sección de Financiamiento (Propio / Terceros) */}
                    <div className="border rounded-md p-6 bg-white shadow-inner space-y-4">
                        <h3 className="text-sm font-bold text-emerald-700 uppercase border-b pb-2 mb-4 flex items-center gap-2">
                            <Banknote className="w-4 h-4" /> Financiamiento
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <Label className="text-[11px] font-bold text-gray-700 uppercase">Tipo de Financiamiento</Label>
                                <Select value={formData.financiamiento_tipo} onValueChange={(v) => handleSelectChange('financiamiento_tipo', v)}>
                                    <SelectTrigger className="h-10 border-emerald-200 bg-emerald-50/30 text-emerald-700 font-bold"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="propio">Propio (la empresa financia y cobra)</SelectItem>
                                        <SelectItem value="terceros">Terceros (financiera externa)</SelectItem>
                                    </SelectContent>
                                </Select>
                                <p className="text-[10px] text-gray-500 italic">
                                    En <b>Propio</b> las cuentas por cobrar quedan en esta empresa. En <b>Terceros</b>, al facturar una solicitud financiada se crean automáticamente el préstamo y las cuentas en la empresa financiera seleccionada.
                                </p>
                            </div>

                            {formData.financiamiento_tipo === 'terceros' && (
                                <div className="space-y-2">
                                    <Label className="text-[11px] font-bold text-gray-700 uppercase">Empresa Financiera</Label>
                                    <Select value={formData.financiera_tenant_id || ''} onValueChange={(v) => handleSelectChange('financiera_tenant_id', v || null)}>
                                        <SelectTrigger className="h-10 border-emerald-200 bg-emerald-50/30 text-emerald-700 font-bold"><SelectValue placeholder="Seleccione la financiera..." /></SelectTrigger>
                                        <SelectContent>
                                            {financieras.length === 0 && <SelectItem value="__none__" disabled>No hay empresas financieras</SelectItem>}
                                            {financieras.map(f => (
                                                <SelectItem key={f.tenant_id} value={f.tenant_id}>{f.nombre}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <p className="text-[10px] text-gray-500 italic">
                                        La financiera que asumirá las cuentas por cobrar del cliente (ej. MotoPréstamos Los Naranjos).
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Sección de Impresoras WebUSB */}
                    <div className="border rounded-md p-6 bg-[#f0f0f0] shadow-inner">
                        <PrinterSettings />
                    </div>

                    {/* Sección de Integración Fiscal (e-CF) */}
                    <div className="border rounded-md p-6 bg-white shadow-inner space-y-4">
                        <h3 className="text-sm font-bold text-morla-blue uppercase border-b pb-2 mb-4 flex items-center gap-2">
                           <Zap className="w-4 h-4" /> Integración Fiscal / Facturación Electrónica (e-CF)
                        </h3>
                        <p className="text-[10px] text-gray-500 italic -mt-2 mb-3">
                            Conecta tu cuenta de facturación electrónica para emitir comprobantes fiscales electrónicos (e-CF) directamente desde el sistema.
                            Cada empresa configura su propio proveedor de forma independiente.
                        </p>
                        <IntegracionFiscalSettings />
                    </div>

                    {/* Sección de Extensión de WhatsApp (Cotización + Cobranza) */}
                    <div className="border rounded-md p-6 bg-white shadow-inner space-y-3">
                        <h3 className="text-sm font-bold text-emerald-700 uppercase border-b pb-2 mb-2 flex items-center gap-2">
                           <MessageCircle className="w-4 h-4" /> Extensión de WhatsApp (Cotización y Cobranza)
                        </h3>
                        <p className="text-xs text-slate-700">
                            Panel dentro de <b>WhatsApp Web</b> para cotizar y enviar recordatorios de cobro a clientes con facturas vencidas.
                            Cada usuario entra con su correo y clave de MotoFlow y ve solo los datos de su empresa.
                        </p>
                        <div className="flex items-center gap-2 flex-wrap">
                            <a
                                href={WHATSAPP_EXTENSION_DOWNLOAD_URL}
                                download
                                className="inline-flex items-center gap-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[11px] font-bold"
                            >
                                <Download className="w-3 h-3" /> Descargar extension actual (ZIP)
                            </a>
                            <a
                                href={OMNI_BETA_EXTENSION_DOWNLOAD_URL}
                                download
                                className="inline-flex items-center gap-1 px-3 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded text-[11px] font-bold"
                            >
                                <Download className="w-3 h-3" /> Descargar Omni Beta (ZIP)
                            </a>
                        </div>

                        <div className="flex items-center gap-3 flex-wrap pt-2 border-t mt-1">
                            <Label htmlFor="cobranza_hora_corte" className="text-xs font-bold text-slate-700">
                                Hora de corte para "Para reenviar"
                            </Label>
                            <Input
                                id="cobranza_hora_corte"
                                type="time"
                                value={formData.cobranza_hora_corte}
                                onChange={handleInputChange}
                                className="w-32 h-8 text-sm"
                            />
                        </div>
                        <p className="text-[10px] text-gray-500 italic">
                            Un cliente que prometió venir hoy aparece en la lista "Para reenviar" solo después de esta hora
                            (ej. 10 min antes del cierre). Así le das chance de llegar antes de volver a contactarlo.
                        </p>

                        <div className="flex items-center gap-3 flex-wrap pt-2 border-t mt-1">
                            <Label htmlFor="mora_pct_default" className="text-xs font-bold text-slate-700">
                                Mora % mensual (financiera)
                            </Label>
                            <Input
                                id="mora_pct_default"
                                type="number"
                                step="0.01"
                                value={formData.mora_pct_default}
                                onChange={handleInputChange}
                                className="w-24 h-8 text-sm text-right"
                            />
                        </div>
                        <p className="text-[10px] text-gray-500 italic">
                            Tasa de mora mensual usada cuando el cliente y el préstamo no tienen tasa propia (0).
                            Se prorratea por día de atraso, igual que el sistema viejo. Ej: 4 = 4% mensual.
                        </p>

                        <div className="flex items-center gap-3 flex-wrap pt-2 border-t mt-1">
                            <Label htmlFor="cobranza_buscador_telefono" className="text-xs font-bold text-slate-700">
                                Teléfono del buscador (cobranza)
                            </Label>
                            <Input
                                id="cobranza_buscador_telefono"
                                type="tel"
                                value={formData.cobranza_buscador_telefono}
                                onChange={handleInputChange}
                                placeholder="Ej: 8095551234"
                                className="w-44 h-8 text-sm"
                            />
                        </div>
                        <p className="text-[10px] text-gray-500 italic">
                            Cuando marcas "Ir a buscar" en la lista de cobranza, la extensión manda al WhatsApp de este número
                            un PDF con los datos del cliente (dirección, referencias, teléfonos) para ir a localizarlo.
                        </p>
                        <details className="text-[11px] text-slate-600">
                            <summary className="cursor-pointer hover:text-emerald-700 font-bold">Instrucciones de instalación</summary>
                            <ol className="list-decimal ml-5 mt-2 space-y-1">
                                <li>Descarga el ZIP y descomprímelo en una carpeta fija (que no se borre), ej. <code className="bg-gray-100 px-1 rounded">Documentos\MotoFlow</code></li>
                                <li>Abre Google Chrome y entra a <code className="bg-gray-100 px-1 rounded">chrome://extensions</code></li>
                                <li>Activa arriba a la derecha el <b>Modo de desarrollador</b></li>
                                <li>Clic en <b>Cargar descomprimida</b> y selecciona la carpeta descomprimida</li>
                                <li>Abre <code className="bg-gray-100 px-1 rounded">web.whatsapp.com</code> con el teléfono de la empresa</li>
                                <li>En el panel MotoFlow toca <b>Conectar</b> e inicia sesión con tu correo y clave de MotoFlow</li>
                            </ol>
                            <p className="mt-2 italic">⚠️ No borres ni muevas la carpeta de la extensión. Para actualizar: descarga el ZIP nuevo, reemplaza la carpeta y toca ↻ en chrome://extensions.</p>
                        </details>
                    </div>

                </CardContent>
                <CardFooter className="bg-gray-50 border-t p-6 flex justify-end gap-3">
                    <Button variant="outline" onClick={fetchData} disabled={saving}>Revertir Cambios</Button>
                    <Button onClick={handleSave} disabled={saving} className="bg-morla-blue hover:bg-morla-blue/90 px-10">
                        {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                        Actualizar
                    </Button>
                </CardFooter>
            </Card>
        </div>
    );
};

export default ConfiguracionSistemaPage;

