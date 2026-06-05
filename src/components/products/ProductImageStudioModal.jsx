import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Crop, Download, Image as ImageIcon, Loader2, Move, Save, Sparkles, Upload, X } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { saveProductImageUrl, uploadProductImage } from '@/services/productImageStudioService';

const OUTPUT_SIZE = 1200;

function canvasToBlob(canvas, type = 'image/png', quality = 0.94) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('No se pudo generar la imagen.'));
    }, type, quality);
  });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('No se pudo cargar la imagen.'));
    img.src = src;
  });
}

export default function ProductImageStudioModal({
  open,
  onClose,
  product,
  initialImageUrl = '',
  onSaved,
  saveDirect = true,
}) {
  const { tenantId } = useAuth();
  const { toast } = useToast();
  const fileInputRef = useRef(null);
  const previewCanvasRef = useRef(null);
  const [sourceUrl, setSourceUrl] = useState('');
  const [sourceName, setSourceName] = useState('');
  const [zoom, setZoom] = useState(2.4);
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);
  const [background, setBackground] = useState('white');
  const [processedUrl, setProcessedUrl] = useState('');
  const [processedBlob, setProcessedBlob] = useState(null);
  const [busy, setBusy] = useState(false);
  const [removingBg, setRemovingBg] = useState(false);

  const reset = useCallback(() => {
    setSourceUrl(initialImageUrl || '');
    setSourceName('');
    setZoom(initialImageUrl ? 1.4 : 2.4);
    setOffsetX(0);
    setOffsetY(0);
    setBackground('white');
    setProcessedUrl('');
    setProcessedBlob(null);
  }, [initialImageUrl]);

  useEffect(() => {
    if (open) reset();
  }, [open, reset]);

  useEffect(() => {
    return () => {
      if (sourceUrl?.startsWith('blob:')) URL.revokeObjectURL(sourceUrl);
      if (processedUrl?.startsWith('blob:')) URL.revokeObjectURL(processedUrl);
    };
  }, [sourceUrl, processedUrl]);

  const drawToCanvas = useCallback(async (targetCanvas) => {
    if (!sourceUrl || !targetCanvas) return null;
    const image = await loadImage(sourceUrl);
    const canvas = targetCanvas;
    const ctx = canvas.getContext('2d');
    canvas.width = OUTPUT_SIZE;
    canvas.height = OUTPUT_SIZE;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (background === 'white') {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    const containScale = Math.min(canvas.width / image.naturalWidth, canvas.height / image.naturalHeight);
    const scale = containScale * zoom;
    const drawWidth = image.naturalWidth * scale;
    const drawHeight = image.naturalHeight * scale;
    const x = (canvas.width - drawWidth) / 2 + (offsetX / 100) * canvas.width * 0.5;
    const y = (canvas.height - drawHeight) / 2 + (offsetY / 100) * canvas.height * 0.5;
    ctx.drawImage(image, x, y, drawWidth, drawHeight);
    return canvas;
  }, [background, offsetX, offsetY, sourceUrl, zoom]);

  useEffect(() => {
    if (!sourceUrl || processedUrl) return;
    drawToCanvas(previewCanvasRef.current).catch((err) => {
      console.warn('[ProductImageStudio] preview:', err?.message);
    });
  }, [drawToCanvas, processedUrl, sourceUrl]);

  const handlePickFile = (file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast({ variant: 'destructive', title: 'Archivo invalido', description: 'Selecciona una imagen JPG, PNG o WebP.' });
      return;
    }
    if (file.size > 12 * 1024 * 1024) {
      toast({ variant: 'destructive', title: 'Imagen muy pesada', description: 'Usa una imagen menor de 12MB.' });
      return;
    }
    if (sourceUrl?.startsWith('blob:')) URL.revokeObjectURL(sourceUrl);
    setSourceUrl(URL.createObjectURL(file));
    setSourceName(file.name);
    setProcessedUrl('');
    setProcessedBlob(null);
    setZoom(2.4);
    setOffsetX(0);
    setOffsetY(0);
  };

  const renderCurrentCropBlob = async () => {
    const canvas = document.createElement('canvas');
    await drawToCanvas(canvas);
    return canvasToBlob(canvas, background === 'transparent' ? 'image/png' : 'image/jpeg', 0.94);
  };

  const handleGenerateCrop = async () => {
    if (!sourceUrl) return;
    setBusy(true);
    try {
      const blob = await renderCurrentCropBlob();
      if (processedUrl?.startsWith('blob:')) URL.revokeObjectURL(processedUrl);
      setProcessedBlob(blob);
      setProcessedUrl(URL.createObjectURL(blob));
      toast({ title: 'Recorte listo', description: 'Revisa el resultado antes de guardar.' });
    } catch (err) {
      toast({ variant: 'destructive', title: 'Error al recortar', description: err.message });
    } finally {
      setBusy(false);
    }
  };

  const handleRemoveBackground = async () => {
    if (!sourceUrl) return;
    setRemovingBg(true);
    try {
      const cropBlob = await renderCurrentCropBlob();
      const { removeBackground } = await import('@imgly/background-removal');
      const resultBlob = await removeBackground(cropBlob);
      if (processedUrl?.startsWith('blob:')) URL.revokeObjectURL(processedUrl);
      setBackground('transparent');
      setProcessedBlob(resultBlob);
      setProcessedUrl(URL.createObjectURL(resultBlob));
      toast({ title: 'Fondo eliminado', description: 'Producto aislado. Puedes guardarlo en el catalogo.' });
    } catch (err) {
      console.error('[ProductImageStudio] remove bg:', err);
      toast({ variant: 'destructive', title: 'No se pudo quitar el fondo', description: err?.message || 'Prueba con un recorte mas cerrado.' });
    } finally {
      setRemovingBg(false);
    }
  };

  const handleDownload = async () => {
    const blob = processedBlob || await renderCurrentCropBlob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const code = product?.codigo || sourceName || 'producto';
    link.href = url;
    link.download = `${String(code).replace(/[^a-z0-9_-]/gi, '_')}_catalogo.${blob.type === 'image/jpeg' ? 'jpg' : 'png'}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  const handleSave = async () => {
    if (!sourceUrl && !processedBlob) return;
    setBusy(true);
    try {
      const blob = processedBlob || await renderCurrentCropBlob();
      const url = await uploadProductImage({
        tenantId,
        product,
        blob,
        previousUrl: saveDirect ? initialImageUrl : null,
      });

      let savedProduct = null;
      if (saveDirect && product?.id) {
        savedProduct = await saveProductImageUrl(product.id, url);
      }

      onSaved?.({ url, product: savedProduct || { ...product, imagen_url: url } });
      toast({
        title: 'Imagen guardada',
        description: saveDirect && product?.id ? 'La foto del producto fue actualizada.' : 'La imagen quedo lista para guardar con el producto.',
      });
      onClose();
    } catch (err) {
      toast({ variant: 'destructive', title: 'Error al guardar imagen', description: err.message });
    } finally {
      setBusy(false);
    }
  };

  const canSave = !!sourceUrl || !!processedBlob;
  const titleCode = product?.codigo || product?.referencia || 'producto nuevo';

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-6xl max-h-[94vh] overflow-hidden p-0">
        <DialogHeader className="px-5 py-4 border-b bg-slate-50">
          <DialogTitle className="flex items-center gap-2 text-slate-900">
            <Sparkles className="h-5 w-5 text-violet-600" />
            Producto Studio
            <span className="text-xs font-normal text-slate-500">/ {titleCode}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-12 min-h-[640px]">
          <aside className="col-span-12 lg:col-span-3 border-r bg-white p-4 space-y-4">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => handlePickFile(e.target.files?.[0])}
            />
            <Button className="w-full bg-slate-900 hover:bg-slate-800 text-white" onClick={() => fileInputRef.current?.click()}>
              <Upload className="h-4 w-4 mr-2" />
              Subir captura
            </Button>

            <div className="rounded border bg-slate-50 p-3">
              <p className="text-[11px] font-black uppercase text-slate-600">Producto</p>
              <p className="text-sm font-bold text-slate-900 truncate">{product?.descripcion || 'Sin producto seleccionado'}</p>
              <p className="text-xs text-slate-500 font-mono">{product?.codigo || '-'}</p>
            </div>

            <div className="space-y-3">
              <div>
                <Label className="text-[11px] font-bold uppercase text-slate-600 flex items-center gap-1">
                  <Crop className="h-3.5 w-3.5" /> Zoom
                </Label>
                <Input type="range" min="0.6" max="8" step="0.05" value={zoom} onChange={(e) => { setProcessedUrl(''); setProcessedBlob(null); setZoom(Number(e.target.value)); }} />
                <div className="text-[10px] text-slate-400 text-right">{zoom.toFixed(2)}x</div>
              </div>

              <div>
                <Label className="text-[11px] font-bold uppercase text-slate-600 flex items-center gap-1">
                  <Move className="h-3.5 w-3.5" /> Horizontal
                </Label>
                <Input type="range" min="-100" max="100" step="1" value={offsetX} onChange={(e) => { setProcessedUrl(''); setProcessedBlob(null); setOffsetX(Number(e.target.value)); }} />
              </div>

              <div>
                <Label className="text-[11px] font-bold uppercase text-slate-600 flex items-center gap-1">
                  <Move className="h-3.5 w-3.5" /> Vertical
                </Label>
                <Input type="range" min="-100" max="100" step="1" value={offsetY} onChange={(e) => { setProcessedUrl(''); setProcessedBlob(null); setOffsetY(Number(e.target.value)); }} />
              </div>

              <div>
                <Label className="text-[11px] font-bold uppercase text-slate-600">Fondo</Label>
                <Select value={background} onValueChange={(v) => { setProcessedUrl(''); setProcessedBlob(null); setBackground(v); }}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="white">Blanco catalogo</SelectItem>
                    <SelectItem value="transparent">Transparente PNG</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2 pt-3 border-t">
              <Button variant="outline" className="w-full" onClick={handleGenerateCrop} disabled={!sourceUrl || busy || removingBg}>
                {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Crop className="h-4 w-4 mr-2" />}
                Recortar producto
              </Button>
              <Button variant="outline" className="w-full border-violet-200 text-violet-700 hover:bg-violet-50" onClick={handleRemoveBackground} disabled={!sourceUrl || busy || removingBg}>
                {removingBg ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
                Quitar fondo
              </Button>
              <Button variant="outline" className="w-full" onClick={handleDownload} disabled={!sourceUrl && !processedBlob}>
                <Download className="h-4 w-4 mr-2" />
                Descargar
              </Button>
            </div>
          </aside>

          <main className="col-span-12 lg:col-span-6 bg-slate-100 p-5 flex flex-col items-center justify-center">
            <div className="w-full max-w-[560px] aspect-square bg-white shadow-sm border border-slate-300 relative">
              {sourceUrl ? (
                <canvas ref={previewCanvasRef} className="w-full h-full" />
              ) : (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 hover:text-slate-600"
                >
                  <ImageIcon className="h-16 w-16 mb-3 opacity-40" />
                  <span className="text-sm font-bold uppercase">Sube una captura del suplidor</span>
                  <span className="text-xs mt-1">Luego encuadra solo la pieza.</span>
                </button>
              )}
            </div>
            <div className="mt-3 text-[11px] text-slate-500 flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              Vista final cuadrada 1200 x 1200 para catalogo, tienda y marketing.
            </div>
          </main>

          <aside className="col-span-12 lg:col-span-3 border-l bg-white p-4 flex flex-col">
            <p className="text-[11px] font-black uppercase text-slate-600 mb-2">Resultado</p>
            <div className="aspect-square rounded border bg-[linear-gradient(45deg,#f1f5f9_25%,transparent_25%),linear-gradient(-45deg,#f1f5f9_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#f1f5f9_75%),linear-gradient(-45deg,transparent_75%,#f1f5f9_75%)] bg-[length:18px_18px] bg-[position:0_0,0_9px,9px_-9px,-9px_0px] flex items-center justify-center overflow-hidden">
              {processedUrl ? (
                <img src={processedUrl} alt="Resultado" className="w-full h-full object-contain" />
              ) : sourceUrl ? (
                <div className="text-center px-4">
                  <Crop className="h-10 w-10 text-slate-300 mx-auto mb-2" />
                  <p className="text-xs font-semibold text-slate-500">Ajusta el encuadre y pulsa Recortar o Quitar fondo.</p>
                </div>
              ) : (
                <span className="text-xs text-slate-400">Sin imagen</span>
              )}
            </div>

            <div className="mt-4 rounded border border-amber-200 bg-amber-50 p-3">
              <p className="text-[11px] font-black uppercase text-amber-800">Uso recomendado</p>
              <p className="text-xs text-amber-900 mt-1">
                Para capturas de catalogo, haz zoom hasta que desaparezcan precios, logos y textos. Si el fondo queda sucio, usa Quitar fondo.
              </p>
            </div>

            <div className="mt-auto flex gap-2 pt-4">
              <Button variant="outline" className="flex-1" onClick={onClose} disabled={busy || removingBg}>
                <X className="h-4 w-4 mr-1" />
                Cerrar
              </Button>
              <Button className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={handleSave} disabled={!canSave || busy || removingBg}>
                {busy ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
                Guardar
              </Button>
            </div>
          </aside>
        </div>
      </DialogContent>
    </Dialog>
  );
}
