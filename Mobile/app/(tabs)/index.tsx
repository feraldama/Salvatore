import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuth, useRoles } from '@/lib/auth/AuthContext';
import { JWFTheme } from '@/constants/theme';

interface Modulo {
  titulo: string;
  descripcion: string;
  visible: boolean;
  estado: 'proximamente' | 'fase1' | 'fase2' | 'fase3' | 'fase4' | 'disponible';
  ruta?: string;
}

export default function HomeScreen() {
  const { user } = useAuth();
  const roles = useRoles();
  const router = useRouter();

  const modulos: Modulo[] = [
    {
      titulo: 'Asistencias tecnicas',
      descripcion: 'Tickets de mantenimiento de pantallas DOOH',
      visible: roles.isTecnico,
      estado: 'fase1',
    },
    {
      titulo: 'Carga de facturas',
      descripcion: 'Comprobantes de caja chica',
      visible: roles.isComercial || roles.isAdmin,
      estado: 'fase2',
    },
    {
      titulo: 'Viaje y combustible',
      descripcion: 'Iniciar viaje, cargar combustible con fotos y GPS',
      visible: roles.isChofer,
      estado: 'disponible',
      ruta: '/(tabs)/viaje',
    },
    {
      titulo: 'Control de flota',
      descripcion: 'Ver choferes en vivo, atención requerida, detalle de viajes',
      visible: roles.isGerenteFlota && !roles.isChofer,
      estado: 'disponible',
      ruta: '/(tabs)/flota-live',
    },
    {
      titulo: 'Justificar ausencia',
      descripcion: 'Cargá tu permiso, licencia médica, accidente, etc.',
      visible: true,
      estado: 'disponible',
      ruta: '/ausencia',
    },
  ];

  const visibles = modulos.filter((m) => m.visible);

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.greeting}>Hola, {user?.nombre ?? 'usuario'}</Text>
        {user?.cargo ? <Text style={styles.subgreeting}>{user.cargo}</Text> : null}

        <Text style={styles.sectionTitle}>Tus modulos</Text>

        {visibles.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>Sin modulos asignados</Text>
            <Text style={styles.emptyText}>
              Contactá al administrador para que te asigne un rol.
            </Text>
          </View>
        ) : (
          visibles.map((m) => {
            const Wrapper: React.ComponentType<{ style: object; onPress?: () => void; children: React.ReactNode }> =
              m.ruta ? TouchableOpacity : (View as never);
            return (
              <Wrapper
                key={m.titulo}
                style={styles.moduleCard}
                onPress={m.ruta ? () => router.push(m.ruta as never) : undefined}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.moduleTitle}>{m.titulo}</Text>
                  <Text style={styles.moduleDesc}>{m.descripcion}</Text>
                </View>
                <View style={[styles.badge, m.estado === 'disponible' && styles.badgeOk]}>
                  <Text style={[styles.badgeText, m.estado === 'disponible' && styles.badgeTextOk]}>
                    {badgeLabel(m.estado)}
                  </Text>
                </View>
              </Wrapper>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function badgeLabel(estado: Modulo['estado']) {
  switch (estado) {
    case 'fase1':
      return 'Proximo';
    case 'fase2':
      return 'Fase 2';
    case 'fase3':
      return 'Fase 3';
    case 'fase4':
      return 'Fase 4';
    case 'disponible':
      return 'Disponible';
    default:
      return 'Pronto';
  }
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: JWFTheme.color.bgApp },
  content: { padding: 20, gap: 12 },
  greeting: {
    fontSize: 28,
    fontWeight: JWFTheme.fontWeight.heroLight,
    color: JWFTheme.color.textPrimary,
    letterSpacing: JWFTheme.titleTracking,
  },
  subgreeting: { fontSize: 14, color: JWFTheme.color.textMuted, marginTop: -4, marginBottom: 8 },
  sectionTitle: {
    fontSize: 13,
    fontWeight: JWFTheme.fontWeight.semibold,
    color: JWFTheme.color.textMuted,
    marginTop: 16,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  moduleCard: {
    backgroundColor: JWFTheme.color.bgCard,
    padding: 16,
    borderRadius: JWFTheme.radius.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: JWFTheme.color.borderDefault,
    ...JWFTheme.shadow.sm,
  },
  moduleTitle: { fontSize: 16, fontWeight: JWFTheme.fontWeight.semibold, color: JWFTheme.color.textPrimary },
  moduleDesc: { fontSize: 13, color: JWFTheme.color.textMuted, marginTop: 2 },
  badge: {
    backgroundColor: JWFTheme.color.accentBg,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: JWFTheme.radius.full,
  },
  badgeText: { fontSize: 11, fontWeight: JWFTheme.fontWeight.semibold, color: JWFTheme.color.accent },
  badgeOk: { backgroundColor: JWFTheme.color.successBg },
  badgeTextOk: { color: JWFTheme.color.success },
  emptyCard: {
    backgroundColor: JWFTheme.color.bgCard,
    padding: 20,
    borderRadius: JWFTheme.radius.lg,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: JWFTheme.color.borderDefault,
  },
  emptyTitle: { fontSize: 16, fontWeight: JWFTheme.fontWeight.semibold, color: JWFTheme.color.textPrimary, marginBottom: 4 },
  emptyText: { fontSize: 13, color: JWFTheme.color.textMuted, textAlign: 'center' },
});
