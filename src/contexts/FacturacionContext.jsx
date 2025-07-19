
    import React, { createContext, useState, useContext } from 'react';

const FacturacionContext = createContext();

export const FacturacionProvider = ({ children }) => {
  const [pedidoParaFacturar, setPedidoParaFacturar] = useState(null);

  const value = {
    pedidoParaFacturar,
    setPedidoParaFacturar,
  };

  return (
    <FacturacionContext.Provider value={value}>
      {children}
    </FacturacionContext.Provider>
  );
};

export const useFacturacion = () => {
  const context = useContext(FacturacionContext);
  if (!context) {
    throw new Error('useFacturacion must be used within a FacturacionProvider');
  }
  return context;
};
  