// ============================================================
// design-templates/index.js — Esqueletos Polotno de plantillas
// ============================================================
// Cada plantilla tiene elementos con `name` (no solo id) para
// que el motor de inyeccion pueda identificarlos y reemplazar:
//   - titulo, subtitulo, cta        ← copy generado por IA
//   - precio, precio_antes          ← del producto
//   - producto_foto                 ← imagen del producto
//
// Convencion del schema Polotno minimo:
//   {
//     width, height,
//     pages: [{
//       id, background,
//       children: [{ id, name, type, x, y, width, height, ...specifics }]
//     }]
//   }
// ============================================================

const COLORS = {
    rojo:      '#dc2626',
    azulMarino:'#0f172a',
    naranja:   '#ea580c',
    amarillo:  '#facc15',
    blanco:    '#ffffff',
    negro:     '#0a0a0a',
    morado:    '#7c3aed',
    cyan:      '#06b6d4',
    emerald:   '#10b981',
    grisOscuro:'#1e293b',
};

// ── 1) OFERTA DEL DIA — fondo rojo + precio destacado ────────
export const ofertaDelDia = {
    width: 1080, height: 1080,
    pages: [{
        id: 'p1',
        background: COLORS.rojo,
        children: [
            // Banda superior amarilla
            { id: 'banda_top', type: 'figure', subType: 'rect',
              x: 0, y: 0, width: 1080, height: 120,
              fill: COLORS.amarillo },
            { id: 'banda_top_text', name: 'banda_top_text', type: 'text',
              x: 0, y: 30, width: 1080,
              text: 'OFERTA DEL DIA', fontSize: 56, fontWeight: 900,
              fontFamily: 'Roboto', fill: COLORS.azulMarino, align: 'center' },

            // Espacio para foto del producto (cuadrado central)
            { id: 'producto_foto', name: 'producto_foto', type: 'image',
              x: 290, y: 170, width: 500, height: 380,
              src: 'https://placehold.co/500x380/ffffff/cccccc?text=Foto+Producto' },

            // Titulo (gancho) — IA aqui
            { id: 'titulo', name: 'titulo', type: 'text',
              x: 60, y: 590, width: 960,
              text: 'TU OFERTA AQUI', fontSize: 88, fontWeight: 900,
              fontFamily: 'Roboto', fill: COLORS.blanco, align: 'center', lineHeight: 1 },

            // Subtitulo — IA aqui
            { id: 'subtitulo', name: 'subtitulo', type: 'text',
              x: 80, y: 720, width: 920,
              text: 'Descripcion breve del producto', fontSize: 36, fontWeight: 400,
              fontFamily: 'Roboto', fill: COLORS.blanco, align: 'center' },

            // Precio
            { id: 'precio', name: 'precio', type: 'text',
              x: 60, y: 820, width: 960,
              text: 'RD$ 0', fontSize: 96, fontWeight: 900,
              fontFamily: 'Roboto', fill: COLORS.amarillo, align: 'center' },

            // CTA box
            { id: 'cta_box', type: 'figure', subType: 'rect',
              x: 340, y: 950, width: 400, height: 90,
              fill: COLORS.azulMarino, cornerRadius: 12 },
            { id: 'cta', name: 'cta', type: 'text',
              x: 340, y: 968, width: 400,
              text: 'LLAMA AHORA', fontSize: 42, fontWeight: 900,
              fontFamily: 'Roboto', fill: COLORS.blanco, align: 'center' },
        ],
    }],
};

