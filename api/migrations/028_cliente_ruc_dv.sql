-- ============================================================
-- MIGRACIÓN 028: DV editable dentro de ClienteRUC
-- ============================================================
-- Hasta ahora el dígito verificador no se guardaba: el formulario lo calculaba
-- al vuelo y la factura lo recalculaba al imprimir. El cliente necesita poder
-- corregirlo a mano (RUC de contribuyentes cuyo DV no sale del cálculo estándar,
-- documentos extranjeros, etc.), así que pasa a persistirse.
--
-- Se guarda dentro del campo que ya existe, con guion: "1234567-8". No se agrega
-- columna nueva porque ClienteRUC ya viaja por JOIN a ventas, facturas y
-- reportes — guardándolo ahí, todos esos puntos muestran el DV corregido sin
-- tocar una sola query.
--
-- Esta migración hace dos cosas:
--   1) asegura que la columna tenga ancho para los 2 caracteres extra;
--   2) backfill: agrega "-DV" (calculado) a los RUC que todavía no lo traen.
-- Los que ya tienen guion no se tocan. Aditiva sobre datos: no borra nada.
-- ============================================================

BEGIN;

-- 1) Ancho suficiente para el guion + el dígito. Sólo actúa si es un varchar
--    acotado que se quedaría corto; si es text o ya es holgado, no hace nada.
DO $$
DECLARE
  v_len int;
BEGIN
  SELECT character_maximum_length INTO v_len
  FROM information_schema.columns
  WHERE table_name = 'clientes' AND column_name = 'clienteruc';

  IF v_len IS NOT NULL AND v_len < 20 THEN
    ALTER TABLE clientes ALTER COLUMN clienteruc TYPE varchar(20);
    RAISE NOTICE 'clienteruc ampliado de varchar(%) a varchar(20)', v_len;
  END IF;
END $$;

-- 2) Función temporal con el mismo algoritmo que calcularDV() del frontend
--    (client/src/utils/utils.ts): módulo 11, pesos cíclicos 2..9 de derecha a
--    izquierda. Se mantiene fiel al frontend, incluidos los casos resto 0 -> "0"
--    y resto 1 -> "1", para que backfill y UI coincidan.
CREATE OR REPLACE FUNCTION mig028_calcular_dv(p_base text) RETURNS text AS $$
DECLARE
  v_num  text := regexp_replace(COALESCE(p_base, ''), '\D', '', 'g');
  v_len  int;
  v_suma int := 0;
  v_resto int;
  j int;
BEGIN
  IF v_num = '' OR v_num = '0' THEN
    RETURN '';
  END IF;
  v_len := length(v_num);
  -- j = posición desde la derecha (0-based); peso = 2 + (j mod 8)
  FOR j IN 0 .. v_len - 1 LOOP
    v_suma := v_suma + substr(v_num, v_len - j, 1)::int * (2 + (j % 8));
  END LOOP;
  v_resto := v_suma % 11;
  IF v_resto = 0 THEN RETURN '0'; END IF;
  IF v_resto = 1 THEN RETURN '1'; END IF;
  RETURN (11 - v_resto)::text;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 3) Backfill: sólo los que tienen RUC, no tienen guion y producen un DV válido.
UPDATE clientes
SET clienteruc = trim(clienteruc) || '-' || mig028_calcular_dv(clienteruc)
WHERE clienteruc IS NOT NULL
  AND trim(clienteruc) <> ''
  AND position('-' IN clienteruc) = 0
  AND mig028_calcular_dv(clienteruc) <> '';

DROP FUNCTION mig028_calcular_dv(text);

COMMIT;

-- ============================================================
-- VERIFICACIÓN
-- SELECT ClienteId, ClienteRUC FROM clientes
--   WHERE ClienteRUC <> '' ORDER BY ClienteId LIMIT 20;
-- Sin DV pendiente (debe dar 0):
-- SELECT COUNT(*) FROM clientes
--   WHERE trim(COALESCE(ClienteRUC,'')) <> '' AND position('-' IN ClienteRUC) = 0;
-- ============================================================
