-- ============================================================
-- MIGRACIÓN 034: corregir Ñ rotas ("?") en clientes y productos
-- ============================================================
-- Datos que vinieron del sistema anterior con la Ñ convertida en "?"
-- (ej. "ACU?A", "?A RUMI", "PI?A 2L"). Censo del 2026-10-27 sobre
-- todas las columnas de texto: sólo aparecen en clientes (nombre, razón social,
-- dirección) y producto (nombre).
--
-- Cada UPDATE va por id Y por el valor viejo exacto: es idempotente y no pisa
-- una fila que alguien ya corrigió o cambió a mano. "?" -> "Ñ", o "ñ" en
-- textos en minúscula (direcciones).
-- Excepciones:
--   * clientes 2137 "KAITO?S" era un apóstrofo -> "KAITO'S".
--   * clientes 1703 razón social "GRUPO DE INVERSIONES FLORENCIA?IZ S.A": no se
--     puede deducir la letra, queda para corregir a mano.
-- ============================================================

BEGIN;

-- clientes.clientenombre (33)
UPDATE clientes SET clientenombre = 'ANDREA CABAÑAS' WHERE clienteid = 1771 AND clientenombre = 'ANDREA CABA?AS';
UPDATE clientes SET clientenombre = 'DIEGO CAÑETES' WHERE clienteid = 1798 AND clientenombre = 'DIEGO CA?ETES';
UPDATE clientes SET clientenombre = 'ROSSANA NUÑEZ' WHERE clienteid = 1826 AND clientenombre = 'ROSSANA NU?EZ';
UPDATE clientes SET clientenombre = 'YRENE ACUÑA BENITEZ' WHERE clienteid = 1892 AND clientenombre = 'YRENE ACU?A BENITEZ';
UPDATE clientes SET clientenombre = 'MERCERIA DIVINO NIÑO' WHERE clienteid = 1935 AND clientenombre = 'MERCERIA DIVINO NI?O';
UPDATE clientes SET clientenombre = 'JULIO CESAR IBAÑEZ' WHERE clienteid = 1950 AND clientenombre = 'JULIO CESAR IBA?EZ';
UPDATE clientes SET clientenombre = 'PEDRO NUÑEZ' WHERE clienteid = 2001 AND clientenombre = 'PEDRO NU?EZ';
UPDATE clientes SET clientenombre = 'ENMANUEL NUÑEZ' WHERE clienteid = 2021 AND clientenombre = 'ENMANUEL NU?EZ';
UPDATE clientes SET clientenombre = 'FELICIA PEÑA' WHERE clienteid = 2057 AND clientenombre = 'FELICIA PE?A';
UPDATE clientes SET clientenombre = 'DESPENSA ÑA INA' WHERE clienteid = 2130 AND clientenombre = 'DESPENSA ?A INA';
UPDATE clientes SET clientenombre = 'DESPENSA ÑA SELVA' WHERE clienteid = 2131 AND clientenombre = 'DESPENSA ?A SELVA';
UPDATE clientes SET clientenombre = 'ÑA AURELIA' WHERE clienteid = 2132 AND clientenombre = '?A AURELIA';
UPDATE clientes SET clientenombre = 'ÑA VALE' WHERE clienteid = 2133 AND clientenombre = '?A VALE';
UPDATE clientes SET clientenombre = 'DESPENSA ÑA LULI' WHERE clienteid = 2134 AND clientenombre = 'DESPENSA ?A LULI';
UPDATE clientes SET clientenombre = 'ÑA VIQUI' WHERE clienteid = 2135 AND clientenombre = '?A VIQUI';
UPDATE clientes SET clientenombre = 'ÑA ELODIA' WHERE clienteid = 2136 AND clientenombre = '?A ELODIA';
UPDATE clientes SET clientenombre = 'KAITO''S' WHERE clienteid = 2137 AND clientenombre = 'KAITO?S';
UPDATE clientes SET clientenombre = 'ÑA BASI' WHERE clienteid = 2138 AND clientenombre = '?A BASI';
UPDATE clientes SET clientenombre = 'SEÑORA SULLY' WHERE clienteid = 2139 AND clientenombre = 'SE?ORA SULLY';
UPDATE clientes SET clientenombre = 'ÑA PORFIRIA AYALA' WHERE clienteid = 2140 AND clientenombre = '?A PORFIRIA AYALA';
UPDATE clientes SET clientenombre = 'ÑA RUMI' WHERE clienteid = 2142 AND clientenombre = '?A RUMI';
UPDATE clientes SET clientenombre = 'MARIA CABRERA CAÑADAS' WHERE clienteid = 2143 AND clientenombre = 'MARIA CABRERA CA?ADAS';
UPDATE clientes SET clientenombre = 'FLORENCIO ACUÑA' WHERE clienteid = 2144 AND clientenombre = 'FLORENCIO ACU?A';
UPDATE clientes SET clientenombre = 'DESPENSA ÑA PERLA' WHERE clienteid = 2145 AND clientenombre = 'DESPENSA ?A PERLA';
UPDATE clientes SET clientenombre = 'DESPENSA ÑA AMADA' WHERE clienteid = 2146 AND clientenombre = 'DESPENSA ?A AMADA';
UPDATE clientes SET clientenombre = 'ÑA GLORIA' WHERE clienteid = 2147 AND clientenombre = '?A GLORIA';
UPDATE clientes SET clientenombre = 'LOURDES ACUÑA' WHERE clienteid = 2148 AND clientenombre = 'LOURDES ACU?A';
UPDATE clientes SET clientenombre = 'ÑA ERMES' WHERE clienteid = 2149 AND clientenombre = '?A ERMES';
UPDATE clientes SET clientenombre = 'NICOLAS MIÑO' WHERE clienteid = 2150 AND clientenombre = 'NICOLAS MI?O';
UPDATE clientes SET clientenombre = 'OLGA GISSELLE ACUÑA SANCHEZ' WHERE clienteid = 2151 AND clientenombre = 'OLGA GISSELLE ACU?A SANCHEZ';
UPDATE clientes SET clientenombre = 'DESPENSA ÑA JULIA' WHERE clienteid = 2175 AND clientenombre = 'DESPENSA ?A JULIA';
UPDATE clientes SET clientenombre = 'ANA ACUÑA' WHERE clienteid = 2202 AND clientenombre = 'ANA ACU?A';
UPDATE clientes SET clientenombre = 'ESTEFANY CABAÑAS' WHERE clienteid = 2214 AND clientenombre = 'ESTEFANY CABA?AS';

