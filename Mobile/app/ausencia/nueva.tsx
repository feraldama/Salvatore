import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
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
import * as ImagePicker from 'expo-image-picker';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';

import { useCrearAusencia, useTiposAusencia } from '@/hooks/useAusencias';
import { JWFTheme } from '@/constants/theme';
import type { TipoAusencia } from '@/lib/types/ausencias';

export default function NuevaAusenciaScreen() {
  const router = useRouter();
  const tiposQ = useTiposAusencia();
  const crear = useCrearAusencia();

  const [tipoId, setTipoId] = useState<number | null>(null);
  const [fechaInicio, setFechaInicio] = useState<Date>(() => new Date());
  const [fechaFin, setFechaFin] = useState<Date>(() => new Date());
  const [mostrarPickerInicio, setMostrarPickerInicio] = useState(false);
  const [mostrarPickerFin, setMostrarPickerFin] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [fotoUri, setFotoUri] = useState<string | null>(null);

  const tipos: TipoAusencia[] = useMemo(
    () => (tiposQ.data?.data ?? []).filter((t) => t.ACTIVO),
    [tiposQ.data],
  );
  const tipoSel = tipos.find((t) => t.ID === tipoId) ?? null;
  const requiereFoto = tipoSel?.REQUIERE_ADJUNTO === true;
  const puedeEnviar = !!tipoSel && !crear.isPending && fechaFin >= fechaInicio;

  function volver() {
    if (router.canGoBack()) router.back();
    else router.replace('/ausencia' as never);
  }

  async function elegirFoto(modo: 'camara' | 'galeria') {
    const permiso =
      modo === 'camara'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permiso.granted) {
      Alert.alert(
        'Permiso denegado',
        modo === 'camara'
          ? 'Activá el permiso de cámara desde la configuración del sistema.'
          : 'Activá el permiso de galería desde la configuración del sistema.',
      );
      return;
    }
    const result =
      modo === 'camara'
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.7 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
    if (!result.canceled && result.assets?.[0]) {
      setFotoUri(result.assets[0].uri);
    }
  }

  function abrirSelectorFoto() {
    Alert.alert('Comprobante', '¿De dónde lo sacamos?', [
      { text: 'Cámara', onPress: () => elegirFoto('camara') },
      { text: 'Galería', onPress: () => elegirFoto('galeria') },
      { text: 'Cancelar', style: 'cancel' },
    ]);
  }

  function onPickInicio(_e: DateTimePickerEvent, date?: Date) {
    setMostrarPickerInicio(Platform.OS === 'ios');
    if (date) {
      setFechaInicio(date);
      if (date > fechaFin) setFechaFin(date);
    }
  }
  function onPickFin(_e: DateTimePickerEvent, date?: Date) {
    setMostrarPickerFin(Platform.OS === 'ios');
    if (date) setFechaFin(date);
  }

  function onSubmit() {
    if (!tipoSel) {
      Alert.alert('Falta tipo', 'Tenés que elegir un tipo de ausencia.');
      return;
    }
    if (fechaFin < fechaInicio) {
      Alert.alert('Fechas inválidas', 'La fecha fin no puede ser anterior a la fecha inicio.');
      return;
    }
    if (requiereFoto && !fotoUri) {
      Alert.alert(
        'Comprobante obligatorio',
        `El tipo "${tipoSel.NOMBRE}" requiere adjuntar foto del comprobante.`,
      );
      return;
    }

    crear.mutate(
      {
        body: {
          tipoId: tipoSel.ID,
          fechaInicio: toYMD(fechaInicio),
          fechaFin: toYMD(fechaFin),
          motivo: motivo.trim() || undefined,
        },
        fotoUri: fotoUri ?? undefined,
      },
      {
        onSuccess: (data) => {
          if (data.ESTADO === 'aprobada') {
            Alert.alert('Aprobada', 'Tu ausencia fue aprobada automáticamente.');
          }
          router.replace(`/ausencia/${data.ID}` as never);
        },
        onError: (e) => {
          const msg = e instanceof Error ? e.message : 'No se pudo crear la ausencia.';
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
          <Text style={styles.h1}>Justificar ausencia</Text>

          <Text style={styles.label}>Tipo *</Text>
          {tiposQ.isLoading ? (
            <View style={styles.center}><ActivityIndicator color={JWFTheme.color.accent} /></View>
          ) : tiposQ.isError ? (
            <Text style={styles.error}>No se cargaron los tipos. Probá reabrir la pantalla.</Text>
          ) : (
            <View style={styles.chipsRow}>
              {tipos.map((t) => (
                <Chip
                  key={t.ID}
                  label={t.NOMBRE}
                  activo={tipoId === t.ID}
                  onPress={() => setTipoId(t.ID)}
                  colorActivo={t.COLOR}
                />
              ))}
            </View>
          )}
          {tipoSel ? (
            <Text style={styles.hint}>
              {tipoSel.DESCRIPCION ?? ''}
              {tipoSel.AUTO_APROBADA ? ' (Se aprueba al cargar)' : ''}
              {tipoSel.REQUIERE_ADJUNTO ? ' · Comprobante obligatorio' : ''}
            </Text>
          ) : null}

          <Text style={[styles.label, styles.labelSection]}>Desde *</Text>
          <TouchableOpacity style={styles.input} onPress={() => setMostrarPickerInicio(true)}>
            <Text style={styles.inputText}>{formatFechaUI(fechaInicio)}</Text>
          </TouchableOpacity>

          <Text style={[styles.label, styles.labelSection]}>Hasta *</Text>
          <TouchableOpacity style={styles.input} onPress={() => setMostrarPickerFin(true)}>
            <Text style={styles.inputText}>{formatFechaUI(fechaFin)}</Text>
          </TouchableOpacity>

          {mostrarPickerInicio && (
            <DateTimePicker
              value={fechaInicio}
              mode="date"
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              onChange={onPickInicio}
            />
          )}
          {mostrarPickerFin && (
            <DateTimePicker
              value={fechaFin}
              mode="date"
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              minimumDate={fechaInicio}
              onChange={onPickFin}
            />
          )}

          <Text style={[styles.label, styles.labelSection]}>Motivo</Text>
          <TextInput
            style={styles.textarea}
            multiline
            numberOfLines={4}
            placeholder="Opcional. Ej: 'cuadro gripal, reposo 3 días'."
            value={motivo}
            onChangeText={setMotivo}
          />

          <Text style={[styles.label, styles.labelSection]}>
            Comprobante {requiereFoto ? '*' : '(opcional)'}
          </Text>
          {fotoUri ? (
            <View style={styles.fotoBox}>
              <Image source={{ uri: fotoUri }} style={styles.fotoPreview} resizeMode="cover" />
              <View style={styles.fotoActions}>
                <TouchableOpacity onPress={abrirSelectorFoto} style={styles.fotoBtnAlt}>
                  <Text style={styles.fotoBtnAltText}>Reemplazar</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setFotoUri(null)} style={styles.fotoBtnAlt}>
                  <Text style={[styles.fotoBtnAltText, { color: JWFTheme.color.danger }]}>
                    Quitar
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <TouchableOpacity style={styles.fotoBtn} onPress={abrirSelectorFoto}>
              <Text style={styles.fotoBtnText}>+ Adjuntar foto</Text>
            </TouchableOpacity>
          )}
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
              <Text style={styles.btnSubmitText}>Enviar</Text>
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
  colorActivo,
}: {
  label: string;
  activo: boolean;
  onPress: () => void;
  colorActivo: string;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.chip, activo && { backgroundColor: colorActivo, borderColor: colorActivo }]}
    >
      <Text style={[styles.chipText, activo && styles.chipTextActivo]}>{label}</Text>
    </TouchableOpacity>
  );
}

