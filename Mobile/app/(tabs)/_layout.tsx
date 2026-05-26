import { Tabs } from 'expo-router';
import React from 'react';

import { HapticTab } from '@/components/haptic-tab';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useIncidenciasMiasCount } from '@/hooks/useIncidencias';
import { useFlotaPendientes } from '@/hooks/useFlotaPendientes';
import { useRoles } from '@/lib/auth/AuthContext';

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const { isTecnico, isComercial, isAdmin, isChofer, isGerenteFlota } = useRoles();
  const verIncidencias = isTecnico || isAdmin;
  const verMarcacion   = isComercial || isAdmin;
  const verFlota       = isChofer;
  const verVisitas     = isComercial || isAdmin;
  // El gerente de operaciones ve sus propias tabs (live + atención), distintas
  // de las del chofer. No es CHOFER (no maneja), monitorea.
  const verGerente     = isGerenteFlota;
  const { data: miasCount } = useIncidenciasMiasCount(verIncidencias);
  const badge = miasCount && miasCount > 0 ? (miasCount > 99 ? '99+' : String(miasCount)) : undefined;
  // Badge en la tab de mantenimiento: solo cuenta vencidos (los próximos son
  // info, no acción) — y muestra el número sólo si hay alguno.
  const { data: pendientes = [] } = useFlotaPendientes(verFlota);
  const vencidosCount = pendientes.filter((p) => p.estado === 'VENCIDO').length;
  const mantBadge = vencidosCount > 0 ? (vencidosCount > 99 ? '99+' : String(vencidosCount)) : undefined;

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors[colorScheme ?? 'light'].tint,
        headerShown: false,
        tabBarButton: HapticTab,
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Inicio',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="house.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="incidencias"
        options={{
          title: 'Incidencias',
          // Si el rol no aplica, escondemos la tab — el archivo igual existe.
          href: verIncidencias ? undefined : null,
          tabBarBadge: badge,
          tabBarIcon: ({ color }) => (
            <IconSymbol size={28} name="exclamationmark.triangle.fill" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="mapa"
        options={{
          title: 'Mapa',
          href: verIncidencias ? undefined : null,
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="map.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="marcacion"
        options={{
          title: 'Marcación',
          href: verMarcacion ? undefined : null,
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="clock.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="viaje"
        options={{
          title: 'Viaje',
          href: verFlota ? undefined : null,
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="car.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="combustible"
        options={{
          title: 'Combustible',
          href: verFlota ? undefined : null,
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="fuelpump.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="mantenimiento"
        options={{
          title: 'Mi vehículo',
          href: verFlota ? undefined : null,
          tabBarBadge: mantBadge,
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="wrench.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="flota-live"
        options={{
          title: 'En vivo',
          href: verGerente ? undefined : null,
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="map.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="flota-atencion"
        options={{
          title: 'Atención',
          href: verGerente ? undefined : null,
          tabBarIcon: ({ color }) => (
            <IconSymbol size={28} name="exclamationmark.triangle.fill" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="visitas"
        options={{
          title: 'Visitas',
          href: verVisitas ? undefined : null,
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="calendar" color={color} />,
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          title: 'Cuenta',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="person.fill" color={color} />,
        }}
      />
    </Tabs>
  );
}
