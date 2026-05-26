import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAusencia, useCancelarAusencia } from '@/hooks/useAusencias';
import { crmAssetUrl } from '@/lib/crmAssetUrl';
import { JWFTheme } from '@/constants/theme';
import type { EstadoAusencia } from '@/lib/types/ausencias';

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

export default function AusenciaDetalleScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const idNum = id ? parseInt(id, 10) : null;
  const { data, isLoading, isError, error } = useAusencia(idNum);
  const cancelar = useCancelarAusencia();

  function volver() {
    if (router.canGoBack()) router.back();
    else router.replace('/ausencia' as never);
  }

  function pedirCancelar() {
    if (!idNum) return;
    Alert.alert(
      'Cancelar ausencia',
      '¿Querés cancelar esta solicitud? No se puede deshacer.',
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Sí, cancelar',
          style: 'destructive',
          onPress: () => {
            cancelar.mutate(
              { id: idNum },
              {
                onError: (e) => {
                  const msg = e instanceof Error ? e.message : 'No se pudo cancelar.';
                  Alert.alert('Error', msg);
                },
              },
            );
          },
        },
      ],
    );
  }

  if (isLoading || !idNum) {
    return (
      <SafeAreaView style={styles.root} edges={['top']}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={JWFTheme.color.accent} />
        </View>
      </SafeAreaView>
    );
  }

  if (isError || !data) {
    return (
      <SafeAreaView style={styles.root} edges={['top']}>
        <View style={styles.center}>
          <Text style={styles.errorTitle}>No se pudo cargar la ausencia</Text>
          <Text style={styles.errorText}>
            {error instanceof Error ? error.message : 'Probá volver atrás y reabrir.'}
          </Text>
          <TouchableOpacity style={styles.btnRetry} onPress={volver}>
            <Text style={styles.btnRetryText}>Volver</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const sev = ESTADO_COLOR[data.ESTADO];
  const fotoUrl = crmAssetUrl(data.ADJUNTO_URL);
  const puedeCancelar = data.ESTADO === 'solicitada' || data.ESTADO === 'aprobada';

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.headerRow}>
          <View style={[styles.tipoDot, { backgroundColor: data.tipo_color }]} />
          <Text style={styles.tipoNombre}>{data.tipo_nombre}</Text>
          <View style={[styles.badge, { backgroundColor: sev.fondo }]}>
            <Text style={[styles.badgeText, { color: sev.texto }]}>
              {ESTADO_LABEL[data.ESTADO].toUpperCase()}
            </Text>
          </View>
        </View>

        <Field label="Desde" value={data.FECHA_INICIO.slice(0, 10)} />
        <Field label="Hasta" value={data.FECHA_FIN.slice(0, 10)} />
        <Field label="Días" value={String(data.DIAS)} />
        {data.MOTIVO ? <Field label="Motivo" value={data.MOTIVO} multiline /> : null}

        {data.ESTADO === 'aprobada' || data.ESTADO === 'rechazada' || data.ESTADO === 'cancelada' ? (
          <>
            <Field
              label="Decidida por"
              value={data.aprobador_nombre ?? (data.tipo_auto_aprobada ? 'Sistema' : '—')}
            />
            {data.COMENTARIO_APROBADOR ? (
              <Field label="Comentario" value={data.COMENTARIO_APROBADOR} multiline />
            ) : null}
          </>
        ) : null}

        {fotoUrl ? (
          <>
            <Text style={styles.fotoLabel}>Comprobante adjunto</Text>
            <Image source={{ uri: fotoUrl }} style={styles.foto} resizeMode="cover" />
          </>
        ) : null}
      </ScrollView>

      <View style={styles.bottomBar}>
        <TouchableOpacity style={styles.btnVolver} onPress={volver} accessibilityRole="button">
          <Text style={styles.btnVolverText}>← Volver</Text>
        </TouchableOpacity>
        {puedeCancelar ? (
          <TouchableOpacity
            style={styles.btnCancelar}
            onPress={pedirCancelar}
            disabled={cancelar.isPending}
            accessibilityRole="button"
          >
            {cancelar.isPending ? (
              <ActivityIndicator color={JWFTheme.color.textInverse} />
            ) : (
              <Text style={styles.btnCancelarText}>Cancelar</Text>
            )}
          </TouchableOpacity>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

function Field({ label, value, multiline }: { label: string; value: string; multiline?: boolean }) {
  return (
    <View style={styles.fieldRow}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={[styles.fieldValue, multiline && styles.fieldValueMulti]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: JWFTheme.color.bgApp },
  content: { padding: 20, gap: 4, paddingBottom: 24 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 24 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  tipoDot: { width: 12, height: 12, borderRadius: 6 },
  tipoNombre: {
    flex: 1,
    fontSize: 20,
    fontWeight: JWFTheme.fontWeight.semibold,
    color: JWFTheme.color.textPrimary,
  },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: JWFTheme.radius.xl },
  badgeText: { fontSize: 11, fontWeight: JWFTheme.fontWeight.bold, letterSpacing: 0.5 },
  fieldRow: { paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: JWFTheme.color.borderSubtle },
  fieldLabel: { fontSize: 12, color: JWFTheme.color.textMuted, marginBottom: 2 },
  fieldValue: { fontSize: 15, color: JWFTheme.color.textPrimary },
  fieldValueMulti: { lineHeight: 21 },
  fotoLabel: {
    fontSize: 13,
    fontWeight: JWFTheme.fontWeight.semibold,
    color: JWFTheme.color.textSecondary,
    marginTop: 16,
    marginBottom: 8,
  },
  foto: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: JWFTheme.radius.md,
    backgroundColor: JWFTheme.color.bgSubtle,
  },
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
  btnCancelar: {
    flex: 1,
    backgroundColor: JWFTheme.color.danger,
    paddingVertical: 12,
    borderRadius: JWFTheme.radius.md,
    alignItems: 'center',
  },
  btnCancelarText: { color: JWFTheme.color.textInverse, fontSize: 16, fontWeight: JWFTheme.fontWeight.semibold },
});
