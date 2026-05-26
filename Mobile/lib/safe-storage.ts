// Wrapper sobre AsyncStorage que NO rompe en Expo Go. El módulo nativo de
// @react-native-async-storage/async-storage requiere autolinking — en Expo
// Go retorna null y el primer .getItem/.setItem tira "AsyncStorage is null".
// Si ese error escala desde un import top-level (como ubicacion-queue.ts que
// se evalúa al cargar el bundle), se cae toda la app antes de mostrar nada.
//
// Estrategia: detectamos Expo Go y caemos a un Map in-memory. Los datos NO
// se persisten entre reinicios — está bien para development (la cola de GPS
// y el cierre pendiente arrancan vacíos en cada arranque), y en APK release
// AsyncStorage funciona normal y los datos sí persisten.

import AsyncStorage from '@react-native-async-storage/async-storage';

import { ES_EXPO_GO } from './runtime';

const memStore = new Map<string, string>();
let avisoYa = false;
function avisarUnaVez() {
  if (avisoYa) return;
  avisoYa = true;
  console.warn(
    '[safe-storage] AsyncStorage no disponible (Expo Go o módulo nativo no ' +
      'autoenlazado). Cayendo a almacenamiento en memoria — los datos NO ' +
      'persisten entre reinicios. En APK release esto no debería pasar.',
  );
}

export async function getItem(key: string): Promise<string | null> {
  if (ES_EXPO_GO) {
    avisarUnaVez();
    return memStore.get(key) ?? null;
  }
  try {
    return await AsyncStorage.getItem(key);
  } catch (err) {
    avisarUnaVez();
    console.warn('[safe-storage] getItem falló:', err);
    return memStore.get(key) ?? null;
  }
}

export async function setItem(key: string, value: string): Promise<void> {
  if (ES_EXPO_GO) {
    avisarUnaVez();
    memStore.set(key, value);
    return;
  }
  try {
    await AsyncStorage.setItem(key, value);
  } catch (err) {
    avisarUnaVez();
    console.warn('[safe-storage] setItem falló:', err);
    memStore.set(key, value);
  }
}

export async function removeItem(key: string): Promise<void> {
  if (ES_EXPO_GO) {
    avisarUnaVez();
    memStore.delete(key);
    return;
  }
  try {
    await AsyncStorage.removeItem(key);
  } catch (err) {
    avisarUnaVez();
    console.warn('[safe-storage] removeItem falló:', err);
    memStore.delete(key);
  }
}
