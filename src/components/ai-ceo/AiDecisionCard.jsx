import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Check, X, Clock, Loader2, CheckCircle2, XCircle, PauseCircle, ChevronDown, ChevronUp } from 'lucide-react';
import AiRiskBadge from './AiRiskBadge';

const STATUS_STYLE = {
    pending:   { cls: 'bg-amber-50 border-amber-200',   icon: Clock,         color: 'text-amber-600' },
    approved:  { cls: 'bg-emerald-50 border-emerald-200', icon: CheckCircle2, color: 'text-emerald-600' },
    rejected:  { cls: 'bg-rose-50 border-rose-200',     icon: XCircle,       color: 'text-rose-600' },
    executed:  { cls: 'bg-blue-50 border-blue-200',     icon: CheckCircle2, color: 'text-blue-600' },
    postponed: { cls: 'bg-slate-50 border-slate-200',   icon: PauseCircle,   color: 'text-slate-500' },
};

const STATUS_LABEL = {
    pending: 'Pendiente',
    approved: 'Aprobada',
    rejected: 'Rechazada',
    executed: 'Ejecutada',
    postponed: 'Pospuesta',
};

export default function AiDecisionCard({ decision, onChangeStatus, updating }) {
    const [expanded, setExpanded] = useState(false);
    const [notes, setNotes] = useState('');
    const style = STATUS_STYLE[decision.status] || STATUS_STYLE.pending;
    const Icon = style.icon;
    const isPending = decision.status === 'pending';
    const created = new Date(decision.created_at).toLocaleString('es-DO', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

    return (
        <div className={`border rounded-md p-3 ${style.cls}`}>
            <div className="flex items-start gap-3">
                <Icon className={`h-5 w-5 flex-shrink-0 mt-0.5 ${style.color}`} />
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">{decision.area}</span>
                        <AiRiskBadge severity={decision.risk_level === 'low' ? 'low' : decision.risk_level === 'high' ? 'high' : 'medium'} />
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded bg-white border ${style.color}`}>
                            {STATUS_LABEL[decision.status]}
                        </span>
                        <span className="text-[10px] text-slate-400 ml-auto">{created}</span>
                    </div>
                    <h4 className="text-sm font-bold text-slate-800 leading-tight">{decision.title}</h4>
                    {decision.description && (
                        <p className="text-xs text-slate-600 mt-1 leading-snug">{decision.description}</p>
                    )}
                    {decision.recommendation && (
                        <p className="text-[11px] text-emerald-700 mt-1">
                            <strong>Recomendación IA:</strong> {decision.recommendation}
                        </p>
                    )}
                    {expanded && (
                        <div className="mt-2 pt-2 border-t border-slate-200 space-y-1">
                            {decision.expected_impact && (
                                <p className="text-[11px] text-slate-600"><strong>Impacto esperado:</strong> {decision.expected_impact}</p>
                            )}
                            {decision.decision_notes && (
                                <p className="text-[11px] text-slate-600"><strong>Notas de decisión:</strong> {decision.decision_notes}</p>
                            )}
                            {decision.approved_at && (
                                <p className="text-[10px] text-slate-400">Resuelta: {new Date(decision.approved_at).toLocaleString('es-DO')}</p>
                            )}
                        </div>
                    )}

                    {isPending && expanded && (
                        <div className="mt-2 space-y-2">
                            <Textarea
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                                placeholder="Notas sobre tu decisión (opcional)..."
                                className="text-xs h-16"
                            />
                            <div className="flex gap-2">
                                <Button
                                    size="sm"
                                    className="h-8 bg-emerald-600 hover:bg-emerald-700 text-white"
                                    onClick={() => onChangeStatus(decision.id, 'approved', notes)}
                                    disabled={updating}
                                >
                                    {updating ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Check className="h-3 w-3 mr-1" />}
                                    Aprobar
                                </Button>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-8 text-rose-700 border-rose-300 hover:bg-rose-50"
                                    onClick={() => onChangeStatus(decision.id, 'rejected', notes)}
                                    disabled={updating}
                                >
                                    <X className="h-3 w-3 mr-1" /> Rechazar
                                </Button>
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-8 text-slate-500"
                                    onClick={() => onChangeStatus(decision.id, 'postponed', notes)}
                                    disabled={updating}
                                >
                                    <PauseCircle className="h-3 w-3 mr-1" /> Posponer
                                </Button>
                            </div>
                        </div>
                    )}
                </div>
                <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0 flex-shrink-0"
                    onClick={() => setExpanded(!expanded)}
                >
                    {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </Button>
            </div>
        </div>
    );
}
