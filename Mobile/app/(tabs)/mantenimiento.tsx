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
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { JWFTheme } from '@/constants/theme';
import { useRoles } from '@/lib/auth/AuthContext';
import { useFlotaPendientes } from '@/hooks/useFlotaPendientes';
import type { EstadoPendiente, PendienteFlota } from '@/lib/types/flota';

const LABEL_DOC: Record<string, string> = {
  SEGURO: 'Seguro',
  RUA: 'RUA',
  PATENTE: 'Patente',
  HABILITACION: 'Habilitación',
  OTRO: 'Otro',
  LICENCIA: 'Licencia de conducir',
  CURSO_DEFENSIVO: 'Curso defensivo',
};

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

function descripcion(item: PendienteFlota): string {
  if (item.categoria === 'mantenimiento') {
    const partes: string[] = [];
    if (item.km_proximo != null && item.km_actual != null) {
      const diff = item.km_proximo - item.km_actual;
      partes.push(
        diff < 0
          ? `${Math.abs(diff).toLocaleString('es-PY')} km pasado`
          : `faltan ${diff.toLocaleString('es-PY')} km`,
      );
    }
    if (item.fecha_proxima) {
      const d = diasHasta(item.fecha_proxima);
      if (d != null) partes.push(d < 0 ? `vencido hace ${-d} días` : `vence en ${d} días`);
    }
    return partes.join(' · ');
  }
  const d = diasHasta(item.vencimiento);
  if (d == null) return '';
  return d < 0
    ? `Vencido hace ${-d} días (${formatDate(item.vencimiento)})`
    : `Vence en ${d} días (${formatDate(item.vencimiento)})`;
}

function colorEstado(estado: EstadoPendiente): { bg: string; text: string } {
  return estado === 'VENCIDO'
    ? { bg: '#fee2e2', text: '#b91c1c' }
    : { bg: '#fef3c7', text: '#92400e' };
}

