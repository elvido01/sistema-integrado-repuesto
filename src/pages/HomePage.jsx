import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Helmet } from 'react-helmet';
import { AlertTriangle, TrendingUp, Users, Package, Loader2 } from 'lucide-react';
import Logo from '@/components/common/Logo';
import SummaryCard from '@/components/common/SummaryCard';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';

const HomePage = () => {
  const { toast } = useToast();
  const [stats, setStats] = useState({
    stockBajo: 0,
    ventasHoy: 0,
    clientesActivos: 0,
    productosTotal: 0
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase.rpc('get_stats_dashboard');

        if (error) {
          throw error;
        }

        if (data) {
          setStats(data);
        }
      } catch (error) {
        console.error('Error fetching stats:', error);
        toast({
          variant: "destructive",
          title: "Error al cargar estadísticas",
          description: "No se pudieron obtener los datos del dashboard."
        });
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, [toast]);

  return (
    <>
      <Helmet>
        <title>Inicio - Repuestos Morla</title>
        <meta name="description" content="Dashboard principal del Sistema Integrado de Información Financiera de Repuestos Morla." />
      </Helmet>
      
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="space-y-8"
      >
        <div className="flex flex-col items-center justify-center py-12">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.2, duration: 0.5 }}
            className="mb-6"
          >
            <Logo size="large" />
          </motion.div>
          
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.4, duration: 0.5 }}
            className="text-right"
          >
            <h2 className="text-lg font-light text-gray-600 tracking-wider" style={{ fontVariant: 'small-caps' }}>
              Sistema Integrado de Información Financiera
            </h2>
          </motion.div>
        </div>

        {loading ? (
          <div className="flex justify-center items-center py-10">
            <Loader2 className="w-8 h-8 animate-spin text-morla-blue" />
            <span className="ml-3 text-gray-600">Cargando estadísticas...</span>
          </div>
        ) : (
          <motion.div
            initial={{ y: 30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.6, duration: 0.5 }}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6"
          >
            <SummaryCard
              title="Inventario Bajo"
              value={stats.stockBajo}
              icon={AlertTriangle}
              color="red"
              description="productos con stock crítico"
            />
            <SummaryCard
              title="Ventas del Día"
              value={`$${stats.ventasHoy.toLocaleString('es-DO', { minimumFractionDigits: 2 })}`}
              icon={TrendingUp}
              color="green"
              description="ingresos de hoy"
            />
            <SummaryCard
              title="Clientes Activos"
              value={stats.clientesActivos}
              icon={Users}
              color="blue"
              description="clientes registrados"
            />
            <SummaryCard
              title="Total Productos"
              value={stats.productosTotal}
              icon={Package}
              color="purple"
              description="productos en catálogo"
            />
          </motion.div>
        )}
      </motion.div>
    </>
  );
};

export default HomePage;