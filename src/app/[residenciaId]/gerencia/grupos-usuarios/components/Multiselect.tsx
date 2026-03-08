"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

export type MultiSelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

interface MultiSelectProps {
  options: MultiSelectOption[];
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
  maxVisibleLabels?: number;
  className?: string;
}

export function MultiSelect({
  options,
  value,
  onChange,
  placeholder = "Selecciona opciones",
  disabled = false,
  maxVisibleLabels = 2,
  className = "",
}: MultiSelectProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [open]);

  const selectedLabels = useMemo(() => {
    const map = new Map(options.map((o) => [o.value, o.label]));
    return value.map((v) => map.get(v) ?? v);
  }, [options, value]);

  function toggleOption(optionValue: string) {
    if (value.includes(optionValue)) {
      onChange(value.filter((v) => v !== optionValue));
      return;
    }
    onChange([...value, optionValue]);
  }

  function clearAll() {
    onChange([]);
  }

  const buttonText =
    selectedLabels.length === 0
      ? placeholder
      : selectedLabels.length <= maxVisibleLabels
      ? selectedLabels.join(", ")
      : `${selectedLabels.slice(0, maxVisibleLabels).join(", ")} +${selectedLabels.length - maxVisibleLabels}`;

  return (
    <div ref={rootRef} className={`relative w-full ${className}`}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((prev) => !prev)}
        className="w-full min-h-10 rounded border border-gray-300 bg-white px-3 py-2 text-left text-sm shadow-sm disabled:cursor-not-allowed disabled:bg-gray-100"
      >
        <span className={selectedLabels.length === 0 ? "text-gray-500" : "text-gray-900"}>
          {buttonText}
        </span>
      </button>

      {open && !disabled && (
        <div className="absolute z-50 mt-1 w-full rounded border border-gray-200 bg-white shadow-lg">
          <div className="max-h-64 overflow-auto p-2">
            {options.length === 0 && (
              <p className="px-2 py-1 text-sm text-gray-500">No hay opciones</p>
            )}

            {options.map((opt) => {
              const checked = value.includes(opt.value);
              return (
                <label
                  key={opt.value}
                  className={`flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-gray-50 ${
                    opt.disabled ? "cursor-not-allowed opacity-60" : ""
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={opt.disabled}
                    onChange={() => toggleOption(opt.value)}
                  />
                  <span>{opt.label}</span>
                </label>
              );
            })}
          </div>

          <div className="flex items-center justify-between border-t border-gray-100 p-2">
            <span className="text-xs text-gray-500">{value.length} seleccionadas</span>
            <button
              type="button"
              className="text-xs text-blue-600 hover:text-blue-700 disabled:text-gray-400"
              disabled={value.length === 0}
              onClick={clearAll}
            >
              Limpiar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}