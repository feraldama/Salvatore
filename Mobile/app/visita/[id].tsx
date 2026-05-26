import * as Location from 'expo-location';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import axios from 'axios';

import {
  useAgendaHoy,
  useCheckInCamino,
  useFinalizarVisita,
  useIniciarVisita,
} from '@/hooks/useVisitas';
import type { Visita } from '@/lib/api/visitas';
import { useRoles } from '@/lib/auth/AuthContext';
import { JWFTheme } from '@/constants/theme';

export default function VisitaDetalleScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { isComercial, isAdmin } = useRoles();
  const habilitado = isComercial || isAdmin;

  const { data, isLoading, isError } = useAgendaHoy(habilitado);
  const visita = useMemo(
    () => data?.visitas.find((v) => String(v.id) === id) ?? null,
    [data, id],
  );

  const checkIn   = useCheckInCamino();
  const iniciar   = useIniciarVisita();
  const finalizar = useFinalizarVisita();

  const [resultado, setResultado] = useState('');

  if (isLoading) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={JWFTheme.color.accent} />
        </View>
      </SafeAreaView>
    );
  }

  if (isError || !visita) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.center}>
          <Text style={styles.errorTitle}>Visita no encontrada</Text>
          <TouchableOpacity style={styles.btnSecondary} onPress={() => router.back()}>
            <Text style={styles.btnSecondaryText}>Volver</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const cfg = data?.config;
  const puedeCheckIn = cfg ? esCercaDelHorarioEntrada(visita.fechaInicio, cfg.horaEntrada, cfg.ventanaMin) : false;
  const yaTieneAsistencia = visita.asistencia != null;
  const estadoActual = visita.estado;

  const onCheckIn = async () => {
    try {
      await checkIn.mutateAsync(visita.id);
      Alert.alert('Asistencia marcada', 'Queda pendiente hasta que inicies la visita en el cliente.');
    } catch (e) {
      Alert.alert('No se pudo marcar asistencia', mensajeError(e));
    }
  };

  const onIniciar = async () => {
    const pos = await pedirUbicacion();
    if (!pos) return;
    try {
      await iniciar.mutateAsync({ visitaId: visita.id, lat: pos.lat, lng: pos.lng });
      Alert.alert('Visita iniciada', 'Tu ubicación quedó registrada.');
    } catch (e) {
      Alert.alert('No se pudo iniciar la visita', mensajeError(e));
    }
  };

  const onFinalizar = async () => {
    const pos = await pedirUbicacion();
    if (!pos) return;
    try {
      await finalizar.mutateAsync({
        visitaId: visita.id,
        lat: pos.lat,
        lng: pos.lng,
        resultado: resultado.trim() || undefined,
      });
      Alert.alert('Visita finalizada');
      router.back();
    } catch (e) {
      Alert.alert('No se pudo finalizar la visita', mensajeError(e));
    }
  };

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>← Volver</Text>
        </TouchableOpacity>

        <Text style={styles.title}>{visita.empresa?.nombre ?? visita.asunto}</Text>
        <Text style={styles.subtitle}>{visita.asunto}</Text>

        <View style={styles.card}>
          <Field label="Hora agendada" value={fechaHoraLarga(visita.fechaInicio)} />
          {visita.empresa?.direccion ? <Field label="Dirección" value={visita.empresa.direccion} /> : null}
          <Field
            label="Estado"
            value={estadoLabel(visita.estado)}
          />
          {visita.horaInicioReal ? (
            <Field label="Inicio real" value={fechaHoraLarga(visita.horaInicioReal)} />
          ) : null}
          {visita.horaFinReal ? (
            <Field label="Fin real" value={fechaHoraLarga(visita.horaFinReal)} />
          ) : null}
          {!visita.empresa?.latitud && estadoActual === 'agendada' ? (
            <Text style={styles.note}>
              El cliente todavía no tiene ubicación guardada. Las coordenadas que captures al iniciar
              esta visita van a quedar como la ubicación oficial.
            </Text>
          ) : null}
        </View>

        {/* Acciones */}
        {estadoActual === 'agendada' && (
          <>
            {!yaTieneAsistencia && puedeCheckIn && (
              <TouchableOpacity
                style={[styles.btnPrimary, checkIn.isPending && styles.btnDisabled]}
                onPress={onCheckIn}
                disabled={checkIn.isPending}
              >
                <Text style={styles.btnPrimaryText}>
                  {checkIn.isPending ? 'Marcando…' : 'Marcar asistencia (camino al cliente)'}
                </Text>
              </TouchableOpacity>
            )}
            {yaTieneAsistencia && (
              <View style={styles.infoBanner}>
                <Text style={styles.infoText}>
                  Asistencia marcada. Queda pendiente hasta que inicies la visita en el cliente.
                </Text>
              </View>
            )}
            <TouchableOpacity
              style={[styles.btnPrimary, iniciar.isPending && styles.btnDisabled]}
              onPress={onIniciar}
              disabled={iniciar.isPending}
            >
              <Text style={styles.btnPrimaryText}>
                {iniciar.isPending ? 'Iniciando…' : 'Iniciar visita en el cliente'}
              </Text>
            </TouchableOpacity>
          </>
        )}

        {estadoActual === 'en_curso' && (
          <>
            <View style={styles.card}>
              <Text style={styles.label}>Resultado (opcional)</Text>
              <TextInput
                style={styles.input}
                multiline
                placeholder="¿Cómo fue la reunión? ¿Próximos pasos?"
                placeholderTextColor={JWFTheme.color.textDim}
                value={resultado}
                onChangeText={setResultado}
              />
            </View>
            <TouchableOpacity
              style={[styles.btnPrimary, finalizar.isPending && styles.btnDisabled]}
              onPress={onFinalizar}
              disabled={finalizar.isPending}
            >
              <Text style={styles.btnPrimaryText}>
                {finalizar.isPending ? 'Finalizando…' : 'Finalizar visita'}
              </Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

function fechaHoraLarga(iso: string): string {
  const d = new Date(iso);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${d.toLocaleDateString('es-PY')} ${hh}:${mm}`;
}

function estadoLabel(estado: Visita['estado']): string {
  switch (estado) {
    case 'agendada':     return 'Agendada';
    case 'en_curso':     return 'En curso';
    case 'completada':   return 'Completada';
    case 'no_realizada': return 'No realizada';
  }
}

// La asistencia "camino" solo se puede marcar si la hora agendada cae dentro de
// ±ventanaMin minutos del horario de entrada laboral. Mismo cálculo que el backend
// hace en checkInCamino — acá lo replicamos solo para ocultar el botón cuando no
// aplica.
function esCercaDelHorarioEntrada(isoVisita: string, horaEntrada: string, ventanaMin: number): boolean {
  const fv = new Date(isoVisita);
  const [hh, mm] = horaEntrada.split(':').map(Number);
  const horaEvento = fv.getHours() * 60 + fv.getMinutes();
  const horaRef = (hh || 0) * 60 + (mm || 0);
  return Math.abs(horaEvento - horaRef) <= ventanaMin;
}

async function pedirUbicacion(): Promise<{ lat: number; lng: number } | null> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') {
    Alert.alert('Permiso requerido', 'Necesitamos tu ubicación para registrar la visita.');
    return null;
  }
  try {
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    return { lat: pos.coords.latitude, lng: pos.coords.longitude };
  } catch {
    Alert.alert('No pudimos leer tu ubicación', 'Revisá que el GPS esté activado.');
    return null;
  }
}

function mensajeError(e: unknown): string {
  if (axios.isAxiosError(e)) {
    const data = e.response?.data as { message?: string } | undefined;
    if (data?.message) return data.message;
  }
  return e instanceof Error ? e.message : 'Error desconocido.';
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: JWFTheme.color.bgApp },
  content: { padding: 20, gap: 16 },
  backBtn: { alignSelf: 'flex-start', paddingVertical: 4 },
  backBtnText: { fontSize: 14, color: JWFTheme.color.textLink, fontWeight: JWFTheme.fontWeight.semibold },
  title: { fontSize: 24, fontWeight: JWFTheme.fontWeight.bold, color: JWFTheme.color.textPrimary },
  subtitle: { fontSize: 14, color: JWFTheme.color.textMuted, marginTop: -8 },
  card: {
    backgroundColor: JWFTheme.color.bgCard,
    padding: 16,
    borderRadius: JWFTheme.radius.lg,
    borderWidth: 1,
    borderColor: JWFTheme.color.borderDefault,
    gap: 12,
    ...JWFTheme.shadow.sm,
  },
  field: { gap: 2 },
  label: { fontSize: 12, color: JWFTheme.color.textMuted, fontWeight: JWFTheme.fontWeight.semibold, textTransform: 'uppercase', letterSpacing: 0.4 },
  value: { fontSize: 15, color: JWFTheme.color.textPrimary },
  note: { fontSize: 13, color: JWFTheme.color.textSecondary, fontStyle: 'italic', marginTop: 4 },
  input: {
    borderWidth: 1,
    borderColor: JWFTheme.color.borderDefault,
    borderRadius: JWFTheme.radius.md,
    padding: 12,
    minHeight: 80,
    textAlignVertical: 'top',
    color: JWFTheme.color.textPrimary,
    backgroundColor: JWFTheme.color.bgInput,
  },
  btnPrimary: {
    backgroundColor: JWFTheme.color.accent,
    paddingVertical: 14,
    borderRadius: JWFTheme.radius.md,
    alignItems: 'center',
  },
  btnPrimaryText: { color: JWFTheme.color.textInverse, fontWeight: JWFTheme.fontWeight.semibold, fontSize: 15 },
  btnDisabled: { opacity: 0.5 },
  btnSecondary: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: JWFTheme.radius.md,
    borderWidth: 1,
    borderColor: JWFTheme.color.borderDefault,
    backgroundColor: JWFTheme.color.bgCard,
  },
  btnSecondaryText: { color: JWFTheme.color.textPrimary, fontWeight: JWFTheme.fontWeight.semibold },
  infoBanner: {
    backgroundColor: JWFTheme.color.warningBg,
    padding: 12,
    borderRadius: JWFTheme.radius.md,
    borderLeftWidth: 4,
    borderLeftColor: JWFTheme.color.warning,
  },
  infoText: { fontSize: 13, color: JWFTheme.color.textSecondary },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  errorTitle: { fontSize: 16, fontWeight: JWFTheme.fontWeight.semibold, color: JWFTheme.color.danger },
});
