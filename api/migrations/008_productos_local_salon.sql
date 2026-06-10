-- ============================================================
-- MIGRACIÓN 008: Reasignar el catálogo de la bodega al local "Salon"
-- ============================================================
-- Contexto: tras la multiempresa (002) y la activación de la distribuidora
-- (007), TODOS los productos actuales son de la BODEGA (EmpresaId=1). Pero
-- muchos conservan un producto.LocalId heredado de technow
-- (0=TODOS, 1=SALON, 2=DISTRIBUIDORA) que el listado de Productos muestra en
-- la columna "Local", dando la falsa impresión de que hay productos de la
-- distribuidora mezclados.
--
-- producto.LocalId quedó DEPRECADO en la 002 (el stock por sucursal vive en
-- productoalmacen), así que reasignarlo es puramente cosmético para el listado:
-- hace que todo el catálogo de la bodega se muestre con su local real ("Salon").
--
-- Idempotente: se puede correr varias veces sin efecto adicional.
-- ============================================================

BEGIN;

DO $$
DECLARE
  v_salon INTEGER;
  v_afectados INTEGER;
BEGIN
  -- Local de la bodega (almacén SALON = local 1 según la 005/007).
  -- Se resuelve por nombre para no depender del Id exacto del import.
  SELECT LocalId INTO v_salon
    FROM local
   WHERE LocalNombre ILIKE 'salon'
   ORDER BY LocalId
   LIMIT 1;

  IF v_salon IS NULL THEN
    RAISE EXCEPTION
      'No se encontró un local llamado "Salon". Revisá los nombres con: SELECT LocalId, LocalNombre FROM local;';
  END IF;

  UPDATE producto
     SET LocalId = v_salon
   WHERE EmpresaId = 1
     AND LocalId IS DISTINCT FROM v_salon;

  GET DIAGNOSTICS v_afectados = ROW_COUNT;
  RAISE NOTICE 'Productos de la bodega reasignados al local Salon (LocalId=%): % filas', v_salon, v_afectados;
END $$;

COMMIT;

-- ============================================================
-- VERIFICACIÓN (debería mostrar todo el catálogo de empresa 1 bajo "Salon")
-- SELECT l.LocalNombre, COUNT(*) AS productos
--   FROM producto p
--   LEFT JOIN local l ON p.LocalId = l.LocalId
--  WHERE p.EmpresaId = 1
--  GROUP BY l.LocalNombre
--  ORDER BY productos DESC;
-- ============================================================
