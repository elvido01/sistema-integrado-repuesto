// ============================================================
// ReimprimirDocumentoModal.jsx
// ============================================================
// Volver a imprimir una entrada o una salida de mercancía ya grabada.
//
// Hasta ahora el comprobante existía UNA sola vez: si no marcabas "Imprimir al
// guardar", o el papel salía mal, no había desde dónde sacarlo de nuevo — el
// documento estaba en la base pero ninguna pantalla lo enseñaba.
//
// Es la misma ventana para entrada y para salida porque las dos tablas son
// gemelas (mismo encabezado, mismo detalle) y el comprobante se arma con el
// MISMO generador que al grabar: lo que se reimprime es idéntico al original,
// no una reconstrucción parecida.
// ============================================================

import React, { useCallback, useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Search, Printer, X } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import useDebounce from '@/hooks/useDebounce';
import { generateEntradaPDF, generateSalidaPDF } from '@/components/common/PDFGenerator';

const LIMITE = 50;

const formatRD = (n) => (Number(n) || 0).toLocaleString('es-DO', { minimumFractionDigits: 2 });

// La fecha viene 'YYYY-MM-DD' pelada. Pasarla por new Date() la leería como
// medianoche UTC — aquí las 8 PM del día anterior — y la lista mostraría un
// día menos que el comprobante. Se parte el texto y ya.
const formatFecha = (f) => {
  if (!f) return '';
  const t = String(f).trim();
  const m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : t;
};

const ReimprimirDocumentoModal = ({ tipo = 'entrada', isOpen, onClose }) => {
  const { empresa } = useAuth();
  const { toast } = useToast();

  const esEntrada = tipo === 'entrada';
  const tabla = esEntrada ? 'entradas_inventario' : 'salidas_inventario';
  const tablaDetalle = esEntrada ? 'entradas_inventario_detalle' : 'salidas_inventario_detalle';
  const llaveDetalle = esEntrada ? 'entrada_id' : 'salida_id';
  const titulo = esEntrada ? 'Reimprimir una entrada' : 'Reimprimir una salida';

  const [docs, setDocs] = useState([]);
  const [almacenes, setAlmacenes] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [imprimiendo, setImprimiendo] = useState('');
  const busquedaLenta = useDebounce(busqueda, 350);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      let q = supabase
        .from(tabla)
        .select('id, numero, fecha, referencia, concepto, notas, total_costo, almacen_id, created_at')
        .order('created_at', { ascending: false })
        .limit(LIMITE);

      // Con la búsqueda vacía salen los últimos; con texto se busca en TODA la
      // historia, que para eso se reimprime algo viejo.
      const texto = busquedaLenta.trim();
      if (texto) {
        const t = texto.replace(/[%,]/g, ' ');
        q = q.or(`numero.ilike.%${t}%,referencia.ilike.%${t}%,concepto.ilike.%${t}%`);
      }

      const { data, error } = await q;
      if (error) throw error;
      setDocs(data || []);
    } catch (err) {
      toast({ variant: 'destructive', title: 'No se pudo leer la lista', description: err.message });
    } finally {
      setCargando(false);
    }
  }, [tabla, busquedaLenta, toast]);

  useEffect(() => {
    if (!isOpen) return;
    cargar();
  }, [isOpen, cargar]);

  useEffect(() => {
    if (!isOpen) return;
    supabase
      .from('almacenes')
      .select('id, nombre')
      .then(({ data }) => setAlmacenes(data || []));
  }, [isOpen]);

  const reimprimir = async (doc) => {
    setImprimiendo(doc.id);
    try {
      const { data: detalles, error } = await supabase
        .from(tablaDetalle)
        .select('producto_id, codigo, descripcion, cantidad, unidad, costo_unitario, importe')
        .eq(llaveDetalle, doc.id)
        .order('created_at', { ascending: true });

      if (error) throw error;
      if (!detalles || detalles.length === 0) {
        toast({
          variant: 'destructive',
          title: 'Ese documento no tiene renglones',
          description: `${doc.numero} quedó sin detalle guardado, así que no hay nada que imprimir.`,
        });
        return;
      }

      const almacen = almacenes.find((a) => a.id === doc.almacen_id);
      const generar = esEntrada ? generateEntradaPDF : generateSalidaPDF;
      generar(doc, almacen, detalles, empresa);
    } catch (err) {
      toast({ variant: 'destructive', title: 'No se pudo imprimir', description: err.message });
    } finally {
      setImprimiendo('');
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-3xl h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-morla-blue">{titulo}</DialogTitle>
        </DialogHeader>

        <div className="relative">
          <Search className="w-4 h-4 absolute left-2 top-2.5 text-slate-400" />
          <Input
            autoFocus
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Número, referencia o concepto…"
            className="pl-8 h-9"
          />
        </div>

        <div className="flex-1 overflow-auto border rounded-md">
          {cargando ? (
            <div className="flex items-center justify-center h-32 text-slate-500">
              <Loader2 className="w-5 h-5 animate-spin mr-2" /> Buscando…
            </div>
          ) : docs.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-slate-500 text-sm">
              {busqueda.trim()
                ? 'No hay ningún documento con eso.'
                : `Todavía no hay ${esEntrada ? 'entradas' : 'salidas'} guardadas.`}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[110px]">Número</TableHead>
                  <TableHead className="w-[100px]">Fecha</TableHead>
                  <TableHead>Concepto</TableHead>
                  <TableHead>Referencia</TableHead>
                  <TableHead className="text-right w-[110px]">Total</TableHead>
                  <TableHead className="w-[120px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {docs.map((d) => (
                  <TableRow key={d.id} className="text-xs">
                    <TableCell className="font-mono font-bold">{d.numero}</TableCell>
                    <TableCell>{formatFecha(d.fecha)}</TableCell>
                    <TableCell className="truncate max-w-[220px]">{d.concepto}</TableCell>
                    <TableCell className="truncate max-w-[160px] text-slate-500">{d.referencia || '—'}</TableCell>
                    <TableCell className="text-right font-mono">{formatRD(d.total_costo)}</TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-[11px]"
                        disabled={imprimiendo === d.id}
                        onClick={() => reimprimir(d)}
                      >
                        {imprimiendo === d.id
                          ? <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                          : <Printer className="w-3 h-3 mr-1" />}
                        Imprimir
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>

        <div className="flex justify-between items-center">
          <p className="text-[11px] text-slate-500">
            {busqueda.trim()
              ? 'Buscando en toda la historia.'
              : `Los últimos ${LIMITE}. Escribí un número para buscar más atrás.`}
          </p>
          <Button variant="outline" onClick={onClose}>
            <X className="w-4 h-4 mr-2" /> Cerrar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ReimprimirDocumentoModal;
