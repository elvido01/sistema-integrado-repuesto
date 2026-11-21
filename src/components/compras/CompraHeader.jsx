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

// (21/11/2026) Encabezado compacto: antes eran dos cajas altas (unos 220 px)
// y la tabla de artículos quedaba con poco espacio. Ahora es una franja de
// dos filas; lo que del suplidor solo se lee (nombre, dirección, teléfonos)
// va como texto, no como cajas de solo lectura. Mismos campos e ids.
const Campo = ({ label, htmlFor, className = '', children }) => (
  <div className={`min-w-0 ${className}`}>
    <Label htmlFor={htmlFor} className="block text-[10px] font-bold uppercase tracking-wide text-gray-500 mb-0.5 truncate">{label}</Label>
    {children}
  </div>
);

const CompraHeader = ({ compra, setCompra, proveedores, almacenes, onOpenSuplidorSearch, onEditSuplidor }) => {
  const selectedProveedor = proveedores.find(p => p.id === compra.suplidor_id);
  const conRetencionIsr = Number(compra.isr_retenido_pct) > 0;
  const telefonos = [selectedProveedor?.telefono, selectedProveedor?.celular].filter(Boolean).join(' · ');
  const datosSuplidor = [
    selectedProveedor?.direccion && `Dirección: ${selectedProveedor.direccion}`,
    telefonos && `Tel.: ${telefonos}`,
  ].filter(Boolean).join('   ·   ');

  return (
    <div className="border rounded-lg bg-white px-3 py-2 space-y-2">
      {/* Fila 1: suplidor, RNC, almacén, número y fecha */}
      <div className="grid grid-cols-2 md:grid-cols-6 lg:grid-cols-12 gap-x-3 gap-y-2 items-end">
        <Campo label="Suplidor" className="col-span-2 md:col-span-3 lg:col-span-5">
          <div className="flex gap-1">
            <Input
              value={selectedProveedor?.nombre || compra.suplidor_id || ''}
              className="h-8 text-sm font-bold bg-white cursor-pointer"
              placeholder="Buscar suplidor"
              data-guia="compra-suplidor"
              onKeyDown={(e) => e.key === 'F3' && onOpenSuplidorSearch()}
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
        <Campo label="RNC" className="md:col-span-1 lg:col-span-2">
          <Input value={selectedProveedor?.rnc || ''} className="h-8 text-xs bg-gray-50 font-mono" readOnly tabIndex={-1} />
        </Campo>
        <Campo label="Almacén" className="md:col-span-2 lg:col-span-2">
          <Select value={compra.almacen_id?.toString() || ''} onValueChange={v => setCompra({ ...compra, almacen_id: v })}>
            <SelectTrigger className="h-8 text-xs bg-white shadow-none"><SelectValue placeholder="…" /></SelectTrigger>
            <SelectContent>
              {almacenes.map(a => <SelectItem key={a.id} value={a.id}>{a.codigo} - {a.nombre}</SelectItem>)}
            </SelectContent>
          </Select>
        </Campo>
        <Campo label="Número" htmlFor="numero" className="lg:col-span-1">
          <Input id="numero" value={compra.numero} className="h-8 text-xs bg-gray-50 font-mono px-2" onChange={e => setCompra({ ...compra, numero: e.target.value })} />
        </Campo>
        <Campo label="Fecha" htmlFor="fecha" className="lg:col-span-2">
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
      </div>

      {/* Fila 2: comprobante y clasificación del 606 */}
      <div className="grid grid-cols-2 md:grid-cols-6 lg:grid-cols-12 gap-x-3 gap-y-2 items-end">
        <Campo label="NCF" htmlFor="ncf" className="md:col-span-2 lg:col-span-2">
          <Input id="ncf" value={compra.ncf} className="h-8 text-xs font-mono uppercase" onChange={e => setCompra({ ...compra, ncf: e.target.value })} />
        </Campo>
        {/* Nota de débito del suplidor: el 606 pide el NCF que modifica (col. 5). */}
        {esNotaCreditoDebito(compra.ncf) && (
          <Campo label="NCF que modifica" htmlFor="ncf-modificado" className="md:col-span-2 lg:col-span-2">
            <Input
              id="ncf-modificado"
              value={compra.ncf_modificado || ''}
              className={`h-8 text-xs uppercase font-mono ${compra.ncf_modificado ? '' : 'border-amber-400 bg-amber-50'}`}
              placeholder="NCF de la factura que corrige"
              onChange={e => setCompra({ ...compra, ncf_modificado: e.target.value.toUpperCase() })}
            />
          </Campo>
        )}
        <Campo label="Referencia" htmlFor="referencia" className="md:col-span-2 lg:col-span-2">
          <Input id="referencia" value={compra.referencia} className="h-8 text-xs" onChange={e => setCompra({ ...compra, referencia: e.target.value })} />
        </Campo>
        <Campo label="Tipo bienes/servicios" className="md:col-span-2 lg:col-span-2">
          <Select value={compra.tipo_bienes_servicios} onValueChange={v => setCompra({ ...compra, tipo_bienes_servicios: v })}>
            <SelectTrigger className="h-8 text-[11px] bg-white"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="09">09 - Compras y Gastos</SelectItem>
            </SelectContent>
          </Select>
        </Campo>
        <Campo label="Sub-tipo" className="md:col-span-1 lg:col-span-2">
          <Select value={compra.sub_tipo} onValueChange={v => setCompra({ ...compra, sub_tipo: v })}>
            <SelectTrigger className="h-8 text-[11px] bg-white"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="Compra de Merc">Compra de Merc</SelectItem>
            </SelectContent>
          </Select>
        </Campo>
        {/* Retención de ISR al suplidor (606 col. 17-18). Solo reportes: no
            cambia lo que se le debe en CxP. */}
        <Campo label="Ret. ISR %" htmlFor="isr-retenido" className="lg:col-span-1">
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
        {conRetencionIsr && (
          <Campo label="Tipo de retención (606)" className="col-span-2 md:col-span-3 lg:col-span-3">
            <Select
              value={compra.tipo_retencion_isr ? String(compra.tipo_retencion_isr) : ''}
              onValueChange={v => setCompra({ ...compra, tipo_retencion_isr: Number(v) })}
            >
              <SelectTrigger className={`h-8 text-[11px] bg-white ${compra.tipo_retencion_isr ? '' : 'border-amber-400'}`}>
                <SelectValue placeholder="Escoja el tipo" />
              </SelectTrigger>
              <SelectContent>
                {TIPOS_RETENCION_ISR.map(([k, t]) => <SelectItem key={k} value={String(k)}>{k} · {t}</SelectItem>)}
              </SelectContent>
            </Select>
          </Campo>
        )}
      </div>

      {datosSuplidor && (
        <p className="text-[11px] text-gray-500 truncate" title={datosSuplidor}>{datosSuplidor}</p>
      )}
    </div>
  );
};

export default CompraHeader;
