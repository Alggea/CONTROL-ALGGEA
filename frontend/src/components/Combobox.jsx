import { useState, useEffect, useRef } from "react";
import { CaretDown, Check, MagnifyingGlass, Plus, X } from "@phosphor-icons/react";

/**
 * Lightweight combobox with smart search.
 * Props:
 *  - value: id selected
 *  - onChange: (id, item) => void
 *  - items: [{ id, name, sub? }]
 *  - placeholder
 *  - onCreate?: (query) => Promise<{id,name}>  -- enables inline "Crear"
 *  - testid
 *  - allowClear
 *  - disabled
 */
export default function Combobox({
  value,
  onChange,
  items = [],
  placeholder = "Selecciona…",
  emptyMessage = "Sin resultados",
  onCreate,
  testid = "combobox",
  allowClear = true,
  disabled = false,
  required = false,
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef(null);
  const inputRef = useRef(null);

  const selected = items.find((i) => i.id === value);
  const filtered = query.trim()
    ? items.filter((i) =>
        (i.name + " " + (i.sub || "")).toLowerCase().includes(query.toLowerCase())
      )
    : items;

  useEffect(() => {
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
        setQuery("");
      }
    };
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 30);
  }, [open]);

  const pick = (item) => {
    onChange(item.id, item);
    setOpen(false);
    setQuery("");
  };

  const clear = (e) => {
    e.stopPropagation();
    onChange(null, null);
  };

  const handleCreate = async () => {
    if (!onCreate || !query.trim()) return;
    try {
      const item = await onCreate(query.trim());
      if (item) pick(item);
    } catch (_e) { /* parent handles */ }
  };

  const canCreate = onCreate && query.trim().length > 0 &&
    !filtered.some((i) => i.name.toLowerCase() === query.trim().toLowerCase());

  return (
    <div ref={containerRef} className="relative" data-testid={testid}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen(!open)}
        data-testid={`${testid}-trigger`}
        className={`w-full flex items-center justify-between gap-2 px-4 py-2.5 bg-white border text-sm transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed ${
          open
            ? "border-slate-950 ring-2 ring-slate-950 ring-offset-1"
            : "border-slate-300 hover:border-slate-500"
        } ${required && !selected ? "border-amber-400" : ""}`}
      >
        <span className={`truncate text-left flex-1 ${selected ? "text-slate-950" : "text-slate-400"}`}>
          {selected ? (
            <>
              <span>{selected.name}</span>
              {selected.sub && <span className="text-slate-500 ml-2 text-xs">{selected.sub}</span>}
            </>
          ) : placeholder}
        </span>
        <div className="flex items-center gap-1 text-slate-400">
          {selected && allowClear && !disabled && (
            <span onClick={clear} className="hover:text-red-600 p-0.5" data-testid={`${testid}-clear`}>
              <X size={14} weight="bold" />
            </span>
          )}
          <CaretDown size={14} weight="bold" className={`transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
        </div>
      </button>

      {open && (
        <div
          className="absolute z-50 mt-1 w-full bg-white border border-slate-900 shadow-lg max-h-72 overflow-hidden flex flex-col"
          data-testid={`${testid}-panel`}
        >
          <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-200 bg-slate-50">
            <MagnifyingGlass size={14} weight="bold" className="text-slate-400" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar…"
              data-testid={`${testid}-search`}
              className="flex-1 bg-transparent text-sm focus:outline-none"
            />
          </div>
          <div className="overflow-y-auto flex-1">
            {filtered.length === 0 && !canCreate && (
              <div className="px-4 py-6 text-center text-sm text-slate-400">{emptyMessage}</div>
            )}
            {filtered.map((item) => {
              const isSel = item.id === value;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => pick(item)}
                  data-testid={`${testid}-option-${item.id}`}
                  className={`w-full flex items-center justify-between gap-2 px-4 py-2.5 text-left text-sm transition-colors duration-150 ${
                    isSel ? "bg-brand text-white" : "hover:bg-slate-50 text-slate-950"
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate">{item.name}</div>
                    {item.sub && (
                      <div className={`text-xs truncate ${isSel ? "text-blue-100" : "text-slate-500"}`}>
                        {item.sub}
                      </div>
                    )}
                  </div>
                  {isSel && <Check size={14} weight="bold" />}
                </button>
              );
            })}
            {canCreate && (
              <button
                type="button"
                onClick={handleCreate}
                data-testid={`${testid}-create`}
                className="w-full flex items-center gap-2 px-4 py-2.5 text-left text-sm border-t border-slate-200 bg-emerald-50/40 hover:bg-emerald-50 text-emerald-800 transition-colors duration-150"
              >
                <Plus size={14} weight="bold" />
                <span>Crear "<span className="font-semibold">{query.trim()}</span>"</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
