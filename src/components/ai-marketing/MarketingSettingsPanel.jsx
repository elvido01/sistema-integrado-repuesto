// ============================================================
// MarketingSettingsPanel.jsx — Configuración del agente de Marketing
// ============================================================
import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Loader2, Save, Settings } from 'lucide-react';
import { getMarketingSettings, saveMarketingSettings } from '@/services/aiMarketingService';

export default function MarketingSettingsPanel() {
    const { tenantId } = useAuth();
    const { toast } = useToast();
    const [form, setForm] = useState({
        negocio_nombre: 'Repuestos Morla',
        tono: 'dominicano, cercano, profesional y vendedor',
        whatsapp_numero: '',
        permitir_sin_imagen: false,
        max_imagenes_por_dia: 5,
        reglas_extra: '',
    });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const cargar = useCallback(async () => {
        if (!tenantId) return;
        setLoading(true);
        try {
            const data = await getMarketingSettings(tenantId);
            if (data) setForm((f) => ({ ...f, ...data }));
        } finally { setLoading(false); }
    }, [tenantId]);

    useEffect(() => { cargar(); }, [cargar]);

    const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

    const guardar = async () => {
        setSaving(true);
        try {
            await saveMarketingSettings(tenantId, {
                negocio_nombre: form.negocio_nombre,
                tono: form.tono,
                whatsapp_numero: form.whatsapp_numero,
                permitir_sin_imagen: form.permitir_sin_imagen,
                max_imagenes_por_dia: Number(form.max_imagenes_por_dia) || 5,
                reglas_extra: form.reglas_extra,
            });
            toast({ title: '✓ Configuración guardada' });
        } catch (e) {
            toast({ variant: 'destructive', title: 'Error', description: e.message });
        } finally { setSaving(false); }
    };

    if (loading) return <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-violet-500" /></div>;

    return (
        <div className="max-w-xl">
            <h3 className="font-bold text-slate-800 flex items-center gap-2 mb-4">
                <Settings className="h-5 w-5 text-violet-600" /> Configuración de Marketing IA
            </h3>
            <div className="space-y-4">
                <div>
                    <Label>Nombre del negocio</Label>
                    <Input value={form.negocio_nombre} onChange={(e) => set('negocio_nombre', e.target.value)} />
                </div>
                <div>
                    <Label>Tono de la comunicación</Label>
                    <Input value={form.tono} onChange={(e) => set('tono', e.target.value)} />
                </div>
                <div>
                    <Label>Número de WhatsApp (para CTA)</Label>
                    <Input value={form.whatsapp_numero || ''} onChange={(e) => set('whatsapp_numero', e.target.value)} placeholder="809-390-5965" />
                </div>
                <div className="flex items-center justify-between rounded-lg border border-slate-200 p-3">
                    <div>
                        <Label className="font-bold">Permitir productos sin imagen</Label>
                        <p className="text-xs text-slate-500">Si está apagado, no se recomiendan productos sin foto.</p>
                    </div>
                    <Switch checked={!!form.permitir_sin_imagen} onCheckedChange={(v) => set('permitir_sin_imagen', v)} />
                </div>
                <div>
                    <Label>Tope de imágenes IA por día</Label>
                    <Input type="number" min="0" max="50" value={form.max_imagenes_por_dia}
                        onChange={(e) => set('max_imagenes_por_dia', e.target.value)} />
                    <p className="text-xs text-slate-500 mt-1">Cada imagen cuesta ~$0.04. Protege tu presupuesto.</p>
                </div>
                <div>
                    <Label>Reglas extra del negocio (opcional)</Label>
                    <textarea
                        value={form.reglas_extra || ''} onChange={(e) => set('reglas_extra', e.target.value)}
                        className="w-full text-sm border border-slate-200 rounded p-2 h-20 resize-none"
                        placeholder="Ej: ofrecemos instalación gratis de baterías, horario 8am-6pm..." />
                </div>
                <Button onClick={guardar} disabled={saving} className="bg-violet-600 hover:bg-violet-700 text-white">
                    {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />} Guardar
                </Button>
            </div>
        </div>
    );
}
