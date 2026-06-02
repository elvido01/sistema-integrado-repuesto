import React, { useState, useCallback, useRef } from 'react';
import { Plus, Trash2, Upload, Image as ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

// Format number with thousands separator (commas) and 2 decimal places
const formatNumber = (value) => {
  const num = parseFloat(value);
  if (isNaN(num)) return '0.00';
  return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const PresentationsTab = ({
  presentations,
  setPresentations,
  tiposPresentacion,
  onNotImplemented,
  itbisPct = 0.18,
  precio2DescuentoPct = 10,
  precio3DescuentoPct = 15,
}) => {
  // Track which field is currently focused so we show raw value for editing
  const [focusedField, setFocusedField] = useState(null);
  const taxRate = Number(itbisPct || 0);
  const minAutoMarginPct = 0;

  const p2Discount = Math.max(0, Math.min(100, parseFloat(precio2DescuentoPct) || 10));
  const p3Discount = Math.max(0, Math.min(100, parseFloat(precio3DescuentoPct) || 15));

  const calculatePrice = (costo, margenPct) => {
    const costoNum = parseFloat(costo) || 0;
    const margenNum = parseFloat(margenPct) || 0;
    return (costoNum * (1 + margenNum / 100)).toFixed(2);
  };

  const calculateMarkupFromGrossPrice = (grossPrice, costo) => {
    const precioNum = parseFloat(grossPrice) || 0;
    const costoNum = parseFloat(costo) || 0;
    if (costoNum <= 0) return 0;
    return ((precioNum / costoNum) - 1) * 100;
  };

  const calculatePriceMetrics = (grossPrice, costo, descuentoPct = 0) => {
    const costoNum = parseFloat(costo) || 0;
    const precioNum = parseFloat(grossPrice) || 0;
    const descuentoNum = parseFloat(descuentoPct) || 0;
    const precioNeto = precioNum * (1 - descuentoNum / 100);
    const utilidad = precioNeto - costoNum;
    const margenReal = precioNeto > 0 ? (utilidad / precioNeto) * 100 : 0;

    return { utilidad, margenReal };
  };

  const calculateProfitMetrics = (presentation) => (
    calculatePriceMetrics(presentation.precio1, presentation.costo, presentation.descuento_pct)
  );

  const isAutoPriceAllowed = (grossPrice, costo) => {
    if ((parseFloat(grossPrice) || 0) <= 0) return true;
    return calculatePriceMetrics(grossPrice, costo).margenReal >= minAutoMarginPct;
  };

  const getMarginTone = (margenReal) => {
    if (margenReal < 15) return 'text-red-700 bg-red-50 border-red-100';
    if (margenReal < 25) return 'text-amber-700 bg-amber-50 border-amber-100';
    return 'text-emerald-700 bg-emerald-50 border-emerald-100';
  };

  const calculateAutoPrices = (precio1, auto2, auto3) => {
    const p1 = parseFloat(precio1) || 0;
    return {
      precio2: auto2 ? (p1 * (1 - p2Discount / 100)).toFixed(2) : undefined,
      precio3: auto3 ? (p1 * (1 - p3Discount / 100)).toFixed(2) : undefined,
    };
  };

  const calculateFinalPrice = (precio1, descuentoPct) => {
    const precioNum = parseFloat(precio1) || 0;
    const descuentoNum = parseFloat(descuentoPct) || 0;
    return (precioNum * (1 - descuentoNum / 100)).toFixed(2);
  };

  const addPresentation = () => {
    const newPresentation = {
      id: `new-${Date.now()}`,
      tipo: 'UND - Unidad',
      cantidad: '1',
      costo: '0.00',
      margen_pct: '0',
      precio1: '0.00',
      precio2: '0.00',
      precio3: '0.00',
      auto_precio2: true,
      auto_precio3: true,
      descuento_pct: '0',
      precio_final: '0.00',
      afecta_ft: false,
      afecta_inv: false
    };
    setPresentations([...presentations, newPresentation]);
  };

  const removePresentation = (id) => {
    deletingRef.current = true;
    const toRemove = presentations.find(p => p.id === id);
    const remaining = presentations.filter(p => p.id !== id);

    // Si la presentación eliminada tenía afecta_ft o afecta_inv,
    // transferir al primero que quede
    if (remaining.length > 0) {
      if (toRemove?.afecta_ft && !remaining.some(p => p.afecta_ft)) {
        remaining[0] = { ...remaining[0], afecta_ft: true };
      }
      if (toRemove?.afecta_inv && !remaining.some(p => p.afecta_inv)) {
        remaining[0] = { ...remaining[0], afecta_inv: true };
      }
    }

    setPresentations(remaining);
  };

  // Ref para saltar el useEffect de sync después de borrar
  const deletingRef = useRef(false);

  React.useEffect(() => {
    // Saltar sync si acabamos de borrar una presentación
    if (deletingRef.current) {
      deletingRef.current = false;
      return;
    }

    // Ensure P2/P3 are calculated if they are 0 but auto is on
    const needsSync = presentations.some(p => {
      const precio1Num = parseFloat(p.precio1) || 0;
      const costoNum = parseFloat(p.costo) || 0;
      const autos = calculateAutoPrices(p.precio1, p.auto_precio2, p.auto_precio3);
      const p2NeedsValue = p.auto_precio2 && (parseFloat(p.precio2) === 0 || !p.precio2) && precio1Num > 0;
      const p3NeedsValue = p.auto_precio3 && (parseFloat(p.precio3) === 0 || !p.precio3) && precio1Num > 0;
      const p2Loses = p.auto_precio2 && precio1Num > 0 && !isAutoPriceAllowed(p.precio2, costoNum);
      const p3Loses = p.auto_precio3 && precio1Num > 0 && !isAutoPriceAllowed(p.precio3, costoNum);
      const p2OutOfSync = p.auto_precio2 && precio1Num > 0 && parseFloat(p.precio2) !== parseFloat(autos.precio2);
      const p3OutOfSync = p.auto_precio3 && precio1Num > 0 && parseFloat(p.precio3) !== parseFloat(autos.precio3);

      return p2NeedsValue || p3NeedsValue || p2Loses || p3Loses || p2OutOfSync || p3OutOfSync;
    });

    if (needsSync) {
      const synced = presentations.map(p => {
        const costoNum = parseFloat(p.costo) || 0;
        const precio1Num = parseFloat(p.precio1) || 0;

        const autos = calculateAutoPrices(p.precio1, p.auto_precio2, p.auto_precio3);
        const updated = { ...p };

        if (p.auto_precio2) {
          if (precio1Num > 0 && !isAutoPriceAllowed(autos.precio2, costoNum)) {
            updated.auto_precio2 = false;
            updated.precio2 = '0.00';
          } else {
            updated.precio2 = autos.precio2;
          }
        }

        if (p.auto_precio3) {
          if (precio1Num > 0 && !isAutoPriceAllowed(autos.precio3, costoNum)) {
            updated.auto_precio3 = false;
            updated.precio3 = '0.00';
          } else {
            updated.precio3 = autos.precio3;
          }
        }

        return updated;
      });
      setPresentations(synced);
    }
  }, [presentations, setPresentations]);

  // Get display value: formatted with commas when not focused, raw when focused
  const getDisplayValue = useCallback((presentationId, field, rawValue) => {
    if (focusedField === `${field}-${presentationId}`) {
      return rawValue; // Raw value while editing
    }
    // Formatted with commas when not editing
    const numericFields = ['costo', 'precio1', 'precio2', 'precio3', 'precio_final'];
    if (numericFields.includes(field)) {
      return formatNumber(rawValue);
    }
    return rawValue;
  }, [focusedField]);

  const handleFocus = useCallback((presentationId, field, e) => {
    setFocusedField(`${field}-${presentationId}`);
    // Select all text on focus for easy editing
    setTimeout(() => e.target.select(), 0);
  }, []);

  const handleBlur = useCallback((presentationId, field) => {
    setFocusedField(null);
    // Format to 2 decimal places on blur for numeric fields
    const numericFields = ['costo', 'precio1', 'precio2', 'precio3'];
    if (numericFields.includes(field)) {
      setPresentations(prev => prev.map(p => {
        if (p.id === presentationId) {
          const num = parseFloat(p[field]);
          const newP = { ...p, [field]: isNaN(num) ? '0.00' : num.toFixed(2) };

          // Enforce margin rules and below-cost rules on blur
          const costoNum = parseFloat(newP.costo) || 0;
          const precio1Num = parseFloat(newP.precio1) || 0;

          if (precio1Num > 0 && !isAutoPriceAllowed(newP.precio2, costoNum)) {
            newP.auto_precio2 = false;
            newP.precio2 = '0.00';
          }

          if (precio1Num > 0 && !isAutoPriceAllowed(newP.precio3, costoNum)) {
            newP.auto_precio3 = false;
            newP.precio3 = '0.00';
          }

          return newP;
        }
        return p;
      }));
    }
  }, [setPresentations]);

  const updatePresentation = (id, field, value) => {
    setPresentations(presentations.map(p => {
      if (p.id === id) {
        const updated = { ...p, [field]: value };

        // Logic for auto-calculations
        if (field === 'costo' || field === 'margen_pct') {
          updated.precio1 = calculatePrice(
            field === 'costo' ? value : updated.costo,
            field === 'margen_pct' ? value : updated.margen_pct
          );
        }

        if (field === 'precio1') {
          const costoNum = parseFloat(updated.costo) || 0;
          const precioNum = parseFloat(value) || 0;
          if (costoNum > 0) {
            updated.margen_pct = calculateMarkupFromGrossPrice(precioNum, costoNum).toFixed(2);
          }
        }

        // Do NOT apply toFixed(2) during typing — only on blur
        // This prevents cursor jumping

        const costoNum = parseFloat(updated.costo) || 0;
        const precio1Num = parseFloat(updated.precio1) || 0;

        // Force temp calculation to check conditions mathematically
        const p2Calc = (precio1Num * (1 - p2Discount / 100)).toFixed(2);
        const p3Calc = (precio1Num * (1 - p3Discount / 100)).toFixed(2);

        // Auto-restore flags if they were disabled (0.00) and now comply, when changing base values
        if (field === 'precio1' || field === 'costo' || field === 'margen_pct') {
          if (!updated.auto_precio2 && (parseFloat(updated.precio2) === 0 || !updated.precio2) && precio1Num > 0 && isAutoPriceAllowed(p2Calc, costoNum)) {
            updated.auto_precio2 = true;
          }
          if (!updated.auto_precio3 && (parseFloat(updated.precio3) === 0 || !updated.precio3) && precio1Num > 0 && isAutoPriceAllowed(p3Calc, costoNum)) {
            updated.auto_precio3 = true;
          }
        }

        // Keep manual check intent
        if (field === 'auto_precio2' && value === true) updated.auto_precio2 = true;
        if (field === 'auto_precio3' && value === true) updated.auto_precio3 = true;

        if (updated.auto_precio2) {
          if (precio1Num > 0 && !isAutoPriceAllowed(p2Calc, costoNum)) {
            updated.auto_precio2 = false;
            updated.precio2 = '0.00';
          } else {
            updated.precio2 = p2Calc;
          }
        }

        if (updated.auto_precio3) {
          if (precio1Num > 0 && !isAutoPriceAllowed(p3Calc, costoNum)) {
            updated.auto_precio3 = false;
            updated.precio3 = '0.00';
          } else {
            updated.precio3 = p3Calc;
          }
        }

        updated.precio_final = calculateFinalPrice(updated.precio1, updated.descuento_pct);

        return updated;
      }

      // --- afecta_ft y afecta_inv como radio buttons ---
      // Si estamos activando F o I en una presentación, desactivar en las demás
      if (field === 'afecta_ft' && value === true) {
        return { ...p, afecta_ft: false };
      }
      if (field === 'afecta_inv' && value === true) {
        return { ...p, afecta_inv: false };
      }

      return p;
    }));
  };

  const handleKeyDown = (e, nextId) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const nextElement = document.getElementById(nextId);
      if (nextElement) {
        nextElement.focus();
        if (nextElement.select) nextElement.select();
      }
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center bg-gray-50 p-2 border rounded-t-md">
        <h3 className="text-[11px] font-bold text-gray-700 uppercase tracking-wider flex items-center gap-2">
          <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
          Precios y Presentaciones
        </h3>
        <Button
          size="sm"
          variant="outline"
          onDoubleClick={addPresentation}
          title="Doble clic para agregar nueva presentación"
          className="h-7 text-[10px] font-bold uppercase bg-white border-blue-200 text-blue-700 hover:bg-blue-50 transition-colors shadow-sm"
        >
          <Plus className="w-3.5 h-3.5 mr-1" />
          Nueva Presentación
        </Button>
      </div>

      <div className="border border-gray-300 rounded-b-md shadow-sm overflow-x-auto">
        <Table className="w-full border-collapse">
          <TableHeader>
            <TableRow className="bg-blue-100/50 hover:bg-blue-100/50 border-b border-gray-300">
              <TableHead className="h-8 text-[10px] font-bold text-blue-900 uppercase px-2 w-[120px]">Tipo/Unidad</TableHead>
              <TableHead className="h-8 text-[10px] font-bold text-blue-900 uppercase px-2 w-[50px] text-right">Cant.</TableHead>
              <TableHead className="h-8 text-[10px] font-bold text-blue-900 uppercase px-2 w-[80px] text-right">Costo</TableHead>
              <TableHead className="h-8 text-[10px] font-bold text-blue-900 uppercase px-2 w-[50px] text-right" title="Aumento sobre el costo usado para calcular P1">% Mar.</TableHead>
              <TableHead className="h-8 text-[10px] font-bold text-blue-900 uppercase px-2 w-[60px] text-right">% Desc.</TableHead>
              <TableHead className="h-8 text-[10px] font-bold text-blue-900 uppercase px-2 w-40 text-center">Precios de Lista (1, 2, 3)</TableHead>
              <TableHead className="h-8 text-[10px] font-bold text-blue-900 uppercase px-2 w-24 text-right">P. Final (P1)</TableHead>
              <TableHead className="h-8 text-[10px] font-bold text-blue-900 uppercase px-2 w-28 text-right" title="Utilidad y margen sobre el precio antes de ITBIS">Ganancia Real</TableHead>
              <TableHead className="h-8 text-[10px] font-bold text-blue-900 uppercase px-2 w-8 text-center">F</TableHead>
              <TableHead className="h-8 text-[10px] font-bold text-blue-900 uppercase px-2 w-8 text-center">I</TableHead>
              <TableHead className="h-8 text-[10px] font-bold text-blue-900 uppercase px-2 w-8 text-center"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {presentations.map((presentation) => {
              const profitMetrics = calculateProfitMetrics(presentation);
              const p2Metrics = calculatePriceMetrics(presentation.precio2, presentation.costo);
              const p3Metrics = calculatePriceMetrics(presentation.precio3, presentation.costo);
              const p2HasPrice = (parseFloat(presentation.precio2) || 0) > 0;
              const p3HasPrice = (parseFloat(presentation.precio3) || 0) > 0;
              const p2Loses = p2HasPrice && p2Metrics.utilidad < 0;
              const p3Loses = p3HasPrice && p3Metrics.utilidad < 0;

              return (
              <TableRow key={presentation.id} className="h-auto hover:bg-gray-50/50 border-b border-gray-200">
                <TableCell className="p-1 align-top pt-2">
                  <Select
                    value={presentation.tipo}
                    onValueChange={(value) => updatePresentation(presentation.id, 'tipo', value)}
                  >
                    <SelectTrigger className="h-6 text-[11px] bg-white border-gray-200 focus:ring-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(!tiposPresentacion || tiposPresentacion.length === 0) ? (
                        <>
                          <SelectItem value="UND - Unidad" className="text-xs">UND - Unidad</SelectItem>
                          <SelectItem value="CJA - Caja" className="text-xs">CJA - Caja</SelectItem>
                          <SelectItem value="DOC - Docena" className="text-xs">DOC - Docena</SelectItem>
                          <SelectItem value="PAR - Par" className="text-xs">PAR - Par</SelectItem>
                        </>
                      ) : (
                        tiposPresentacion.map(tp => (
                          <SelectItem key={tp.id} value={tp.nombre} className="text-xs">{tp.nombre}</SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell className="p-1 align-top pt-2">
                  <Input
                    id={`cant-${presentation.id}`}
                    type="text"
                    value={presentation.cantidad}
                    onChange={(e) => updatePresentation(presentation.id, 'cantidad', e.target.value)}
                    onKeyDown={(e) => handleKeyDown(e, `costo-${presentation.id}`)}
                    className="h-6 text-[11px] text-right bg-white border-gray-200 px-1 focus:ring-0"
                  />
                </TableCell>
                <TableCell className="p-1 align-top pt-2">
                  <Input
                    id={`costo-${presentation.id}`}
                    type="text"
                    value={getDisplayValue(presentation.id, 'costo', presentation.costo)}
                    onChange={(e) => updatePresentation(presentation.id, 'costo', e.target.value)}
                    onFocus={(e) => handleFocus(presentation.id, 'costo', e)}
                    onBlur={() => handleBlur(presentation.id, 'costo')}
                    onKeyDown={(e) => handleKeyDown(e, `margen-${presentation.id}`)}
                    className="h-6 text-[11px] text-right bg-blue-50/30 border-gray-200 px-1 font-medium focus:ring-0"
                  />
                </TableCell>
                <TableCell className="p-1 align-top pt-2">
                  <Input
                    id={`margen-${presentation.id}`}
                    type="text"
                    value={presentation.margen_pct}
                    onChange={(e) => updatePresentation(presentation.id, 'margen_pct', e.target.value)}
                    onKeyDown={(e) => handleKeyDown(e, `desc-${presentation.id}`)}
                    className="h-6 text-[11px] text-right bg-white border-gray-200 px-1 focus:ring-0"
                  />
                </TableCell>
                <TableCell className="p-1 align-top pt-2">
                  <Input
                    id={`desc-${presentation.id}`}
                    type="text"
                    value={presentation.descuento_pct}
                    onChange={(e) => updatePresentation(presentation.id, 'descuento_pct', e.target.value)}
                    onKeyDown={(e) => handleKeyDown(e, `precio1-${presentation.id}`)}
                    className="h-6 text-[11px] text-right bg-white border-gray-200 px-1 focus:ring-0"
                  />
                </TableCell>

                {/* COLUMNA DE PRECIOS STACKED */}
                <TableCell className="p-1">
                  <div className="flex flex-col gap-1 w-full">
                    <div className="flex items-center gap-1 group">
                      <span className="text-[9px] font-bold text-gray-400 w-4">P1</span>
                      <Input
                        id={`precio1-${presentation.id}`}
                        type="text"
                        value={getDisplayValue(presentation.id, 'precio1', presentation.precio1)}
                        onChange={(e) => updatePresentation(presentation.id, 'precio1', e.target.value)}
                        onFocus={(e) => handleFocus(presentation.id, 'precio1', e)}
                        onBlur={() => handleBlur(presentation.id, 'precio1')}
                        onKeyDown={(e) => handleKeyDown(e, 'btn-grabar-producto')}
                        className="h-6 text-[11px] text-right bg-green-50/20 border-green-100 text-green-700 font-bold px-1 focus:ring-0 flex-grow"
                      />
                      <div className="w-4" />
                    </div>

                    <div className="flex items-center gap-1 group">
                      <span className="text-[9px] font-bold text-gray-400 w-4">P2</span>
                      <div className="flex-grow">
                        <Input
                          type="text"
                          disabled={presentation.auto_precio2}
                          value={getDisplayValue(presentation.id, 'precio2', presentation.precio2)}
                          onChange={(e) => updatePresentation(presentation.id, 'precio2', e.target.value)}
                          onFocus={(e) => handleFocus(presentation.id, 'precio2', e)}
                          onBlur={() => handleBlur(presentation.id, 'precio2')}
                          className={`h-6 text-[11px] text-right bg-white px-1 focus:ring-0 font-semibold ${p2Loses ? 'border-red-200 text-red-700 bg-red-50/70' : 'border-gray-200 text-black'} ${presentation.auto_precio2 ? 'bg-gray-50/50' : ''}`}
                          title={p2HasPrice ? `Utilidad P2: ${formatNumber(p2Metrics.utilidad)} | Margen: ${p2Metrics.margenReal.toFixed(2)}%` : ''}
                        />
                        {p2HasPrice && (
                          <div className={`text-[9px] leading-none mt-0.5 text-right font-bold ${p2Loses ? 'text-red-600' : 'text-emerald-600'}`}>
                            {formatNumber(p2Metrics.utilidad)} | {p2Metrics.margenReal.toFixed(2)}%
                          </div>
                        )}
                      </div>
                      <Checkbox
                        checked={presentation.auto_precio2}
                        onCheckedChange={(val) => updatePresentation(presentation.id, 'auto_precio2', val)}
                        className="h-3.5 w-3.5"
                      />
                    </div>

                    <div className="flex items-center gap-1 group">
                      <span className="text-[9px] font-bold text-gray-400 w-4">P3</span>
                      <div className="flex-grow">
                        <Input
                          type="text"
                          disabled={presentation.auto_precio3}
                          value={getDisplayValue(presentation.id, 'precio3', presentation.precio3)}
                          onChange={(e) => updatePresentation(presentation.id, 'precio3', e.target.value)}
                          onFocus={(e) => handleFocus(presentation.id, 'precio3', e)}
                          onBlur={() => handleBlur(presentation.id, 'precio3')}
                          className={`h-6 text-[11px] text-right bg-white px-1 focus:ring-0 font-semibold ${p3Loses ? 'border-red-200 text-red-700 bg-red-50/70' : 'border-gray-200 text-black'} ${presentation.auto_precio3 ? 'bg-gray-50/50' : ''}`}
                          title={p3HasPrice ? `Utilidad P3: ${formatNumber(p3Metrics.utilidad)} | Margen: ${p3Metrics.margenReal.toFixed(2)}%` : ''}
                        />
                        {p3HasPrice && (
                          <div className={`text-[9px] leading-none mt-0.5 text-right font-bold ${p3Loses ? 'text-red-600' : 'text-emerald-600'}`}>
                            {formatNumber(p3Metrics.utilidad)} | {p3Metrics.margenReal.toFixed(2)}%
                          </div>
                        )}
                      </div>
                      <Checkbox
                        checked={presentation.auto_precio3}
                        onCheckedChange={(val) => updatePresentation(presentation.id, 'auto_precio3', val)}
                        className="h-3.5 w-3.5"
                      />
                    </div>
                  </div>
                </TableCell>

                <TableCell className="p-1 align-top pt-2">
                  <div className="h-6 flex items-center justify-end px-2 bg-gray-50 border border-gray-200 rounded text-[11px] font-bold text-gray-700">
                    {formatNumber(presentation.precio_final)}
                  </div>
                </TableCell>
                <TableCell className="p-1 align-top pt-2">
                  <div
                    className={`min-h-6 flex flex-col items-end justify-center px-2 py-0.5 border rounded text-[10px] font-bold leading-tight ${getMarginTone(profitMetrics.margenReal)}`}
                    title="Calculado como: precio final antes de ITBIS - costo. El porcentaje es utilidad / precio final antes de ITBIS."
                  >
                    <span>{formatNumber(profitMetrics.utilidad)}</span>
                    <span className="text-[9px] opacity-80">{profitMetrics.margenReal.toFixed(2)}%</span>
                  </div>
                </TableCell>
                <TableCell className="p-1 text-center align-top pt-3">
                  <Checkbox
                    checked={presentation.afecta_ft}
                    onCheckedChange={(checked) => updatePresentation(presentation.id, 'afecta_ft', checked)}
                    className="h-3.5 w-3.5"
                  />
                </TableCell>
                <TableCell className="p-1 text-center align-top pt-3">
                  <Checkbox
                    checked={presentation.afecta_inv}
                    onCheckedChange={(checked) => updatePresentation(presentation.id, 'afecta_inv', checked)}
                    className="h-3.5 w-3.5"
                  />
                </TableCell>
                <TableCell className="p-1 text-center align-top pt-2">
                  {presentations.length > 1 && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => removePresentation(presentation.id)}
                      className="h-6 w-6 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </TableCell>
              </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <div className="grid grid-cols-2 gap-4 mt-2">
        <div className="text-[10px] text-gray-500 bg-gray-50 border border-gray-200 p-2 rounded flex flex-col justify-center">
          <p className="font-bold text-gray-600 mb-1 uppercase tracking-tighter text-[9px]">Leyenda: <strong>F:</strong> Fac. POS | <strong>I:</strong> Inv. | % Mar.: aumento sobre costo | Ganancia real: utilidad antes de gastos</p>
        </div>
        <div className="text-[10px] text-blue-700 bg-blue-50 border border-blue-100 p-2 rounded flex items-center gap-2">
          <Upload className="w-4 h-4 opacity-50 flex-shrink-0" />
          <p className="leading-tight">
            Use el cotejo para activar cálculo automático: <strong>P2 (-{p2Discount}%)</strong> y <strong>P3 (-{p3Discount}%)</strong> basado en P1.
          </p>
        </div>
      </div>
    </div>
  );
};

export default PresentationsTab;

