import React, { useEffect, useMemo, useState } from 'react';
import { Tabs } from 'expo-router';
import { Barcode, Boxes, ClipboardList, FileText, Home, List, ListOrdered, MapPin, Menu, Printer, Receipt, Settings, ShoppingCart } from 'lucide-react-native';
import { useAuthStore } from '@/src/store/useAuthStore';
import { canAccessModule } from '@/src/services/permissions';
import { DEFAULT_QUICK_ACCESS, QUICK_ACCESS_OPTIONS, getQuickAccessTabs, subscribeQuickAccess } from '@/src/services/quickAccess';

type TabName =
  | 'index'
  | 'scanner'
  | 'catalogo'
  | 'pos'
  | 'cotizaciones'
  | 'pedidos'
  | 'recibo-ingreso'
  | 'recibo-pago-financiera'
  | 'solicitudes'
  | 'orden-compra'
  | 'ubicacion'
  | 'existencia'
  | 'impresora'
  | 'configuracion';
type TabConfig = {
  title: string;
  icon: React.ComponentType<{ color?: string; size?: number }>;
  moduleKey?: string;
};

const TAB_CONFIG: Record<TabName, TabConfig> = {
  index: {
    title: 'Inicio',
    icon: Home,
  },
  scanner: {
    title: 'Scanner',
    icon: Barcode,
    moduleKey: 'scanner',
  },
  catalogo: {
    title: 'Catalogo',
    icon: List,
    moduleKey: 'catalogo',
  },
  pos: {
    title: 'Venta',
    icon: ShoppingCart,
    moduleKey: 'ventas',
  },
  cotizaciones: {
    title: 'Cotizaciones',
    icon: FileText,
    moduleKey: 'cotizaciones',
  },
  pedidos: {
    title: 'Pedidos',
    icon: ListOrdered,
    moduleKey: 'pedidos',
  },
  'recibo-ingreso': {
    title: 'Recibo',
    icon: Receipt,
    moduleKey: 'recibo-ingreso',
  },
  'recibo-pago-financiera': {
    title: 'Pago',
    icon: Receipt,
    moduleKey: 'recibo-ingreso',
  },
  solicitudes: {
    title: 'Solicitudes',
    icon: ClipboardList,
    moduleKey: 'solicitudes-compras',
  },
  'orden-compra': {
    title: 'Orden',
    icon: FileText,
    moduleKey: 'orden-compra',
  },
  ubicacion: {
    title: 'Ubicacion',
    icon: MapPin,
    moduleKey: 'actualizar-ubicacion',
  },
  existencia: {
    title: 'Existencia',
    icon: Boxes,
    moduleKey: 'actualizar-existencia',
  },
  impresora: {
    title: 'Impresora',
    icon: Printer,
    moduleKey: 'impresora-bluetooth',
  },
  configuracion: {
    title: 'Config',
    icon: Settings,
    moduleKey: 'configuracion',
  },
};

export default function TabLayout() {
  const { user, profile, permissions } = useAuthStore();
  const [quickTabs, setQuickTabs] = useState(DEFAULT_QUICK_ACCESS);
  const visibleQuickTabs = useMemo(
    () =>
      quickTabs.filter((name) => {
        const config = TAB_CONFIG[name as TabName];
        if (!config) return false;
        return !config.moduleKey || canAccessModule(profile, permissions, config.moduleKey);
      }),
    [permissions, profile, quickTabs]
  );
  const hiddenQuickTabs = QUICK_ACCESS_OPTIONS
    .map((option) => option.name)
    .filter((name) => !visibleQuickTabs.includes(name));

  useEffect(() => {
    let mounted = true;
    getQuickAccessTabs(user?.id).then((tabs) => {
      if (mounted) setQuickTabs(tabs);
    });
    const unsubscribe = subscribeQuickAccess((tabs) => setQuickTabs(tabs));
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [user?.id]);

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#1d4ed8',
        tabBarInactiveTintColor: '#6b7280',
        tabBarStyle: {
          borderTopWidth: 1,
          borderTopColor: '#e5e7eb',
          paddingTop: 8,
        },
        headerStyle: {
          backgroundColor: '#1d4ed8',
        },
        headerTintColor: '#fff',
        headerTitleStyle: {
          fontWeight: 'bold',
        },
      }}>
      {visibleQuickTabs.map((name) => {
        const config = TAB_CONFIG[name as TabName];
        const Icon = config.icon;
        return (
          <Tabs.Screen
            key={name}
            name={name}
            options={{
              title: config.title,
              tabBarIcon: ({ color }) => <Icon color={color} size={24} />,
            }}
          />
        );
      })}
      {hiddenQuickTabs.map((name) => (
        <Tabs.Screen
          key={name}
          name={name}
          options={{
            href: null,
            title: TAB_CONFIG[name as TabName]?.title || name,
          }}
        />
      ))}
      <Tabs.Screen
        name="mas"
        options={{
          title: 'Mas',
          tabBarIcon: ({ color }) => <Menu color={color} size={24} />,
        }}
      />
    </Tabs>
  );
}
