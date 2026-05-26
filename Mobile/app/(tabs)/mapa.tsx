import { useMemo } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { useRouter } from 'expo-router';

import { usePantallasMapa } from '@/hooks/useIncidencias';
import { JWFTheme } from '@/constants/theme';
import type { PantallaPuntoMapa, SeveridadIncidencia } from '@/lib/types/incidencias';

// Asunción / Paraguay como vista por defecto. Tile servers públicos de OSM
// no requieren API key.
const CENTRO_DEFAULT = { lat: -25.2867, lng: -57.6105 };

const COLOR_POR_SEVERIDAD: Record<SeveridadIncidencia | 'ok', string> = {
  ok: JWFTheme.color.accent,
  info: JWFTheme.color.info,
  warning: JWFTheme.color.warning,
  critical: JWFTheme.color.danger,
};

/// HTML auto-contenido con Leaflet vía CDN. Render server-side estático,
/// los markers se reciben como JSON desde RN (window.PANTALLAS) y un click
/// dispara postMessage que el WebView nativo lee.
function generarHtml(pantallas: PantallaPuntoMapa[], centro: { lat: number; lng: number }, zoom: number): string {
  const datos = pantallas.map((p) => ({
    id: p.id,
    nombre: p.nombre,
    ubicacion: p.ubicacion,
    lat: p.latitud,
    lng: p.longitud,
    sev: p.severidad_abierta,
    color: COLOR_POR_SEVERIDAD[p.severidad_abierta ?? 'ok'],
  }));

  // Inyecta datos como JSON literal para evitar parse en runtime.
  // CSS: full-bleed, sin padding default del browser.
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <style>
    html, body, #map { margin: 0; padding: 0; height: 100%; width: 100%; }
    .pin {
      width: 18px; height: 18px; border-radius: 50%;
      border: 3px solid #fff;
      box-shadow: 0 1px 4px rgba(0,0,0,0.4);
    }
  </style>
</head>
<body>
  <div id="map"></div>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script>
    var PANTALLAS = ${JSON.stringify(datos)};
    var CENTRO = ${JSON.stringify(centro)};
    var ZOOM = ${zoom};
    var map = L.map('map').setView([CENTRO.lat, CENTRO.lng], ZOOM);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OSM',
      maxZoom: 19,
    }).addTo(map);

    function postRN(payload) {
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify(payload));
      }
    }

    PANTALLAS.forEach(function (p) {
      var icon = L.divIcon({
        className: '',
        html: '<div class="pin" style="background:' + p.color + '"></div>',
        iconSize: [18, 18],
        iconAnchor: [9, 9],
      });
      var marker = L.marker([p.lat, p.lng], { icon: icon }).addTo(map);
      var popup = '<b>' + p.nombre + '</b>';
      if (p.sev) {
        popup += '<br/><span style="color:' + p.color + '">Incidencia ' + p.sev.toUpperCase() + '</span>';
      } else if (p.ubicacion) {
        popup += '<br/>' + p.ubicacion;
      }
      marker.bindPopup(popup);
      marker.on('click', function () {
        postRN({ type: 'marker', id: p.id, sev: p.sev });
      });
    });
  </script>
</body>
</html>`;
}

export default function MapaScreen() {
  const router = useRouter();
  const { data, isLoading, isError, refetch } = usePantallasMapa(true);

  // Centro + zoom adaptativo. Si hay puntos, ajusta a su bbox; sino default.
  const { centro, zoom, html } = useMemo(() => {
    if (!data || data.length === 0) {
      return { centro: CENTRO_DEFAULT, zoom: 12, html: generarHtml([], CENTRO_DEFAULT, 12) };
    }
    const lats = data.map((p) => p.latitud);
    const lngs = data.map((p) => p.longitud);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    const centroCalc = {
      lat: (minLat + maxLat) / 2,
      lng: (minLng + maxLng) / 2,
    };
    // Heurística: rango grande → zoom menor.
    const span = Math.max(maxLat - minLat, maxLng - minLng);
    const zoomCalc = span > 0.5 ? 9 : span > 0.1 ? 12 : span > 0.02 ? 14 : 16;
    return { centro: centroCalc, zoom: zoomCalc, html: generarHtml(data, centroCalc, zoomCalc) };
  }, [data]);

  function onMessage(event: WebViewMessageEvent) {
    try {
      const msg = JSON.parse(event.nativeEvent.data) as {
        type: string;
        id?: string;
        sev?: string | null;
      };
      if (msg.type === 'marker' && msg.id && msg.sev) {
        // La pantalla tiene incidencia abierta — llevamos al listado filtrado.
        // (Mejora futura: endpoint que dé incidenciaId directo y deep-link a /incidencia/[id].)
        router.push(`/(tabs)/incidencias` as never);
      }
    } catch {
      // mensajes mal formados se ignoran
    }
  }

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Mapa de pantallas</Text>
        <Text style={styles.subtitle}>
          Pantallas de la red. Color rojo/amarillo = incidencia abierta.
        </Text>
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={JWFTheme.color.accent} />
        </View>
      ) : isError ? (
        <View style={styles.center}>
          <Text style={styles.errorTitle}>No se pudo cargar el mapa</Text>
          <TouchableOpacity style={styles.btnRetry} onPress={() => refetch()}>
            <Text style={styles.btnRetryText}>Reintentar</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <WebView
          originWhitelist={['*']}
          source={{ html }}
          onMessage={onMessage}
          style={styles.map}
          // Mejora rendering del map sobre Android.
          androidLayerType="hardware"
          // Evita pinch-zoom forzado del WebView; ya lo controla Leaflet.
          scalesPageToFit={false}
          javaScriptEnabled
        />
      )}

      <View style={styles.leyenda}>
        <Leyenda color={JWFTheme.color.accent} label="OK" />
        <Leyenda color={JWFTheme.color.info} label="Info" />
        <Leyenda color={JWFTheme.color.warning} label="Warning" />
        <Leyenda color={JWFTheme.color.danger} label="Crítica" />
      </View>
    </SafeAreaView>
  );
}

function Leyenda({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.leyendaRow}>
      <View style={[styles.leyendaDot, { backgroundColor: color }]} />
      <Text style={styles.leyendaLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: JWFTheme.color.bgApp },
  header: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8 },
  title: {
    fontSize: 28,
    fontWeight: JWFTheme.fontWeight.heroLight,
    color: JWFTheme.color.textPrimary,
    letterSpacing: JWFTheme.titleTracking,
  },
  subtitle: { fontSize: 13, color: JWFTheme.color.textMuted, marginTop: 2 },
  map: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 24 },
  errorTitle: { fontSize: 16, fontWeight: JWFTheme.fontWeight.semibold, color: JWFTheme.color.danger },
  btnRetry: {
    backgroundColor: JWFTheme.color.accent,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: JWFTheme.radius.md,
  },
  btnRetryText: { color: JWFTheme.color.textInverse, fontWeight: JWFTheme.fontWeight.semibold },
  leyenda: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: JWFTheme.color.bgCard,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: JWFTheme.color.borderDefault,
  },
  leyendaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  leyendaDot: { width: 12, height: 12, borderRadius: 6 },
  leyendaLabel: { fontSize: 12, color: JWFTheme.color.textSecondary },
});
