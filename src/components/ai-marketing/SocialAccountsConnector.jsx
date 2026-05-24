// ============================================================
// SocialAccountsConnector.jsx — Conectar cuentas (Fase 2a: manual)
// ============================================================
import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Youtube, Instagram, Music2, Facebook, MessageCircle, Plus, Trash2, Loader2, Link2 } from 'lucide-react';
import { connectSocialAccount, listSocialAccounts, disconnectSocialAccount } from '@/services/socialMetricsService';

const PLATFORMS = [
    { key: 'youtube', label: 'YouTube', icon: Youtube, color: 'text-red-600' },
    { key: 'instagram', label: 'Instagram', icon: Instagram, color: 'text-pink-600' },
    { key: 'tiktok', label: 'TikTok', icon: Music2, color: 'text-slate-800' },
    { key: 'facebook', label: 'Facebook', icon: Facebook, color: 'text-blue-600' },
    { key: 'whatsapp', label: 'WhatsApp', icon: MessageCircle, color: 'text-emerald-600' },
];

export default function SocialAccountsConnector() {
    const { tenantId } = useAuth();
    const { toast } = useToast();
    const [accounts, setAccounts] = useState([]);
    const [adding, setAdding] = useState(null); // platform key
    const [name, setName] = useState('');
    const [loading, setLoading] = useState(false);

    const cargar = useCallback(async () => {
        if (!tenantId) return;
        try { setAccounts(await listSocialAccounts(tenantId)); } catch (e) { console.error(e); }
    }, [tenantId]);
    useEffect(() => { cargar(); }, [cargar]);

    const conectar = async (platform) => {
        if (!name.trim()) return;
        setLoading(true);
        try {
            await connectSocialAccount(tenantId, platform, name.trim());
            toast({ title: '✓ Cuenta registrada', description: `${platform}: ${name}` });
            setAdding(null); setName(''); cargar();
        } catch (e) {
            toast({ variant: 'destructive', title: 'Error', description: e.message });
        } finally { setLoading(false); }
    };

    const desconectar = async (id) => {
        try { await disconnectSocialAccount(id); cargar(); } catch (e) { toast({ variant: 'destructive', title: 'Error', description: e.message }); }
    };

    const cuentaDe = (plat) => accounts.find((a) => a.platform === plat);

    return (
        <div className="bg-white rounded-xl border border-slate-200 p-4">
            <h3 className="font-bold text-slate-800 flex items-center gap-2 mb-1"><Link2 className="h-5 w-5 text-violet-600" /> Cuentas sociales</h3>
            <p className="text-xs text-slate-500 mb-4">Registra tus cuentas (handle/usuario). La conexión automática por API llega en la Fase 2b.</p>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {PLATFORMS.map(({ key, label, icon: Icon, color }) => {
                    const acc = cuentaDe(key);
                    return (
                        <div key={key} className="border border-slate-200 rounded-lg p-3">
                            <div className="flex items-center gap-2 mb-2">
                                <Icon className={`h-5 w-5 ${color}`} />
                                <span className="font-bold text-slate-700 text-sm">{label}</span>
                                {acc && <span className="ml-auto text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-emerald-100 text-emerald-700">conectada</span>}
                            </div>
                            {acc ? (
                                <div className="flex items-center justify-between">
                                    <span className="text-xs text-slate-600 truncate">{acc.account_name}</span>
                                    <button onClick={() => desconectar(acc.id)} className="text-red-400 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
                                </div>
                            ) : adding === key ? (
                                <div className="flex gap-1">
                                    <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="@usuario o canal" className="h-8 text-xs" />
                                    <Button size="sm" className="h-8 bg-violet-600 text-white" onClick={() => conectar(key)} disabled={loading}>
                                        {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : 'OK'}
                                    </Button>
                                </div>
                            ) : (
                                <Button size="sm" variant="outline" className="w-full h-8 text-xs" onClick={() => { setAdding(key); setName(''); }}>
                                    <Plus className="h-3 w-3 mr-1" /> Registrar
                                </Button>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
