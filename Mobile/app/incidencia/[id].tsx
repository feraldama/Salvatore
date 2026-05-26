import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  Linking,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';

import { useAuth, useRoles } from '@/lib/auth/AuthContext';
import {
  useActualizarIncidencia,
  useIncidencia,
  useReasignarIncidencia,
  useReproducirDiagnostico,
  useTecnicosDisponibles,
  useTomarIncidencia,
} from '@/hooks/useIncidencias';
import { cmsAssetUrl } from '@/lib/cmsAssetUrl';
import { JWFTheme } from '@/constants/theme';
import type { SeveridadIncidencia, TipoIncidencia } from '@/lib/types/incidencias';

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

// Grid de bloques LED del video de diagnóstico. Hardcodeado a 5×7 = 35
// bloques (5 columnas × 7 filas, matchea el layout vertical del video que
// JWF cargó en el CMS). Si en el futuro una pantalla tiene otro layout,
// agregar campo en cms_pantallas y leerlo del detalle.pantalla.
const BLOQUES_COLS = 5;
const BLOQUES_FILAS = 7;
const BLOQUES_TOTAL = BLOQUES_COLS * BLOQUES_FILAS;
const BLOQUE_GAP = 6;
// Modal padding 20 izq + 20 der = 40. Ancho de cada bloque depende de la pantalla.
const BLOQUE_SIZE = Math.floor(
  (Dimensions.get('window').width - 40 - BLOQUE_GAP * (BLOQUES_COLS - 1)) / BLOQUES_COLS,
);

