// Factura con crédito fiscal para un padre (centros educativos, parte 5).
// Se escogen uno o varios recibos YA cobrados de la familia (un pago o el
// año entero) y se emite la factura con NCF B01 a nombre y cédula/RNC de
// quien la pide. Exenta de ITBIS; sin el Sistema Bilingüe (es de la compañía).
// El dinero ya entró por el recibo: la factura no vuelve a entrar en la caja.
// SQL: sql/centros_educativos_factura_fiscal.sql (edu_facturar_pagos)
import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Printer, FileCheck2, Ban } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { numeroRecibo } from '@/lib/printColegio';
import { imprimirFacturaFiscal } from '@/lib/colegioReportes';

const n2 = (v) => Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const campo = 'h-9 w-full rounded-md border border-gray-300 px-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-300';
const fechaDO = (f) => (f ? new Date(`${String(f).slice(0, 10)}T12:00:00`).toLocaleDateString('es-DO') : '');
const viva = (f) => f && String(f.estado || '').toUpperCase() !== 'ANULADA';

export default function FacturaFiscalDialog({ familia, tenantId, esDireccion, onClose, onError, onDone }) {
  const [pagos, setPagos] = useState(null);
  const [sel, setSel] = useState({});
  const [nombre, setNombre] = useState('');
  const [rnc, setRnc] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [recarga, setRecarga] = useState(0);

  useEffect(() => {
    (async () => {
      const [pg, cf] = await Promise.all([
        supabase.from('edu_pagos')
          .select('id, numero, fecha, total, anulado, factura_id, facturas(ncf, estado), edu_pago_lineas(monto, edu_cargos(es_tercero))')
          .eq('familia_id', familia.id).eq('tenant_id', tenantId).eq('anulado', false)
          .order('numero', { ascending: false }).limit(1000),
        familia.cliente_fiscal_id
          ? supabase.from('clientes').select('nombre, rnc').eq('id', familia.cliente_fiscal_id).eq('tenant_id', tenantId).maybeSingle()
          : Promise.resolve({ data: null }),
      ]);
      if (pg.error) { onError('No se pudieron cargar los recibos', pg.error.message); onClose(); return; }
      setPagos((pg.data || []).map((p) => ({
        ...p,
        facturable: (p.edu_pago_lineas || []).filter((l) => !l.edu_cargos?.es_tercero).reduce((s, l) => s + Number(l.monto), 0),
      })));
      // Propone a quien facturó la última vez; si no, el tutor o la madre.
      setNombre(cf.data?.nombre || familia.tutor_nombre || familia.madre_nombre || familia.padre_nombre || '');
      setRnc(cf.data?.rnc || '');
    })();
  }, [recarga]); // eslint-disable-line react-hooks/exhaustive-deps

  const libres = useMemo(() => (pagos || []).filter((p) => !viva(p.facturas) && p.facturable > 0), [pagos]);
  const facturados = useMemo(() => (pagos || []).filter((p) => viva(p.facturas)), [pagos]);
  const elegidos = libres.filter((p) => sel[p.id]);
  const total = elegidos.reduce((s, p) => s + p.facturable, 0);
  const digitos = rnc.replace(/\D/g, '');
  const todos = libres.length > 0 && elegidos.length === libres.length;

  // La dirección anula la factura (cédula equivocada, recibo que hay que anular): sale en el 608.
  const anular = async (p) => {
    const motivo = window.prompt(`Motivo para anular la factura ${p.facturas.ncf}:`, '');
    if (motivo === null) return;
    const { error } = await supabase.rpc('edu_anular_factura_fiscal', { p_factura: p.factura_id, p_motivo: motivo });
    if (error) { onError('No se pudo anular la factura', error.message); return; }
    setSel({}); setRecarga((n) => n + 1);
  };

  const emitir = async () => {
    if (!elegidos.length) return onError('Escoge los recibos', 'Marca los recibos que van en la factura.');
    if (![9, 11].includes(digitos.length)) return onError('Cédula o RNC incompleto', 'La cédula lleva 11 dígitos y el RNC 9.');
    if (!window.confirm(`Emitir factura con crédito fiscal por RD$${n2(total)} a ${nombre} (${rnc})?\n\nUsa un NCF B01 del colegio y no se puede deshacer (solo anular).`)) return undefined;
    setGuardando(true);
    const { data, error } = await supabase.rpc('edu_facturar_pagos', { p_pagos: elegidos.map((p) => p.id), p_nombre: nombre, p_rnc: rnc });
    setGuardando(false);
    if (error) return onError('No se pudo emitir la factura', error.message);
    try { await imprimirFacturaFiscal(data.factura_id, tenantId); } catch (e) { onError('Se emitió, pero no se pudo imprimir', e?.message); }
    return onDone(data);
  };

  return (
    <Dialog open onOpenChange={(v) => !v && !guardando && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Factura con crédito fiscal · Familia {familia.nombre}</DialogTitle></DialogHeader>
        {!pagos ? <div className="py-10 flex justify-center"><Loader2 className="w-7 h-7 animate-spin text-blue-600" /></div> : (
          <div className="space-y-4">
            <p className="text-xs text-gray-500">
              Para el padre que la pide para su declaración de gastos educativos. Sale con NCF B01, exenta de ITBIS, y sin el Sistema Bilingüe
              (ese dinero es de la compañía). No vuelve a entrar en la caja: el dinero ya entró con el recibo.
            </p>

            <div>
              <div className="flex items-center justify-between">
                <div className="text-xs font-bold text-gray-600 uppercase">Recibos sin factura</div>
                {libres.length > 1 && (
                  <label className="text-xs flex items-center gap-1">
                    <input type="checkbox" checked={todos} onChange={(e) => setSel(e.target.checked ? Object.fromEntries(libres.map((p) => [p.id, true])) : {})} />
                    Todos (el año completo)
                  </label>
                )}
              </div>
              {libres.length === 0 ? <div className="text-sm text-gray-400 py-2">No hay recibos pendientes de facturar.</div> : (
                <table className="w-full text-sm mt-1">
                  <tbody>
                    {libres.map((p) => (
                      <tr key={p.id} className="border-b last:border-0">
                        <td className="py-1.5 w-8"><input type="checkbox" checked={!!sel[p.id]} onChange={() => setSel((s) => ({ ...s, [p.id]: !s[p.id] }))} /></td>
                        <td className="font-mono">{numeroRecibo(p.numero)}</td>
                        <td>{fechaDO(p.fecha)}</td>
                        <td className="text-right font-mono">RD${n2(p.facturable)}</td>
                        <td className="text-right text-xs text-gray-400 w-28">{Number(p.total) > p.facturable + 0.01 ? `de ${n2(p.total)}` : ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="text-xs font-bold text-gray-600 uppercase">A nombre de
                <input className={`${campo} mt-1`} value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre completo del padre o la madre" />
              </label>
              <label className="text-xs font-bold text-gray-600 uppercase">Cédula o RNC
                <input className={`${campo} mt-1`} value={rnc} onChange={(e) => setRnc(e.target.value)} placeholder="001-0000000-0" />
              </label>
            </div>

            <div className="flex items-center justify-between border-t pt-3">
              <div className="text-sm">Total de la factura: <b className="text-lg font-mono">RD${n2(total)}</b> <span className="text-xs text-gray-500">(exento de ITBIS)</span></div>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={onClose} disabled={guardando}>Cerrar</Button>
                <Button onClick={emitir} disabled={guardando || !elegidos.length}>
                  {guardando ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <FileCheck2 className="w-4 h-4 mr-1" />} Emitir factura
                </Button>
              </div>
            </div>

            {facturados.length > 0 && (
              <div>
                <div className="text-xs font-bold text-gray-600 uppercase">Ya facturados</div>
                <table className="w-full text-sm mt-1">
                  <tbody>
                    {facturados.map((p) => (
                      <tr key={p.id} className="border-b last:border-0">
                        <td className="py-1.5 font-mono">{numeroRecibo(p.numero)}</td>
                        <td>{fechaDO(p.fecha)}</td>
                        <td className="font-mono text-emerald-700">{p.facturas.ncf}</td>
                        <td className="text-right">
                          <Button size="sm" variant="ghost" title="Reimprimir la factura"
                            onClick={() => imprimirFacturaFiscal(p.factura_id, tenantId).catch((e) => onError('No se pudo imprimir', e?.message))}>
                            <Printer className="w-4 h-4" />
                          </Button>
                          {esDireccion && (
                            <Button size="sm" variant="ghost" title="Anular la factura (solo la dirección)" onClick={() => anular(p)}>
                              <Ban className="w-4 h-4 text-red-600" />
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
