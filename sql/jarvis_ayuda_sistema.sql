-- =====================================================================
-- "¿Cómo hago X?" — que Jarvis sepa usar MotoFlow
-- ---------------------------------------------------------------------
-- (2026-08-09) El caso que va en el paquete premium: el usuario que no sabe
-- hacer algo en el sistema. No hace falta que Jarvis toque un dato para
-- resolverlo — basta con que sepa dónde está cada cosa y ofrezca abrirla.
--
-- >>> POR QUÉ ESTA TABLA Y NO METERLO EN EL PROMPT <<<
-- Porque va a crecer con cada pregunta que nadie supo contestar, y un prompt
-- que crece se paga en cada llamada. Aquí se busca lo que hace falta y se le
-- pasa solo eso. Además, cada entrada nueva la puede escribir Elvido o el
-- propio Jarvis sin desplegar nada.
--
-- >>> POR QUÉ tenant_id ANULABLE <<<
-- NULL = vale para todas las empresas: así se escribe una vez y lo tienen
-- todos los clientes de MotoFlow. Con valor = solo esa empresa, para cuando
-- alguien hace las cosas a su manera. Si hay las dos, gana la de la empresa.
--
-- >>> LO QUE ESTA CARGA *NO* TRAE <<<
-- El paso a paso fino de cada pantalla. Se siembra lo que está verificado
-- contra el código y la documentación: qué resuelve cada módulo, cómo se
-- llama y los atajos que sí existen. Inventar pasos sería peor que no
-- tenerlos — la persona los intenta, no le salen, y encima duda de sí misma.
-- El resto se llena entrenando, que es justo lo que sigue.
--
-- Idempotente / re-ejecutable. No pisa lo que se haya editado a mano.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.sistema_ayuda (
  id         bigserial PRIMARY KEY,
  -- Clave del panel en componentHapping de PanelContext ('ventas',
  -- 'cierre-caja'...). Es lo que permite pasar de "cómo se hace" a "te lo
  -- abro" sin que Jarvis adivine el nombre de la pantalla.
  modulo     text,
  titulo     text NOT NULL,
  contenido  text NOT NULL,
  -- Cómo lo diría alguien que NO conoce el sistema. "cobrar", "abonar" y
  -- "recibo" son la misma pregunta; el módulo se llama de una sola manera.
  sinonimos  text,
  tenant_id  uuid REFERENCES public.config_empresa(tenant_id) ON DELETE CASCADE,
  activo     boolean NOT NULL DEFAULT true,
  creado_en  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, titulo)
);

CREATE INDEX IF NOT EXISTS idx_sistema_ayuda_modulo ON public.sistema_ayuda (modulo);

ALTER TABLE public.sistema_ayuda ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sistema_ayuda_lectura ON public.sistema_ayuda;
CREATE POLICY sistema_ayuda_lectura ON public.sistema_ayuda
  FOR SELECT TO authenticated
  USING (tenant_id IS NULL OR tenant_id = public.get_user_tenant());

-- Las globales solo las toca el super-admin: cambian lo que Jarvis le dice a
-- todos los clientes. Las de la empresa, el admin de esa empresa.
DROP POLICY IF EXISTS sistema_ayuda_escritura ON public.sistema_ayuda;
CREATE POLICY sistema_ayuda_escritura ON public.sistema_ayuda
  FOR ALL TO authenticated
  USING (
    CASE WHEN tenant_id IS NULL
      THEN EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_superadmin = true)
      ELSE tenant_id = public.get_user_tenant()
    END
  )
  WITH CHECK (
    CASE WHEN tenant_id IS NULL
      THEN EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_superadmin = true)
      ELSE tenant_id = public.get_user_tenant()
    END
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sistema_ayuda TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.sistema_ayuda_id_seq TO authenticated;

