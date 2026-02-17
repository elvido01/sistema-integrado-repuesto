import React, { createContext, useState, useContext } from 'react';

const ComprasContext = createContext();

export const ComprasProvider = ({ children }) => {
    const [ordenParaFacturar, setOrdenParaFacturar] = useState(null);

    const value = {
        ordenParaFacturar,
        setOrdenParaFacturar,
    };

    return (
        <ComprasContext.Provider value={value}>
            {children}
        </ComprasContext.Provider>
    );
};

export const useCompras = () => {
    const context = useContext(ComprasContext);
    if (!context) {
        throw new Error('useCompras must be used within a ComprasProvider');
    }
    return context;
};