// Format YYYY-MM-DD usando hora local. Evita el shift de UTC-4 con toISOString().
function toYMD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function formatFechaUI(d: Date): string {
  const day = String(d.getDate()).padStart(2, '0');
  const m   = String(d.getMonth() + 1).padStart(2, '0');
  return `${day}/${m}/${d.getFullYear()}`;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  root: { flex: 1, backgroundColor: JWFTheme.color.bgApp },
  content: { padding: 20, gap: 6, paddingBottom: 24 },
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
  hint: { fontSize: 12, color: JWFTheme.color.textMuted, marginTop: 6 },
  error: { fontSize: 13, color: JWFTheme.color.danger },
  center: { padding: 12, alignItems: 'center' },
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
  input: {
    borderWidth: 1,
    borderColor: JWFTheme.color.borderDefault,
    borderRadius: JWFTheme.radius.md,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: JWFTheme.color.bgInput,
  },
  inputText: { fontSize: 15, color: JWFTheme.color.textPrimary },
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
  fotoBtn: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: JWFTheme.color.borderDefault,
    borderRadius: JWFTheme.radius.md,
    paddingVertical: 24,
    alignItems: 'center',
    backgroundColor: JWFTheme.color.bgCard,
  },
  fotoBtnText: { color: JWFTheme.color.accent, fontWeight: JWFTheme.fontWeight.semibold, fontSize: 14 },
  fotoBox: { gap: 8 },
  fotoPreview: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: JWFTheme.radius.md,
    backgroundColor: JWFTheme.color.bgSubtle,
  },
  fotoActions: { flexDirection: 'row', gap: 12 },
  fotoBtnAlt: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: JWFTheme.radius.md,
    backgroundColor: JWFTheme.color.bgSubtle,
    alignItems: 'center',
  },
  fotoBtnAltText: { color: JWFTheme.color.accent, fontWeight: JWFTheme.fontWeight.semibold },
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
