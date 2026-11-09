// =====================================================================
// Campo de MONTO con comas de miles (08/11/2026)
// ---------------------------------------------------------------------
// Usa fmtMontoInput/parseMontoInput (lib/numberFormat) y además:
// · Una COMA tecleada es el punto decimal (teclado en español del
//   teléfono/tableta). Las comas de miles las pone el campo solo; antes
//   se borraba y "1500,50" quedaba 150,050.
// · El cursor se queda donde estaba al reformatear (antes saltaba al final
//   y lo que se tecleaba en medio caía en otro lugar).
// · Backspace/Suprimir sobre una coma de miles borra el dígito de al lado.
// · Pegar "1.500,00" (estilo europeo) se entiende como 1,500.00.
// onChange recibe el crudo sin comas ("1500.5"), como un <input> normal
// recibiría e.target.value: Number(valor) sigue funcionando.
// =====================================================================
import React, { forwardRef, useCallback, useLayoutEffect, useRef } from 'react';
import { fmtMontoInput, parseMontoInput } from '@/lib/numberFormat';

const cuantos = (s) => (s.match(/[\d.]/g) || []).length;

/** Texto pegado → texto con punto decimal. */
export function normalizarPegado(t) {
  const s = String(t).trim().replace(/[^\d.,]/g, '');
  // 1.500,00 · 1500,5 → coma decimal
  if (/,\d{1,2}$/.test(s) && (!s.includes('.') || s.lastIndexOf('.') < s.lastIndexOf(','))) {
    return s.replace(/\./g, '').replace(',', '.');
  }
  return s.replace(/,/g, '');
}

/** Lo tecleado manda mientras valga lo mismo que el valor de la pantalla. */
export function crudoAMostrar(tecleado, value) {
  return tecleado != null && Number(tecleado || 0) === Number(value || 0) ? tecleado : value;
}

/** Si lo último tecleado fue una coma (y aún no hay punto), es el decimal. */
export function comaTecleada(t, pos, antes) {
  if (t.length === antes.length + 1 && t[pos - 1] === ',' && !antes.includes('.')) {
    return `${t.slice(0, pos - 1)}.${t.slice(pos)}`;
  }
  return t;
}

// (09/11/2026) ref: la pantalla puede enfocar el campo (ej. Enter → monto).
// onKeyDown/onPaste de la pantalla se llaman DESPUÉS de los propios (antes,
// pasarlos borraba el manejo de las comas). as: el componente con que se
// dibuja (ej. el Input de la pantalla, para que conserve su estilo).
const MontoInput = forwardRef(function MontoInput({ value, onChange, className = '', as: Comp = 'input', onKeyDown, onPaste, ...props }, refExterno) {
  const ref = useRef(null);
  const ponerRef = useCallback((el) => {
    ref.current = el;
    if (typeof refExterno === 'function') refExterno(el);
    else if (refExterno) refExterno.current = el;
  }, [refExterno]);
  const digitosAntes = useRef(null);
  // Lo último tecleado ("100.", "100.50", ""). Si la pantalla guarda el monto
  // como NÚMERO (100), se sigue mostrando lo tecleado mientras valga lo
  // mismo: si no, el punto y los ceros de los centavos desaparecían al teclear.
  const tecleado = useRef(null);
  const mostrado = fmtMontoInput(crudoAMostrar(tecleado.current, value));

  // Después de reformatear, el cursor vuelve detrás del mismo dígito.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || digitosAntes.current == null || document.activeElement !== el) return;
    let n = digitosAntes.current; let pos = 0;
    while (pos < mostrado.length && n > 0) { if (/[\d.]/.test(mostrado[pos])) n -= 1; pos += 1; }
    el.setSelectionRange(pos, pos);
    digitosAntes.current = null;
  });

  const aplicar = (texto, cursor) => {
    digitosAntes.current = cuantos(texto.slice(0, cursor));
    const crudo = parseMontoInput(texto).replace(/^0+(?=\d)/, '');   // "05" → "5"
    tecleado.current = crudo;
    onChange(crudo);
  };

  const alCambiar = (e) => {
    const pos = e.target.selectionStart ?? e.target.value.length;
    aplicar(comaTecleada(e.target.value, pos, mostrado), pos);
  };

  const alTeclear = (e) => {
    const el = e.currentTarget;
    const a = el.selectionStart; const b = el.selectionEnd;
    if (a !== b || a == null) return;
    // Saltar la coma de miles para que se borre el dígito de al lado.
    if (e.key === 'Backspace' && el.value[a - 1] === ',') el.setSelectionRange(a - 1, a - 1);
    if (e.key === 'Delete' && el.value[a] === ',') el.setSelectionRange(a + 1, a + 1);
  };
  const teclaCompleta = (e) => { alTeclear(e); onKeyDown?.(e); };

  const alPegar = (e) => {
    const pegado = e.clipboardData?.getData('text');
    if (pegado == null) { onPaste?.(e); return; }
    e.preventDefault();
    const el = e.currentTarget;
    const a = el.selectionStart ?? el.value.length; const b = el.selectionEnd ?? a;
    const limpio = normalizarPegado(pegado);
    aplicar(el.value.slice(0, a) + limpio + el.value.slice(b), a + limpio.length);
    onPaste?.(e);
  };

  return (
    <Comp ref={ponerRef} className={className}
      {...props} type="text" inputMode="decimal" autoComplete="off"
      value={mostrado} onChange={alCambiar} onKeyDown={teclaCompleta} onPaste={alPegar} />
  );
});
export default MontoInput;