-- clientes.clienterazonsocial (24)
UPDATE clientes SET clienterazonsocial = 'ANDREA ACUÑA' WHERE clienteid = 1073 AND clienterazonsocial = 'ANDREA ACU?A';
UPDATE clientes SET clienterazonsocial = 'ÑA RUMI' WHERE clienteid = 1457 AND clienterazonsocial = '?A RUMI';
UPDATE clientes SET clienterazonsocial = 'FLORENCIO ACUÑA' WHERE clienteid = 1671 AND clienterazonsocial = 'FLORENCIO ACU?A';
UPDATE clientes SET clienterazonsocial = 'ÑA GLORIA' WHERE clienteid = 1712 AND clienterazonsocial = '?A GLORIA';
UPDATE clientes SET clienterazonsocial = 'LOURDES ACUÑA' WHERE clienteid = 1761 AND clienterazonsocial = 'LOURDES ACU?A';
UPDATE clientes SET clienterazonsocial = 'ANDREA CABAÑAS' WHERE clienteid = 1771 AND clienterazonsocial = 'ANDREA CABA?AS';
UPDATE clientes SET clienterazonsocial = 'NICOLAS MIÑO' WHERE clienteid = 1777 AND clienterazonsocial = 'NICOLAS MI?O';
UPDATE clientes SET clienterazonsocial = 'OLGA GISSELE ACUÑA SANCHEZ' WHERE clienteid = 1780 AND clienterazonsocial = 'OLGA GISSELE ACU?A SANCHEZ';
UPDATE clientes SET clienterazonsocial = 'DIEGO CAÑETES' WHERE clienteid = 1798 AND clienterazonsocial = 'DIEGO CA?ETES';
UPDATE clientes SET clienterazonsocial = 'ROSSANA NUÑEZ' WHERE clienteid = 1826 AND clienterazonsocial = 'ROSSANA NU?EZ';
UPDATE clientes SET clienterazonsocial = 'YRENE ACUÑA BENITEZ' WHERE clienteid = 1892 AND clienterazonsocial = 'YRENE ACU?A BENITEZ';
UPDATE clientes SET clienterazonsocial = 'MERCERIA DIVINO NIÑO' WHERE clienteid = 1935 AND clienterazonsocial = 'MERCERIA DIVINO NI?O';
UPDATE clientes SET clienterazonsocial = 'JULIO CESAR IBAÑEZ' WHERE clienteid = 1950 AND clienterazonsocial = 'JULIO CESAR IBA?EZ';
UPDATE clientes SET clienterazonsocial = 'PEDRO NUÑEZ' WHERE clienteid = 2001 AND clienterazonsocial = 'PEDRO NU?EZ';
UPDATE clientes SET clienterazonsocial = 'ENMANUEL NUÑEZ' WHERE clienteid = 2021 AND clienterazonsocial = 'ENMANUEL NU?EZ';
UPDATE clientes SET clienterazonsocial = 'FELICIA PEÑA' WHERE clienteid = 2057 AND clienterazonsocial = 'FELICIA PE?A';
UPDATE clientes SET clienterazonsocial = 'ÑA RUMI' WHERE clienteid = 2142 AND clienterazonsocial = '?A RUMI';
UPDATE clientes SET clienterazonsocial = 'FLORENCIO ACUÑA' WHERE clienteid = 2144 AND clienterazonsocial = 'FLORENCIO ACU?A';
UPDATE clientes SET clienterazonsocial = 'ÑA GLORIA' WHERE clienteid = 2147 AND clienterazonsocial = '?A GLORIA';
UPDATE clientes SET clienterazonsocial = 'LOURDES ACUÑA' WHERE clienteid = 2148 AND clienterazonsocial = 'LOURDES ACU?A';
UPDATE clientes SET clienterazonsocial = 'NICOLAS MIÑO' WHERE clienteid = 2150 AND clienterazonsocial = 'NICOLAS MI?O';
UPDATE clientes SET clienterazonsocial = 'OLGA GISSELE ACUÑA SANCHEZ' WHERE clienteid = 2151 AND clienterazonsocial = 'OLGA GISSELE ACU?A SANCHEZ';
UPDATE clientes SET clienterazonsocial = 'ANA ACUÑA' WHERE clienteid = 2202 AND clienterazonsocial = 'ANA ACU?A';
UPDATE clientes SET clienterazonsocial = 'ESTEFANY CABAÑAS' WHERE clienteid = 2214 AND clienterazonsocial = 'ESTEFANY CABA?AS';

