import React, { createContext, useContext } from 'react';

const LayoutContext = createContext({
  sidebarOpen: true,
  setSidebarOpen: () => {},
});

export const LayoutProvider = ({ sidebarOpen, setSidebarOpen, children }) => (
  <LayoutContext.Provider value={{ sidebarOpen, setSidebarOpen }}>
    {children}
  </LayoutContext.Provider>
);

export const useLayout = () => useContext(LayoutContext);
