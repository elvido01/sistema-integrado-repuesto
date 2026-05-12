import { useEffect } from 'react';
import { Slot, useRouter, useSegments, useRootNavigationState } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
import '../global.css';
import { supabase } from '@/src/supabase/client';
import { useAuthStore } from '@/src/store/useAuthStore';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

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
      <Slot />
      <StatusBar style="auto" />
    </QueryClientProvider>
  );
}
