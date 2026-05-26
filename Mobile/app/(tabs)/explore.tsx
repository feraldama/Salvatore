import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/lib/auth/AuthContext';
import { JWFTheme } from '@/constants/theme';

export default function CuentaScreen() {
  const { user, signOut } = useAuth();

  function confirmarSalir() {
    Alert.alert('Cerrar sesion', '¿Seguro que quieres salir?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Salir', style: 'destructive', onPress: signOut },
    ]);
  }

  if (!user) return null;

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Mi cuenta</Text>

        <View style={styles.card}>
          <Field label="Nombre" value={user.nombre} />
          <Field label="Email" value={user.email} />
          <Field label="Login ERP" value={user.login} />
          <Field label="Codigo operador" value={user.codigo} />
          <Field label="Cargo" value={user.cargo} />
          <Field label="Empresa" value={user.empresaNombre ?? user.empresa?.toString() ?? null} />
          <Field label="Sucursal" value={user.sucursalNombre ?? user.sucursal?.toString() ?? null} />
        </View>

        <Text style={styles.sectionTitle}>Roles</Text>
        <View style={styles.card}>
          {user.isAdmin ? (
            <View style={styles.rolePill}>
              <Text style={styles.rolePillText}>ADMIN</Text>
            </View>
          ) : null}
          {user.roles.length === 0 && !user.isAdmin ? (
            <Text style={styles.muted}>Sin roles asignados</Text>
          ) : (
            <View style={styles.roleList}>
              {user.roles.map((r) => (
                <View key={r.rol_id} style={styles.rolePill}>
                  <Text style={styles.rolePillText}>{r.rol_codigo || r.rol_nombre}</Text>
                </View>
              ))}
            </View>
          )}
        </View>

        <TouchableOpacity style={styles.logoutBtn} onPress={confirmarSalir} accessibilityRole="button">
          <Text style={styles.logoutText}>Cerrar sesion</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={styles.fieldValue}>{value ?? '—'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: JWFTheme.color.bgApp },
  content: { padding: 20, gap: 12 },
  title: {
    fontSize: 28,
    fontWeight: JWFTheme.fontWeight.heroLight,
    color: JWFTheme.color.textPrimary,
    letterSpacing: JWFTheme.titleTracking,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: JWFTheme.fontWeight.semibold,
    color: JWFTheme.color.textMuted,
    marginTop: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  card: {
    backgroundColor: JWFTheme.color.bgCard,
    borderRadius: JWFTheme.radius.lg,
    padding: 16,
    borderWidth: 1,
    borderColor: JWFTheme.color.borderDefault,
    ...JWFTheme.shadow.sm,
  },
  field: {
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: JWFTheme.color.borderSubtle,
  },
  fieldLabel: { fontSize: 12, color: JWFTheme.color.textMuted },
  fieldValue: { fontSize: 15, color: JWFTheme.color.textPrimary, marginTop: 2 },
  roleList: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  rolePill: {
    backgroundColor: JWFTheme.color.accentBg,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: JWFTheme.radius.full,
  },
  rolePillText: { color: JWFTheme.color.accent, fontSize: 12, fontWeight: JWFTheme.fontWeight.semibold },
  muted: { color: JWFTheme.color.textMuted, fontSize: 13 },
  logoutBtn: {
    marginTop: 24,
    backgroundColor: JWFTheme.color.bgCard,
    borderWidth: 1,
    borderColor: JWFTheme.color.danger,
    paddingVertical: 14,
    borderRadius: JWFTheme.radius.md,
    alignItems: 'center',
  },
  logoutText: { color: JWFTheme.color.danger, fontSize: 16, fontWeight: JWFTheme.fontWeight.semibold },
});
