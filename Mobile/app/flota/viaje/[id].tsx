import {
  ActivityIndicator,
  Alert,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { JWFTheme } from '@/constants/theme';
import { useRoles } from '@/lib/auth/AuthContext';
import { getViajeFlotaDetalle } from '@/lib/api/flota';
import type { ViajeFlotaDetalleMobile } from '@/lib/types/flota';

const numFmt = new Intl.NumberFormat('es-PY');
const numFmtDec = new Intl.NumberFormat('es-PY', { maximumFractionDigits: 2 });

function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('es-PY', { dateStyle: 'short', timeStyle: 'short' });
}

function tieneGps(lat: number | null, lng: number | null): boolean {
  return (
    lat != null && lng != null && Number.isFinite(Number(lat)) && Number.isFinite(Number(lng))
  );
}

function abrirGoogleMaps(lat: number, lng: number) {
  Linking.openURL(`https://www.google.com/maps?q=${lat},${lng}`);
}

function abrirRuta(latA: number, lngA: number, latB: number, lngB: number) {
  Linking.openURL(`https://www.google.com/maps/dir/${latA},${lngA}/${latB},${lngB}`);
}

export default function ViajeDetalleScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const id = Number(params.id);
  const { isGerenteFlota } = useRoles();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['flota', 'viaje-detalle', id],
    queryFn: () => getViajeFlotaDetalle(id),
    enabled: Number.isFinite(id) && isGerenteFlota,
  });

  if (!isGerenteFlota) {
    return (
      <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
        <Text style={styles.hint}>Solo el gerente de operaciones tiene acceso.</Text>
      </SafeAreaView>
    );
  }

  if (!Number.isFinite(id)) {
    return (
      <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
        <Text style={styles.errorText}>ID inválido.</Text>
      </SafeAreaView>
    );
  }

  if (isLoading) {
    return (
      <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
        <ActivityIndicator color={JWFTheme.color.accent} style={{ marginTop: 32 }} />
      </SafeAreaView>
    );
  }

  if (isError || !data) {
    return (
      <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
        <Text style={styles.errorText}>No se pudo cargar el viaje.</Text>
      </SafeAreaView>
    );
  }

  const v: ViajeFlotaDetalleMobile = data;
  const hayInicio = tieneGps(v.lat_inicio, v.lng_inicio);
  const hayFin = tieneGps(v.lat_fin, v.lng_fin);

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <MaterialIcons name="arrow-back" size={24} color={JWFTheme.color.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.topTitle}>Viaje #{numFmt.format(v.id)}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.headerCard}>
          <Text style={styles.headerChofer}>{v.chofer_nombre}</Text>
          <Text style={styles.headerChapa}>
            {v.chapa}
            {v.marca ? ` · ${v.marca}` : ''}
          </Text>
          <View style={styles.headerRow}>
            <View
              style={[
                styles.estado,
                v.estado === 'ABIERTO' ? styles.estadoAbierto : styles.estadoCerrado,
              ]}
            >
              <Text
                style={[
                  styles.estadoText,
                  v.estado === 'ABIERTO' ? styles.estadoTextAbierto : styles.estadoTextCerrado,
                ]}
              >
                {v.estado === 'ABIERTO' ? 'En curso' : 'Cerrado'}
              </Text>
            </View>
            {v.km_recorridos != null && (
              <Text style={styles.headerKm}>
                {numFmtDec.format(v.km_recorridos)} km
              </Text>
            )}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Trayecto</Text>
          <View style={styles.row}>
            <View style={styles.rowLabel}>
              <MaterialIcons name="play-arrow" size={16} color={JWFTheme.color.accent} />
              <Text style={styles.rowLabelText}>Inicio</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowValue}>{formatDateTime(v.inicio_en)}</Text>
              {hayInicio && (
                <TouchableOpacity
                  onPress={() => abrirGoogleMaps(v.lat_inicio!, v.lng_inicio!)}
                  style={styles.linkRow}
                >
                  <MaterialIcons name="place" size={14} color={JWFTheme.color.accent} />
                  <Text style={styles.linkText}>
                    {v.lat_inicio!.toFixed(5)}, {v.lng_inicio!.toFixed(5)}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
          <View style={styles.row}>
            <View style={styles.rowLabel}>
              <MaterialIcons name="stop" size={16} color={JWFTheme.color.textMuted} />
              <Text style={styles.rowLabelText}>Fin</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowValue}>
                {v.fin_en ? formatDateTime(v.fin_en) : 'En curso'}
              </Text>
              {hayFin && (
                <TouchableOpacity
                  onPress={() => abrirGoogleMaps(v.lat_fin!, v.lng_fin!)}
                  style={styles.linkRow}
                >
                  <MaterialIcons name="place" size={14} color={JWFTheme.color.accent} />
                  <Text style={styles.linkText}>
                    {v.lat_fin!.toFixed(5)}, {v.lng_fin!.toFixed(5)}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
          <Text style={styles.meta}>
            {numFmt.format(v.ubicaciones_total)} puntos GPS registrados
          </Text>
          {hayInicio && hayFin && (
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={() => abrirRuta(v.lat_inicio!, v.lng_inicio!, v.lat_fin!, v.lng_fin!)}
            >
              <MaterialIcons name="map" size={16} color={JWFTheme.color.accent} />
              <Text style={styles.actionBtnText}>Ver ruta inicio → fin en Google Maps</Text>
            </TouchableOpacity>
          )}
        </View>

        {v.alertas.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeaderRow}>
              <MaterialIcons name="warning" size={16} color="#f59e0b" />
              <Text style={styles.sectionTitle}>
                Alertas de permanencia ({numFmt.format(v.alertas.length)})
              </Text>
            </View>
            {v.alertas.map((a) => (
              <View key={a.id} style={styles.alertaRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.alertaTime}>
                    {formatDateTime(a.inicio)} → {formatDateTime(a.ultimo)}
                  </Text>
                  <Text style={styles.alertaDur}>
                    {a.duracion_min >= 60
                      ? `${numFmt.format(Math.floor(a.duracion_min / 60))} h ${numFmt.format(a.duracion_min % 60)} min`
                      : `${numFmt.format(a.duracion_min)} min`}
                  </Text>
                </View>
                {a.lat != null && a.lng != null && (
                  <TouchableOpacity
                    onPress={() => abrirGoogleMaps(a.lat!, a.lng!)}
                    style={styles.linkRow}
                  >
                    <MaterialIcons name="map" size={14} color={JWFTheme.color.accent} />
                    <Text style={styles.linkText}>Ver</Text>
                  </TouchableOpacity>
                )}
              </View>
            ))}
          </View>
        )}

        {v.cargas.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeaderRow}>
              <MaterialIcons name="local-gas-station" size={16} color={JWFTheme.color.textMuted} />
              <Text style={styles.sectionTitle}>
                Cargas de combustible ({numFmt.format(v.cargas.length)})
              </Text>
            </View>
            {v.cargas.map((c) => (
              <View key={c.id} style={styles.cargaRow}>
                <Text style={styles.cargaTime}>{formatDateTime(c.creado_en)}</Text>
                <View style={styles.cargaStats}>
                  {c.km != null && (
                    <Text style={styles.cargaStat}>Km {numFmt.format(c.km)}</Text>
                  )}
                  {c.litros != null && (
                    <Text style={styles.cargaStat}>{numFmtDec.format(c.litros)} L</Text>
                  )}
                  {c.monto != null && (
                    <Text style={styles.cargaStat}>${numFmt.format(c.monto)}</Text>
                  )}
                  {c.consumo_km_l != null && (
                    <Text style={styles.cargaStat}>{numFmtDec.format(c.consumo_km_l)} km/L</Text>
                  )}
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: JWFTheme.color.bgApp },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  backBtn: { padding: 4 },
  topTitle: { fontSize: 17, fontWeight: JWFTheme.fontWeight.semibold, color: JWFTheme.color.textPrimary, flex: 1 },
  content: { padding: 16, paddingBottom: 32, gap: 14 },
  headerCard: {
    backgroundColor: JWFTheme.color.bgCard,
    padding: 16,
    borderRadius: JWFTheme.radius.lg,
    borderWidth: 1,
    borderColor: JWFTheme.color.borderDefault,
  },
  headerChofer: { fontSize: 18, fontWeight: JWFTheme.fontWeight.semibold, color: JWFTheme.color.textPrimary },
  headerChapa: { fontSize: 13, color: JWFTheme.color.textMuted, fontFamily: 'monospace', marginTop: 2 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 },
  headerKm: { fontSize: 14, fontWeight: JWFTheme.fontWeight.semibold, color: JWFTheme.color.textPrimary, fontVariant: ['tabular-nums'] },
  estado: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999 },
  estadoAbierto: { backgroundColor: '#fef3c7' },
  estadoCerrado: { backgroundColor: '#dcfce7' },
  estadoText: { fontSize: 12, fontWeight: JWFTheme.fontWeight.medium },
  estadoTextAbierto: { color: '#92400e' },
  estadoTextCerrado: { color: '#166534' },
  section: {
    backgroundColor: JWFTheme.color.bgCard,
    padding: 14,
    borderRadius: JWFTheme.radius.lg,
    borderWidth: 1,
    borderColor: JWFTheme.color.borderDefault,
    gap: 8,
  },
  sectionTitle: { fontSize: 14, fontWeight: JWFTheme.fontWeight.semibold, color: JWFTheme.color.textPrimary },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 4 },
  rowLabel: { flexDirection: 'row', alignItems: 'center', gap: 4, width: 60 },
  rowLabelText: { fontSize: 13, color: JWFTheme.color.textMuted },
  rowValue: { fontSize: 14, color: JWFTheme.color.textPrimary },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  linkText: { fontSize: 12, color: JWFTheme.color.accent, fontFamily: 'monospace' },
  meta: { fontSize: 12, color: JWFTheme.color.textMuted },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: JWFTheme.color.bgSubtle,
    borderRadius: JWFTheme.radius.md,
    alignSelf: 'flex-start',
  },
  actionBtnText: { fontSize: 13, color: JWFTheme.color.accent, fontWeight: JWFTheme.fontWeight.medium },
  alertaRow: {
    flexDirection: 'row',
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: JWFTheme.color.borderDefault,
  },
  alertaTime: { fontSize: 12, color: JWFTheme.color.textSecondary },
  alertaDur: { fontSize: 14, fontWeight: JWFTheme.fontWeight.semibold, color: '#92400e', marginTop: 2 },
  cargaRow: {
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: JWFTheme.color.borderDefault,
  },
  cargaTime: { fontSize: 12, color: JWFTheme.color.textSecondary },
  cargaStats: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 4 },
  cargaStat: { fontSize: 13, color: JWFTheme.color.textPrimary, fontVariant: ['tabular-nums'] },
  errorText: { fontSize: 14, color: '#b91c1c', padding: 20 },
  hint: { fontSize: 14, color: JWFTheme.color.textMuted, padding: 20 },
});
