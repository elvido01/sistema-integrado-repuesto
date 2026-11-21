import React from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import { Search, Pencil } from 'lucide-react';

// Tipos de retención de ISR del 606 (instructivo oficial de la DGII, col. 17).
const TIPOS_RETENCION_ISR = [
  [1, 'Alquileres'],
  [2, 'Honorarios por servicios'],
  [3, 'Otras rentas'],
  [4, 'Otras rentas (rentas presuntas)'],
  [5, 'Intereses a personas jurídicas residentes'],
  [6, 'Intereses a personas físicas residentes'],
  [7, 'Retención por proveedores del Estado'],
  [8, 'Juegos telefónicos'],
  [9, 'Subsector ganadería de carne bovina'],
];
// Solo notas de DÉBITO: las de crédito (B04/E34) no se graban en Compras (subirían
// el inventario y la deuda); ComprasPage lo explica al guardar.
const esNotaCreditoDebito = (ncf) => /^(B03|E33)/i.test(String(ncf || '').trim());

// (21/11/2026) Encabezado compacto en dos cajas, como antes: Detalles de la
// compra a la izquierda y Datos del suplidor a la derecha, pero de dos filas
// cada una (antes unos 220 px de alto). El título va sobre el borde para no
// gastar alto. Lo que del suplidor solo se lee va como texto. Mismos ids.
const Campo = ({ label, htmlFor, className = '', children }) => (
  <div className={`min-w-0 ${className}`}>
    <Label htmlFor={htmlFor} className="block text-[10px] font-bold uppercase tracking-wide text-gray-500 mb-0.5 truncate">{label}</Label>
    {children}
  </div>
);

const Caja = ({ titulo, className = '', children }) => (
  <fieldset className={`relative min-w-0 border rounded-lg bg-white px-3 pt-0.5 pb-2 ${className}`}>
    <legend className="px-1.5 -ml-1 text-[10px] font-black uppercase tracking-wider text-blue-700">{titulo}</legend>
    {children}
  </fieldset>
);

