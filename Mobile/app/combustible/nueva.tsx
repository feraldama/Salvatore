import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { JWFTheme } from '@/constants/theme';
import { enviarCargaCombustible } from '@/lib/api/flota';
import { getApiErrorMessage } from '@/lib/api/errors';
import NumberInput from '@/components/ui/NumberInput';
import type { FotoCaptura } from '@/lib/types/flota';
import { alertaGpsError, obtenerGpsObligatorio } from '@/lib/gps';
import { VIAJE_ACTIVO_KEY, useFlotaViaje } from '@/hooks/useFlotaViaje';
import { useFlotaPendientes } from '@/hooks/useFlotaPendientes';

// 2 pasos: una foto del tablero (donde se ven el odómetro y el nivel del
// tanque al mismo tiempo) y otra de la factura. Antes eran 3 fotos separadas.
const PASOS = [
  { key: 'tablero' as const, titulo: 'Tablero', hint: 'Foto del panel donde se ven el odómetro y el nivel del tanque', icon: 'speed' as const },
  { key: 'factura' as const, titulo: 'Factura', hint: 'Foto del comprobante', icon: 'receipt' as const },
];

const inputStyle = {
  borderWidth: 1,
  borderColor: JWFTheme.color.borderDefault,
  borderRadius: JWFTheme.radius.md,
  paddingHorizontal: 12,
  paddingVertical: 10,
  fontSize: 16,
  backgroundColor: JWFTheme.color.bgInput,
  color: JWFTheme.color.textPrimary,
};

export default function NuevaCargaCombustibleScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const { data: viajeResp } = useFlotaViaje();
  const viaje = viajeResp?.viaje;
  // Pendientes (mantenimientos / documentos) del vehículo del viaje activo.
  // Si hay vencidos o próximos, mostramos banner — así el chofer se entera
  // del estado sin tener que ir a otra pantalla.
  const { data: pendientes = [] } = useFlotaPendientes(!!viaje);
  const pendientesVeh = viaje
    ? pendientes.filter((p) => p.vehiculo_id === viaje.vehiculo_id)
    : [];
  const vencidosVeh = pendientesVeh.filter((p) => p.estado === 'VENCIDO').length;
  const proximosVeh = pendientesVeh.filter((p) => p.estado === 'PROXIMO').length;

  const [paso, setPaso] = useState(0);
  const [tablero, setTablero] = useState<FotoCaptura | null>(null);
  const [factura, setFactura] = useState<FotoCaptura | null>(null);
  const [km, setKm] = useState('');
  const [litros, setLitros] = useState('');
  const [monto, setMonto] = useState('');
  const [capturando, setCapturando] = useState(false);

  const enviarMut = useMutation({
    mutationFn: () => {
      if (!viaje || !tablero || !factura) {
        throw new Error('Faltan fotos');
      }
      return enviarCargaCombustible({
        vehiculo_id: viaje.vehiculo_id,
        km_odometro: km ? Number(km) : undefined,
        litros: litros ? Number(litros) : undefined,
        monto: monto ? Number(monto) : undefined,
        tablero,
        factura,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: VIAJE_ACTIVO_KEY });
      qc.invalidateQueries({ queryKey: ['flota', 'cargas-mis'] });
      Alert.alert('Listo', 'Carga de combustible registrada.', [
        { text: 'OK', onPress: () => router.replace('/(tabs)/combustible' as never) },
      ]);
    },
    onError: (e) => Alert.alert('Error', getApiErrorMessage(e, 'No se pudo enviar la carga.')),
  });

  async function tomarFoto(): Promise<FotoCaptura | null> {
    setCapturando(true);
    try {
      const permCam = await ImagePicker.requestCameraPermissionsAsync();
      if (permCam.status !== 'granted') {
        Alert.alert('Cámara requerida', 'Necesitamos la cámara para documentar la carga.');
        return null;
      }
      const gps = await obtenerGpsObligatorio();
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        quality: 0.75,
        allowsEditing: false,
      });
      if (result.canceled || !result.assets[0]?.uri) return null;
      return {
        uri: result.assets[0].uri,
        lat: gps.lat,
        lng: gps.lng,
        accuracy: gps.accuracy,
        capturado_en: new Date().toISOString(),
      };
    } catch (e) {
      alertaGpsError(e);
      return null;
    } finally {
      setCapturando(false);
    }
  }

  async function onCapturarPasoActual() {
    const foto = await tomarFoto();
    if (!foto) return;
    const key = PASOS[paso].key;
    if (key === 'tablero') setTablero(foto);
    else setFactura(foto);
  }

  function fotoActual() {
    const key = PASOS[paso].key;
    if (key === 'tablero') return tablero;
    return factura;
  }

  function puedeAvanzar() {
    return fotoActual() !== null;
  }

  function onSiguiente() {
    if (!puedeAvanzar()) {
      Alert.alert('Foto requerida', 'Tomá la foto con GPS antes de continuar.');
      return;
    }
    if (paso < PASOS.length - 1) setPaso(paso + 1);
    else enviarMut.mutate();
  }

  function volver() {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/combustible' as never);
  }

  if (!viaje) {
    return (
      <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
        <Text style={styles.hint}>Necesitás un viaje abierto. Andá a la pestaña Viaje.</Text>
        <TouchableOpacity onPress={volver} style={styles.linkBtn}>
          <Text style={styles.linkText}>Volver</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const pasoInfo = PASOS[paso];
  const foto = fotoActual();
  const esUltimo = paso === PASOS.length - 1;

  // KAV envuelve TODO: en Android 'height' achica el contenedor cuando aparece
  // el teclado numérico (paso 3, inputs Km/Litros/Monto), el ScrollView del
  // medio se vuelve scrolleable y el footer con Anterior/Enviar queda visible
  // por encima del teclado. edges=['top','bottom'] respeta gesture bar y notch.
  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={volver} style={styles.backBtn}>
          <MaterialIcons name="arrow-back" size={24} color={JWFTheme.color.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.topTitle}>Nueva carga · {viaje.chapa}</Text>
      </View>

      <View style={styles.steps}>
        {PASOS.map((p, i) => (
          <View
            key={p.key}
            style={[styles.stepDot, i <= paso && styles.stepDotActive, i === paso && styles.stepDotCurrent]}
          />
        ))}
      </View>

      {pendientesVeh.length > 0 && (
        <View style={[styles.aviso, vencidosVeh > 0 ? styles.avisoVencido : styles.avisoProximo]}>
          <MaterialIcons
            name={vencidosVeh > 0 ? 'warning' : 'info'}
            size={18}
            color={vencidosVeh > 0 ? '#b91c1c' : '#92400e'}
          />
          <Text style={[styles.avisoText, vencidosVeh > 0 ? styles.avisoTextVencido : styles.avisoTextProximo]}>
            {vencidosVeh > 0
              ? `Este vehículo tiene ${vencidosVeh} ítem${vencidosVeh > 1 ? 's' : ''} vencido${vencidosVeh > 1 ? 's' : ''}`
              : `Este vehículo tiene ${proximosVeh} ítem${proximosVeh > 1 ? 's' : ''} próximo${proximosVeh > 1 ? 's' : ''} a vencer`}
            . Avisá al supervisor.
          </Text>
        </View>
      )}

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.pasoTitulo}>
          Paso {paso + 1}/{PASOS.length}: {pasoInfo.titulo}
        </Text>
        <Text style={styles.pasoHint}>{pasoInfo.hint}</Text>
        <Text style={styles.gpsNote}>Se guardará la ubicación GPS al tomar la foto.</Text>

        {foto ? (
          <View style={styles.previewWrap}>
            <Image source={{ uri: foto.uri }} style={styles.preview} />
            <Text style={styles.gpsCoords}>
              GPS: {foto.lat.toFixed(5)}, {foto.lng.toFixed(5)}
            </Text>
            <TouchableOpacity style={styles.retakeBtn} onPress={onCapturarPasoActual} disabled={capturando}>
              <Text style={styles.retakeText}>Volver a tomar</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            style={styles.cameraBtn}
            onPress={onCapturarPasoActual}
            disabled={capturando}
          >
            {capturando ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <MaterialIcons name={pasoInfo.icon} size={32} color="#fff" />
                <Text style={styles.cameraBtnText}>Tomar foto</Text>
              </>
            )}
          </TouchableOpacity>
        )}

        {esUltimo && (
          <View style={styles.formExtra}>
            <Text style={styles.label}>Datos de la factura (opcional)</Text>
            <NumberInput
              placeholder="Km odómetro"
              value={km}
              onChangeText={setKm}
              style={inputStyle}
              placeholderTextColor={JWFTheme.color.textDim}
            />
            <NumberInput
              placeholder="Litros"
              value={litros}
              onChangeText={setLitros}
              allowDecimal
              style={inputStyle}
              placeholderTextColor={JWFTheme.color.textDim}
            />
            <NumberInput
              placeholder="Monto"
              value={monto}
              onChangeText={setMonto}
              style={inputStyle}
              placeholderTextColor={JWFTheme.color.textDim}
            />
          </View>
        )}
      </ScrollView>

      <View style={styles.footer}>
        {paso > 0 && (
          <TouchableOpacity style={styles.btnOutline} onPress={() => setPaso(paso - 1)}>
            <Text style={styles.btnOutlineText}>Anterior</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[styles.btnPrimary, !puedeAvanzar() && styles.btnDisabled]}
          onPress={onSiguiente}
          disabled={!puedeAvanzar() || enviarMut.isPending}
        >
          {enviarMut.isPending ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.btnPrimaryText}>{esUltimo ? 'Enviar carga' : 'Siguiente'}</Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: JWFTheme.color.bgApp },
  topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, gap: 8 },
  backBtn: { padding: 4 },
  topTitle: { fontSize: 17, fontWeight: JWFTheme.fontWeight.semibold, color: JWFTheme.color.textPrimary, flex: 1 },
  steps: { flexDirection: 'row', justifyContent: 'center', gap: 8, paddingVertical: 8 },
  stepDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: JWFTheme.color.borderDefault },
  stepDotActive: { backgroundColor: JWFTheme.color.accent },
  stepDotCurrent: { width: 24 },
  content: { padding: 20, paddingBottom: 100 },
  pasoTitulo: { fontSize: 20, fontWeight: JWFTheme.fontWeight.semibold, color: JWFTheme.color.textPrimary },
  pasoHint: { fontSize: 14, color: JWFTheme.color.textMuted, marginTop: 4 },
  gpsNote: { fontSize: 12, color: JWFTheme.color.info, marginTop: 8, marginBottom: 16 },
  cameraBtn: {
    backgroundColor: JWFTheme.color.accent,
    borderRadius: JWFTheme.radius.lg,
    paddingVertical: 40,
    alignItems: 'center',
    gap: 8,
  },
  cameraBtnText: { color: '#fff', fontSize: 16, fontWeight: JWFTheme.fontWeight.semibold },
  previewWrap: { alignItems: 'center', gap: 8 },
  preview: { width: '100%', height: 220, borderRadius: JWFTheme.radius.lg, backgroundColor: JWFTheme.color.bgSubtle },
  gpsCoords: { fontSize: 11, color: JWFTheme.color.textMuted, fontFamily: 'monospace' },
  retakeBtn: { padding: 8 },
  retakeText: { color: JWFTheme.color.accent, fontWeight: JWFTheme.fontWeight.medium },
  formExtra: { marginTop: 20, gap: 10 },
  label: { fontSize: 14, fontWeight: JWFTheme.fontWeight.medium, color: JWFTheme.color.textSecondary },
  footer: {
    flexDirection: 'row',
    gap: 10,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: JWFTheme.color.borderDefault,
    backgroundColor: JWFTheme.color.bgCard,
  },
  btnOutline: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: JWFTheme.radius.md,
    borderWidth: 1,
    borderColor: JWFTheme.color.borderDefault,
    alignItems: 'center',
  },
  btnOutlineText: { color: JWFTheme.color.textSecondary, fontWeight: JWFTheme.fontWeight.semibold },
  btnPrimary: {
    flex: 2,
    backgroundColor: JWFTheme.color.accent,
    paddingVertical: 14,
    borderRadius: JWFTheme.radius.md,
    alignItems: 'center',
  },
  btnDisabled: { opacity: 0.5 },
  btnPrimaryText: { color: '#fff', fontWeight: JWFTheme.fontWeight.semibold, fontSize: 16 },
  hint: { padding: 20, color: JWFTheme.color.textMuted },
  linkBtn: { paddingHorizontal: 20 },
  linkText: { color: JWFTheme.color.accent, fontWeight: JWFTheme.fontWeight.semibold },
  aviso: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 4,
    padding: 10,
    borderRadius: JWFTheme.radius.md,
    borderWidth: 1,
  },
  avisoVencido: { backgroundColor: '#fee2e2', borderColor: '#fecaca' },
  avisoProximo: { backgroundColor: '#fef3c7', borderColor: '#fde68a' },
  avisoText: { flex: 1, fontSize: 12 },
  avisoTextVencido: { color: '#b91c1c' },
  avisoTextProximo: { color: '#92400e' },
});
