import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { usePanels } from '@/contexts/PanelContext';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import HomePage from '@/pages/HomePage';

const PanelManager = () => {
  const { panels, activePanel, setActivePanel, closePanel } = usePanels();

  const getIcon = (panel) => {
    const Icon = panel.icon;
    return <Icon className="w-4 h-4 mr-2" />;
  };

  console.log("Panels:", panels, "Active:", activePanel);
  return (
    <div className="h-full flex flex-col bg-white dark:bg-gray-900">
      <div className="flex-shrink-0 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center space-x-1 p-1 bg-gray-100 dark:bg-gray-800">
          {panels.map((panel) => (
            <motion.div
              key={panel.id}
              layout
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              <Button
                variant="ghost"
                onClick={() => setActivePanel(panel.id)}
                className={cn(
                  'h-8 px-3 text-xs flex items-center',
                  activePanel === panel.id
                    ? 'bg-white dark:bg-gray-700 shadow-sm'
                    : 'hover:bg-gray-200 dark:hover:bg-gray-700'
                )}
              >
                {getIcon(panel)}
                {panel.name}
                {panel.id !== 'inicio' && (
                  <X
                    className="w-3 h-3 ml-2 text-gray-500 dark:text-gray-400 hover:text-red-500"
                    onClick={(e) => {
                      e.stopPropagation();
                      closePanel(panel.id);
                    }}
                  />
                )}
              </Button>
            </motion.div>
          ))}
        </div>
      </div>
      <div className="flex-grow relative overflow-hidden">
        {panels.map((panel) => {
          const PanelComponent = panel.component;
          const isActive = activePanel === panel.id;

          return (
            <div
              key={panel.id}
              className={cn(
                "absolute inset-0 w-full h-full p-4 overflow-auto transition-opacity duration-200 bg-white dark:bg-gray-900",
                isActive
                  ? "opacity-100 z-10 pointer-events-auto shadow-sm"
                  : "opacity-0 z-0 pointer-events-none"
              )}
            >
              <PanelComponent extraData={panel.extraData} panelId={panel.id} />
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default PanelManager;

