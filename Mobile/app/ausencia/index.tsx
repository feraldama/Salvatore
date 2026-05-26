import { useRouter } from 'expo-router';
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

import { useMisAusencias } from '@/hooks/useAusencias';
import { JWFTheme } from '@/constants/theme';
import type { Ausencia, EstadoAusencia } from '@/lib/types/ausencias';

const ESTADO_LABEL: Record<EstadoAusencia, string> = {
  solicitada: 'Solicitada',
  aprobada:   'Aprobada',
  rechazada:  'Rechazada',
  en_curso:   'En curso',
  finalizada: 'Finalizada',
  cancelada:  'Cancelada',
};

const ESTADO_COLOR: Record<EstadoAusencia, { fondo: string; texto: string }> = {
  solicitada: { fondo: JWFTheme.color.warningBg, texto: JWFTheme.color.warning },
  aprobada:   { fondo: JWFTheme.color.successBg, texto: JWFTheme.color.success },
  rechazada:  { fondo: JWFTheme.color.dangerBg,  texto: JWFTheme.color.danger  },
  en_curso:   { fondo: JWFTheme.color.accentBg,  texto: JWFTheme.color.accent  },
  finalizada: { fondo: JWFTheme.color.bgSubtle,  texto: JWFTheme.color.textMuted },
  cancelada:  { fondo: JWFTheme.color.bgSubtle,  texto: JWFTheme.color.textMuted },
};

export default function AusenciasScreen() {
  const router = useRouter();
  const { data, isLoading, isFetching, refetch, isError, error } = useMisAusencias();

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Mis ausencias</Text>
        <Text style={styles.subtitle}>Justificaciones que cargaste</Text>
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={JWFTheme.color.accent} />
        </View>
      ) : isError ? (
        <View style={styles.center}>
          <Text style={styles.errorTitle}>No se pudieron cargar tus ausencias</Text>
          <Text style={styles.errorText}>
            {error instanceof Error ? error.message : 'Reintentá en un momento.'}
          </Text>
          <TouchableOpacity style={styles.btnRetry} onPress={() => refetch()}>
            <Text style={styles.btnRetryText}>Reintentar</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={data?.data ?? []}
          keyExtractor={(a) => String(a.ID)}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={isFetching} onRefresh={() => refetch()} />}
          ListEmptyComponent={
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>Sin ausencias cargadas</Text>
              <Text style={styles.emptyText}>
                Cuando justifiques una ausencia va a aparecer acá.
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <AusenciaCard
              ausencia={item}
              onPress={() => router.push(`/ausencia/${item.ID}` as never)}
            />
          )}
        />
      )}

      <TouchableOpacity
        style={styles.fab}
        onPress={() => router.push('/ausencia/nueva' as never)}
        accessibilityRole="button"
      >
        <Text style={styles.fabText}>+ Justificar</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

function AusenciaCard({ ausencia, onPress }: { ausencia: Ausencia; onPress: () => void }) {
  const sev = ESTADO_COLOR[ausencia.ESTADO];
  return (
    <TouchableOpacity style={styles.card} onPress={onPress} accessibilityRole="button">
      <View style={[styles.tipoDot, { backgroundColor: ausencia.tipo_color || JWFTheme.color.accent }]} />
      <View style={{ flex: 1 }}>
        <Text style={styles.cardTitle} numberOfLines={1}>
          {ausencia.tipo_nombre}
        </Text>
        <Text style={styles.cardMeta} numberOfLines={1}>
          {formatRango(ausencia.FECHA_INICIO, ausencia.FECHA_FIN)} · {ausencia.DIAS} día(s)
        </Text>
      </View>
      <View style={[styles.badge, { backgroundColor: sev.fondo }]}>
        <Text style={[styles.badgeText, { color: sev.texto }]}>
          {ESTADO_LABEL[ausencia.ESTADO].toUpperCase()}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

// Las fechas vienen como 'YYYY-MM-DD' o ISO. Tomamos solo la parte de fecha
// (sin parsear con new Date — corre el día en UTC-4 Paraguay).
function formatRango(inicio: string, fin: string): string {
  const i = soloFecha(inicio);
  const f = soloFecha(fin);
  if (i === f) return formatFecha(i);
  return `${formatFecha(i)} → ${formatFecha(f)}`;
}

function soloFecha(s: string): string {
  return s.slice(0, 10);
}

function formatFecha(yyyy_mm_dd: string): string {
  const [, m, d] = yyyy_mm_dd.split('-');
  return `${d}/${m}`;
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
  listContent: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 100, gap: 10 },
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
  tipoDot: { width: 10, height: 10, borderRadius: 5 },
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
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderRadius: JWFTheme.radius.full,
    ...JWFTheme.shadow.md,
  },
  fabText: { color: JWFTheme.color.textInverse, fontWeight: JWFTheme.fontWeight.bold, fontSize: 14 },
});
