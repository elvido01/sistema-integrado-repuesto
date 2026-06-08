import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ShieldCheck, Upload, Loader2, FileLock2, Eye, EyeOff, Trash2, BadgeCheck, AlertTriangle, FileCode2, X, Send, FileSignature, Download, FileText } from 'lucide-react';
import { downloadRepresentacionImpresa } from '@/lib/dgiiRepresentacionImpresa';
import DgiiCertificacionRunner from './DgiiCertificacionRunner';
import DgiiAprobacionComercialRunner from './DgiiAprobacionComercialRunner';
import DgiiSimulacionRunner from './DgiiSimulacionRunner';
import DgiiRepresentacionImpresaRunner from './DgiiRepresentacionImpresaRunner';

// Tamano maximo permitido para el .p12 (10 MB; reales son <50KB).
const MAX_P12_BYTES = 10 * 1024 * 1024;

const downloadTextFile = (content, fileName, type = 'application/xml') => {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

const AMBIENTES = [
  { value: 'TesteCF',    label: 'TesteCF — Pruebas iniciales' },
  { value: 'CerteCF',    label: 'CerteCF — Set de 25 pruebas oficiales' },
  { value: 'Produccion', label: 'Produccion — Emision real' },
];

const DgiiCertificadoUploader = () => {
  const { toast } = useToast();
  const { tenantId } = useAuth();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [info, setInfo] = useState(null); // { configured, rnc_emisor, ambiente, ... }

  const [file, setFile] = useState(null);
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [rnc, setRnc] = useState('');
  const [nombre, setNombre] = useState('');
  const [nombreComercial, setNombreComercial] = useState('');
  const [municipio, setMunicipio] = useState('');
  const [provincia, setProvincia] = useState('');
  const [ambiente, setAmbiente] = useState('CerteCF');
  const [callbackUrl, setCallbackUrl] = useState('');
  const [fechaVencimientoSecuencia, setFechaVencimientoSecuencia] = useState('');
  const fileInputRef = useRef(null);

  const fetchInfo = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('emitir-fiscal', {
        body: { action: 'dgii_certificate_info' },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || 'No se pudo cargar la informacion');
      setInfo(data);
      // Pre-rellenar formulario con valores actuales
      setRnc(data.rnc_emisor || '');
      setNombre(data.nombre_emisor || '');
      setNombreComercial(data.nombre_comercial || '');
      setMunicipio(data.municipio || '');
      setProvincia(data.provincia || '');
      setAmbiente(data.ambiente || 'CerteCF');
      setCallbackUrl(data.callback_url || '');
      setFechaVencimientoSecuencia(data.fecha_vencimiento_secuencia || '');
    } catch (err) {
      // No es bloqueante: el tenant puede que aun no haya configurado nada
      console.warn('[DgiiUploader] info:', err.message);
      setInfo({ configured: false });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchInfo(); }, [fetchInfo]);

  // Estado para el visor de XML de prueba
  const [xmlPreview, setXmlPreview] = useState(null); // { xml, encf, tipo_ecf, factura }
  const [generatingXml, setGeneratingXml] = useState(false);

  const downloadXmlPreview = () => {
    if (!xmlPreview?.xml) return;
    const suffix = xmlPreview.firmado ? '_firmado' : '';
    const fileName = `${xmlPreview.encf || 'ecf'}${suffix}.xml`;
    downloadTextFile(xmlPreview.xml, fileName);
  };

  const downloadRiPreview = async () => {
    if (!xmlPreview?.firmado || !xmlPreview?.xml) return;
    try {
      await downloadRepresentacionImpresa(xmlPreview.xml, { fileName: `${xmlPreview.encf || 'ecf'}_RI.pdf`, ambiente: info?.ambiente });
      toast({ title: 'RI generada', description: 'Representacion impresa descargada.' });
    } catch (err) {
      toast({ title: 'No se pudo generar la RI', description: err.message, variant: 'destructive' });
    }
  };

  const handleGenerateTestXml = async (opts = {}) => {
    const sign = !!opts.sign;
    setGeneratingXml(true);
    try {
      // 1. Buscar la factura más reciente del tenant
      const { data: facturas, error: fErr } = await supabase
        .from('facturas')
        .select('id, numero, fecha, total')
        .order('fecha', { ascending: false })
        .limit(1);
      if (fErr) throw fErr;
      if (!facturas?.length) throw new Error('No hay facturas en este tenant para generar XML de prueba');

      const factura = facturas[0];

      // 2. Llamar al edge function — accion segun si firmamos o no
      const { data, error } = await supabase.functions.invoke('emitir-fiscal', {
        body: {
          action: sign ? 'dgii_test_xml_sign' : 'dgii_test_xml_generation',
          factura_id: factura.id,
        },
      });

      // FunctionsHttpError: extraer el body real del error.
      // error.context puede ser un Response object (con .json()) o tener .body como string.
      if (error) {
        let realMessage = error.message;
        console.error('[DgiiUploader] Full error object:', error);
        console.error('[DgiiUploader] error.context:', error.context);
        try {
          // Approach 1: error.context is a Response — read JSON from it
          if (error.context && typeof error.context.json === 'function') {
            const parsed = await error.context.json();
            console.error('[DgiiUploader] Parsed context body:', parsed);
            if (parsed?.error) realMessage = parsed.error;
          }
          // Approach 2: error.context.body is a string
          else if (error.context?.body) {
            const ctxBody = error.context.body;
            const parsed = typeof ctxBody === 'string' ? JSON.parse(ctxBody) : ctxBody;
            console.error('[DgiiUploader] Parsed context.body:', parsed);
            if (parsed?.error) realMessage = parsed.error;
          }
        } catch (parseErr) {
          console.error('[DgiiUploader] Could not parse error body:', parseErr);
        }
        throw new Error(realMessage);
      }
      if (!data?.ok) throw new Error(data?.error || 'No se pudo generar XML');

      setXmlPreview({
        xml: sign ? data.xml_firmado : data.xml,
        xml_sin_firmar: sign ? data.xml_sin_firmar : data.xml,
        xml_firmado: sign ? data.xml_firmado : null,
        encf: data.encf,
        tipo_ecf: data.tipo_ecf,
        factura,
        firmado: sign,
        digest_value: data.digest_value,
        signature_value_preview: data.signature_value_preview,
      });

      if (sign && data.xml_firmado) {
        downloadTextFile(data.xml_firmado, `${data.encf || 'ecf'}_firmado.xml`);
        toast({
          title: 'XML firmado descargado',
          description: `${data.encf || 'e-CF'} se descargo como archivo .xml.`,
        });
      }
    } catch (err) {
      console.error('[DgiiUploader] handleGenerateTestXml error:', err);
      toast({ title: 'Error generando XML', description: err.message || 'Error desconocido', variant: 'destructive' });
    } finally {
      setGeneratingXml(false);
    }
  };

  const externalXmlInputRef = useRef(null);
  const [signingExternal, setSigningExternal] = useState(false);

  const handleSignExternalXml = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.xml')) {
      toast({ title: 'Formato inválido', description: 'Selecciona un archivo .xml', variant: 'destructive' });
      e.target.value = '';
      return;
    }
    setSigningExternal(true);
    try {
      const xml = await file.text();
      const { data, error } = await supabase.functions.invoke('emitir-fiscal', {
        body: { action: 'dgii_sign_external_xml', xml },
      });
      if (error) {
        let msg = error.message;
        try {
          if (error.context?.json) {
            const parsed = await error.context.json();
            if (parsed?.error) msg = parsed.error;
          }
        } catch (_) {}
        throw new Error(msg);
      }
      if (!data?.ok) throw new Error(data?.error || 'No se pudo firmar');

      // Descargar el XML firmado
      const blob = new Blob([data.xml_firmado], { type: 'application/xml' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name.replace(/\.xml$/i, '_firmado.xml');
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      // Descargar tambien el diagnostico (canonical bytes en base64)
      // para verificar offline si la firma es valida.
      if (data._debug?.canonical1_b64) {
        const diag = {
          digest_value: data._debug.digest_value,
          signature_value_preview: data._debug.signature_value_preview,
          xml_input_length: data._debug.xml_input_length,
          xml_firmado_length: data._debug.xml_firmado_length,
          canonical1_b64: data._debug.canonical1_b64,
          canonical1_len: data._debug.canonical1_len,
          canonicalSignedInfo_b64: data._debug.canonicalSignedInfo_b64,
          canonicalSignedInfo_len: data._debug.canonicalSignedInfo_len,
        };
        const diagBlob = new Blob([JSON.stringify(diag, null, 2)], { type: 'application/json' });
        const diagUrl = URL.createObjectURL(diagBlob);
        const da = document.createElement('a');
        da.href = diagUrl;
        da.download = file.name.replace(/\.xml$/i, '_diag.json');
        document.body.appendChild(da);
        da.click();
        document.body.removeChild(da);
        URL.revokeObjectURL(diagUrl);
      }

      toast({ title: '✅ XML firmado', description: 'Descarga iniciada (xml + diag.json). Pegame el contenido del diag.json.' });
    } catch (err) {
      toast({ title: 'Error firmando', description: err.message || 'Error desconocido', variant: 'destructive' });
    } finally {
      setSigningExternal(false);
      e.target.value = '';
    }
  };

  const handleSendToDgii = async () => {
    if (!confirm('¿Enviar la factura mas reciente a DGII (' + (info?.ambiente || 'TesteCF') + ')?\n\nSe firmara con tu .p12, se enviara al ambiente actual y se guardara en documentos_fiscales con su TrackId.')) return;

    setSaving(true);
    try {
      const { data: facturas, error: fErr } = await supabase
        .from('facturas')
        .select('id, numero, fecha')
        .order('fecha', { ascending: false })
        .limit(1);
      if (fErr) throw fErr;
      if (!facturas?.length) throw new Error('No hay facturas para enviar');

      const { data, error } = await supabase.functions.invoke('emitir-fiscal', {
        body: { action: 'dgii_send_to_dgii', factura_id: facturas[0].id },
      });

      if (error) {
        let realMessage = error.message;
        try {
          if (error.context && typeof error.context.json === 'function') {
            const parsed = await error.context.json();
            if (parsed?.error) realMessage = parsed.error;
          } else if (error.context?.body) {
            const parsed = typeof error.context.body === 'string' ? JSON.parse(error.context.body) : error.context.body;
            if (parsed?.error) realMessage = parsed.error;
          }
        } catch (_) {}
        throw new Error(realMessage);
      }
      if (!data?.ok) throw new Error(data?.error || 'No se pudo enviar');

      toast({
        title: '✅ Enviado a DGII',
        description: `e-NCF: ${data.encf} · TrackId: ${data.trackId} · Ambiente: ${data.ambiente}`,
      });
    } catch (err) {
      toast({ title: 'Error enviando a DGII', description: err.message || 'Error desconocido', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleValidate = async () => {
    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke('emitir-fiscal', {
        body: { action: 'dgii_validate_certificate' },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || 'No se pudo validar');
      toast({ title: '✅ Certificado valido', description: `${data.metadata?.subject_cn || 'Certificado'} cargado y parseado correctamente.` });
      await fetchInfo();
    } catch (err) {
      toast({ title: 'Error al validar', description: err.message || 'No se pudo abrir el certificado.', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('¿Eliminar el certificado configurado? Tendras que volver a subir el .p12 y la contrasena para emitir.')) return;
    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke('emitir-fiscal', {
        body: { action: 'dgii_delete_certificate' },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || 'No se pudo eliminar');
      toast({ title: 'Certificado eliminado', description: 'Configuracion DGII directo limpia.' });
      setRnc(''); setNombre(''); setAmbiente('CerteCF'); setCallbackUrl(''); setFechaVencimientoSecuencia('');
      setFile(null); setPassword('');
      await fetchInfo();
    } catch (err) {
      toast({ title: 'Error', description: err.message || 'No se pudo eliminar.', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const onFileChange = (e) => {
    const f = e.target.files?.[0];
    console.log('[DgiiUploader] file selected:', f?.name, f?.size, f?.type);
    if (!f) return;
    if (f.size > MAX_P12_BYTES) {
      toast({ title: 'Archivo muy grande', description: 'El .p12 no debe superar 10 MB.', variant: 'destructive' });
      return;
    }
    const lower = f.name.toLowerCase();
    if (!lower.endsWith('.p12') && !lower.endsWith('.pfx')) {
      toast({ title: 'Formato invalido', description: `Sube un archivo .p12 o .pfx (recibido: ${f.name})`, variant: 'destructive' });
      return;
    }
    setFile(f);
    toast({ title: 'Archivo cargado', description: `${f.name} (${(f.size/1024).toFixed(1)} KB) listo para guardar.` });
  };

  const handleUpload = async () => {
    // Validaciones con feedback visual claro
    if (!tenantId) {
      toast({ title: 'Error', description: 'No se pudo identificar el tenant. Recarga la pagina.', variant: 'destructive' });
      return;
    }
    if (!rnc.trim()) {
      toast({ title: 'Falta RNC', description: 'Ingresa el RNC del emisor antes de guardar.', variant: 'destructive' });
      return;
    }
    if (!nombre.trim()) {
      toast({ title: 'Falta razon social', description: 'Ingresa la razon social del emisor.', variant: 'destructive' });
      return;
    }
    if (!file) {
      toast({ title: 'Falta archivo', description: 'Selecciona el archivo .p12 o .pfx primero.', variant: 'destructive' });
      if (fileInputRef.current) fileInputRef.current.click();
      return;
    }
    if (!password.trim()) {
      toast({ title: 'Falta contrasena', description: 'Ingresa la contrasena del certificado .p12.', variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      // 1. Subir el .p12 a Storage privado en path <tenant_id>/certificado.p12
      const storagePath = `${tenantId}/certificado.p12`;
      const { error: upErr } = await supabase.storage
        .from('certificados-dgii')
        .upload(storagePath, file, { upsert: true, contentType: 'application/x-pkcs12' });
      if (upErr) {
        // Si el bucket no existe, dar un mensaje mas claro
        if (upErr.message?.includes('not found') || upErr.message?.includes('Bucket') || upErr.statusCode === '404') {
          throw new Error('El bucket de almacenamiento "certificados-dgii" no existe. Ejecuta el script SQL dgii_certificados_storage.sql en Supabase primero.');
        }
        throw new Error(`Error subiendo archivo: ${upErr.message}`);
      }

      // 2. Cifrar password en backend y persistir config
      const { data, error } = await supabase.functions.invoke('emitir-fiscal', {
        body: {
          action: 'dgii_save_certificate_meta',
          rnc_emisor: rnc,
          nombre_emisor: nombre,
          nombre_comercial: nombreComercial,
          municipio,
          provincia,
          ambiente,
          callback_url: callbackUrl,
          fecha_vencimiento_secuencia: fechaVencimientoSecuencia,
          certificado_password: password,
          storage_path: storagePath,
        },
      });

      // supabase.functions.invoke puede devolver error como FunctionsHttpError
      if (error) {
        const msg = error?.message || error?.context?.body || JSON.stringify(error);
        throw new Error(msg);
      }
      if (!data?.ok) throw new Error(data?.error || 'No se pudo guardar la config');

      toast({ title: '✅ Certificado guardado', description: 'El .p12 quedo cifrado y la configuracion guardada correctamente.' });
      setFile(null);
      setPassword('');
      if (fileInputRef.current) fileInputRef.current.value = '';
      await fetchInfo();
    } catch (err) {
      console.error('[DgiiUploader] handleUpload error:', err);
      toast({ title: 'Error al guardar', description: err.message || 'No se pudo guardar el certificado. Revisa la consola para mas detalles.', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveSettings = async () => {
    if (!info?.configured) return;
    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke('emitir-fiscal', {
        body: {
          action: 'dgii_update_config_meta',
          rnc_emisor: rnc,
          nombre_emisor: nombre,
          nombre_comercial: nombreComercial,
          municipio,
          provincia,
          ambiente,
          callback_url: callbackUrl,
          fecha_vencimiento_secuencia: fechaVencimientoSecuencia,
        },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || 'No se pudo guardar la configuracion');
      toast({ title: 'Configuracion guardada', description: 'Datos DGII actualizados sin reemplazar el certificado.' });
      await fetchInfo();
    } catch (err) {
      toast({ title: 'Error', description: err.message || 'No se pudo guardar la configuracion.', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-500 py-4">
        <Loader2 className="w-4 h-4 animate-spin" /> Cargando configuracion DGII...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Estado actual */}
      {info?.configured ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-[12px] text-emerald-800 space-y-3">
          <div className="flex items-start gap-2">
            <ShieldCheck className="w-4 h-4 mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="font-bold">Certificado configurado</p>
              <p>RNC: {info.rnc_emisor || '—'} · Ambiente: {info.ambiente}</p>
              <p className="text-[10px] text-emerald-600 mt-1 truncate">Path: {info.storage_path}</p>
            </div>
            <div className="flex gap-2 shrink-0">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleValidate}
                disabled={saving}
                className="border-emerald-300 text-emerald-700 hover:bg-emerald-100"
              >
                <BadgeCheck className="w-3.5 h-3.5 mr-1" /> Validar
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleGenerateTestXml()}
                disabled={saving || generatingXml}
                className="border-blue-300 text-blue-700 hover:bg-blue-100"
                title="Genera el XML de la factura mas reciente (sin firmar, sin enviar)"
              >
                {generatingXml ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <FileCode2 className="w-3.5 h-3.5 mr-1" />}
                XML
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleGenerateTestXml({ sign: true })}
                disabled={saving || generatingXml}
                className="border-purple-300 text-purple-700 hover:bg-purple-100"
                title="Genera y FIRMA el XML con el .p12 cargado (XAdES-BES, sin enviar a DGII)"
              >
                {generatingXml ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <BadgeCheck className="w-3.5 h-3.5 mr-1" />}
                XML firmado
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleSendToDgii}
                disabled={saving || generatingXml}
                className="border-orange-300 text-orange-700 hover:bg-orange-100"
                title="Genera, firma y ENVIA a DGII en el ambiente configurado"
              >
                {saving ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Send className="w-3.5 h-3.5 mr-1" />}
                Enviar a DGII
              </Button>
              <input
                ref={externalXmlInputRef}
                type="file"
                accept=".xml"
                onChange={handleSignExternalXml}
                className="hidden"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => externalXmlInputRef.current?.click()}
                disabled={signingExternal}
                className="border-indigo-300 text-indigo-700 hover:bg-indigo-100"
                title="Firma un XML externo (ej. postulacion FI-GDF-016 de OFV) con tu .p12"
              >
                {signingExternal ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <FileSignature className="w-3.5 h-3.5 mr-1" />}
                Firmar XML
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleDelete}
                disabled={saving}
                className="border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800"
              >
                <Trash2 className="w-3.5 h-3.5 mr-1" /> Eliminar
              </Button>
            </div>
          </div>

          {/* Metadata del certificado (si ya fue validado) */}
          {info.metadata && (() => {
            const validTo = info.metadata.valid_to ? new Date(info.metadata.valid_to) : null;
            const now = new Date();
            const diasRestantes = validTo ? Math.floor((validTo - now) / (1000 * 60 * 60 * 24)) : null;
            const expirado = diasRestantes !== null && diasRestantes < 0;
            const proximoVencer = diasRestantes !== null && diasRestantes >= 0 && diasRestantes <= 30;
            return (
              <div className="border-t border-emerald-200 pt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
                <div><span className="text-emerald-600 font-bold">Sujeto (CN):</span> {info.metadata.subject_cn || '—'}</div>
                <div><span className="text-emerald-600 font-bold">Emisor (CN):</span> {info.metadata.issuer_cn || '—'}</div>
                <div><span className="text-emerald-600 font-bold">Vigente desde:</span> {info.metadata.valid_from ? new Date(info.metadata.valid_from).toLocaleDateString('es-DO') : '—'}</div>
                <div className={expirado ? 'text-red-700 font-bold' : proximoVencer ? 'text-amber-700 font-bold' : ''}>
                  <span className="text-emerald-600 font-bold">Vence:</span>{' '}
                  {validTo ? validTo.toLocaleDateString('es-DO') : '—'}
                  {diasRestantes !== null && (
                    expirado
                      ? <span className="ml-1 inline-flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Expirado hace {Math.abs(diasRestantes)} dias</span>
                      : proximoVencer
                        ? <span className="ml-1 inline-flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Vence en {diasRestantes} dias</span>
                        : <span className="ml-1 text-emerald-600">({diasRestantes} dias)</span>
                  )}
                </div>
                {info.metadata.serial && <div className="col-span-2"><span className="text-emerald-600 font-bold">Serial:</span> <span className="font-mono text-[10px]">{info.metadata.serial}</span></div>}
                {info.metadata.self_signed && (
                  <div className="col-span-2 text-amber-700 inline-flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    Certificado auto-firmado — solo sirve para pruebas, NO para emitir a DGII en produccion.
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      ) : (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-[12px] text-amber-800 flex items-start gap-2">
          <FileLock2 className="w-4 h-4 mt-0.5 shrink-0" />
          <div>
            <p className="font-bold">Sin certificado configurado</p>
            <p>Sube tu archivo .p12 emitido por una CA autorizada (DigiFirma, Camara TIC, ProCert, Avansi, Indotel) y la contrasena para empezar.</p>
          </div>
        </div>
      )}

      {/* Formulario de datos del emisor */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label className="text-[11px] font-bold text-gray-700 uppercase">RNC del emisor</Label>
          <Input value={rnc} onChange={(e) => setRnc(e.target.value)} placeholder="1-30-12345-6" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-[11px] font-bold text-gray-700 uppercase">Razon social</Label>
          <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="NOMBRE COMERCIAL SRL" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-[11px] font-bold text-gray-700 uppercase">Nombre comercial</Label>
          <Input value={nombreComercial} onChange={(e) => setNombreComercial(e.target.value)} placeholder="Repuestos Morla" />
          <p className="text-[10px] text-gray-500">Como aparecera en la representacion impresa (RI) del e-CF. Si lo dejas vacio se usa la razon social.</p>
        </div>
        <div className="space-y-1.5">
          <Label className="text-[11px] font-bold text-gray-700 uppercase">Municipio</Label>
          <Input value={municipio} onChange={(e) => setMunicipio(e.target.value)} placeholder="Santiago" />
          <p className="text-[10px] text-gray-500">REQUERIDO por DGII. Sin esto rechaza con "400 DireccionEmisor".</p>
        </div>
        <div className="space-y-1.5">
          <Label className="text-[11px] font-bold text-gray-700 uppercase">Provincia</Label>
          <Input value={provincia} onChange={(e) => setProvincia(e.target.value)} placeholder="Santiago" />
          <p className="text-[10px] text-gray-500">REQUERIDO por DGII. Ej: Santo Domingo, Santiago, La Vega.</p>
        </div>
        <div className="space-y-1.5">
          <Label className="text-[11px] font-bold text-gray-700 uppercase">Ambiente</Label>
          <Select value={ambiente} onValueChange={setAmbiente}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {AMBIENTES.map(a => (
                <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className={`text-[10px] ${ambiente === 'CerteCF' ? 'text-amber-700' : 'text-red-600 font-semibold'}`}>
            El set oficial del portal de certificacion se envia siempre por CerteCF. Si estas en Paso 4, guarda Ambiente = CerteCF.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label className="text-[11px] font-bold text-gray-700 uppercase">Callback URL (DGII envia ARECF/AECF)</Label>
          <Input value={callbackUrl} onChange={(e) => setCallbackUrl(e.target.value)} placeholder="https://tu-dominio.com/api/dgii-callback" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-[11px] font-bold text-gray-700 uppercase">Vencimiento secuencia e-CF</Label>
          <Input value={fechaVencimientoSecuencia} onChange={(e) => setFechaVencimientoSecuencia(e.target.value)} placeholder="31-12-2028" />
          <p className="text-[10px] text-gray-500">Usado en simulacion para los tipos que DGII exige. Debe coincidir exactamente con el vencimiento autorizado en DGII.</p>
          {fechaVencimientoSecuencia && fechaVencimientoSecuencia !== '31-12-2028' && (
            <p className="text-[10px] text-orange-700 font-semibold">
              Aviso: para esta certificacion nos indicaste que DGII marca 31-12-2028 como fecha correcta.
            </p>
          )}
        </div>
      </div>

      {/* Subida del .p12 */}
      <div className="border-t pt-4 space-y-3">
        <Label className="text-[11px] font-bold text-gray-700 uppercase">
          Certificado digital (.p12 / .pfx)
        </Label>

        {/* Input nativo OCULTO. Lo abrimos via boton custom. */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".p12,.pfx,application/x-pkcs12,application/pkcs12"
          onChange={onFileChange}
          className="hidden"
        />

        {/* Dropzone visual */}
        {file ? (
          <div className="flex items-center justify-between gap-3 p-4 rounded-lg border-2 border-emerald-300 bg-emerald-50">
            <div className="flex items-center gap-3 min-w-0">
              <ShieldCheck className="w-8 h-8 text-emerald-600 shrink-0" />
              <div className="min-w-0">
                <p className="font-bold text-emerald-800 truncate">{file.name}</p>
                <p className="text-[11px] text-emerald-700">
                  {(file.size / 1024).toFixed(1)} KB · listo para guardar
                </p>
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              className="shrink-0"
            >
              Cambiar
            </Button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="w-full p-6 rounded-lg border-2 border-dashed border-red-300 bg-red-50 hover:bg-red-100 hover:border-red-400 transition-colors flex flex-col items-center gap-2 cursor-pointer"
          >
            <FileLock2 className="w-10 h-10 text-red-400" />
            <p className="font-bold text-red-700">Click aquí para seleccionar el archivo .p12</p>
            <p className="text-[11px] text-red-500">Acepta .p12 o .pfx (máx. 10 MB)</p>
          </button>
        )}

        <div className="space-y-1.5">
          <Label className="text-[11px] font-bold text-gray-700 uppercase">Contrasena del certificado</Label>
          <div className="relative">
            <Input
              type={showPwd ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Contrasena que usaste al exportar el .p12"
              className="pr-10"
            />
            <button
              type="button"
              tabIndex={-1}
              onClick={() => setShowPwd(s => !s)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          <p className="text-[10px] text-gray-400">
            La contrasena se cifra con AES-256-GCM antes de guardarse. Nunca se almacena en texto plano.
          </p>
        </div>

        <Button
          onClick={handleUpload}
          disabled={saving}
          className="bg-morla-blue hover:bg-morla-blue/90 text-white disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
          {saving ? 'Subiendo...' : (info?.configured ? 'Reemplazar certificado' : 'Guardar certificado')}
        </Button>
        {info?.configured && (
          <Button
            type="button"
            variant="outline"
            onClick={handleSaveSettings}
            disabled={saving}
            className="ml-2 border-blue-300 text-blue-700 hover:bg-blue-50"
          >
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            Guardar datos
          </Button>
        )}
        {(!file || !password.trim()) && (
          <p className="text-[11px] text-amber-600 mt-1">
            {!file && !password.trim()
              ? 'Falta seleccionar el archivo .p12 e ingresar la contraseña.'
              : !file
                ? 'Falta seleccionar el archivo .p12.'
                : 'Falta ingresar la contraseña del certificado.'}
          </p>
        )}
      </div>

      {/* Set de Pruebas DGII (Paso 2 certificacion) — solo si hay cert configurado */}
      {info?.configured && (
        <div className="border-t pt-6 mt-2">
          <DgiiCertificacionRunner />
        </div>
      )}

      {info?.configured && (
        <div className="border-t pt-6 mt-2">
          <DgiiAprobacionComercialRunner />
        </div>
      )}

      {info?.configured && (
        <div className="border-t pt-6 mt-2">
          <DgiiSimulacionRunner />
        </div>
      )}

      {info?.configured && (
        <div className="border-t pt-6 mt-2">
          <DgiiRepresentacionImpresaRunner configInfo={info} />
        </div>
      )}

      {/* Modal: visor del XML generado */}
      {xmlPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setXmlPreview(null)}>
          <div className="bg-white rounded-lg shadow-2xl max-w-4xl w-full max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b bg-blue-50">
              <div>
                <h3 className="text-sm font-bold text-blue-900 uppercase tracking-wide flex items-center gap-2">
                  XML — Tipo {xmlPreview.tipo_ecf} ({xmlPreview.tipo_ecf === '32' ? 'Consumo B2C' : xmlPreview.tipo_ecf === '31' ? 'Credito Fiscal B2B' : 'e-CF'})
                  {xmlPreview.firmado && (
                    <span className="inline-flex items-center gap-1 text-[10px] bg-purple-100 text-purple-800 font-bold px-2 py-0.5 rounded">
                      <BadgeCheck className="w-3 h-3" /> FIRMADO XAdES-BES
                    </span>
                  )}
                </h3>
                <p className="text-[11px] text-blue-700">
                  e-NCF: <code>{xmlPreview.encf}</code> · Factura #{xmlPreview.factura.numero} · {new Date(xmlPreview.factura.fecha).toLocaleDateString('es-DO')}
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setXmlPreview(null)}>
                <X className="w-4 h-4" />
              </Button>
            </div>

            {/* Info de firma si aplica */}
            {xmlPreview.firmado && (
              <div className="px-4 py-2 border-b bg-purple-50 text-[11px] grid grid-cols-2 gap-x-4 gap-y-1 text-purple-900">
                <div><span className="font-bold">DigestValue:</span> <code className="text-[10px]">{xmlPreview.digest_value?.slice(0, 32)}...</code></div>
                <div><span className="font-bold">SignatureValue:</span> <code className="text-[10px]">{xmlPreview.signature_value_preview}</code></div>
              </div>
            )}

            <div className="p-4 overflow-auto flex-1 bg-slate-900">
              <pre className="text-[11px] text-emerald-300 font-mono whitespace-pre-wrap break-all">{xmlPreview.xml}</pre>
            </div>
            <div className="px-4 py-2 border-t flex items-center justify-between bg-slate-50 text-[11px] text-slate-600">
              <span>
                {xmlPreview.firmado
                  ? '✅ Firmado XAdES-BES con tu .p12. Envio a DGII pendiente (Fase 3e).'
                  : '⚠ XML SIN FIRMAR. Use el boton "XML firmado" para firmarlo con tu .p12.'}
              </span>
              <div className="flex items-center gap-2">
                {xmlPreview.firmado && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={downloadRiPreview}
                    className="border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                  >
                    <FileText className="w-3.5 h-3.5 mr-1" /> RI PDF
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={downloadXmlPreview}
                  className="border-purple-300 text-purple-700 hover:bg-purple-50"
                >
                  <Download className="w-3.5 h-3.5 mr-1" /> Descargar XML
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    navigator.clipboard?.writeText(xmlPreview.xml);
                    toast({ title: 'Copiado', description: 'XML al portapapeles' });
                  }}
                >
                  Copiar
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DgiiCertificadoUploader;
