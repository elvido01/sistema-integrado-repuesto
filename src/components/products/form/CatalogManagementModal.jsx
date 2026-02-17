import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Save, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/customSupabaseClient';

const CatalogManagementModal = ({ isOpen, onClose, config, onSaveSuccess }) => {
  // =================================================================
  // 1. HOOKS FIRST - All hooks must be called at the top level.
  // =================================================================
  const { toast } = useToast();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState(null);
  const [formData, setFormData] = useState({});
  const [isEditing, setIsEditing] = useState(false);

  const { title = 'Catálogo', table, columns = [], extraData = {} } = config || {};
  const marcaId = extraData?.marca_id;

  const getInitialFormData = useCallback(() => {
    const initial = columns.reduce((acc, col) => ({ ...acc, [col.accessor]: '' }), {});
    initial.activo = true;
    if (marcaId) {
      initial.marca_id = marcaId;
    }
    return initial;
  }, [columns, marcaId]);

  const fetchData = useCallback(async () => {
    if (!table) return; // Don't fetch if config is not ready
    setLoading(true);
    let query = supabase.from(table).select('*').order('nombre', { ascending: true });
    if (marcaId) {
      query = query.eq('marca_id', marcaId);
    }
    const { data, error } = await query;
    if (error) {
      toast({ variant: 'destructive', title: 'Error', description: `No se pudieron cargar los datos de ${title}.` });
    } else {
      setItems(data || []);
    }
    setLoading(false);
  }, [table, title, toast, marcaId]);

  const resetForm = useCallback(() => {
    setFormData(getInitialFormData());
    setSelectedItem(null);
    setIsEditing(false);
  }, [getInitialFormData]);

  useEffect(() => {
    if (isOpen && table) {
      fetchData();
      resetForm();
    }

    const onKey = (e) => {
      if (isOpen && e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);

  }, [isOpen, table, fetchData, resetForm, onClose]);

  const handleInputChange = (e) => {
    const { id, value } = e.target;
    setFormData((prev) => ({ ...prev, [id]: value }));
  };

  const handleCheckboxChange = (checked) => {
    setFormData((prev) => ({ ...prev, activo: checked }));
  };

  const handleSelectRow = (item) => {
    setSelectedItem(item);
    setFormData({ ...item });
    setIsEditing(true);
  };

  const handleSave = async () => {
    if (!formData.nombre) {
      toast({ variant: 'destructive', title: 'Error', description: 'El nombre es obligatorio.' });
      return;
    }

    const dataToSave = { ...formData };

    let response;
    if (isEditing) {
      response = await supabase.from(table).update(dataToSave).eq('id', selectedItem.id).select().single();
    } else {
      response = await supabase.from(table).insert(dataToSave).select().single();
    }

    if (response.error) {
      toast({ variant: 'destructive', title: 'Error al guardar', description: response.error.message });
    } else {
      toast({ title: 'Éxito', description: `${title} guardado correctamente.` });
      fetchData();
      resetForm();
      if (onSaveSuccess) onSaveSuccess(response.data);
      onClose(); // ← Cerrar ventana automáticamente
    }
  };

  const handleDelete = async () => {
    if (!selectedItem) return;

    const { error } = await supabase.from(table).delete().eq('id', selectedItem.id);

    if (error) {
      toast({ variant: 'destructive', title: 'Error al eliminar', description: error.message });
    } else {
      toast({ title: 'Éxito', description: `${title} eliminado.` });
      fetchData();
      resetForm();
    }
  };

  // =================================================================
  // 2. EARLY RETURNS - Can now happen after all hooks are called.
  // =================================================================
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            key="catalog-modal-backdrop"
            className="fixed inset-0 z-40 bg-black/50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            key="catalog-modal-panel"
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            initial={{ opacity: 0, scale: 0.98, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: 8 }}
            role="dialog"
            aria-modal="true"
          >
            <div
              className="relative bg-white rounded-lg border-2 border-morla-gold shadow-2xl w-full max-w-2xl max-h-[80vh] mx-4 flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="bg-morla-blue text-white px-4 py-2 flex items-center justify-between flex-shrink-0">
                <h2 className="text-md font-bold">{title}</h2>
                <div className="flex items-center gap-1">
                  <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0 text-white hover:bg-white/20" onClick={resetForm}><Plus /></Button>
                  <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0 text-white hover:bg-white/20" onClick={handleSave}><Save /></Button>
                  <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0 text-white hover:bg-white/20" onClick={handleDelete} disabled={!selectedItem}><Trash2 /></Button>
                </div>
              </div>

              <div className="p-4 space-y-3 flex-shrink-0">
                <div className="grid grid-cols-3 gap-4 items-end">
                  {columns.map((col) => (
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
                    <Checkbox id="activo" checked={formData.activo || false} onCheckedChange={handleCheckboxChange} />
                    <Label htmlFor="activo" className="text-sm">Activo</Label>
                  </div>
                </div>
              </div>

              <div className="flex-1 px-4 pb-4 overflow-hidden">
                <ScrollArea className="h-full border rounded-md">
                  <Table>
                    <TableHeader className="bg-gray-100/50">
                      <TableRow className="h-8">
                        {columns.map((col) => (
                          <TableHead key={col.accessor} className={col.accessor === 'nombre' ? 'w-[70%]' : ''}>
                            {col.header}
                          </TableHead>
                        ))}
                        <TableHead className="w-[80px]">Activo</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loading ? (
                        <TableRow><TableCell colSpan={columns.length + 1} className="text-center py-4">Cargando...</TableCell></TableRow>
                      ) : (
                        items.map((item) => (
                          <TableRow
                            key={item.id}
                            onClick={() => handleSelectRow(item)}
                            className={`cursor-pointer h-8 hover:bg-morla-blue/5 transition-colors ${selectedItem?.id === item.id ? 'bg-blue-100 font-bold' : ''}`}
                          >
                            {columns.map((col) => {
                              const value = item[col.accessor];
                              return (
                                <TableCell key={col.accessor} className="py-1 px-2 text-xs leading-tight">
                                  <span className="block break-words whitespace-normal min-w-[150px]">
                                    {typeof value === 'object' && value !== null
                                      ? value?.nombre ?? JSON.stringify(value)
                                      : value}
                                  </span>
                                </TableCell>
                              );
                            })}
                            <TableCell className="py-1 px-2 text-xs">{item.activo ? 'Sí' : 'No'}</TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </div>

              <div className="border-t bg-gray-50 px-4 py-3 flex justify-end gap-3 flex-shrink-0">
                <Button type="button" variant="outline" onClick={onClose}>ESC - Cerrar</Button>
                <Button type="button" onClick={handleSave} className="bg-morla-blue text-white">Guardar</Button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default CatalogManagementModal;