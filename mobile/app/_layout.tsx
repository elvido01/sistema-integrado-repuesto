import { useEffect } from 'react';
import { Slot, useRouter, useSegments, useRootNavigationState } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
import '../global.css';
import { supabase } from '@/src/supabase/client';
import { useAuthStore } from '@/src/store/useAuthStore';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import BloqueoSuscripcion from '@/src/components/BloqueoSuscripcion';
import { GuiaMovilProvider } from '@/src/guias/GuiaMovil';
import { engancharAvisos } from '@/src/services/pushAvisos';

const queryClient = new QueryClient();

export default function RootLayout() {
  const { session, setSession } = useAuthStore();
  const segments = useSegments();
  const router = useRouter();
  const rootNavigationState = useRootNavigationState();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });
  }, []);

  // (21/11/2026) Avisos al teléfono: con sesión se registra el teléfono para
  // recibir lo de Hermes y la campanita (con el número en el ícono).
  useEffect(() => {
    if (!session?.user?.id) return undefined;
    return engancharAvisos((ruta) => router.push(ruta as any));
  }, [session?.user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    console.log('Navegación lista:', !!rootNavigationState?.key);
    console.log('Sesión actual:', !!session);
    console.log('Segmento actual:', segments[0]);

    if (!rootNavigationState?.key) return; // Wait for navigation to be ready

    setTimeout(() => {
      const inAuthGroup = segments[0] === '(auth)';
      
      if (!session && !inAuthGroup) {
        console.log('Redirigiendo a Login');
        router.replace('/(auth)/login');
      } else if (session && inAuthGroup) {
        console.log('Redirigiendo a Tabs');
        router.replace('/(tabs)');
      }
    }, 0);
  }, [session, segments, rootNavigationState?.key]);

  return (
    <QueryClientProvider client={queryClient}>
      {/* (20/11/2026) Guías de la app: el motor dibuja encima de cualquier pantalla. */}
      {/* (19/11/2026) Suscripción vencida o empresa en pausa: tapa todo, también la guía. */}
      <GuiaMovilProvider encima={session && segments[0] !== '(auth)' && (segments[0] as string) !== 'eliminar-cuenta' ? <BloqueoSuscripcion /> : null}>
        <Slot />
      </GuiaMovilProvider>
      <StatusBar style="auto" />
    </QueryClientProvider>
  );
}
