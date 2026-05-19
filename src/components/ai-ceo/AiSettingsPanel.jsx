// ============================================================
// AiSettingsPanel.jsx — Configuración avanzada de agentes IA
// ============================================================
// Permite editar los umbrales y parámetros que controlan el
// comportamiento de los agentes y reglas de alertas.
// ============================================================

import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Settings, Loader2, Save, RefreshCw, Info } from 'lucide-react';

const SETTING_META = {
    daily_report_hour:       { label: 'Hora del reporte diario',         help: 'Formato HH:MM (hora DR)', tipo: 'string' },
    weekly_report_day:       { label: 'Día del reporte semanal',         help: 'sunday/monday/...',       tipo: 'string' },
    margen_minimo_aceptable: { label: 'Margen mínimo aceptable (%)',     help: 'Productos con margen menor disparan alerta', tipo: 'number' },
    dias_producto_lento:     { label: 'Días para producto lento',        help: 'Sin venta en este lapso = lento',            tipo: 'number' },
    dias_producto_muerto:    { label: 'Días para inventario muerto',     help: 'Sin venta = capital muerto',                 tipo: 'number' },
    capital_inmovilizado_threshold: { label: 'Umbral capital alto (RD$)', help: 'Por producto',                              tipo: 'number' },
    mora_dias_critica:       { label: 'Días vencidos = mora crítica',    help: 'Eleva severidad a critical',                 tipo: 'number' },
    mora_dias_high:          { label: 'Días vencidos = mora alta',       help: 'Eleva severidad a high',                     tipo: 'number' },
    llm_model:               { label: 'Modelo LLM por defecto',          help: 'gpt-4o-mini / gpt-4o / claude-haiku',        tipo: 'string' },
    email_resumen_enabled:   { label: 'Email diario habilitado',          help: 'Requiere RESEND_API_KEY como Supabase secret. true/false', tipo: 'string' },
    email_resumen_recipients:{ label: 'Email recipients (separar con ,)', help: 'Ej: dueño@morla.com, admin@morla.com',       tipo: 'string' },
    email_from:              { label: 'Email "From"',                     help: 'Default: MORLA AI CEO <onboarding@resend.dev>', tipo: 'string' },
};