-- ------------------------------------------------------------
-- LA BÚSQUEDA
-- ------------------------------------------------------------
-- Se reutiliza _sin_tildes() de fix_hermes_busqueda_tildes_y_modelos.sql:
-- nadie escribe "cómo emito un comprobante fiscal" con tilde cuando está
-- apurado, y "devolucion" tiene que encontrar "devolución".
CREATE OR REPLACE FUNCTION public.mcp_buscar_ayuda(p_texto text, p_limite int DEFAULT 4)
RETURNS TABLE (modulo text, titulo text, contenido text, coincidencias int)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH palabras AS (
    -- Se descartan las de 3 letras o menos: "de", "que", "un" están en todas
    -- las entradas y harían que todo coincida con todo.
    SELECT DISTINCT w FROM unnest(
      string_to_array(regexp_replace(public._sin_tildes(p_texto), '[^a-z0-9 ]', ' ', 'g'), ' ')
    ) AS w
    WHERE length(w) > 3
  ),
  candidatas AS (
    SELECT a.modulo, a.titulo, a.contenido, a.tenant_id,
           (SELECT COUNT(*) FROM palabras p
             WHERE public._sin_tildes(a.titulo || ' ' || COALESCE(a.sinonimos, '') || ' ' || a.contenido)
                   LIKE '%' || p.w || '%')::int AS coincidencias
    FROM public.sistema_ayuda a
    WHERE a.activo = true
      AND (a.tenant_id IS NULL OR a.tenant_id = public.get_user_tenant())
  )
  SELECT modulo, titulo, contenido, coincidencias
  FROM candidatas
  WHERE coincidencias > 0
  -- La de la empresa antes que la global: si alguien escribió su propia
  -- versión, es porque lo hace distinto y la general le estorba.
  ORDER BY coincidencias DESC, (tenant_id IS NOT NULL) DESC
  LIMIT GREATEST(1, LEAST(COALESCE(p_limite, 4), 10));
$$;

REVOKE EXECUTE ON FUNCTION public.mcp_buscar_ayuda(text, int) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.mcp_buscar_ayuda(text, int) TO authenticated;

-- ------------------------------------------------------------
-- LO QUE YA SE SABE (verificado contra el código y docs/MODULES.md)
-- ------------------------------------------------------------
INSERT INTO public.sistema_ayuda (modulo, titulo, sinonimos, contenido) VALUES

('ventas', 'Facturar una venta',
 'factura facturar vender venta cobrar cliente pos caja mostrador comprobante b01 b02',
 'Módulo Ventas (facturación POS). Se escribe el código del producto y Enter para agregarlo a la factura; F3 abre el buscador si no se sabe el código. F10 graba. Si la pieza está agotada, el sistema sugiere equivalentes. El tipo de comprobante (B01 con RNC, B02 consumo) se elige arriba, antes de grabar.'),

('ventas', 'No deja facturar por debajo del costo',
 'costo bajo precio minimo margen bloqueo no me deja rebajar descuento',
 'Es una regla del sistema, no un error: no se puede facturar por debajo del costo del producto. El margen mínimo se configura por empresa. Si hace falta vender más barato, hay que revisar el costo del producto en Mercancías o pedirle al administrador que ajuste el margen mínimo.'),

('recibo-ingreso', 'Cobrar a un cliente o registrar un abono',
 'cobrar abono abonar pago cliente debe deuda recibo ingreso saldar credito',
 'Módulo Recibo de Ingreso. Es donde se registran los cobros a clientes y se aplican a sus facturas pendientes o como abono. No se cobra desde Ventas: Ventas emite la factura, el Recibo de Ingreso registra el dinero que entra.'),

('cotizaciones', 'Hacer una cotización',
 'cotizar cotizacion presupuesto precio para cliente oferta',
 'Módulo Cotizaciones. Se arma igual que una factura pero no descuenta inventario ni genera comprobante fiscal. Las cotizaciones retienen la mercancía 15 días.'),

('compras', 'Registrar la compra de mercancía',
 'compra comprar suplidor proveedor recibir mercancia factura suplidor entrada ocr foto',
 'Módulo Compras. Hay tres formas de cargar las líneas: escribir el código en la fila amarilla, buscar el producto en el modal, o subir una foto de la factura del suplidor para que la lea sola (OCR). Si el OCR trae un código que no existe en el catálogo, la línea sale en rojo con un botón + para crear el producto en el momento.'),

('orden-compra', 'Hacer una orden de compra al suplidor',
 'orden compra oc pedir suplidor reponer reposicion que comprar',
 'Módulo Orden de Compra. Además de la orden manual tiene Orden Automática (propone qué reponer según existencias mínimas) y Compra Inteligente, que ordena por presupuesto de caja disponible y prioriza según rotación y margen.'),

('devoluciones', 'Devolver mercancía o anular una venta',
 'devolucion devolver nota credito anular factura equivocada cliente devolvio',
 'Módulo Devoluciones. Genera la nota de crédito de la factura. Una factura ya emitida no se borra: se le hace la nota de crédito, que la deja anulada y devuelve la mercancía al inventario.'),