// ── 2) NUEVO PRODUCTO — diseño limpio fondo claro ───────────
export const nuevoProducto = {
    width: 1080, height: 1080,
    pages: [{
        id: 'p1',
        background: COLORS.blanco,
        children: [
            // Banda lateral izquierda morada
            { id: 'banda_izq', type: 'figure', subType: 'rect',
              x: 0, y: 0, width: 60, height: 1080,
              fill: COLORS.morado },

            // Badge "NUEVO"
            { id: 'badge_bg', type: 'figure', subType: 'rect',
              x: 120, y: 100, width: 280, height: 60,
              fill: COLORS.morado, cornerRadius: 30 },
            { id: 'badge_text', name: 'badge_text', type: 'text',
              x: 120, y: 113, width: 280,
              text: '✨ NUEVO EN TIENDA', fontSize: 32, fontWeight: 700,
              fontFamily: 'Roboto', fill: COLORS.blanco, align: 'center' },

            // Foto producto
            { id: 'producto_foto', name: 'producto_foto', type: 'image',
              x: 120, y: 220, width: 840, height: 480,
              src: 'https://placehold.co/840x480/eeeeee/aaaaaa?text=Foto+Producto' },

            // Titulo
            { id: 'titulo', name: 'titulo', type: 'text',
              x: 120, y: 740, width: 840,
              text: 'NOMBRE DEL PRODUCTO', fontSize: 72, fontWeight: 900,
              fontFamily: 'Roboto', fill: COLORS.azulMarino, align: 'left', lineHeight: 1 },

            // Subtitulo
            { id: 'subtitulo', name: 'subtitulo', type: 'text',
              x: 120, y: 860, width: 840,
              text: 'Descripcion del producto en una linea o dos', fontSize: 32, fontWeight: 400,
              fontFamily: 'Roboto', fill: '#475569', align: 'left' },

            // CTA
            { id: 'cta', name: 'cta', type: 'text',
              x: 120, y: 980, width: 840,
              text: '👉 PIDE EL TUYO HOY', fontSize: 38, fontWeight: 900,
              fontFamily: 'Roboto', fill: COLORS.morado, align: 'left' },
        ],
    }],
};

// ── 3) COMUNICADO — fondo oscuro elegante ───────────────────
export const comunicadoUrgente = {
    width: 1080, height: 1080,
    pages: [{
        id: 'p1',
        background: COLORS.azulMarino,
        children: [
            // Borde superior amarillo
            { id: 'borde_top', type: 'figure', subType: 'rect',
              x: 0, y: 0, width: 1080, height: 12,
              fill: COLORS.amarillo },

            // Icono megafono (texto emoji)
            { id: 'icono', type: 'text',
              x: 0, y: 140, width: 1080,
              text: '📢', fontSize: 140, align: 'center' },

            // Etiqueta "COMUNICADO"
            { id: 'etiqueta', name: 'etiqueta', type: 'text',
              x: 0, y: 320, width: 1080,
              text: 'COMUNICADO', fontSize: 32, fontWeight: 700,
              fontFamily: 'Roboto', fill: COLORS.amarillo, align: 'center', letterSpacing: 8 },

            // Titulo (mensaje principal)
            { id: 'titulo', name: 'titulo', type: 'text',
              x: 80, y: 420, width: 920,
              text: 'MENSAJE PRINCIPAL', fontSize: 90, fontWeight: 900,
              fontFamily: 'Roboto', fill: COLORS.blanco, align: 'center', lineHeight: 1.1 },

            // Subtitulo (detalle)
            { id: 'subtitulo', name: 'subtitulo', type: 'text',
              x: 100, y: 700, width: 880,
              text: 'Detalle del comunicado en una o dos lineas', fontSize: 38, fontWeight: 400,
              fontFamily: 'Roboto', fill: '#cbd5e1', align: 'center', lineHeight: 1.3 },

            // CTA
            { id: 'cta_box', type: 'figure', subType: 'rect',
              x: 290, y: 920, width: 500, height: 90,
              fill: COLORS.amarillo, cornerRadius: 12 },
            { id: 'cta', name: 'cta', type: 'text',
              x: 290, y: 938, width: 500,
              text: 'MAS INFORMACION', fontSize: 42, fontWeight: 900,
              fontFamily: 'Roboto', fill: COLORS.azulMarino, align: 'center' },
        ],
    }],
};

// ── 4) PROMOCION 2x1 — fondo cyan con banda diagonal ───────
export const promocion2x1 = {
    width: 1080, height: 1080,
    pages: [{
        id: 'p1', background: COLORS.cyan,
        children: [
            { id: 'banda_top', type: 'figure', subType: 'rect', x: 0, y: 0, width: 1080, height: 200, fill: COLORS.azulMarino },
            { id: 'badge_text', name: 'badge_text', type: 'text', x: 0, y: 60, width: 1080, text: '🔥 2x1 🔥', fontSize: 110, fontWeight: 900, fontFamily: 'Roboto', fill: COLORS.amarillo, align: 'center' },
            { id: 'titulo', name: 'titulo', type: 'text', x: 60, y: 280, width: 960, text: 'PROMO 2 POR 1', fontSize: 88, fontWeight: 900, fontFamily: 'Roboto', fill: COLORS.blanco, align: 'center' },
            { id: 'producto_foto', name: 'producto_foto', type: 'image', x: 240, y: 440, width: 600, height: 360, src: 'https://placehold.co/600x360/ffffff/cccccc?text=Productos' },
            { id: 'subtitulo', name: 'subtitulo', type: 'text', x: 80, y: 830, width: 920, text: 'Lleva dos y paga uno solo', fontSize: 40, fontWeight: 700, fontFamily: 'Roboto', fill: COLORS.azulMarino, align: 'center' },
            { id: 'cta_box', type: 'figure', subType: 'rect', x: 290, y: 940, width: 500, height: 90, fill: COLORS.azulMarino, cornerRadius: 12 },
            { id: 'cta', name: 'cta', type: 'text', x: 290, y: 958, width: 500, text: 'APROVECHA YA', fontSize: 42, fontWeight: 900, fontFamily: 'Roboto', fill: COLORS.amarillo, align: 'center' },
        ],
    }],
};

