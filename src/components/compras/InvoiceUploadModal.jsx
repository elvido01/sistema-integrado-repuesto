import React, { useState } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { Loader2, Upload, FileText, X, Files } from "lucide-react";

const InvoiceUploadModal = ({ isOpen, onClose, onDataExtracted }) => {
    const [files, setFiles] = useState([]);
    const [previews, setPreviews] = useState([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const { toast } = useToast();

    const handleFileChange = (e) => {
        const selectedFiles = Array.from(e.target.files);
        if (selectedFiles.length > 0) {
            setFiles(prev => [...prev, ...selectedFiles]);
            const newPreviews = selectedFiles.map(file => URL.createObjectURL(file));
            setPreviews(prev => [...prev, ...newPreviews]);
        }
    };

    const removeFile = (index) => {
        setFiles(prev => prev.filter((_, i) => i !== index));
        setPreviews(prev => {
            URL.revokeObjectURL(prev[index]);
            return prev.filter((_, i) => i !== index);
        });
    };

    const clearAll = () => {
        previews.forEach(url => URL.revokeObjectURL(url));
        setFiles([]);
        setPreviews([]);
    };

    const handleProcess = async () => {
        if (files.length === 0) return;

        setIsProcessing(true);
        try {
            const uploadedPaths = [];

            // 1. Upload all files to Storage
            for (const file of files) {
                const fileExt = file.name.split('.').pop();
                const fileName = `${Math.random()}.${fileExt}`;
                const filePath = `invoices/${Date.now()}_${fileName}`;

                const { data: uploadData, error: uploadError } = await supabase.storage
                    .from('purchases')
                    .upload(filePath, file);

                if (uploadError) throw new Error(`Error al subir ${file.name}: ${uploadError.message}`);
                uploadedPaths.push(filePath);
            }

            // 2. Call Edge Function with array of paths
            const { data, error: functionError } = await supabase.functions.invoke('extract-purchase-from-image', {
                body: { image_paths: uploadedPaths },
            });

            if (functionError) {
                // Log detailed error from body if available
                const errorBody = await functionError.context?.json?.();
                throw new Error(errorBody?.error || functionError.message || "Error desconocido en el servidor.");
            }

            toast({
                title: "Éxito",
                description: "Datos extraídos correctamente de la factura.",
            });

            onDataExtracted({
                ...data.extracted_data,
                ocr_text: data.ocr_text,
                image_paths: uploadedPaths
            });

            onClose();
            clearAll();
        } catch (error) {
            console.error("Error processing invoice:", error);
            toast({
                variant: "destructive",
                title: "Error al procesar",
                description: error.message,
            });
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Subir Factura para OCR (Multi-página)</DialogTitle>
                </DialogHeader>

                <div className="grid gap-4 py-4">
                    <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:bg-gray-50 transition-colors cursor-pointer relative">
                        <input
                            type="file"
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                            onChange={handleFileChange}
                            accept="image/*"
                            multiple
                        />
                        <Upload className="mx-auto h-10 w-10 text-gray-400" />
                        <p className="mt-2 text-sm text-gray-600">Haz click o arrastra una o más imágenes (JPG, PNG)</p>
                    </div>

                    {previews.length > 0 && (
                        <div className="grid grid-cols-2 gap-4 mt-2">
                            {previews.map((url, index) => (
                                <div key={index} className="relative border rounded-lg overflow-hidden bg-gray-50 flex items-center justify-center h-40 group">
                                    <img src={url} alt={`Página ${index + 1}`} className="max-h-full object-contain" />
                                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                        <Button
                                            variant="destructive"
                                            size="icon"
                                            className="rounded-full h-8 w-8"
                                            onClick={() => removeFile(index)}
                                        >
                                            <X className="h-4 w-4" />
                                        </Button>
                                    </div>
                                    <div className="absolute bottom-1 left-2 bg-black/60 text-white text-[10px] px-2 py-0.5 rounded">
                                        Pág. {index + 1}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <DialogFooter className="flex items-center justify-between sm:justify-between w-full">
                    <div className="text-sm text-gray-500">
                        {files.length > 0 && `${files.length} archivo(s) seleccionado(s)`}
                    </div>
                    <div className="flex space-x-2">
                        <Button variant="outline" onClick={onClose} disabled={isProcessing}>
                            Cancelar
                        </Button>
                        <Button
                            className="bg-morla-blue hover:bg-morla-blue/90 text-white"
                            onClick={handleProcess}
                            disabled={files.length === 0 || isProcessing}
                        >
                            {isProcessing ? (
                                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Procesando...</>
                            ) : (
                                <><FileText className="mr-2 h-4 w-4" /> Procesar {files.length > 1 ? 'Páginas' : 'Factura'}</>
                            )}
                        </Button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

export default InvoiceUploadModal;
