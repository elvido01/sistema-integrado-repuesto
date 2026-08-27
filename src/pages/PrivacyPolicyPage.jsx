import React from 'react';
import { Helmet } from 'react-helmet';

const sections = [
  {
    title: 'Datos que podemos recibir',
    body: [
      'Cuando una pagina de Facebook o una cuenta profesional de Instagram se conecta a MotoFlow CRM, el sistema puede recibir identificadores de la pagina o cuenta, identificadores de perfil del remitente, nombre publico disponible en Meta, mensajes enviados al negocio, adjuntos o referencias de medios incluidos en la conversacion, marcas de tiempo y metadatos tecnicos necesarios para procesar el webhook.',
      'Tambien se almacenan datos operativos que el personal autorizado agregue durante la atencion, como notas, cotizaciones, estado de la conversacion y relacion con clientes o solicitudes de piezas.',
    ],
  },
  {
    title: 'Finalidad del uso',
    body: [
      'Usamos esta informacion para centralizar conversaciones de WhatsApp, Facebook, Instagram y TikTok en el CRM, atender solicitudes de clientes, preparar cotizaciones, dar seguimiento a pedidos de repuestos y ayudar al equipo a confirmar la pieza correcta antes de responder.',
      'No vendemos los datos recibidos por Meta ni por TikTok, ni los usamos para publicidad externa de terceros.',
    ],
  },
  {
    title: 'Acceso y seguridad',
    body: [
      'El acceso al CRM esta limitado a usuarios autorizados del negocio. Los datos se almacenan en servicios protegidos con HTTPS, autenticacion y controles de acceso por empresa.',
      'Los tokens y credenciales de integracion se mantienen en el backend o en servicios seguros; no se publican en el frontend.',
    ],
  },
  {
    title: 'Retencion',
    body: [
      'Conservamos conversaciones y datos operativos mientras sean necesarios para la atencion al cliente, seguimiento comercial, cumplimiento interno del negocio o mientras la cuenta del negocio mantenga activa la integracion.',
      'Cuando un dato ya no sea necesario o se solicite su eliminacion, lo revisaremos conforme al rol del solicitante, la relacion con el negocio y las obligaciones operativas aplicables.',
    ],
  },
  {
    title: 'Solicitudes de eliminacion',
    body: [
      'Los usuarios pueden solicitar acceso, correccion o eliminacion de informacion relacionada con conversaciones enviando un correo a elvidocaminero@gmail.com e indicando el canal usado, la cuenta contactada y una descripcion suficiente para ubicar la conversacion.',
      'Si el dato pertenece a una empresa usuaria de MotoFlow, la solicitud puede requerir validacion con el administrador del negocio correspondiente.',
    ],
  },
];

function PrivacyPolicyPage() {
  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <Helmet>
        <title>Politica de Privacidad - Repuestos Morla / MotoFlow CRM</title>
        <meta
          name="description"
          content="Politica de privacidad publica para el uso de Meta Login y mensajeria CRM en Repuestos Morla y MotoFlow CRM."
        />
      </Helmet>

      <div className="mx-auto max-w-4xl px-5 py-10 sm:px-8 sm:py-14">
        <header className="mb-8 border-b border-slate-200 pb-6">
          <p className="text-sm font-semibold uppercase tracking-wide text-blue-700">
            Repuestos Morla / MotoFlow CRM
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-normal text-slate-950 sm:text-4xl">
            Politica de Privacidad
          </h1>
          <p className="mt-3 text-sm text-slate-600">
            Ultima actualizacion: 6 de agosto de 2026
          </p>
        </header>

        <section className="space-y-4 text-base leading-7 text-slate-700">
          <p>
            Esta politica explica como Repuestos Morla y MotoFlow CRM tratan la
            informacion recibida a traves de integraciones con Facebook,
            Instagram, WhatsApp, TikTok y otros modulos del CRM usados para
            atencion al cliente y gestion comercial.
          </p>
          <p>
            MotoFlow CRM es una herramienta operativa para negocios de repuestos
            y servicios relacionados. Su uso esta destinado al personal
            autorizado de cada negocio conectado.
          </p>
        </section>

        <div className="mt-10 space-y-8">
          {sections.map((section) => (
            <section key={section.title}>
              <h2 className="text-xl font-semibold text-slate-950">
                {section.title}
              </h2>
              <div className="mt-3 space-y-3 text-base leading-7 text-slate-700">
                {section.body.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </div>
            </section>
          ))}

          <section>
            <h2 className="text-xl font-semibold text-slate-950">Contacto</h2>
            <p className="mt-3 text-base leading-7 text-slate-700">
              Para preguntas sobre esta politica o sobre el manejo de datos en
              MotoFlow CRM, escriba a{' '}
              <a
                className="font-semibold text-blue-700 underline underline-offset-4"
                href="mailto:elvidocaminero@gmail.com"
              >
                elvidocaminero@gmail.com
              </a>
              .
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}

export default PrivacyPolicyPage;