export default function IncidenciaDetalleScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const { isAdmin } = useRoles();

  function volver() {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/incidencias' as never);
  }

  const { data: incidencia, isLoading, isError, error, refetch } = useIncidencia(id);
  const tomar = useTomarIncidencia();
  const actualizar = useActualizarIncidencia();
  const reproducir = useReproducirDiagnostico();
  const reasignar = useReasignarIncidencia();

  const [notas, setNotas] = useState<string>('');
  const [notasInicializadas, setNotasInicializadas] = useState(false);
  const [bloquesModalVisible, setBloquesModalVisible] = useState(false);
  const [bloquesSeleccionados, setBloquesSeleccionados] = useState<Set<number>>(new Set());
  const [fotoUri, setFotoUri] = useState<string | null>(null);
  const [reasignarModalVisible, setReasignarModalVisible] = useState(false);
  const { data: tecnicos, isLoading: tecnicosLoading } = useTecnicosDisponibles(reasignarModalVisible);

  // Precarga las notas en el textbox la primera vez que llega data.
  useEffect(() => {
    if (incidencia && !notasInicializadas) {
      setNotas(incidencia.notas_resolucion ?? '');
      setNotasInicializadas(true);
    }
  }, [incidencia, notasInicializadas]);

  if (isLoading) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator size="large" color={JWFTheme.color.accent} />
        <BottomBar onVolver={volver} />
      </SafeAreaView>
    );
  }

  if (isError || !incidencia) {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.errorTitle}>No se pudo cargar la incidencia</Text>
        <Text style={styles.errorText}>
          {error instanceof Error ? error.message : 'Reintentá en un momento.'}
        </Text>
        <TouchableOpacity style={styles.btnPrimary} onPress={() => refetch()}>
          <Text style={styles.btnPrimaryText}>Reintentar</Text>
        </TouchableOpacity>
        <BottomBar onVolver={volver} />
      </SafeAreaView>
    );
  }

  const sev = COLORES_SEVERIDAD[incidencia.severidad] ?? COLORES_SEVERIDAD.warning;
  const cerrada = !!incidencia.resuelto_en;
  // Estados de asignación (3, no 2):
  //   - sinAsignar: nadie todavía (round-robin no eligió o lo limpiaron).
  //   - autoAsignadaAMi: round-robin me la pegó pero no confirmé que voy
  //     a trabajarla (tomada_en null). El detector PUEDE auto-cerrarla
  //     si la pantalla recupera. Necesito tocar "Empezar a trabajar"
  //     para setear tomada_en y blindar contra auto-cierre.
  //   - tomadaPorMi: ya confirmé. El detector no la cierra solo.
  const sinAsignar = incidencia.tecnico_erp_id == null && !cerrada;
  const autoAsignadaAMi =
    user?.id != null &&
    incidencia.tecnico_erp_id === user.id &&
    incidencia.tomada_en == null &&
    !cerrada;
  const tomadaPorMi =
    user?.id != null &&
    incidencia.tecnico_erp_id === user.id &&
    incidencia.tomada_en != null &&
    !cerrada;
  const esMia = user?.id != null && incidencia.tecnico_erp_id === user.id;
  const puedeEditar = (esMia || isAdmin) && !cerrada;
  const cierreAuto = cerrada && incidencia.resuelto_por_erp_id == null;
  const frameUrl = cmsAssetUrl(incidencia.frame_evidencia_url);

  function abrirEnMaps() {
    if (!incidencia) return;
    const { latitud, longitud } = incidencia.pantalla;
    if (latitud == null || longitud == null) return;
    // Deep-link oficial de Google Maps para navegación (mode=driving por default).
    // El cliente nativo de Maps lo captura y abre directo "Cómo llegar" con
    // destino seteado en las coords de la pantalla.
    const url =
      `https://www.google.com/maps/dir/?api=1` +
      `&destination=${latitud},${longitud}` +
      `&travelmode=driving`;
    Linking.openURL(url);
  }

  function onTomar() {
    tomar.mutate(incidencia!.id, {
      onError: (e) => {
        const msg = e instanceof Error ? e.message : 'No se pudo tomar la incidencia.';
        Alert.alert('Error', msg);
      },
    });
  }

  function onGuardarNotas() {
    actualizar.mutate(
      { id: incidencia!.id, body: { notasResolucion: notas } },
      {
        onSuccess: () => Alert.alert('Listo', 'Notas guardadas.'),
        onError: (e) => {
          const msg = e instanceof Error ? e.message : 'No se pudo guardar.';
          Alert.alert('Error', msg);
        },
      },
    );
  }

  function onReproducirDiagnostico() {
    if (!incidencia) return;
    Alert.alert(
      'Reproducir diagnóstico en pantalla',
      'El player va a interrumpir el contenido actual y reproducir el video de bloques numerados una sola vez. Cuando termine, vuelve solo a la playlist normal.\n\nDespués de mirar la pantalla, vas a poder marcar qué bloques tienen falla.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Reproducir',
          onPress: () =>
            reproducir.mutate(incidencia.id, {
              onSuccess: () => {
                // Abrir el selector de bloques tras un pequeño delay para que
                // el técnico vea la confirmación y mire la pantalla.
                setBloquesSeleccionados(new Set());
                setBloquesModalVisible(true);
              },
              onError: (e) => {
                const msg = e instanceof Error ? e.message : 'No se pudo encolar la reproducción.';
                Alert.alert('Error', msg);
              },
            }),
        },
      ],
    );
  }

  function toggleBloque(n: number) {
    setBloquesSeleccionados((prev) => {
      const next = new Set(prev);
      if (next.has(n)) next.delete(n);
      else next.add(n);
      return next;
    });
  }

  function onConfirmarBloques() {
    if (bloquesSeleccionados.size === 0) {
      setBloquesModalVisible(false);
      return;
    }
    const lista = [...bloquesSeleccionados].sort((a, b) => a - b).join(', ');
    const hora = new Date().toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit' });
    const linea = `[Diagnóstico ${hora}] Bloques con falla: ${lista}`;
    setNotas((prev) => (prev.trim() ? `${linea}\n${prev}` : linea));
    setBloquesModalVisible(false);
  }

  async function elegirFotoReparacion(modo: 'camara' | 'galeria') {
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
        ? await ImagePicker.launchCameraAsync({
            mediaTypes: ['images'],
            quality: 0.7,
          })
        : await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            quality: 0.7,
          });
    if (!result.canceled && result.assets?.[0]) {
      setFotoUri(result.assets[0].uri);
    }
  }

  function abrirSelectorFoto() {
    Alert.alert('Foto de reparación', '¿De dónde la sacamos?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Tomar foto', onPress: () => elegirFotoReparacion('camara') },
      { text: 'Elegir de galería', onPress: () => elegirFotoReparacion('galeria') },
    ]);
  }

  function onReasignar(nuevoTecnicoId: number | null) {
    if (!incidencia) return;
    reasignar.mutate(
      { id: incidencia.id, body: { tecnicoErpId: nuevoTecnicoId } },
      {
        onSuccess: () => {
          setReasignarModalVisible(false);
          Alert.alert(
            'Listo',
            nuevoTecnicoId == null
              ? 'La incidencia quedó sin asignar.'
              : 'La incidencia fue reasignada.',
          );
        },
        onError: (e) => {
          const msg = e instanceof Error ? e.message : 'No se pudo reasignar.';
          Alert.alert('Error', msg);
        },
      },
    );
  }

  function onMarcarResuelta() {
    if (!fotoUri) {
      Alert.alert(
        'Falta foto de reparación',
        'Antes de cerrar la incidencia, adjuntá una foto que documente la reparación.',
      );
      return;
    }
    if (!notas.trim()) {
      Alert.alert(
        'Faltan notas',
        'Antes de cerrar, escribí qué pasó y cómo lo reparaste en las notas.',
      );
      return;
    }
    Alert.alert(
      'Marcar como resuelta',
      '¿Confirmás que la falla fue resuelta?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Marcar resuelta',
          style: 'destructive',
          onPress: () =>
            actualizar.mutate(
              {
                id: incidencia!.id,
                body: { resolver: true, notasResolucion: notas },
                fotoUri: fotoUri ?? undefined,
              },
              {
                onSuccess: () => {
                  Alert.alert(
                    'Incidencia resuelta',
                    'La incidencia se marcó como resuelta correctamente.',
                    [{ text: 'OK', onPress: volver }],
                  );
                },
                onError: (e) => {
                  const msg = e instanceof Error ? e.message : 'No se pudo cerrar la incidencia.';
                  Alert.alert('Error', msg);
                },
              },
            ),
        },
      ],
    );
  }

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.pantalla}>{incidencia.pantalla.nombre}</Text>
          {incidencia.pantalla.ubicacion ? (
            <Text style={styles.ubicacion}>{incidencia.pantalla.ubicacion}</Text>
          ) : null}

          <View style={styles.badgeRow}>
            <View style={[styles.badge, { backgroundColor: sev.fondo }]}>
              <Text style={[styles.badgeText, { color: sev.texto }]}>
                {TIPOS_LABEL[incidencia.tipo] ?? incidencia.tipo}
              </Text>
            </View>
            <View style={[styles.badge, { backgroundColor: sev.fondo }]}>
              <Text style={[styles.badgeText, { color: sev.texto }]}>
                {incidencia.severidad.toUpperCase()}
              </Text>
            </View>
          </View>

          {cerrada ? (
            <View style={styles.banner}>
              <Text style={styles.bannerText}>
                {cierreAuto
                  ? 'Resuelta automáticamente: la pantalla volvió a estado normal.'
                  : 'Incidencia resuelta.'}
              </Text>
              <Text style={styles.bannerSub}>
                {new Date(incidencia.resuelto_en!).toLocaleString('es-PY')}
              </Text>
            </View>
          ) : null}

          {(incidencia.pantalla.latitud != null && incidencia.pantalla.longitud != null) ? (
            <TouchableOpacity style={styles.btnSecundario} onPress={abrirEnMaps}>
              <Text style={styles.btnSecundarioText}>Cómo llegar (Maps)</Text>
            </TouchableOpacity>
          ) : null}

          {frameUrl ? (
            <View style={styles.frameContainer}>
              <Image source={{ uri: frameUrl }} style={styles.frame} resizeMode="contain" />
            </View>
          ) : null}

          <View style={styles.metricCard}>
            <Text style={styles.sectionTitle}>Trazabilidad</Text>
            <Metric
              label="Reportado por"
              valor={
                incidencia.creado_por
                  ? incidencia.creado_por.nombre
                  : incidencia.creado_por_erp_id == null
                    ? 'Detector automático'
                    : `Usuario #${incidencia.creado_por_erp_id}`
              }
            />
            <Metric
              label="Asignado a"
              valor={
                incidencia.tecnico
                  ? incidencia.tecnico.nombre
                  : incidencia.tecnico_erp_id == null
                    ? 'Sin asignar'
                    : `Usuario #${incidencia.tecnico_erp_id}`
              }
            />
            {incidencia.resuelto_en ? (
              <Metric
                label="Resuelto por"
                valor={
                  incidencia.resuelto_por
                    ? incidencia.resuelto_por.nombre
                    : incidencia.resuelto_por_erp_id == null
                      ? 'Auto-cierre'
                      : `Usuario #${incidencia.resuelto_por_erp_id}`
                }
              />
            ) : null}
          </View>

          <View style={styles.metricCard}>
            <Text style={styles.sectionTitle}>Métricas</Text>
            <Metric label="Brillo (luminancia)" valor={fmt(incidencia.luminancia_media)} />
            <Metric label="Varianza espacial" valor={fmt(incidencia.varianza_espacial)} />
            <Metric label="Diff frame a frame" valor={fmt(incidencia.diff_frame_a_frame)} />
            <Metric
              label="Iniciada"
              valor={new Date(incidencia.iniciado_en).toLocaleString('es-PY')}
            />
            {incidencia.tomada_en ? (
              <Metric
                label="Tomada"
                valor={new Date(incidencia.tomada_en).toLocaleString('es-PY')}
              />
            ) : null}
          </View>

          {(esMia || isAdmin) && !cerrada ? (
            <TouchableOpacity
              style={[
                styles.btnDiagnostico,
                (!incidencia.pantalla.tieneVideoDiagnostico ||
                  !incidencia.pantalla.tieneDispositivo ||
                  reproducir.isPending) &&
                  styles.btnDisabled,
              ]}
              onPress={onReproducirDiagnostico}
              disabled={
                !incidencia.pantalla.tieneVideoDiagnostico ||
                !incidencia.pantalla.tieneDispositivo ||
                reproducir.isPending
              }
              accessibilityRole="button"
            >
              <Text style={styles.btnDiagnosticoText}>
                {reproducir.isPending
                  ? 'Encolando…'
                  : !incidencia.pantalla.tieneVideoDiagnostico
                    ? 'Diagnóstico no disponible (sin video)'
                    : !incidencia.pantalla.tieneDispositivo
                      ? 'Diagnóstico no disponible (sin player)'
                      : '▶  Reproducir diagnóstico'}
              </Text>
            </TouchableOpacity>
          ) : null}

          {(sinAsignar || autoAsignadaAMi) && !tomadaPorMi ? (
            <TouchableOpacity
              style={[styles.btnPrimary, tomar.isPending && styles.btnDisabled]}
              onPress={onTomar}
              disabled={tomar.isPending}
              accessibilityRole="button"
            >
              <Text style={styles.btnPrimaryText}>
                {tomar.isPending
                  ? 'Tomando…'
                  : autoAsignadaAMi
                    ? 'Empezar a trabajar (confirmar)'
                    : 'Tomar incidencia'}
              </Text>
            </TouchableOpacity>
          ) : null}

          {autoAsignadaAMi ? (
            <Text style={styles.hintAutoAsignada}>
              Esta incidencia te fue auto-asignada. Hasta que toques
              &quot;Empezar a trabajar&quot;, el detector puede cerrarla solo si la
              pantalla vuelve a estado normal.
            </Text>
          ) : null}

          {(esMia || isAdmin) && !cerrada ? (
            <TouchableOpacity
              style={[styles.btnSecundario, reasignar.isPending && styles.btnDisabled]}
              onPress={() => setReasignarModalVisible(true)}
              disabled={reasignar.isPending}
              accessibilityRole="button"
            >
              <Text style={styles.btnSecundarioText}>
                {reasignar.isPending ? 'Reasignando…' : 'Reasignar / soltar'}
              </Text>
            </TouchableOpacity>
          ) : null}

          {puedeEditar || cerrada ? (
            <View style={styles.notasCard}>
              <Text style={styles.sectionTitle}>Notas de resolución</Text>
              <TextInput
                style={styles.textarea}
                multiline
                numberOfLines={5}
                value={notas}
                onChangeText={setNotas}
                editable={puedeEditar || (cerrada && (esMia || isAdmin))}
                placeholder="Detalle de lo que hiciste para resolver la incidencia"
              />
              {puedeEditar ? (
                <>
                  {/* Foto de reparación — obligatoria para cerrar */}
                  <View style={styles.fotoSection}>
                    <Text style={styles.fotoLabel}>Foto de la reparación</Text>
                    {fotoUri ? (
                      <View>
                        <Image source={{ uri: fotoUri }} style={styles.fotoPreview} resizeMode="cover" />
                        <View style={styles.fotoBtnRow}>
                          <TouchableOpacity
                            style={[styles.btnSecundario, { flex: 1 }]}
                            onPress={abrirSelectorFoto}
                          >
                            <Text style={styles.btnSecundarioText}>Cambiar foto</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[styles.btnVolver, { flex: 1 }]}
                            onPress={() => setFotoUri(null)}
                          >
                            <Text style={styles.btnVolverText}>Quitar</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    ) : (
                      <TouchableOpacity style={styles.btnFoto} onPress={abrirSelectorFoto}>
                        <Text style={styles.btnFotoText}>📷  Adjuntar foto de reparación</Text>
                      </TouchableOpacity>
                    )}
                  </View>

                  <View style={styles.notasBtnRow}>
                    <TouchableOpacity
                      style={[styles.btnSecundario, actualizar.isPending && styles.btnDisabled]}
                      onPress={onGuardarNotas}
                      disabled={actualizar.isPending}
                    >
                      <Text style={styles.btnSecundarioText}>Guardar notas</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.btnPrimary, actualizar.isPending && styles.btnDisabled]}
                      onPress={onMarcarResuelta}
                      disabled={actualizar.isPending}
                    >
                      <Text style={styles.btnPrimaryText}>Marcar resuelta</Text>
                    </TouchableOpacity>
                  </View>
                </>
              ) : null}
            </View>
          ) : null}
      </ScrollView>
      <BottomBar onVolver={volver} />

      <Modal
        visible={reasignarModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setReasignarModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitulo}>Reasignar incidencia</Text>
            <Text style={styles.modalSubtitulo}>
              Elegí a quién pasársela. &quot;Dejar sin asignar&quot; libera la incidencia
              para que cualquier técnico la tome o el auto-asignador la
              redistribuya.
            </Text>

            {tecnicosLoading ? (
              <ActivityIndicator size="small" color={JWFTheme.color.accent} style={{ marginVertical: 16 }} />
            ) : (
              <ScrollView style={{ maxHeight: 320 }}>
                <TouchableOpacity
                  style={styles.tecnicoRow}
                  onPress={() => onReasignar(null)}
                  disabled={reasignar.isPending}
                >
                  <Text style={styles.tecnicoNombre}>Dejar sin asignar</Text>
                  <Text style={styles.tecnicoEmail}>Vuelve al pool de &quot;Sin asignar&quot;</Text>
                </TouchableOpacity>
                {(tecnicos ?? []).map((t) => (
                  <TouchableOpacity
                    key={t.id}
                    style={styles.tecnicoRow}
                    onPress={() => onReasignar(t.id)}
                    disabled={reasignar.isPending}
                  >
                    <Text style={styles.tecnicoNombre}>{t.nombre}</Text>
                    {t.email ? <Text style={styles.tecnicoEmail}>{t.email}</Text> : null}
                  </TouchableOpacity>
                ))}
                {(tecnicos ?? []).length === 0 && !tecnicosLoading ? (
                  <Text style={styles.tecnicoEmail}>
                    No hay otros técnicos activos en el ERP.
                  </Text>
                ) : null}
              </ScrollView>
            )}

            <View style={styles.modalBtnRow}>
              <TouchableOpacity
                style={[styles.btnVolver, { flex: 1 }]}
                onPress={() => setReasignarModalVisible(false)}
                disabled={reasignar.isPending}
              >
                <Text style={styles.btnVolverText}>Cancelar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={bloquesModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setBloquesModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitulo}>Bloques con falla</Text>
            <Text style={styles.modalSubtitulo}>
              Tocá los bloques que veas con problema en la pantalla. Los números coinciden con el video de diagnóstico que se está reproduciendo.
            </Text>
            <View style={styles.bloquesGrid}>
              {Array.from({ length: BLOQUES_TOTAL }, (_, i) => i + 1).map((n) => {
                const activo = bloquesSeleccionados.has(n);
                return (
                  <TouchableOpacity
                    key={n}
                    style={[styles.bloque, activo && styles.bloqueActivo]}
                    onPress={() => toggleBloque(n)}
                    accessibilityRole="button"
                  >
                    <Text style={[styles.bloqueText, activo && styles.bloqueTextActivo]}>
                      {n}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <Text style={styles.modalHint}>
              Seleccionados: {bloquesSeleccionados.size === 0 ? 'ninguno' : [...bloquesSeleccionados].sort((a, b) => a - b).join(', ')}
            </Text>
            <View style={styles.modalBtnRow}>
              <TouchableOpacity
                style={[styles.btnVolver, { flex: 1 }]}
                onPress={() => setBloquesModalVisible(false)}
              >
                <Text style={styles.btnVolverText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btnPrimary, bloquesSeleccionados.size === 0 && styles.btnDisabled]}
                onPress={onConfirmarBloques}
                disabled={bloquesSeleccionados.size === 0}
              >
                <Text style={styles.btnPrimaryText}>Agregar a notas</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function BottomBar({ onVolver }: { onVolver: () => void }) {
  return (
    <View style={styles.bottomBar}>
      <TouchableOpacity style={styles.btnVolver} onPress={onVolver} accessibilityRole="button">
        <Text style={styles.btnVolverText}>← Volver</Text>
      </TouchableOpacity>
    </View>
  );
}

function Metric({ label, valor }: { label: string; valor: string }) {
  return (
    <View style={styles.metricRow}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValor}>{valor}</Text>
    </View>
  );
}

function fmt(n: number | null): string {
  if (n == null) return '—';
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: JWFTheme.color.bgApp },
  content: { padding: 20, gap: 12 },
  pantalla: {
    fontSize: 24,
    fontWeight: JWFTheme.fontWeight.heroLight,
    color: JWFTheme.color.textPrimary,
    letterSpacing: JWFTheme.titleTracking,
  },
  ubicacion: { fontSize: 14, color: JWFTheme.color.textMuted, marginTop: 0 },
  badgeRow: { flexDirection: 'row', gap: 8, marginTop: 8, flexWrap: 'wrap' },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: JWFTheme.radius.xl },
  badgeText: { fontSize: 12, fontWeight: JWFTheme.fontWeight.bold, letterSpacing: 0.4 },
  banner: {
    backgroundColor: JWFTheme.color.bgSubtle,
    padding: 12,
    borderRadius: JWFTheme.radius.md,
    borderLeftWidth: 4,
    borderLeftColor: JWFTheme.color.textDim,
  },
  bannerText: { fontSize: 14, color: JWFTheme.color.textSecondary, fontWeight: JWFTheme.fontWeight.semibold },
  bannerSub: { fontSize: 12, color: JWFTheme.color.textMuted, marginTop: 2 },
  frameContainer: {
    backgroundColor: '#000',
    borderRadius: JWFTheme.radius.lg,
    overflow: 'hidden',
    aspectRatio: 16 / 9,
  },
  frame: { width: '100%', height: '100%' },
  metricCard: {
    backgroundColor: JWFTheme.color.bgCard,
    padding: 16,
    borderRadius: JWFTheme.radius.lg,
    borderWidth: 1,
    borderColor: JWFTheme.color.borderDefault,
    ...JWFTheme.shadow.sm,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: JWFTheme.fontWeight.semibold,
    color: JWFTheme.color.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  metricRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: JWFTheme.color.borderSubtle,
  },
  metricLabel: { fontSize: 13, color: JWFTheme.color.textMuted },
  metricValor: { fontSize: 13, color: JWFTheme.color.textPrimary, fontWeight: JWFTheme.fontWeight.semibold },
  notasCard: {
    backgroundColor: JWFTheme.color.bgCard,
    padding: 16,
    borderRadius: JWFTheme.radius.lg,
    borderWidth: 1,
    borderColor: JWFTheme.color.borderDefault,
    ...JWFTheme.shadow.sm,
  },
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
  notasBtnRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  btnPrimary: {
    backgroundColor: JWFTheme.color.accent,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: JWFTheme.radius.md,
    alignItems: 'center',
    flex: 1,
  },
  btnPrimaryText: { color: JWFTheme.color.textInverse, fontSize: 15, fontWeight: JWFTheme.fontWeight.semibold },
  btnSecundario: {
    backgroundColor: JWFTheme.color.bgCard,
    borderWidth: 1,
    borderColor: JWFTheme.color.accent,
    paddingVertical: 11,
    paddingHorizontal: 16,
    borderRadius: JWFTheme.radius.md,
    alignItems: 'center',
    flex: 1,
  },
  btnSecundarioText: { color: JWFTheme.color.accent, fontSize: 15, fontWeight: JWFTheme.fontWeight.semibold },
  btnDisabled: { opacity: 0.6 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: JWFTheme.color.bgApp,
    padding: 24,
    gap: 8,
  },
  errorTitle: { fontSize: 16, fontWeight: JWFTheme.fontWeight.semibold, color: JWFTheme.color.danger },
  errorText: { fontSize: 13, color: JWFTheme.color.textMuted, textAlign: 'center' },
  bottomBar: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: JWFTheme.color.borderDefault,
    backgroundColor: JWFTheme.color.bgCard,
  },
  btnVolver: {
    paddingVertical: 12,
    borderRadius: JWFTheme.radius.md,
    alignItems: 'center',
    backgroundColor: JWFTheme.color.bgSubtle,
  },
  btnVolverText: { color: JWFTheme.color.accent, fontSize: 16, fontWeight: JWFTheme.fontWeight.semibold },

  // Botón "Reproducir diagnóstico" — outline azul, distinto al primary para
  // separar visualmente "tomar/resolver" (acción de gestión) de "reproducir
  // diagnóstico en pantalla" (acción de diagnóstico físico).
  btnDiagnostico: {
    backgroundColor: JWFTheme.color.accentBg,
    borderWidth: 1,
    borderColor: JWFTheme.color.accent,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: JWFTheme.radius.md,
    alignItems: 'center',
  },
  btnDiagnosticoText: { color: JWFTheme.color.accent, fontSize: 15, fontWeight: JWFTheme.fontWeight.semibold },

  // Modal de selección de bloques (overlay + tarjeta + grid 4×3).
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: JWFTheme.color.bgCard,
    borderTopLeftRadius: JWFTheme.radius.xl,
    borderTopRightRadius: JWFTheme.radius.xl,
    padding: 20,
    paddingBottom: 32,
    gap: 12,
  },
  modalTitulo: {
    fontSize: 20,
    fontWeight: JWFTheme.fontWeight.heroLight,
    color: JWFTheme.color.textPrimary,
    letterSpacing: JWFTheme.titleTracking,
  },
  modalSubtitulo: { fontSize: 13, color: JWFTheme.color.textMuted },
  bloquesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: BLOQUE_GAP,
    marginTop: 8,
  },
  bloque: {
    width: BLOQUE_SIZE,
    height: BLOQUE_SIZE,
    borderRadius: JWFTheme.radius.sm,
    backgroundColor: JWFTheme.color.bgSubtle,
    borderWidth: 1,
    borderColor: JWFTheme.color.borderDefault,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bloqueActivo: {
    backgroundColor: JWFTheme.color.danger,
    borderColor: JWFTheme.color.danger,
  },
  bloqueText: {
    fontSize: BLOQUE_SIZE > 50 ? 16 : 14,
    fontWeight: JWFTheme.fontWeight.bold,
    color: JWFTheme.color.textPrimary,
  },
  bloqueTextActivo: { color: JWFTheme.color.textInverse },
  modalHint: {
    fontSize: 13,
    color: JWFTheme.color.textMuted,
    marginTop: 4,
  },
  modalBtnRow: { flexDirection: 'row', gap: 10, marginTop: 8 },

  // Sección de foto de reparación dentro del notasCard.
  fotoSection: { marginTop: 16, gap: 10 },
  fotoLabel: {
    fontSize: 13,
    fontWeight: JWFTheme.fontWeight.semibold,
    color: JWFTheme.color.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  fotoPreview: {
    width: '100%',
    aspectRatio: 4 / 3,
    borderRadius: JWFTheme.radius.md,
    backgroundColor: '#000',
  },
  fotoBtnRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  btnFoto: {
    backgroundColor: JWFTheme.color.bgSubtle,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: JWFTheme.color.borderDefault,
    paddingVertical: 18,
    borderRadius: JWFTheme.radius.md,
    alignItems: 'center',
  },
  btnFotoText: { color: JWFTheme.color.accent, fontSize: 14, fontWeight: JWFTheme.fontWeight.semibold },

  hintAutoAsignada: {
    fontSize: 12,
    color: JWFTheme.color.warning,
    fontStyle: 'italic',
    paddingHorizontal: 4,
    marginTop: -4,
  },

  // Filas del listado de técnicos en el modal de reasignación.
  tecnicoRow: {
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: JWFTheme.color.borderSubtle,
  },
  tecnicoNombre: {
    fontSize: 15,
    fontWeight: JWFTheme.fontWeight.semibold,
    color: JWFTheme.color.textPrimary,
  },
  tecnicoEmail: {
    fontSize: 12,
    color: JWFTheme.color.textMuted,
    marginTop: 2,
  },
});
