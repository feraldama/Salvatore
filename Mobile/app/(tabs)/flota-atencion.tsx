import { useCallback, useMemo } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { JWFTheme } from '@/constants/theme';
import { useRoles } from '@/lib/auth/AuthContext';
import { getAtencionRequeridaFlota } from '@/lib/api/flota';
import type { AtencionRequeridaItem } from '@/lib/types/flota';

const numFmt = new Intl.NumberFormat('es-PY');

function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  return new Date(value).toLocaleDateString('es-PY');
}

function diasHasta(fecha: string | null | undefined): number | null {
  if (!fecha) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(fecha);
  const target = m
    ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
    : new Date(fecha);
  if (Number.isNaN(target.getTime())) return null;
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24));
}

function descripcionItem(it: AtencionRequeridaItem): string {
  if (it.categoria === 'mantenimiento') {
    const partes: string[] = [];
    if (it.km_proximo != null && it.km_actual != null) {
      const diff = it.km_proximo - it.km_actual;
      partes.push(
        diff < 0
          ? `${numFmt.format(Math.abs(diff))} km pasado`
          : `faltan ${numFmt.format(diff)} km`,
      );
    }
    if (it.fecha_proxima) {
      const d = diasHasta(it.fecha_proxima);
      if (d != null) partes.push(d < 0 ? `vencido hace ${-d} días` : `vence en ${d} días`);
    }
    return partes.join(' · ');
  }
  const d = diasHasta(it.vencimiento);
  if (d == null) return '';
  return d < 0
    ? `Vencido hace ${-d} días (${formatDate(it.vencimiento)})`
    : `Vence en ${d} días (${formatDate(it.vencimiento)})`;
}

interface GrupoVehiculo {
  kind: 'vehiculo';
  vehiculo_id: number;
  chapa: string;
  marca: string | null;
  items: AtencionRequeridaItem[];
}
interface GrupoChofer {
  kind: 'chofer';
  usuario_id: number;
  nombre: string;
  items: AtencionRequeridaItem[];
}
type Grupo = GrupoVehiculo | GrupoChofer;

