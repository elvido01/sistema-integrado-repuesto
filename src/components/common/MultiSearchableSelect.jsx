import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';

export default function MultiSearchableSelect({
  label = '',
  placeholder = 'Selecciona...',
  options = [],
  value = [], // An array of selected values
  onChange = () => {},
  className = '',
  disabled = false,
  clearable = true,
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [focusIndex, setFocusIndex] = useState(-1);

  const rootRef = useRef(null);
  const buttonRef = useRef(null);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  const list = useMemo(() => options ?? [], [options]);

  // Handle value being undefined/null gracefully
  const selectedValues = useMemo(() => Array.isArray(value) ? value : [], [value]);

  const selectedOptions = useMemo(
    () => list.filter((o) => selectedValues.some(v => String(v) === String(o.value))),
    [list, selectedValues]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter((o) => (o.label ?? '').toLowerCase().includes(q));
  }, [list, query]);

  const openMenu = useCallback(() => {
    if (disabled) return;
    setOpen(true);
    setFocusIndex(-1);
    setTimeout(() => inputRef.current?.focus(), 0);
  }, [disabled]);

  const closeMenu = useCallback(() => {
    setOpen(false);
    setQuery('');
    setFocusIndex(-1);
    setTimeout(() => buttonRef.current?.focus(), 0);
  }, []);

  const toggleSelectByIndex = useCallback((idx) => {
    const item = filtered[idx];
    if (!item) return;
    
    const stringVal = String(item.value);
    const isSelected = selectedValues.some(v => String(v) === stringVal);
    
    let newValues;
    if (isSelected) {
      newValues = selectedValues.filter(v => String(v) !== stringVal);
    } else {
      newValues = [...selectedValues, item.value];
    }
    
    onChange(newValues);
    // Do not close menu on select so user can select multiple
  }, [filtered, onChange, selectedValues]);

  const onButtonKeyDown = (e) => {
    if (disabled) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      open ? closeMenu() : openMenu();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!open) openMenu();
      setFocusIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) openMenu();
      setFocusIndex((i) => Math.max(i - 1, 0));
    }
  };

  const onInputKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeMenu();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (focusIndex >= 0) toggleSelectByIndex(focusIndex);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setFocusIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setFocusIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Home') {
      e.preventDefault();
      setFocusIndex(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      setFocusIndex(filtered.length - 1);
    } else if (e.key === 'Tab') {
      closeMenu();
    }
  };

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e) => {
      if (!rootRef.current?.contains(e.target)) closeMenu();
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open, closeMenu]);

  // Scroll to active item
  useEffect(() => {
    if (!open || focusIndex < 0 || !listRef.current) return;
    const el = listRef.current.children[focusIndex];
    el?.scrollIntoView({ block: 'nearest' });
  }, [open, focusIndex]);

  const displayText = selectedOptions.length === 0 
    ? placeholder 
    : selectedOptions.map(o => o.label).join(', ');

  return (
    <div className={`relative ${className}`} ref={rootRef}>
      {label ? <span className="sr-only">{label}</span> : null}

      {/* Button/Display */}
      <button
        type="button"
        ref={buttonRef}
        className={`w-full inline-flex items-center justify-between h-9 rounded-md border px-3 text-left bg-white dark:bg-neutral-900
          ${disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}
        `}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => (open ? closeMenu() : openMenu())}
        onKeyDown={onButtonKeyDown}
        disabled={disabled}
      >
        <span className={`truncate ${selectedOptions.length > 0 ? '' : 'text-neutral-400'}`} title={displayText}>
          {displayText}
        </span>

        {/* Clear / caret */}
        <span className="ml-2 flex items-center gap-1 shrink-0">
          {clearable && selectedOptions.length > 0 ? (
            <span
              role="button"
              tabIndex={0}
              className="text-neutral-400 hover:text-neutral-700"
              title="Limpiar"
              onClick={(e) => {
                e.stopPropagation();
                onChange([]);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  e.stopPropagation();
                  onChange([]);
                }
              }}
            >
              ×
            </span>
          ) : null}
          <svg
            width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"
            className={`transition-transform ${open ? 'rotate-180' : ''}`}
          >
            <path d="M7 10l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="2" />
          </svg>
        </span>
      </button>

      {/* Dropdown */}
      {open && (
        <div
          className="absolute z-50 mt-1 w-full rounded-md border bg-white dark:bg-neutral-900 shadow-lg"
          role="dialog"
        >
          {/* Search input */}
          <div className="p-2 border-b">
            <input
              ref={inputRef}
              type="text"
              placeholder={`Buscar${label ? ` ${label.toLowerCase()}` : ''}...`}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setFocusIndex(-1);
              }}
              onKeyDown={onInputKeyDown}
              className="w-full h-9 rounded-md border px-2 bg-white dark:bg-neutral-900 text-sm"
            />
          </div>

          {/* List */}
          <ul
            ref={listRef}
            role="listbox"
            aria-label={label || placeholder}
            className="max-h-56 overflow-auto py-1"
          >
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-sm text-neutral-500">Sin resultados</li>
            ) : (
              filtered.map((o, idx) => {
                const active = idx === focusIndex;
                const selectedItem = selectedValues.some(v => String(v) === String(o.value));
                return (
                  <li
                    key={String(o.value)}
                    role="option"
                    aria-selected={selectedItem}
                    className={`px-3 py-2 text-sm cursor-pointer select-none flex items-center gap-2
                      ${active ? 'bg-neutral-100 dark:bg-neutral-800' : ''}
                    `}
                    onMouseEnter={() => setFocusIndex(idx)}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      toggleSelectByIndex(idx);
                    }}
                  >
                    <div className={`w-4 h-4 border rounded shrink-0 flex items-center justify-center
                      ${selectedItem ? 'bg-blue-600 border-blue-600 dark:bg-blue-500 dark:border-blue-500' : 'border-neutral-300 dark:border-neutral-600'}`
                    }>
                       {selectedItem && (
                         <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true" className="text-white">
                           <path d="M20 6L9 17l-5-5" fill="none" stroke="currentColor" strokeWidth="2" />
                         </svg>
                       )}
                    </div>
                    <span className="truncate flex-grow">{o.label}</span>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
