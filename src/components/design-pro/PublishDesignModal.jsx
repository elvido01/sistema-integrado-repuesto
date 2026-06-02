// ============================================================
// PublishDesignModal.jsx — Publica un disen~o a IG/FB/WhatsApp
// ============================================================
// Para FB/IG: invoca la Edge Function publish-design.
// Para WhatsApp: llama al servicio local /send-image (puerto 3899).
// El usuario puede combinar canales y editar el caption.
// ============================================================
import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, Instagram, Facebook, MessageCircle, CheckCircle2, AlertCircle, Send } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useToast } from '@/components/ui/use-toast';

const WA_WEB_URL = import.meta.env.VITE_WHATSAPP_WEB_URL || 'http://localhost:3899';

export default function PublishDesignModal({ open, onClose, design, onPublished }) {
    const { tenantId } = useAuth();
    const { toast } = useToast();

    const [caption, setCaption] = useState('');
    const [hashtags, setHashtags] = useState('');
    const [channels, setChannels] = useState({ facebook: true, instagram: true, whatsapp: false });
    const [whatsappTo, setWhatsappTo] = useState('');
    const [publishing, setPublishing] = useState(false);
    const [results, setResults] = useState(null);

    // Cuando abre, prellenar caption con copy IA si existe
    useEffect(() => {
        if (!open || !design) return;
        const aiCopy = design?.metadata?.ai_copy;
        if (aiCopy) {
            const partes = [aiCopy.titulo, aiCopy.subtitulo, aiCopy.cta].filter(Boolean);
            setCaption(partes.join('\n\n'));
            setHashtags(aiCopy.hashtags || '');
        } else {
            setCaption(design.name || '');
            setHashtags('');
        }
        setResults(null);
    }, [open, design]);

    const fullCaption = [caption, hashtags].filter(Boolean).join('\n\n');

    const handlePublish = async () => {
        if (!design?.rendered_url) {
            toast({ variant: 'destructive', title: 'Sin imagen', description: 'El disen~o aun no se ha exportado a PNG. Abrelo y dale Exportar PNG primero.' });
            return;
        }
        const selectedChannels = Object.entries(channels).filter(([_, v]) => v).map(([k]) => k);
        if (!selectedChannels.length) {
            toast({ variant: 'destructive', title: 'Sin canal', description: 'Marca al menos un canal donde publicar.' });
            return;
        }
        if (channels.whatsapp && !whatsappTo.trim()) {
            toast({ variant: 'destructive', title: 'Numero faltante', description: 'Pon el numero (con codigo de pais) para WhatsApp.' });
            return;
        }

        setPublishing(true);
        const combined = { facebook: null, instagram: null, whatsapp: null };

        try {
            // 1) FB + IG via Edge Function
            const metaChannels = selectedChannels.filter(c => c === 'facebook' || c === 'instagram');
            if (metaChannels.length) {
                const { data, error } = await supabase.functions.invoke('publish-design', {
                    body: {
                        tenant_id: tenantId,
                        design_id: design.id,
                        caption: fullCaption,
                        channels: metaChannels,
                    },
                });
                if (error) {
                    metaChannels.forEach(c => { combined[c] = { ok: false, error: error.message }; });
                } else {
                    metaChannels.forEach(c => { combined[c] = data?.results?.[c] || { ok: false, error: 'sin respuesta' }; });
                }
            }

            // 2) WhatsApp via servicio local
            if (channels.whatsapp) {
                try {
                    const imgRes = await fetch(design.rendered_url);
                    const blob = await imgRes.blob();
                    const base64 = await blobToBase64(blob);
                    const r = await fetch(`${WA_WEB_URL}/send-image`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            to: whatsappTo.trim(),
                            imageBase64: base64,
                            mime: blob.type || 'image/png',
                            caption: fullCaption,
                        }),
                    });
                    const out = await r.json();
                    combined.whatsapp = r.ok && out?.ok
                        ? { ok: true, message_id: out.message_id, media_url: out.media_url }
                        : { ok: false, error: out?.error || `HTTP ${r.status}` };
                } catch (e) {
                    combined.whatsapp = { ok: false, error: e.message || String(e) };
                }
            }

            setResults(combined);

            const okCount = Object.values(combined).filter(v => v?.ok).length;
            const failCount = Object.values(combined).filter(v => v && !v.ok).length;
            if (okCount && !failCount) {
                toast({ title: '🚀 Publicado', description: `Se publico en ${okCount} canal(es).` });
                onPublished?.();
            } else if (okCount && failCount) {
                toast({ variant: 'destructive', title: 'Publicacion parcial', description: `${okCount} OK · ${failCount} con error. Mira el detalle abajo.` });
            } else {
                toast({ variant: 'destructive', title: 'No se pudo publicar', description: 'Ningun canal exitoso. Mira el detalle abajo.' });
            }
        } finally {
            setPublishing(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
            <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Send className="h-5 w-5 text-violet-600" />
                        Publicar disen~o
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-4">
                    {/* Preview imagen */}
                    {design?.rendered_url || design?.thumbnail_url ? (
                        <div className="bg-slate-50 border border-slate-200 rounded p-2 flex justify-center">
                            <img
                                src={design.rendered_url || design.thumbnail_url}
                                alt={design.name}
                                className="max-h-48 object-contain"
                            />
                        </div>
                    ) : (
                        <div className="bg-amber-50 border border-amber-200 rounded p-3 text-xs text-amber-800 flex items-center gap-2">
                            <AlertCircle className="h-4 w-4" />
                            Este disen~o no tiene PNG exportado todavia. Abrelo y dale "Exportar PNG" antes de publicar.
                        </div>
                    )}

                    {/* Caption */}
                    <div>
                        <Label className="text-xs font-bold text-slate-600">Texto / Caption</Label>
                        <Textarea
                            value={caption}
                            onChange={(e) => setCaption(e.target.value)}
                            rows={4}
                            placeholder="Texto que acompan~a la imagen..."
                        />
                    </div>

                    {/* Hashtags */}
                    <div>
                        <Label className="text-xs font-bold text-slate-600">Hashtags</Label>
                        <Input
                            value={hashtags}
                            onChange={(e) => setHashtags(e.target.value)}
                            placeholder="#repuestos #motos #motoflow"
                        />
                    </div>

                    {/* Canales */}
                    <div>
                        <Label className="text-xs font-bold text-slate-600">Canales</Label>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-1">
                            <ChannelToggle
                                icon={Facebook}
                                label="Facebook"
                                color="text-blue-600"
                                checked={channels.facebook}
                                onChange={(v) => setChannels(c => ({ ...c, facebook: v }))}
                            />
                            <ChannelToggle
                                icon={Instagram}
                                label="Instagram"
                                color="text-pink-600"
                                checked={channels.instagram}
                                onChange={(v) => setChannels(c => ({ ...c, instagram: v }))}
                            />
                            <ChannelToggle
                                icon={MessageCircle}
                                label="WhatsApp"
                                color="text-emerald-600"
                                checked={channels.whatsapp}
                                onChange={(v) => setChannels(c => ({ ...c, whatsapp: v }))}
                            />
                        </div>
                    </div>

                    {/* WhatsApp destinatario */}
                    {channels.whatsapp && (
                        <div>
                            <Label className="text-xs font-bold text-slate-600">Numero de WhatsApp (con codigo pais)</Label>
                            <Input
                                value={whatsappTo}
                                onChange={(e) => setWhatsappTo(e.target.value)}
                                placeholder="18091234567"
                            />
                            <p className="text-[10px] text-slate-500 mt-1">
                                Se envia como mensaje a ese numero. Para difundir a varios contactos o status, usa la app de WhatsApp.
                            </p>
                        </div>
                    )}

                    {/* Resultados */}
                    {results && (
                        <div className="border border-slate-200 rounded p-3 space-y-2 bg-slate-50">
                            <p className="text-xs font-bold text-slate-700">Resultado:</p>
                            {Object.entries(results).map(([ch, r]) => {
                                if (!r) return null;
                                return (
                                    <div key={ch} className="flex items-start gap-2 text-xs">
                                        {r.ok
                                            ? <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                                            : <AlertCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />}
                                        <div>
                                            <span className="font-bold capitalize">{ch}:</span>{' '}
                                            {r.ok ? 'Publicado correctamente' : `Error — ${r.error || 'desconocido'}`}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                <DialogFooter className="gap-2">
                    <Button variant="ghost" onClick={onClose}>Cerrar</Button>
                    <Button
                        onClick={handlePublish}
                        disabled={publishing || !design?.rendered_url}
                        className="bg-violet-600 text-white hover:bg-violet-700"
                    >
                        {publishing ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Send className="h-4 w-4 mr-1" />}
                        Publicar
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function ChannelToggle({ icon: Icon, label, color, checked, onChange }) {
    return (
        <label className={`flex items-center gap-2 p-2 border rounded cursor-pointer transition ${checked ? 'border-violet-500 bg-violet-50' : 'border-slate-200 bg-white hover:border-slate-400'}`}>
            <Checkbox checked={checked} onCheckedChange={onChange} />
            <Icon className={`h-4 w-4 ${color}`} />
            <span className="text-sm font-semibold">{label}</span>
        </label>
    );
}

function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}
