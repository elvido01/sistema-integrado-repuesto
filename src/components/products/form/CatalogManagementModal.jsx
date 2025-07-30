import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Save, Plus, Trash2, Edit, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/customSupabaseClient';

const CatalogManagementModal = ({ isOpen, onClose, config, onSaveSuccess }) => {
  const { title, table, columns, extraData = {} } = config;
  const { toast } = useToast();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState(null);
  const [formData, setFormData] = useState({});
  const [isEditing, setIsEditing] = useState(false);

  const getInitialFormData = useCallback(() => {
    const initialFormData = columns.reduce((acc, col) => ({ ...acc, [col.accessor]: '' }), {});
    initialFormData.activo = true;
    if (extraData.marca_id) {
      initialFormData.marca_id = extraData.marca_id;
    }
    return initialFormData;
  }, [columns, extraData.marca_id]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    let query = supabase.from(table).select('*').order('nombre', { ascending: true });
    if (extraData.marca_id) {
      query = query.eq('marca_id', extraData.marca_id);
    }
    const { data, error } = await query;
    if (error) {
      toast({ variant: 'destructive', title: 'Error', description: `No se pudieron cargar los datos de ${title}.` });
    } else {
      setItems(data);
    }
    setLoading(false);
  }, [table, title, toast, extraData.marca_id]);

  useEffect(() => {
    if (isOpen) {
      fetchData();
      resetForm();
    }
  }, [isOpen, fetchData]);

  const resetForm = useCallback(() => {
    setFormData(getInitialFormData());
    setSelectedItem(null);
    setIsEditing(false);
  }, [getInitialFormData]);

  const handleSelectRow = (item) => {
    setSelectedItem(item);
    const newFormData = columns.reduce((acc, col) => ({ ...acc, [col.accessor]: item[col.accessor] || '' }), {});
    newFormData.activo = item.activo !== false; // Default to true if null/undefined
    if (item.marca_id) {
        newFormData.marca_id = item.marca_id;
    }
    newFormData.id = item.id;
    setFormData(newFormData);
    setIsEditing(true);
  };

  const handleInputChange = (e) => {
    const { id, value } = e.target;
    setFormData(prev => ({ ...prev, [id]: value }));
  };

  const handleCheckboxChange = (checked) => {
    setFormData(prev => ({ ...prev, activo: checked }));
  };

  const handleSave = async () => {
    const requiredField = columns.find(c => c.accessor === 'nombre') ? 'nombre' : columns[0]?.accessor;
    if (!formData[requiredField]?.trim()) {
      toast({ variant: 'destructive', title: 'Error', description: `El campo ${requiredField} es requerido.` });
      return;
    }
    const { id, ...dataToSave } = formData;
    let result;
    if (isEditing && id) {
      result = await supabase.from(table).update(dataToSave).eq('id', id).select();
    } else {
      result = await supabase.from(table).insert([dataToSave]).select();
    }
    if (result.error) {
      toast({ variant: 'destructive', title: 'Error al guardar', description: result.error.message });
    } else {
      toast({ title: 'Éxito', description: `${title} guardado correctamente.` });
      await fetchData();
      resetForm();
      if(onSaveSuccess) onSaveSuccess();
      onClose();
    }
  };

  const handleDelete = async () => {
    if (!selectedItem?.id) return;
    const { error } = await supabase.from(table).delete().eq('id', selectedItem.id);
    if (error) {
      toast({ variant: 'destructive', title: 'Error al eliminar', description: error.message });
    } else {
      toast({ title: 'Éxito', description: `${title} eliminado correctamente.` });
      await fetchData();
      resetForm();
      if(onSaveSuccess) onSaveSuccess();
    }
  };

  if (!isOpen) return null;

  // --- CAMBIO CRÍTICO AQUÍ ---
  // El motion.div principal del modal hijo BLOQUEA los eventos de click y teclado:
  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[60] flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-black/40"
          onClick={onClose}
        />
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          className="relative bg-white rounded-lg border-2 border-morla-gold shadow-2xl w-full max-w-2xl max-h-[80vh] overflow-y-auto mx-4 flex flex-col"
          onClick={e => e.stopPropagation()}
          onKeyDown={e => e.stopPropagation()}
          tabIndex={0}
        >
          <div className="bg-morla-blue text-white px-4 py-2 flex items-center justify-between flex-shrink-0">
            <h2 className="text-md font-bold">{title}</h2>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-white hover:bg-white/20" onClick={resetForm}><Plus /></Button>
              {/* Solo deja este Guardar */}
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-white hover:bg-white/20" onClick={handleSave}><Save /></Button>
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-white hover:bg-white/20" onClick={handleDelete} disabled={!selectedItem}><Trash2 /></Button>
            </div>
          </div>

          <div className="p-4 space-y-3 flex-shrink-0">
            <div className="grid grid-cols-3 gap-4 items-end">
              {columns.map(col => (
                <div key={col.accessor} className={col.accessor === 'nombre' ? 'col-span-2' : ''}>
                  <Label htmlFor={col.accessor} className="text-xs">{col.header}</Label>
                  <Input 
                    id={col.accessor} 
                    value={formData[col.accessor] || ''} 
                    onChange={handleInputChange} 
                    className="h-8" 
                    type={col.type || 'text'}
                  />
                </div>
              ))}
              <div className="flex items-center space-x-2 pb-1">
                <Checkbox id="activo" checked={formData.activo} onCheckedChange={handleCheckboxChange} />
                <Label htmlFor="activo" className="text-sm">Activo</Label>
              </div>
            </div>
          </div>

          <div className="flex-1 px-4 pb-4 overflow-hidden">
            <ScrollArea className="h-full border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    {columns.map(col => <TableHead key={col.accessor}>{col.header}</TableHead>)}
                    <TableHead>Activo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow><TableCell colSpan={columns.length + 1} className="text-center">Cargando...</TableCell></TableRow>
                  ) : (
                    items.map(item => (
                      <TableRow key={item.id} onClick={() => handleSelectRow(item)} className={`cursor-pointer ${selectedItem?.id === item.id ? 'bg-blue-100' : ''}`}>
                        {columns.map(col => <TableCell key={col.accessor}>{item[col.accessor]}</TableCell>)}
                        <TableCell>{item.activo ? 'Sí' : 'No'}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </ScrollArea>
          </div>

          <div className="border-t bg-gray-50 px-4 py-3 flex justify-end gap-3 flex-shrink-0">
            <Button variant="outline" onClick={onClose}>ESC - Cerrar</Button>
            <Button onClick={handleSave} className="bg-morla-blue text-white">Guardar</Button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default CatalogManagementModal;