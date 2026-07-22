import React, { useCallback, useEffect, useState } from 'react';
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
import { generateListaChasisPDF } from '@/components/common/pdf/listaChasisPDF';

const fmt = (v) => new Intl.NumberFormat('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(v) || 0);
const fdate = (d) => {
  if (!d) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(d);
};

const ListaChasisPrestamosPage = () => {
  const { toast } = useToast();
  const { empresa } = useAuth();
  const { closePanel, activePanel } = usePanels();
  const { setSidebarOpen } = useLayout();

  useEffect(() => { setSidebarOpen(false); }, [setSidebarOpen]);

  const [estado, setEstado] = useState('todos');
  const [tipo, setTipo] = useState('');
  const [marca, setMarca] = useState('');
  const [modelo, setModelo] = useState('');
  const [anio, setAnio] = useState('');
  const [chasis, setChasis] = useState('');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [consultado, setConsultado] = useState(false);

  const consultar = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_lista_chasis_prestamos', {
        p_estado: estado,
        p_tipo: tipo || null,
        p_marca: marca || null,
        p_modelo: modelo || null,
        p_anio: anio ? parseInt(anio, 10) : null,
        p_chasis: chasis || null,
      });
      if (error) throw error;
      setRows(Array.isArray(data) ? data : []);
      setConsultado(true);
    } catch (e) {
      toast({ variant: 'destructive', title: 'No se pudo consultar', description: e.message });
      setRows([]);
    }
    setLoading(false);
  }, [estado, tipo, marca, modelo, anio, chasis, toast]);

  // No se consulta al abrir: el reporte arranca VACÍO (la base crecerá mucho).
  // Solo se carga cuando el usuario presiona Consultar (F10), idealmente filtrando.

  const totalBalance = rows.reduce((a, r) => a + (Number(r.balance) || 0), 0);

  const imprimir = () => {
    if (!rows.length) { toast({ variant: 'destructive', title: 'No hay datos para imprimir' }); return; }
    generateListaChasisPDF(rows, { estado }, empresa || {});
  };

  return (
    <div className="p-1.5 bg-slate-100">
      <Helmet><title>Lista de Chasis en Préstamos — Financiera</title></Helmet>
      <div className="bg-white rounded-lg shadow border w-full overflow-hidden">
        <div className="bg-gradient-to-r from-slate-300 to-slate-200 text-slate-800 text-center py-1 font-extrabold tracking-wide text-base">
          LISTA DE CHASIS RELACIONADOS CON PRÉSTAMOS
        </div>

        <div className="p-2 space-y-2">
          {/* Filtros */}
          <div className="border rounded-md p-2 grid grid-cols-2 lg:grid-cols-6 gap-2 items-end">
            <div className="space-y-1">
              <Label className="text-[10px] font-bold text-slate-500 uppercase">Tipo</Label>
              <Input value={tipo} onChange={(e) => setTipo(e.target.value)} className="h-8 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] font-bold text-slate-500 uppercase">Marca</Label>
              <Input value={marca} onChange={(e) => setMarca(e.target.value)} className="h-8 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] font-bold text-slate-500 uppercase">Modelo</Label>
              <Input value={modelo} onChange={(e) => setModelo(e.target.value)} className="h-8 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] font-bold text-slate-500 uppercase">Año</Label>
              <Input type="number" value={anio} onChange={(e) => setAnio(e.target.value)} className="h-8 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] font-bold text-slate-500 uppercase">Chasis</Label>
              <Input value={chasis} onChange={(e) => setChasis(e.target.value)}
                     onKeyDown={(e) => { if (e.key === 'Enter') consultar(); }} className="h-8 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] font-bold text-slate-500 uppercase">Estatus</Label>
              <div className="flex gap-3 h-8 items-center text-xs">
                {[['todos', 'Todos'], ['pendientes', 'Pendientes'], ['pagados', 'Pagados']].map(([v, l]) => (
                  <label key={v} className="flex items-center gap-1 cursor-pointer">
                    <input type="radio" name="estado" checked={estado === v} onChange={() => setEstado(v)} />{l}
                  </label>
                ))}
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" size="sm" onClick={consultar} disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Search className="w-4 h-4 mr-1" />}Consultar (F10)
            </Button>
          </div>

          {/* Tabla */}
          <div className="border rounded-md overflow-hidden">
            <div className="overflow-auto h-[360px]">
              <table className="w-full text-xs">
                <thead className="bg-gray-100 text-gray-700 font-bold border-b sticky top-0">
                  <tr>
                    <th className="text-left px-2 py-1">Préstamo</th>
                    <th className="text-left px-2 py-1">Fecha</th>
                    <th className="text-right px-2 py-1">Balance</th>
                    <th className="text-left px-2 py-1">Cliente</th>
                    <th className="text-left px-2 py-1">Nombre</th>
                    <th className="text-left px-2 py-1">Chasis</th>
                    <th className="text-left px-2 py-1">Tipo</th>
                    <th className="text-left px-2 py-1">Marca</th>
                    <th className="text-left px-2 py-1">Modelo</th>
                    <th className="text-center px-2 py-1">Año</th>
                  </tr>
                </thead>
                <tbody>
                  {loading && <tr><td colSpan={10} className="p-6 text-center text-slate-400"><Loader2 className="w-5 h-5 animate-spin inline" /></td></tr>}
                  {!loading && !consultado && <tr><td colSpan={10} className="p-10 text-center italic text-slate-400">Usa los filtros (Tipo, Marca, Chasis, Estatus…) y presiona <b>Consultar (F10)</b> para ver resultados.</td></tr>}
                  {!loading && consultado && rows.length === 0 && <tr><td colSpan={10} className="p-10 text-center italic text-slate-400">Sin resultados.</td></tr>}
                  {!loading && rows.map((r, i) => (
                    <tr key={`${r.prestamo}-${i}`} className={`border-b last:border-0 ${i % 2 === 1 ? 'bg-[#eef6ff]' : 'bg-white'}`}>
                      <td className="px-2 py-1 font-bold text-blue-900">{r.prestamo}</td>
                      <td className="px-2 py-1">{fdate(r.fecha)}</td>
                      <td className="px-2 py-1 text-right">{fmt(r.balance)}</td>
                      <td className="px-2 py-1">{r.cliente}</td>
                      <td className="px-2 py-1 truncate max-w-[180px]" title={r.nombre}>{r.nombre}</td>
                      <td className="px-2 py-1 font-mono">{r.chasis}</td>
                      <td className="px-2 py-1">{r.tipo}</td>
                      <td className="px-2 py-1">{r.marca}</td>
                      <td className="px-2 py-1">{r.modelo}</td>
                      <td className="px-2 py-1 text-center">{r.anio || ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Totales + acciones */}
          <div className="flex items-center justify-between flex-wrap gap-3 border-t pt-2">
            <div className="text-xs text-slate-600 flex gap-4">
              <span>Préstamos: <b>{rows.length}</b></span>
              <span>Balance total: <b className="text-red-600">{fmt(totalBalance)}</b></span>
            </div>
            <div className="flex gap-2">
              <Button type="button" onClick={imprimir} disabled={!rows.length}><Printer className="w-4 h-4 mr-1" />Imprimir (F5)</Button>
              <Button type="button" variant="secondary" onClick={() => closePanel(activePanel)}><X className="w-4 h-4 mr-1" />Retornar</Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ListaChasisPrestamosPage;
