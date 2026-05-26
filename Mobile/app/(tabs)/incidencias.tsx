import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { useAuth, useRoles } from '@/lib/auth/AuthContext';
import { useIncidencias } from '@/hooks/useIncidencias';
import { JWFTheme } from '@/constants/theme';
import type {
  AsignacionFiltro,
  IncidenciaResumen,
  SeveridadIncidencia,
  TipoIncidencia,
} from '@/lib/types/incidencias';

const TIPOS_LABEL: Record<TipoIncidencia, string> = {
  apagada: 'Apagada',
  parpadeo: 'Parpadeo',
  freeze: 'Imagen congelada',
  sin_senal: 'Sin señal',
  error_camara: 'Error cámara',
  zona_muerta: 'Zona muerta',
};

const COLORES_SEVERIDAD: Record<SeveridadIncidencia, { fondo: string; texto: string }> = {
  info: { fondo: JWFTheme.color.infoBg, texto: JWFTheme.color.info },
  warning: { fondo: JWFTheme.color.warningBg, texto: JWFTheme.color.warning },
  critical: { fondo: JWFTheme.color.dangerBg, texto: JWFTheme.color.danger },
};

export default function IncidenciasScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { isAdmin } = useRoles();
  const [asignacion, setAsignacion] = useState<AsignacionFiltro>(isAdmin ? 'todas' : 'mias');

  const filtros = useMemo(
    () => ({ asignacion, abiertas: true, limite: 50 }),
    [asignacion],
  );

  const { data, isLoading, isFetching, refetch, isError, error } = useIncidencias(filtros);

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Incidencias</Text>
        <Text style={styles.subtitle}>Pantallas con falla detectada</Text>
      </View>

      <View style={styles.pillRow}>
        <Pill label="Mías" activo={asignacion === 'mias'} onPress={() => setAsignacion('mias')} />
        <Pill
          label="Sin asignar"
          activo={asignacion === 'sin_asignar'}
          onPress={() => setAsignacion('sin_asignar')}
        />
        {isAdmin && (
          <Pill
            label="Todas"
            activo={asignacion === 'todas'}
            onPress={() => setAsignacion('todas')}
          />
        )}
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={JWFTheme.color.accent} />
        </View>
      ) : isError ? (
        <View style={styles.center}>
          <Text style={styles.errorTitle}>No se pudieron cargar las incidencias</Text>
          <Text style={styles.errorText}>
            {error instanceof Error ? error.message : 'Reintentá en un momento.'}
          </Text>
          <TouchableOpacity style={styles.btnRetry} onPress={() => refetch()}>
            <Text style={styles.btnRetryText}>Reintentar</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={data?.datos ?? []}
          keyExtractor={(it) => it.id}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={isFetching} onRefresh={() => refetch()} />}
          ListEmptyComponent={
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>Sin incidencias</Text>
              <Text style={styles.emptyText}>
                {asignacion === 'mias'
                  ? 'No tenés ninguna incidencia asignada. Probá con "Sin asignar" o reportá una nueva.'
                  : 'Todo en orden por ahora.'}
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <IncidenciaCard
              incidencia={item}
              miErpId={user?.id ?? null}
              onPress={() => router.push(`/incidencia/${item.id}` as never)}
            />
          )}
        />
      )}

      <TouchableOpacity
        style={styles.fab}
        onPress={() => router.push('/incidencia/nueva' as never)}
        accessibilityRole="button"
        accessibilityLabel="Reportar incidencia"
      >
        <Text style={styles.fabPlus}>+</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

function Pill({ label, activo, onPress }: { label: string; activo: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.pill, activo && styles.pillActivo]}
      accessibilityRole="button"
    >
      <Text style={[styles.pillText, activo && styles.pillTextActivo]}>{label}</Text>
    </TouchableOpacity>
  );
}

