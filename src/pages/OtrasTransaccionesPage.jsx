import React, { useState } from 'react';
import { Helmet } from 'react-helmet';
import { usePanels } from '@/contexts/PanelContext';
import OtrasTransaccionesModal from '@/components/financiera/OtrasTransaccionesModal';

// Panel "Otras Transacciones": abre el modulo como ventana. Al cerrar (Salir
// o tras grabar) se cierra el panel y se vuelve al anterior.
const OtrasTransaccionesPage = () => {
  const { closePanel, activePanel } = usePanels();
  const [open, setOpen] = useState(true);

  const handleClose = () => {
    setOpen(false);
    closePanel(activePanel);
  };

  return (
    <div className="p-4">
      <Helmet><title>Otras Transacciones — Financiera</title></Helmet>
      <OtrasTransaccionesModal isOpen={open} onClose={handleClose} />
    </div>
  );
};

export default OtrasTransaccionesPage;