export default function AiSettingsPanel() {
    const { tenantId } = useAuth();
    const { toast } = useToast();
    const [items, setItems] = useState([]);
    const [edits, setEdits] = useState({});
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [agents, setAgents] = useState([]);
    const [plan, setPlan] = useState(null);

    const cargar = useCallback(async () => {
        if (!tenantId) return;
        setLoading(true);
        try {
            const [sRes, aRes, pRes] = await Promise.all([
                supabase.from('ai_settings').select('*').eq('tenant_id', tenantId).order('key'),
                supabase.from('ai_agents').select('*').order('orden'),
                supabase.from('tenant_credit_plan').select('plan, daily_credit_limit, agentes_habilitados').eq('tenant_id', tenantId).maybeSingle(),
            ]);
            setItems(sRes.data || []);
            setAgents(aRes.data || []);
            setPlan(pRes.data);
            setEdits({});
        } catch (err) {
            toast({ variant: 'destructive', title: 'Error', description: err.message });
        } finally {
            setLoading(false);
        }
    }, [tenantId, toast]);

    useEffect(() => { cargar(); }, [cargar]);

    const cambiar = (key, raw, tipo) => {
        let value;
        if (tipo === 'number') {
            const n = Number(raw);
            value = isNaN(n) ? 0 : n;
        } else {
            value = String(raw);
        }
        setEdits((prev) => ({ ...prev, [key]: value }));
    };

    const valorActual = (key) => {
        if (edits[key] !== undefined) return edits[key];
        const item = items.find((i) => i.key === key);
        if (!item) return '';
        const v = item.value;
        if (typeof v === 'string') return v;
        if (typeof v === 'number') return v;
        if (typeof v === 'object') return JSON.stringify(v);
        return String(v);
    };

    const guardar = async () => {
        if (Object.keys(edits).length === 0) {
            toast({ title: 'Sin cambios', description: 'No hay nada que guardar.' });
            return;
        }
        setSaving(true);
        try {
            for (const [key, value] of Object.entries(edits)) {
                const item = items.find((i) => i.key === key);
                const meta = SETTING_META[key];
                const jsonValue = meta?.tipo === 'number' ? Number(value) : value;
                if (item) {
                    await supabase.from('ai_settings').update({
                        value: jsonValue,
                        updated_at: new Date().toISOString(),
                    }).eq('id', item.id);
                } else {
                    await supabase.from('ai_settings').insert({
                        tenant_id: tenantId, key, value: jsonValue, description: meta?.label,
                    });
                }
            }
            toast({ title: '✓ Guardado', description: `${Object.keys(edits).length} ajuste(s) actualizado(s).` });
            await cargar();
        } catch (err) {
            toast({ variant: 'destructive', title: 'Error guardando', description: err.message });
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="space-y-4">
            {/* Plan */}
            <div className="bg-white border border-slate-200 rounded-lg shadow-sm p-4">
                <div className="flex items-center gap-2 mb-2">
                    <Settings className="h-5 w-5 text-slate-600" />
                    <h3 className="text-base font-bold text-slate-800">Plan y créditos IA</h3>
                </div>
                {loading ? (
                    <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
                ) : plan ? (
                    <div className="grid grid-cols-3 gap-3">
                        <div className="bg-violet-50 border border-violet-200 rounded p-3">
                            <div className="text-[10px] uppercase font-bold text-violet-700">Plan</div>
                            <div className="text-lg font-bold text-slate-800 uppercase">{plan.plan}</div>
                        </div>
                        <div className="bg-blue-50 border border-blue-200 rounded p-3">
                            <div className="text-[10px] uppercase font-bold text-blue-700">Límite diario</div>
                            <div className="text-lg font-bold text-slate-800">{plan.daily_credit_limit} créditos</div>
                        </div>
                        <div className="bg-emerald-50 border border-emerald-200 rounded p-3">
                            <div className="text-[10px] uppercase font-bold text-emerald-700">Agentes activos</div>
                            <div className="text-lg font-bold text-slate-800">{plan.agentes_habilitados?.length || 0}</div>
                        </div>
                    </div>
                ) : (
                    <p className="text-sm text-slate-500">Sin plan asignado.</p>
                )}
            </div>

            {/* Equipo de agentes */}
            <div className="bg-white border border-slate-200 rounded-lg shadow-sm p-4">
                <h3 className="text-base font-bold text-slate-800 mb-3">Equipo MORLA AI CEO</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                    {agents.map((a) => (
                        <div key={a.id} className="border border-slate-200 rounded p-2 flex gap-2 items-start">
                            <span className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${a.is_active ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                            <div className="flex-1 min-w-0">
                                <div className="text-xs font-bold text-slate-800">{a.role}</div>
                                <div className="text-[10px] text-slate-500 truncate">{a.name}</div>
                                <div className="text-[10px] text-slate-400 mt-1 leading-tight">{a.description}</div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Umbrales y ajustes */}
            <div className="bg-white border border-slate-200 rounded-lg shadow-sm">
                <div className="p-3 border-b border-slate-200 flex items-center gap-2">
                    <Settings className="h-5 w-5 text-slate-600" />
                    <h3 className="text-base font-bold text-slate-800">Umbrales y parámetros</h3>
                    <Button variant="outline" size="sm" className="h-8 ml-auto" onClick={cargar} disabled={loading}>
                        <RefreshCw className={`h-3 w-3 mr-1 ${loading ? 'animate-spin' : ''}`} />
                        Refrescar
                    </Button>
                    <Button
                        size="sm"
                        className="h-8 bg-violet-600 hover:bg-violet-700 text-white"
                        onClick={guardar}
                        disabled={saving || Object.keys(edits).length === 0}
                    >
                        {saving ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Save className="h-3 w-3 mr-1" />}
                        Guardar {Object.keys(edits).length > 0 && `(${Object.keys(edits).length})`}
                    </Button>
                </div>
                {loading ? (
                    <div className="p-6 text-center"><Loader2 className="h-5 w-5 animate-spin inline text-slate-400" /></div>
                ) : (
                    <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                        {Object.entries(SETTING_META).map(([key, meta]) => (
                            <div key={key} className="space-y-1">
                                <Label htmlFor={`s-${key}`} className="text-xs font-bold text-slate-700">
                                    {meta.label}
                                    {edits[key] !== undefined && <span className="text-amber-600 ml-1">●</span>}
                                </Label>
                                <Input
                                    id={`s-${key}`}
                                    type={meta.tipo === 'number' ? 'number' : 'text'}
                                    value={valorActual(key)}
                                    onChange={(e) => cambiar(key, e.target.value, meta.tipo)}
                                    className="h-8 text-sm"
                                />
                                <p className="text-[10px] text-slate-500 flex items-center gap-1">
                                    <Info className="h-3 w-3" /> {meta.help}
                                </p>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