// ── 5) REPOSICION DE STOCK — verde con tic ──────────────────
export const reposicionStock = {
    width: 1080, height: 1080,
    pages: [{
        id: 'p1', background: COLORS.emerald,
        children: [
            { id: 'icono', type: 'text', x: 0, y: 100, width: 1080, text: '✅', fontSize: 160, align: 'center' },
            { id: 'etiqueta', name: 'etiqueta', type: 'text', x: 0, y: 290, width: 1080, text: 'YA DISPONIBLE', fontSize: 36, fontWeight: 700, fontFamily: 'Roboto', fill: COLORS.blanco, align: 'center', letterSpacing: 6 },
            { id: 'producto_foto', name: 'producto_foto', type: 'image', x: 290, y: 370, width: 500, height: 320, src: 'https://placehold.co/500x320/ffffff/cccccc?text=Foto' },
            { id: 'titulo', name: 'titulo', type: 'text', x: 60, y: 720, width: 960, text: 'YA LLEGO LO QUE ESPERABAS', fontSize: 76, fontWeight: 900, fontFamily: 'Roboto', fill: COLORS.blanco, align: 'center', lineHeight: 1 },
            { id: 'subtitulo', name: 'subtitulo', type: 'text', x: 80, y: 870, width: 920, text: 'Tu repuesto favorito regreso al inventario', fontSize: 32, fontWeight: 400, fontFamily: 'Roboto', fill: COLORS.blanco, align: 'center' },
            { id: 'cta', name: 'cta', type: 'text', x: 0, y: 980, width: 1080, text: '👉 RESERVA AHORA', fontSize: 44, fontWeight: 900, fontFamily: 'Roboto', fill: COLORS.amarillo, align: 'center' },
        ],
    }],
};

// ── 6) COMPARATIVA — formato landscape 1200x630 ─────────────
export const comparativaAntesDespues = {
    width: 1200, height: 630,
    pages: [{
        id: 'p1', background: COLORS.azulMarino,
        children: [
            { id: 'titulo', name: 'titulo', type: 'text', x: 0, y: 30, width: 1200, text: 'COMPARA Y AHORRA', fontSize: 52, fontWeight: 900, fontFamily: 'Roboto', fill: COLORS.amarillo, align: 'center' },
            { id: 'caja_a_bg', type: 'figure', subType: 'rect', x: 40, y: 110, width: 540, height: 420, fill: '#1e293b', cornerRadius: 16 },
            { id: 'caja_a_titulo', type: 'text', x: 40, y: 130, width: 540, text: 'ANTES', fontSize: 28, fontWeight: 700, fontFamily: 'Roboto', fill: '#cbd5e1', align: 'center' },
            { id: 'imagen_a', name: 'imagen_a', type: 'image', x: 80, y: 180, width: 460, height: 280, src: 'https://placehold.co/460x280/334155/64748b?text=Antes' },
            { id: 'caja_b_bg', type: 'figure', subType: 'rect', x: 620, y: 110, width: 540, height: 420, fill: '#065f46', cornerRadius: 16 },
            { id: 'caja_b_titulo', type: 'text', x: 620, y: 130, width: 540, text: 'AHORA', fontSize: 28, fontWeight: 700, fontFamily: 'Roboto', fill: COLORS.amarillo, align: 'center' },
            { id: 'imagen_b', name: 'imagen_b', type: 'image', x: 660, y: 180, width: 460, height: 280, src: 'https://placehold.co/460x280/10b981/a7f3d0?text=Ahora' },
            { id: 'subtitulo', name: 'subtitulo', type: 'text', x: 0, y: 555, width: 1200, text: 'Diferencia clara, calidad superior', fontSize: 26, fontWeight: 400, fontFamily: 'Roboto', fill: COLORS.blanco, align: 'center' },
        ],
    }],
};

