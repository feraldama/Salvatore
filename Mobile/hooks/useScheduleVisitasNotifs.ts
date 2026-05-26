import * as Notifications from 'expo-notifications';
import { useEffect } from 'react';

import { useAgendaHoy } from '@/hooks/useVisitas';
import { useRoles } from '@/lib/auth/AuthContext';
import type { Visita } from '@/lib/api/visitas';

const PREFIJO_NOTIF = 'visita-';
const MINUTOS_ANTES = 15;

/// Agenda notificaciones locales 15 min antes de cada visita del día, tipo
/// Google Calendar. Se vuelve a calcular cada vez que cambia la agenda
/// (auto-refresh cada 30s vía `useAgendaHoy`). El payload `data.url` es el deep
/// link que expo-router intercepta al tap (misma convención que las push
/// remotas de incidencias).
export function useScheduleVisitasNotifs() {
  const { isComercial, isAdmin } = useRoles();
  const habilitado = isComercial || isAdmin;
  const { data } = useAgendaHoy(habilitado);
  const visitas = data?.visitas;

  useEffect(() => {
    if (!habilitado || !visitas) return;
    void reprogramar(visitas);
  }, [habilitado, visitas]);
}

async function reprogramar(visitas: Visita[]) {
  try {
    const perm = await Notifications.getPermissionsAsync();
    if (!perm.granted) {
      const req = await Notifications.requestPermissionsAsync();
      if (!req.granted) return;
    }

    // Borramos lo que tengamos programado de visitas y volvemos a armar todo.
    // Más simple que diffear y evita drift si el comercial mueve una hora.
    const todas = await Notifications.getAllScheduledNotificationsAsync();
    for (const n of todas) {
      if (n.identifier.startsWith(PREFIJO_NOTIF)) {
        await Notifications.cancelScheduledNotificationAsync(n.identifier);
      }
    }

    const ahora = Date.now();
    for (const v of visitas) {
      if (v.estado !== 'agendada') continue;
      const fecha = new Date(v.fechaInicio).getTime();
      const triggerMs = fecha - MINUTOS_ANTES * 60 * 1000;
      if (triggerMs <= ahora + 1_000) continue;          // ya pasó la ventana

      await Notifications.scheduleNotificationAsync({
        identifier: `${PREFIJO_NOTIF}${v.id}`,
        content: {
          title: `Visita en ${MINUTOS_ANTES} min`,
          body: v.empresa?.nombre ?? v.asunto,
          data: { url: `mobile:///visita/${v.id}` },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: new Date(triggerMs),
        },
      });
    }
  } catch (err) {
    // Si el OS no permite scheduling o la API cambió, no rompemos la app.
    console.warn('[visitas] no se pudo reprogramar notifs:', err);
  }
}
