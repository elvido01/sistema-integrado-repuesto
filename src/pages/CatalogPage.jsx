
import React, { useState, useEffect } from 'react';
import CatalogManagementModal from '@/components/products/form/CatalogManagementModal';
import { usePanels } from '@/contexts/PanelContext';

const catalogConfig = {
    'tipos-producto': { title: 'Tipos de Producto', table: 'tipos_producto', columns: [{ accessor: 'nombre', header: 'Nombre', type: 'text' }] },
    'marcas': { title: 'Marcas', table: 'marcas', columns: [{ accessor: 'nombre', header: 'Nombre', type: 'text' }] },
    'modelos': { 
      title: 'Modelos', 
      table: 'modelos', 
      columns: [{ accessor: 'nombre', header: 'Nombre', type: 'text' }],
      // This will need to be adjusted to work without a selected brand
      extraData: { marca_id: null } 
    },
    'ubicaciones': { title: 'Ubicaciones', table: 'almacenes', columns: [{ accessor: 'codigo', header: 'Código', type: 'text' }, { accessor: 'nombre', header: 'Nombre', type: 'text' }] },
};

const CatalogPage = ({ catalogType }) => {
  const [isModalOpen, setIsModalOpen] = useState(true);
  const { closePanel } = usePanels();

  const config = catalogConfig[catalogType];

  const handleClose = () => {
    setIsModalOpen(false);
    // We need a slight delay to allow the modal to animate out before closing the panel
    setTimeout(() => {
        closePanel(catalogType);
    }, 300);
  };

  if (!config) {
    return <div>Error: Tipo de catálogo no válido.</div>;
  }

  return (
    <div className="fixed inset-0 bg-black/30 z-40">
      <CatalogManagementModal
        isOpen={isModalOpen}
        onClose={handleClose}
        config={config}
        onSaveSuccess={() => {}}
      />
    </div>
  );
};

export default CatalogPage;
