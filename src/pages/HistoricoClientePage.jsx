import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { usePanels } from '@/contexts/PanelContext';
import { useLayout } from '@/contexts/LayoutContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Printer, X, Search } from 'lucide-react';
import ClienteSearchModal from '@/components/ventas/ClienteSearchModal';
import { generateHistoricoClientePDF } from '@/components/common/pdf/historicoClientePDF';
import { generateReciboPagoFinancieraPDF } from '@/components/common/pdf/reciboPagoFinancieraPDF';

const fmt = (v) => new Intl.NumberFormat('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(v) || 0);
const fdate = (d) => (d ? String(d).slice(0, 10) : '');

const HistoricoClientePage = () => {
  const { toast } = useToast();
  const { empresa } = useAuth();
  const { closePanel, activePanel } = usePanels();
  const { setSidebarOpen } = useLayout();

  useEffect(() => { setSidebarOpen(false); }, [setSidebarOpen]);

  const [cliente, setCliente] = useState(null);
  const [codigoInput, setCodigoInput] = useState('');
  const [buscarOpen, setBuscarOpen] = useState(false);
  const [desde, setDesde] = useState('2021-01-01');
  const [hasta, setHasta] = useState(new Date().toISOString().slice(0, 10));
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  const cargar = useCallback(async (clienteId) => {
    if (!clienteId) return;
    setLoading(true);
    try {
      const { data: res, error } = await supabase.rpc('get_historico_cliente', {
        p_cliente_id: clienteId, p_desde: desde || null, p_hasta: hasta || null,
      });
      if (error) throw error;
      setData(res);
    } catch (e) {
      toast({ variant: 'destructive', title: 'No se pudo cargar el histórico', description: e.message });
      setData(null);
    }
    setLoading(false);
  }, [desde, hasta, toast]);

  const seleccionarCliente = (c) => {
    setCliente(c); setBuscarOpen(false);
    setCodigoInput(c.codigo || c.rnc || '');
    cargar(c.id);
  };

  const buscarPorCodigo = async () => {
    const q = codigoInput.trim();
    if (!q) return;
    try {
      const { data: cls, error } = await supabase
        .from('clientes').select('id, nombre, codigo, rnc, direccion, telefono')
        .or(`codigo.eq.${q},rnc.eq.${q}`).eq('activo', true).limit(1);
      if (error) throw error;
      if (cls && cls.length) seleccionarCliente(cls[0]);
      else toast({ variant: 'destructive', title: 'Cliente no encontrado', description: `No hay cliente con código/cédula ${q}.` });
    } catch (e) {
      toast({ variant: 'destructive', title: 'Error al buscar', description: e.message });
    }
  };

  // Filas con balance corrido (igual que el PDF)
  const filas = useMemo(() => {
    const movs = data?.movimientos || [];
    let saldo = Number(data?.saldo_inicial) || 0;
    const out = [{ inicial: true, descripcion: 'BALANCE ANTERIOR', balance: saldo }];
    movs.forEach((m, i) => {
      saldo = Math.round((saldo + (Number(m.debito) || 0) - (Number(m.credito) || 0)) * 100) / 100;
      out.push({ ...m, key: i, balance: saldo });
    });
    return out;
  }, [data]);

  const totDeb = (data?.movimientos || []).reduce((a, m) => a + (Number(m.debito) || 0), 0);
  const totCre = (data?.movimientos || []).reduce((a, m) => a + (Number(m.credito) || 0), 0);
  const balanceFinal = filas.length ? filas[filas.length - 1].balance : 0;

  const imprimir = () => {
    if (!data) { toast({ variant: 'destructive', title: 'Selecciona un cliente' }); return; }
    generateHistoricoClientePDF(data, empresa || {});
  };

  // Doble clic en una fila de pago -> reimprimir el recibo de ese pago
  const reimprimir = async (m) => {
    if (!m?.ref_id) return;
    try {
      const { data: pago, error: e1 } = await supabase
        .from('prestamo_pagos').select('*').eq('id', m.ref_id).maybeSingle();
      if (e1) throw e1;
      const { data: det } = await supabase
        .from('prestamo_pago_detalle')
        .select('abono_capital, abono_interes, abono_mora, abono_total, cuota:cuota_id (numero_cuota)')
        .eq('pago_id', m.ref_id);
      const lineas = (det || []).map((d) => ({
        referencia: d.cuota?.numero_cuota ? `Cuota ${d.cuota.numero_cuota}` : '',
        capital: d.abono_capital, interes: d.abono_interes, mora: d.abono_mora, total: d.abono_total,
      }));
      generateReciboPagoFinancieraPDF(pago, data?.cliente || {}, lineas, empresa || {});
    } catch (e) {
      toast({ variant: 'destructive', title: 'No se pudo reimprimir el recibo', description: e.message });
    }
  };

  return (
    <div className="p-1.5 bg-slate-100">
      <Helmet><title>Histórico de Cliente — Financiera</title></Helmet>
      <div className="bg-white rounded-lg shadow border w-full overflow-hidden">
        <div className="bg-gradient-to-r from-slate-300 to-slate-200 text-slate-800 text-center py-1 font-extrabold tracking-wide text-base">
          HISTÓRICO DE CLIENTE
        </div>

        <div className="p-2 space-y-2">
          {/* Filtros */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-2 [&>*]:min-w-0">
            <div className="border rounded-md p-2 lg:col-span-2">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase whitespace-nowrap">Cliente</span>
                <Input
                  value={codigoInput}
                  onChange={(e) => setCodigoInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); buscarPorCodigo(); } }}
                  placeholder="Código o cédula" className="flex-1 h-8 text-sm"
                />
                <Button type="button" variant="outline" size="sm" onClick={() => setBuscarOpen(true)}>
                  <Search className="w-3.5 h-3.5 mr-1" />F3
                </Button>
              </div>
              <div className="mt-2 text-sm font-bold text-blue-700 leading-tight truncate" title={cliente?.nombre || ''}>{cliente?.nombre || '—'}</div>
              <div className="text-xs text-slate-500 truncate" title={cliente?.direccion || ''}>{cliente?.direccion || '—'}</div>
            </div>
            <div className="border rounded-md p-2 space-y-2">
              <div className="flex items-center gap-2">
                <Label className="text-xs w-24">Fecha Desde</Label>
                <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="h-8 text-sm flex-1" />
              </div>
              <div className="flex items-center gap-2">
                <Label className="text-xs w-24">Fecha Hasta</Label>
                <Input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="h-8 text-sm flex-1" />
              </div>
              <Button type="button" size="sm" className="w-full" disabled={!cliente} onClick={() => cliente && cargar(cliente.id)}>
                {loading ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}Consultar
              </Button>
            </div>
          </div>

          {data?.ultimo_pago && (
            <div className="text-right text-xs font-bold text-red-600">Último Pago → {fdate(data.ultimo_pago)}</div>
          )}

          {/* Tabla del libro mayor */}
          <div className="border rounded-md overflow-hidden">
            <div className="overflow-y-auto h-[340px]">
              <table className="w-full text-xs">
                <thead className="bg-gray-100 text-gray-700 font-bold border-b sticky top-0">
                  <tr>
                    <th className="text-left px-2 py-1">Fecha</th>
                    <th className="text-left px-2 py-1">Transacción</th>
                    <th className="text-left px-2 py-1">Referencia</th>
                    <th className="text-left px-2 py-1">Descripción</th>
                    <th className="text-right px-2 py-1">Débitos</th>
                    <th className="text-right px-2 py-1">Créditos</th>
                    <th className="text-right px-2 py-1">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {loading && <tr><td colSpan={7} className="p-6 text-center text-slate-400"><Loader2 className="w-5 h-5 animate-spin inline" /></td></tr>}
                  {!loading && !cliente && <tr><td colSpan={7} className="p-10 text-center italic text-slate-400">--- SELECCIONE UN CLIENTE ---</td></tr>}
                  {!loading && cliente && filas.length <= 1 && <tr><td colSpan={7} className="p-10 text-center italic text-slate-400">Sin movimientos en el período.</td></tr>}
                  {!loading && cliente && filas.length > 1 && filas.map((f, i) => (
                    f.inicial ? (
                      <tr key="ini" className="bg-slate-50 font-semibold">
                        <td className="px-2 py-1" colSpan={3}></td>
                        <td className="px-2 py-1">{f.descripcion}</td>
                        <td className="px-2 py-1"></td>
                        <td className="px-2 py-1"></td>
                        <td className="px-2 py-1 text-right">{fmt(f.balance)}</td>
                      </tr>
                    ) : (
                      <tr key={f.key}
                          onDoubleClick={() => reimprimir(f)}
                          title={f.ref_id ? 'Doble clic: reimprimir recibo' : ''}
                          className={`border-b last:border-0 ${i % 2 === 1 ? 'bg-[#eef6ff]' : 'bg-white'} ${f.ref_id ? 'cursor-pointer hover:bg-blue-50' : ''}`}>
                        <td className="px-2 py-1">{fdate(f.fecha)}</td>
                        <td className="px-2 py-1 font-bold text-blue-900">{f.transaccion}</td>
                        <td className="px-2 py-1">{f.referencia}</td>
                        <td className="px-2 py-1">{f.descripcion}</td>
                        <td className="px-2 py-1 text-right text-slate-700">{Number(f.debito) ? fmt(f.debito) : ''}</td>
                        <td className="px-2 py-1 text-right text-emerald-700">{Number(f.credito) ? fmt(f.credito) : ''}</td>
                        <td className="px-2 py-1 text-right font-bold">{fmt(f.balance)}</td>
                      </tr>
                    )
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Totales + acciones */}
          <div className="flex items-center justify-between flex-wrap gap-3 border-t pt-2">
            <div className="text-xs text-slate-600 flex gap-4">
              <span>Débitos: <b>{fmt(totDeb)}</b></span>
              <span>Créditos: <b className="text-emerald-700">{fmt(totCre)}</b></span>
              <span>Balance: <b className="text-red-600">{fmt(balanceFinal)}</b></span>
            </div>
            <div className="flex gap-2">
              <Button type="button" onClick={imprimir} disabled={!data}><Printer className="w-4 h-4 mr-1" />Imprimir</Button>
              <Button type="button" variant="secondary" onClick={() => closePanel(activePanel)}><X className="w-4 h-4 mr-1" />Retornar</Button>
            </div>
          </div>
        </div>
      </div>

      <ClienteSearchModal isOpen={buscarOpen} onClose={() => setBuscarOpen(false)} onSelectCliente={seleccionarCliente} />
    </div>
  );
};

export default HistoricoClientePage;