export default function FlotaAtencionScreen() {
  const { isGerenteFlota } = useRoles();

  const { data: items = [], isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['flota', 'atencion-requerida'],
    queryFn: getAtencionRequeridaFlota,
    enabled: isGerenteFlota,
    staleTime: 5 * 60_000,
  });

  useFocusEffect(
    useCallback(() => {
      if (isGerenteFlota) refetch();
    }, [isGerenteFlota, refetch]),
  );

  const totalVencidos = items.filter((i) => i.estado === 'VENCIDO').length;
  const totalProximos = items.filter((i) => i.estado === 'PROXIMO').length;

  // Agrupamos por vehículo (mant + docs de vehículo) y por chofer (docs
  // personales). Mismo criterio que el dashboard web /flota/atencion.
  const grupos = useMemo<Grupo[]>(() => {
    const veh = new Map<number, GrupoVehiculo>();
    const chof = new Map<number, GrupoChofer>();
    for (const it of items) {
      if (it.categoria === 'documento_chofer') {
        if (it.usuario_id == null) continue;
        const g = chof.get(it.usuario_id) ?? {
          kind: 'chofer' as const,
          usuario_id: it.usuario_id,
          nombre: it.chofer_nombre ?? '—',
          items: [],
        };
        g.items.push(it);
        chof.set(it.usuario_id, g);
      } else {
        if (it.vehiculo_id == null) continue;
        const g = veh.get(it.vehiculo_id) ?? {
          kind: 'vehiculo' as const,
          vehiculo_id: it.vehiculo_id,
          chapa: it.chapa ?? '',
          marca: it.marca ?? null,
          items: [],
        };
        g.items.push(it);
        veh.set(it.vehiculo_id, g);
      }
    }
    return [...veh.values(), ...chof.values()];
  }, [items]);

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
        <Text style={styles.title}>Atención requerida</Text>
        <Text style={styles.subtitle}>Mantenimientos y documentos a atender</Text>
      </View>

      <View style={styles.kpis}>
        <View style={[styles.kpi, { borderColor: '#fecaca' }]}>
          <Text style={[styles.kpiValue, { color: '#b91c1c' }]}>
            {numFmt.format(totalVencidos)}
          </Text>
          <Text style={styles.kpiLabel}>Vencidos</Text>
        </View>
        <View style={[styles.kpi, { borderColor: '#fde68a' }]}>
          <Text style={[styles.kpiValue, { color: '#92400e' }]}>
            {numFmt.format(totalProximos)}
          </Text>
          <Text style={styles.kpiLabel}>Próximos</Text>
        </View>
      </View>

      {isLoading ? (
        <ActivityIndicator color={JWFTheme.color.accent} style={{ marginTop: 32 }} />
      ) : (
        <FlatList
          data={grupos}
          keyExtractor={(g) => (g.kind === 'vehiculo' ? `v-${g.vehiculo_id}` : `c-${g.usuario_id}`)}
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
              <MaterialIcons name="check-circle" size={48} color={JWFTheme.color.accent} />
              <Text style={styles.emptyText}>Todo al día.</Text>
            </View>
          }
          renderItem={({ item: g }) => (
            <View style={styles.grupo}>
              <View style={styles.grupoHeader}>
                <MaterialIcons
                  name={g.kind === 'vehiculo' ? 'directions-car' : 'badge'}
                  size={16}
                  color={JWFTheme.color.textMuted}
                />
                <Text style={styles.grupoTitulo}>
                  {g.kind === 'vehiculo' ? g.chapa : g.nombre}
                </Text>
                {g.kind === 'vehiculo' && g.marca ? (
                  <Text style={styles.grupoMeta}>{g.marca}</Text>
                ) : null}
              </View>
              {g.items.map((it) => {
                const c =
                  it.estado === 'VENCIDO'
                    ? { bg: '#fee2e2', text: '#b91c1c', label: 'Vencido' }
                    : { bg: '#fef3c7', text: '#92400e', label: 'Próximo' };
                return (
                  <View key={`${it.categoria}-${it.codigo}`} style={styles.item}>
                    <MaterialIcons
                      name={it.categoria === 'mantenimiento' ? 'build' : 'description'}
                      size={18}
                      color={JWFTheme.color.textMuted}
                      style={{ marginTop: 2 }}
                    />
                    <View style={styles.itemBody}>
                      <View style={styles.itemTituloRow}>
                        <Text style={styles.itemTitulo}>{it.titulo}</Text>
                        <View style={[styles.badge, { backgroundColor: c.bg }]}>
                          <Text style={[styles.badgeText, { color: c.text }]}>{c.label}</Text>
                        </View>
                      </View>
                      <Text style={styles.itemDesc}>{descripcionItem(it)}</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: JWFTheme.color.bgApp },
  header: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 4 },
  title: { fontSize: 24, fontWeight: JWFTheme.fontWeight.semibold, color: JWFTheme.color.textPrimary },
  subtitle: { fontSize: 13, color: JWFTheme.color.textMuted, marginTop: 4 },
  kpis: { flexDirection: 'row', gap: 10, paddingHorizontal: 20, paddingVertical: 12 },
  kpi: {
    flex: 1,
    backgroundColor: JWFTheme.color.bgCard,
    borderRadius: JWFTheme.radius.lg,
    borderWidth: 1,
    padding: 12,
    alignItems: 'center',
  },
  kpiValue: { fontSize: 22, fontWeight: JWFTheme.fontWeight.semibold, fontVariant: ['tabular-nums'] },
  kpiLabel: { fontSize: 12, color: JWFTheme.color.textMuted, marginTop: 2 },
  list: { paddingHorizontal: 20, paddingBottom: 24, gap: 12 },
  grupo: {
    backgroundColor: JWFTheme.color.bgCard,
    borderRadius: JWFTheme.radius.lg,
    borderWidth: 1,
    borderColor: JWFTheme.color.borderDefault,
    overflow: 'hidden',
  },
  grupoHeader: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: JWFTheme.color.borderDefault,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  grupoTitulo: { fontFamily: 'monospace', fontSize: 15, fontWeight: JWFTheme.fontWeight.semibold },
  grupoMeta: { fontSize: 13, color: JWFTheme.color.textMuted },
  item: {
    flexDirection: 'row',
    gap: 10,
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: JWFTheme.color.borderDefault,
  },
  itemBody: { flex: 1 },
  itemTituloRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  itemTitulo: { fontSize: 15, fontWeight: JWFTheme.fontWeight.medium, color: JWFTheme.color.textPrimary, flexShrink: 1 },
  itemDesc: { fontSize: 12, color: JWFTheme.color.textMuted, marginTop: 2 },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
  badgeText: { fontSize: 11, fontWeight: JWFTheme.fontWeight.medium },
  emptyWrap: { alignItems: 'center', marginTop: 60, gap: 8 },
  emptyText: { fontSize: 16, fontWeight: JWFTheme.fontWeight.medium, color: JWFTheme.color.textPrimary },
  hint: { fontSize: 14, color: JWFTheme.color.textMuted, padding: 20 },
});
