import React, { useEffect, useRef, useCallback } from 'react';
import jsQR from 'jsqr';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';

const BarcodeScanner = ({ isOpen, onClose, onScanSuccess, title, description }) => {
  const { toast } = useToast();
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const animationFrameId = useRef(null);

  const stopCamera = useCallback(() => {
    if (animationFrameId.current) {
      cancelAnimationFrame(animationFrameId.current);
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
  }, []);

  const scanCode = useCallback(() => {
    if (videoRef.current && videoRef.current.readyState === videoRef.current.HAVE_ENOUGH_DATA) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d', { willReadFrequently: true });

      canvas.height = video.videoHeight;
      canvas.width = video.videoWidth;
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
      
      const code = jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: "dontInvert",
      });

      if (code && code.data) {
        stopCamera();
        onScanSuccess(code.data);
      } else {
        animationFrameId.current = requestAnimationFrame(scanCode);
      }
    } else {
      animationFrameId.current = requestAnimationFrame(scanCode);
    }
  }, [onScanSuccess, stopCamera]);

  useEffect(() => {
    if (isOpen) {
      const startScanner = async () => {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { facingMode: 'environment' } 
          });
          streamRef.current = stream;
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            videoRef.current.setAttribute("playsinline", true);
            await videoRef.current.play();
            animationFrameId.current = requestAnimationFrame(scanCode);
          }
        } catch (error) {
          console.error("Error al acceder a la cámara:", error);
          toast({
            variant: 'destructive',
            title: 'Error de Cámara',
            description: 'No se pudo acceder a la cámara. Verifique los permisos.',
          });
          onClose();
        }
      };
      startScanner();
    } else {
      stopCamera();
    }

    return () => {
      stopCamera();
    };
  }, [isOpen, scanCode, onClose, toast, stopCamera]);

  const handleOpenChange = (open) => {
    if (!open) {
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md p-0">
        <DialogHeader className="p-6 pb-0">
          <DialogTitle>{title || 'Escanear Código'}</DialogTitle>
          <DialogDescription>
            {description || 'Apunta la cámara al código de barras o QR.'}
          </DialogDescription>
        </DialogHeader>
        <div className="p-4 relative">
          <video ref={videoRef} className="w-full h-auto rounded-lg" autoPlay playsInline muted />
          <canvas ref={canvasRef} style={{ display: 'none' }} />
          <div className="absolute inset-4 flex items-center justify-center pointer-events-none">
            <div className="w-3/4 h-1/2 border-4 border-red-500/70 rounded-lg shadow-lg" />
          </div>
        </div>
        <div className="p-6 pt-0">
          <Button variant="outline" onClick={onClose} className="w-full">Cancelar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default BarcodeScanner;