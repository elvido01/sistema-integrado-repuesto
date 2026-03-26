import React, { useState, useEffect } from 'react';
import MotoFlowLogo from '@/components/common/MotoFlowLogo';
import { supabase } from '@/lib/customSupabaseClient';

const CONFIG_ID = '00000000-0000-0000-0000-000000000001';

// Cache the config so we don't fetch on every render
let cachedConfig = null;

/**
 * Logo — Wrapper del logo de MotoFlow para el sidebar/header.
 * Ahora muestra el logo de la PLATAFORMA (MotoFlow), no del tenant.
 */
const Logo = ({ size = 'default' }) => {
  const [config, setConfig] = useState(cachedConfig);

  useEffect(() => {
    if (cachedConfig) {
      setConfig(cachedConfig);
      return;
    }

    const fetchConfig = async () => {
      try {
        const { data } = await supabase
          .from('config_empresa')
          .select('nombre, logo_url')
          .eq('id', CONFIG_ID)
          .single();

        if (data) {
          cachedConfig = data;
          setConfig(data);
        }
      } catch (err) {
        console.error('[Logo] Error fetching config:', err);
      }
    };

    fetchConfig();
  }, []);

  const logoSize = size === 'large' ? 'lg' : 'md';

  return (
    <MotoFlowLogo 
      size={logoSize} 
      showText={true} 
      showSlogan={size === 'large'} 
    />
  );
};

export default Logo;