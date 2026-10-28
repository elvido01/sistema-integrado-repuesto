// =====================================================================
// Paso 1 de la facturación electrónica: el FORMULARIO DE POSTULACIÓN
// del portal de la DGII (28/10/2026)
// ---------------------------------------------------------------------
// En la Oficina Virtual (Facturación Electrónica → Postulación) la DGII
// pide los "Datos del software a utilizar". Aquí está qué poner en cada
// campo, con botón para copiar. Las tres URL son la MISMA dirección: el
// receptor de MotoFlow (función dgii-receptor) atiende autenticación,
// recepción y aprobación comercial, y reconoce a cada empresa por su RNC.
// Ver también DgiiRecepcionRunner.jsx (pasos 7 y 12) y
// docs/ALTA_CLIENTE_NUEVO.md, punto 5.
// =====================================================================
import React from 'react';
import { Copy, FileSignature } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://zdvxowpuklbypweyqqki.supabase.co';
const RECEPTOR = `${SUPABASE_URL.replace(/\/$/, '')}/functions/v1/dgii-receptor`.replace(/^https?:\/\//, '');

export const SOFTWARE_NOMBRE = 'MotoFlow';
export const SOFTWARE_VERSION = '1.0';

export default function DgiiGuiaPostulacion() {
  const { toast } = useToast();
  const copiar = async (valor, que) => {
    try {
      await navigator.clipboard.writeText(valor);
      toast({ title: `${que} copiado`, description: valor });
    } catch {
      toast({ variant: 'destructive', title: 'No se pudo copiar', description: 'Selecciónalo y cópialo a mano.' });
    }
  };

  const Fila = ({ campo, valor, nota, copiable = true }) => (
    <div className="flex items-center justify-between gap-2 rounded border border-blue-200 bg-white px-3 py-2">
      <div className="min-w-0">
        <p className="text-[11px] font-bold uppercase text-slate-500">{campo}</p>
        <p className="font-mono text-[13px] font-bold text-blue-800 break-all">{valor}</p>
        {nota && <p className="text-[10px] text-slate-500">{nota}</p>}
      </div>
      {copiable && (
        <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-[10px] shrink-0" onClick={() => copiar(valor, campo)}>
          <Copy className="w-3 h-3 mr-1" /> Copiar
        </Button>
      )}
    </div>
  );

  return (
    <div className="rounded-lg border-2 border-blue-300 bg-blue-50 p-4 text-[12px] text-blue-950 space-y-3">
      <div>
        <p className="font-bold text-[14px]">Paso 1 · Formulario de postulación en el portal de la DGII</p>
        <p className="text-[11px] text-blue-900/80">
          Oficina Virtual de la DGII → <b>Facturación Electrónica</b> → <b>Postulación</b>. Los datos de la empresa ya vienen llenos;
          en <b>«Datos del software a utilizar»</b> pon exactamente esto:
        </p>
      </div>

      <div className="grid gap-2">
        <Fila campo="Tipo de software" valor="PROPIO" copiable={false} nota="Elígelo en la lista. MotoFlow es el sistema de la empresa." />
        <div className="grid gap-2 sm:grid-cols-2">
          <Fila campo="Nombre del software" valor={SOFTWARE_NOMBRE} />
          <Fila campo="Versión del software" valor={SOFTWARE_VERSION} />
        </div>
        <Fila campo="URL de recepción" valor={RECEPTOR} nota="El portal ya pone «https://» delante y «/fe/recepcion/api/ecf» detrás: escribe solo esto." />
        <Fila campo="URL de aprobación comercial" valor={RECEPTOR} nota="La misma dirección. El portal agrega «/fe/aprobacioncomercial/api/ecf»." />
        <Fila campo="URL de autenticación" valor={RECEPTOR} nota="La misma dirección. El portal agrega «/fe/autenticacion/api/…»." />
      </div>

      <ol className="list-decimal pl-5 space-y-1">
        <li>Pulsa <b>GENERAR ARCHIVO</b> en el portal: se descarga un archivo <b>.xml</b>.</li>
        <li>
          Fírmalo aquí abajo con el botón <b className="inline-flex items-center gap-1"><FileSignature className="w-3 h-3" />Firmar XML</b>{' '}
          (necesita el certificado <b>.p12</b> ya subido). Se descarga el archivo firmado.
        </li>
        <li>En el portal, en <b>«Envío de archivo de postulación firmado»</b>, sube ese archivo firmado y envíalo.</li>
        <li>Cuando la DGII apruebe la postulación, sigue con el set de pruebas (pasos 2 en adelante, más abajo).</li>
      </ol>
      <p className="text-[10px] text-blue-900/70">
        Las tres URL son la misma porque el receptor de MotoFlow atiende los tres servicios y reconoce a la empresa por su RNC.
        Es la misma dirección que se usa después en los pasos 7 y 12.
      </p>
    </div>
  );
}
