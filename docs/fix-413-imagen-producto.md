# Fix 413 al guardar productos con imagen

## Síntoma

Al actualizar un producto desde la web, el navegador muestra:

```
Request URL:    https://sys.distrisalvatore.com.py/api/productos/120
Request Method: PUT
Status Code:    413 Request Entity Too Large
```

El payload incluye `ProductoImagen` con el JPEG completo en base64.

## Causa

Dos cosas se sumaban:

1. **Cliente**: dos pantallas reenviaban la imagen del producto (varios MB en
   base64 en los productos migrados de GeneXus) en el body del PUT, aunque
   nadie la hubiera tocado:
   - **Inventario** (origen del error reportado): al guardar el stock por
     almacén hacía `getProductoById()` y esparcía el producto completo en el
     payload (`...fullProduct`), imagen incluida.
   - **Productos**: el formulario de edición cargaba la imagen actual y la
     reenviaba en cada guardado. Las imágenes nuevas además se subían sin
     comprimir, tal cual salían del celular.
2. **Servidor**: el reverse proxy delante de la API tiene el límite de body por
   defecto (**1 MB** en nginx), muy por debajo del límite de Express, que ya
   está en 10 MB (`api/index.js`, `express.json({ limit: "10mb" })`).

El 413 lo devuelve el **proxy**, no Express: la request nunca llega a Node.

## Parte 1 — Ya corregido en el código (solo hay que desplegar)

Cambios en el frontend (branch `main`):

- `client/src/pages/inventario/Inventario.tsx`: `sendRequest()` ahora manda un
  **update parcial** — solo `productoAlmacen`, `ProductoStock` y
  `ProductoStockUnitario`. Se eliminó el `getProductoById()` previo y el
  `...fullProduct`. El backend ignora los campos ausentes
  (`producto.model.js`, `camposActualizables`) y `updateProducto` del
  controller ya valida solo lo que viene, así que el update parcial es válido.
  El payload pasa de varios MB a unos cientos de bytes.
- `client/src/utils/productImage.ts`: nueva función `comprimirImagenABase64()`
  que redimensiona a 800 px de lado máximo y reencodea a JPEG calidad 0.75.
  Una foto de celular pasa de varios MB a decenas de KB.
- `client/src/components/products/ProductsList.tsx`: el file input usa esa
  función, y se agregó el flag `imagenTocada` — `ProductoImagen` se envía
  **solo** si el usuario seleccionó o eliminó imagen en ese modal. Si no la
  tocó, el campo se omite y el backend preserva la imagen actual.

**Desplegar el cliente** (en el servidor, dentro del repo):

```bash
git pull
cd client
pnpm install --frozen-lockfile
pnpm run build
# copiar/servir dist/ según cómo esté publicado el sitio
```

No hace falta reiniciar la API: los cambios son solo de frontend.

## Parte 2 — Tarea pendiente en el servidor: subir el límite del proxy

Esto es la red de seguridad: aunque el cliente ya manda payloads chicos, el
límite del proxy debe quedar alineado con el de Express (10 MB).

### 1. Identificar qué proxy está en uso

```bash
systemctl is-active nginx httpd apache2 caddy 2>/dev/null
```

### 2a. Si es nginx

Encontrar el `server` block del sitio:

```bash
grep -rn "sys.distrisalvatore.com.py" /etc/nginx/
```

Editar ese archivo y, **dentro del `server { ... }`**, agregar o ajustar:

```nginx
client_max_body_size 10M;
```

Si ya existe la directiva con otro valor, cambiarla a `10M` (no duplicarla).
Si el sitio tiene un `location /api` separado, alcanza con ponerla a nivel de
`server` — aplica a todos los `location`.

Validar y recargar:

```bash
sudo nginx -t && sudo systemctl reload nginx
```

`nginx -t` tiene que decir `syntax is ok` / `test is successful` **antes** del
reload. Si falla, no recargar y revisar la edición.

### 2b. Si es Apache (httpd)

En el `VirtualHost` del sitio:

```apache
LimitRequestBody 10485760
```

```bash
sudo apachectl configtest && sudo systemctl reload httpd
```

### 2c. Si es Caddy

En el bloque del sitio:

```
request_body {
    max_size 10MB
}
```

```bash
sudo caddy validate --config /etc/caddy/Caddyfile && sudo systemctl reload caddy
```

## Verificación

Mandar una request con un body de ~3 MB a la API. Sin token de auth, la
respuesta esperada es **401** (el body pasó el proxy y llegó a Express). Si
sigue devolviendo **413**, el límite del proxy no se aplicó:

```bash
python3 -c "print('{\"x\":\"' + 'A'*3000000 + '\"}')" > /tmp/big.json

curl -s -o /dev/null -w '%{http_code}\n' \
  -X PUT https://sys.distrisalvatore.com.py/api/productos/120 \
  -H 'Content-Type: application/json' \
  --data-binary @/tmp/big.json

rm /tmp/big.json
```

- `401` → OK, el proxy ya acepta el body.
- `413` → revisar que la directiva quedó en el `server` block correcto (puede
  haber más de un archivo/vhost) y que el reload se ejecutó.

Después, probar en la web (con la pestaña Network abierta, mirando el body del
PUT a `/api/productos/:id`):

1. **Inventario** → cargar stock por almacén de un producto con imagen y
   guardar. El body **no** debe contener `ProductoImagen` ni
   `ProductoImagen_GXI`: solo `productoAlmacen`, `ProductoStock` y
   `ProductoStockUnitario`. Respuesta `200`.
2. **Productos** → editar un producto **sin** tocar la imagen y guardar. El
   body tampoco debe traer `ProductoImagen`, y la imagen debe seguir intacta
   después de guardar.
3. **Productos** → subir una imagen nueva y guardar. Debe responder `200` y la
   imagen nueva debe verse en el listado.

Si el body todavía trae `ProductoImagen`, el navegador está sirviendo el bundle
viejo: verificar que el `pnpm run build` se hizo y forzar recarga (Ctrl+F5).

## Rollback

Solo hay que revertir la directiva agregada al proxy y recargar el servicio.
Hacer copia del archivo antes de editarlo:

```bash
sudo cp /etc/nginx/conf.d/<archivo>.conf /etc/nginx/conf.d/<archivo>.conf.bak
```

## Pendientes conocidos (fuera de este fix)

- **"Eliminar imagen" no funciona**: el front manda `ProductoImagen: ""` y
  `api/models/producto.model.js` interpreta el valor vacío como "sin cambios"
  (la columna es `NOT NULL`), así que la imagen queda en la DB. Requiere
  definir un sentinel o cambiar el contrato del campo.
- **`getProductoById` devuelve el base64 entero**, así que sigue habiendo
  descargas pesadas: el modal de edición de Productos y el agregar producto al
  carrito en Inventario (`Inventario.tsx`, al armar los almacenes) traen el
  blob en el JSON sin necesitarlo. No causa el 413 (es descarga, no subida),
  pero mientras el endpoint siga devolviendo la imagen el problema puede
  reaparecer en cualquier pantalla nueva que reenvíe el producto completo. El
  arreglo de fondo es excluir `ProductoImagen` del `getById` y usar siempre el
  endpoint binario `/productos/:id/imagen` para mostrarla.
