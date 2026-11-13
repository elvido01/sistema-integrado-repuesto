// ============================================================
// Hoja del IT-1 — ayudante contable, Fase 3 (13/11/2026)
// ------------------------------------------------------------
// Los números del mes casilla por casilla (Anexo A e IT-1) para copiarlos
// o compararlos en la Oficina Virtual, más el ISR retenido del IR-17.
// Todo sale de la RPC contab_hoja_it1 (sql/ayudante_contable_fase3.sql);
// las casillas siguen el "Instructivo Llenado del Formulario IT-1" de la DGII.
// Es una hoja de trabajo: no envía nada a la DGII.
// ============================================================
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Loader2, Info, Save } from 'lucide-react';

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const fmt = (v) => new Intl.NumberFormat('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(v) || 0);

const Fila = ({ cas, nombre, valor, cantidad, fuerte, nota }) => (
  <tr className={`border-t ${fuerte ? 'bg-slate-50 font-bold' : ''}`}>
    <td className="py-1.5 pr-2 w-10 text-xs font-mono text-slate-500 align-top">{cas}</td>
    <td className="py-1.5 pr-2">
      {nombre}
      {nota && <div className="text-[11px] font-normal text-slate-500">{nota}</div>}
    </td>
    {cantidad !== undefined && <td className="py-1.5 pr-3 text-right text-slate-600 w-16">{cantidad}</td>}
    <td className="py-1.5 text-right tabular-nums w-36">{fmt(valor)}</td>
  </tr>
);

const Titulo = ({ children }) => (
  <tr><td colSpan={4} className="pt-3 pb-1 text-[11px] font-black uppercase tracking-wide text-slate-500">{children}</td></tr>
);

const HojaIT1 = ({ periodo, onSaldoGuardado }) => {
  const { toast } = useToast();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [guardando, setGuardando] = useState(false);

  const pedido = useRef(0); // descarta la respuesta de un mes que ya no se mira

  const cargar = useCallback(async () => {
    const n = ++pedido.current;
    setLoading(true);
    const { data: r, error } = await supabase.rpc('contab_hoja_it1', { p_anio: periodo.anio, p_mes: periodo.mes });
    if (n !== pedido.current) return;
    if (error) {
      toast({ variant: 'destructive', title: 'No se pudo cargar la hoja', description: error.message });
      setData(null);
    } else setData(r);
    setLoading(false);
  }, [periodo, toast]);

  useEffect(() => { cargar(); }, [cargar]);

  if (loading) return <div className="bg-white rounded-lg border p-10 text-center"><Loader2 className="w-6 h-6 animate-spin inline text-slate-400" /></div>;
  if (!data) return null;

  const a = data.anexo;
  const t = data.it1;
  const sig = periodo.mes === 12 ? { anio: periodo.anio + 1, mes: 1 } : { anio: periodo.anio, mes: periodo.mes + 1 };

  // El "nuevo saldo a favor" de este mes es el "saldo a favor anterior" del siguiente.
  const guardarSaldoSiguiente = async () => {
    setGuardando(true);
    const { error } = await supabase.rpc('contab_guardar_saldo', { p_anio: sig.anio, p_mes: sig.mes, p_monto: Number(t.c34) || 0 });
    setGuardando(false);
    if (error) { toast({ variant: 'destructive', title: 'No se pudo guardar', description: error.message }); return; }
    toast({ title: 'Saldo a favor guardado', description: `${MESES[sig.mes - 1]} ${sig.anio} arranca con RD$ ${fmt(t.c34)} a favor.` });
    onSaldoGuardado?.();
  };

  const tiposNcf = (a.ncf || []).filter((n) => n.cantidad > 0 || [1, 2].includes(n.cas));

  return (
    <div className="space-y-3">
      <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900 flex gap-2">
        <Info className="w-4 h-4 shrink-0 mt-0.5" />
        <div>
          Hoja de trabajo de <b>{MESES[periodo.mes - 1]} {periodo.anio}</b> con las casillas del formulario oficial.
          La Oficina Virtual llena sola varias con su 606 y su 607: si un número no coincide con esta hoja, no envíe todavía y revise qué factura falta o sobra.
          {!data.cerrado && <b> El mes no ha terminado: los números van a cambiar.</b>}
        </div>
      </div>

      {/* Anexo A */}
      <div className="bg-white rounded-lg border shadow-sm p-4">
        <div className="text-sm font-extrabold text-slate-800">Anexo A <span className="font-normal text-slate-500">· se llena y se envía primero</span></div>
        <table className="w-full text-sm">
          <tbody>
            <Titulo>II. Ventas por tipo de comprobante (sin impuestos)</Titulo>
            {tiposNcf.map((n) => <Fila key={n.cas} cas={n.cas} nombre={n.nombre} cantidad={n.cantidad} valor={n.monto} />)}
            <Fila cas="11" nombre="Total de operaciones" cantidad="" valor={a.c11} fuerte />

            <Titulo>III. Ventas por forma de pago (con impuestos)</Titulo>
            <Fila cas="12" nombre="Efectivo" cantidad="" valor={a.pago.c12} />
            <Fila cas="13" nombre="Cheque / transferencia" cantidad="" valor={a.pago.c13} />
            <Fila cas="14" nombre="Tarjeta débito / crédito" cantidad="" valor={a.pago.c14} />
            <Fila cas="15" nombre="A crédito" cantidad="" valor={a.pago.c15} />
            {Number(a.pago.c18) > 0 && <Fila cas="18" nombre="Otras formas de venta" cantidad="" valor={a.pago.c18} />}
            <Fila cas="19" nombre="Total por tipo de venta" cantidad="" valor={a.c19} fuerte />

            <Titulo>IV. Ventas por tipo de ingreso (sin impuestos)</Titulo>
            <Fila cas="20" nombre="Ingresos por operaciones (no financieros)" cantidad="" valor={a.c20} />
            <Fila cas="26" nombre="Total por tipo de ingreso" cantidad="" valor={a.c26} fuerte />

            {Number(a.retenciones_que_le_hicieron) > 0 && (
              <>
                <Titulo>V. Retenciones que le hicieron sus clientes</Titulo>
                <Fila cas="27-31" nombre="ITBIS que le retuvieron" cantidad="" valor={a.retenciones_que_le_hicieron}
                  nota="Repártalo según quién retuvo: tarjetas (27), una sociedad por servicios (29), el Estado (31)." />
              </>
            )}

            <Titulo>IX. ITBIS pagado deducible (viene del 606)</Titulo>
            <Fila cas="50" nombre="En compras locales de bienes" cantidad="" valor={a.c50} />
            <Fila cas="51" nombre="En servicios" cantidad="" valor={a.c51} />
            <Fila cas="56" nombre="Total ITBIS deducible" cantidad="" valor={a.c56.total} fuerte
              nota="No puede pasar del «ITBIS por adelantar» de su 606: si pasa, la Oficina Virtual no deja enviar." />
          </tbody>
        </table>
      </div>

      {/* IT-1 */}
      <div className="bg-white rounded-lg border shadow-sm p-4">
        <div className="text-sm font-extrabold text-slate-800">Formulario IT-1</div>
        <table className="w-full text-sm">
          <tbody>
            <Titulo>II. Ingresos por operaciones</Titulo>
            <Fila cas="1" nombre="Total de operaciones del período" valor={t.c1} nota="Viene de la casilla 11 del Anexo A." />
            <Fila cas="4" nombre="Ventas locales de bienes o servicios exentos" valor={t.c4} />
            <Fila cas="9" nombre="Total de operaciones no gravadas" valor={t.c9} />
            <Fila cas="10" nombre="Total de operaciones gravadas" valor={t.c10} fuerte />
            <Fila cas="11" nombre="Operaciones gravadas al 18 %" valor={t.c11} />
            {Number(t.c12) > 0 && <Fila cas="12" nombre="Operaciones gravadas al 16 %" valor={t.c12} />}

            <Titulo>III. Liquidación</Titulo>
            <Fila cas="16" nombre="ITBIS cobrado (18 % de la casilla 11)" valor={t.c16} />
            {Number(t.c17) > 0 && <Fila cas="17" nombre="ITBIS cobrado (16 % de la casilla 12)" valor={t.c17} />}
            <Fila cas="21" nombre="Total ITBIS cobrado" valor={t.c21} fuerte />
            <Fila cas="22" nombre="ITBIS pagado en compras locales" valor={t.c22} />
            <Fila cas="23" nombre="ITBIS pagado por servicios deducibles" valor={t.c23} />
            <Fila cas="24" nombre="ITBIS pagado en importaciones" valor={t.c24} nota="MotoFlow no lo tiene: si importó, póngalo usted." />
            <Fila cas="25" nombre="Total ITBIS deducible" valor={t.c25} fuerte />
            <Fila cas="26" nombre="Impuesto a pagar" valor={t.c26} />
            <Fila cas="27" nombre="Saldo a favor" valor={t.c27} />
            <Fila cas="29" nombre="Saldo a favor anterior" valor={t.c29} nota="El que guardó en el Resumen. La DGII lo valida contra su cuenta corriente." />
            <Fila cas="30" nombre="Pagos computables por retenciones" valor={t.c30} />
            <Fila cas="33" nombre="Diferencia a pagar" valor={t.c33} fuerte />
            <Fila cas="34" nombre="Nuevo saldo a favor" valor={t.c34} fuerte />

            {Number(t.c60) > 0 && (
              <>
                <Titulo>A. ITBIS que usted retuvo a suplidores</Titulo>
                <Fila cas="60" nombre="Impuesto a pagar por retenciones" valor={t.c60}
                  nota={`Debe cuadrar con el ITBIS retenido de su 606. A personas físicas: RD$ ${fmt(t.retenido_personas_fisicas)} · a sociedades: RD$ ${fmt(t.retenido_sociedades)}.`} />
              </>
            )}
            <Titulo>Total</Titulo>
            <Fila cas="68" nombre="Total general a pagar" valor={t.c68} fuerte nota="Sin recargos ni intereses: es lo que paga si declara a tiempo." />
          </tbody>
        </table>
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          <span className="mr-auto">
            Cuando haya declarado, guarde el nuevo saldo a favor (casilla 34) como punto de partida de {MESES[sig.mes - 1]} {sig.anio}.
            Si la Oficina Virtual le dio otro número, escríbalo en el Resumen de ese mes.
          </span>
          <Button size="sm" variant="outline" className="h-8" disabled={guardando} onClick={guardarSaldoSiguiente}>
            <Save className="w-3.5 h-3.5 mr-1" />Guardar RD$ {fmt(t.c34)} para {MESES[sig.mes - 1]}
          </Button>
        </div>
      </div>

      {/* IR-17 */}
      {data.ir17?.filas?.length > 0 && (
        <div className="bg-white rounded-lg border shadow-sm p-4">
          <div className="text-sm font-extrabold text-slate-800">IR-17 · ISR que le retuvo a suplidores</div>
          <div className="text-xs text-slate-500 mb-2">Se declara aparte, a más tardar el día 10. Primero el Anexo R9C y después el IR-17.</div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500">
                <th className="py-1">Suplidor</th><th>RNC / cédula</th><th>NCF</th>
                <th className="text-right">Monto</th><th className="text-right">%</th><th className="text-right">ISR retenido</th>
              </tr>
            </thead>
            <tbody>
              {data.ir17.filas.map((f) => (
                <tr key={`${f.rnc}-${f.ncf}`} className="border-t">
                  <td className="py-1.5">{f.suplidor || '—'}</td><td>{f.rnc}</td><td>{f.ncf}</td>
                  <td className="text-right tabular-nums">{fmt(f.base)}</td>
                  <td className="text-right">{Number(f.pct)}</td>
                  <td className="text-right tabular-nums font-semibold">{fmt(f.monto)}</td>
                </tr>
              ))}
              <tr className="border-t bg-slate-50 font-bold">
                <td className="py-1.5" colSpan={5}>Total a pagar en el IR-17</td>
                <td className="text-right tabular-nums">{fmt(data.ir17.total_isr)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Lo que la hoja no cubre */}
      {data.avisos?.length > 0 && (
        <div className="bg-white rounded-lg border shadow-sm p-4">
          <div className="text-sm font-extrabold text-slate-800 mb-1">Antes de enviar, tenga en cuenta</div>
          <ul className="list-disc pl-5 space-y-1 text-sm text-slate-700">
            {data.avisos.map((x) => <li key={x}>{x}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
};

export default HojaIT1;