('mercancias', 'Crear o modificar un producto',
 'producto articulo pieza crear nuevo cambiar precio costo catalogo maestro codigo',
 'Módulo Mercancías. Es el maestro de productos: código, descripción, costo, precio, ITBIS, ubicación, mínimos y máximos. También administra los productos Equivalentes (piezas que sirven para lo mismo), que son los que el sistema sugiere cuando algo se agota.'),

('entrada-mercancia', 'Ajustar el inventario a mano',
 'ajuste entrada salida cuadrar inventario sobra falta mercancia agregar quitar existencia',
 'Entrada de Mercancía suma existencia; Salida de Mercancía la resta. Son ajustes manuales y quedan en el kardex con su motivo. Para un conteo completo del almacén, es mejor Inventario Físico que ir pieza por pieza.'),

('inventario-fisico', 'Hacer un conteo de inventario',
 'conteo contar inventario fisico cuadrar almacen auditoria',
 'Módulo Inventario Físico. Se registra lo contado y el sistema calcula la diferencia contra la existencia del kardex.'),

('cierre-caja', 'Cuadrar la caja del día',
 'cierre caja cuadre efectivo cuadrar dinero fin del dia arqueo desglose',
 'Cierre de Caja (dentro de Configuración). Muestra lo vendido, lo cobrado, los gastos y los desembolsos del día para cuadrar contra el efectivo real. Lo ANULADO no cuenta: facturas, recibos y pagos anulados quedan fuera del cuadre.'),

('clientes', 'Registrar un cliente o darle crédito',
 'cliente nuevo registrar credito limite dias plazo ficha datos',
 'Módulo Clientes. Ahí se registra el cliente y se le fija el límite de crédito y los días de plazo. Sin límite de crédito no se le puede facturar a crédito.'),

('cuentas-bancarias', 'Ver el saldo de una cuenta de banco',
 'banco cuenta saldo transferencia deposito bancaria movimientos',
 'Módulo Cuentas Bancarias. Muestra el saldo en vivo de cada cuenta y sus movimientos, incluidas las transferencias entre cuentas.'),

('solicitudes', 'Un cliente pidió algo que no tenemos',
 'no tengo agotado pedido cliente pidio conseguir buscar pieza falta encargar',
 'Módulo Solicitudes. Se anota lo que el cliente pidió y no había. Cuando esa pieza entra al inventario, el sistema avisa para llamar al cliente — el aviso se dispara solo con la entrada de mercancía.'),

('prestamos', 'Registrar un préstamo o un pago de préstamo',
 'prestamo cuota financiamiento pagar cuota mora garantia motor',
 'Módulo Préstamos para crearlos y consultarlos; Recibo de Pago para registrar el pago de una cuota. La mora se calcula sola según lo configurado para la empresa o para ese cliente.'),

('gestion-cobro', 'Ver quién debe y a quién hay que cobrarle',
 'cobranza cobrar atrasado mora vencido deudores gestion cobro llamar',
 'Módulo Gestión de Cobro. Lista los clientes con cuotas vencidas y su atraso, para organizar las llamadas del día.'),

('reportes-dgii', 'Sacar los reportes de la DGII',
 'dgii 606 607 impuestos reporte fiscal declaracion ncf comprobante',
 'Módulo Reportes DGII. Genera los formatos para la declaración. Los comprobantes fiscales y sus secuencias se administran en Configuración → Comprobantes Fiscales.'),

('usuarios', 'Crear un usuario o cambiarle los permisos',
 'usuario empleado permiso acceso clave contrasena rol vendedor admin',
 'Configuración → Usuarios y Permisos. Ahí se crea el usuario, se le pone el rol y se marcan los módulos que puede ver. Un usuario solo ve en el menú lo que tiene permitido.')

ON CONFLICT (tenant_id, titulo) DO NOTHING;

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('jarvis_ayuda_sistema.sql');
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

-- ------------------------------------------------------------
-- VERIFICACIÓN
-- ------------------------------------------------------------
SELECT titulo, modulo, coincidencias FROM public.mcp_buscar_ayuda('como registro un abono de un cliente');
SELECT titulo, modulo, coincidencias FROM public.mcp_buscar_ayuda('no me deja poner el precio mas barato');
SELECT COUNT(*) AS entradas FROM public.sistema_ayuda;

-- Para entrenarlo, una entrada nueva es esto y nada más:
-- INSERT INTO public.sistema_ayuda (modulo, titulo, sinonimos, contenido)
-- VALUES ('cierre-caja', 'Título', 'como lo diría alguien que no sabe', 'Los pasos.');
