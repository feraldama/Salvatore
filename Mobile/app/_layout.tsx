import { DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import 'react-native-reanimated';

// Side-effect import: registra el background task de tracking de viaje. DEBE
// estar en el root para evaluarse en cada arranque del JS (incluso cuando el
// OS despierta el proceso headless por una location update sin que el usuario
// abra la app).
import '@/lib/flota/background-task';

import { usePushSetup } from '@/hooks/usePushSetup';
import { useScheduleVisitasNotifs } from '@/hooks/useScheduleVisitasNotifs';
import { useUbicacionHeartbeat } from '@/hooks/useUbicacionHeartbeat';
import { useFlotaUbicacionHeartbeat } from '@/hooks/useFlotaUbicacionHeartbeat';
import { AuthProvider, useAuth } from '@/lib/auth/AuthContext';
import { QueryProvider } from '@/providers/QueryProvider';
import { JWFTheme } from '@/constants/theme';

export const unstable_settings = {
  anchor: '(tabs)',
};

function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  usePushSetup();
  useUbicacionHeartbeat();
  useFlotaUbicacionHeartbeat();
  useScheduleVisitasNotifs();

  useEffect(() => {
    if (isLoading) return;
    const inLogin = segments[0] === 'login';
    if (!user && !inLogin) {
      router.replace('/login');
    } else if (user && inLogin) {
      router.replace('/(tabs)');
    }
  }, [user, isLoading, segments, router]);

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={JWFTheme.color.accent} />
      </View>
    );
  }

  return <>{children}</>;
}

export default function RootLayout() {
  // JWFTheme es light-only (ver constants/theme.ts). Ignoramos el colorScheme
  // del OS y forzamos DefaultTheme + StatusBar dark — si seguimos `auto`, en
  // celus con dark mode el tab bar de React Navigation se pinta negro y los
  // íconos de la status bar quedan blancos sobre el fondo light de la app
  // (invisibles).
  return (
    // SafeAreaProvider explícito: expo-router lo wrappea internamente, pero
    // tenerlo acá hace que `useSafeAreaInsets()` y `<SafeAreaView edges>` se
    // comporten igual en todas las pantallas (incluyendo modales y rutas
    // standalone) sin depender de detalles internos del router.
    <SafeAreaProvider>
      <QueryProvider>
        <AuthProvider>
          <ThemeProvider value={DefaultTheme}>
            <AuthGate>
                <Stack>
                <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                <Stack.Screen name="login" options={{ headerShown: false }} />
                <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
                <Stack.Screen
                  name="incidencia/[id]"
                  options={{ headerShown: false }}
                />
                <Stack.Screen
                  name="incidencia/nueva"
                  options={{ headerShown: false }}
                />
                <Stack.Screen
                  name="combustible/nueva"
                  options={{ headerShown: false }}
                />
                <Stack.Screen
                  name="visita/[id]"
                  options={{ headerShown: false }}
                />
                <Stack.Screen
                  name="flota/viaje/[id]"
                  options={{ headerShown: false }}
                />
              </Stack>
            </AuthGate>
            <StatusBar style="dark" />
          </ThemeProvider>
        </AuthProvider>
      </QueryProvider>
    </SafeAreaProvider>
  );
}
