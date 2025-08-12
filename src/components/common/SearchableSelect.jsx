// src/components/common/SearchableSelect.jsx
import React, { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from "@/components/ui/command";
import { ChevronsUpDown, Check } from "lucide-react";

export default function SearchableSelect({
  label = "opciones",
  placeholder = "Selecciona...",
  value = "",
  onChange,
  options = [],
  disabled = false,
}) {
  const [open, setOpen] = useState(false);

  const merged = useMemo(() => [{ value: "", label: `Todos ${label}` }, ...options], [label, options]);
  const selectedLabel = useMemo(() => merged.find(o => String(o.value) === String(value))?.label ?? "", [merged, value]);

  const handleSelect = (val) => {
    onChange?.(val);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className="w-[240px] max-sm:w-full justify-between"
        >
          <span className="truncate">{selectedLabel || placeholder}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 opacity-50" />
        </Button>
      </PopoverTrigger>

      <PopoverContent className="w-[240px] max-sm:w-[calc(100vw-3rem)] p-0">
        <Command>
          <CommandInput placeholder={`Buscar ${label}...`} className="h-9" />
          <CommandList className="max-h-[320px] overflow-y-auto">
            <CommandEmpty>Sin resultados.</CommandEmpty>
            <CommandGroup>
              {merged.map(opt => (
                <CommandItem
                  key={String(opt.value)}
                  value={opt.label}
                  onSelect={() => handleSelect(opt.value)}
                >
                  <Check className={`mr-2 h-4 w-4 ${String(value) === String(opt.value) ? "opacity-100" : "opacity-0"}`} />
                  <span className="truncate">{opt.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
