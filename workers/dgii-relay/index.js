// Relé hacia la DGII (10/10/2026).
// El cortafuegos de producción de la DGII (ecf.dgii.gov.do/eCF) corta los POST
// que salen de los servidores de Supabase. Las Edge Functions mandan aquí la
// misma petición y este Worker la reenvía tal cual. Solo a hosts de la DGII y
// solo con la clave compartida (secreto RELAY_KEY, el mismo en Supabase).
//   https://dgii-relay.<cuenta>.workers.dev/<host>/<ruta>?<query>
const HOSTS = new Set(["ecf.dgii.gov.do", "fc.dgii.gov.do", "statusecf.dgii.gov.do"]);

export default {
  async fetch(req, env) {
    if (!env.RELAY_KEY || req.headers.get("x-relay-key") !== env.RELAY_KEY) {
      return new Response("no autorizado", { status: 401 });
    }
    const url = new URL(req.url);
    const [, host, ...resto] = url.pathname.split("/");
    if (!HOSTS.has(host)) return new Response("host no permitido", { status: 400 });
    const destino = `https://${host}/${resto.join("/")}${url.search}`;
    const headers = new Headers(req.headers);
    headers.delete("x-relay-key");
    headers.delete("host");
    const r = await fetch(destino, {
      method: req.method,
      headers,
      body: ["GET", "HEAD"].includes(req.method) ? undefined : await req.arrayBuffer(),
      redirect: "manual",
    });
    return new Response(r.body, { status: r.status, headers: r.headers });
  },
};
