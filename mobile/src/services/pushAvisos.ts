// =====================================================================
// Avisos al teléfono (push) y el número en el ícono (21/11/2026)
// ---------------------------------------------------------------------
// El dueño: "cuando Hermes me escriba o mande una notificación a través de
// MotoFlow, que me aparezca el número del mensajito" en el ícono.
//
// En Android ese número lo pone el lanzador (Samsung One UI) contando los
// avisos de la app que hay en la bandeja; por eso lo que importa es que el
// aviso LLEGUE. La base lo manda (sql/push_avisos_movil.sql) a los teléfonos
// registrados aquí, con su token de Expo, en hermes_dispositivos.
// Al abrir la app se limpian la bandeja y el número: ya los viste.
//
// Sin google-services.json (Firebase) el token no sale en Android: se
// ignora en silencio y la app sigue normal.
// =====================================================================
import { AppState, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { registrarDispositivo } from '@/src/features/hermes/api';

const CLAVE_DISPOSITIVO = 'motoflow.dispositivo_id';

// Con la app abierta el aviso también se enseña arriba.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

async function idDelDispositivo(): Promise<string> {
  try {
    const guardado = await AsyncStorage.getItem(CLAVE_DISPOSITIVO);
    if (guardado) return guardado;
  } catch { /* sin almacenamiento: se genera uno */ }
  const nuevo = `${Platform.OS}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  try { await AsyncStorage.setItem(CLAVE_DISPOSITIVO, nuevo); } catch { /* se regenera la próxima vez */ }
  return nuevo;
}

/** Pide permiso, saca el token y registra el teléfono. Nunca lanza. */
export async function registrarAvisos(): Promise<{ ok: boolean; motivo?: string }> {
  try {
    if (!Device.isDevice) return { ok: false, motivo: 'emulador' };
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('avisos', {
        name: 'Avisos de MotoFlow y Hermes',
        importance: Notifications.AndroidImportance.HIGH,
        showBadge: true,
        sound: 'default',
        vibrationPattern: [0, 200, 120, 200],
      });
    }
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') {
      ({ status } = await Notifications.requestPermissionsAsync());
    }
    if (status !== 'granted') return { ok: false, motivo: 'sin permiso' };

    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    if (!token) return { ok: false, motivo: 'sin token' };

    await registrarDispositivo({
      deviceId: await idDelDispositivo(),
      pushToken: token,
      plataforma: Platform.OS,
      appVersion: Constants.expoConfig?.version || '',
      modelo: Device.modelName || undefined,
    });
    return { ok: true };
  } catch (e: any) {
    console.log('[avisos] no se pudo registrar:', e?.message || e);
    return { ok: false, motivo: e?.message || 'error' };
  }
}

/** Al abrir la app: bandeja limpia y el número del ícono en cero. */
export async function limpiarAvisos() {
  try {
    await Notifications.dismissAllNotificationsAsync();
    await Notifications.setBadgeCountAsync(0);
  } catch { /* lanzadores que no soportan el número: nada que limpiar */ }
}

/**
 * Engancha todo: registra, limpia al volver a la app y abre la pantalla del
 * aviso al tocarlo. Devuelve la función para soltar los oyentes.
 */
export function engancharAvisos(abrir: (ruta: string) => void) {
  registrarAvisos();
  limpiarAvisos();
  const estado = AppState.addEventListener('change', (s) => { if (s === 'active') limpiarAvisos(); });
  const toque = Notifications.addNotificationResponseReceivedListener((r) => {
    const ruta = (r.notification.request.content.data as any)?.ruta;
    abrir(typeof ruta === 'string' && ruta.startsWith('/') ? ruta : '/(tabs)');
  });
  return () => {
    estado.remove();
    toque.remove();
  };
}
