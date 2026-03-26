import React, { useEffect, useRef, useCallback, useState } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';

const SCANNER_ID = 'barcode-scanner-region';

const FORMATS_TO_SUPPORT = [
  Html5QrcodeSupportedFormats.CODE_128,
  Html5QrcodeSupportedFormats.CODE_39,
  Html5QrcodeSupportedFormats.CODE_93,
  Html5QrcodeSupportedFormats.EAN_13,
  Html5QrcodeSupportedFormats.EAN_8,
  Html5QrcodeSupportedFormats.UPC_A,
  Html5QrcodeSupportedFormats.UPC_E,
  Html5QrcodeSupportedFormats.QR_CODE,
  Html5QrcodeSupportedFormats.DATA_MATRIX,
  Html5QrcodeSupportedFormats.CODABAR,
  Html5QrcodeSupportedFormats.ITF,
];

const BarcodeScanner = ({ isOpen, onClose, onScanSuccess, title, description }) => {
  const { toast } = useToast();
  const scannerRef = useRef(null);
  const [scanning, setScanning] = useState(false);
  const hasResultRef = useRef(false);

  const stopScanner = useCallback(async () => {
    try {
      if (scannerRef.current) {
        const state = scannerRef.current.getState();
        // State 2 = SCANNING, State 3 = PAUSED
        if (state === 2 || state === 3) {
          await scannerRef.current.stop();
        }
        scannerRef.current.clear();
        scannerRef.current = null;
      }
    } catch (err) {
      console.warn('Scanner cleanup error:', err);
      scannerRef.current = null;
    }
    setScanning(false);
    hasResultRef.current = false;
  }, []);

  const startScanner = useCallback(async () => {
    // Small delay to ensure DOM element exists
    await new Promise(resolve => setTimeout(resolve, 300));

    const el = document.getElementById(SCANNER_ID);
    if (!el) {
      console.warn('Scanner DOM element not found');
      return;
    }

    try {
      hasResultRef.current = false;
      const html5QrCode = new Html5Qrcode(SCANNER_ID, {
        formatsToSupport: FORMATS_TO_SUPPORT,
        verbose: false,
      });

      scannerRef.current = html5QrCode;

      await html5QrCode.start(
        { facingMode: 'environment' },
        {
          fps: 10,
          qrbox: { width: 280, height: 120 },
          aspectRatio: 1.0,
          disableFlip: false,
        },
        (decodedText) => {
          // Prevent multiple triggers
          if (hasResultRef.current) return;
          hasResultRef.current = true;

          // Vibrate for feedback
          if (navigator.vibrate) navigator.vibrate(100);

          // Stop scanner and return result
          stopScanner().then(() => {
            onScanSuccess(decodedText);
          });
        },
        () => {
          // QR code not found in frame - this is normal, keep scanning
        }
      );

      setScanning(true);
    } catch (error) {
      console.error('Error starting scanner:', error);
      toast({
        variant: 'destructive',
        title: 'Error de Cámara',
        description: 'No se pudo acceder a la cámara. Verifique los permisos.',
      });
      onClose();
    }
  }, [onScanSuccess, onClose, stopScanner, toast]);

  useEffect(() => {
    if (isOpen) {
      startScanner();
    }
    return () => {
      stopScanner();
    };
  }, [isOpen]);

  const handleOpenChange = (open) => {
    if (!open) {
      stopScanner();
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md p-0">
        <DialogHeader className="p-6 pb-2">
          <DialogTitle>{title || 'Escanear Código'}</DialogTitle>
          <DialogDescription>
            {description || 'Apunta la cámara al código de barras del producto.'}
          </DialogDescription>
        </DialogHeader>
        <div className="px-4 pb-2">
          <div 
            id={SCANNER_ID} 
            className="w-full rounded-lg overflow-hidden"
            style={{ minHeight: '300px' }}
          />
          {scanning && (
            <p className="text-center text-xs text-green-600 font-bold mt-2 animate-pulse">
              🔍 Escaneando... centre el código de barras en el recuadro
            </p>
          )}
        </div>
        <div className="px-6 pb-6 pt-0">
          <Button variant="outline" onClick={() => { stopScanner(); onClose(); }} className="w-full">
            Cancelar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default BarcodeScanner;