-- clientes.clientedireccion (14)
UPDATE clientes SET clientedireccion = 'zona ña claudia' WHERE clienteid = 614 AND clientedireccion = 'zona ?a claudia';
UPDATE clientes SET clientedireccion = 'zona ña claudia' WHERE clienteid = 809 AND clientedireccion = 'zona ?a claudia';
UPDATE clientes SET clientedireccion = 'ña claudia' WHERE clienteid = 912 AND clientedireccion = '?a claudia';
UPDATE clientes SET clientedireccion = 'ña claudia' WHERE clienteid = 1088 AND clientedireccion = '?a claudia';
UPDATE clientes SET clientedireccion = 'estudiantes capiateño' WHERE clienteid = 1099 AND clientedireccion = 'estudiantes capiate?o';
UPDATE clientes SET clientedireccion = 'zona ña claudia' WHERE clienteid = 1168 AND clientedireccion = 'zona ?a claudia';
UPDATE clientes SET clientedireccion = 'ña caludia' WHERE clienteid = 1586 AND clientedireccion = '?a caludia';
UPDATE clientes SET clientedireccion = 'aldana cañada' WHERE clienteid = 1639 AND clientedireccion = 'aldana ca?ada';
UPDATE clientes SET clientedireccion = 'zona ña caludia' WHERE clienteid = 1645 AND clientedireccion = 'zona ?a caludia';
UPDATE clientes SET clientedireccion = 'zona 5ta compañia' WHERE clienteid = 1657 AND clientedireccion = 'zona 5ta compa?ia';
UPDATE clientes SET clientedireccion = 'zona ña claudia' WHERE clienteid = 1685 AND clientedireccion = 'zona ?a claudia';
UPDATE clientes SET clientedireccion = 'toledo cañada' WHERE clienteid = 1932 AND clientedireccion = 'toledo ca?ada';
UPDATE clientes SET clientedireccion = 'rojas cañada' WHERE clienteid = 1967 AND clientedireccion = 'rojas ca?ada';
UPDATE clientes SET clientedireccion = 'ÑA CLAUDIA' WHERE clienteid = 2149 AND clientedireccion = '?A CLAUDIA';

-- producto.productonombre (7)
UPDATE producto SET productonombre = 'CRUSH PIÑA 2L' WHERE productoid = 84 AND productonombre = 'CRUSH PI?A 2L';
UPDATE producto SET productonombre = 'FANTA PIÑA DE 500ML' WHERE productoid = 100 AND productonombre = 'FANTA PI?A DE 500ML';
UPDATE producto SET productonombre = 'NIKO PIÑA DE 2L' WHERE productoid = 1426 AND productonombre = 'NIKO PI?A DE 2L';
UPDATE producto SET productonombre = 'NIKO PIÑA DE 330' WHERE productoid = 1451 AND productonombre = 'NIKO PI?A DE 330';
UPDATE producto SET productonombre = 'DE LA COSTA PIÑA 330' WHERE productoid = 1588 AND productonombre = 'DE LA COSTA PI?A 330';
UPDATE producto SET productonombre = 'JHONNY DE 18 AÑOS' WHERE productoid = 1794 AND productonombre = 'JHONNY DE 18 A?OS';
UPDATE producto SET productonombre = 'ULTIMATE 18 AÑOS' WHERE productoid = 1897 AND productonombre = 'ULTIMATE 18 A?OS';

COMMIT;

-- ============================================================
-- VERIFICACIÓN (sólo debe quedar la razón social del cliente 1703)
-- SELECT 'clientes' t, ClienteId id, ClienteNombre, ClienteRazonSocial, ClienteDireccion
--   FROM clientes
--   WHERE ClienteNombre LIKE '%?%' OR ClienteRazonSocial LIKE '%?%' OR ClienteDireccion LIKE '%?%';
-- SELECT ProductoId, ProductoNombre FROM producto WHERE ProductoNombre LIKE '%?%';
-- ============================================================
