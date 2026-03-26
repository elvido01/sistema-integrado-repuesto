import { useCallback } from 'react';
import { useToast } from '@/components/ui/use-toast';
import { useSuscripcion } from '@/contexts/SuscripcionContext';

/**
 * useSuscripcionGuard
 * 
 * Hook that provides a `guard` function to wrap any action
 * that should be blocked when the subscription is expired.
 * 
 * Usage:
 * ```
 * const { guard } = useSuscripcionGuard();
 * 
 * const handleSave = guard(async () => {
 *   // This only runs if subscription is active
 *   await supabase.from('productos').insert(data);
 * });
 * 
 * // Or with feature-specific check:
 * const handleOCR = guard(async () => {
 *   await processOCR(file);
 * }, 'ocr_facturas');
 * ```
 */
export const useSuscripcionGuard = () => {
  const { toast } = useToast();
  const { validarAccion } = useSuscripcion();

  /**
   * Wraps an action function with subscription validation.
   * If subscription is invalid, shows a toast and blocks the action.
   * 
   * @param {Function} action - The action to execute if allowed
   * @param {string} tipo - Optional feature type to check (e.g. 'ocr_facturas')
   * @returns {Function} Guarded action function
   */
  const guard = useCallback((action, tipo = 'general') => {
    return async (...args) => {
      const { allowed, reason } = validarAccion(tipo);

      if (!allowed) {
        toast({
          variant: 'destructive',
          title: '🔒 Acción Bloqueada',
          description: reason || 'Su suscripción no permite esta acción.',
        });
        return null;
      }

      return action(...args);
    };
  }, [validarAccion, toast]);

  /**
   * Simple check without executing an action.
   * Returns true if the action is allowed.
   */
  const canExecute = useCallback((tipo = 'general') => {
    const { allowed } = validarAccion(tipo);
    return allowed;
  }, [validarAccion]);

  return { guard, canExecute };
};