export default function MantenimientoScreen() {
  const { isChofer } = useRoles();
  const { data: items = [], isLoading, refetch, isRefetching } = useFlotaPendientes();

  useFocusEffect(
    useCallback(() => {
      if (isChofer) refetch();
    }, [isChofer, refetch]),
  );

  // Agrupamos por vehículo (mant + docs de vehículo) y separamos los docs
  // personales del chofer en una sección aparte ("Mis documentos"). Mismo
  // criterio que el dashboard admin.
  const gruposVeh = useMemo(() => {
    const m = new Map<number, { chapa: string; marca: string | null; items: PendienteFlota[] }>();
    for (const it of items) {
      if (it.categoria === 'documento_chofer' || it.vehiculo_id == null) continue;
      const g = m.get(it.vehiculo_id) ?? {
        chapa: it.chapa ?? '',
        marca: it.marca ?? null,
        items: [],
      };
      g.items.push(it);
      m.set(it.vehiculo_id, g);
    }
    return Array.from(m.entries()).map(([id, g]) => ({ vehiculo_id: id, ...g }));
  }, [items]);

  const docsChofer = useMemo(
    () => items.filter((it) => it.categoria === 'documento_chofer'),
    [items],
  );

  // FlatList soporta data heterogénea pero necesita keys únicas y un solo
  // renderer. Mezclamos los grupos en una sola lista con discriminator.
  type GrupoListItem =
    | { kind: 'vehiculo'; vehiculo_id: number; chapa: string; marca: string | null; items: PendienteFlota[] }
    | { kind: 'mis-docs'; items: PendienteFlota[] };
  const listItems = useMemo<GrupoListItem[]>(() => {
    const arr: GrupoListItem[] = gruposVeh.map((g) => ({ kind: 'vehiculo' as const, ...g }));
    if (docsChofer.length) arr.push({ kind: 'mis-docs' as const, items: docsChofer });
    return arr;
  }, [gruposVeh, docsChofer]);

  const totalVencidos = items.filter((i) => i.estado === 'VENCIDO').length;
  const totalProximos = items.filter((i) => i.estado === 'PROXIMO').length;

  if (!isChofer) {
    return (
      <SafeAreaView style={styles.root} edges={['top']}>
        <Text style={styles.hint}>Esta sección es solo para choferes.</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Mi vehículo</Text>
        <Text style={styles.subtitle}>Mantenimientos y documentos a atender</Text>
      </View>

      <View style={styles.kpis}>
        <View style={[styles.kpi, { borderColor: '#fecaca' }]}>
          <Text style={[styles.kpiValue, { color: '#b91c1c' }]}>{totalVencidos}</Text>
          <Text style={styles.kpiLabel}>Vencidos</Text>
        </View>
        <View style={[styles.kpi, { borderColor: '#fde68a' }]}>
          <Text style={[styles.kpiValue, { color: '#92400e' }]}>{totalProximos}</Text>
          <Text style={styles.kpiLabel}>Próximos</Text>
        </View>
      </View>

      {isLoading ? (
        <ActivityIndicator color={JWFTheme.color.accent} style={{ marginTop: 32 }} />
      ) : (
        <FlatList
          data={listItems}
          keyExtractor={(g) => (g.kind === 'vehiculo' ? `v-${g.vehiculo_id}` : 'mis-docs')}
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
              <Text style={styles.empty}>Todo al día.</Text>
              <Text style={styles.emptyHint}>
                No tenés mantenimientos ni documentos pendientes.
              </Text>
            </View>
          }
          renderItem={({ item: g }) => (
            <View style={styles.grupo}>
              <View style={styles.grupoHeader}>
                {g.kind === 'vehiculo' ? (
                  <>
                    <MaterialIcons name="directions-car" size={16} color={JWFTheme.color.textMuted} />
                    <Text style={styles.grupoChapa}>{g.chapa}</Text>
                    {g.marca ? <Text style={styles.grupoMarca}>{g.marca}</Text> : null}
                  </>
                ) : (
                  <>
                    <MaterialIcons name="badge" size={16} color={JWFTheme.color.textMuted} />
                    <Text style={styles.grupoChapa}>Mis documentos</Text>
                  </>
                )}
              </View>
              {g.items.map((it) => {
                const c = colorEstado(it.estado);
                const esDoc = it.categoria === 'documento' || it.categoria === 'documento_chofer';
                const titulo =
                  esDoc
                    ? `${LABEL_DOC[it.tipo_doc ?? 'OTRO'] ?? it.tipo_doc}${
                        it.titulo.includes(' · ') ? ` · ${it.titulo.split(' · ').slice(1).join(' · ')}` : ''
                      }`
                    : it.titulo;
                const iconName =
                  it.categoria === 'mantenimiento'
                    ? 'build'
                    : it.categoria === 'documento_chofer'
                      ? 'badge'
                      : 'description';
                return (
                  <View key={`${it.categoria}-${it.codigo}`} style={styles.item}>
                    <MaterialIcons
                      name={iconName}
                      size={18}
                      color={JWFTheme.color.textMuted}
                      style={{ marginTop: 2 }}
                    />
                    <View style={styles.itemBody}>
                      <View style={styles.itemTituloRow}>
                        <Text style={styles.itemTitulo}>{titulo}</Text>
                        <View style={[styles.badge, { backgroundColor: c.bg }]}>
                          <Text style={[styles.badgeText, { color: c.text }]}>
                            {it.estado === 'VENCIDO' ? 'Vencido' : 'Próximo'}
                          </Text>
                        </View>
                      </View>
                      <Text style={styles.itemDesc}>{descripcion(it)}</Text>
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
    alignItems: 'baseline',
    gap: 8,
  },
  grupoChapa: { fontFamily: 'monospace', fontSize: 16, fontWeight: JWFTheme.fontWeight.semibold },
  grupoMarca: { fontSize: 13, color: JWFTheme.color.textMuted },
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
  empty: { fontSize: 16, fontWeight: JWFTheme.fontWeight.medium, color: JWFTheme.color.textPrimary },
  emptyHint: { fontSize: 13, color: JWFTheme.color.textMuted, textAlign: 'center', paddingHorizontal: 32 },
  hint: { fontSize: 14, color: JWFTheme.color.textMuted, padding: 20 },
});
