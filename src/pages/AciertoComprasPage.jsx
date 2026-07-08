import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, ArrowLeft, Target } from 'lucide-react';

const fmt = (v) => Number(v || 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Semáforo del % de capital rotado
const PctBadge = ({ pct }) => {
  if (pct === null || pct === undefined) return <span className="text-slate-300 text-[10px]">aún no madura</span>;
  const n = Number(pct);
  const cls = n >= 60 ? 'bg-emerald-100 text-emerald-700' : n >= 30 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700';
  return <span className={`px-1.5 py-0.5 rounded font-bold text-[11px] ${cls}`}>{n.toFixed(1)}%</span>;
};

const ESTADO_ROTACION = {
  rapido: { txt: 'ROTÓ RÁPIDO', cls: 'bg-emerald-100 text-emerald-700' },
  normal: { txt: 'NORMAL', cls: 'bg-sky-100 text-sky-700' },
  lento: { txt: 'LENTO', cls: 'bg-amber-100 text-amber-700' },
  muerto: { txt: 'MUERTO 90d', cls: 'bg-red-100 text-red-700' },
  inmaduro: { txt: 'RECIENTE', cls: 'bg-slate-100 text-slate-500' },
};

const AciertoComprasPage = ({ onBack }) => {
  const { toast } = useToast();
  const [meses, setMeses] = useState('6');
  const [loading, setLoading] = useState(false);
  const [suplidores, setSuplidores] = useState([]);
  const [supSel, setSupSel] = useState(null);       // { suplidor_id, suplidor_nombre }
  const [compras, setCompras] = useState([]);
  const [loadingCompras, setLoadingCompras] = useState(false);
  const [detalleCompra, setDetalleCompra] = useState(null); // { numero, fecha, filas }
  const [loadingDetalle, setLoadingDetalle] = useState(false);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_acierto_suplidores', { p_meses: parseInt(meses, 10) });
      if (error) throw error;
      setSuplidores(data || []);
    } catch (e) {
      toast({ variant: 'destructive', title: 'No se pudo cargar el acierto', description: e.message });
      setSuplidores([]);
    }
    setLoading(false);
  }, [meses, toast]);

  useEffect(() => { cargar(); }, [cargar]);

  const abrirSuplidor = async (s) => {
    setSupSel(s);
    setLoadingCompras(true);
    try {
      const { data, error } = await supabase.rpc('get_acierto_compras_suplidor', {
        p_suplidor_id: s.suplidor_id, p_meses: parseInt(meses, 10),
      });
      if (error) throw error;
      setCompras(data || []);
    } catch (e) {
      toast({ variant: 'destructive', title: 'Error', description: e.message });
      setCompras([]);
    }
    setLoadingCompras(false);
  };

  const abrirCompra = async (c) => {
    setLoadingDetalle(true);
    try {
      const { data, error } = await supabase.rpc('get_acierto_compra_detalle', { p_compra_id: c.compra_id });
      if (error) throw error;
      setDetalleCompra({ numero: c.numero, fecha: c.fecha, filas: data || [] });
    } catch (e) {
      toast({ variant: 'destructive', title: 'Error', description: e.message });
    }
    setLoadingDetalle(false);
  };

  // Totales globales (ponderados por capital de cada suplidor)
  const totInvertido = suplidores.reduce((a, s) => a + Number(s.capital_invertido || 0), 0);
  const totMuerto = suplidores.reduce((a, s) => a + Number(s.capital_muerto_90 || 0), 0);
  const capMaduro30 = suplidores.filter(s => s.pct_capital_30 !== null);
  const pctGlobal30 = capMaduro30.length
    ? capMaduro30.reduce((a, s) => a + Number(s.pct_capital_30) * Number(s.capital_invertido || 0), 0)
      / Math.max(1, capMaduro30.reduce((a, s) => a + Number(s.capital_invertido || 0), 0))
    : null;

  return (
    <div className="space-y-3 p-1">
      {/* Header */}
      <div className="flex items-center gap-2 flex-wrap">
        <Button variant="outline" size="sm" onClick={onBack}><ArrowLeft className="w-4 h-4 mr-1" /> Órdenes</Button>
        <h2 className="text-lg font-black text-slate-800 flex items-center gap-2">
          <Target className="w-5 h-5 text-emerald-600" /> Acierto de Compra
        </h2>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-slate-500">Período</span>
          <Select value={meses} onValueChange={setMeses}>
            <SelectTrigger className="h-8 w-32 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="3">3 meses</SelectItem>
              <SelectItem value="6">6 meses</SelectItem>
              <SelectItem value="12">12 meses</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <p className="text-[11px] text-slate-500 -mt-1">
        Mide qué % del <b>dinero invertido</b> en cada compra ya se vendió a los 30/60/90 días, y cuánto quedó muerto (sin venderse a 90 días). Cada compra se mide solo cuando madura.
      </p>

      {/* Tarjetas resumen */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
          <p className="text-[10px] uppercase text-slate-400 font-bold">Capital invertido ({meses} meses)</p>
          <p className="font-bold text-slate-800 text-lg">RD$ {fmt(totInvertido)}</p>
        </div>
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
          <p className="text-[10px] uppercase text-emerald-600 font-bold">% rotado a 30 días (global)</p>
          <p className="font-bold text-emerald-700 text-lg">{pctGlobal30 === null ? '—' : `${pctGlobal30.toFixed(1)}%`}</p>
        </div>
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2">
          <p className="text-[10px] uppercase text-red-500 font-bold">💀 Capital muerto (90d sin venderse)</p>
          <p className="font-bold text-red-600 text-lg">RD$ {fmt(totMuerto)}</p>
        </div>
      </div>

      {/* Nivel 1: por suplidor */}
      {!supSel && (
        <div className="border rounded-lg overflow-hidden bg-white">
          <Table>
            <TableHeader className="bg-slate-100">
              <TableRow>
                <TableHead className="text-[11px] font-black uppercase">Suplidor</TableHead>
                <TableHead className="text-[11px] font-black uppercase text-center">Compras</TableHead>
                <TableHead className="text-[11px] font-black uppercase text-right">Invertido</TableHead>
                <TableHead className="text-[11px] font-black uppercase text-center">Rotado 30d</TableHead>
                <TableHead className="text-[11px] font-black uppercase text-center">60d</TableHead>
                <TableHead className="text-[11px] font-black uppercase text-center">90d</TableHead>
                <TableHead className="text-[11px] font-black uppercase text-right">💀 Muerto 90d</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={7} className="text-center py-10"><Loader2 className="w-6 h-6 animate-spin inline text-emerald-600" /></TableCell></TableRow>
              ) : suplidores.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center py-10 text-slate-400 italic">Sin compras en el período.</TableCell></TableRow>
              ) : suplidores.map(s => (
                <TableRow key={s.suplidor_id || 'sin'} className="cursor-pointer hover:bg-emerald-50/50 h-9"
                  onClick={() => abrirSuplidor(s)} title="Clic para ver sus compras">
                  <TableCell className="py-1 font-bold text-slate-700 uppercase">{s.suplidor_nombre}</TableCell>
                  <TableCell className="py-1 text-center">{s.compras}</TableCell>
                  <TableCell className="py-1 text-right font-mono">RD$ {fmt(s.capital_invertido)}</TableCell>
                  <TableCell className="py-1 text-center"><PctBadge pct={s.pct_capital_30} /></TableCell>
                  <TableCell className="py-1 text-center"><PctBadge pct={s.pct_capital_60} /></TableCell>
                  <TableCell className="py-1 text-center"><PctBadge pct={s.pct_capital_90} /></TableCell>
                  <TableCell className={`py-1 text-right font-bold ${Number(s.capital_muerto_90) > 0 ? 'text-red-600' : 'text-slate-400'}`}>
                    RD$ {fmt(s.capital_muerto_90)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Nivel 2: compras del suplidor */}
      {supSel && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => { setSupSel(null); setCompras([]); }}>
              <ArrowLeft className="w-4 h-4 mr-1" /> Suplidores
            </Button>
            <span className="font-black text-slate-700 uppercase">{supSel.suplidor_nombre}</span>
          </div>
          <div className="border rounded-lg overflow-hidden bg-white">
            <Table>
              <TableHeader className="bg-slate-100">
                <TableRow>
                  <TableHead className="text-[11px] font-black uppercase">Compra</TableHead>
                  <TableHead className="text-[11px] font-black uppercase">Fecha</TableHead>
                  <TableHead className="text-[11px] font-black uppercase text-center">Líneas</TableHead>
                  <TableHead className="text-[11px] font-black uppercase text-right">Capital</TableHead>
                  <TableHead className="text-[11px] font-black uppercase text-center">30d</TableHead>
                  <TableHead className="text-[11px] font-black uppercase text-center">60d</TableHead>
                  <TableHead className="text-[11px] font-black uppercase text-center">90d</TableHead>
                  <TableHead className="text-[11px] font-black uppercase text-right">💀 Muerto</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingCompras ? (
                  <TableRow><TableCell colSpan={8} className="text-center py-10"><Loader2 className="w-6 h-6 animate-spin inline text-emerald-600" /></TableCell></TableRow>
                ) : compras.length === 0 ? (
                  <TableRow><TableCell colSpan={8} className="text-center py-10 text-slate-400 italic">Sin compras en el período.</TableCell></TableRow>
                ) : compras.map(c => (
                  <TableRow key={c.compra_id} className="cursor-pointer hover:bg-emerald-50/50 h-9"
                    onClick={() => abrirCompra(c)} title="Clic para ver el detalle por producto">
                    <TableCell className="py-1 font-bold text-blue-700">{c.numero}</TableCell>
                    <TableCell className="py-1">{c.fecha} <span className="text-slate-400 text-[10px]">({c.edad_dias}d)</span></TableCell>
                    <TableCell className="py-1 text-center">{c.lineas}{Number(c.lineas_muertas_90) > 0 && <span className="text-red-600 font-bold text-[10px]"> ({c.lineas_muertas_90}💀)</span>}</TableCell>
                    <TableCell className="py-1 text-right font-mono">RD$ {fmt(c.capital)}</TableCell>
                    <TableCell className="py-1 text-center"><PctBadge pct={c.pct_capital_30} /></TableCell>
                    <TableCell className="py-1 text-center"><PctBadge pct={c.pct_capital_60} /></TableCell>
                    <TableCell className="py-1 text-center"><PctBadge pct={c.pct_capital_90} /></TableCell>
                    <TableCell className={`py-1 text-right font-bold ${Number(c.capital_muerto_90) > 0 ? 'text-red-600' : 'text-slate-400'}`}>
                      {c.capital_muerto_90 === null ? '—' : `RD$ ${fmt(c.capital_muerto_90)}`}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* Nivel 3: detalle por producto de una compra */}
      <Dialog open={!!detalleCompra || loadingDetalle} onOpenChange={(open) => { if (!open) setDetalleCompra(null); }}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-emerald-700">
              {detalleCompra ? `Compra ${detalleCompra.numero} — ${detalleCompra.fecha}` : 'Cargando…'}
            </DialogTitle>
          </DialogHeader>
          {loadingDetalle ? (
            <div className="text-center py-8"><Loader2 className="w-6 h-6 animate-spin inline text-emerald-600" /></div>
          ) : detalleCompra && (
            <Table>
              <TableHeader className="bg-slate-100">
                <TableRow>
                  <TableHead className="text-[10px] font-black uppercase">Producto</TableHead>
                  <TableHead className="text-[10px] font-black uppercase text-center">Compró</TableHead>
                  <TableHead className="text-[10px] font-black uppercase text-right">Capital</TableHead>
                  <TableHead className="text-[10px] font-black uppercase text-center">V.30d</TableHead>
                  <TableHead className="text-[10px] font-black uppercase text-center">V.90d</TableHead>
                  <TableHead className="text-[10px] font-black uppercase text-center">Sin vender</TableHead>
                  <TableHead className="text-[10px] font-black uppercase text-center">Rotación</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {detalleCompra.filas.map(f => {
                  const est = ESTADO_ROTACION[f.estado_rotacion] || ESTADO_ROTACION.inmaduro;
                  return (
                    <TableRow key={f.producto_id} className="h-8">
                      <TableCell className="py-1 text-xs"><b>{f.codigo}</b> <span className="text-slate-500">{(f.descripcion || '').slice(0, 40)}</span></TableCell>
                      <TableCell className="py-1 text-center text-xs">{Number(f.cantidad)}</TableCell>
                      <TableCell className="py-1 text-right text-xs font-mono">RD$ {fmt(f.capital)}</TableCell>
                      <TableCell className="py-1 text-center text-xs">{Number(f.vendidas_30)}</TableCell>
                      <TableCell className="py-1 text-center text-xs">{Number(f.vendidas_90)}</TableCell>
                      <TableCell className={`py-1 text-center text-xs font-bold ${Number(f.sin_vender) > 0 ? 'text-red-600' : 'text-emerald-600'}`}>{Number(f.sin_vender)}</TableCell>
                      <TableCell className="py-1 text-center"><span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${est.cls}`}>{est.txt}</span></TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AciertoComprasPage;
