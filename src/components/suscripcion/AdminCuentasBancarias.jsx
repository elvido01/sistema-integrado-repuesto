import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Landmark, Plus, Pencil, Trash2, Save, X, Loader2,
  CreditCard, User, Hash, DollarSign, ToggleLeft, ToggleRight, ChevronDown, ChevronUp
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/customSupabaseClient';

const EMPTY_CUENTA = {
  banco: '',
  tipo_cuenta: 'Corriente',
  numero: '',
  titular: '',
  rnc: '',
  moneda: 'DOP',
  activa: true,
};

const AdminCuentasBancarias = () => {
  const { toast } = useToast();
  const [cuentas, setCuentas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState(true);

  // Edit/create state
  const [editingId, setEditingId] = useState(null); // null=none, 'new'=creating, uuid=editing
  const [formData, setFormData] = useState({ ...EMPTY_CUENTA });

  const fetchCuentas = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('cuentas_bancarias_saas')
        .select('*')
        .order('created_at', { ascending: true });
      if (error) throw error;
      setCuentas(data || []);
    } catch (err) {
      toast({ variant: 'destructive', title: 'Error', description: err.message });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { fetchCuentas(); }, [fetchCuentas]);

  const handleNew = () => {
    setFormData({ ...EMPTY_CUENTA });
    setEditingId('new');
  };

  const handleEdit = (cuenta) => {
    setFormData({
      banco: cuenta.banco || '',
      tipo_cuenta: cuenta.tipo_cuenta || 'Corriente',
      numero: cuenta.numero || '',
      titular: cuenta.titular || '',
      rnc: cuenta.rnc || '',
      moneda: cuenta.moneda || 'DOP',
      activa: cuenta.activa ?? true,
    });
    setEditingId(cuenta.id);
  };

  const handleCancel = () => {
    setEditingId(null);
    setFormData({ ...EMPTY_CUENTA });
  };

  const handleSave = async () => {
    if (!formData.banco.trim() || !formData.numero.trim() || !formData.titular.trim()) {
      toast({ variant: 'destructive', title: 'Campos requeridos', description: 'Banco, número de cuenta y titular son obligatorios.' });
      return;
    }

    setSaving(true);
    try {
      if (editingId === 'new') {
        const { error } = await supabase
          .from('cuentas_bancarias_saas')
          .insert(formData);
        if (error) throw error;
        toast({ title: 'Cuenta agregada' });
      } else {
        const { error } = await supabase
          .from('cuentas_bancarias_saas')
          .update(formData)
          .eq('id', editingId);
        if (error) throw error;
        toast({ title: 'Cuenta actualizada' });
      }
      setEditingId(null);
      setFormData({ ...EMPTY_CUENTA });
      await fetchCuentas();
    } catch (err) {
      toast({ variant: 'destructive', title: 'Error', description: err.message });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('¿Eliminar esta cuenta bancaria?')) return;
    try {
      const { error } = await supabase
        .from('cuentas_bancarias_saas')
        .delete()
        .eq('id', id);
      if (error) throw error;
      toast({ title: 'Cuenta eliminada' });
      if (editingId === id) handleCancel();
      await fetchCuentas();
    } catch (err) {
      toast({ variant: 'destructive', title: 'Error', description: err.message });
    }
  };

  const handleToggleActiva = async (id, activa) => {
    try {
      const { error } = await supabase
        .from('cuentas_bancarias_saas')
        .update({ activa: !activa })
        .eq('id', id);
      if (error) throw error;
      await fetchCuentas();
    } catch (err) {
      toast({ variant: 'destructive', title: 'Error', description: err.message });
    }
  };

  const updateField = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 px-5 py-3 flex items-center justify-between hover:from-blue-700 hover:to-indigo-700 transition-all"
      >
        <h3 className="text-white font-black text-sm uppercase tracking-wider flex items-center gap-2">
          <Landmark className="w-4 h-4" />
          Cuentas Bancarias para Cobro
          <span className="bg-white/20 px-2 py-0.5 rounded-full text-[10px]">{cuentas.length}</span>
        </h3>
        {expanded ? <ChevronUp className="w-4 h-4 text-white" /> : <ChevronDown className="w-4 h-4 text-white" />}
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="p-5 space-y-4">
              {/* Existing accounts list */}
              {loading ? (
                <div className="flex justify-center py-6">
                  <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                </div>
              ) : cuentas.length === 0 ? (
                <p className="text-center text-sm text-gray-400 italic py-4">No hay cuentas bancarias configuradas</p>
              ) : (
                <div className="space-y-2">
                  {cuentas.map((cuenta) => (
                    <div
                      key={cuenta.id}
                      className={`rounded-xl border p-4 transition-all ${
                        cuenta.activa
                          ? 'bg-blue-50/50 border-blue-200'
                          : 'bg-gray-50 border-gray-200 opacity-60'
                      } ${editingId === cuenta.id ? 'ring-2 ring-blue-400' : ''}`}
                    >
                      {editingId === cuenta.id ? (
                        /* Edit form inline */
                        <CuentaForm
                          formData={formData}
                          updateField={updateField}
                          onSave={handleSave}
                          onCancel={handleCancel}
                          saving={saving}
                          isNew={false}
                        />
                      ) : (
                        /* Display mode */
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <Landmark className="w-4 h-4 text-blue-500 shrink-0" />
                              <span className="font-black text-sm text-gray-800">{cuenta.banco}</span>
                              <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                                cuenta.activa ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-200 text-gray-500'
                              }`}>
                                {cuenta.activa ? 'Activa' : 'Inactiva'}
                              </span>
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-1 mt-2">
                              <InfoItem label="Tipo" value={cuenta.tipo_cuenta} />
                              <InfoItem label="Número" value={cuenta.numero} />
                              <InfoItem label="Titular" value={cuenta.titular} />
                              <InfoItem label="RNC" value={cuenta.rnc || '—'} />
                              <InfoItem label="Moneda" value={cuenta.moneda} />
                            </div>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0 text-gray-400 hover:text-blue-600 hover:bg-blue-50"
                              onClick={() => handleToggleActiva(cuenta.id, cuenta.activa)}
                              title={cuenta.activa ? 'Desactivar' : 'Activar'}
                            >
                              {cuenta.activa
                                ? <ToggleRight className="w-4 h-4 text-emerald-500" />
                                : <ToggleLeft className="w-4 h-4" />
                              }
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0 text-gray-400 hover:text-blue-600 hover:bg-blue-50"
                              onClick={() => handleEdit(cuenta)}
                              title="Editar"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0 text-gray-400 hover:text-red-600 hover:bg-red-50"
                              onClick={() => handleDelete(cuenta.id)}
                              title="Eliminar"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* New account form */}
              {editingId === 'new' ? (
                <div className="rounded-xl border-2 border-dashed border-blue-300 bg-blue-50/30 p-4">
                  <p className="text-xs font-black text-blue-600 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                    <Plus className="w-3.5 h-3.5" /> Nueva Cuenta Bancaria
                  </p>
                  <CuentaForm
                    formData={formData}
                    updateField={updateField}
                    onSave={handleSave}
                    onCancel={handleCancel}
                    saving={saving}
                    isNew={true}
                  />
                </div>
              ) : editingId === null && (
                <Button
                  onClick={handleNew}
                  variant="outline"
                  className="w-full h-9 border-dashed border-blue-300 text-blue-600 hover:bg-blue-50 font-bold text-xs gap-1.5"
                >
                  <Plus className="w-4 h-4" />
                  Agregar Cuenta Bancaria
                </Button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// ── Form Component ──
const CuentaForm = ({ formData, updateField, onSave, onCancel, saving, isNew }) => (
  <div className="space-y-3">
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      <div>
        <Label className="text-[10px] font-bold text-gray-500 uppercase">Banco *</Label>
        <Input
          placeholder="Ej: Banco Popular Dominicano"
          value={formData.banco}
          onChange={e => updateField('banco', e.target.value)}
          className="h-8 text-sm mt-1"
        />
      </div>
      <div>
        <Label className="text-[10px] font-bold text-gray-500 uppercase">Tipo de Cuenta</Label>
        <Select value={formData.tipo_cuenta} onValueChange={v => updateField('tipo_cuenta', v)}>
          <SelectTrigger className="h-8 text-sm mt-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="Corriente">Corriente</SelectItem>
            <SelectItem value="Ahorro">Ahorro</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>

    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      <div>
        <Label className="text-[10px] font-bold text-gray-500 uppercase">Número de Cuenta *</Label>
        <Input
          placeholder="Ej: 799-123456-7"
          value={formData.numero}
          onChange={e => updateField('numero', e.target.value)}
          className="h-8 text-sm mt-1"
        />
      </div>
      <div>
        <Label className="text-[10px] font-bold text-gray-500 uppercase">Titular *</Label>
        <Input
          placeholder="Ej: REPUESTOS MORLA SRL"
          value={formData.titular}
          onChange={e => updateField('titular', e.target.value)}
          className="h-8 text-sm mt-1"
        />
      </div>
    </div>

    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      <div>
        <Label className="text-[10px] font-bold text-gray-500 uppercase">RNC</Label>
        <Input
          placeholder="Ej: 131-12345-6"
          value={formData.rnc}
          onChange={e => updateField('rnc', e.target.value)}
          className="h-8 text-sm mt-1"
        />
      </div>
      <div>
        <Label className="text-[10px] font-bold text-gray-500 uppercase">Moneda</Label>
        <Select value={formData.moneda} onValueChange={v => updateField('moneda', v)}>
          <SelectTrigger className="h-8 text-sm mt-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="DOP">DOP - Pesos</SelectItem>
            <SelectItem value="USD">USD - Dólares</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>

    <div className="flex items-center gap-3 pt-1">
      <Switch
        checked={formData.activa}
        onCheckedChange={v => updateField('activa', v)}
        className="data-[state=checked]:bg-emerald-500"
      />
      <span className="text-xs font-bold text-gray-600">
        {formData.activa ? 'Visible para clientes' : 'Oculta (no se muestra al pagar)'}
      </span>
    </div>

    <div className="flex items-center gap-2 pt-2 border-t border-gray-200">
      <Button
        onClick={onSave}
        disabled={saving}
        className="h-8 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs gap-1.5 px-4"
      >
        {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
        {isNew ? 'Guardar Cuenta' : 'Actualizar'}
      </Button>
      <Button
        onClick={onCancel}
        variant="ghost"
        className="h-8 text-xs font-bold text-gray-500"
      >
        <X className="w-3.5 h-3.5 mr-1" /> Cancelar
      </Button>
    </div>
  </div>
);

const InfoItem = ({ label, value }) => (
  <div>
    <span className="text-[9px] font-bold text-gray-400 uppercase">{label}</span>
    <p className="text-xs font-bold text-gray-700">{value}</p>
  </div>
);

export default AdminCuentasBancarias;