// ── 7) CATALOGO GRID — 4 productos en grilla ───────────────
export const catalogoGrid = {
    width: 1080, height: 1080,
    pages: [{
        id: 'p1', background: COLORS.blanco,
        children: [
            { id: 'titulo', name: 'titulo', type: 'text', x: 0, y: 30, width: 1080, text: 'CATALOGO', fontSize: 64, fontWeight: 900, fontFamily: 'Roboto', fill: COLORS.azulMarino, align: 'center' },
            // Grid 2x2
            { id: 'producto_1', name: 'producto_1', type: 'image', x: 80, y: 140, width: 440, height: 380, src: 'https://placehold.co/440x380/f1f5f9/94a3b8?text=Producto+1' },
            { id: 'producto_2', name: 'producto_2', type: 'image', x: 560, y: 140, width: 440, height: 380, src: 'https://placehold.co/440x380/f1f5f9/94a3b8?text=Producto+2' },
            { id: 'producto_3', name: 'producto_3', type: 'image', x: 80, y: 540, width: 440, height: 380, src: 'https://placehold.co/440x380/f1f5f9/94a3b8?text=Producto+3' },
            { id: 'producto_4', name: 'producto_4', type: 'image', x: 560, y: 540, width: 440, height: 380, src: 'https://placehold.co/440x380/f1f5f9/94a3b8?text=Producto+4' },
            { id: 'cta', name: 'cta', type: 'text', x: 0, y: 970, width: 1080, text: 'PIDE EL TUYO HOY', fontSize: 40, fontWeight: 900, fontFamily: 'Roboto', fill: COLORS.rojo, align: 'center' },
        ],
    }],
};

// ── 8) STORY INSTAGRAM — vertical 1080x1920 ────────────────
export const storyInstagram = {
    width: 1080, height: 1920,
    pages: [{
        id: 'p1', background: COLORS.morado,
        children: [
            { id: 'banda_top', type: 'figure', subType: 'rect', x: 0, y: 0, width: 1080, height: 280, fill: COLORS.azulMarino },
            { id: 'titulo', name: 'titulo', type: 'text', x: 80, y: 80, width: 920, text: 'TITULO PRINCIPAL', fontSize: 96, fontWeight: 900, fontFamily: 'Roboto', fill: COLORS.amarillo, align: 'center', lineHeight: 1 },
            { id: 'imagen', name: 'imagen', type: 'image', x: 140, y: 380, width: 800, height: 800, src: 'https://placehold.co/800x800/ffffff/cccccc?text=Imagen' },
            { id: 'subtitulo', name: 'subtitulo', type: 'text', x: 80, y: 1280, width: 920, text: 'Mensaje principal de la story', fontSize: 60, fontWeight: 700, fontFamily: 'Roboto', fill: COLORS.blanco, align: 'center', lineHeight: 1.2 },
            { id: 'cta_box', type: 'figure', subType: 'rect', x: 240, y: 1620, width: 600, height: 130, fill: COLORS.amarillo, cornerRadius: 20 },
            { id: 'cta', name: 'cta', type: 'text', x: 240, y: 1645, width: 600, text: '👉 DESLIZA', fontSize: 64, fontWeight: 900, fontFamily: 'Roboto', fill: COLORS.azulMarino, align: 'center' },
        ],
    }],
};

