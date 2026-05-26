import { useCallback } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { JWFTheme } from '@/constants/theme';
import { useRoles } from '@/lib/auth/AuthContext';
import { getMisCargasCombustible } from '@/lib/api/flota';
import type { CargaCombustibleResumen } from '@/lib/types/flota';
import { VIAJE_ACTIVO_KEY, useFlotaViaje } from '@/hooks/useFlotaViaje';

export default function CombustibleScreen() {
  const router = useRouter();
  const { isChofer } = useRoles();
  const puedeUsar = isChofer;
  const { data: viajeResp } = useFlotaViaje();
  const viajeAbierto = !!viajeResp?.viaje;

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['flota', 'cargas-mis'],
    queryFn: () => getMisCargasCombustible(1, 50),
    enabled: puedeUsar,
  });

  useFocusEffect(
    useCallback(() => {
      if (puedeUsar) refetch();
    }, [puedeUsar, refetch]),
  );

  const items = data?.data ?? [];

  if (!puedeUsar) {
    return (
      <SafeAreaView style={styles.root} edges={['top']}>
        <Text style={styles.hint}>Esta sección es solo para choferes.</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Combustible</Text>
          <Text style={styles.subtitle}>Cargas con foto de odómetro, tanque y factura</Text>
        </View>
        <TouchableOpacity
          style={[styles.fab, !viajeAbierto && styles.fabDisabled]}
          onPress={() => {
            if (!viajeAbierto) return;
            router.push('/combustible/nueva' as never);
          }}
          disabled={!viajeAbierto}
        >
          <MaterialIcons name="add" size={26} color="#fff" />
        </TouchableOpacity>
      </View>

      {!viajeAbierto && (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>
            Iniciá un viaje en la pestaña Viaje para registrar una carga.
          </Text>
        </View>
      )}

      {isLoading ? (
        <ActivityIndicator color={JWFTheme.color.accent} style={{ marginTop: 32 }} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={JWFTheme.color.accent} />
          }
          ListEmptyComponent={
            <Text style={styles.empty}>Aún no registraste cargas de combustible.</Text>
          }
          renderItem={({ item }) => <CargaRow item={item} />}
        />
      )}
    </SafeAreaView>
  );
}

function CargaRow({ item }: { item: CargaCombustibleResumen }) {
  const fecha = new Date(item.creado_en).toLocaleString('es-PY', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
  return (
    <View style={styles.row}>
      <Text style={styles.rowChapa}>{item.chapa}</Text>
      <Text style={styles.rowMeta}>{fecha}</Text>
      <View style={styles.rowStats}>
        {item.km != null && <Text style={styles.stat}>Km {item.km}</Text>}
        {item.litros != null && <Text style={styles.stat}>{item.litros} L</Text>}
        {item.monto != null && <Text style={styles.stat}>${item.monto}</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: JWFTheme.color.bgApp },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
  },
  title: { fontSize: 24, fontWeight: JWFTheme.fontWeight.semibold, color: JWFTheme.color.textPrimary },
  subtitle: { fontSize: 13, color: JWFTheme.color.textMuted, marginTop: 4 },
  fab: {
    backgroundColor: JWFTheme.color.accent,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabDisabled: { opacity: 0.4 },
  banner: {
    marginHorizontal: 20,
    marginBottom: 12,
    padding: 12,
    backgroundColor: JWFTheme.color.warningBg,
    borderRadius: JWFTheme.radius.md,
    borderWidth: 1,
    borderColor: JWFTheme.color.warning,
  },
  bannerText: { fontSize: 13, color: JWFTheme.color.warning },
  list: { paddingHorizontal: 20, paddingBottom: 24, gap: 10 },
  row: {
    backgroundColor: JWFTheme.color.bgCard,
    padding: 14,
    borderRadius: JWFTheme.radius.lg,
    borderWidth: 1,
    borderColor: JWFTheme.color.borderDefault,
  },
  rowChapa: { fontSize: 16, fontWeight: JWFTheme.fontWeight.semibold, fontFamily: 'monospace' },
  rowMeta: { fontSize: 12, color: JWFTheme.color.textMuted, marginTop: 2 },
  rowStats: { flexDirection: 'row', gap: 12, marginTop: 8 },
  stat: { fontSize: 13, color: JWFTheme.color.textSecondary },
  empty: { textAlign: 'center', color: JWFTheme.color.textMuted, marginTop: 40, fontSize: 14 },
  hint: { fontSize: 14, color: JWFTheme.color.textMuted, padding: 20 },
});
