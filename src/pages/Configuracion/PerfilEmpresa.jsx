import React, { useState, useEffect, useCallback } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Save, Loader2, Building2, Upload, Image } from 'lucide-react';

const PerfilEmpresa = () => {
  const { toast } = useToast();
  const { profile } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [tenant, setTenant] = useState(null);

  const fetchTenant = useCallback(async () => {
    if (!profile?.tenant_id) return;
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('tenants')
        .select('*')
        .eq('id', profile.tenant_id)
        .single();
      if (error) throw error;
      setTenant(data);
    } catch (err) {
      toast({ variant: 'destructive', title: 'Error', description: 'No se pudo cargar el perfil de empresa.' });
    }
    setIsLoading(false);
  }, [profile?.tenant_id, toast]);

  useEffect(() => {
    fetchTenant();
  }, [fetchTenant]);

  const handleChange = (field, value) => {
    setTenant(prev => ({ ...prev, [field]: value }));
  };

  const handleLogoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setIsUploading(true);
    try {
      const ext = file.name.split('.').pop();
      const fileName = `company/logo_tenant_${profile.tenant_id}_${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from('product-images')
        .upload(fileName, file, { upsert: true });
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from('product-images').getPublicUrl(fileName);
      handleChange('logo_url', urlData.publicUrl);
      toast({ title: 'Logo subido', description: 'El logo se ha cargado correctamente.' });
    } catch (err) {
      toast({ variant: 'destructive', title: 'Error', description: 'No se pudo subir el logo: ' + err.message });
    }
    setIsUploading(false);
  };

  const handleSave = async () => {
    if (!tenant) return;
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('tenants')
        .update({
          nombre: tenant.nombre,
          rnc: tenant.rnc,
          direccion: tenant.direccion,
          telefono: tenant.telefono,
          email: tenant.email,
          logo_url: tenant.logo_url,
          updated_at: new Date().toISOString(),
        })
        .eq('id', tenant.id);

      if (error) throw error;

      // Sync with config_empresa for backward compatibility
      await supabase
        .from('config_empresa')
        .update({
          nombre: tenant.nombre,
          rnc: tenant.rnc,
          direccion1: tenant.direccion,
          telefono: tenant.telefono,
          email: tenant.email,
          logo_url: tenant.logo_url,
          updated_at: new Date().toISOString(),
        })
        .eq('tenant_id', tenant.id);

      toast({ title: '✅ Guardado', description: 'Perfil de empresa actualizado correctamente.' });
    } catch (err) {
      toast({ variant: 'destructive', title: 'Error al guardar', description: err.message });
    }
    setIsSaving(false);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="h-10 w-10 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!tenant) {
    return (
      <div className="flex items-center justify-center h-[60vh] text-gray-500">
        No se encontró configuración de empresa.
      </div>
    );
  }

  return (
    <>
      <Helmet><title>Perfil de Empresa - MotoFlow</title></Helmet>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="p-4 bg-gray-100 min-h-full"
      >
        <div className="max-w-3xl mx-auto bg-white border border-gray-300 rounded-lg shadow-lg overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-[#0a1e3a] to-[#1a3a5c] text-white px-6 py-4 flex items-center gap-3">
            <Building2 className="w-7 h-7" />
            <div>
              <h1 className="text-xl font-black uppercase tracking-wider">Perfil de Empresa</h1>
              <p className="text-xs text-blue-200 italic">Configuración de datos de tu negocio</p>
            </div>
            <div className="ml-auto text-xs bg-white/10 px-3 py-1 rounded-full font-bold uppercase">
              Plan: {tenant.plan}
            </div>
          </div>

          <div className="p-6 space-y-6">
            {/* Logo Section */}
            <div className="flex items-center gap-6 p-4 bg-gray-50 border border-gray-200 rounded-lg">
              <div className="w-24 h-24 rounded-lg border-2 border-dashed border-gray-300 flex items-center justify-center overflow-hidden bg-white shrink-0">
                {tenant.logo_url ? (
                  <img src={tenant.logo_url} alt="Logo" className="w-full h-full object-contain" />
                ) : (
                  <Image className="w-10 h-10 text-gray-300" />
                )}
              </div>
              <div>
                <Label className="text-sm font-bold text-gray-700 block mb-2">Logo de la Empresa</Label>
                <div className="flex items-center gap-2">
                  <label className="cursor-pointer">
                    <input type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
                    <div className="flex items-center gap-2 px-4 py-2 bg-[#0a1e3a] text-white text-xs font-bold rounded hover:bg-[#0a1e3a]/80 transition-colors">
                      {isUploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
                      {isUploading ? 'Subiendo...' : 'Cambiar Logo'}
                    </div>
                  </label>
                  <span className="text-[10px] text-gray-400 italic">PNG, JPG o SVG (máx. 2MB)</span>
                </div>
              </div>
            </div>

            {/* Form Fields */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <Label className="text-xs font-black text-gray-600 uppercase mb-1 block">Nombre de la Empresa *</Label>
                <Input
                  value={tenant.nombre || ''}
                  onChange={e => handleChange('nombre', e.target.value)}
                  className="h-10 text-sm font-bold border-gray-300 focus:border-blue-500"
                  placeholder="Ej: MotoFlow"
                />
              </div>

              <div>
                <Label className="text-xs font-black text-gray-600 uppercase mb-1 block">RNC</Label>
                <Input
                  value={tenant.rnc || ''}
                  onChange={e => handleChange('rnc', e.target.value)}
                  className="h-10 text-sm font-bold border-gray-300"
                  placeholder="000-00000-0"
                />
              </div>

              <div>
                <Label className="text-xs font-black text-gray-600 uppercase mb-1 block">Teléfono</Label>
                <Input
                  value={tenant.telefono || ''}
                  onChange={e => handleChange('telefono', e.target.value)}
                  className="h-10 text-sm font-bold border-gray-300"
                  placeholder="809-000-0000"
                />
              </div>

              <div className="md:col-span-2">
                <Label className="text-xs font-black text-gray-600 uppercase mb-1 block">Dirección</Label>
                <Input
                  value={tenant.direccion || ''}
                  onChange={e => handleChange('direccion', e.target.value)}
                  className="h-10 text-sm font-bold border-gray-300"
                  placeholder="Calle, Sector, Ciudad"
                />
              </div>

              <div className="md:col-span-2">
                <Label className="text-xs font-black text-gray-600 uppercase mb-1 block">Email</Label>
                <Input
                  type="email"
                  value={tenant.email || ''}
                  onChange={e => handleChange('email', e.target.value)}
                  className="h-10 text-sm font-bold border-gray-300"
                  placeholder="info@miempresa.com"
                />
              </div>
            </div>

            {/* Info badges */}
            <div className="flex flex-wrap gap-2">
              <div className="bg-blue-50 text-blue-700 text-[10px] font-bold px-3 py-1 rounded-full border border-blue-200 uppercase">
                Plan: {tenant.plan}
              </div>
              {tenant.feat_carta_ruta && (
                <div className="bg-green-50 text-green-700 text-[10px] font-bold px-3 py-1 rounded-full border border-green-200 uppercase">
                  ✓ Carta de Ruta
                </div>
              )}
              {tenant.feat_cobranzas && (
                <div className="bg-green-50 text-green-700 text-[10px] font-bold px-3 py-1 rounded-full border border-green-200 uppercase">
                  ✓ Cobranzas
                </div>
              )}
              {!tenant.feat_carta_ruta && (
                <div className="bg-gray-100 text-gray-400 text-[10px] font-bold px-3 py-1 rounded-full border border-gray-200 uppercase">
                  ✗ Carta de Ruta
                </div>
              )}
              {!tenant.feat_cobranzas && (
                <div className="bg-gray-100 text-gray-400 text-[10px] font-bold px-3 py-1 rounded-full border border-gray-200 uppercase">
                  ✗ Cobranzas
                </div>
              )}
            </div>

            {/* Save Button */}
            <div className="flex justify-end pt-2 border-t border-gray-200">
              <Button
                onClick={handleSave}
                disabled={isSaving}
                className="h-10 px-8 bg-[#0a1e3a] hover:bg-[#0a1e3a]/90 text-white font-bold uppercase text-sm flex items-center gap-2"
              >
                {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Guardar Cambios
              </Button>
            </div>
          </div>
        </div>
      </motion.div>
    </>
  );
};

export default PerfilEmpresa;
