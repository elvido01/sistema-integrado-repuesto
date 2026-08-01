import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, HandCoins, ReceiptText, Check } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { generateGastoDiarioPDF } from '@/components/common/pdf/gastoDiarioPDF';
import { printGastoDiarioPOS } from '@/lib/printPOS';
import CuentaBancariaSelect from '@/components/bancos/CuentaBancariaSelect';

const todayISO = () => new Date().toISOString().split('T')[0];

const TIPOS_GASTO = [
  'Operativo',
  'Combustible',
  'Comida y dieta',
  'Casa',
  'Transporte',
  'Servicios',
  'Mantenimiento',
  'Nomina',
  'Administrativo',
  // Lo que se cobró al cliente y se le entrega a un tercero (GPS, seguro...).
  // Lo pone el modo "Pago a terceros"; aquí está para que al editar una de
  // esas filas el selector muestre su valor y no quede en blanco.
  'Terceros',
  'Otro',
];

const money = (v) => Number(v || 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// "MotoPréstamos Los Naranjos" -> MPN · "CAMINERO MOTORS" -> CM
// El nombre completo de la empresa no cabe al lado de cada cliente. Se saca
// la inicial de cada palabra con peso, partiendo también las palabras
// pegadas (MotoPréstamos = Moto + Préstamos) para no perder la P.
const SIN_PESO = new Set(['de', 'del', 'la', 'las', 'los', 'el', 'y', 'e', 'srl', 'sa', 'eirl']);
const siglas = (nombre) => {
  const s = String(nombre || '')
    .replace(/([a-záéíóúñ])([A-ZÁÉÍÓÚÑ])/g, '$1 $2')
    .replace(/[.,&()]/g, ' ')
    .split(/\s+/)
    .filter((w) => w && !SIN_PESO.has(w.toLowerCase()))
    .map((w) => w[0])
    .join('')
    .toUpperCase();
  return s.slice(0, 4);
};

const DailyExpenseModal = ({ isOpen, onClose, gasto = null }) => {
  const { toast } = useToast();
  const { user, tenantId, empresa } = useAuth();
  const montoInputRef = useRef(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    fecha: todayISO(),
    tipo_gasto: 'Operativo',
    monto: '',
    descripcion: '',
  });
  // De dónde sale el gasto:
  //   'efectivo' → la gaveta (resta de la caja, como siempre)
  //   'banco'    → una cuenta bancaria de la empresa (no resta de la caja)
  //   'externo'  → un tercero u otra cuenta (ej. lo pagó Odalys): SÍ es gasto
  //                de la empresa pero NO resta de la caja.
  const [pagaCon, setPagaCon] = useState('efectivo'); // 'efectivo' | 'banco' | 'externo'
  const [cuentaId, setCuentaId] = useState('');
  // Al editar un gasto que salió del banco no se cambia el origen aquí (habría
  // que revertir el movimiento bancario): se bloquea el selector.
  const [bancoLock, setBancoLock] = useState(false);
  // Gastos ya registrados hoy: clic para EDITAR (ej. el mandado costó menos)
  const [gastosHoy, setGastosHoy] = useState([]);
  const [editandoId, setEditandoId] = useState(null);
  const [huboCambios, setHuboCambios] = useState(false);

  // ---- PAGO A TERCEROS ------------------------------------------------
  // El GPS, el seguro, el casco, la placa y la matrícula NO son gastos de la
  // empresa: se le cobran al cliente dentro del precio de la moto y hay que
  // entregárselos a quien presta el servicio. El dinero SÍ sale de la caja,
  // pero no debe engordar el reporte de gastos. Ver sql/pagos_a_terceros.sql
  const [modo, setModo] = useState('gasto');        // 'gasto' | 'terceros'
  const [hayTerceros, setHayTerceros] = useState(false); // el catálogo existe
  const [conceptos, setConceptos] = useState([]);
  const [marcados, setMarcados] = useState({});     // { conceptoId: montoTexto }
  // El comprador financiado vive en la financiera del grupo (MotoPréstamos),
  // no en las 18 fichas de paso del dealer. Son 9,234: la búsqueda va al
  // servidor. Ver sql/clientes_terceros_financiera.sql
  const [busquedaCli, setBusquedaCli] = useState('');
  const [clientes, setClientes] = useState([]);
  const [buscandoCli, setBuscandoCli] = useState(false);
  const [cliente, setCliente] = useState(null); // { id, nombre, tenant_id, origen }

  const totalTerceros = useMemo(
    () => Object.values(marcados).reduce((s, v) => s + (Number(v) || 0), 0),
    [marcados]
  );

  // Catálogo de conceptos con su monto fijo. Si la tabla todavía no existe
  // (SQL sin correr), el modo simplemente no aparece y el modal sigue igual.
  const cargarConceptos = async () => {
    if (!tenantId) return;
    const { data, error } = await supabase
      .from('conceptos_terceros')
      .select('id, nombre, monto')
      .eq('tenant_id', tenantId)
      .eq('activo', true)
      .order('orden', { ascending: true });
    if (error) { setHayTerceros(false); return; }
    setConceptos(data || []);
    setHayTerceros((data || []).length > 0);
  };

  // Busca en el catálogo propio Y en el de la financiera del grupo. Si el RPC
  // no existe todavía (SQL sin correr), cae al catálogo propio: el buscador
  // sigue sirviendo, solo que sin los clientes de la financiera.
  const buscarClientes = async (texto) => {
    if (!tenantId) return;
    setBuscandoCli(true);
    try {
      const { data, error } = await supabase.rpc('buscar_clientes_con_financiera', {
        p_busqueda: texto || '',
        p_limite: 40,
      });
      if (error) throw error;
      setClientes(data || []);
    } catch {
      const q = (texto || '').trim();
      let sel = supabase.from('clientes').select('id, nombre, tenant_id').eq('tenant_id', tenantId).eq('activo', true);
      if (q) sel = sel.ilike('nombre', `%${q}%`);
      const { data } = await sel.order('nombre', { ascending: true }).limit(40);
      setClientes((data || []).map((c) => ({ ...c, origen: '', es_financiera: false })));
    } finally {
      setBuscandoCli(false);
    }
  };

  const toggleConcepto = (c) => {
    setMarcados((prev) => {
      const next = { ...prev };
      if (next[c.id] !== undefined) delete next[c.id];
      else next[c.id] = String(Number(c.monto) || '');
      return next;
    });
  };

  const cargarGastosHoy = async () => {
    if (!tenantId) return;
    const { data } = await supabase
      .from('gastos_diarios')
      .select('id, fecha, tipo_gasto, monto, descripcion, afecta_caja, cuenta_bancaria_id, es_tercero, concepto_tercero')
      .eq('tenant_id', tenantId)
      .eq('fecha', todayISO())
      .eq('anulado', false)
      .order('created_at', { ascending: false });
    setGastosHoy(data || []);
  };

  const resetForm = () => {
    setEditandoId(null);
    setFormData({ fecha: todayISO(), tipo_gasto: 'Operativo', monto: '', descripcion: '' });
    setPagaCon('efectivo');
    setCuentaId('');
    setBancoLock(false);
    setMarcados({});
    setCliente(null);
    setBusquedaCli('');
  };

  // Buscar mientras se escribe, sin disparar una consulta por tecla.
  useEffect(() => {
    if (!isOpen || modo !== 'terceros') return;
    const t = setTimeout(() => buscarClientes(busquedaCli), busquedaCli ? 250 : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, modo, busquedaCli, tenantId]);

  const editarGasto = (g) => {
    setEditandoId(g.id);
    // Corregir un pago a terceros se hace con el formulario normal: solo
    // cambian monto/descripción. La marca de tercero no se toca (el update
    // no la incluye), así que la fila sigue fuera del reporte de gastos.
    setModo('gasto');
    setFormData({ fecha: g.fecha, tipo_gasto: g.tipo_gasto || 'Operativo', monto: String(g.monto), descripcion: g.descripcion || '' });
    // Origen actual: banco (bloqueado), externo (no afecta caja) o efectivo.
    if (g.cuenta_bancaria_id) {
      setPagaCon('banco'); setCuentaId(g.cuenta_bancaria_id); setBancoLock(true);
    } else {
      setPagaCon(g.afecta_caja === false ? 'externo' : 'efectivo'); setCuentaId(''); setBancoLock(false);
    }
    setTimeout(() => { montoInputRef.current?.focus(); montoInputRef.current?.select(); }, 80);
  };

  // Eliminar (anular): p. ej. se mandó a comprar algo y no se compró
  const eliminarGasto = async () => {
    if (!editandoId) return;
    if (!window.confirm(`¿Eliminar este gasto de RD$${formData.monto}? El dinero vuelve a la caja.`)) return;
    setIsSubmitting(true);
    try {
      const { error } = await supabase.from('gastos_diarios').update({ anulado: true }).eq('id', editandoId);
      if (error) throw error;
      toast({ title: 'Gasto eliminado', description: 'El monto regresó a la caja del día.' });
      setHuboCambios(true);
      resetForm();
      await cargarGastosHoy();
    } catch (error) {
      toast({ variant: 'destructive', title: 'No se pudo eliminar', description: error.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      // Doble clic en la tarjeta del dashboard: abre directo en edición
      if (gasto?.id) editarGasto(gasto);
      else { setModo('gasto'); resetForm(); }
      setHuboCambios(false);
      cargarGastosHoy();
      cargarConceptos();
      setTimeout(() => {
        montoInputRef.current?.focus();
        montoInputRef.current?.select();
      }, 80);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, gasto]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleTipoChange = (value) => {
    setFormData(prev => ({ ...prev, tipo_gasto: value }));
  };

  // Guarda uno o varios pagos a terceros de un solo golpe (GPS + seguro es lo
  // normal). Cada concepto queda en su propia fila: así se sabe qué se pagó,
  // no solo cuánto salió.
  const guardarTerceros = async () => {
    const filas = conceptos
      .filter((c) => marcados[c.id] !== undefined)
      .map((c) => ({ concepto: c, monto: Number(marcados[c.id]) }));

    if (filas.length === 0) {
      toast({ variant: 'destructive', title: 'Nada marcado', description: 'Marca al menos un servicio (GPS, seguro...).' });
      return;
    }
    const sinMonto = filas.find((f) => !Number.isFinite(f.monto) || f.monto <= 0);
    if (sinMonto) {
      toast({
        variant: 'destructive',
        title: `Falta el monto de ${sinMonto.concepto.nombre}`,
        description: 'Escribe cuánto se paga. Queda guardado como el valor fijo para la próxima vez.',
      });
      return;
    }
    if (pagaCon === 'banco' && !cuentaId) {
      toast({ variant: 'destructive', title: 'Falta la cuenta', description: 'Elige de qué cuenta bancaria sale el pago.' });
      return;
    }

    setIsSubmitting(true);
    try {
      const desdeBanco = pagaCon === 'banco' && cuentaId;
      const esExterno = pagaCon === 'externo';

      const { data: creados, error } = await supabase.from('gastos_diarios').insert(
        filas.map((f) => ({
          tenant_id: tenantId,
          fecha: formData.fecha,
          tipo_gasto: 'Terceros',
          monto: f.monto,
          descripcion: cliente ? `${f.concepto.nombre} — ${cliente.nombre}` : f.concepto.nombre,
          usuario_id: user?.id || null,
          cuenta_bancaria_id: desdeBanco ? cuentaId : null,
          afecta_caja: !(desdeBanco || esExterno),
          es_tercero: true,
          concepto_tercero: f.concepto.nombre,
          // El id puede ser de la financiera del grupo: sin saber de qué
          // empresa es, un cruce filtrado por tenant perdería la fila.
          cliente_id: cliente?.id || null,
          cliente_tenant_id: cliente?.tenant_id || null,
        }))
      ).select('id, monto, concepto_tercero');

      if (error) throw error;

      // Si se corrigió un monto, ese pasa a ser el valor fijo del concepto.
      // Así casco/placa/matrícula se configuran solas la primera vez que se
      // pagan, sin mandar a nadie a una pantalla de configuración.
      const cambiados = filas.filter((f) => Number(f.concepto.monto) !== f.monto);
      if (cambiados.length > 0) {
        await Promise.all(cambiados.map((f) =>
          supabase.from('conceptos_terceros')
            .update({ monto: f.monto, updated_at: new Date().toISOString() })
            .eq('id', f.concepto.id)
        ));
        await cargarConceptos();
      }

      // Pagado por banco: sale de la cuenta y no de la gaveta. Un movimiento
      // por concepto, para que el estado de cuenta diga qué fue cada salida.
      if (desdeBanco) {
        for (const row of creados || []) {
          const { error: movErr } = await supabase.rpc('registrar_movimiento_bancario_compartido', {
            p_cuenta_id: cuentaId,
            p_tipo: 'SALIDA',
            p_monto: Number(row.monto),
            p_concepto: `Pago a terceros: ${row.concepto_tercero}${cliente ? ' — ' + cliente.nombre : ''}`,
            p_referencia: null,
            p_origen_tipo: 'gasto',
            p_origen_id: row.id,
            p_fecha: formData.fecha || null,
          });
          if (movErr) {
            toast({
              variant: 'destructive',
              title: 'Pago registrado, pero el banco no cuadró',
              description: `No se descontó de la cuenta (${movErr.message}). Regístralo a mano en Cuentas Bancarias.`,
            });
            break;
          }
        }
      }

      toast({
        title: 'Pago a terceros registrado',
        description: `${filas.map((f) => f.concepto.nombre).join(' + ')} · RD$${money(totalTerceros)}. ${
          desdeBanco ? 'Salió de la cuenta bancaria.' : esExterno ? 'No afecta la caja.' : 'Salió de la caja.'
        } No cuenta como gasto de la empresa.`,
      });

      setHuboCambios(true);
      setMarcados({});
      setCliente(null);
      setBusquedaCli('');
      await cargarGastosHoy();
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Error al guardar',
        description: error.message || 'No se pudo registrar el pago a terceros.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (modo === 'terceros') { await guardarTerceros(); return; }

    const monto = Number(formData.monto);

    if (!tenantId) {
      toast({ variant: 'destructive', title: 'Error', description: 'No se encontro el tenant de la empresa.' });
      return;
    }

    if (!Number.isFinite(monto) || monto <= 0) {
      toast({ variant: 'destructive', title: 'Monto invalido', description: 'Digite un monto mayor que cero.' });
      return;
    }

    if (pagaCon === 'banco' && !cuentaId) {
      toast({ variant: 'destructive', title: 'Falta la cuenta', description: 'Elige de qué cuenta bancaria sale el gasto.' });
      return;
    }

    setIsSubmitting(true);
    try {
      if (editandoId) {
        // Corrección de un gasto ya registrado (ej. costó menos de lo anotado).
        // Si el gasto no salió del banco, se puede cambiar entre efectivo y
        // externo (afecta o no la caja). Los de banco no se tocan aquí.
        const upd = {
          fecha: formData.fecha,
          tipo_gasto: formData.tipo_gasto,
          monto,
          descripcion: formData.descripcion.trim(),
        };
        if (!bancoLock) upd.afecta_caja = pagaCon !== 'externo';
        const { error } = await supabase.from('gastos_diarios').update(upd).eq('id', editandoId);
        if (error) throw error;
        toast({ title: 'Gasto actualizado', description: 'La caja se recalcula con el nuevo monto.' });
        setHuboCambios(true);
        setIsSubmitting(false);
        // Si viniste con doble clic sobre un gasto, ya terminaste: cerrar.
        // Si abriste en "Nuevo", el modal queda abierto para seguir revisando.
        if (gasto?.id) { onClose(true); return; }
        resetForm();
        await cargarGastosHoy();
        return;
      }

      const desdeBanco = pagaCon === 'banco' && cuentaId;
      const esExterno = pagaCon === 'externo';
      const { data: gastoCreado, error } = await supabase.from('gastos_diarios').insert({
        tenant_id: tenantId,
        fecha: formData.fecha,
        tipo_gasto: formData.tipo_gasto,
        monto,
        descripcion: formData.descripcion.trim(),
        usuario_id: user?.id || null,
        cuenta_bancaria_id: desdeBanco ? cuentaId : null,
        // Banco de la empresa o tercero (Odalys): NO resta de la gaveta.
        afecta_caja: !(desdeBanco || esExterno),
      }).select('id').single();

      if (error) throw error;

      // Pagado por banco: sale de la cuenta (y NO de la gaveta). Idempotente
      // por el id del gasto; si falla, el gasto igual quedó registrado.
      if (desdeBanco) {
        const { error: movErr } = await supabase.rpc('registrar_movimiento_bancario_compartido', {
          p_cuenta_id: cuentaId,
          p_tipo: 'SALIDA',
          p_monto: monto,
          p_concepto: `Gasto ${formData.tipo_gasto}: ${formData.descripcion.trim()}`.trim(),
          p_referencia: null,
          p_origen_tipo: 'gasto',
          p_origen_id: gastoCreado?.id || null,
          p_fecha: formData.fecha || null,
        });
        if (movErr) {
          toast({
            variant: 'destructive',
            title: 'Gasto registrado, pero el banco no cuadró',
            description: `No se descontó de la cuenta (${movErr.message}). Regístralo a mano en Cuentas Bancarias.`,
          });
        }
      }

      toast({
        title: 'Gasto diario registrado',
        description: desdeBanco
          ? 'El gasto salió de la cuenta bancaria.'
          : esExterno
            ? 'Registrado como gasto de la empresa (no afecta la caja).'
            : 'El gasto fue descontado de caja.',
      });

      // Comprobante de gasto segun el formato configurado (Config. del Sistema)
      try {
        const gastoComprobante = {
          fecha: formData.fecha,
          tipo_gasto: formData.tipo_gasto,
          monto,
          descripcion: formData.descripcion.trim(),
        };
        const formato = empresa?.formato_comprobante_pago || 'pdf';
        if (formato === 'pos_80mm') {
          printGastoDiarioPOS(gastoComprobante, '80mm');
        } else if (formato === 'pos_4inch') {
          printGastoDiarioPOS(gastoComprobante, '4inch');
        } else {
          generateGastoDiarioPDF(gastoComprobante, empresa || {});
        }
      } catch (pdfErr) {
        console.warn('No se pudo generar el comprobante de gasto:', pdfErr);
      }

      onClose(true);
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Error al guardar',
        description: error.message || 'No se pudo registrar el gasto diario.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(huboCambios); }}>
      {/* DialogContent es un GRID: sus hijos nacen con min-width:auto y no
          encogen por debajo de su contenido, así que se salen del cuadro en
          vez de ajustarse. Por eso el switch y el formulario llevan min-w-0.
          Nada de overflow-x oculto: si algo no cabe hay que arreglarlo, no
          taparlo. */}
      <DialogContent className="max-w-md sm:max-w-md max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {editandoId ? 'Editar Gasto' : modo === 'terceros' ? 'Pago a terceros' : 'Gastos Diarios'}
          </DialogTitle>
          <DialogDescription>
            {editandoId
              ? 'Corrige el monto o la descripción del gasto seleccionado.'
              : modo === 'terceros'
                ? 'Se cobró al cliente y se le entrega a quien presta el servicio. Sale de la caja, pero no es gasto.'
                : 'Registra una salida de efectivo para rebajarla de caja.'}
          </DialogDescription>
        </DialogHeader>

        {/* Los dos tipos de salida son cosas distintas y por eso el formulario
            cambia entero: un gasto es plata de la empresa, un pago a terceros
            es plata del cliente que va de paso. */}
        {!editandoId && hayTerceros && (
          <div className="min-w-0 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setModo('gasto')}
              className={`flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-bold uppercase transition-colors ${
                modo === 'gasto'
                  ? 'bg-rose-50 border-rose-300 text-rose-700'
                  : 'bg-white border-slate-200 text-slate-400 hover:bg-slate-50'
              }`}
            >
              <ReceiptText className="w-4 h-4 shrink-0" /> Gasto
            </button>
            <button
              type="button"
              onClick={() => setModo('terceros')}
              className={`flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-bold uppercase transition-colors ${
                modo === 'terceros'
                  ? 'bg-indigo-50 border-indigo-300 text-indigo-700'
                  : 'bg-white border-slate-200 text-slate-400 hover:bg-slate-50'
              }`}
            >
              <HandCoins className="w-4 h-4 shrink-0" /> Terceros
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit} className="min-w-0 space-y-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="fecha-gasto">Fecha</Label>
              <Input
                id="fecha-gasto"
                name="fecha"
                type="date"
                value={formData.fecha}
                onChange={handleChange}
                required
              />
            </div>

            {modo === 'gasto' && (
              <div className="space-y-2">
                <Label htmlFor="tipo-gasto">Tipo de gasto</Label>
                <Select value={formData.tipo_gasto} onValueChange={handleTipoChange}>
                  <SelectTrigger id="tipo-gasto">
                    <SelectValue placeholder="Seleccione" />
                  </SelectTrigger>
                  <SelectContent>
                    {TIPOS_GASTO.map(tipo => (
                      <SelectItem key={tipo} value={tipo}>{tipo}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {modo === 'gasto' ? (
            <div className="space-y-2">
              <Label htmlFor="monto-gasto">Monto (DOP)</Label>
              <Input
                ref={montoInputRef}
                id="monto-gasto"
                name="monto"
                type="number"
                step="0.01"
                min="0.01"
                value={formData.monto}
                onChange={handleChange}
                placeholder="0.00"
                required
              />
            </div>
          ) : (
            <>
              {/* Un clic por servicio. El monto viene fijo y se puede corregir:
                  si se corrige, ese pasa a ser el valor de ahí en adelante. */}
              <div className="space-y-2">
                <Label>¿Qué se paga?</Label>
                {/* Una fila por servicio, no cuadros en rejilla: en rejilla el
                    nombre y el monto compiten por un tercio del ancho y
                    cualquiera de los dos se corta. En fila, el monto tiene su
                    espacio fijo y el nombre se lee entero. */}
                <div className="rounded-lg border border-slate-200 divide-y divide-slate-100 overflow-hidden">
                  {conceptos.map((c) => {
                    const on = marcados[c.id] !== undefined;
                    return (
                      <div
                        key={c.id}
                        className={`flex items-center gap-2 px-2 py-1 transition-colors ${on ? 'bg-indigo-50' : 'bg-white'}`}
                      >
                        <button
                          type="button"
                          onClick={() => toggleConcepto(c)}
                          className="flex items-center gap-2 min-w-0 flex-1 text-left"
                        >
                          <span
                            className={`w-4 h-4 rounded border shrink-0 flex items-center justify-center ${
                              on ? 'bg-indigo-600 border-indigo-600' : 'bg-white border-slate-300'
                            }`}
                          >
                            {on && <Check className="w-3 h-3 text-white" />}
                          </span>
                          <span className={`text-xs font-bold uppercase truncate ${on ? 'text-indigo-800' : 'text-slate-600'}`}>
                            {c.nombre}
                          </span>
                        </button>
                        {on ? (
                          <Input
                            type="number"
                            step="0.01"
                            min="0.01"
                            value={marcados[c.id]}
                            onChange={(ev) => setMarcados((p) => ({ ...p, [c.id]: ev.target.value }))}
                            placeholder="0.00"
                            className="w-24 shrink-0 h-7 px-2 text-xs text-right font-bold"
                          />
                        ) : (
                          <span className="w-24 shrink-0 h-7 flex items-center justify-end pr-2 text-xs font-bold text-slate-400">
                            {Number(c.monto) > 0 ? money(c.monto) : '—'}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
                {conceptos.some((c) => !Number(c.monto)) && (
                  <p className="text-[10px] text-gray-500 italic">
                    Los que muestran “—” no tienen monto todavía: al marcarlos, escribe cuánto se paga y queda guardado como su valor fijo.
                  </p>
                )}
              </div>

              {/* El comprador financiado está en la financiera del grupo, no
                  en las fichas de paso del dealer: el buscador ve las dos y
                  dice de cuál es cada quien. */}
              <div className="space-y-2">
                <Label>¿De quién es? (opcional)</Label>
                {cliente ? (
                  <div className="flex items-center justify-between gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-indigo-900 truncate">{cliente.nombre}</p>
                      {cliente.origen && (
                        <p className="text-[10px] text-indigo-600 truncate">
                          {cliente.origen}{cliente.documento ? ` · ${cliente.documento}` : ''}
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => { setCliente(null); setBusquedaCli(''); }}
                      className="text-[10px] font-bold uppercase text-indigo-600 hover:text-indigo-800 shrink-0"
                    >
                      Cambiar
                    </button>
                  </div>
                ) : (
                  <>
                    <Input
                      value={busquedaCli}
                      onChange={(ev) => setBusquedaCli(ev.target.value)}
                      placeholder="Escribe el nombre o la cédula…"
                      className="h-9"
                    />
                    <div className="min-w-0 max-h-36 overflow-y-auto rounded-lg border border-slate-200 divide-y divide-slate-100">
                      {buscandoCli && clientes.length === 0 ? (
                        <p className="px-3 py-2 text-xs text-slate-400 italic">Buscando…</p>
                      ) : clientes.length === 0 ? (
                        <p className="px-3 py-2 text-xs text-slate-400 italic">Sin resultados.</p>
                      ) : (
                        clientes.map((c) => (
                          <button
                            key={`${c.tenant_id}-${c.id}`}
                            type="button"
                            onClick={() => setCliente(c)}
                            className="w-full flex items-center justify-between gap-2 px-2 py-1.5 text-left hover:bg-indigo-50 transition-colors"
                          >
                            <span className="text-xs text-slate-700 truncate">{c.nombre}</span>
                            {/* Solo las siglas: el nombre completo de la
                                empresa no deja ver el del cliente. Va en el
                                tooltip y en la ficha de abajo al elegirlo. */}
                            {c.origen && (
                              <span
                                title={c.origen}
                                className={`text-[9px] px-1 py-0.5 rounded font-bold shrink-0 ${
                                  c.es_financiera ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
                                }`}
                              >
                                {siglas(c.origen)}
                              </span>
                            )}
                          </button>
                        ))
                      )}
                    </div>
                  </>
                )}
                {/* Qué quiere decir cada sigla, sacado de los resultados que
                    hay a la vista: si no, "MPN" no le dice nada a nadie. */}
                {!cliente && clientes.length > 0 && (
                  <p className="text-[10px] text-gray-500 leading-snug">
                    {[...new Map(clientes.filter((c) => c.origen).map((c) => [c.origen, c])).values()]
                      .map((c) => `${siglas(c.origen)} = ${c.origen}`)
                      .join(' · ')}
                  </p>
                )}
                <p className="text-[10px] text-gray-500 italic">
                  El comprador financiado suele estar en las dos empresas: elige el de la financiera, que es donde está su préstamo.
                </p>
              </div>
            </>
          )}

          {/* De dónde sale: la gaveta, una cuenta bancaria de la empresa, o un
              tercero/otra cuenta (no afecta la caja, ej. lo pagó Odalys). */}
          {bancoLock ? (
            <div className="rounded-md bg-slate-50 border border-slate-200 px-3 py-2 text-[11px] text-slate-600">
              Este gasto se pagó desde una <b>cuenta bancaria</b>: no resta de la caja. El origen no se edita aquí.
            </div>
          ) : (
            <div className="space-y-2">
              <Label>¿De dónde sale?</Label>
              <Select value={pagaCon} onValueChange={(v) => { setPagaCon(v); if (v !== 'banco') setCuentaId(''); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="efectivo">Efectivo (caja del día)</SelectItem>
                  {!editandoId && <SelectItem value="banco">Cuenta bancaria de la empresa</SelectItem>}
                  <SelectItem value="externo">Otra cuenta / tercero (no afecta caja)</SelectItem>
                </SelectContent>
              </Select>
              {pagaCon === 'banco' && (
                <div className="pt-1">
                  <CuentaBancariaSelect
                    value={cuentaId} onChange={setCuentaId}
                    moneda="DOP" contexto="compromiso" label="Sale de la cuenta"
                  />
                  <p className="text-[10px] text-gray-500 italic mt-1">
                    No resta del efectivo en caja: sale del saldo de esa cuenta.
                  </p>
                </div>
              )}
              {pagaCon === 'externo' && (
                <p className="text-[10px] text-gray-500 italic">
                  Se registra como gasto de la empresa pero <b>no resta de la Caja</b> (lo pagó un tercero u otra cuenta, ej. Odalys). Anota en la descripción quién lo pagó.
                </p>
              )}
            </div>
          )}

          {modo === 'gasto' ? (
            <div className="space-y-2">
              <Label htmlFor="descripcion-gasto">Descripcion</Label>
              <Textarea
                id="descripcion-gasto"
                name="descripcion"
                value={formData.descripcion}
                onChange={handleChange}
                placeholder="Ej: Combustible, merienda, envio..."
                required
              />
            </div>
          ) : (
            <div className="flex items-center justify-between rounded-lg bg-indigo-50 border border-indigo-100 px-3 py-2.5">
              <span className="text-xs font-bold uppercase text-indigo-700">Total a entregar</span>
              <span className="text-lg font-black text-indigo-700">RD${money(totalTerceros)}</span>
            </div>
          )}

          <DialogFooter className="pt-4 mt-4 border-t">
            {editandoId && (
              <>
                <Button type="button" variant="destructive" onClick={eliminarGasto} disabled={isSubmitting}>
                  Eliminar
                </Button>
                <Button type="button" variant="outline" onClick={resetForm}>
                  Cancelar edición
                </Button>
              </>
            )}
            <Button type="button" variant="secondary" onClick={() => onClose(huboCambios)}>
              Cerrar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {editandoId ? 'Actualizar' : 'Guardar'}
            </Button>
          </DialogFooter>
        </form>

        {/* Gastos ya registrados HOY — clic para corregir. Solo cuando el
            modal se abrió en "Nuevo": si entraste con doble clic sobre un
            gasto, ya elegiste cuál editar y la lista sobra. */}
        {!gasto?.id && gastosHoy.length > 0 && (
          <div className="border-t pt-3">
            <p className="text-[11px] font-bold text-slate-400 uppercase mb-1.5">Gastos de hoy (clic para editar)</p>
            <div className="max-h-40 overflow-y-auto space-y-1">
              {gastosHoy.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => editarGasto(g)}
                  className={`w-full flex items-start justify-between gap-2 text-left text-sm px-2 py-1 rounded border transition-colors ${editandoId === g.id ? 'bg-amber-50 border-amber-300' : 'bg-slate-50 border-slate-200 hover:bg-slate-100'}`}
                >
                  {/* La descripcion se lee COMPLETA: baja de linea, no se corta */}
                  <span className="min-w-0 flex-1 break-words">
                    {g.tipo_gasto} — {g.descripcion}
                    {g.es_tercero && (
                      <span
                        className="ml-1 inline-block text-[9px] bg-indigo-100 text-indigo-700 px-1 py-0.5 rounded font-bold uppercase align-middle"
                        title="Pago a terceros: salió de la caja pero no cuenta como gasto de la empresa"
                      >
                        Terceros
                      </span>
                    )}
                    {(g.cuenta_bancaria_id || g.afecta_caja === false) && (
                      <span className="ml-1 inline-block text-[9px] bg-amber-100 text-amber-700 px-1 py-0.5 rounded font-bold uppercase align-middle">
                        {g.cuenta_bancaria_id ? 'Banco' : 'No afecta caja'}
                      </span>
                    )}
                  </span>
                  <span className="font-mono font-bold shrink-0">{Number(g.monto).toLocaleString('es-DO', { minimumFractionDigits: 2 })}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default DailyExpenseModal;
