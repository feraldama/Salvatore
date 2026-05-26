import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { JWFTheme } from '@/constants/theme';
import { useRoles } from '@/lib/auth/AuthContext';
import { enviarMarcacionMobile, obtenerResumenDia } from '@/lib/api/marcacion';
import type { ResumenDia } from '@/lib/types/marcacion';

const QUERY_KEY = ['marcacion', 'resumen-dia'] as const;

export default function MarcacionScreen() {
  const { isComercial, isAdmin } = useRoles();
  const puedeUsar = isComercial || isAdmin;
  const qc = useQueryClient();
  const [enviando, setEnviando] = useState(false);
  const [mensajeOk, setMensajeOk] = useState<string | null>(null);

  const { data, isLoading, isError, refetch, isRefetching } = useQuery<ResumenDia>({
    queryKey: QUERY_KEY,
    queryFn: obtenerResumenDia,
    enabled: puedeUsar,
    staleTime: 30_000,
  });

  // Cada vez que la pantalla vuelve al foco, refetch para que el botón
  // refleje el último estado real (ej. si marcó hoy desde Hikvision).
  useFocusEffect(
    useCallback(() => {
      if (puedeUsar) qc.invalidateQueries({ queryKey: QUERY_KEY });
    }, [qc, puedeUsar]),
  );

  async function marcar(tipo: 'ENTRADA' | 'SALIDA') {
    setMensajeOk(null);
    setEnviando(true);
    try {
      // 1) Servicios de ubicación habilitados a nivel sistema (Android Settings → Location).
      // El "Enable GPS signal" del emulator es la fuente de mock — Android igual
      // tiene que tener Location ON para que cualquier app reciba un fix.
      const servicesOn = await Location.hasServicesEnabledAsync();
      if (!servicesOn) {
        Alert.alert(
          'GPS desactivado',
          'Activá los servicios de ubicación del dispositivo (Configuración → Ubicación) y volvé a intentar.',
          [
            { text: 'Cancelar', style: 'cancel' },
            { text: 'Abrir ajustes', onPress: () => Linking.openSettings() },
          ],
        );
        return;
      }

      // 2) Permiso de ubicación
      const permLoc = await Location.requestForegroundPermissionsAsync();
      if (permLoc.status !== 'granted') {
        Alert.alert(
          'Ubicación requerida',
          'Necesitamos tu ubicación GPS para registrar la marcación.',
          [
            { text: 'Cancelar', style: 'cancel' },
            { text: 'Abrir ajustes', onPress: () => Linking.openSettings() },
          ],
        );
        return;
      }

      // 3) Permiso de cámara
      const permCam = await ImagePicker.requestCameraPermissionsAsync();
      if (permCam.status !== 'granted') {
        Alert.alert(
          'Cámara requerida',
          'Necesitamos acceso a la cámara para tomar la selfie de verificación.',
          [
            { text: 'Cancelar', style: 'cancel' },
            { text: 'Abrir ajustes', onPress: () => Linking.openSettings() },
          ],
        );
        return;
      }

      // 4) Capturar GPS — primero un last-known rápido (no se cuelga si no hay
      // fix), después un current si pudimos. Si ambos vienen vacíos, error claro.
      let pos: Location.LocationObject | null = null;
      try {
        pos = await Location.getLastKnownPositionAsync({ maxAge: 5 * 60_000 });
      } catch { /* ignorar — probamos current */ }
      try {
        const fresco = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        pos = fresco;
      } catch (e: any) {
        // Si ya tenemos un last-known válido, lo usamos. Si no, mensaje claro.
        if (!pos) {
          Alert.alert(
            'No se pudo obtener tu ubicación',
            'En el emulador: clickeá directo sobre el mapa en Extended Controls → Location, asegurate que "Enable GPS signal" esté ON, y abrí una vez Google Maps en el emulador para forzar un primer fix.\n\nEn celular real: encendé el GPS y salí al aire libre unos segundos.',
          );
          return;
        }
      }
      if (!pos) {
        Alert.alert(
          'No se pudo obtener tu ubicación',
          'El GPS está habilitado pero no devolvió coordenadas. Probá abrir Google Maps una vez para forzar un primer fix y volvé.',
        );
        return;
      }

      // 4) Tomar selfie con cámara frontal
      const foto = await ImagePicker.launchCameraAsync({
        cameraType: ImagePicker.CameraType.front,
        mediaTypes: ['images'],
        quality: 0.6,
        allowsEditing: false,
      });
      if (foto.canceled || !foto.assets?.[0]?.uri) return;

      // 5) Enviar al backend
      const resp = await enviarMarcacionMobile({
        tipo,
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy ?? undefined,
        selfieUri: foto.assets[0].uri,
      });

      // Mostrar siempre hora local de Asunción aunque el dispositivo esté en
      // otra zona (común en emulators que vienen seteados en UTC).
      const hhmm = new Date(resp.marc_fecha_hora).toLocaleTimeString('es-PY', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: 'America/Asuncion',
      });
      setMensajeOk(`${tipo === 'ENTRADA' ? 'Entrada' : 'Salida'} registrada a las ${hhmm}`);
      qc.invalidateQueries({ queryKey: QUERY_KEY });
    } catch (e: any) {
      const msg = e?.response?.data?.message
        || e?.message
        || 'No se pudo registrar la marcación.';
      Alert.alert('No se pudo marcar', msg);
    } finally {
      setEnviando(false);
    }
  }

  if (!puedeUsar) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.center}>
          <Text style={styles.h1}>Marcación</Text>
          <Text style={styles.mute}>Esta función está disponible solo para el rol comercial.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} />}
      >
        <Text style={styles.h1}>Marcación</Text>
        {data?.nombre ? <Text style={styles.mute}>{data.nombre}</Text> : null}

        {isLoading ? (
          <ActivityIndicator size="large" color={JWFTheme.color.accent} style={{ marginTop: 48 }} />
        ) : isError ? (
          <View style={styles.card}>
            <Text style={styles.danger}>No se pudo cargar tu estado. Probá tirar abajo para refrescar.</Text>
          </View>
        ) : !data?.permiteMobile ? (
          <View style={styles.card}>
            <Text style={styles.danger}>
              Tu perfil no permite marcación desde la app. Usá el lector de huella en la oficina.
            </Text>
          </View>
        ) : data.proxima === 'COMPLETADO' ? (
          <View style={styles.card}>
            <Text style={styles.h2}>Día completado</Text>
            <Text style={styles.mute}>
              Ya registraste tu entrada y salida de hoy. Volvé mañana para una nueva jornada.
            </Text>
          </View>
        ) : (
          <View style={styles.card}>
            <Text style={styles.h2}>
              {data.proxima === 'ENTRADA' ? 'Registrar entrada' : 'Registrar salida'}
            </Text>
            <Text style={styles.mute}>
              Vamos a tomar una selfie y tu ubicación GPS como evidencia de la marcación.
            </Text>
            <TouchableOpacity
              style={[styles.btn, enviando && styles.btnDisabled]}
              onPress={() => marcar(data.proxima as 'ENTRADA' | 'SALIDA')}
              disabled={enviando}
              activeOpacity={0.8}
            >
              {enviando ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.btnText}>
                  {data.proxima === 'ENTRADA' ? 'Marcar entrada' : 'Marcar salida'}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        {mensajeOk ? (
          <View style={styles.successCard}>
            <Text style={styles.successText}>{mensajeOk}</Text>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: JWFTheme.color.bgApp,
  },
  scroll: {
    padding: 20,
    gap: 16,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 8,
  },
  h1: {
    fontSize: 28,
    fontWeight: JWFTheme.fontWeight.heroLight,
    letterSpacing: JWFTheme.titleTracking,
    color: JWFTheme.color.textPrimary,
  },
  h2: {
    fontSize: 18,
    fontWeight: JWFTheme.fontWeight.semibold,
    color: JWFTheme.color.textPrimary,
  },
  mute: {
    fontSize: 14,
    color: JWFTheme.color.textSecondary,
    lineHeight: 20,
  },
  danger: {
    fontSize: 14,
    color: JWFTheme.color.danger,
    lineHeight: 20,
  },
  card: {
    backgroundColor: JWFTheme.color.bgCard,
    borderRadius: JWFTheme.radius.lg,
    padding: 20,
    gap: 12,
    borderWidth: 1,
    borderColor: JWFTheme.color.borderSubtle,
    ...JWFTheme.shadow.sm,
  },
  btn: {
    backgroundColor: JWFTheme.color.accent,
    paddingVertical: 16,
    borderRadius: JWFTheme.radius.md,
    alignItems: 'center',
    marginTop: 8,
  },
  btnDisabled: {
    opacity: 0.6,
  },
  btnText: {
    color: JWFTheme.color.textInverse,
    fontSize: 16,
    fontWeight: JWFTheme.fontWeight.semibold,
  },
  successCard: {
    backgroundColor: JWFTheme.color.successBg,
    borderRadius: JWFTheme.radius.md,
    padding: 16,
    borderWidth: 1,
    borderColor: JWFTheme.color.success,
  },
  successText: {
    color: JWFTheme.color.success,
    fontSize: 14,
    fontWeight: JWFTheme.fontWeight.medium,
  },
});
