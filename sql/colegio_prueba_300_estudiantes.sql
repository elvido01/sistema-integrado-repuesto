-- =====================================================================
-- Centenario: 300 estudiantes DE PRUEBA (08/11/2026)
-- ---------------------------------------------------------------------
-- Pedido del dueño para hacer pruebas. Datos INVENTADOS (nombres al azar,
-- teléfonos 809-555-xxxx, correos @ejemplo.com). Todo queda marcado:
--   edu_familias.notas = 'PRUEBA'  ·  edu_estudiantes.notas = 'PRUEBA'
-- para borrarlo después con un solo SQL.
--
-- · ~190 familias: la mayoría con 1 hijo, algunas con 2 o 3 (los hermanos
--   comparten familia y tarifa, como pide el colegio).
-- · Respeta los cupos de cada curso/tanda (si una tanda está llena prueba la
--   otra; si el curso entero está lleno, prueba otro curso).
-- · Edad según el curso; tarifas de la lista activa; ~5% con beca 50%;
--   ~15% en Sala de Tareas; ~30% nuevo ingreso.
-- · No crea cargos ni cobros (igual que una inscripción real: se generan en
--   la Caja del Colegio).
-- Solo toca la empresa COLEGIO CON INGLÉS NUEVO CENTENARIO.
-- =====================================================================

DO $prueba$
DECLARE
  v_t uuid := '8bcd59ef-9502-486c-b919-c77b991387bb';
  nombres_h text[] := ARRAY['JUAN','LUIS','CARLOS','JOSÉ','MIGUEL','ÁNGEL','DAVID','DANIEL','JORGE','PEDRO','RAFAEL','FRANCISCO','MANUEL','RAMÓN','ELVIN','JOEL','KEVIN','BRYAN','JEAN CARLOS','ENMANUEL','JOSUÉ','ADRIÁN','SAMUEL','GABRIEL','MATEO','SEBASTIÁN','DIEGO','ANDRÉS','LIAM','DYLAN'];
  nombres_m text[] := ARRAY['MARÍA','ANA','ROSA','CARMEN','LAURA','PAOLA','DAYANA','YAFREISY','NICOLE','ASHLEY','MELANIE','VALERIA','CAMILA','SOFÍA','ISABELLA','GÉNESIS','ESTEFANY','KATHERINE','LUZ','PAULA','DANIELA','GABRIELA','NATALIA','ARIANNY','YOMAIRA','EMILY','MIA','LUCÍA','ALEXA','SARAH'];
  apellidos text[] := ARRAY['PÉREZ','RODRÍGUEZ','GÓMEZ','MARTÍNEZ','GARCÍA','FERNÁNDEZ','LÓPEZ','DÍAZ','SÁNCHEZ','RAMÍREZ','TORRES','REYES','CRUZ','MORALES','JIMÉNEZ','HERNÁNDEZ','CASTILLO','ROSARIO','SANTANA','MEJÍA','PEÑA','VARGAS','ABREU','BATISTA','DE LA CRUZ','GUZMÁN','ALMONTE','POLANCO','TAVERAS','NÚÑEZ','FRÍAS','UREÑA','MARTE','ENCARNACIÓN','DE LEÓN','FLORES','MEDINA','SORIANO','PAULINO','CABRERA'];
  sectores text[] := ARRAY['CENTRO','LOS JARDINES','VILLA OLGA','LA ESPERANZA','EL EMBRUJO','CIENFUEGOS','LOS PRADOS','VILLA MARÍA','PUEBLO NUEVO','LAS COLINAS'];
  oficios text[] := ARRAY['COMERCIANTE','MAESTRA','CONTADOR','ENFERMERA','INGENIERO','MÉDICO','CHOFER','SECRETARIA','ABOGADO','INDEPENDIENTE','POLICÍA','ESTILISTA','MECÁNICO','AMA DE CASA','VENDEDOR'];
  estados text[] := ARRAY['casados','casados','casados','union_libre','union_libre','separados','divorciados'];
  cursos record; v_cursos uuid[]; v_edades int[]; v_tandas text[][];
  tarifas uuid[]; montos numeric[];
  v_hechos int := 0; v_fam uuid; v_hijos int; v_ap1 text; v_ap2 text; v_madre text; v_padre text;
  v_tar int; v_ci int; v_curso uuid; v_tanda text; v_ok boolean; v_intento int; v_cupo int; v_ocup int;
  v_tandas_c text[]; v_cupos jsonb; v_edad int; v_es_nina boolean; v_nombre text; v_n int := 0;
