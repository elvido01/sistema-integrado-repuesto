import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ArrowLeft,
  Check,
  ChevronRight,
  FileText,
  Loader2,
  Printer,
  Receipt,
  Search,
  Share2,
  User,
  X,
} from 'lucide-react-native';
import ViewShot, { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { useAuthStore } from '@/src/store/useAuthStore';
import {
  ClienteRecibo,
  EmpresaRecibo,
  FacturaEmitidaRecibo,
  FacturaPendiente,
  ReciboEmitido,
  crearReciboIngreso,
  fetchClientesRecibo,
  fetchDatosClienteRecibo,
  fetchEmpresaRecibo,
  fetchFacturasEmitidasCliente,
  fetchFacturasEmitidasPorIds,
  fetchRecibosEmitidosCliente,
  getNextReciboNumero,
} from '@/src/services/reciboIngresoService';
import { getSavedPrinter } from '@/services/bluetoothPrinter';
import { printFacturaPos } from '@/services/printFactura';
import { printReciboIngreso } from '@/services/printReciboIngreso';

const todayISO = () => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const daysAgoISO = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() - days);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const money = (value: number) =>
  `RD$${Number(value || 0).toLocaleString('es-DO', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const plainMoney = (value: number) =>
  Number(value || 0).toLocaleString('es-DO', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const ticketMoney = (value: number) =>
  Number(value || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const compactDate = (value?: string | null) => {
  if (!value) return '--/--/----';
  const d = new Date(`${String(value).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return '--/--/----';
  return d.toISOString().slice(0, 10);
};

const dayMonth = (value?: string | null) => {
  if (!value) return '--';
  const d = new Date(`${String(value).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return '--';
  return `${d.getDate()}-${d.getMonth() + 1}`;
};

const dateInRange = (value: string | null | undefined, startDate: string, endDate: string) => {
  if (!value) return false;
  const date = new Date(`${String(value).slice(0, 10)}T12:00:00`);
  const start = new Date(`${String(startDate).slice(0, 10)}T00:00:00`);
  const end = new Date(`${String(endDate).slice(0, 10)}T23:59:59`);
  if (Number.isNaN(date.getTime()) || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return true;
  return date >= start && date <= end;
};

const daysSince = (value?: string | null) => {
  if (!value) return 0;
  const date = new Date(`${String(value).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(date.getTime())) return 0;
  const today = new Date();
  const todayNoon = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12);
  return Math.max(0, Math.floor((todayNoon.getTime() - date.getTime()) / 86400000));
};

type ReciboGuardado = {
  numero: string;
  fecha: string;
  cliente: ClienteRecibo | null;
  empresa: EmpresaRecibo | null;
  facturas: FacturaPendiente[];
  balanceAnterior: number;
  balanceActual: number;
  totalBalance: number;
  totalPago: number;
  formaPago: {
    id: number;
    forma: string;
    monto: number;
    referencia: string;
    banco: string;
    fecha: string;
    observaciones: string;
  };
};

