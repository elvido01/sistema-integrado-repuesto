import React from 'react';
import { Package, CreditCard, Wrench, ShoppingCart, TrendingUp, BarChart2, Activity, Eye, X, CheckCircle2, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePanels } from '@/contexts/PanelContext';
import AiRiskBadge from './AiRiskBadge';

const ALERT_TYPE_TO_PANEL = {
    stock_bajo:           'mercancias',
    existencia_negativa:  'mercancias',
    sin_ubicacion:        'actualizar-ubicacion',
    producto_lento:       'mercancias',
    factura_vencida:      'recibo-ingreso',
};

const AREA_ICONS = {
    inventario:  { icon: Package,      color: 'text-blue-600 bg-blue-50' },
    credito:     { icon: CreditCard,   color: 'text-purple-600 bg-purple-50' },
    operaciones: { icon: Wrench,       color: 'text-slate-600 bg-slate-100' },
    compras:     { icon: ShoppingCart, color: 'text-orange-600 bg-orange-50' },
    ventas:      { icon: TrendingUp,   color: 'text-emerald-600 bg-emerald-50' },
    finanzas:    { icon: BarChart2,    color: 'text-indigo-600 bg-indigo-50' },
    default:     { icon: Activity,     color: 'text-slate-600 bg-slate-100' },
};

export default function AiAlertCard({ alert, onChangeStatus, updating }) {
    const { openPanel } = usePanels();
    const areaInfo = AREA_ICONS[alert.area] || AREA_ICONS.default;
    const Icon = areaInfo.icon;
    const created = new Date(alert.created_at).toLocaleString('es-DO', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    const targetPanel = ALERT_TYPE_TO_PANEL[alert.alert_type];

    const irAlModulo = () => {
        if (!targetPanel) return;
        const extra = {};
        if (alert.related_table === 'productos' && alert.related_id) extra.productoId = alert.related_id;
        if (alert.related_table === 'facturas' && alert.metadata?.cliente_id) extra.clienteId = alert.metadata.cliente_id;
        openPanel(targetPanel, extra);
    };

    return (
        <div className="bg-white border border-slate-200 rounded-md p-3 hover:shadow-sm transition-shadow flex gap-3">
            <div className={`flex-shrink-0 p-2 rounded ${areaInfo.color} self-start`}>
                <Icon className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">{alert.area}</span>
                    <AiRiskBadge severity={alert.severity} />
                    <span className="text-[10px] text-slate-400">·</span>
                    <span className="text-[10px] text-slate-400">{created}</span>
                </div>
                <h4 className="text-sm font-bold text-slate-800 leading-tight">{alert.title}</h4>
                {alert.description && (
                    <p className="text-xs text-slate-600 mt-0.5 leading-snug">{alert.description}</p>
                )}
                {alert.recommendation && (
                    <p className="text-[11px] text-emerald-700 mt-1">
                        <strong>Recomendación:</strong> {alert.recommendation}
                    </p>
                )}
            </div>
            <div className="flex-shrink-0 flex flex-col gap-1">
                {targetPanel && (
                    <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-[10px] text-blue-700 border-blue-300 hover:bg-blue-50"
                        onClick={irAlModulo}
                        title={`Abrir ${targetPanel} para corregir`}
                    >
                        <ExternalLink className="h-3 w-3 mr-1" /> Ir a módulo
                    </Button>
                )}
                {alert.status === 'pending' && (
                    <>
                        <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 text-[10px] text-emerald-700 border-emerald-300 hover:bg-emerald-50"
                            onClick={() => onChangeStatus(alert.id, 'resolved')}
                            disabled={updating}
                            title="Marcar como resuelta"
                        >
                            <CheckCircle2 className="h-3 w-3 mr-1" /> Resolver
                        </Button>
                        <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-[10px] text-slate-500"
                            onClick={() => onChangeStatus(alert.id, 'reviewed')}
                            disabled={updating}
                            title="Marcar como revisada"
                        >
                            <Eye className="h-3 w-3 mr-1" /> Vista
                        </Button>
                        <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-[10px] text-slate-400"
                            onClick={() => onChangeStatus(alert.id, 'ignored')}
                            disabled={updating}
                            title="Ignorar"
                        >
                            <X className="h-3 w-3 mr-1" /> Ignorar
                        </Button>
                    </>
                )}
                {alert.status === 'reviewed' && (
                    <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-[10px] text-emerald-700 border-emerald-300"
                        onClick={() => onChangeStatus(alert.id, 'resolved')}
                        disabled={updating}
                    >
                        <CheckCircle2 className="h-3 w-3 mr-1" /> Resolver
                    </Button>
                )}
            </div>
        </div>
    );
}
