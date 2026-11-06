// Foto del estudiante (obligatoria en la ficha). Se toma con la cámara del
// equipo o se sube escaneada. Va al bucket PRIVADO 'edu-fotos', en la carpeta
// de la empresa (<tenant>/...): solo los usuarios de ese colegio la pueden ver,
// y se muestra con un enlace firmado que vence.
import React, { useEffect, useRef, useState } from 'react';
import { Camera, Upload, Loader2, X, RotateCcw } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import { Button } from '@/components/ui/button';

const BUCKET = 'edu-fotos';
const LADO = 600;   // la foto se guarda cuadrada, 600 px: suficiente y liviana

/** Enlace firmado (1 hora) para mostrar una foto guardada. */
export async function urlFotoEstudiante(path) {
  if (!path) return null;
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
  return error ? null : data?.signedUrl || null;
}

/** Recorta al centro en cuadrado y comprime a JPEG. */
function aJpegCuadrado(fuente, w, h) {
  const lado = Math.min(w, h);
  const canvas = document.createElement('canvas');
  canvas.width = LADO; canvas.height = LADO;
  canvas.getContext('2d').drawImage(fuente, (w - lado) / 2, (h - lado) / 2, lado, lado, 0, 0, LADO, LADO);
  return new Promise((ok) => canvas.toBlob((b) => ok(b), 'image/jpeg', 0.85));
}

export default function FotoEstudiante({ tenantId, path, onChange, onError }) {
  const [url, setUrl] = useState(null);
  const [camara, setCamara] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const archivoRef = useRef(null);

  useEffect(() => {
    let vivo = true;
    urlFotoEstudiante(path).then((u) => { if (vivo) setUrl(u); });
    return () => { vivo = false; };
  }, [path]);

  const apagarCamara = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCamara(false);
  };
  useEffect(() => apagarCamara, []);

  const encenderCamara = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 } }, audio: false });
      streamRef.current = stream;
      setCamara(true);
      setTimeout(() => { if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.play(); } }, 0);
    } catch (e) {
      onError?.('No se pudo abrir la cámara', e?.name === 'NotAllowedError'
        ? 'El navegador no dio permiso. Permite la cámara en el candado de la barra de direcciones, o sube la foto.'
        : (e?.message || 'Este equipo no tiene cámara disponible. Sube la foto escaneada.'));
    }
  };

  const subir = async (blob) => {
    if (!blob) return;
    setSubiendo(true);
    try {
      const nombre = `${tenantId}/${crypto.randomUUID()}.jpg`;
      const { error } = await supabase.storage.from(BUCKET).upload(nombre, blob, { contentType: 'image/jpeg', upsert: false });
      if (error) throw error;
      onChange(nombre);
    } catch (e) {
      onError?.('No se pudo guardar la foto', e?.message);
    } finally {
      setSubiendo(false);
    }
  };

  const capturar = async () => {
    const v = videoRef.current;
    if (!v?.videoWidth) return;
    const blob = await aJpegCuadrado(v, v.videoWidth, v.videoHeight);
    apagarCamara();
    await subir(blob);
  };

  const desdeArchivo = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (!f.type.startsWith('image/')) return onError?.('Archivo no válido', 'Sube una imagen (JPG o PNG).');
    const img = new Image();
    img.onload = async () => { URL.revokeObjectURL(img.src); await subir(await aJpegCuadrado(img, img.naturalWidth, img.naturalHeight)); };
    img.onerror = () => onError?.('No se pudo leer la imagen', f.name);
    img.src = URL.createObjectURL(f);
  };

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="w-40 h-40 rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 overflow-hidden flex items-center justify-center relative">
        {camara ? (
          <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
        ) : url ? (
          <img src={url} alt="Foto del estudiante" className="w-full h-full object-cover" />
        ) : (
          <span className="text-xs text-gray-400 text-center px-2">Sin foto<br />(obligatoria)</span>
        )}
        {subiendo && (
          <div className="absolute inset-0 bg-white/70 flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-blue-600" /></div>
        )}
      </div>
      {camara ? (
        <div className="flex gap-2">
          <Button type="button" size="sm" onClick={capturar}><Camera className="w-4 h-4 mr-1" /> Tomar</Button>
          <Button type="button" size="sm" variant="ghost" onClick={apagarCamara}><X className="w-4 h-4" /></Button>
        </div>
      ) : (
        <div className="flex gap-2">
          <Button type="button" size="sm" variant="outline" onClick={encenderCamara} disabled={subiendo}>
            {path ? <RotateCcw className="w-4 h-4 mr-1" /> : <Camera className="w-4 h-4 mr-1" />} Cámara
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => archivoRef.current?.click()} disabled={subiendo}>
            <Upload className="w-4 h-4 mr-1" /> Subir
          </Button>
          <input ref={archivoRef} type="file" accept="image/*" capture="user" className="hidden" onChange={desdeArchivo} />
        </div>
      )}
    </div>
  );
}