export default function ReciboIngresoMobileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const ticketRef = useRef<ViewShot>(null);
  const facturaTicketRef = useRef<ViewShot>(null);
  const { tenantId } = useAuthStore();
  const [numero, setNumero] = useState('');
  const [fecha, setFecha] = useState(todayISO());
  const [empresa, setEmpresa] = useState<EmpresaRecibo | null>(null);
  const [cliente, setCliente] = useState<ClienteRecibo | null>(null);
  const [clientes, setClientes] = useState<ClienteRecibo[]>([]);
  const [clienteSearch, setClienteSearch] = useState('');
  const [clienteModalOpen, setClienteModalOpen] = useState(false);
  const [docsModalOpen, setDocsModalOpen] = useState(false);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [facturas, setFacturas] = useState<FacturaPendiente[]>([]);
  const [balanceAnterior, setBalanceAnterior] = useState(0);
  const [monto, setMonto] = useState('');
  const [formaPago, setFormaPago] = useState('Efectivo');
  const [banco, setBanco] = useState('');
  const [referencia, setReferencia] = useState('');
  const [fechaPago, setFechaPago] = useState(todayISO());
  const [observaciones, setObservaciones] = useState('');
  const [loading, setLoading] = useState(true);
  const [clientLoading, setClientLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [imprimiendo, setImprimiendo] = useState(false);
  const [compartiendo, setCompartiendo] = useState(false);
  const [reciboGuardado, setReciboGuardado] = useState<ReciboGuardado | null>(null);
  const [reciboPreview, setReciboPreview] = useState<ReciboGuardado | null>(null);
  const [reprintModalOpen, setReprintModalOpen] = useState(false);
  const [reprintTab, setReprintTab] = useState<'facturas' | 'recibos'>('facturas');
  const [reprintStartDate, setReprintStartDate] = useState(daysAgoISO(15));
  const [reprintEndDate, setReprintEndDate] = useState(todayISO());
  const [reprintFacturas, setReprintFacturas] = useState<FacturaEmitidaRecibo[]>([]);
  const [reprintRecibos, setReprintRecibos] = useState<ReciboEmitido[]>([]);
  const [reprintLoading, setReprintLoading] = useState(false);
  const [reprintPrintingId, setReprintPrintingId] = useState<string | null>(null);
  const [facturaPreview, setFacturaPreview] = useState<any | null>(null);

  const montoNum = Number(monto.replace(/,/g, '')) || 0;
  const totalAbonos = useMemo(
    () => facturas.reduce((sum, f) => sum + Number(f.abono || 0), 0),
    [facturas]
  );
  const facturasSeleccionadas = useMemo(
    () => facturas.filter((f) => f.selected && (Number(f.abono || 0) > 0 || montoNum <= 0)),
    [facturas, montoNum]
  );
  const totalBalanceSeleccionado = useMemo(
    () => facturasSeleccionadas.reduce((sum, f) => sum + Number(f.monto_pendiente || 0), 0),
    [facturasSeleccionadas]
  );
  const fallbackReprintFacturas = useMemo<FacturaEmitidaRecibo[]>(
    () => facturas
      .filter((f) => dateInRange(f.fecha, reprintStartDate, reprintEndDate))
      .map((f) => {
        const numero = f.numero || f.referencia?.replace(/^FT-/, '');
        return {
          id: f.id,
          numero: typeof numero === 'string' ? numero.replace(/^FT-/, '') : numero,
          fecha: f.fecha,
          created_at: f.fecha,
          total: Number(f.total || f.monto_pendiente || 0),
          forma_pago: 'CREDITO',
          tipo_pago: 'CREDITO',
          clientes: cliente,
          facturas_detalle: [],
        };
      }),
    [cliente, facturas, reprintEndDate, reprintStartDate]
  );
  const visibleReprintFacturas = reprintFacturas.length > 0 ? reprintFacturas : fallbackReprintFacturas;
  const activeReciboPreview = reciboGuardado || reciboPreview;
  const balanceActual = Math.max(0, balanceAnterior - totalAbonos);

  useEffect(() => {
    let mounted = true;
    Promise.all([getNextReciboNumero(), fetchClientesRecibo(), fetchEmpresaRecibo(tenantId)])
      .then(([num, rows, empresaData]) => {
        if (!mounted) return;
        setNumero(num);
        setClientes(rows);
        setEmpresa(empresaData);
      })
      .catch((error) => Alert.alert('Error', error?.message || 'No se pudo cargar el recibo.'))
      .finally(() => mounted && setLoading(false));
    return () => {
      mounted = false;
    };
  }, [tenantId]);

  useEffect(() => {
    const handle = setTimeout(() => {
      fetchClientesRecibo(clienteSearch)
        .then(setClientes)
        .catch((error) => Alert.alert('Error', error?.message || 'No se pudieron buscar clientes.'));
    }, 300);
    return () => clearTimeout(handle);
  }, [clienteSearch]);

  const distributeAmount = (amount: number, source: FacturaPendiente[]) => {
    let remaining = amount;
    const next = source.map((factura) => {
      const pending = Math.max(0, Number(factura.monto_pendiente || 0));
      const abono = factura.selected ? Math.min(pending, remaining) : 0;
      remaining -= abono;
      return { ...factura, abono: Number(abono.toFixed(2)) };
    });
    setFacturas(next);
  };

  const handleMontoChange = (value: string) => {
    setMonto(value);
    distributeAmount(Number(value.replace(/,/g, '')) || 0, facturas);
  };

  const selectCliente = async (item: ClienteRecibo) => {
    setCliente(item);
    setClienteModalOpen(false);
    setClientLoading(true);
    try {
      const data = await fetchDatosClienteRecibo(item.id);
      setBalanceAnterior(data.balance_anterior);
      setFacturas(data.facturas_pendientes);
      setMonto('');
      setFormaPago('Efectivo');
      setBanco('');
      setReferencia('');
      setFechaPago(todayISO());
      setObservaciones('');
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'No se pudieron cargar las facturas del cliente.');
      setFacturas([]);
      setBalanceAnterior(0);
    } finally {
      setClientLoading(false);
    }
  };

  const toggleFactura = (id: string) => {
    const next = facturas.map((f) => (f.id === id ? { ...f, selected: !f.selected } : f));
    distributeAmount(montoNum, next);
  };

  const confirmDocsSelection = () => {
    const selectedBalance = facturas
      .filter((f) => f.selected)
      .reduce((sum, f) => sum + Number(f.monto_pendiente || 0), 0);

    if (montoNum <= 0 && selectedBalance > 0) {
      const nextAmount = Number(selectedBalance.toFixed(2));
      setMonto(nextAmount.toFixed(2));
      distributeAmount(nextAmount, facturas);
    }

    setDocsModalOpen(false);
  };

  const resetForm = async () => {
    setCliente(null);
    setFacturas([]);
    setBalanceAnterior(0);
    setMonto('');
    setFormaPago('Efectivo');
    setBanco('');
    setReferencia('');
    setFechaPago(todayISO());
    setObservaciones('');
    setFecha(todayISO());
    try {
      setNumero(await getNextReciboNumero());
    } catch {
      setNumero('');
    }
  };

  const buildReciboTexto = (recibo: ReciboGuardado | null) => {
    if (!recibo) return '';
    const W = 36;
    const fmt = ticketMoney;
    const clean = (value?: string | null) => String(value || '').replace(/[^\x20-\x7E]/g, '').trim();
    const center = (s: string) => {
      const text = clean(s);
      const pad = Math.max(0, Math.floor((W - text.length) / 2));
      return ' '.repeat(pad) + text;
    };
    const leftRight = (left: string, right: string) => {
      const l = clean(left);
      const r = clean(right);
      const spaces = Math.max(1, W - l.length - r.length);
      return l + ' '.repeat(spaces) + r;
    };
    const padRight = (value: string, width: number) => {
      const text = clean(value);
      return text.length >= width ? text.slice(0, width) : text + ' '.repeat(width - text.length);
    };
    const padLeft = (value: string, width: number) => {
      const text = clean(value);
      return text.length >= width ? text.slice(0, width) : ' '.repeat(width - text.length) + text;
    };
    const docRow = (ref: string, balance: string, paid: string) =>
      padRight(ref, 9) + padLeft(balance, 10) + padLeft(paid, W - 19);
    const empresaNombre = clean(recibo.empresa?.razon_social || recibo.empresa?.nombre || 'MotoFlow');
    const dir1 = clean(recibo.empresa?.direccion1);
    const dir2 = clean(recibo.empresa?.direccion2);
    const tel = clean(recibo.empresa?.telefono);
    const rnc = clean(recibo.empresa?.rnc);
    const docs = recibo.facturas.filter((f) => Number(f.abono || 0) > 0);
    const balanceAnteriorTicket = Number(recibo.balanceAnterior ?? recibo.totalBalance ?? 0);
    const balanceActualTicket = Number(
      recibo.balanceActual ?? Math.max(0, balanceAnteriorTicket - Number(recibo.totalPago || 0))
    );

    let t = '```\n';
    t += center(empresaNombre) + '\n';
    if (dir1) t += center(dir1) + '\n';
    if (dir2) t += center(dir2) + '\n';
    if (tel) t += center(tel) + '\n';
    if (rnc) t += center(`RNC: ${rnc}`) + '\n';
    t += center('RECIBO DE INGRESO') + '\n\n';
    t += leftRight(`No. Recibo: ${clean(recibo.numero)}`, recibo.fecha) + '\n';
    t += `CLIENTE: ${clean(recibo.cliente?.nombre || 'CLIENTE').toUpperCase()}\n`;
    t += '-'.repeat(W) + '\n';
    t += 'FACTURAS ABONADAS:\n';
    t += docRow('REFER.', 'BALANCE', 'MONTO PAGADO') + '\n';
    docs.forEach((f) => {
      t += docRow(f.numero || f.referencia || 'DOC', fmt(f.monto_pendiente), fmt(f.abono)) + '\n';
    });
    t += '-'.repeat(W) + '\n';
    t += 'DETALLE DE PAGO:\n';
    if (recibo.formaPago.forma === 'Tarjeta') {
      t += leftRight(
        clean(recibo.formaPago.referencia)
          ? `TARJETA (${clean(recibo.formaPago.referencia)})`
          : 'TARJETA',
        fmt(recibo.formaPago.monto)
      ) + '\n';
    } else if (recibo.formaPago.forma === 'Transferencia') {
      t += leftRight(
        clean(recibo.formaPago.referencia)
          ? `TRANSFERENCIA (${clean(recibo.formaPago.referencia)})`
          : 'TRANSFERENCIA',
        fmt(recibo.formaPago.monto)
      ) + '\n';
    } else {
      t += leftRight('EFECTIVO', fmt(recibo.formaPago.monto)) + '\n';
    }
    if (recibo.formaPago.banco) t += `BANCO: ${clean(recibo.formaPago.banco)}\n`;
    if (recibo.formaPago.observaciones) t += `${clean(recibo.formaPago.observaciones)}\n`;
    t += '-'.repeat(W) + '\n';
    t += leftRight('Balance Anterior:', fmt(balanceAnteriorTicket)) + '\n';
    t += leftRight('TOTAL PAGADO:', fmt(recibo.totalPago)) + '\n';
    t += leftRight('Balance Actual:', fmt(balanceActualTicket)) + '\n';
    t += '\n\n';
    t += center('________________________') + '\n';
    t += center('Firma') + '\n';
    t += center('*** GRACIAS POR SU PAGO ***') + '\n';
    t += center('Motoflow Mobile') + '\n';
    t += '```';
    return t;
  };

  const buildFacturaTexto = (f: any) => {
    if (!f) return '';
    const W = 36;
    const fmt = (n: number) => Number(n || 0).toFixed(2);
    const clean = (value?: string | null) => String(value || '').replace(/[^\x20-\x7E]/g, '').trim();
    const center = (s: string) => {
      const text = clean(s);
      const pad = Math.max(0, Math.floor((W - text.length) / 2));
      return ' '.repeat(pad) + text;
    };
    const labelVal = (label: string, value: string) => {
      const v = clean(value);
      const spaces = Math.max(1, W - label.length - v.length);
      return label + ' '.repeat(spaces) + v;
    };
    const fecha = f.fecha instanceof Date ? f.fecha : new Date(f.fecha || Date.now());
    const fechaStr = Number.isNaN(fecha.getTime()) ? todayISO() : fecha.toLocaleDateString('es-DO');
    const horaStr = Number.isNaN(fecha.getTime()) ? '' : fecha.toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit' });
    const numStr = f.numero ? `FT-${String(f.numero).padStart(7, '0').slice(-7)}` : `FT-${String(f.id || '0').replace(/[^0-9]/g, '').padStart(7, '0').slice(-7)}`;
    const empresaNombre = clean(empresa?.razon_social || empresa?.nombre || 'MotoFlow');
    const dir1 = clean(empresa?.direccion1 || 'Av. Duarte , esq. Baldemiro Rijo,');
    const dir2 = clean(empresa?.direccion2 || 'Higuey, Rep. Dom.');
    const tel = clean(empresa?.telefono || '809-390-5965');
    const sep = '-'.repeat(W);
    const sep2 = '='.repeat(W);
    const CANT_W = 8;
    const PRECIO_W = 7;
    const ITBIS_W = 7;
    const MONTO_W = W - CANT_W - PRECIO_W - ITBIS_W;

    let t = '```\n';
    t += center(empresaNombre) + '\n';
    if (dir1) t += center(dir1) + '\n';
    if (dir2) t += center(dir2) + '\n';
    if (tel) t += center(tel) + '\n';
    t += '\n';
    t += center('FACTURA') + '\n';
    t += labelVal(`Numero  : ${numStr}`, horaStr) + '\n';
    t += `Fecha   : ${fechaStr}\n`;
    t += `Vence   : CONTADO\n`;
    t += `Cliente : ${clean(f.cliente || cliente?.nombre || 'CLIENTE GENERICO')}\n`;
    t += `Direccion N/A\n`;
    t += `Tel.    : ${clean(f.clienteTel || cliente?.telefono || 'N/A')}\n`;
    t += '\n';
    t += sep + '\n';
    t += 'Descripcion de la Mercancia\n';
    t += sep + '\n';
    t += 'CANT'.padEnd(CANT_W) + 'PRECIO'.padStart(PRECIO_W) + 'ITBIS'.padStart(ITBIS_W) + 'MONTO'.padStart(MONTO_W) + '\n';
    t += sep + '\n\n';

    let subtotal = 0;
    let itbisTotal = 0;
    (f.items || []).forEach((it: any) => {
      const importe = Number(it.importe) || 0;
      const itbis = Number(it.itbis || 0);
      subtotal += importe;
      itbisTotal += itbis;
      t += `${clean(it.descripcion || 'Articulo')}\n`;
      t += `${it.cantidad || 0} UND`.padEnd(CANT_W)
        + fmt(it.precio).padStart(PRECIO_W)
        + fmt(itbis).padStart(ITBIS_W)
        + (fmt(importe) + ' E').padStart(MONTO_W)
        + '\n';
    });

    t += '\n';
    t += labelVal('              Sub-Total :', fmt(subtotal)) + '\n';
    t += labelVal('       Descuento en Items:', '0.00') + '\n';
    t += labelVal('         Otros Descuento :', '0.00') + '\n';
    t += labelVal('                 Recargo :', '0.00') + '\n';
    t += labelVal('Valores en         ITBIS :', fmt(itbisTotal)) + '\n';
    t += 'DOP    ' + '='.repeat(W - 7) + '\n';
    t += labelVal('                  TOTAL :', fmt(f.total)) + '\n';
    t += sep2 + '\n\n';
    t += labelVal('Pagado :', fmt(f.efectivo || f.pagado || 0)) + '\n';
    t += labelVal('Cambio :', fmt(f.devuelto || f.cambio || 0)) + '\n\n';
    t += 'Le Atendio : N/A\n';
    t += `Vendedor   : ${empresaNombre}\n\n`;
    t += center('*** GRACIAS POR SU COMPRA ***') + '\n';
    t += '```';
    return t;
  };

  const cerrarReciboPreview = async () => {
    if (reciboGuardado) {
      setReciboGuardado(null);
      await resetForm();
      return;
    }
    setReciboPreview(null);
  };

  const handleSave = async () => {
    if (!cliente) {
      Alert.alert('Cliente requerido', 'Seleccione un cliente para registrar el recibo.');
      return;
    }
    if (montoNum <= 0) {
      Alert.alert('Monto requerido', 'Ingrese el monto pagado por el cliente.');
      return;
    }
    if (totalAbonos <= 0) {
      Alert.alert('Sin documentos', 'Seleccione al menos una factura con balance pendiente.');
      return;
    }
    if (Math.abs(totalAbonos - montoNum) > 0.01) {
      Alert.alert(
        'Monto sin aplicar',
        `El monto aplicado es ${money(totalAbonos)}. Ajuste documentos o monto antes de grabar.`
      );
      return;
    }
    if ((formaPago === 'Transferencia' || formaPago === 'Tarjeta') && !referencia.trim()) {
      Alert.alert('Referencia requerida', 'Ingrese la referencia de pago.');
      return;
    }

    setSaving(true);
    try {
      const savedNumber = await crearReciboIngreso({
        tenantId,
        clienteId: cliente.id,
        fecha,
        totalAbonos,
        formasPago: [
          {
            id: 1,
            forma: formaPago,
            monto: totalAbonos,
            referencia: referencia.trim(),
            banco: banco.trim(),
            fecha: fechaPago,
            observaciones: observaciones.trim(),
          },
        ],
        facturas,
      });
      const numeroFinal = savedNumber || numero;
      if (savedNumber) setNumero(savedNumber);
      setReciboGuardado({
        numero: numeroFinal,
        fecha,
        cliente,
        empresa,
        facturas: facturas.map((f) => ({ ...f })),
        balanceAnterior,
        balanceActual,
        totalBalance: balanceAnterior,
        totalPago: totalAbonos,
        formaPago: {
          id: 1,
          forma: formaPago,
          monto: totalAbonos,
          referencia: referencia.trim(),
          banco: banco.trim(),
          fecha: fechaPago,
          observaciones: observaciones.trim(),
        },
      });
    } catch (error: any) {
      Alert.alert('Error al guardar', error?.message || 'No se pudo guardar el recibo.');
    } finally {
      setSaving(false);
    }
  };

  const imprimirReciboGuardado = async () => {
    if (!activeReciboPreview) return;

    setImprimiendo(true);
    try {
      const saved = await getSavedPrinter();
      if (!saved) {
        Alert.alert(
          'Sin impresora',
          'Aun no has vinculado una impresora Bluetooth. Ve a Mas -> Impresora para configurarla.',
          [
            { text: 'Cancelar', style: 'cancel' },
            { text: 'Configurar', onPress: () => router.push('/configuracion/impresora' as any) },
          ]
        );
        return;
      }
      await printReciboIngreso(activeReciboPreview);
    } catch (error: any) {
      Alert.alert('No se pudo imprimir', error?.message || 'Verifique la impresora Bluetooth.');
    } finally {
      setImprimiendo(false);
    }
  };

  const compartirReciboGuardado = async () => {
    if (!activeReciboPreview || compartiendo) return;
    if (!ticketRef.current) {
      Alert.alert('Error', 'La vista del recibo aun no esta lista para compartir.');
      return;
    }

    setCompartiendo(true);
    try {
      const uri = await captureRef(ticketRef.current, {
        format: 'jpg',
        quality: 0.95,
        result: 'tmpfile',
      });
      const disponible = await Sharing.isAvailableAsync();
      if (!disponible) {
        Alert.alert('No disponible', 'Compartir no esta disponible en este dispositivo.');
        return;
      }
      await Sharing.shareAsync(uri, {
        mimeType: 'image/jpeg',
        dialogTitle: `Recibo ${activeReciboPreview.numero}`,
        UTI: 'public.jpeg',
      });
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'No se pudo compartir el recibo.');
    } finally {
      setCompartiendo(false);
    }
  };

  const loadReprintDocuments = async (
    tab = reprintTab,
    startDate = reprintStartDate,
    endDate = reprintEndDate
  ) => {
    if (!cliente) return;
    setReprintLoading(true);
    try {
      if (tab === 'facturas') {
        let rows = await fetchFacturasEmitidasCliente(cliente.id, startDate, endDate);

        const rowIds = new Set(rows.map((f) => f.id));
        const pendingInRange = facturas.filter((f) => dateInRange(f.fecha, startDate, endDate) && !rowIds.has(f.id));
        if (pendingInRange.length > 0) {
          const hydratedRows = await fetchFacturasEmitidasPorIds(pendingInRange.map((f) => f.id));
          const hydratedById = new Map(hydratedRows.map((f) => [f.id, f]));
          const fallbackRows = pendingInRange.map((f) => {
            const hydrated = hydratedById.get(f.id);
            const numero = hydrated?.numero || f.numero || f.referencia?.replace(/^FT-/, '');
            return {
              ...(hydrated || {}),
              id: f.id,
              numero: typeof numero === 'string' ? numero.replace(/^FT-/, '') : numero,
              fecha: hydrated?.fecha || f.fecha,
              created_at: hydrated?.created_at || f.fecha,
              total: hydrated?.total || f.total || f.monto_pendiente,
              monto_pendiente: hydrated?.monto_pendiente ?? f.monto_pendiente ?? 0,
              monto_pagado: hydrated?.monto_pagado ?? Math.max(0, Number(hydrated?.total || f.total || f.monto_pendiente || 0) - Number(hydrated?.monto_pendiente ?? f.monto_pendiente ?? 0)),
              clientes: hydrated?.clientes || cliente,
              facturas_detalle: hydrated?.facturas_detalle || [],
            };
          });
          rows = [...rows, ...fallbackRows];
        }

        setReprintFacturas(rows);
      } else {
        const rows = await fetchRecibosEmitidosCliente(cliente.id, startDate, endDate);
        setReprintRecibos(rows);
      }
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'No se pudieron cargar los documentos.');
    } finally {
      setReprintLoading(false);
    }
  };

  const openReprintModal = async () => {
    if (!cliente) {
      Alert.alert('Cliente requerido', 'Seleccione un cliente para reimprimir sus facturas o recibos.');
      return;
    }
    const endDate = todayISO();
    const startDate = daysAgoISO(15);
    setReprintStartDate(startDate);
    setReprintEndDate(endDate);
    setReprintTab('facturas');
    setReprintModalOpen(true);
    await loadReprintDocuments('facturas', startDate, endDate);
  };

  const ensurePrinterReady = async () => {
    const saved = await getSavedPrinter();
    if (saved) return true;
    Alert.alert(
      'Sin impresora',
      'Aun no has vinculado una impresora Bluetooth. Ve a Mas -> Impresora para configurarla.',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Configurar', onPress: () => router.push('/configuracion/impresora' as any) },
      ]
    );
    return false;
  };

  const toFacturaPreviewData = (facturaParaImprimir: FacturaEmitidaRecibo) => {
    return {
      id: facturaParaImprimir.id,
      numero: facturaParaImprimir.numero,
      fecha: facturaParaImprimir.fecha || facturaParaImprimir.created_at,
      rnc: facturaParaImprimir.clientes?.rnc,
      cliente: facturaParaImprimir.manual_cliente_nombre || facturaParaImprimir.clientes?.nombre || cliente?.nombre,
      clienteTel: facturaParaImprimir.clientes?.telefono || cliente?.telefono,
      formaPago: facturaParaImprimir.tipo_pago || facturaParaImprimir.forma_pago,
      efectivo: facturaParaImprimir.monto_pagado,
      total: Number(facturaParaImprimir.total || 0),
      items: (facturaParaImprimir.facturas_detalle || []).map((item) => {
        const cantidad = Number(item.cantidad || 0);
        const importe = Number(item.importe || 0);
        return {
          descripcion: item.descripcion || item.codigo || 'Articulo',
          cantidad,
          unidad: 'UND',
          precio: Number(item.precio || (cantidad > 0 ? importe / cantidad : 0)),
          itbis: Number(item.itbis || 0),
          importe,
        };
      }),
    };
  };

  const hydrateFacturaPreviewData = async (factura: FacturaEmitidaRecibo) => {
    const [hydrated] = await fetchFacturasEmitidasPorIds([factura.id]);
    if (!hydrated) return toFacturaPreviewData(factura);

    return toFacturaPreviewData({
      ...factura,
      ...hydrated,
      fecha: hydrated.fecha || factura.fecha,
      created_at: hydrated.created_at || factura.created_at,
      clientes: hydrated.clientes || factura.clientes,
      facturas_detalle: hydrated.facturas_detalle || factura.facturas_detalle,
    });
  };

  const reprintFactura = async (factura: FacturaEmitidaRecibo) => {
    setReprintPrintingId(factura.id);
    setFacturaPreview(toFacturaPreviewData(factura));
    setReprintPrintingId(null);

    if (factura.facturas_detalle && factura.facturas_detalle.length > 0) return;

    try {
      const hydratedPreview = await hydrateFacturaPreviewData(factura);
      setFacturaPreview((current: any) => (
        current?.id === factura.id ? hydratedPreview : current
      ));
    } catch (error: any) {
      console.warn('[ReciboIngreso] No se pudo completar la factura:', error?.message);
    }
  };

  const imprimirFacturaPreview = async () => {
    if (!facturaPreview) return;
    setImprimiendo(true);
    try {
      if (!(await ensurePrinterReady())) return;
      await printFacturaPos(facturaPreview);
    } catch (error: any) {
      Alert.alert('No se pudo imprimir', error?.message || 'Verifique la impresora Bluetooth.');
    } finally {
      setImprimiendo(false);
    }
  };

  const compartirFacturaPreview = async () => {
    if (!facturaPreview || compartiendo) return;
    if (!facturaTicketRef.current) {
      Alert.alert('Error', 'La vista de la factura aun no esta lista para compartir.');
      return;
    }
    setCompartiendo(true);
    try {
      const uri = await captureRef(facturaTicketRef.current, {
        format: 'jpg',
        quality: 0.95,
        result: 'tmpfile',
      });
      const disponible = await Sharing.isAvailableAsync();
      if (!disponible) {
        Alert.alert('No disponible', 'Compartir no esta disponible en este dispositivo.');
        return;
      }
      await Sharing.shareAsync(uri, {
        mimeType: 'image/jpeg',
        dialogTitle: `Factura ${facturaPreview.numero || ''}`,
        UTI: 'public.jpeg',
      });
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'No se pudo compartir la factura.');
    } finally {
      setCompartiendo(false);
    }
  };

  const reprintRecibo = async (row: ReciboEmitido) => {
    setReprintPrintingId(row.id);
    try {
      const formas = Array.isArray(row.formas_pago) ? row.formas_pago : [];
      const forma = formas[0] || {
        id: 1,
        forma: 'Efectivo',
        monto: Number(row.monto_pagado || 0),
        referencia: '',
        banco: '',
        fecha: row.fecha || reprintEndDate,
        observaciones: '',
      };
      const facturasRecibo = (row.recibos_ingreso_detalle || []).map((detalle) => {
        const abonado = Number(detalle.monto_abonado || 0);
        return {
          id: detalle.factura_id || detalle.id || `${row.id}-${abonado}`,
          numero: detalle.facturas?.numero ? `FT-${detalle.facturas.numero}` : 'DOC',
          referencia: detalle.facturas?.numero ? `FT-${detalle.facturas.numero}` : 'DOC',
          fecha: row.fecha,
          total: Number(detalle.facturas?.total || abonado),
          monto_pendiente: Number(detalle.facturas?.total || abonado),
          abono: abonado,
          selected: true,
        };
      });
      let currentClientBalance = 0;
      const receiptClientId = row.clientes?.id || cliente?.id;
      if (receiptClientId) {
        try {
          const datos = await fetchDatosClienteRecibo(receiptClientId);
          currentClientBalance = Number(datos.balance_anterior || 0);
        } catch {
          currentClientBalance = Math.max(
            0,
            facturasRecibo.reduce((sum, f) => sum + Number(f.monto_pendiente || 0), 0) - Number(row.monto_pagado || 0)
          );
        }
      }
      const totalPagoRecibo = Number(row.monto_pagado || 0);
      setReciboPreview({
        numero: row.numero || '',
        fecha: compactDate(row.fecha),
        cliente: row.clientes || cliente,
        empresa,
        facturas: facturasRecibo,
        balanceAnterior: currentClientBalance + totalPagoRecibo,
        balanceActual: currentClientBalance,
        totalBalance: currentClientBalance + totalPagoRecibo,
        totalPago: totalPagoRecibo,
        formaPago: {
          id: Number(forma.id || 1),
          forma: forma.forma || 'Efectivo',
          monto: Number(forma.monto || row.monto_pagado || 0),
          referencia: forma.referencia || '',
          banco: forma.banco || '',
          fecha: forma.fecha || row.fecha || reprintEndDate,
          observaciones: forma.observaciones || '',
        },
      });
    } catch (error: any) {
      Alert.alert('No se pudo abrir', error?.message || 'No se pudo preparar el recibo.');
    } finally {
      setReprintPrintingId(null);
    }
  };

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-gray-50">
        <ActivityIndicator color="#1d4ed8" size="large" />
        <Text className="mt-3 text-gray-500 font-semibold">Cargando recibo...</Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-gray-100">
      <View className="bg-blue-800 pt-12 pb-3 px-3">
        <View className="flex-row items-center">
          <TouchableOpacity onPress={() => router.back()} className="p-2 mr-1">
            <ArrowLeft color="white" size={24} />
          </TouchableOpacity>
          <View className="flex-1">
            <Text className="text-white text-xl font-black">Recibo de pago</Text>
            <Text className="text-blue-100 text-xs font-semibold">Num. {numero || 'Generando...'}</Text>
          </View>
          <View className="flex-row items-center bg-white/15 rounded-full px-3 py-1">
            <Check color="#86efac" size={16} />
            <Text className="text-white font-bold ml-1">Activo</Text>
          </View>
        </View>
      </View>

      <ScrollView className="flex-1" keyboardShouldPersistTaps="handled">
        <View className="bg-white mx-3 mt-3 rounded-2xl border border-gray-200 overflow-hidden">
          <View className="p-4 border-b border-gray-100">
            <Text className="text-blue-800 text-xs font-black uppercase mb-1">Fecha</Text>
            <TextInput
              value={fecha}
              onChangeText={setFecha}
              className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-3 text-gray-900 font-bold"
              placeholder="YYYY-MM-DD"
            />
          </View>

          <TouchableOpacity
            className="p-4 border-b border-gray-100 flex-row items-center"
            onPress={() => setClienteModalOpen(true)}
          >
            <View className="bg-blue-50 p-2 rounded-lg mr-3">
              <User color="#1d4ed8" size={22} />
            </View>
            <View className="flex-1">
              <Text className="text-blue-800 text-xs font-black uppercase">Cliente</Text>
              <Text className="text-gray-900 text-base font-black" numberOfLines={2}>
                {cliente?.nombre || 'Seleccionar cliente'}
              </Text>
              {cliente?.telefono ? <Text className="text-gray-500 text-xs">{cliente.telefono}</Text> : null}
            </View>
            <ChevronRight color="#94a3b8" size={20} />
          </TouchableOpacity>

          <View className="p-4">
            <Text className="text-blue-800 text-xs font-black uppercase mb-1">Monto</Text>
            <View className="flex-row items-center">
              <TextInput
                value={monto}
                onChangeText={handleMontoChange}
                keyboardType="decimal-pad"
                className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-3 py-3 text-right text-xl font-black text-gray-900"
                placeholder="0.00"
              />
              <TouchableOpacity
                className="ml-2 bg-gray-200 border border-gray-300 rounded-xl px-4 py-4"
                onPress={() => setDocsModalOpen(true)}
                disabled={!cliente}
              >
                <Text className="font-bold text-gray-800">Sel. Doc</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        <View className="mx-3 mt-3 flex-row">
          <View className="flex-1 bg-white rounded-xl p-3 border border-gray-200 mr-2">
            <Text className="text-[10px] text-gray-500 font-black uppercase">Balance</Text>
            <Text className="text-lg text-gray-900 font-black">{money(balanceAnterior)}</Text>
          </View>
          <View className="flex-1 bg-white rounded-xl p-3 border border-gray-200 mr-2">
            <Text className="text-[10px] text-gray-500 font-black uppercase">Monto pago</Text>
            <Text className="text-lg text-emerald-700 font-black">{money(totalAbonos)}</Text>
          </View>
          <View className="flex-1 bg-white rounded-xl p-3 border border-gray-200">
            <Text className="text-[10px] text-gray-500 font-black uppercase">Restante</Text>
            <Text className="text-lg text-blue-800 font-black">{money(balanceActual)}</Text>
          </View>
        </View>

        <View className="mx-3 mt-3 bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <View className="bg-blue-50 px-3 py-2 flex-row">
            <Text className="w-20 text-blue-900 font-black text-xs">ID Doc.</Text>
            <Text className="w-14 text-blue-900 font-black text-xs">Fecha</Text>
            <Text className="flex-1 text-right text-blue-900 font-black text-xs pr-2">Balance</Text>
            <Text className="w-28 text-right text-blue-900 font-black text-xs">Monto pago</Text>
          </View>

          {clientLoading ? (
            <View className="py-8 items-center">
              <Loader2 color="#64748b" size={22} />
              <Text className="text-gray-500 mt-2">Cargando documentos...</Text>
            </View>
          ) : facturasSeleccionadas.length === 0 ? (
            <View className="py-10 items-center px-6">
              <FileText color="#cbd5e1" size={34} />
              <Text className="text-gray-500 font-semibold text-center mt-2">
                {cliente ? 'Presione Sel. Doc y seleccione las facturas a pagar.' : 'Seleccione un cliente para ver documentos.'}
              </Text>
            </View>
          ) : (
            facturasSeleccionadas.map((f) => (
              <View
                key={f.id}
                className="px-3 py-2 border-t border-gray-200 flex-row items-center bg-white"
              >
                <View className="w-20">
                  <Text className="font-black text-gray-900" numberOfLines={1}>{f.numero || f.referencia || 'DOC'}</Text>
                </View>
                <Text className="w-14 text-gray-600 font-bold">{dayMonth(f.fecha)}</Text>
                <Text className="flex-1 text-right text-gray-800 font-bold pr-2">{money(f.monto_pendiente)}</Text>
                <Text className="w-28 text-right text-emerald-700 font-black">{money(f.abono)}</Text>
              </View>
            ))
          )}

          {facturasSeleccionadas.length > 0 ? (
            <View className="px-3 py-3 border-t border-gray-300 bg-gray-50 flex-row items-center">
              <Text className="w-20 text-blue-900 font-black">Totales</Text>
              <Text className="w-14" />
              <Text className="flex-1 text-right text-gray-900 font-black pr-2">{money(totalBalanceSeleccionado)}</Text>
              <Text className="w-28 text-right text-gray-900 font-black">{money(totalAbonos)}</Text>
            </View>
          ) : null}
        </View>

        <View className="mx-3 mt-3 bg-white rounded-2xl border border-gray-200 p-4 flex-row items-center">
          <View className="flex-1">
            <Text className="text-blue-800 text-xs font-black uppercase">Forma de pago</Text>
            <Text className="text-gray-900 font-black text-base">{formaPago}</Text>
            {referencia ? <Text className="text-gray-500 text-xs">Ref. {referencia}</Text> : null}
          </View>
          <TouchableOpacity className="bg-gray-200 border border-gray-400 rounded-xl px-4 py-3" onPress={() => setPaymentModalOpen(true)}>
            <Text className="text-gray-800 font-black">Pago</Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: 96 + Math.max(insets.bottom, 16) }} />
      </ScrollView>

      <View
        className="bg-white border-t border-gray-300 px-2 pt-2 flex-row"
        style={{ paddingBottom: Math.max(insets.bottom, 16) }}
      >
        <TouchableOpacity className="flex-1 bg-gray-200 border border-gray-400 rounded-xl py-3 items-center mr-1" onPress={openReprintModal}>
          <Text className="text-gray-800 font-black">Reimprimir</Text>
        </TouchableOpacity>
        <TouchableOpacity
          className={`flex-1 border border-gray-400 rounded-xl py-3 items-center mx-1 ${saving ? 'bg-blue-300' : 'bg-gray-200'}`}
          onPress={handleSave}
          disabled={saving}
        >
          <Text className="text-gray-800 font-black">{saving ? 'Guardando...' : 'Guardar'}</Text>
        </TouchableOpacity>
        <TouchableOpacity className="flex-1 bg-gray-200 border border-gray-400 rounded-xl py-3 items-center ml-1" onPress={resetForm}>
          <Text className="text-gray-800 font-black">Cancelar</Text>
        </TouchableOpacity>
      </View>

      <Modal visible={clienteModalOpen} animationType="slide" onRequestClose={() => setClienteModalOpen(false)}>
        <View className="flex-1 bg-gray-50">
          <View className="bg-blue-800 pt-12 pb-4 px-4 flex-row items-center">
            <TouchableOpacity onPress={() => setClienteModalOpen(false)} className="p-2 mr-2">
              <X color="white" size={24} />
            </TouchableOpacity>
            <Text className="text-white text-xl font-black">Seleccionar cliente</Text>
          </View>
          <View className="p-4">
            <View className="bg-white border border-gray-200 rounded-xl px-3 flex-row items-center">
              <Search color="#64748b" size={20} />
              <TextInput
                value={clienteSearch}
                onChangeText={setClienteSearch}
                placeholder="Buscar por nombre, RNC o telefono"
                className="flex-1 py-3 ml-2 text-gray-900"
                autoFocus
              />
            </View>
          </View>
          <FlatList
            data={clientes}
            keyExtractor={(item) => item.id}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
            renderItem={({ item }) => (
              <TouchableOpacity
                className="bg-white border border-gray-200 rounded-xl p-4 mb-2 flex-row items-center"
                onPress={() => selectCliente(item)}
              >
                <View className="bg-blue-50 p-2 rounded-lg mr-3">
                  <User color="#1d4ed8" size={21} />
                </View>
                <View className="flex-1">
                  <Text className="font-black text-gray-900">{item.nombre}</Text>
                  <Text className="text-gray-500 text-xs">{item.rnc || item.telefono || 'Sin RNC'}</Text>
                </View>
              </TouchableOpacity>
            )}
          />
        </View>
      </Modal>

      <Modal visible={docsModalOpen} transparent animationType="fade" onRequestClose={() => setDocsModalOpen(false)}>
        <View className="flex-1 bg-black/40 justify-end">
          <View className="bg-white rounded-t-3xl max-h-[75%] p-4">
            <View className="flex-row items-center mb-3">
              <View className="bg-blue-50 p-2 rounded-lg mr-2">
                <Receipt color="#1d4ed8" size={21} />
              </View>
              <Text className="flex-1 text-lg font-black text-gray-900">Documentos pendientes</Text>
              <TouchableOpacity onPress={() => setDocsModalOpen(false)} className="p-2">
                <X color="#64748b" size={22} />
              </TouchableOpacity>
            </View>
            <ScrollView
              contentContainerStyle={{ paddingBottom: 20 }}
              keyboardShouldPersistTaps="handled"
            >
              <View className="border border-slate-300 overflow-hidden">
                <View className="bg-blue-800 px-2 py-1">
                  <Text className="text-white font-black text-base">Selección de documentos</Text>
                </View>
                <View className="bg-slate-100 flex-row border-b border-slate-300 py-1">
                  <Text className="w-[19%] text-blue-900 font-black text-xs">ID Doc.</Text>
                  <Text className="w-[22%] text-blue-900 font-black text-xs">Fecha</Text>
                  <Text className="w-[24%] text-right text-blue-900 font-black text-xs">Monto orig.</Text>
                  <Text className="w-[24%] text-right text-blue-900 font-black text-xs">Balance</Text>
                  <Text className="w-[11%] text-right text-blue-900 font-black text-xs">Dias</Text>
                </View>
                {facturas.length === 0 ? (
                  <View className="py-8 items-center">
                    <Text className="text-slate-500 font-semibold">No hay documentos pendientes.</Text>
                  </View>
                ) : (
                  facturas.map((f) => (
                    <TouchableOpacity
                      key={f.id}
                      className={`flex-row border-b border-slate-300 py-1 ${f.selected ? 'bg-blue-50' : 'bg-white'}`}
                      onPress={() => toggleFactura(f.id)}
                    >
                      <Text className="w-[19%] text-slate-900 font-bold text-xs" numberOfLines={1}>
                        {f.numero || f.referencia || 'DOC'}
                      </Text>
                      <Text className="w-[22%] text-slate-900 font-bold text-xs">{compactDate(f.fecha)}</Text>
                      <Text className="w-[24%] text-right text-slate-900 font-bold text-xs">
                        {plainMoney(Number(f.total || f.monto_pendiente))}
                      </Text>
                      <Text className="w-[24%] text-right text-slate-900 font-bold text-xs">
                        {plainMoney(f.monto_pendiente)}
                      </Text>
                      <Text className="w-[11%] text-right text-slate-900 font-bold text-xs">{daysSince(f.fecha)}</Text>
                    </TouchableOpacity>
                  ))
                )}
              </View>

              <View className="mt-6 flex-row items-center justify-end">
                <Text className="text-blue-900 font-black text-lg mr-3">Total adeudado:</Text>
                <View className="border border-slate-300 bg-slate-50 min-w-[150px] px-3 py-2">
                  <Text className="text-right text-slate-900 font-black text-lg">{plainMoney(balanceAnterior)}</Text>
                </View>
              </View>
            </ScrollView>
            <View
              className="pt-3 border-t border-gray-200 bg-white"
              style={{ paddingBottom: Math.max(insets.bottom, 18) }}
            >
              <TouchableOpacity className="bg-blue-800 rounded-2xl py-4 items-center" onPress={confirmDocsSelection}>
                <Text className="text-white font-black">Listo</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={paymentModalOpen} animationType="slide" onRequestClose={() => setPaymentModalOpen(false)}>
        <View className="flex-1 bg-white">
          <View className="bg-blue-800 pt-10 pb-1 px-2 flex-row items-center">
            <Text className="flex-1 text-white font-black text-lg">Forma de Pago</Text>
            <Text className="text-white font-black text-base">Monto {plainMoney(totalAbonos || montoNum)}</Text>
          </View>

          <ScrollView
            className="flex-1 px-3 pt-3"
            contentContainerStyle={{ paddingBottom: 24 }}
            keyboardShouldPersistTaps="handled"
          >
            {[
              { value: 'Efectivo', label: 'Efectivo' },
              { value: 'Transferencia', label: 'Transf/Depósito' },
              { value: 'Tarjeta', label: 'Pago con tarjeta' },
            ].map((option) => {
              const selected = formaPago === option.value;
              return (
                <View key={option.value} className="mb-5">
                  <TouchableOpacity className="flex-row items-center" onPress={() => setFormaPago(option.value)}>
                    <View className="w-9 h-9 border border-gray-500 bg-gray-50 items-center justify-center mr-2">
                      {selected ? <Check color="#22c55e" size={28} strokeWidth={4} /> : null}
                    </View>
                    <Text className="text-blue-900 font-black text-lg">{option.label}</Text>
                  </TouchableOpacity>

                  {selected && option.value !== 'Efectivo' ? (
                    <View className="mt-3 ml-1">
                      <View className="flex-row items-center mb-2">
                        <Text className="text-blue-900 font-black text-base mr-2">Banco</Text>
                        <TextInput
                          value={banco}
                          onChangeText={setBanco}
                          placeholder="SELECCIONE"
                          className="flex-1 border border-gray-300 bg-gray-100 px-3 py-2 text-gray-900 font-semibold"
                        />
                      </View>

                      <View className="flex-row items-center mb-2">
                        <Text className="text-blue-900 font-black text-base mr-2">
                          {option.value === 'Tarjeta' ? 'Aut./Ref.' : 'Referencia'}
                        </Text>
                        <TextInput
                          value={referencia}
                          onChangeText={setReferencia}
                          placeholder={option.value === 'Tarjeta' ? 'No. autorización' : 'Referencia'}
                          className="flex-1 border border-orange-400 bg-white px-3 py-2 text-gray-900 font-semibold"
                        />
                      </View>

                      <View className="flex-row items-center mb-2">
                        <Text className="text-blue-900 font-black text-base mr-2">Monto:</Text>
                        <TextInput
                          value={monto || String(totalAbonos || '')}
                          onChangeText={handleMontoChange}
                          keyboardType="decimal-pad"
                          className="flex-1 border border-gray-200 bg-gray-50 px-3 py-2 text-right text-gray-900 font-bold"
                        />
                        <Text className="text-blue-900 font-black text-base mx-2">Fecha</Text>
                        <TextInput
                          value={fechaPago}
                          onChangeText={setFechaPago}
                          className="w-28 border border-gray-200 bg-gray-50 px-2 py-2 text-gray-900 font-bold"
                          placeholder="YYYY-MM-DD"
                        />
                      </View>
                    </View>
                  ) : null}
                </View>
              );
            })}

            <Text className="text-blue-900 font-black text-base mb-1">Observaciones</Text>
            <TextInput
              value={observaciones}
              onChangeText={setObservaciones}
              multiline
              className="border border-gray-200 bg-gray-50 min-h-24 px-3 py-2 text-gray-900"
              textAlignVertical="top"
            />
          </ScrollView>

          <View
            className="px-3 pt-3 items-end border-t border-gray-200 bg-white"
            style={{ paddingBottom: Math.max(insets.bottom, 18) }}
          >
            <TouchableOpacity
              className="bg-gray-200 border border-gray-500 rounded-xl px-10 py-4 mb-1"
              onPress={() => setPaymentModalOpen(false)}
            >
              <Text className="text-gray-800 font-black">Aceptar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={reprintModalOpen} animationType="slide" onRequestClose={() => setReprintModalOpen(false)}>
        <View className="flex-1 bg-gray-50">
          <View className="bg-blue-800 pt-12 pb-4 px-4 flex-row items-center">
            <TouchableOpacity onPress={() => setReprintModalOpen(false)} className="p-2 mr-2">
              <X color="white" size={24} />
            </TouchableOpacity>
            <View className="flex-1">
              <Text className="text-white text-xl font-black">Reimprimir</Text>
              <Text className="text-blue-100 text-xs font-semibold" numberOfLines={1}>
                {cliente?.nombre || 'Seleccione cliente'}
              </Text>
            </View>
          </View>

          <View className="p-4">
            <View className="flex-row items-center">
              <View className="flex-1 mr-2">
                <Text className="text-blue-800 text-xs font-black uppercase mb-1">Fecha inicial</Text>
                <TextInput
                  value={reprintStartDate}
                  onChangeText={setReprintStartDate}
                  className="bg-white border border-gray-200 rounded-xl px-3 py-3 text-gray-900 font-bold"
                  placeholder="YYYY-MM-DD"
                />
              </View>
              <View className="flex-1 mr-2">
                <Text className="text-blue-800 text-xs font-black uppercase mb-1">Fecha final</Text>
                <TextInput
                  value={reprintEndDate}
                  onChangeText={setReprintEndDate}
                  className="bg-white border border-gray-200 rounded-xl px-3 py-3 text-gray-900 font-bold"
                  placeholder="YYYY-MM-DD"
                />
              </View>
              <TouchableOpacity
                className="bg-gray-200 border border-gray-400 rounded-xl px-4 py-3 mt-5"
                onPress={() => loadReprintDocuments(reprintTab, reprintStartDate, reprintEndDate)}
                disabled={reprintLoading}
              >
                <Text className="text-gray-800 font-black">Buscar</Text>
              </TouchableOpacity>
            </View>

            <View className="mt-4 bg-white border border-gray-200 rounded-xl p-1 flex-row">
              {[
                { value: 'facturas' as const, label: 'Facturas' },
                { value: 'recibos' as const, label: 'Recibos' },
              ].map((option) => {
                const selected = reprintTab === option.value;
                return (
                  <TouchableOpacity
                    key={option.value}
                    className={`flex-1 py-3 rounded-lg items-center ${selected ? 'bg-blue-800' : 'bg-white'}`}
                    onPress={() => {
                      setReprintTab(option.value);
                      loadReprintDocuments(option.value, reprintStartDate, reprintEndDate);
                    }}
                  >
                    <Text className={`font-black ${selected ? 'text-white' : 'text-gray-700'}`}>{option.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          <ScrollView className="flex-1 px-4" contentContainerStyle={{ paddingBottom: 24 }}>
            {reprintLoading ? (
              <View className="py-10 items-center">
                <ActivityIndicator color="#1d4ed8" size="large" />
                <Text className="text-gray-500 font-semibold mt-2">Cargando documentos...</Text>
              </View>
            ) : reprintTab === 'facturas' ? (
              visibleReprintFacturas.length === 0 ? (
                <View className="bg-white rounded-2xl border border-gray-200 py-10 items-center px-6">
                  <FileText color="#cbd5e1" size={34} />
                  <Text className="text-gray-500 font-semibold text-center mt-2">
                    No hay facturas emitidas para este cliente en esa fecha.
                  </Text>
                </View>
              ) : (
                visibleReprintFacturas.map((item) => (
                  <View key={item.id} className="bg-white rounded-2xl border border-gray-200 p-4 mb-3">
                    <View className="flex-row items-center">
                      <View className="flex-1">
                        <Text className="text-blue-800 text-xs font-black uppercase">Factura</Text>
                        <Text className="text-gray-900 text-lg font-black">FT-{item.numero}</Text>
                        <Text className="text-gray-500 text-xs">{compactDate(item.fecha || item.created_at)} · {item.tipo_pago || item.forma_pago || 'Venta'}</Text>
                      </View>
                      <View className="items-end mr-3">
                        <Text className="text-gray-500 text-xs font-black uppercase">Total</Text>
                        <Text className="text-gray-900 font-black">{money(Number(item.total || 0))}</Text>
                      </View>
                      <TouchableOpacity
                        className={`bg-gray-200 border border-gray-400 rounded-xl p-3 ${reprintPrintingId === item.id ? 'opacity-60' : ''}`}
                        onPress={() => reprintFactura(item)}
                        disabled={reprintPrintingId !== null}
                      >
                        {reprintPrintingId === item.id ? <ActivityIndicator color="#374151" /> : <Printer color="#374151" size={20} />}
                      </TouchableOpacity>
                    </View>
                  </View>
                ))
              )
            ) : reprintRecibos.length === 0 ? (
              <View className="bg-white rounded-2xl border border-gray-200 py-10 items-center px-6">
                <Receipt color="#cbd5e1" size={34} />
                <Text className="text-gray-500 font-semibold text-center mt-2">
                  No hay recibos de ingreso emitidos para este cliente en esa fecha.
                </Text>
              </View>
            ) : (
              reprintRecibos.map((item) => (
                <View key={item.id} className="bg-white rounded-2xl border border-gray-200 p-4 mb-3">
                  <View className="flex-row items-center">
                    <View className="flex-1">
                      <Text className="text-blue-800 text-xs font-black uppercase">Recibo de ingreso</Text>
                      <Text className="text-gray-900 text-lg font-black">{item.numero || 'RI'}</Text>
                      <Text className="text-gray-500 text-xs">{compactDate(item.fecha)} · {(item.recibos_ingreso_detalle || []).length} doc.</Text>
                    </View>
                    <View className="items-end mr-3">
                      <Text className="text-gray-500 text-xs font-black uppercase">Monto</Text>
                      <Text className="text-emerald-700 font-black">{money(Number(item.monto_pagado || 0))}</Text>
                    </View>
                    <TouchableOpacity
                      className={`bg-gray-200 border border-gray-400 rounded-xl p-3 ${reprintPrintingId === item.id ? 'opacity-60' : ''}`}
                      onPress={() => reprintRecibo(item)}
                      disabled={reprintPrintingId !== null}
                    >
                      {reprintPrintingId === item.id ? <ActivityIndicator color="#374151" /> : <Printer color="#374151" size={20} />}
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            )}
          </ScrollView>
        </View>
      </Modal>

      <Modal
        visible={facturaPreview !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setFacturaPreview(null)}
      >
        <View className="flex-1 bg-black/60 justify-center items-center px-3">
          <View className="bg-white rounded-2xl w-full max-w-md overflow-hidden" style={{ maxHeight: '90%' }}>
            <View className="px-4 py-3 border-b border-gray-200 flex-row justify-between items-center bg-gray-50">
              <View className="flex-1">
                <Text className="text-[11px] text-gray-500">Factura #{facturaPreview?.numero}</Text>
                <Text className="text-base font-bold text-gray-900">Venta completada</Text>
              </View>
              <TouchableOpacity
                onPress={() => setFacturaPreview(null)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                className="p-1"
              >
                <X color="#6b7280" size={22} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 480 }} contentContainerStyle={{ padding: 0 }}>
              <ViewShot
                ref={facturaTicketRef}
                options={{ format: 'jpg', quality: 0.95 }}
                style={{ backgroundColor: 'white' }}
              >
                <View style={{ padding: 16, backgroundColor: 'white' }}>
                  <Text
                    style={{
                      fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
                      fontSize: 11,
                      color: '#111827',
                      lineHeight: 16,
                    }}
                  >
                    {buildFacturaTexto(facturaPreview)
                      .replace(/^```\n?/, '')
                      .replace(/\n?```$/, '')}
                  </Text>
                </View>
              </ViewShot>
            </ScrollView>

            <View className="flex-row border-t border-gray-200">
              <TouchableOpacity
                className="flex-1 py-4 items-center justify-center active:bg-gray-100"
                onPress={() => setFacturaPreview(null)}
              >
                <Text className="text-gray-700 font-medium">Cerrar</Text>
              </TouchableOpacity>
              <View className="w-px bg-gray-200" />
              <TouchableOpacity
                className={`flex-1 py-4 items-center justify-center flex-row bg-emerald-600 active:opacity-80 ${imprimiendo ? 'opacity-60' : ''}`}
                onPress={imprimirFacturaPreview}
                disabled={imprimiendo || compartiendo}
              >
                <Printer color="white" size={18} />
                <Text className="text-white font-bold ml-2">
                  {imprimiendo ? 'Imprimiendo...' : 'Imprimir'}
                </Text>
              </TouchableOpacity>
              <View className="w-px bg-gray-200" />
              <TouchableOpacity
                className={`flex-1 py-4 items-center justify-center flex-row bg-blue-700 active:opacity-80 ${compartiendo ? 'opacity-60' : ''}`}
                onPress={compartirFacturaPreview}
                disabled={compartiendo || imprimiendo}
              >
                <Share2 color="white" size={18} />
                <Text className="text-white font-bold ml-2">
                  {compartiendo ? 'Generando...' : 'Compartir'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={activeReciboPreview !== null}
        transparent
        animationType="slide"
        onRequestClose={cerrarReciboPreview}
      >
        <View className="flex-1 bg-black/60 justify-center items-center px-3">
          <View className="bg-white rounded-2xl w-full max-w-md overflow-hidden" style={{ maxHeight: '90%' }}>
            <View className="px-4 py-3 border-b border-gray-200 flex-row justify-between items-center bg-gray-50">
              <View className="flex-1">
                <Text className="text-[11px] text-gray-500">Recibo #{activeReciboPreview?.numero}</Text>
                <Text className="text-base font-bold text-gray-900">{reciboGuardado ? 'Recibo guardado' : 'Recibo de ingreso'}</Text>
              </View>
              <TouchableOpacity
                onPress={cerrarReciboPreview}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                className="p-1"
              >
                <X color="#6b7280" size={22} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 480 }} contentContainerStyle={{ padding: 0 }}>
              <ViewShot
                ref={ticketRef}
                options={{ format: 'jpg', quality: 0.95 }}
                style={{ backgroundColor: 'white' }}
              >
                <View style={{ padding: 16, backgroundColor: 'white' }}>
                  <Text
                    style={{
                      fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
                      fontSize: 11,
                      color: '#111827',
                      lineHeight: 16,
                    }}
                  >
                    {buildReciboTexto(activeReciboPreview)
                      .replace(/^```\n?/, '')
                      .replace(/\n?```$/, '')}
                  </Text>
                </View>
              </ViewShot>
            </ScrollView>

            <View className="flex-row border-t border-gray-200">
              <TouchableOpacity
                className="flex-1 py-4 items-center justify-center active:bg-gray-100"
                onPress={cerrarReciboPreview}
              >
                <Text className="text-gray-700 font-medium">Cerrar</Text>
              </TouchableOpacity>
              <View className="w-px bg-gray-200" />
              <TouchableOpacity
                className={`flex-1 py-4 items-center justify-center flex-row bg-emerald-600 active:opacity-80 ${imprimiendo ? 'opacity-60' : ''}`}
                onPress={imprimirReciboGuardado}
                disabled={imprimiendo || compartiendo}
              >
                <Printer color="white" size={18} />
                <Text className="text-white font-bold ml-2">
                  {imprimiendo ? 'Imprimiendo...' : 'Imprimir'}
                </Text>
              </TouchableOpacity>
              <View className="w-px bg-gray-200" />
              <TouchableOpacity
                className={`flex-1 py-4 items-center justify-center flex-row bg-blue-700 active:opacity-80 ${compartiendo ? 'opacity-60' : ''}`}
                onPress={compartirReciboGuardado}
                disabled={compartiendo || imprimiendo}
              >
                <Share2 color="white" size={18} />
                <Text className="text-white font-bold ml-2">
                  {compartiendo ? 'Generando...' : 'Compartir'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
