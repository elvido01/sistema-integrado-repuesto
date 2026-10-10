Deno.serve((req) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return new Response('Method Not Allowed', { status: 405 });
  }
  const path = new URL(req.url).pathname;
  const isPrivacy = path.endsWith('/privacy');
  const title = isPrivacy ? 'Política de Privacidad' : 'Términos de Servicio';
  const body = isPrivacy
    ? `<h1>Política de Privacidad</h1>
<p>Repuestos Morla usa esta aplicación para preparar y publicar contenido original de productos en redes sociales autorizadas por la empresa.</p>
<h2>Datos que se tratan</h2><p>La aplicación puede tratar los datos mínimos necesarios para publicar contenido: identificadores de cuenta autorizada, textos, imágenes, configuración de publicación y registros técnicos de resultado.</p>
<h2>Uso y conservación</h2><p>Los datos se usan únicamente para administrar publicaciones de Repuestos Morla, prevenir duplicados y atender incidencias. No se venden ni se comparten con fines ajenos a la operación de la empresa.</p>
<h2>Seguridad y contacto</h2><p>El acceso se limita a personal y servicios autorizados. Para consultas, comuníquese con Repuestos Morla por WhatsApp al 809-390-5965 o visite Av. Duarte, esquina Baldemiro Rijo, Higüey, República Dominicana.</p>`
    : `<h1>Términos de Servicio</h1>
<p>La aplicación de Repuestos Morla es una herramienta interna para preparar, administrar y publicar contenido original de productos en cuentas sociales autorizadas.</p>
<h2>Uso autorizado</h2><p>Solo personal autorizado de Repuestos Morla puede conectar una cuenta, cargar contenido o solicitar una publicación. Toda publicación debe respetar las reglas de la plataforma correspondiente.</p>
<h2>Contenido y responsabilidad</h2><p>El usuario que aprueba una publicación es responsable de que el contenido, precios y afirmaciones comerciales sean correctos y de que cuenta con los derechos para usar las imágenes y textos.</p>
<h2>Contacto</h2><p>Para soporte, comuníquese con Repuestos Morla por WhatsApp al 809-390-5965 o visite Av. Duarte, esquina Baldemiro Rijo, Higüey, República Dominicana.</p>`;
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} | Repuestos Morla</title><style>body{font-family:Arial,sans-serif;max-width:760px;margin:48px auto;padding:0 20px;color:#172033;line-height:1.6}h1{color:#c62828}h2{margin-top:28px}</style></head><body><header><strong>Repuestos Morla</strong></header>${body}<footer><p>Última actualización: 30 de julio de 2026.</p></footer></body></html>`;
  return new Response(req.method === 'HEAD' ? null : html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=3600' } });
});