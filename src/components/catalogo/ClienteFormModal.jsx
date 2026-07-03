import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2 } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from '@/components/ui/textarea';

// Ficha extendida (formulario fisico "DATOS DE CLIENTE") — solo empresas dealer.
const emptyFicha = () => ({
  apodo: '',
  // Direccion desglosada
  numero: '',
  barrio: '',
  ciudad: '',
  casa_propia: false,
  color_casa: '',
  apartamento: '',
  cerca_de: '',
  telefono_casa: '',
  // Trabajo
  cargo: '',
  lugar_trabajo: '',
  lugar_trabajo_tel: '',
  nombre_jefe: '',
  direccion_trabajo: '',
  telefono_trabajo: '',
  // Conyuge / familia
  conyuge_nombre: '',
  conyuge_tel: '',
  papa_nombre: '',
  papa_tel: '',
  papa_direccion: '',
  mama_nombre: '',
  mama_tel: '',
  mama_direccion: '',
  // Referencias
  ref1_nombre: '',
  ref1_tel: '',
  ref1_direccion: '',
  ref2_nombre: '',
  ref2_tel: '',
  ref2_direccion: '',
  // Otros
  observaciones: '',
});

const ClienteFormModal = ({ cliente, isOpen, onClose, prefill }) => {
  const { toast } = useToast();
  const { empresa } = useAuth();
  const isDealer = !!empresa?.feat_cliente_dealer;
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Cliente existente detectado al teclear el código (para cargar sus datos y
  // actualizarlo en vez de crear un duplicado).
  const [matchedId, setMatchedId] = useState(null);
  const [formData, setFormData] = useState({
    // Personal Info
    codigo: '',
    nombre: '',
    rnc: '',
    telefono: '',
    email: '',
    logo_url: '',
    direccion: '',
    activo: true,
    // Credit Info
    autorizar_credito: false,
    limite_credito: 0,
    dias_credito: 0,
    mora_pct: 0,
    generar_mora: true, // cotejo "Generar Cargos por Atrasos (MORA)?"
    tipo_ncf: '02', // Consumidor Final
    precio_nivel: 1,
  });
  const showMora = isDealer || !!empresa?.feat_financiera;
  const [ficha, setFicha] = useState(emptyFicha());
  const [activeTab, setActiveTab] = useState('personal');

  // Orden de las pestañas (el flujo "Siguiente" las recorre en este orden)
  const tabOrder = isDealer ? ['personal', 'dealer', 'credito'] : ['personal', 'credito'];
  const currentTabIndex = tabOrder.indexOf(activeTab);
  const isLastTab = currentTabIndex >= tabOrder.length - 1;

  useEffect(() => {
    if (isOpen) {
      setActiveTab('personal');
      setMatchedId(null);
      if (cliente) {
        setFormData({
          codigo: cliente.codigo || '',
          nombre: cliente.nombre || '',
          rnc: cliente.rnc || '',
          telefono: cliente.telefono || '',
          email: cliente.email || '',
          logo_url: cliente.logo_url || '',
          direccion: cliente.direccion || '',
          activo: cliente.activo ?? true,
          autorizar_credito: cliente.autorizar_credito ?? false,
          limite_credito: cliente.limite_credito || 0,
          dias_credito: cliente.dias_credito || 0,
          mora_pct: cliente.mora_pct || 0,
          generar_mora: cliente.generar_mora ?? true,
          tipo_ncf: cliente.tipo_ncf || '02',
          precio_nivel: cliente.precio_nivel || 1,
        });
        // Mezcla con la ficha vacia para garantizar todas las llaves
        setFicha({ ...emptyFicha(), ...(cliente.ficha_dealer || {}) });
      } else {
        // Cliente nuevo. Si viene prefill (ej. desde Solicitudes), precargar
        // nombre + cedula/RNC (codigo = cedula) manteniendo modo INSERTAR.
        setFormData({
          codigo: prefill?.codigo || prefill?.rnc || '',
          nombre: prefill?.nombre || '',
          rnc: prefill?.rnc || '',
          telefono: prefill?.telefono || '',
          email: '',
          logo_url: '',
          direccion: '',
          activo: true,
          autorizar_credito: prefill?.autorizar_credito ?? false,
          limite_credito: prefill?.limite_credito || 0,
          dias_credito: prefill?.dias_credito || 0,
          mora_pct: prefill?.mora_pct || 0,
          generar_mora: prefill?.generar_mora ?? true,
          tipo_ncf: '02',
          precio_nivel: 1,
        });
        setFicha(emptyFicha());
      }
    }
  }, [cliente, isOpen, prefill]);

  // Al CREAR: si el código tecleado coincide EXACTO con un cliente existente
  // (de esta empresa, vía RLS), carga sus datos para no llenar el formulario en
  // balde; al guardar se actualiza ese cliente en vez de crear un duplicado.
  useEffect(() => {
    if (!isOpen || cliente) return; // solo en modo crear
    const codigo = String(formData.codigo || '').trim();
    if (!codigo) { setMatchedId(null); return; }
    let cancel = false;
    const timer = setTimeout(async () => {
      const { data, error } = await supabase
        .from('clientes')
        .select('*')
        .eq('codigo', codigo)
        .limit(1);
      if (cancel) return;
      const row = data && data[0];
      if (error || !row) { setMatchedId(null); return; }
      setMatchedId(row.id);
      setFormData({
        codigo: row.codigo || '',
        nombre: row.nombre || '',
        rnc: row.rnc || '',
        telefono: row.telefono || '',
        email: row.email || '',
        logo_url: row.logo_url || '',
        direccion: row.direccion || '',
        activo: row.activo ?? true,
        autorizar_credito: row.autorizar_credito ?? false,
        limite_credito: row.limite_credito || 0,
        dias_credito: row.dias_credito || 0,
        mora_pct: row.mora_pct || 0,
        generar_mora: row.generar_mora ?? true,
        tipo_ncf: row.tipo_ncf || '02',
        precio_nivel: row.precio_nivel || 1,
      });
      setFicha({ ...emptyFicha(), ...(row.ficha_dealer || {}) });
      toast({
        title: 'Cliente existente',
        description: `Se cargaron los datos de "${row.nombre}". Al guardar se actualizarán.`,
      });
    }, 450);
    return () => { cancel = true; clearTimeout(timer); };
  }, [formData.codigo, isOpen, cliente]);

  const handleChange = (e) => {
    const { name, value, type } = e.target;
    const parsedValue = type === 'number' ? parseFloat(value) || 0 : value;
    setFormData((prev) => ({ ...prev, [name]: parsedValue }));
  };

  const handleCheckedChange = (name, checked) => {
    setFormData((prev) => ({ ...prev, [name]: checked }));
  };

  const handleSelectChange = (name, value) => {
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleFicha = (e) => {
    const { name, value } = e.target;
    setFicha((prev) => ({ ...prev, [name]: value }));
  };

  const handleFichaChecked = (name, checked) => {
    setFicha((prev) => ({ ...prev, [name]: checked }));
  };

  // Helper para renderizar un campo de la ficha (funcion, NO componente:
  // llamarla inline no remonta el input ni pierde el foco al teclear).
  const fField = (name, label, props = {}) => (
    <div className="space-y-2" key={name}>
      <Label htmlFor={`f_${name}`}>{label}</Label>
      <Input id={`f_${name}`} name={name} value={ficha[name] || ''} onChange={handleFicha} {...props} />
    </div>
  );

  // Campos obligatorios (todos en la pestaña "Información Personal")
  const validatePersonal = () => {
    const missing = [];
    if (!String(formData.codigo || '').trim()) missing.push('Código');
    if (!String(formData.nombre || '').trim()) missing.push('Nombre/Razón Social');
    if (!String(formData.rnc || '').trim()) missing.push('RNC/Cédula');
    if (!String(formData.telefono || '').trim()) missing.push('Teléfono / Celular');
    if (missing.length) {
      setActiveTab('personal');
      toast({
        title: 'Faltan datos obligatorios',
        description: `Completa: ${missing.join(', ')}.`,
        variant: 'destructive',
      });
      return false;
    }
    return true;
  };

  // Evita que Enter cierre/envíe el formulario desde un input
  // (en textarea Enter sigue funcionando para saltar de línea).
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') {
      e.preventDefault();
    }
  };

  const handleNext = () => {
    if (activeTab === 'personal' && !validatePersonal()) return;
    setActiveTab(tabOrder[currentTabIndex + 1]);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    // Blindaje: si el submit se dispara SIN estar en la última pestaña
    // (p.ej. el botón "Siguiente" que React convierte a type=submit al pasar a
    // la última pestaña, o un Enter), avanzamos en vez de guardar/cerrar.
    // Solo se guarda cuando el usuario está en la última pestaña.
    if (!isLastTab) { handleNext(); return; }
    if (!validatePersonal()) return;
    setIsSubmitting(true);

    const dataToSubmit = {
      ...formData,
      limite_credito: formData.autorizar_credito ? formData.limite_credito : 0,
      dias_credito: formData.autorizar_credito ? formData.dias_credito : 0,
    };
    // mora_pct / generar_mora solo para empresas dealer/financiera (evita romper donde no existe la columna)
    if (!showMora) {
      delete dataToSubmit.mora_pct;
      delete dataToSubmit.generar_mora;
    } else {
      dataToSubmit.mora_pct = parseFloat(formData.mora_pct) || 0;
      dataToSubmit.generar_mora = !!formData.generar_mora;
    }
    if (isDealer) {
      dataToSubmit.ficha_dealer = ficha;
    }

    // Actualiza si es edición (prop cliente) o si el código coincidió con un
    // cliente existente al teclearlo (matchedId). Si no, inserta uno nuevo.
    const targetId = cliente?.id || matchedId;
    let result;
    if (targetId) {
      result = await supabase.from('clientes').update(dataToSubmit).eq('id', targetId).select();
    } else {
      result = await supabase.from('clientes').insert(dataToSubmit).select();
    }

    const { error } = result;

    if (error) {
      let msg = error.message;
      if (msg.includes('clientes_rnc_key') || msg.includes('clientes_rnc_unique')) {
        msg = 'Ya existe un cliente con ese RNC/Cédula.';
      } else if (msg.includes('clientes_codigo_key') || msg.includes('unique') && msg.includes('codigo')) {
        msg = 'Ya existe un cliente con ese código.';
      } else if (msg.includes('duplicate key')) {
        msg = 'Ya existe un registro con esos datos. Verifique el código o RNC.';
      }
      toast({
        title: 'Error al guardar cliente',
        description: msg,
        variant: 'destructive',
      });
    } else {
      toast({
        title: 'Éxito',
        description: `Cliente ${targetId ? 'actualizado' : 'creado'} correctamente.`,
      });
      onClose(true); // pass true to indicate success and trigger refresh
    }
    setIsSubmitting(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{(cliente || matchedId) ? 'Editar Cliente' : 'Crear Cliente'}</DialogTitle>
          <DialogDescription>
            {(cliente || matchedId) ? 'Actualiza la información de este cliente.' : 'Crea un nuevo cliente en el sistema.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} onKeyDown={handleKeyDown}>
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className={`grid w-full ${isDealer ? 'grid-cols-3' : 'grid-cols-2'}`}>
              <TabsTrigger value="personal">Información Personal</TabsTrigger>
              {isDealer && <TabsTrigger value="dealer">Trabajo y Referencias</TabsTrigger>}
              <TabsTrigger value="credito">Crédito y Facturación</TabsTrigger>
            </TabsList>
            <TabsContent value="personal" className="py-4 space-y-4">
              {matchedId && !cliente && (
                <div className="text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-3 py-2">
                  Ya existe un cliente con ese código: se cargaron sus datos. Al guardar se <b>actualizará</b> (no se crea duplicado).
                </div>
              )}
              {isDealer ? (
                <>
                  <div className="grid grid-cols-[11rem_1fr] gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="codigo">Código</Label>
                      <Input id="codigo" name="codigo" value={formData.codigo} onChange={handleChange} maxLength={14} placeholder="Ej: C001" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="nombre">Nombre/Razón Social</Label>
                      <Input id="nombre" name="nombre" value={formData.nombre} onChange={handleChange} required />
                    </div>
                  </div>
                  <div className="grid grid-cols-[11rem_1fr] gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="rnc">RNC/Cédula</Label>
                      <Input id="rnc" name="rnc" value={formData.rnc} onChange={handleChange} maxLength={14} />
                    </div>
                    {fField('apodo', 'Apodo')}
                  </div>
                </>
              ) : (
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="codigo">Código</Label>
                    <Input id="codigo" name="codigo" value={formData.codigo} onChange={handleChange} placeholder="Ej: C001" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="nombre">Nombre/Razón Social</Label>
                    <Input id="nombre" name="nombre" value={formData.nombre} onChange={handleChange} required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="rnc">RNC/Cédula</Label>
                    <Input id="rnc" name="rnc" value={formData.rnc} onChange={handleChange} />
                  </div>
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="direccion">Dirección (calle)</Label>
                <Textarea id="direccion" name="direccion" value={formData.direccion} onChange={handleChange} />
              </div>
              {isDealer && (
                <div className="grid grid-cols-3 gap-4 p-3 border rounded-md bg-gray-50">
                  {fField('numero', 'No. de casa')}
                  {fField('barrio', 'Barrio / Sector')}
                  {fField('ciudad', 'Ciudad')}
                  {fField('color_casa', 'Color de la casa')}
                  {fField('apartamento', 'Apartamento (nombre y color)')}
                  {fField('cerca_de', 'Cerca de')}
                  {fField('telefono_casa', 'Teléfono de casa')}
                  <div className="flex items-center space-x-2 pt-7">
                    <Checkbox id="casa_propia" checked={!!ficha.casa_propia} onCheckedChange={(checked) => handleFichaChecked('casa_propia', checked)} />
                    <Label htmlFor="casa_propia">Casa propia</Label>
                  </div>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="telefono">Teléfono / Celular</Label>
                  <Input id="telefono" name="telefono" value={formData.telefono} onChange={handleChange} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" name="email" type="email" value={formData.email} onChange={handleChange} />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="logo_url">Logo / foto URL</Label>
                <Input id="logo_url" name="logo_url" value={formData.logo_url} onChange={handleChange} placeholder="https://..." />
              </div>
              <div className="flex items-center space-x-2 pt-2">
                <Checkbox id="activo" checked={formData.activo} onCheckedChange={(checked) => handleCheckedChange('activo', checked)} />
                <Label htmlFor="activo">Cliente Activo</Label>
              </div>
            </TabsContent>
            {isDealer && (
              <TabsContent value="dealer" className="py-4 space-y-5">
                <div>
                  <h4 className="text-sm font-semibold text-gray-700 mb-2">Trabajo</h4>
                  <div className="grid grid-cols-3 gap-4">
                    {fField('cargo', 'Cargo / Ocupación')}
                    {fField('lugar_trabajo', 'Lugar de trabajo')}
                    {fField('lugar_trabajo_tel', 'Tel. lugar de trabajo')}
                    {fField('nombre_jefe', 'Nombre del jefe')}
                    {fField('direccion_trabajo', 'Dirección del trabajo')}
                    {fField('telefono_trabajo', 'Teléfono del trabajo')}
                  </div>
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-gray-700 mb-2">Cónyuge / Familia</h4>
                  <div className="grid grid-cols-3 gap-4">
                    {fField('conyuge_nombre', 'Nombre cónyuge (esposo/a)')}
                    {fField('conyuge_tel', 'Tel. cónyuge')}
                    <div />
                    {fField('papa_nombre', 'Nombre del papá')}
                    {fField('papa_tel', 'Tel. papá')}
                    {fField('papa_direccion', 'Dirección del papá')}
                    {fField('mama_nombre', 'Nombre de la mamá')}
                    {fField('mama_tel', 'Tel. mamá')}
                    {fField('mama_direccion', 'Dirección de la mamá')}
                  </div>
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-gray-700 mb-2">Referencias</h4>
                  <div className="grid grid-cols-3 gap-4">
                    {fField('ref1_nombre', 'Referente 1')}
                    {fField('ref1_tel', 'Tel. referente 1')}
                    {fField('ref1_direccion', 'Dirección referente 1')}
                    {fField('ref2_nombre', 'Referente 2')}
                    {fField('ref2_tel', 'Tel. referente 2')}
                    {fField('ref2_direccion', 'Dirección referente 2')}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="f_observaciones">Observaciones</Label>
                  <Textarea id="f_observaciones" name="observaciones" value={ficha.observaciones || ''} onChange={handleFicha} />
                </div>
              </TabsContent>
            )}
            <TabsContent value="credito" className="py-4 space-y-4">
              <div className="flex items-center space-x-2">
                <Checkbox id="autorizar_credito" checked={formData.autorizar_credito} onCheckedChange={(checked) => handleCheckedChange('autorizar_credito', checked)} />
                <Label htmlFor="autorizar_credito">Autorizar Crédito</Label>
              </div>
              {formData.autorizar_credito && (
                <div className={`grid ${showMora ? 'grid-cols-3' : 'grid-cols-2'} gap-4 p-4 border rounded-md bg-gray-50`}>
                  <div className="space-y-2">
                    <Label htmlFor="dias_credito">Días de Crédito</Label>
                    <Input id="dias_credito" name="dias_credito" type="number" value={formData.dias_credito} onChange={handleChange} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="limite_credito">Límite de Crédito</Label>
                    <Input id="limite_credito" name="limite_credito" type="number" value={formData.limite_credito} onChange={handleChange} />
                  </div>
                  {showMora && (
                    <div className="space-y-2">
                      <Label htmlFor="mora_pct">Mora % (por mes atraso)</Label>
                      <Input id="mora_pct" name="mora_pct" type="number" step="0.01" placeholder="Ej: 5" value={formData.mora_pct} onChange={handleChange} />
                    </div>
                  )}
                </div>
              )}
              {showMora && (
                <div className="flex items-center space-x-2 px-1">
                  <Checkbox id="generar_mora" checked={formData.generar_mora} onCheckedChange={(checked) => handleCheckedChange('generar_mora', checked)} />
                  <Label htmlFor="generar_mora" className="cursor-pointer">Generar Cargos por Atrasos (MORA)</Label>
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="tipo_ncf">Tipo NCF (Comprobante Fiscal)</Label>
                <Select name="tipo_ncf" value={formData.tipo_ncf} onValueChange={(value) => handleSelectChange('tipo_ncf', value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccione un tipo de NCF" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="01">01 - Crédito Fiscal</SelectItem>
                    <SelectItem value="02">02 - Factura de Consumo</SelectItem>
                    <SelectItem value="14">14 - Régimen Especial</SelectItem>
                    <SelectItem value="15">15 - Gubernamental</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="precio_nivel">Nivel de Precio</Label>
                <Select name="precio_nivel" value={String(formData.precio_nivel)} onValueChange={(value) => handleSelectChange('precio_nivel', parseInt(value))}>
                  <SelectTrigger id="precio_nivel">
                    <SelectValue placeholder="Seleccione un nivel" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">Nivel 1 (General)</SelectItem>
                    <SelectItem value="2">Nivel 2 (Precio 2)</SelectItem>
                    <SelectItem value="3">Nivel 3 (Precio 3)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-[10px] text-gray-500 italic">Determina qué columna de precio se asigna automáticamente al facturar.</p>
              </div>
            </TabsContent>
          </Tabs>
          <DialogFooter className="pt-4">
            <DialogClose asChild>
              <Button type="button" variant="secondary">Cancelar</Button>
            </DialogClose>
            {isLastTab ? (
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {(cliente || matchedId) ? 'Guardar Cambios' : 'Crear Cliente'}
              </Button>
            ) : (
              <Button type="button" onClick={handleNext}>
                Siguiente
              </Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default ClienteFormModal;
