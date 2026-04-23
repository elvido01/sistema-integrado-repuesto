import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Wifi, WifiOff, Eye, EyeOff, Shield, Trash2, Save, Zap } from 'lucide-react';

const PROVEEDORES = [
  {
    id: 'alegra',
    nombre: 'Alegra',
    descripcion: 'Facturación electrónica para RD (e-CF)',
    campos: [
      { key: 'user', label: 'Usuario / Email', type: 'text', placeholder: 'tu@email.com' },
      { key: 'token', label: 'Token API', type: 'password', placeholder: 'Token de integración manual' },
    ],
    apiBase: 'https://api.alegra.com/api/v1',
    testEndpoint: '/companies',
  },
  {
    id: 'factura_digital',
    nombre: 'FacturaDigital',
    descripcion: 'Proveedor alternativo de facturación electrónica RD',
    campos: [
      { key: 'api_key', label: 'API Key', type: 'password', placeholder: 'Tu API Key' },
      { key: 'secret', label: 'Secret Key', type: 'password', placeholder: 'Tu Secret Key' },
    ],
    apiBase: '',
    testEndpoint: '',
  },
];

const IntegracionFiscalSettings = () => {
  const { toast } = useToast();
  const { tenantId } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [showSecrets, setShowSecrets] = useState({});

  const [integracion, setIntegracion] = useState(null); // registro existente o null
  const [proveedor, setProveedor] = useState('alegra');
  const [config, setConfig] = useState({});
  const [activo, setActivo] = useState(false);
  const [modo, setModo] = useState('pruebas');
  const [ultimoTest, setUltimoTest] = useState(null);

  const proveedorInfo = PROVEEDORES.find(p => p.id === proveedor) || PROVEEDORES[0];

  const fetchIntegracion = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('integraciones_fiscales')
        .select('*')
        .eq('tenant_id', tenantId)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') throw error;

      if (data) {
        setIntegracion(data);
        setProveedor(data.proveedor || 'alegra');
        setConfig(data.config || {});
        setActivo(data.activo || false);
        setModo(data.modo || 'pruebas');
        setUltimoTest(data.ultimo_test);
      } else {
        setIntegracion(null);
        setProveedor('alegra');
        setConfig({});
        setActivo(false);
        setModo('pruebas');
        setUltimoTest(null);
      }
    } catch (err) {
      console.error('Error fetching integracion fiscal:', err);
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    fetchIntegracion();
  }, [fetchIntegracion]);

  const handleConfigChange = (key, value) => {
    setConfig(prev => ({ ...prev, [key]: value }));
  };

  const toggleSecret = (key) => {
    setShowSecrets(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSave = async () => {
    // Validar que todos los campos requeridos están llenos
    const camposVacios = proveedorInfo.campos.filter(c => !config[c.key]?.trim());
    if (camposVacios.length > 0) {
      toast({
        variant: 'destructive',
        title: 'Campos requeridos',
        description: `Completa: ${camposVacios.map(c => c.label).join(', ')}`,
      });
      return;
    }

    setSaving(true);
    try {
      const payload = {
        tenant_id: tenantId,
        proveedor,
        config,
        activo,
        modo,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from('integraciones_fiscales')
        .upsert(payload, { onConflict: 'tenant_id' });

      if (error) throw error;

      toast({ title: 'Integración guardada', description: 'La configuración fiscal ha sido actualizada.' });
      await fetchIntegracion();
    } catch (err) {
      toast({ variant: 'destructive', title: 'Error', description: err.message });
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    if (!config.user && !config.api_key) {
      toast({ variant: 'destructive', title: 'Error', description: 'Ingresa las credenciales primero.' });
      return;
    }

    setTesting(true);
    try {
      // Llamar a Edge Function para probar conexión (no exponemos token en frontend)
      const { data: { session } } = await supabase.auth.getSession();

      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/emitir-fiscal`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          action: 'test_connection',
          proveedor,
          config,
        }),
      });

      const result = await resp.json();

      if (result.ok) {
        // Guardar último test exitoso
        await supabase
          .from('integraciones_fiscales')
          .update({ ultimo_test: new Date().toISOString() })
          .eq('tenant_id', tenantId);

        setUltimoTest(new Date().toISOString());
        toast({ title: 'Conexión exitosa', description: `Conectado a ${proveedorInfo.nombre} correctamente.` });
      } else {
        toast({ variant: 'destructive', title: 'Error de conexión', description: result.error || 'No se pudo conectar.' });
      }
    } catch (err) {
      toast({ variant: 'destructive', title: 'Error', description: 'No se pudo probar la conexión: ' + err.message });
    } finally {
      setTesting(false);
    }
  };

  const handleDesactivar = async () => {
    if (!integracion) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('integraciones_fiscales')
        .update({ activo: false, updated_at: new Date().toISOString() })
        .eq('tenant_id', tenantId);

      if (error) throw error;
      setActivo(false);
      toast({ title: 'Integración desactivada', description: 'La facturación electrónica ha sido desactivada.' });
    } catch (err) {
      toast({ variant: 'destructive', title: 'Error', description: err.message });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Estado actual */}
      <div className={`flex items-center justify-between p-3 rounded-lg border ${
        activo ? 'bg-emerald-50 border-emerald-200' : 'bg-gray-50 border-gray-200'
      }`}>
        <div className="flex items-center gap-2">
          {activo ? (
            <Wifi className="w-4 h-4 text-emerald-600" />
          ) : (
            <WifiOff className="w-4 h-4 text-gray-400" />
          )}
          <span className={`text-xs font-bold uppercase ${activo ? 'text-emerald-700' : 'text-gray-500'}`}>
            {activo ? `Conectado a ${proveedorInfo.nombre}` : 'Sin integración activa'}
          </span>
        </div>
        {ultimoTest && (
          <span className="text-[10px] text-gray-400">
            Última prueba: {new Date(ultimoTest).toLocaleDateString('es-DO', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
          </span>
        )}
      </div>

      {/* Selector de proveedor */}
      <div className="space-y-1.5">
        <Label className="text-[11px] font-bold text-gray-700 uppercase">Proveedor de Facturación Electrónica</Label>
        <Select value={proveedor} onValueChange={(v) => { setProveedor(v); setConfig({}); setShowSecrets({}); }}>
          <SelectTrigger className="h-10 font-bold">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PROVEEDORES.map(p => (
              <SelectItem key={p.id} value={p.id}>
                {p.nombre} — <span className="text-gray-400 text-xs">{p.descripcion}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Campos dinámicos según proveedor */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {proveedorInfo.campos.map(campo => (
          <div key={campo.key} className="space-y-1.5">
            <Label className="text-[11px] font-bold text-gray-700 uppercase">{campo.label}</Label>
            <div className="relative">
              <Input
                type={campo.type === 'password' && !showSecrets[campo.key] ? 'password' : 'text'}
                value={config[campo.key] || ''}
                onChange={(e) => handleConfigChange(campo.key, e.target.value)}
                placeholder={campo.placeholder}
                className="h-10 pr-10"
              />
              {campo.type === 'password' && (
                <button
                  type="button"
                  onClick={() => toggleSecret(campo.key)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  tabIndex={-1}
                >
                  {showSecrets[campo.key] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Modo */}
      <div className="space-y-1.5">
        <Label className="text-[11px] font-bold text-gray-700 uppercase">Modo</Label>
        <Select value={modo} onValueChange={setModo}>
          <SelectTrigger className="h-10 w-56 font-bold">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="pruebas">Pruebas (sandbox)</SelectItem>
            <SelectItem value="produccion">Producción</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-[10px] text-gray-500 italic">
          En modo pruebas las facturas no se envían a la DGII.
        </p>
      </div>

      {/* Activar / Desactivar */}
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={activo}
            onChange={(e) => setActivo(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
          />
          <span className="text-xs font-bold text-gray-700 uppercase">Activar facturación electrónica</span>
        </label>
      </div>

      {/* Botones */}
      <div className="flex flex-wrap gap-2 pt-2">
        <Button
          onClick={handleTestConnection}
          disabled={testing || saving}
          variant="outline"
          className="gap-1.5 text-xs font-bold"
        >
          {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
          Probar Conexión
        </Button>

        <Button
          onClick={handleSave}
          disabled={saving || testing}
          className="gap-1.5 text-xs font-bold bg-blue-600 hover:bg-blue-700"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Guardar Integración
        </Button>

        {integracion && activo && (
          <Button
            onClick={handleDesactivar}
            disabled={saving}
            variant="outline"
            className="gap-1.5 text-xs font-bold text-red-600 border-red-200 hover:bg-red-50"
          >
            <WifiOff className="w-4 h-4" />
            Desactivar
          </Button>
        )}
      </div>
    </div>
  );
};

export default IntegracionFiscalSettings;
