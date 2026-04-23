import React from 'react';
import { Helmet } from 'react-helmet';
import UpdateLocationForm from '@/components/inventory/UpdateLocationForm';
import { useAuth } from '@/contexts/SupabaseAuthContext';

const UpdateLocationPage = () => {
  const { empresa } = useAuth();
  return (
    <>
      <Helmet>
        <title>Actualizar Ubicación — {empresa?.nombre || 'Sistema'}</title>
        <meta name="description" content="Módulo para actualizar la ubicación de los productos en el inventario." />
      </Helmet>
      <div className="min-h-full bg-morla-gray-light flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <UpdateLocationForm />
        </div>
      </div>
    </>
  );
};

export default UpdateLocationPage;