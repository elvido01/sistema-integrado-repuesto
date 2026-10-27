// =====================================================================
// Inmuebles vendidos — traspasos y contratos (Inmobiliaria, 27/10/2026)
// ---------------------------------------------------------------------
// La venta de un solar no lleva ITBIS, pero el comprador tiene que pagar en
// la DGII el impuesto de transferencia inmobiliaria (3% sobre el MAYOR entre
// el valor del acto y la tabla de valores de la DGII) dentro de los 6 meses
// del acto de venta. Aquí se ve cada inmueble vendido, cuánto falta y si el
// traspaso ya se hizo, y se imprime el contrato:
//   · de CONTADO  → contrato de venta definitiva;
//   · a PLAZOS    → contrato de VENTA CONDICIONAL (Ley 596): la propiedad
//                   queda condicionada al pago total; se inscribe en el
//                   registro del título (Ley 108-05).
// El contrato es un BORRADOR: lo revisa y legaliza el notario/abogado.
// Datos: vista inmuebles_vendidos (sql/tipos_empresa_servicios_inmobiliaria.sql)
// =====================================================================
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet';
import { Landmark, Loader2, RefreshCw, FileText, CheckCircle2, AlertTriangle } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';

const money = (v) => `RD$${Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fecha = (f) => (f ? new Date(String(f).length <= 10 ? `${f}T12:00:00` : f).toLocaleDateString('es-DO') : '—');
const diasHasta = (f) => Math.ceil((new Date(`${String(f).slice(0, 10)}T12:00:00`) - new Date()) / 864e5);
const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export default function InmueblesVendidosPage() {
  const { tenantId, empresa } = useAuth();
  const { toast } = useToast();
  const [filas, setFilas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [filtro, setFiltro] = useState('pendientes');

  const cargar = useCallback(async () => {
    if (!tenantId) return;
    setCargando(true);
    const { data, error } = await supabase.from('inmuebles_vendidos').select('*')
      .eq('tenant_id', tenantId).order('fecha', { ascending: false });
    if (error) toast({ variant: 'destructive', title: 'No se pudo cargar', description: error.message });
    setFilas(data || []);
    setCargando(false);
  }, [tenantId, toast]);
  useEffect(() => { cargar(); }, [cargar]);

  const visibles = useMemo(() => (filtro === 'pendientes' ? filas.filter((f) => !f.traspaso_pagado_at) : filas), [filas, filtro]);
  const pendientes = filas.filter((f) => !f.traspaso_pagado_at).length;

  const marcarTraspaso = async (f) => {
    if (!f.producto_id) return;
    const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santo_Domingo' });
    const valor = window.prompt('Fecha en que el comprador pagó el traspaso (AAAA-MM-DD):', hoy);
    if (!valor) return;
    const { data, error } = await supabase.from('productos')
      .update({ datos_inmueble: { ...(f.datos_inmueble || {}), traspaso_pagado_at: valor } })
      .eq('id', f.producto_id).select('id');
    if (error || !data?.length) {
      toast({ variant: 'destructive', title: 'No se guardó', description: error?.message || 'Sin permiso para editar ese inmueble.' });
      return;
    }
    toast({ title: 'Traspaso marcado como hecho' });
    cargar();
  };

  const imprimirContrato = (f) => {
    const aPlazos = String(f.forma_pago || '').toUpperCase() === 'CREDITO';
    const inm = f.datos_inmueble || {};
    const emp = empresa || {};
    const titulo = aPlazos ? 'CONTRATO DE VENTA CONDICIONAL DE INMUEBLE' : 'CONTRATO DE VENTA DE INMUEBLE';
    const clausulas = [
      `PRIMERO: EL VENDEDOR vende, cede y transfiere a favor de EL COMPRADOR, quien acepta, el inmueble descrito a continuación: ${esc(f.descripcion)}${inm.designacion_catastral ? `, designación catastral ${esc(inm.designacion_catastral)}` : ''}${inm.matricula ? `, matrícula/título No. ${esc(inm.matricula)}` : ''}${inm.metros ? `, con una extensión superficial de ${esc(inm.metros)} metros cuadrados` : ''}${inm.ubicacion ? `, ubicado en ${esc(inm.ubicacion)}` : ''}.`,
      `SEGUNDO: El precio convenido es de ${money(f.valor_venta)}${aPlazos ? `, pagadero según el plan de pagos acordado; a la fecha queda pendiente ${money(f.monto_pendiente)}` : ', que EL VENDEDOR declara haber recibido a su entera satisfacción'}.`,
      aPlazos
        ? 'TERCERO: Esta venta es CONDICIONAL conforme a la Ley No. 596 sobre Ventas Condicionales de Inmuebles: el derecho de propiedad queda condicionado al pago total del precio. Mientras no se complete el pago, EL VENDEDOR conserva la propiedad y la condición se inscribirá en el registro complementario del Certificado de Título (Ley 108-05 de Registro Inmobiliario). La falta de pago en los términos acordados faculta a EL VENDEDOR a ejercer los derechos que la ley le otorga.'
        : 'TERCERO: EL VENDEDOR garantiza que el inmueble se encuentra libre de cargas, gravámenes y oposiciones, y se obliga a entregar la documentación necesaria para su traspaso.',
      'CUARTO: El impuesto de transferencia inmobiliaria (3% sobre el mayor entre el valor de este acto y el valor de tasación de la DGII) y los gastos de traspaso corren por cuenta de EL COMPRADOR, quien deberá pagarlos dentro de los seis (6) meses a partir de la fecha de este acto.',
      'QUINTO: Para lo no previsto en el presente contrato, las partes se remiten al derecho común. Las partes eligen domicilio en sus respectivas direcciones.',
    ];
    const w = window.open('', '_blank', 'width=816,height=1056');
    w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${titulo}</title><style>
      @page { size: letter; margin: 20mm; }
      body { font-family: 'Times New Roman', serif; font-size: 13.5px; line-height: 1.6; color: #000; }
      h1 { text-align: center; font-size: 17px; text-decoration: underline; margin: 0 0 4px; }
      .borrador { text-align: center; font-size: 11px; color: #a00; margin-bottom: 14px; }
      p { text-align: justify; margin: 8px 0; }
      .firmas { display: flex; justify-content: space-between; margin-top: 60px; }
      .firma { width: 42%; text-align: center; border-top: 1px solid #000; padding-top: 4px; font-weight: bold; }
      .notario { margin-top: 50px; text-align: center; }
    </style></head><body onload="window.print()">
      <h1>${titulo}</h1>
      <div class="borrador">BORRADOR generado por el sistema — debe ser revisado y legalizado por un notario/abogado.</div>
      <p>Entre <b>${esc(emp.razon_social || emp.nombre || '')}</b>${emp.rnc ? `, RNC ${esc(emp.rnc)}` : ''}, con domicilio en ${esc(emp.direccion1 || emp.direccion2 || '______________')}, quien en lo adelante se denominará <b>EL VENDEDOR</b>; y <b>${esc(f.comprador || '______________')}</b>, portador(a) de la cédula/RNC ${esc(f.comprador_documento || '______________')}, quien en lo adelante se denominará <b>EL COMPRADOR</b>, se ha convenido y pactado lo siguiente:</p>
      ${clausulas.map((c) => `<p>${c}</p>`).join('')}
      <p>Hecho y firmado en dos (2) originales, el día ${fecha(f.fecha)}. Factura No. FT-${String(f.numero || '').padStart(7, '0')}.</p>
      <div class="firmas"><div class="firma">EL VENDEDOR</div><div class="firma">EL COMPRADOR</div></div>
      <div class="notario">______________________________<br>Notario Público</div>
    </body></html>`);
    w.document.close();
  };

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      <Helmet><title>Inmuebles Vendidos — MotoFlow</title></Helmet>
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="bg-blue-100 p-2.5 rounded-xl"><Landmark className="w-6 h-6 text-blue-700" /></div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Inmuebles Vendidos</h1>
            <p className="text-sm text-gray-500">Traspasos (3% de transferencia, 6 meses) y contratos de venta</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant={filtro === 'pendientes' ? 'default' : 'outline'} size="sm" onClick={() => setFiltro('pendientes')}>Traspaso pendiente ({pendientes})</Button>
          <Button variant={filtro === 'todos' ? 'default' : 'outline'} size="sm" onClick={() => setFiltro('todos')}>Todos ({filas.length})</Button>
          <Button variant="outline" size="sm" onClick={cargar}><RefreshCw className="w-4 h-4" /></Button>
        </div>
      </div>

      {cargando ? (
        <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div>
      ) : visibles.length === 0 ? (
        <div className="text-center py-16 bg-gray-50 rounded-2xl border border-dashed text-gray-500">
          {filtro === 'pendientes' ? 'No hay traspasos pendientes.' : 'Aún no se ha vendido ningún inmueble.'}
          <div className="text-xs mt-2">Los inmuebles se venden desde Ventas como cualquier producto (marcado "Inmueble" en su ficha).</div>
        </div>
      ) : (
        <div className="space-y-3">
          {visibles.map((f) => {
            const dias = diasHasta(f.traspaso_vence);
            const hecho = !!f.traspaso_pagado_at;
            const aPlazos = String(f.forma_pago || '').toUpperCase() === 'CREDITO';
            return (
              <div key={f.detalle_id} className="bg-white border rounded-xl p-4 shadow-sm flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-bold text-gray-900">{f.descripcion} <span className="text-xs font-mono text-gray-400">{f.codigo}</span></div>
                  <div className="text-sm text-gray-600">
                    {f.comprador || 'Sin comprador'} · FT-{String(f.numero || '').padStart(7, '0')} · {fecha(f.fecha)} · {money(f.valor_venta)}
                    {aPlazos && <span className="ml-1 text-amber-700"> · a plazos, pendiente {money(f.monto_pendiente)}</span>}
                  </div>
                  <div className="text-xs mt-1">
                    3% de transferencia estimado: <b>{money(f.impuesto_transferencia_estimado)}</b>
                    <span className="text-gray-400"> (sobre el valor de venta; la DGII cobra sobre el mayor entre este y su tabla)</span>
                  </div>
                  <div className="text-xs mt-1">
                    {hecho ? (
                      <span className="text-emerald-700 font-semibold inline-flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> Traspaso hecho el {fecha(f.traspaso_pagado_at)}</span>
                    ) : (
                      <span className={`font-semibold inline-flex items-center gap-1 ${dias < 0 ? 'text-red-600' : dias <= 30 ? 'text-amber-700' : 'text-gray-600'}`}>
                        {dias <= 30 && <AlertTriangle className="w-3.5 h-3.5" />}
                        {dias < 0 ? `Plazo del traspaso VENCIDO hace ${-dias} días` : `Traspaso vence el ${fecha(f.traspaso_vence)} (faltan ${dias} días)`}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button size="sm" variant="outline" onClick={() => imprimirContrato(f)}>
                    <FileText className="w-4 h-4 mr-1" />{aPlazos ? 'Contrato condicional' : 'Contrato de venta'}
                  </Button>
                  {!hecho && <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => marcarTraspaso(f)}>Traspaso hecho</Button>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