const CompraHeader = ({ compra, setCompra, proveedores, almacenes, onOpenSuplidorSearch, onEditSuplidor }) => {
  const selectedProveedor = proveedores.find(p => p.id === compra.suplidor_id);
  const conRetencionIsr = Number(compra.isr_retenido_pct) > 0;
  const telefonos = [selectedProveedor?.telefono, selectedProveedor?.celular].filter(Boolean).join(' · ');
  const selectorRetencion = (placeholder) => (
    <Select
      value={compra.tipo_retencion_isr ? String(compra.tipo_retencion_isr) : ''}
      onValueChange={v => setCompra({ ...compra, tipo_retencion_isr: Number(v) })}
    >
      <SelectTrigger className={`h-8 text-[11px] bg-white ${compra.tipo_retencion_isr ? '' : 'border-amber-400'}`}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {TIPOS_RETENCION_ISR.map(([k, t]) => <SelectItem key={k} value={String(k)}>{k} · {t}</SelectItem>)}
      </SelectContent>
    </Select>
  );
  const datosSuplidor = [
    telefonos && `Tel.: ${telefonos}`,
    selectedProveedor?.direccion && selectedProveedor.direccion,
  ].filter(Boolean).join(' · ');

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[3fr_2fr] 2xl:grid-cols-2 gap-3">
      {/* ── Datos del suplidor ── */}
      <Caja titulo="Datos del suplidor" className="lg:order-2">
        <div className="grid grid-cols-2 md:grid-cols-6 gap-x-3 gap-y-1.5 items-end">
          <Campo label="Suplidor" className="col-span-2 md:col-span-4">
            <div className="flex gap-1">
              <Input
                value={selectedProveedor?.nombre || (compra.suplidor_id ? (compra.suplidor_nombre || 'Suplidor…') : '')}
                className="h-8 text-sm font-bold bg-white cursor-pointer"
                placeholder="Buscar suplidor"
                data-guia="compra-suplidor"
                onKeyDown={(e) => { if (e.key === 'F3') { e.preventDefault(); e.stopPropagation(); onOpenSuplidorSearch(); } }}
                readOnly
                onClick={onOpenSuplidorSearch}
              />
              <Button variant="secondary" size="icon" className="h-8 w-8 shrink-0" onClick={onOpenSuplidorSearch} type="button" title="Buscar suplidor">
                <Search className="h-3.5 w-3.5" />
              </Button>
              {compra.suplidor_id && (
                <Button variant="outline" size="icon" className="h-8 w-8 shrink-0 text-blue-600 border-blue-200" onClick={() => onEditSuplidor(selectedProveedor)} type="button" title="Editar suplidor">
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          </Campo>
          <Campo label="RNC" className="col-span-2 md:col-span-2">
            <Input value={selectedProveedor?.rnc || ''} className="h-8 text-xs bg-gray-50 font-mono" readOnly tabIndex={-1} />
          </Campo>

          <Campo label="Almacén" className="col-span-2 md:col-span-2">
            <Select value={compra.almacen_id?.toString() || ''} onValueChange={v => setCompra({ ...compra, almacen_id: v })}>
              <SelectTrigger className="h-8 text-xs bg-white shadow-none"><SelectValue placeholder="…" /></SelectTrigger>
              <SelectContent>
                {almacenes.map(a => <SelectItem key={a.id} value={a.id}>{a.codigo} - {a.nombre}</SelectItem>)}
              </SelectContent>
            </Select>
          </Campo>
          <Campo label="Teléfono · Dirección" className="col-span-2 md:col-span-4">
            <div className="h-8 flex items-center px-2 rounded-md border bg-gray-50 text-xs text-gray-600 min-w-0" title={datosSuplidor}>
              <span className="truncate">{datosSuplidor || <span className="text-gray-400">—</span>}</span>
            </div>
          </Campo>
        </div>
      </Caja>
      {/* ── Detalles de la compra ── */}
      <Caja titulo="Detalles de la compra" className="lg:order-1">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-x-3 gap-y-1.5 items-end">
          <Campo label="Número" htmlFor="numero">
            <Input id="numero" value={compra.numero} className="h-8 text-xs bg-gray-50 font-mono px-2" onChange={e => setCompra({ ...compra, numero: e.target.value })} />
          </Campo>
          <Campo label="Fecha" htmlFor="fecha">
            <Input
              type="date"
              id="fecha"
              value={compra.fecha ? format(compra.fecha, 'yyyy-MM-dd') : ''}
              className="h-8 text-xs"
              onChange={e => {
                if (!e.target.value) {
                  setCompra({ ...compra, fecha: null });
                  return;
                }
                const [y, m, d] = e.target.value.split('-').map(Number);
                setCompra({ ...compra, fecha: new Date(y, m - 1, d, 12, 0, 0) });
              }}
            />
          </Campo>
          <Campo label="NCF" htmlFor="ncf">
            <Input id="ncf" value={compra.ncf} className="h-8 text-xs font-mono uppercase" onChange={e => setCompra({ ...compra, ncf: e.target.value })} />
          </Campo>
          <Campo label="Referencia" htmlFor="referencia">
            <Input id="referencia" value={compra.referencia} className="h-8 text-xs" onChange={e => setCompra({ ...compra, referencia: e.target.value })} />
          </Campo>

          <Campo label="Tipo bienes/servicios">
            <Select value={compra.tipo_bienes_servicios} onValueChange={v => setCompra({ ...compra, tipo_bienes_servicios: v })}>
              <SelectTrigger className="h-8 text-[11px] bg-white [&_span]:truncate [&_span]:whitespace-nowrap"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="09">09 - Compras y Gastos</SelectItem>
              </SelectContent>
            </Select>
          </Campo>
          <Campo label="Sub-tipo">
            <Select value={compra.sub_tipo} onValueChange={v => setCompra({ ...compra, sub_tipo: v })}>
              <SelectTrigger className="h-8 text-[11px] bg-white [&_span]:truncate [&_span]:whitespace-nowrap"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Compra de Merc">Compra de Merc</SelectItem>
              </SelectContent>
            </Select>
          </Campo>
          {/* Retención de ISR al suplidor (606 col. 17-18). Solo reportes: no
              cambia lo que se le debe en CxP. */}
          <Campo label="Ret. ISR %" htmlFor="isr-retenido">
            <Input
              id="isr-retenido"
              type="number" min="0" max="100" step="0.01"
              value={compra.isr_retenido_pct || ''}
              placeholder="0"
              className="h-8 text-xs"
              onChange={e => setCompra({ ...compra, isr_retenido_pct: e.target.value })}
              title="Solo si usted le retuvo ISR al suplidor. Va en el 606; no cambia lo que se le debe."
            />
          </Campo>
          {/* Nota de débito del suplidor: el 606 pide el NCF que modifica (col. 5).
              Con retención de ISR, aquí va el tipo de retención. */}
          {esNotaCreditoDebito(compra.ncf) ? (
            <Campo label="NCF que modifica" htmlFor="ncf-modificado">
              <Input
                id="ncf-modificado"
                value={compra.ncf_modificado || ''}
                className={`h-8 text-xs uppercase font-mono ${compra.ncf_modificado ? '' : 'border-amber-400 bg-amber-50'}`}
                placeholder="NCF que corrige"
                onChange={e => setCompra({ ...compra, ncf_modificado: e.target.value.toUpperCase() })}
              />
            </Campo>
          ) : conRetencionIsr ? (
            <Campo label="Tipo de retención">{selectorRetencion('Escoja (606)')}</Campo>
          ) : <div className="hidden md:block" />}
          {/* Nota de débito CON retención: el tipo de retención en una fila más. */}
          {esNotaCreditoDebito(compra.ncf) && conRetencionIsr && (
            <Campo label="Tipo de retención (606)" className="col-span-2">{selectorRetencion('Escoja el tipo')}</Campo>
          )}
        </div>
      </Caja>

    </div>
  );
};

export default CompraHeader;
