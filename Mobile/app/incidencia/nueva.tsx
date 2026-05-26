import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { useCrearIncidencia, usePantallasParaIncidencia } from '@/hooks/useIncidencias';
import { JWFTheme } from '@/constants/theme';
import type { SeveridadIncidencia, TipoIncidencia } from '@/lib/types/incidencias';

const TIPOS: { value: TipoIncidencia; label: string }[] = [
  { value: 'apagada', label: 'Apagada' },
  { value: 'sin_senal', label: 'Sin señal' },
  { value: 'freeze', label: 'Imagen congelada' },
  { value: 'parpadeo', label: 'Parpadeo' },
  { value: 'zona_muerta', label: 'Zona muerta' },
  { value: 'error_camara', label: 'Error cámara' },
];

const SEVERIDADES: { value: SeveridadIncidencia; label: string; color: string }[] = [
  { value: 'info', label: 'Info', color: JWFTheme.color.info },
  { value: 'warning', label: 'Warning', color: JWFTheme.color.warning },
  { value: 'critical', label: 'Critical', color: JWFTheme.color.danger },
];

export default function NuevaIncidenciaScreen() {
  const router = useRouter();
  const pantallas = usePantallasParaIncidencia();
  const crear = useCrearIncidencia();

  const [pantallaId, setPantallaId] = useState<string | null>(null);
  const [tipo, setTipo] = useState<TipoIncidencia>('apagada');
  const [severidad, setSeveridad] = useState<SeveridadIncidencia>('warning');
  const [descripcion, setDescripcion] = useState('');

  const puedeEnviar = !!pantallaId && !crear.isPending;

  function volver() {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/incidencias' as never);
  }

  function onSubmit() {
    if (!pantallaId) {
      Alert.alert('Falta pantalla', 'Tenés que elegir la pantalla afectada');
      return;
    }
    crear.mutate(
      {
        pantallaId,
        tipo,
        severidad,
        descripcion: descripcion.trim() || undefined,
      },
      {
        onSuccess: (data) => {
          router.replace(`/incidencia/${data.id}` as never);
        },
        onError: (e) => {
          const msg = e instanceof Error ? e.message : 'No se pudo crear la incidencia.';
          Alert.alert('Error', msg);
        },
      },
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.h1}>Reportar incidencia</Text>

          <Text style={styles.label}>Pantalla *</Text>
          <View style={styles.listBox}>
            {pantallas.isLoading ? (
              <View style={styles.listEmpty}>
                <ActivityIndicator color={JWFTheme.color.accent} />
              </View>
            ) : pantallas.isError ? (
              <Text style={styles.listError}>
                No se cargaron las pantallas. Cerrá y volvé a entrar.
              </Text>
            ) : (pantallas.data ?? []).length === 0 ? (
              <Text style={styles.muted}>No hay pantallas en la empresa.</Text>
            ) : (
              <ScrollView
                style={styles.listScroll}
                nestedScrollEnabled
                keyboardShouldPersistTaps="handled"
              >
                {(pantallas.data ?? []).map((p) => {
                  const activo = p.id === pantallaId;
                  return (
                    <TouchableOpacity
                      key={p.id}
                      style={[styles.listItem, activo && styles.listItemActivo]}
                      onPress={() => setPantallaId(p.id)}
                      accessibilityRole="button"
                    >
                      <View style={{ flex: 1 }}>
                        <Text
                          style={[styles.listItemTitle, activo && styles.listItemTitleActivo]}
                          numberOfLines={1}
                        >
                          {p.nombre}
                        </Text>
                        {p.ubicacion ? (
                          <Text style={styles.listItemMeta} numberOfLines={1}>
                            {p.ubicacion}
                          </Text>
                        ) : null}
                      </View>
                      {activo ? <Text style={styles.check}>✓</Text> : null}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}
          </View>

          <Text style={[styles.label, styles.labelSection]}>Tipo *</Text>
          <View style={styles.chipsRow}>
            {TIPOS.map((t) => (
              <Chip
                key={t.value}
                label={t.label}
                activo={tipo === t.value}
                onPress={() => setTipo(t.value)}
              />
            ))}
          </View>

          <Text style={[styles.label, styles.labelSection]}>Severidad</Text>
          <View style={styles.chipsRow}>
            {SEVERIDADES.map((s) => (
              <Chip
                key={s.value}
                label={s.label}
                activo={severidad === s.value}
                onPress={() => setSeveridad(s.value)}
                colorActivo={s.color}
              />
            ))}
          </View>

          <Text style={[styles.label, styles.labelSection]}>Descripción</Text>
          <TextInput
            style={styles.textarea}
            multiline
            numberOfLines={4}
            placeholder="Detalle libre (opcional). Ej: 'esquina inferior derecha apagada'."
            value={descripcion}
            onChangeText={setDescripcion}
          />
        </ScrollView>

        <View style={styles.bottomBar}>
          <TouchableOpacity style={styles.btnVolver} onPress={volver} accessibilityRole="button">
            <Text style={styles.btnVolverText}>← Volver</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.btnSubmit, !puedeEnviar && styles.btnSubmitDisabled]}
            onPress={onSubmit}
            disabled={!puedeEnviar}
            accessibilityRole="button"
          >
            {crear.isPending ? (
              <ActivityIndicator color={JWFTheme.color.textInverse} />
            ) : (
              <Text style={styles.btnSubmitText}>Crear</Text>
            )}
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

function Chip({
  label,
  activo,
  onPress,
  colorActivo = JWFTheme.color.accent,
}: {
  label: string;
  activo: boolean;
  onPress: () => void;
  colorActivo?: string;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[
        styles.chip,
        activo && { backgroundColor: colorActivo, borderColor: colorActivo },
      ]}
    >
      <Text style={[styles.chipText, activo && styles.chipTextActivo]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  root: { flex: 1, backgroundColor: JWFTheme.color.bgApp },
  content: { padding: 20, gap: 8, paddingBottom: 24 },
  h1: {
    fontSize: 24,
    fontWeight: JWFTheme.fontWeight.heroLight,
    color: JWFTheme.color.textPrimary,
    letterSpacing: JWFTheme.titleTracking,
    marginBottom: 8,
  },
  label: {
    fontSize: 13,
    fontWeight: JWFTheme.fontWeight.semibold,
    color: JWFTheme.color.textSecondary,
    marginBottom: 6,
  },
  labelSection: { marginTop: 16 },
  // Lista de pantallas siempre visible, scrolleable.
  listBox: {
    backgroundColor: JWFTheme.color.bgCard,
    borderRadius: JWFTheme.radius.md,
    borderWidth: 1,
    borderColor: JWFTheme.color.borderDefault,
    maxHeight: 280,
    overflow: 'hidden',
  },
  listScroll: { maxHeight: 278 },
  listEmpty: { padding: 24, alignItems: 'center' },
  listError: { padding: 14, color: JWFTheme.color.danger, fontSize: 13 },
  muted: { padding: 14, color: JWFTheme.color.textMuted, fontSize: 13 },
  listItem: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: JWFTheme.color.borderSubtle,
    flexDirection: 'row',
    alignItems: 'center',
  },
  listItemActivo: { backgroundColor: JWFTheme.color.accentBg },
  listItemTitle: { fontSize: 15, color: JWFTheme.color.textPrimary, fontWeight: JWFTheme.fontWeight.medium },
  listItemTitleActivo: { color: JWFTheme.color.accent, fontWeight: JWFTheme.fontWeight.bold },
  listItemMeta: { fontSize: 13, color: JWFTheme.color.textMuted, marginTop: 2 },
  check: { color: JWFTheme.color.accent, fontSize: 18, fontWeight: JWFTheme.fontWeight.bold, marginLeft: 8 },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: JWFTheme.radius.full,
    backgroundColor: JWFTheme.color.bgCard,
    borderWidth: 1,
    borderColor: JWFTheme.color.borderDefault,
  },
  chipText: { fontSize: 13, color: JWFTheme.color.textSecondary, fontWeight: JWFTheme.fontWeight.semibold },
  chipTextActivo: { color: JWFTheme.color.textInverse },
  textarea: {
    borderWidth: 1,
    borderColor: JWFTheme.color.borderDefault,
    borderRadius: JWFTheme.radius.md,
    padding: 12,
    fontSize: 15,
    minHeight: 100,
    textAlignVertical: 'top',
    backgroundColor: JWFTheme.color.bgInput,
    color: JWFTheme.color.textPrimary,
  },
  // Sticky bottom bar.
  bottomBar: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: JWFTheme.color.borderDefault,
    backgroundColor: JWFTheme.color.bgCard,
  },
  btnVolver: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: JWFTheme.radius.md,
    alignItems: 'center',
    backgroundColor: JWFTheme.color.bgSubtle,
  },
  btnVolverText: { color: JWFTheme.color.accent, fontSize: 16, fontWeight: JWFTheme.fontWeight.semibold },
  btnSubmit: {
    flex: 1,
    backgroundColor: JWFTheme.color.accent,
    paddingVertical: 12,
    borderRadius: JWFTheme.radius.md,
    alignItems: 'center',
  },
  btnSubmitDisabled: { opacity: 0.6 },
  btnSubmitText: { color: JWFTheme.color.textInverse, fontSize: 16, fontWeight: JWFTheme.fontWeight.semibold },
});