BEGIN
  PERFORM setseed(0.4242);
  -- Cursos activos con la edad típica (por orden: Párvulo 3 años … 6to de Secundaria 17).
  SELECT array_agg(id ORDER BY orden), array_agg(2 + row_number ORDER BY orden)
    INTO v_cursos, v_edades
    FROM (SELECT id, orden, row_number() OVER (ORDER BY orden) FROM public.edu_cursos WHERE tenant_id = v_t AND activo) x;
  SELECT array_agg(id ORDER BY monto), array_agg(monto ORDER BY monto) INTO tarifas, montos
    FROM public.edu_tarifas WHERE tenant_id = v_t AND activa;
  IF v_cursos IS NULL OR tarifas IS NULL THEN RAISE EXCEPTION 'Faltan cursos o tarifas en el Centenario'; END IF;

  WHILE v_hechos < 300 LOOP
    v_n := v_n + 1;
    v_ap1 := apellidos[1 + floor(random() * array_length(apellidos, 1))::int];
    v_ap2 := apellidos[1 + floor(random() * array_length(apellidos, 1))::int];
    v_madre := nombres_m[1 + floor(random() * 30)::int] || ' ' || v_ap2 || ' ' || apellidos[1 + floor(random() * array_length(apellidos, 1))::int];
    v_padre := nombres_h[1 + floor(random() * 30)::int] || ' ' || v_ap1 || ' ' || apellidos[1 + floor(random() * array_length(apellidos, 1))::int];
    INSERT INTO public.edu_familias (tenant_id, nombre, direccion, sector, telefono_residencial,
        madre_nombre, madre_profesion, madre_celular, madre_correo,
        padre_nombre, padre_profesion, padre_celular, estado_padres, notas)
      VALUES (v_t, v_ap1 || ' ' || v_ap2,
        'CALLE ' || (1 + floor(random() * 40)::int) || ' #' || (1 + floor(random() * 120)::int),
        sectores[1 + floor(random() * 10)::int],
        '809-555-' || lpad((1000 + v_n)::text, 4, '0'),
        v_madre, oficios[1 + floor(random() * 15)::int], '829-555-' || lpad((2000 + v_n)::text, 4, '0'),
        lower(replace(split_part(v_madre, ' ', 1), 'Í', 'I')) || v_n || '@ejemplo.com',
        CASE WHEN random() < 0.85 THEN v_padre END, oficios[1 + floor(random() * 15)::int], '849-555-' || lpad((3000 + v_n)::text, 4, '0'),
        estados[1 + floor(random() * 7)::int], 'PRUEBA')
      RETURNING id INTO v_fam;

    v_hijos := CASE WHEN random() < 0.6 THEN 1 WHEN random() < 0.75 THEN 2 ELSE 3 END;
    v_tar := 1 + floor(random() * array_length(tarifas, 1))::int;      -- hermanos: misma tarifa
    FOR h IN 1..v_hijos LOOP
      EXIT WHEN v_hechos >= 300;
      v_ok := false; v_intento := 0;
      WHILE NOT v_ok AND v_intento < 40 LOOP
        v_intento := v_intento + 1;
        v_ci := 1 + floor(random() * array_length(v_cursos, 1))::int;
        v_curso := v_cursos[v_ci];
        SELECT tandas, cupos INTO v_tandas_c, v_cupos FROM public.edu_cursos WHERE id = v_curso;
        v_tanda := v_tandas_c[1 + floor(random() * array_length(v_tandas_c, 1))::int];
        v_cupo := NULLIF(v_cupos ->> v_tanda, '')::int;
        SELECT count(*) INTO v_ocup FROM public.edu_estudiantes
         WHERE tenant_id = v_t AND curso_id = v_curso AND tanda = v_tanda AND estado IN ('activo', 'por_confirmar');
        v_ok := v_cupo IS NULL OR v_ocup < v_cupo;
      END LOOP;
      IF NOT v_ok THEN RAISE EXCEPTION 'No hay cupo para tantos estudiantes (van %)', v_hechos; END IF;

      v_edad := v_edades[v_ci];
      v_es_nina := random() < 0.5;
      v_nombre := CASE WHEN v_es_nina THEN nombres_m[1 + floor(random() * 30)::int] ELSE nombres_h[1 + floor(random() * 30)::int] END
                  || CASE WHEN random() < 0.4 THEN ' ' || CASE WHEN v_es_nina THEN nombres_m[1 + floor(random() * 30)::int] ELSE nombres_h[1 + floor(random() * 30)::int] END ELSE '' END;
      INSERT INTO public.edu_estudiantes (tenant_id, familia_id, nombres, apellidos, fecha_nacimiento, lugar_nacimiento,
          curso_id, tanda, condicion, tarifa_mensual, tarifa_id, beca_pct, beca_motivo, sala_tareas,
          numero_hermanos, posicion_familia, estado, notas)
        VALUES (v_t, v_fam, v_nombre, v_ap1 || ' ' || v_ap2,
          make_date(2026 - v_edad, 1 + floor(random() * 12)::int, 1 + floor(random() * 28)::int),
          CASE WHEN random() < 0.7 THEN 'SANTO DOMINGO' ELSE 'SANTIAGO' END,
          v_curso, v_tanda, CASE WHEN random() < 0.3 THEN 'nuevo' ELSE 'continuante' END,
          montos[v_tar], tarifas[v_tar],
          CASE WHEN random() < 0.05 THEN 50 ELSE 0 END, NULL, random() < 0.15,
          v_hijos - 1, h || ' de ' || v_hijos, 'activo', 'PRUEBA');
      v_hechos := v_hechos + 1;
    END LOOP;
  END LOOP;
  -- La beca necesita motivo.
  UPDATE public.edu_estudiantes SET beca_motivo = 'PRUEBA: hijo de personal'
   WHERE tenant_id = v_t AND notas = 'PRUEBA' AND beca_pct > 0;
  RAISE NOTICE 'Listo: % estudiantes de prueba en % familias', v_hechos, v_n;
END $prueba$;

-- Resumen por curso (para ver que respetó los cupos):
SELECT c.nombre, e.tanda, count(*) AS estudiantes, c.cupos ->> e.tanda AS cupo
  FROM public.edu_estudiantes e JOIN public.edu_cursos c ON c.id = e.curso_id
 WHERE e.tenant_id = '8bcd59ef-9502-486c-b919-c77b991387bb' AND e.estado = 'activo'
 GROUP BY c.nombre, c.orden, e.tanda, c.cupos ORDER BY c.orden, e.tanda;

SELECT public.registrar_migracion('colegio_prueba_300_estudiantes.sql');
