// ============================================================
// DgiiSecuenciasEcf — cada empresa carga sus rangos e-NCF
// ============================================================
// (13/10/2026) Al terminar la certificación, la empresa pide sus secuencias
// en la Oficina Virtual de la DGII. Antes se cargaban a mano en la base;
// ahora el administrador las pone aquí (sql/ecf_secuencias_por_empresa.sql).
// Un rango nuevo para un tipo que ya existe no hace retroceder el contador:
// nunca se repite un e-NCF.
//
// (31/10/2026) Cada autorización de la DGII trae SU vencimiento, y el
// sistema guarda uno solo. Por eso un rango nuevo NO se junta con el viejo:
// tiene que empezar después del último autorizado (o ser una corrección del
// cargado: mismo «Desde»), y si al viejo le quedan números o hay un salto se
// pide confirmación. Reglas en src/lib/ecfSecuencias.js.
// ============================================================
import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Hash, Loader2, Plus } from 'lucide-react';
import { encf, leerSecuencia, validarRango, sugerirDesde } from '@/lib/ecfSecuencias';

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

export default function DgiiSecuenciasEcf() {
  const { toast } = useToast();
  const [filas, setFilas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [errorLectura, setErrorLectura] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [tipo, setTipo] = useState('32');
  const [desde, setDesde] = useState('1');
  const [hasta, setHasta] = useState('');
  // «Desde» lo sugiere el sistema hasta que la persona lo toca; después no se
  // le cambia por debajo (ni al cargar la tabla ni al cambiar el tipo).
  const [desdeTocado, setDesdeTocado] = useState(false);

  const filaDe = useCallback((t) => filas.find((x) => String(x.tipo_ecf) === String(t)) || null, [filas]);

  const cargar = useCallback(async () => {
    setCargando(true);
    const { data, error } = await supabase.rpc('ecf_secuencias_mias');
    setErrorLectura(error ? error.message : null);
    if (!error) setFilas(data || []);
    setCargando(false);
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  useEffect(() => {
    if (!desdeTocado) setDesde(sugerirDesde(filaDe(tipo)));
  }, [tipo, desdeTocado, filaDe]);

  // Al cambiar de tipo, «Desde» se vuelve a sugerir, salvo que lo que haya
  // sea un e-NCF pegado de ESE tipo (se respeta lo que pegó la persona).
  const cambiarTipo = (t) => {
    setTipo(t);
    // Solo se re-sugiere si lo que hay es la sugerencia del tipo anterior:
    // lo que la persona escribió o pegó no se toca.
    if (!desdeTocado || desde === sugerirDesde(filaDe(tipo))) setDesdeTocado(false);
  };

  const actual = filaDe(tipo);
  const quedanActual = actual ? Number(actual.quedan) : 0;
  const rango = hasta ? validarRango(tipo, desde, hasta, actual) : null;

  const guardar = async () => {
    if (guardando) return;
    setGuardando(true);
    try {
      await guardarRango();
    } finally {
      setGuardando(false);
    }
  };

  const guardarRango = async () => {
    // Se relee antes de decidir: el POS sigue gastando números mientras esta
    // pantalla está abierta.
    const { data: frescas, error: errFresco } = await supabase.rpc('ecf_secuencias_mias');
    if (errFresco) {
      toast({ variant: 'destructive', title: 'No se guardó', description: 'No se pudieron leer las secuencias actuales. Reintenta.' });
      return;
    }
    setFilas(frescas || []);
    const viva = (frescas || []).find((x) => String(x.tipo_ecf) === String(tipo)) || null;
    const r = validarRango(tipo, desde, hasta, viva);
    if (r.error) {
      toast({ variant: 'destructive', title: 'Revisa el rango', description: r.error });
      return;
    }
    const { d, h, caso } = r;
    const quedan = viva ? Number(viva.quedan) : 0;
    const avisos = [];
    if (caso === 'correccion') {
      avisos.push(`Vas a CORREGIR el rango cargado de E${tipo}: queda ${encf(tipo, d)} a ${encf(tipo, h)}. Hazlo solo si el anterior se tecleó mal.

Si es una autorización NUEVA de la DGII, no la cargues así: pon «Desde» en ${encf(tipo, Number(viva.hasta) + 1)}.`);
    } else if (quedan > 0) {
      avisos.push(`A E${tipo} todavía le quedan ${quedan.toLocaleString('es-DO')} números (${encf(tipo, Number(viva.ultimo) + 1)} a ${encf(tipo, viva.hasta)}). Si cargas el rango nuevo ahora, esos ya NO se usarán nunca. Lo mejor es esperar a que se acaben.`);
    }
    if (caso === 'salto') {
      avisos.push(`El rango nuevo no sigue al anterior: salta de ${encf(tipo, viva.hasta)} a ${encf(tipo, d)}. Confirma que la DGII te autorizó desde ${encf(tipo, d)}.`);
    }
    if (avisos.length && !window.confirm(`${avisos.join('\n\n')}\n\n¿Guardar de todos modos?`)) return;
    const { error } = await supabase.rpc('ecf_cargar_secuencia', { p_tipo: tipo, p_desde: d, p_hasta: h });
    if (error) {
      toast({ variant: 'destructive', title: 'No se guardó', description: error.message });
      return;
    }
    toast({
      title: 'Secuencia guardada',
      description: `E${tipo}: ${encf(tipo, d)} a ${encf(tipo, h)}.`,
    });
    setHasta('');
    setDesdeTocado(false);
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
          Puedes escribir el número (600) o pegar el e-NCF completo (E320000000600).
          Si un rango se tecleó mal, se corrige dejando el mismo «Desde» y poniendo el «Hasta» bueno.
          La <b>fecha de vencimiento</b> va arriba, en «Vencimiento secuencia e-CF» (la exigen los E31).</p>
        <p>Si te autorizan más números de un tipo que ya tienes, cárgalos <b>cuando se acaben los actuales</b>: el rango nuevo reemplaza al anterior y los números que le quedaban ya no se usan (cada autorización vence por su lado). Nunca se repite un número.</p>
      </div>

      {cargando ? (
        <p className="text-[11px] text-gray-500 flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Cargando…</p>
      ) : errorLectura ? (
        <p className="text-[12px] text-gray-600 bg-gray-50 border rounded p-2">
          No se pudieron leer las secuencias cargadas.{' '}
          <button type="button" onClick={cargar} className="underline font-bold">Reintentar</button>
          {' '}— si sigue igual, avisa al soporte de MotoFlow.
        </p>
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
          <select value={tipo} onChange={(e) => cambiarTipo(e.target.value)} disabled={guardando}
            className="w-full h-10 rounded-md border border-input bg-white px-2 text-sm">
            {TIPOS.map((t) => <option key={t.v} value={t.v}>{t.t}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <Label className="text-[10px] font-bold text-gray-600 uppercase">Desde (número)</Label>
          <Input inputMode="numeric" value={desde} onChange={(e) => { setDesdeTocado(true); setDesde(e.target.value.slice(0, 20)); }}
            placeholder="primer nº" autoComplete="off" disabled={guardando} />
        </div>
        <div className="space-y-1">
          <Label className="text-[10px] font-bold text-gray-600 uppercase">Hasta (número)</Label>
          <Input inputMode="numeric" value={hasta} onChange={(e) => setHasta(e.target.value.slice(0, 20))}
            placeholder="último nº" autoComplete="off" disabled={guardando} />
        </div>
        <Button onClick={guardar} disabled={guardando || cargando || !!errorLectura || !rango || !!rango.error} className="h-10">
          {guardando ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />} Guardar rango
        </Button>
      </div>
      {rango?.error && <p className="text-[11px] text-red-600">{rango.error}</p>}
      {rango && !rango.error && (
        <p className="text-[11px] text-gray-600">
          Se cargará <b className="font-mono">{encf(tipo, rango.d)}</b> a <b className="font-mono">{encf(tipo, rango.h)}</b> ({(rango.h - rango.d + 1).toLocaleString('es-DO')} números).
        </p>
      )}
      {!cargando && actual && quedanActual > 0 && rango?.caso !== 'correccion' && (
        <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded p-2">
          A E{tipo} todavía le quedan <b>{quedanActual.toLocaleString('es-DO')}</b> números
          ({encf(tipo, Number(actual.ultimo) + 1)} a {encf(tipo, actual.hasta)}). Si cargas un rango nuevo ahora, esos ya no se usarán.
          Lo mejor es cargarlo cuando se acaben.
        </p>
      )}
    </div>
  );
}