function IncidenciaCard({
  incidencia,
  miErpId,
  onPress,
}: {
  incidencia: IncidenciaResumen;
  miErpId: number | null;
  onPress: () => void;
}) {
  const sev = COLORES_SEVERIDAD[incidencia.severidad] ?? COLORES_SEVERIDAD.warning;
  // Tres estados visualmente útiles:
  //  - tomada por mí: ya estoy trabajando.
  //  - sugerida a mí: el auto-asignador (cercanía) me la propuso.
  //  - en pool: nadie la tomó, cualquiera puede agarrarla.
  const yaTomada = incidencia.tomada_en != null;
  const esMia = miErpId != null && incidencia.tecnico_erp_id === miErpId;
  const sugeridaAMi = !yaTomada && esMia;
  const tomadaPorMi = yaTomada && esMia;
  const sugeridaAOtro = !yaTomada && incidencia.tecnico_erp_id != null && !esMia;

  const tag = tomadaPorMi
    ? ' · trabajando'
    : sugeridaAMi
      ? ' · sugerida (cercanía)'
      : sugeridaAOtro
        ? ` · sugerida a ${incidencia.tecnico?.nombre ?? 'otro técnico'}`
        : ' · en pool';

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} accessibilityRole="button">
      <View style={{ flex: 1 }}>
        <Text style={styles.cardTitle} numberOfLines={1}>
          {incidencia.pantalla.nombre}
        </Text>
        <Text style={styles.cardMeta}>
          {TIPOS_LABEL[incidencia.tipo] ?? incidencia.tipo} · {desdeAhora(incidencia.iniciado_en)}{tag}
        </Text>
      </View>
      <View style={[styles.badge, { backgroundColor: sev.fondo }]}>
        <Text style={[styles.badgeText, { color: sev.texto }]}>
          {incidencia.severidad.toUpperCase()}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

function desdeAhora(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.round(ms / 60000);
  if (min < 1) return 'recién';
  if (min < 60) return `hace ${min} min`;
  const horas = Math.round(min / 60);
  if (horas < 24) return `hace ${horas} h`;
  const dias = Math.round(horas / 24);
  return `hace ${dias} d`;
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
  pillRow: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    gap: 8,
    paddingVertical: 12,
    flexWrap: 'wrap',
  },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: JWFTheme.radius.full,
    backgroundColor: JWFTheme.color.bgCard,
    borderWidth: 1,
    borderColor: JWFTheme.color.borderDefault,
  },
  pillActivo: { backgroundColor: JWFTheme.color.accent, borderColor: JWFTheme.color.accent },
  pillText: { fontSize: 13, color: JWFTheme.color.textSecondary, fontWeight: JWFTheme.fontWeight.semibold },
  pillTextActivo: { color: JWFTheme.color.textInverse },
  listContent: { paddingHorizontal: 20, paddingBottom: 24, gap: 10 },
  card: {
    backgroundColor: JWFTheme.color.bgCard,
    padding: 14,
    borderRadius: JWFTheme.radius.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: JWFTheme.color.borderDefault,
    ...JWFTheme.shadow.sm,
  },
  cardTitle: { fontSize: 16, fontWeight: JWFTheme.fontWeight.semibold, color: JWFTheme.color.textPrimary },
  cardMeta: { fontSize: 13, color: JWFTheme.color.textMuted, marginTop: 2 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: JWFTheme.radius.xl },
  badgeText: { fontSize: 11, fontWeight: JWFTheme.fontWeight.bold, letterSpacing: 0.5 },
  emptyCard: {
    backgroundColor: JWFTheme.color.bgCard,
    padding: 24,
    borderRadius: JWFTheme.radius.lg,
    alignItems: 'center',
    marginTop: 16,
    borderWidth: 1,
    borderColor: JWFTheme.color.borderDefault,
  },
  emptyTitle: { fontSize: 16, fontWeight: JWFTheme.fontWeight.semibold, color: JWFTheme.color.textPrimary, marginBottom: 4 },
  emptyText: { fontSize: 13, color: JWFTheme.color.textMuted, textAlign: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, gap: 8 },
  errorTitle: { fontSize: 16, fontWeight: JWFTheme.fontWeight.semibold, color: JWFTheme.color.danger },
  errorText: { fontSize: 13, color: JWFTheme.color.textMuted, textAlign: 'center' },
  btnRetry: {
    marginTop: 8,
    backgroundColor: JWFTheme.color.accent,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: JWFTheme.radius.md,
  },
  btnRetryText: { color: JWFTheme.color.textInverse, fontWeight: JWFTheme.fontWeight.semibold },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 24,
    backgroundColor: JWFTheme.color.accent,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    ...JWFTheme.shadow.md,
  },
  fabPlus: { color: JWFTheme.color.textInverse, fontSize: 28, lineHeight: 28, fontWeight: JWFTheme.fontWeight.bold, marginTop: -2 },
});
