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

import { useAgendaHoy } from '@/hooks/useVisitas';
import { useRoles } from '@/lib/auth/AuthContext';
import type { EstadoVisita, Visita } from '@/lib/api/visitas';
import { JWFTheme } from '@/constants/theme';

const ESTADO_LABEL: Record<EstadoVisita, string> = {
  agendada: 'Agendada',
  en_curso: 'En curso',
  completada: 'Completada',
  no_realizada: 'No realizada',
};

const ESTADO_COLOR: Record<EstadoVisita, { fondo: string; texto: string }> = {
  agendada:     { fondo: JWFTheme.color.accentBg,  texto: JWFTheme.color.accent  },
  en_curso:     { fondo: JWFTheme.color.warningBg, texto: JWFTheme.color.warning },
  completada:   { fondo: JWFTheme.color.successBg, texto: JWFTheme.color.success },
  no_realizada: { fondo: JWFTheme.color.dangerBg,  texto: JWFTheme.color.danger  },
};

export default function VisitasScreen() {
  const router = useRouter();
  const { isComercial, isAdmin } = useRoles();
  const habilitado = isComercial || isAdmin;
  const { data, isLoading, isFetching, refetch, isError, error } = useAgendaHoy(habilitado);

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Visitas</Text>
        <Text style={styles.subtitle}>Agenda comercial del día</Text>
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={JWFTheme.color.accent} />
        </View>
      ) : isError ? (
        <View style={styles.center}>
          <Text style={styles.errorTitle}>No se pudo cargar la agenda</Text>
          <Text style={styles.errorText}>
            {error instanceof Error ? error.message : 'Reintentá en un momento.'}
          </Text>
          <TouchableOpacity style={styles.btnRetry} onPress={() => refetch()}>
            <Text style={styles.btnRetryText}>Reintentar</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={data?.visitas ?? []}
          keyExtractor={(v) => String(v.id)}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={isFetching} onRefresh={() => refetch()} />}
          ListEmptyComponent={
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>Sin visitas hoy</Text>
              <Text style={styles.emptyText}>
                Cuando tengas una visita agendada para hoy va a aparecer acá.
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <VisitaCard
              visita={item}
              onPress={() => router.push(`/visita/${item.id}` as never)}
            />
          )}
        />
      )}
    </SafeAreaView>
  );
}

function VisitaCard({ visita, onPress }: { visita: Visita; onPress: () => void }) {
  const sev = ESTADO_COLOR[visita.estado];
  return (
    <TouchableOpacity style={styles.card} onPress={onPress} accessibilityRole="button">
      <View style={{ flex: 1 }}>
        <Text style={styles.cardTitle} numberOfLines={1}>
          {visita.empresa?.nombre ?? visita.asunto}
        </Text>
        <Text style={styles.cardMeta} numberOfLines={1}>
          {horaCorta(visita.fechaInicio)} · {visita.asunto}
          {visita.asistencia?.pendiente ? ' · asistencia pendiente' : ''}
        </Text>
      </View>
      <View style={[styles.badge, { backgroundColor: sev.fondo }]}>
        <Text style={[styles.badgeText, { color: sev.texto }]}>
          {ESTADO_LABEL[visita.estado].toUpperCase()}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

function horaCorta(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
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
  listContent: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 24, gap: 10 },
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
});
