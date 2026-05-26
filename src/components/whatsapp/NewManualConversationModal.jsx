// ============================================================
// NewManualConversationModal.jsx — Crear conversacion manual
// ============================================================
// Para registrar conversaciones de Instagram / Facebook / WhatsApp
// que llegaron por fuera del sistema (modo manual mientras la API
// real no esta conectada). Inserta en sales_conversations + un
// primer sales_message.
// ============================================================
import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Instagram, Facebook, MessageCircle, Loader2 } from 'lucide-react';

const PLATFORMS = [
    { key: 'instagram', label: 'Instagram', icon: Instagram, hint: '@usuario' },
    { key: 'facebook', label: 'Facebook', icon: Facebook, hint: 'fb.com/usuario' },
    { key: 'whatsapp', label: 'WhatsApp', icon: MessageCircle, hint: '809-555-1234' },
];

export default function NewManualConversationModal({ open, onClose, onCreate, defaultPlatform = 'instagram' }) {
    const [platform, setPlatform] = useState(defaultPlatform);
    const [name, setName] = useState('');
    const [handle, setHandle] = useState('');
    const [phone, setPhone] = useState('');
    const [firstMessage, setFirstMessage] = useState('');
    const [saving, setSaving] = useState(false);

    const reset = () => {
        setPlatform(defaultPlatform); setName(''); setHandle(''); setPhone(''); setFirstMessage('');
    };

    const submit = async () => {
        if (!name.trim() || !firstMessage.trim()) return;
        setSaving(true);
        try {
            await onCreate({
                platform,
                customer_name: name.trim(),
                customer_external_id: handle.trim() || null,
                customer_phone: phone.trim() || null,
                first_message: firstMessage.trim(),
            });
            reset();
            onClose();
        } catch {
            // toast se muestra en el padre
        } finally {
            setSaving(false);
        }
    };

    const platformInfo = PLATFORMS.find((p) => p.key === platform) || PLATFORMS[0];

    return (
        <Dialog open={open} onOpenChange={(v) => { if (!v) { reset(); onClose(); } }}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>Nueva conversación manual</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                    <div>
                        <Label className="text-xs font-bold text-slate-600">Plataforma</Label>
                        <div className="flex gap-2 mt-1">
                            {PLATFORMS.map(({ key, label, icon: Icon }) => (
                                <button
                                    key={key}
                                    type="button"
                                    onClick={() => setPlatform(key)}
                                    className={`flex-1 flex items-center justify-center gap-1 px-2 py-2 border rounded text-xs ${platform === key ? 'border-violet-500 bg-violet-50 font-bold text-violet-700' : 'border-slate-200 text-slate-600'}`}
                                >
                                    <Icon className="h-3.5 w-3.5" /> {label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div>
                        <Label className="text-xs font-bold text-slate-600">Nombre del cliente *</Label>
                        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Juan Pérez" />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                        <div>
                            <Label className="text-xs font-bold text-slate-600">Usuario / Handle</Label>
                            <Input value={handle} onChange={(e) => setHandle(e.target.value)} placeholder={platformInfo.hint} />
                        </div>
                        <div>
                            <Label className="text-xs font-bold text-slate-600">Teléfono (opc)</Label>
                            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="809-..." />
                        </div>
                    </div>

                    <div>
                        <Label className="text-xs font-bold text-slate-600">Primer mensaje del cliente *</Label>
                        <textarea
                            value={firstMessage}
                            onChange={(e) => setFirstMessage(e.target.value)}
                            className="w-full text-sm border border-slate-200 rounded p-2 h-20 resize-none"
                            placeholder="Hola, me interesa una batería para mi moto..."
                        />
                    </div>

                    <p className="text-[10px] text-slate-400 italic">
                        Esto crea la conversación en el Sales Hub. Los mensajes posteriores los puedes
                        registrar manualmente desde el chat con "Pegar mensaje del cliente" o respondiendo.
                    </p>
                </div>
                <DialogFooter className="gap-2">
                    <Button variant="ghost" onClick={() => { reset(); onClose(); }}>Cancelar</Button>
                    <Button
                        onClick={submit}
                        disabled={saving || !name.trim() || !firstMessage.trim()}
                        className="bg-violet-600 text-white hover:bg-violet-700"
                    >
                        {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
                        Crear conversación
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
