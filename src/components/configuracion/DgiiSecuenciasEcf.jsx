// ============================================================
// DgiiSecuenciasEcf — cada empresa carga sus rangos e-NCF
// ============================================================
// (13/10/2026) Al terminar la certificación, la empresa pide sus secuencias
// en la Oficina Virtual de la DGII. Antes se cargaban a mano en la base;
// ahora el administrador las pone aquí (sql/ecf_secuencias_por_empresa.sql).
// Un rango nuevo para un tipo que ya existe no hace retroceder el contador:
// nunca se repite un e-NCF.
// ============================================================
import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Hash, Loader2, Plus } from 'lucide-react';

const TIPOS = [
  { v: '31', t: 'E31 · Crédito fiscal' },
  { v: '32', t: 'E32 · Consumo' },
  { v: '33', t: 'E33 · Nota de débito' },
  { v: '34', t: 'E34 · Nota de crédito (devoluciones)' },
  { v: '41', t: 'E41 · Compras' },
  { v: '43', t: 'E43 · Gastos menores' },
  { v: '44', t: 'E44 · Regímenes especiales' },
  { v: '45', t: 'E45 · Gubernamental' },
  { v: '46', t: 'E46 · Exportaciones' },
  { v: '47', t: 'E47 · Pagos al exterior' },
];

const encf = (tipo, n) => `E${tipo}${String(n).padStart(10, '0')}`;

export default function DgiiSecuenciasEcf() {
  const { toast } = useToast();
  const [filas, setFilas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [errorLectura, setErrorLectura] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [tipo, setTipo] = useState('32');
  const [desde, setDesde] = useState('1');
  const [hasta, setHasta] = useState('');

  const cargar = useCallback(async () => {
    setCargando(true);
    const { data, error } = await supabase.rpc('ecf_secuencias_mias');
    setErrorLectura(error ? error.message : null);
    if (!error) setFilas(data || []);
    setCargando(false);
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  const guardar = async () => {
    const d = Number(desde), h = Number(hasta);
    if (!Number.isInteger(d) || !Number.isInteger(h) || d < 1 || h < d) {
      toast({ variant: 'destructive', title: 'Revisa el rango', description: '"Desde" tiene que ser 1 o más y "Hasta" igual o mayor.' });
      return;
    }
    setGuardando(true);
    const { error } = await supabase.rpc('ecf_cargar_secuencia', { p_tipo: tipo, p_desde: d, p_hasta: h });
    setGuardando(false);
    if (error) {
      toast({ variant: 'destructive', title: 'No se guardó', description: error.message });
      return;
    }
    toast({ title: 'Secuencia guardada', description: `E${tipo}: ${encf(tipo, d)} a ${encf(tipo, h)}` });
    setHasta('');
    cargar();
  };

  return (
    <div className="border-t pt-4 space-y-3">
      <Label className="text-[11px] font-bold text-gray-700 uppercase flex items-center gap-1">
        <Hash className="w-3.5 h-3.5" /> Secuencias e-NCF autorizadas (producción)
      </Label>
      <div className="rounded-md bg-sky-50 border border-sky-200 p-3 text-[12px] text-sky-950 space-y-1">
        <p>Después de certificarte, pide tus secuencias en la <b>Oficina Virtual de la DGII</b> (menú de Facturación Electrónica, solicitud de secuencias e-NCF).</p>
        <p>Cuando te las aprueben, pon aquí cada rango tal como te lo dio la DGII: el tipo, el primer número y el último.
          La <b>fecha de vencimiento</b> va arriba, en «Vencimiento secuencia e-CF» (la exigen los E31).</p>
        <p>Si te autorizan más números de un tipo que ya tienes, cárgalo igual: el sistema sigue donde iba y nunca repite un número.</p>
      </div>

      {cargando ? (
        <p className="text-[11px] text-gray-500 flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Cargando…</p>
      ) : errorLectura ? (
        <p className="text-[12px] text-gray-600 bg-gray-50 border rounded p-2">Esta sección todavía no está disponible. Avisa al soporte de MotoFlow.</p>
      ) : filas.length === 0 ? (
        <p className="text-[12px] text-amber-800 bg-amber-50 border border-amber-200 rounded p-2">
          Todavía no hay secuencias cargadas: no se pueden emitir facturas electrónicas en producción hasta que pongas al menos E31 y E32.
        </p>
      ) : (
        <div className="overflow-x-auto border rounded">
          <table className="w-full text-[11px]">
            <thead className="bg-gray-50 text-left text-gray-500">
              <tr>
                <th className="px-2 py-1">Tipo</th>
                <th className="px-2 py-1">Desde</th>
                <th className="px-2 py-1">Hasta</th>
                <th className="px-2 py-1">Próximo</th>
                <th className="px-2 py-1 text-right">Quedan</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => {
                const total = Number(f.hasta) - Number(f.desde) + 1;
                const poco = Number(f.quedan) <= Math.max(5, Math.ceil(total * 0.1));
                return (
                  <tr key={f.tipo_ecf} className="border-t">
                    <td className="px-2 py-1 font-bold">E{f.tipo_ecf}</td>
                    <td className="px-2 py-1 font-mono">{encf(f.tipo_ecf, f.desde)}</td>
                    <td className="px-2 py-1 font-mono">{encf(f.tipo_ecf, f.hasta)}</td>
                    <td className="px-2 py-1 font-mono">{Number(f.quedan) > 0 ? encf(f.tipo_ecf, Number(f.ultimo) + 1) : '—'}</td>
                    <td className={`px-2 py-1 text-right font-bold ${poco ? 'text-red-600' : 'text-emerald-700'}`}>
                      {Number(f.quedan).toLocaleString('es-DO')}{poco ? ' · pide más' : ''}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-2 items-end">
        <div className="space-y-1">
          <Label className="text-[10px] font-bold text-gray-600 uppercase">Tipo</Label>
          <select value={tipo} onChange={(e) => setTipo(e.target.value)} disabled={guardando}
            className="w-full h-10 rounded-md border border-input bg-white px-2 text-sm">
            {TIPOS.map((t) => <option key={t.v} value={t.v}>{t.t}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <Label className="text-[10px] font-bold text-gray-600 uppercase">Desde (número)</Label>
          <Input inputMode="numeric" value={desde} onChange={(e) => setDesde(e.target.value.replace(/\D/g, ''))} placeholder="1" disabled={guardando} />
        </div>
        <div className="space-y-1">
          <Label className="text-[10px] font-bold text-gray-600 uppercase">Hasta (número)</Label>
          <Input inputMode="numeric" value={hasta} onChange={(e) => setHasta(e.target.value.replace(/\D/g, ''))} placeholder="500" disabled={guardando} />
        </div>
        <Button onClick={guardar} disabled={guardando || !hasta} className="h-10">
          {guardando ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />} Guardar rango
        </Button>
      </div>
      {desde && hasta && Number(hasta) >= Number(desde) && (
        <p className="text-[11px] text-gray-600">
          Se cargará <b className="font-mono">{encf(tipo, desde)}</b> a <b className="font-mono">{encf(tipo, hasta)}</b> ({(Number(hasta) - Number(desde) + 1).toLocaleString('es-DO')} números).
        </p>
      )}
    </div>
  );
}
