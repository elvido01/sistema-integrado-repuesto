import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Save, Upload, Trash2, Building2, Globe, Phone, Mail, FileText, Coins, Percent, Calendar as CalendarIcon, Image as ImageIcon, Target } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const CONFIG_ID = '00000000-0000-0000-0000-000000000001';

const ConfiguracionSistemaPage = () => {
    const { toast } = useToast();
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
        incremento_meta_pct: 0,
        intervalo_meta: 'Ninguno',
        fecha_inicio_meta: null,
        tenant_id: '00000000-0000-0000-0000-000000000001',
        limpiar_ordenes_compra_auto: true,
        modo_limpieza_orden: 'agresivo'
    });

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
                .eq('id', CONFIG_ID)
                .single();

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
                    incremento_meta_pct: data.incremento_meta_pct || 0,
                    intervalo_meta: data.intervalo_meta || 'Ninguno',
                    fecha_inicio_meta: data.fecha_inicio_meta || null,
                    tenant_id: data.tenant_id || CONFIG_ID,
                    limpiar_ordenes_compra_auto: data.limpiar_ordenes_compra_auto ?? true,
                    modo_limpieza_orden: data.modo_limpieza_orden || 'agresivo'
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
            let dataToSave = { ...formData, updated_at: new Date().toISOString() };
            
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

            const { error: saveError } = await supabase
                .from('config_empresa')
                .upsert({
                    id: CONFIG_ID,
                    ...dataToSave,
                    // Asegurar que si es nulo o vacío se vaya como null para evitar errores de timestamp
                    fecha_inicio_meta: dataToSave.fecha_inicio_meta || null
                });

            if (saveError) throw saveError;
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

                    {/* Dynamic Goals Settings Section */}
                    <div className="border rounded-md p-6 bg-white shadow-inner space-y-6">
                        <h3 className="text-sm font-bold text-morla-blue uppercase border-b pb-2 mb-4 flex items-center gap-2">
                           <Target className="w-4 h-4" /> Configuración de Objetivos de Ventas (Auto-Escalable)
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div className="space-y-1.5">
                                <Label className="text-[11px] font-bold text-gray-700 uppercase">Meta Original Mensual</Label>
                                <div className="flex items-center">
                                    <div className="bg-gray-200 border border-r-0 h-10 px-3 flex items-center justify-center rounded-l-md text-xs font-bold text-gray-500">RD$</div>
                                    <Input id="meta_ventas" type="number" value={formData.meta_ventas} onChange={handleNumberChange} className="h-10 rounded-l-none font-bold text-indigo-700 text-lg" />
                                </div>
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
                                   * La meta empezó a calcularse el <b>{new Date(formData.fecha_inicio_meta).toLocaleDateString()}</b>.  El Dashboard aplicará interés compuesto del +{formData.incremento_meta_pct}% de forma {formData.intervalo_meta.toLowerCase()} automáticamente para desafiar a tu negocio.
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
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
