import { useCallback } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Linking,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { JWFTheme } from '@/constants/theme';
import { useRoles } from '@/lib/auth/AuthContext';
import { getViajesActivosFlota } from '@/lib/api/flota';
import type { ViajeActivoFlota } from '@/lib/types/flota';

const REFRESH_MS = 30_000;
const numFmt = new Intl.NumberFormat('es-PY');

// Color del marker según frescura del último ping del chofer. Reusa la
// misma escala que el dashboard web: verde <2min, ámbar 2-10, rojo >10.
function freshnessColor(ts: string | null): { bg: string; text: string; label: string } {
  if (!ts) return { bg: '#e5e7eb', text: '#374151', label: 'Sin ping' };
  const diffMin = (Date.now() - new Date(ts).getTime()) / 60_000;
  if (diffMin < 2) return { bg: '#dcfce7', text: '#166534', label: `hace ${numFmt.format(Math.floor(diffMin))} min` };
  if (diffMin < 10) return { bg: '#fef3c7', text: '#92400e', label: `hace ${numFmt.format(Math.floor(diffMin))} min` };
  return { bg: '#fee2e2', text: '#b91c1c', label: `hace ${numFmt.format(Math.floor(diffMin))} min` };
}

function formatHora(ts: string | null): string {
  if (!ts) return '—';
  const d = new Date(ts);
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit' });
}

function posicion(v: ViajeActivoFlota): { lat: number; lng: number } | null {
  if (v.ult_lat != null && v.ult_lng != null) return { lat: v.ult_lat, lng: v.ult_lng };
  if (v.lat_inicio != null && v.lng_inicio != null) return { lat: v.lat_inicio, lng: v.lng_inicio };
  return null;
}

export default function FlotaLiveScreen() {
  const { isGerenteFlota } = useRoles();
  const router = useRouter();

  const { data: viajes = [], isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['flota', 'viajes-activos'],
    queryFn: getViajesActivosFlota,
    enabled: isGerenteFlota,
    refetchInterval: REFRESH_MS,
    refetchIntervalInBackground: false,
  });

  useFocusEffect(
    useCallback(() => {
      if (isGerenteFlota) refetch();
    }, [isGerenteFlota, refetch]),
  );

  if (!isGerenteFlota) {
    return (
      <SafeAreaView style={styles.root} edges={['top']}>
        <Text style={styles.hint}>Solo el gerente de operaciones tiene acceso.</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Flota en vivo</Text>
        <Text style={styles.subtitle}>
          {viajes.length === 0
            ? 'Sin choferes con viaje abierto ahora.'
            : `${numFmt.format(viajes.length)} viaje${viajes.length === 1 ? '' : 's'} en curso`}
        </Text>
      </View>

      {isLoading ? (
        <ActivityIndicator color={JWFTheme.color.accent} style={{ marginTop: 32 }} />
      ) : (
        <FlatList
          data={viajes}
          keyExtractor={(v) => String(v.id)}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              tintColor={JWFTheme.color.accent}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <MaterialIcons name="local-shipping" size={48} color={JWFTheme.color.textMuted} />
              <Text style={styles.emptyText}>Nadie está manejando ahora.</Text>
            </View>
          }
          renderItem={({ item }) => {
            const pos = posicion(item);
            const fresh = freshnessColor(item.ult_visto_en);
            return (
              <TouchableOpacity
                style={styles.card}
                onPress={() => router.push(`/flota/viaje/${item.id}` as never)}
              >
                <View style={styles.cardHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardChofer}>{item.chofer_nombre}</Text>
                    <Text style={styles.cardChapa}>
                      {item.chapa}
                      {item.marca ? ` · ${item.marca}` : ''}
                    </Text>
                  </View>
                  <View style={[styles.badge, { backgroundColor: fresh.bg }]}>
                    <Text style={[styles.badgeText, { color: fresh.text }]}>{fresh.label}</Text>
                  </View>
                </View>
                <Text style={styles.cardInicio}>Inicio {formatHora(item.inicio_en)}</Text>
                <View style={styles.cardActions}>
                  {pos && (
                    <TouchableOpacity
                      style={styles.action}
                      onPress={(e) => {
                        e.stopPropagation();
                        Linking.openURL(`https://www.google.com/maps?q=${pos.lat},${pos.lng}`);
                      }}
                    >
                      <MaterialIcons name="map" size={16} color={JWFTheme.color.accent} />
                      <Text style={styles.actionText}>Abrir en Maps</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    style={styles.action}
                    onPress={() => router.push(`/flota/viaje/${item.id}` as never)}
                  >
                    <MaterialIcons name="info-outline" size={16} color={JWFTheme.color.accent} />
                    <Text style={styles.actionText}>Ver detalle</Text>
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: JWFTheme.color.bgApp },
  header: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12 },
  title: { fontSize: 24, fontWeight: JWFTheme.fontWeight.semibold, color: JWFTheme.color.textPrimary },
  subtitle: { fontSize: 13, color: JWFTheme.color.textMuted, marginTop: 4 },
  list: { paddingHorizontal: 20, paddingBottom: 24, gap: 10 },
  card: {
    backgroundColor: JWFTheme.color.bgCard,
    padding: 14,
    borderRadius: JWFTheme.radius.lg,
    borderWidth: 1,
    borderColor: JWFTheme.color.borderDefault,
    gap: 8,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  cardChofer: { fontSize: 15, fontWeight: JWFTheme.fontWeight.semibold, color: JWFTheme.color.textPrimary },
  cardChapa: { fontSize: 12, color: JWFTheme.color.textMuted, fontFamily: 'monospace', marginTop: 2 },
  cardInicio: { fontSize: 12, color: JWFTheme.color.textSecondary },
  cardActions: { flexDirection: 'row', gap: 16, marginTop: 4 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  actionText: { fontSize: 12, color: JWFTheme.color.accent, fontWeight: JWFTheme.fontWeight.medium },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  badgeText: { fontSize: 11, fontWeight: JWFTheme.fontWeight.medium },
  emptyWrap: { alignItems: 'center', marginTop: 60, gap: 8 },
  emptyText: { fontSize: 14, color: JWFTheme.color.textMuted },
  hint: { fontSize: 14, color: JWFTheme.color.textMuted, padding: 20 },
});
