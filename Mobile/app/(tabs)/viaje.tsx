import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { JWFTheme } from '@/constants/theme';
import { useRoles } from '@/lib/auth/AuthContext';
import { getMisVehiculos, iniciarViaje } from '@/lib/api/flota';
import { getApiErrorMessage } from '@/lib/api/errors';
import { alertaGpsError, obtenerGpsObligatorio } from '@/lib/gps';
import { VIAJE_ACTIVO_KEY, useFlotaViaje } from '@/hooks/useFlotaViaje';
import { encolar } from '@/lib/flota/ubicacion-queue';
import {
  intentarCierre,
  setPendiente as setCierrePendiente,
} from '@/lib/flota/cierre-pendiente';
import {
  asegurarPermisosTracking,
  detenerTracking,
  iniciarTracking,
} from '@/lib/flota/tracker';

export default function ViajeScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const { isChofer } = useRoles();
  const puedeUsar = isChofer;
  const [vehiculoId, setVehiculoId] = useState<number | null>(null);
  const [procesando, setProcesando] = useState(false);

  const { data: viajeResp, isLoading, refetch, isRefetching } = useFlotaViaje();
  const viaje = viajeResp?.viaje ?? null;

  const {
    data: vehiculos = [],
    isLoading: cargandoVehiculos,
    refetch: refetchVehiculos,
    isRefetching: refetchingVehiculos,
  } = useQuery({
    queryKey: ['flota', 'vehiculos-mis'],
    queryFn: getMisVehiculos,
    enabled: puedeUsar && !viaje,
  });

  useFocusEffect(
    useCallback(() => {
      if (!puedeUsar) return;
      qc.invalidateQueries({ queryKey: VIAJE_ACTIVO_KEY });
      qc.invalidateQueries({ queryKey: ['flota', 'vehiculos-mis'] });
    }, [qc, puedeUsar]),
  );

  const onRefresh = useCallback(async () => {
    await Promise.all([refetch(), refetchVehiculos()]);
  }, [refetch, refetchVehiculos]);

  const iniciarMut = useMutation({
    mutationFn: async () => {
      if (!vehiculoId) throw new Error('Elegí un vehículo');
      const permisos = await asegurarPermisosTracking();
      if (!permisos.ok) {
        throw new Error(permisos.motivo ?? 'Faltan permisos de ubicación');
      }
      const gps = await obtenerGpsObligatorio();
      const viaje = await iniciarViaje({ vehiculo_id: vehiculoId, ...gps });
      // Arrancamos el background task. Idempotente — el hook global también
      // lo levantará al detectar viajeAbierto, pero lo hacemos acá para que
      // el primer fix llegue al toque.
      await iniciarTracking();
      return viaje;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: VIAJE_ACTIVO_KEY });
      Alert.alert(
        'Viaje iniciado',
        'Tu ubicación se reportará automáticamente. El registro sigue funcionando con la app en background o el celu bloqueado.',
      );
    },
    onError: (e) => Alert.alert('Error', getApiErrorMessage(e, 'No se pudo iniciar el viaje.')),
  });

  async function onIniciar() {
    setProcesando(true);
    try {
      await iniciarMut.mutateAsync();
    } catch (e) {
      alertaGpsError(e);
    } finally {
      setProcesando(false);
    }
  }

  function onTerminar() {
    Alert.alert(
      'Terminar viaje',
      '¿Confirmás el cierre del viaje? Se tomará tu ubicación GPS actual.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Terminar',
          style: 'destructive',
          onPress: async () => {
            setProcesando(true);
            try {
              const gps = await obtenerGpsObligatorio();
              const capturadoEn = new Date().toISOString();
              const cierre = {
                lat: gps.lat,
                lng: gps.lng,
                accuracy: gps.accuracy ?? null,
                capturado_en: capturadoEn,
              };
              // El punto de cierre también va a la cola de track, así el
              // recorrido del viaje queda con su última posición visible.
              await encolar(cierre);
              // Persistimos la intención de cierre ANTES de intentar el POST.
              // Si el POST falla por offline, el hook global retoma el intento
              // cuando vuelva la red.
              await setCierrePendiente(cierre);
              const ok = await intentarCierre();
              if (ok) {
                await detenerTracking();
                qc.invalidateQueries({ queryKey: VIAJE_ACTIVO_KEY });
                Alert.alert('Viaje finalizado', 'Cierre registrado correctamente.');
              } else {
                Alert.alert(
                  'Cierre pendiente',
                  'Estás sin conexión. El viaje se cerrará en cuanto vuelva la red. La app sigue registrando tu ubicación hasta entonces.',
                );
              }
            } catch (e) {
              alertaGpsError(e);
            } finally {
              setProcesando(false);
            }
          },
        },
      ],
    );
  }

  if (!puedeUsar) {
    return (
      <SafeAreaView style={styles.root} edges={['top']}>
        <Text style={styles.hint}>Esta sección es solo para choferes.</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching || refetchingVehiculos}
            onRefresh={onRefresh}
            tintColor={JWFTheme.color.accent}
          />
        }
      >
        <Text style={styles.title}>Viaje</Text>
        <Text style={styles.subtitle}>
          Iniciá el viaje al salir y terminálo al volver a oficinas. El GPS solo se usa con viaje abierto.
        </Text>

        {isLoading ? (
          <ActivityIndicator color={JWFTheme.color.accent} style={{ marginTop: 24 }} />
        ) : viaje ? (
          <View style={styles.cardActivo}>
            <View style={styles.cardHeader}>
              <MaterialIcons name="directions-car" size={22} color={JWFTheme.color.success} />
              <Text style={styles.cardTitle}>Viaje en curso</Text>
            </View>
            <Text style={styles.chapa}>{viaje.chapa}</Text>
            {viaje.marca ? <Text style={styles.meta}>{viaje.marca}</Text> : null}
            <Text style={styles.meta}>
              Inicio: {new Date(viaje.inicio_en).toLocaleString('es-PY')}
            </Text>

            <TouchableOpacity
              style={styles.btnSecondary}
              onPress={() => router.push('/combustible/nueva' as never)}
            >
              <MaterialIcons name="local-gas-station" size={18} color={JWFTheme.color.accent} />
              <Text style={styles.btnSecondaryText}>Cargar combustible</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.btnPrimary, styles.btnDanger]}
              onPress={onTerminar}
              disabled={procesando}
            >
              {procesando ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.btnPrimaryText}>Terminar viaje</Text>
              )}
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.card}>
            <Text style={styles.label}>Vehículo para este viaje</Text>
            {cargandoVehiculos ? (
              <ActivityIndicator color={JWFTheme.color.accent} />
            ) : vehiculos.length === 0 ? (
              <Text style={styles.hint}>
                No tenés vehículos asignados. Pedí al administrador que te asigne en ERP → Flota →
                Asignaciones.
              </Text>
            ) : (
              vehiculos.map((v) => (
                <TouchableOpacity
                  key={v.id}
                  style={[styles.vehOption, vehiculoId === v.id && styles.vehOptionSelected]}
                  onPress={() => setVehiculoId(v.id)}
                >
                  <Text style={styles.vehChapa}>{v.chapa}</Text>
                  <Text style={styles.vehMeta}>
                    {[v.marca, v.modelo].filter(Boolean).join(' · ') || 'Sin descripción'}
                  </Text>
                </TouchableOpacity>
              ))
            )}

            <TouchableOpacity
              style={[styles.btnPrimary, (!vehiculoId || vehiculos.length === 0) && styles.btnDisabled]}
              onPress={onIniciar}
              disabled={!vehiculoId || procesando || iniciarMut.isPending}
            >
              {procesando || iniciarMut.isPending ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.btnPrimaryText}>Iniciar viaje</Text>
              )}
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: JWFTheme.color.bgApp },
  content: { padding: 20, paddingBottom: 40 },
  title: { fontSize: 24, fontWeight: JWFTheme.fontWeight.semibold, color: JWFTheme.color.textPrimary },
  subtitle: { fontSize: 14, color: JWFTheme.color.textMuted, marginTop: 6, lineHeight: 20 },
  card: {
    marginTop: 20,
    backgroundColor: JWFTheme.color.bgCard,
    borderRadius: JWFTheme.radius.lg,
    padding: 16,
    borderWidth: 1,
    borderColor: JWFTheme.color.borderDefault,
    gap: 12,
  },
  cardActivo: {
    marginTop: 20,
    backgroundColor: JWFTheme.color.successBg,
    borderRadius: JWFTheme.radius.lg,
    padding: 16,
    borderWidth: 1,
    borderColor: JWFTheme.color.success,
    gap: 12,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardTitle: { fontSize: 16, fontWeight: JWFTheme.fontWeight.semibold, color: JWFTheme.color.success },
  chapa: { fontSize: 22, fontWeight: JWFTheme.fontWeight.semibold, fontFamily: 'monospace' },
  meta: { fontSize: 13, color: JWFTheme.color.textMuted },
  label: { fontSize: 14, fontWeight: JWFTheme.fontWeight.medium, color: JWFTheme.color.textSecondary },
  vehOption: {
    padding: 12,
    borderRadius: JWFTheme.radius.md,
    borderWidth: 1,
    borderColor: JWFTheme.color.borderDefault,
    backgroundColor: JWFTheme.color.bgCard,
  },
  vehOptionSelected: { borderColor: JWFTheme.color.accent, backgroundColor: JWFTheme.color.accentBg },
  vehChapa: { fontSize: 16, fontWeight: JWFTheme.fontWeight.semibold, color: JWFTheme.color.textPrimary },
  vehMeta: { fontSize: 12, color: JWFTheme.color.textMuted, marginTop: 2 },
  btnPrimary: {
    backgroundColor: JWFTheme.color.accent,
    paddingVertical: 14,
    borderRadius: JWFTheme.radius.md,
    alignItems: 'center',
    marginTop: 8,
  },
  btnDanger: { backgroundColor: JWFTheme.color.danger },
  btnDisabled: { opacity: 0.5 },
  btnPrimaryText: { color: '#fff', fontSize: 16, fontWeight: JWFTheme.fontWeight.semibold },
  btnSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: JWFTheme.radius.md,
    backgroundColor: JWFTheme.color.bgCard,
    borderWidth: 1,
    borderColor: JWFTheme.color.accent,
  },
  btnSecondaryText: { color: JWFTheme.color.accent, fontWeight: JWFTheme.fontWeight.semibold },
  hint: { fontSize: 14, color: JWFTheme.color.textMuted, lineHeight: 20, padding: 20 },
});
