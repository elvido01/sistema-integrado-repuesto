-- =====================================================================
-- EL CHASIS EN LA DESCRIPCIÓN DE LA FACTURA (22/10/2026)
-- ---------------------------------------------------------------------
-- La DGII ahora exige el número de chasis en la descripción de la factura
-- para poder endosar la matrícula. En MotoFlow el CÓDIGO de la moto ES su
-- chasis (confirmado con las matrículas de FT-79 y FT-82 de Caminero
-- Motors: LLCLGL306RA123016 y LLCLGM3KXTX104027).
--
-- Un trigger en facturas_detalle, al guardar la línea, agrega
-- " CHASIS: <código>" cuando el código tiene forma de chasis (17 letras y
-- números, con letras y con números: los códigos de repuestos no son así)
-- y la descripción todavía no lo trae. Al ser en la línea, sale igual en
-- TODOS los formatos de impresión y en el comprobante electrónico
-- (NombreItem, máx. 80: la descripción se recorta para que quepa el
-- chasis completo). Vale para cualquier punto de venta (POS, móvil,
-- financiamiento) y para todas las empresas que venden vehículos.
--
-- Además se corrigen las dos facturas que el dueño tiene que reimprimir.
-- Su comprobante electrónico ya está firmado y no cambia: lo que cambia es
-- la descripción impresa.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.factura_linea_con_chasis(p_codigo text, p_descripcion text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN upper(btrim(coalesce(p_codigo, ''))) ~ '^[A-Z0-9]{17}$'
     AND upper(btrim(p_codigo)) ~ '[0-9]' AND upper(btrim(p_codigo)) ~ '[A-Z]'
     AND position(upper(btrim(p_codigo)) IN upper(coalesce(p_descripcion, ''))) = 0
    THEN btrim(left(regexp_replace(btrim(coalesce(p_descripcion, '')), '\s+', ' ', 'g'), 80 - 26))
         || ' CHASIS: ' || upper(btrim(p_codigo))
    ELSE p_descripcion
  END
$$;

CREATE OR REPLACE FUNCTION public.trg_factura_linea_chasis()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.descripcion := public.factura_linea_con_chasis(NEW.codigo, NEW.descripcion);
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS factura_linea_chasis ON public.facturas_detalle;
CREATE TRIGGER factura_linea_chasis BEFORE INSERT OR UPDATE OF codigo, descripcion ON public.facturas_detalle
  FOR EACH ROW EXECUTE FUNCTION public.trg_factura_linea_chasis();

-- Las dos que el dueño va a reimprimir (Caminero Motors).
UPDATE public.facturas_detalle d SET descripcion = d.descripcion
  FROM public.facturas f
 WHERE f.id = d.factura_id
   AND f.tenant_id = 'b39506c3-27dc-467d-830b-096731b83113'
   AND f.ncf IN ('E320000000001', 'E320000000003')
   AND d.codigo IN ('LLCLGL306RA123016', 'LLCLGM3KXTX104027');

SELECT public.registrar_migracion('factura_chasis_en_descripcion.sql');
