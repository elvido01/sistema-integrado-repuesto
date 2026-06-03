// ============================================================
// BrandKitPanel.jsx — Sidebar/popover con el kit de marca
// ============================================================
// Muestra logo + colores + datos del tenant para que el usuario
// los inserte en el canvas con un click.
//
// Props:
//   store: instancia de Polotno (se usa para insertar en canvas)
//   onClose: cierra el panel
// ============================================================
import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Upload, Plus, Trash2, Image as ImageIcon, Palette, Save } from 'lucide-react';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useToast } from '@/components/ui/use-toast';
import { getBrandKit, saveBrandKit, uploadBrandLogo } from '@/services/brandKitService';

const DEFAULT_COLORS = ['#dc2626', '#0f172a', '#facc15', '#ffffff', '#10b981', '#06b6d4'];

export default function BrandKitPanel({ open, onClose, store }) {
    const { tenantId } = useAuth();
    const { toast } = useToast();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [kit, setKit] = useState({
        nombre: '', eslogan: '', logo_url: null,
        colores: DEFAULT_COLORS, telefono: '', direccion: '', horario: '',
        instagram: '', facebook: '', whatsapp: '',
    });

    useEffect(() => {
        if (!open || !tenantId) return;
        (async () => {
            setLoading(true);
            try {
                const data = await getBrandKit(tenantId);
                if (data) {
                    setKit({
                        nombre: data.nombre || '',
                        eslogan: data.eslogan || '',
                        logo_url: data.logo_url,
                        colores: data.colores?.length ? data.colores : DEFAULT_COLORS,
                        telefono: data.telefono || '', direccion: data.direccion || '',
                        horario: data.horario || '', instagram: data.instagram || '',
                        facebook: data.facebook || '', whatsapp: data.whatsapp || '',
                    });
                }
            } catch (e) {
                toast({ variant: 'destructive', title: 'Error', description: e.message });
            } finally {
                setLoading(false);
            }
        })();
    }, [open, tenantId, toast]);

    const handleSave = async () => {
        setSaving(true);
        try {
            await saveBrandKit(tenantId, kit);
            toast({ title: 'Guardado', description: 'Kit de marca actualizado.' });
        } catch (e) {
            toast({ variant: 'destructive', title: 'Error', description: e.message });
        } finally {
            setSaving(false);
        }
    };

    const handleUploadLogo = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setUploading(true);
        try {
            const url = await uploadBrandLogo(tenantId, file);
            setKit(k => ({ ...k, logo_url: url }));
            toast({ title: 'Logo subido', description: 'Listo para insertar en el canvas.' });
        } catch (err) {
            toast({ variant: 'destructive', title: 'Error', description: err.message });
        } finally {
            setUploading(false);
        }
    };

    // ── Acciones sobre el canvas ──
    const insertLogoOnCanvas = () => {
        if (!store || !kit.logo_url) return;
        const page = store.activePage || store.pages?.[0];
        if (!page) return;
        const W = store.width || 1080;
        const size = Math.min(W * 0.25, 300);
        page.addElement({
            type: 'image',
            src: kit.logo_url,
            width: size,
            height: size,
            x: 40,
            y: 40,
            name: 'brand_logo',
        });
        toast({ title: 'Logo insertado', description: 'Lo puedes mover y redimensionar.' });
    };

    const insertTextOnCanvas = (text, opts = {}) => {
        if (!store) return;
        const page = store.activePage || store.pages?.[0];
        if (!page) return;
        page.addElement({
            type: 'text',
            text,
            x: 40, y: 40,
            width: (store.width || 1080) - 80,
            fontSize: opts.size || 48,
            fontWeight: opts.weight || 700,
            fill: opts.color || kit.colores?.[0] || '#000000',
            align: 'left',
        });
    };

    const applyColorToSelected = (color) => {
        if (!store) return;
        const els = store.selectedElements || [];
        if (!els.length) {
            toast({ title: 'Selecciona algo', description: 'Selecciona texto o forma para aplicar el color.' });
            return;
        }
        for (const el of els) {
            try {
                if (el.type === 'text') el.set({ fill: color });
                else if (el.type === 'figure') el.set({ fill: color });
                else if (el.type === 'svg') el.set({ fill: color });
            } catch (_) {}
        }
    };

    const updateColor = (idx, value) => {
        setKit(k => {
            const arr = [...(k.colores || [])];
            arr[idx] = value;
            return { ...k, colores: arr };
        });
    };

    const addColor = () => {
        setKit(k => ({ ...k, colores: [...(k.colores || []), '#999999'] }));
    };

    const removeColor = (idx) => {
        setKit(k => ({ ...k, colores: (k.colores || []).filter((_, i) => i !== idx) }));
    };

    return (
        <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
            <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Palette className="h-5 w-5 text-violet-600" />
                        Kit de marca
                    </DialogTitle>
                </DialogHeader>

                {loading ? (
                    <div className="flex items-center justify-center py-16 text-slate-400">
                        <Loader2 className="h-6 w-6 animate-spin mr-2" /> Cargando...
                    </div>
                ) : (
                    <div className="space-y-4">
                        {/* Logo */}
                        <section>
                            <Label className="text-xs font-bold text-slate-600">Logo</Label>
                            <div className="mt-1 flex items-center gap-3">
                                <div className="h-20 w-20 rounded border border-slate-200 bg-slate-50 flex items-center justify-center overflow-hidden">
                                    {kit.logo_url
                                        ? <img src={kit.logo_url} alt="logo" className="w-full h-full object-contain" />
                                        : <ImageIcon className="h-8 w-8 text-slate-300" />}
                                </div>
                                <div className="flex-1 space-y-2">
                                    <label className="block">
                                        <input type="file" accept="image/*" className="hidden" onChange={handleUploadLogo} />
                                        <Button asChild size="sm" variant="outline">
                                            <span>
                                                {uploading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Upload className="h-4 w-4 mr-1" />}
                                                {kit.logo_url ? 'Cambiar logo' : 'Subir logo'}
                                            </span>
                                        </Button>
                                    </label>
                                    {kit.logo_url && store && (
                                        <Button size="sm" onClick={insertLogoOnCanvas}
                                            className="bg-violet-600 text-white hover:bg-violet-700">
                                            <Plus className="h-4 w-4 mr-1" /> Insertar en canvas
                                        </Button>
                                    )}
                                </div>
                            </div>
                        </section>

                        {/* Nombre y eslogan */}
                        <section className="grid grid-cols-2 gap-2">
                            <div>
                                <Label className="text-xs font-bold text-slate-600">Nombre</Label>
                                <Input value={kit.nombre} onChange={e => setKit({ ...kit, nombre: e.target.value })}
                                    placeholder="REPUESTOS MORLA" />
                                {store && kit.nombre && (
                                    <button onClick={() => insertTextOnCanvas(kit.nombre, { size: 64, weight: 900 })}
                                        className="text-[10px] text-violet-600 hover:underline mt-1">
                                        + Insertar en canvas
                                    </button>
                                )}
                            </div>
                            <div>
                                <Label className="text-xs font-bold text-slate-600">Eslogan</Label>
                                <Input value={kit.eslogan} onChange={e => setKit({ ...kit, eslogan: e.target.value })}
                                    placeholder="Tu repuesto de confianza" />
                                {store && kit.eslogan && (
                                    <button onClick={() => insertTextOnCanvas(kit.eslogan, { size: 36, weight: 400 })}
                                        className="text-[10px] text-violet-600 hover:underline mt-1">
                                        + Insertar en canvas
                                    </button>
                                )}
                            </div>
                        </section>

                        {/* Paleta */}
                        <section>
                            <div className="flex items-center justify-between">
                                <Label className="text-xs font-bold text-slate-600">Paleta de colores</Label>
                                <button onClick={addColor} className="text-[10px] text-violet-600 hover:underline">
                                    + Agregar
                                </button>
                            </div>
                            <p className="text-[10px] text-slate-500 mt-0.5">
                                {store ? 'Click en un color para aplicarlo al elemento seleccionado.' : 'Colores que apareceran en el editor.'}
                            </p>
                            <div className="flex flex-wrap gap-2 mt-2">
                                {(kit.colores || []).map((c, i) => (
                                    <div key={i} className="relative group">
                                        <button
                                            onClick={() => store && applyColorToSelected(c)}
                                            className="h-12 w-12 rounded border-2 border-white shadow ring-1 ring-slate-200"
                                            style={{ background: c }}
                                            title={c}
                                        />
                                        <input
                                            type="color"
                                            value={c}
                                            onChange={(e) => updateColor(i, e.target.value)}
                                            className="absolute inset-0 opacity-0 cursor-pointer"
                                            title="Cambiar color"
                                        />
                                        <button
                                            onClick={() => removeColor(i)}
                                            className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full w-4 h-4 flex items-center justify-center opacity-0 group-hover:opacity-100 transition"
                                            title="Eliminar"
                                        >
                                            <Trash2 className="h-2.5 w-2.5" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </section>

                        {/* Contacto */}
                        <section className="grid grid-cols-2 gap-2">
                            <div>
                                <Label className="text-xs font-bold text-slate-600">Teléfono</Label>
                                <Input value={kit.telefono} onChange={e => setKit({ ...kit, telefono: e.target.value })} placeholder="809-..." />
                            </div>
                            <div>
                                <Label className="text-xs font-bold text-slate-600">WhatsApp</Label>
                                <Input value={kit.whatsapp} onChange={e => setKit({ ...kit, whatsapp: e.target.value })} placeholder="18091234567" />
                            </div>
                            <div className="col-span-2">
                                <Label className="text-xs font-bold text-slate-600">Dirección</Label>
                                <Input value={kit.direccion} onChange={e => setKit({ ...kit, direccion: e.target.value })} placeholder="Av. ..." />
                            </div>
                            <div>
                                <Label className="text-xs font-bold text-slate-600">Horario</Label>
                                <Input value={kit.horario} onChange={e => setKit({ ...kit, horario: e.target.value })} placeholder="Lun-Sab 8am - 6pm" />
                            </div>
                            <div>
                                <Label className="text-xs font-bold text-slate-600">Instagram</Label>
                                <Input value={kit.instagram} onChange={e => setKit({ ...kit, instagram: e.target.value })} placeholder="@repuestosmorla" />
                            </div>
                        </section>
                    </div>
                )}

                <DialogFooter className="gap-2">
                    <Button variant="ghost" onClick={onClose}>Cerrar</Button>
                    <Button onClick={handleSave} disabled={saving}
                        className="bg-emerald-600 text-white hover:bg-emerald-700">
                        {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
                        Guardar kit
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