// ── 9) BANNER NEGOCIO — info de contacto ───────────────────
export const bannerNegocio = {
    width: 1080, height: 1080,
    pages: [{
        id: 'p1', background: COLORS.azulMarino,
        children: [
            { id: 'logo_circle', type: 'figure', subType: 'circle', x: 440, y: 80, width: 200, height: 200, fill: COLORS.amarillo },
            { id: 'logo_text', type: 'text', x: 440, y: 140, width: 200, text: 'RM', fontSize: 96, fontWeight: 900, fontFamily: 'Roboto', fill: COLORS.azulMarino, align: 'center' },
            { id: 'nombre', name: 'nombre', type: 'text', x: 0, y: 320, width: 1080, text: 'NOMBRE DEL NEGOCIO', fontSize: 64, fontWeight: 900, fontFamily: 'Roboto', fill: COLORS.amarillo, align: 'center' },
            { id: 'telefono_label', type: 'text', x: 0, y: 480, width: 1080, text: '📞 TELEFONO', fontSize: 32, fontWeight: 700, fontFamily: 'Roboto', fill: '#cbd5e1', align: 'center' },
            { id: 'telefono', name: 'telefono', type: 'text', x: 0, y: 530, width: 1080, text: '809-000-0000', fontSize: 48, fontWeight: 900, fontFamily: 'Roboto', fill: COLORS.blanco, align: 'center' },
            { id: 'direccion_label', type: 'text', x: 0, y: 640, width: 1080, text: '📍 DIRECCION', fontSize: 32, fontWeight: 700, fontFamily: 'Roboto', fill: '#cbd5e1', align: 'center' },
            { id: 'direccion', name: 'direccion', type: 'text', x: 80, y: 690, width: 920, text: 'Direccion del negocio', fontSize: 40, fontWeight: 400, fontFamily: 'Roboto', fill: COLORS.blanco, align: 'center', lineHeight: 1.3 },
            { id: 'horario_label', type: 'text', x: 0, y: 830, width: 1080, text: '🕐 HORARIO', fontSize: 32, fontWeight: 700, fontFamily: 'Roboto', fill: '#cbd5e1', align: 'center' },
            { id: 'horario', name: 'horario', type: 'text', x: 0, y: 880, width: 1080, text: 'Lun-Sab 8:00am - 6:00pm', fontSize: 40, fontWeight: 400, fontFamily: 'Roboto', fill: COLORS.blanco, align: 'center' },
        ],
    }],
};

// ── 10) AGRADECIMIENTO CLIENTE ─────────────────────────────
export const agradecimientoCliente = {
    width: 1080, height: 1080,
    pages: [{
        id: 'p1', background: COLORS.rojo,
        children: [
            { id: 'icono', type: 'text', x: 0, y: 80, width: 1080, text: '💚', fontSize: 140, align: 'center' },
            { id: 'etiqueta', type: 'text', x: 0, y: 260, width: 1080, text: 'GRACIAS', fontSize: 96, fontWeight: 900, fontFamily: 'Roboto', fill: COLORS.amarillo, align: 'center', letterSpacing: 6 },
            { id: 'nombre_cliente', name: 'nombre_cliente', type: 'text', x: 0, y: 400, width: 1080, text: 'A nuestros clientes', fontSize: 52, fontWeight: 700, fontFamily: 'Roboto', fill: COLORS.blanco, align: 'center' },
            { id: 'mensaje', name: 'mensaje', type: 'text', x: 100, y: 540, width: 880, text: 'Su confianza es lo que nos motiva a seguir mejorando cada dia.', fontSize: 36, fontWeight: 400, fontFamily: 'Roboto', fill: COLORS.blanco, align: 'center', lineHeight: 1.4 },
            { id: 'firma', type: 'text', x: 0, y: 900, width: 1080, text: '— El equipo', fontSize: 32, fontWeight: 700, fontFamily: 'Roboto', fill: COLORS.amarillo, align: 'center' },
        ],
    }],
};

// ── Indice por slug — el motor lo usa para buscar la plantilla ──
export const TEMPLATE_CONTENTS = {
    'oferta-del-dia':             ofertaDelDia,
    'nuevo-producto':             nuevoProducto,
    'comunicado-urgente':         comunicadoUrgente,
    'promocion-2x1':              promocion2x1,
    'reposicion-stock':           reposicionStock,
    'comparativa-antes-despues':  comparativaAntesDespues,
    'catalogo-grid':              catalogoGrid,
    'story-instagram':            storyInstagram,
    'banner-negocio':             bannerNegocio,
    'agradecimiento-cliente':     agradecimientoCliente,
};

// ── Helper: inyecta valores del copy IA + producto en un documento ──
// Recibe el content de Polotno y un mapa { titulo, subtitulo, cta, precio, foto }
// Devuelve una copia del content con los textos/imagenes reemplazados.
export function injectAiCopy(content, values = {}) {
    if (!content?.pages) return content;
    const clone = JSON.parse(JSON.stringify(content));
    for (const page of clone.pages) {
        for (const child of (page.children || [])) {
            if (!child?.name) continue;
            const value = values[child.name];
            if (value === undefined || value === null) continue;
            if (child.type === 'text') {
                child.text = String(value);
            } else if (child.type === 'image') {
                child.src = String(value);
            }
        }
    }
    return clone;
}
