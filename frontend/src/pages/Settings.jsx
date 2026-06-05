import { useEffect, useState } from "react";
import api, { fmtErr } from "@/lib/api";
import { GearSix, Plus, Trash, FloppyDisk, ArrowClockwise, Tag } from "@phosphor-icons/react";
import { toast } from "sonner";

function slugify(s) {
  return s
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 32);
}

const COLOR_PALETTE = [
  { key: "blue", label: "Azul", swatch: "bg-blue-500" },
  { key: "indigo", label: "Índigo", swatch: "bg-indigo-500" },
  { key: "emerald", label: "Verde", swatch: "bg-emerald-500" },
  { key: "amber", label: "Ámbar", swatch: "bg-amber-500" },
  { key: "red", label: "Rojo", swatch: "bg-red-500" },
  { key: "slate", label: "Gris", swatch: "bg-slate-500" },
  { key: "purple", label: "Morado", swatch: "bg-purple-500" },
  { key: "pink", label: "Rosa", swatch: "bg-pink-500" },
];

const HAS_COLOR = (key) => key === "project_statuses";

function CatalogEditor({ catalog, onSaved }) {
  const [items, setItems] = useState(catalog.items);
  const [draft, setDraft] = useState({ label: "", value: "", color: "blue" });
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const hasColor = HAS_COLOR(catalog.key);

  useEffect(() => { setItems(catalog.items); setDirty(false); }, [catalog]);

  const addItem = () => {
    const label = draft.label.trim();
    if (!label) return;
    const value = (draft.value.trim() || slugify(label));
    if (!value) return;
    if (items.some((it) => it.value === value)) {
      toast.error(`Ya existe un elemento con el identificador "${value}"`);
      return;
    }
    const next = { value, label };
    if (hasColor) next.color = draft.color || "blue";
    setItems([...items, next]);
    setDraft({ label: "", value: "", color: "blue" });
    setDirty(true);
  };

  const removeItem = (idx) => {
    setItems(items.filter((_, i) => i !== idx));
    setDirty(true);
  };

  const updateLabel = (idx, label) => {
    setItems(items.map((it, i) => (i === idx ? { ...it, label } : it)));
    setDirty(true);
  };

  const updateColor = (idx, color) => {
    setItems(items.map((it, i) => (i === idx ? { ...it, color } : it)));
    setDirty(true);
  };

  const save = async () => {
    if (items.length === 0) {
      toast.error("El catálogo no puede estar vacío");
      return;
    }
    setSaving(true);
    try {
      const { data } = await api.put(`/settings/catalogs/${catalog.key}`, { items });
      toast.success(`${catalog.label} guardado`);
      onSaved(data);
      setDirty(false);
    } catch (e) {
      toast.error(fmtErr(e));
    } finally {
      setSaving(false);
    }
  };

  const reset = () => { setItems(catalog.items); setDirty(false); };

  return (
    <div className="bg-white border border-slate-200" data-testid={`catalog-${catalog.key}`}>
      <div className="px-6 py-5 border-b border-slate-200 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-brand/10 text-brand">
            <Tag size={16} weight="bold" />
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-[0.25em] font-semibold text-slate-500">
              Catálogo · {catalog.key}
            </div>
            <h3 className="font-display font-bold text-lg text-slate-950 mt-0.5">
              {catalog.label}
            </h3>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {dirty && (
            <button
              type="button"
              onClick={reset}
              data-testid={`catalog-${catalog.key}-reset`}
              className="inline-flex items-center gap-1.5 px-3 py-2 border border-slate-300 text-slate-700 text-xs uppercase tracking-wider font-semibold hover:border-slate-950"
            >
              <ArrowClockwise size={12} weight="bold" /> Descartar
            </button>
          )}
          <button
            type="button"
            onClick={save}
            disabled={!dirty || saving}
            data-testid={`catalog-${catalog.key}-save`}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-brand text-white text-xs uppercase tracking-wider font-semibold hover:bg-brand-hover active:scale-[0.98] transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <FloppyDisk size={12} weight="bold" /> {saving ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </div>

      <div className="divide-y divide-slate-100">
        {items.length === 0 ? (
          <div className="px-6 py-10 text-center text-sm text-slate-400">Aún no hay elementos.</div>
        ) : items.map((it, idx) => (
          <div key={it.value} className="px-6 py-3 flex items-center gap-3" data-testid={`catalog-${catalog.key}-row-${it.value}`}>
            <div className={`flex-1 grid gap-3 ${hasColor ? "grid-cols-[1fr_140px_140px]" : "grid-cols-3"}`}>
              <input
                value={it.label}
                onChange={(e) => updateLabel(idx, e.target.value)}
                className={`${hasColor ? "" : "col-span-2"} px-3 py-2 border border-slate-300 bg-white text-sm focus:border-slate-950 focus:outline-none`}
              />
              {hasColor && (
                <select
                  value={it.color || "slate"}
                  onChange={(e) => updateColor(idx, e.target.value)}
                  data-testid={`catalog-${catalog.key}-color-${it.value}`}
                  className="px-3 py-2 border border-slate-300 bg-white text-sm focus:border-slate-950 focus:outline-none"
                >
                  {COLOR_PALETTE.map((c) => (
                    <option key={c.key} value={c.key}>{c.label}</option>
                  ))}
                </select>
              )}
              <div className="flex items-center px-3 py-2 bg-slate-50 border border-slate-200 text-xs font-mono text-slate-500 truncate">
                {it.value}
              </div>
            </div>
            <button
              type="button"
              onClick={() => removeItem(idx)}
              data-testid={`catalog-${catalog.key}-remove-${it.value}`}
              className="text-slate-400 hover:text-red-600 p-2 hover:bg-red-50"
              aria-label="Eliminar"
            >
              <Trash size={14} weight="bold" />
            </button>
          </div>
        ))}
      </div>

      <div className={`px-6 py-4 bg-slate-50 border-t border-slate-200 grid gap-3 ${hasColor ? "grid-cols-1 md:grid-cols-[1fr_140px_140px_auto]" : "grid-cols-1 md:grid-cols-[1fr_180px_auto]"}`}>
        <input
          data-testid={`catalog-${catalog.key}-new-label`}
          value={draft.label}
          onChange={(e) => setDraft({ ...draft, label: e.target.value })}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addItem(); } }}
          placeholder="Nuevo elemento"
          className="px-3 py-2 border border-slate-300 bg-white text-sm focus:border-slate-950 focus:outline-none"
        />
        {hasColor && (
          <select
            data-testid={`catalog-${catalog.key}-new-color`}
            value={draft.color}
            onChange={(e) => setDraft({ ...draft, color: e.target.value })}
            className="px-3 py-2 border border-slate-300 bg-white text-sm focus:border-slate-950 focus:outline-none"
          >
            {COLOR_PALETTE.map((c) => (
              <option key={c.key} value={c.key}>{c.label}</option>
            ))}
          </select>
        )}
        <input
          data-testid={`catalog-${catalog.key}-new-value`}
          value={draft.value}
          onChange={(e) => setDraft({ ...draft, value: e.target.value })}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addItem(); } }}
          placeholder="ID (opcional)"
          className="px-3 py-2 border border-slate-300 bg-white text-xs font-mono focus:border-slate-950 focus:outline-none"
        />
        <button
          type="button"
          data-testid={`catalog-${catalog.key}-add`}
          onClick={addItem}
          className="inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-slate-950 text-white text-xs uppercase tracking-wider font-semibold hover:bg-slate-800 active:scale-[0.98] transition-all duration-200"
        >
          <Plus size={12} weight="bold" /> Agregar
        </button>
      </div>
    </div>
  );
}

export default function Settings() {
  const [catalogs, setCatalogs] = useState([]);
  const [loading, setLoading] = useState(true);

  const reload = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/settings/catalogs");
      setCatalogs(data);
    } catch (e) {
      toast.error(fmtErr(e));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { reload(); }, []);

  const onSaved = (updated) => {
    setCatalogs((cs) => cs.map((c) => (c.key === updated.key ? updated : c)));
  };

  return (
    <div data-testid="settings-page">
      <div className="px-8 lg:px-12 pt-10 pb-8 border-b border-slate-200 bg-white">
        <div className="font-mono text-xs uppercase tracking-[0.3em] text-slate-500 mb-2">
          Panel / 08
        </div>
        <div className="flex items-center gap-4">
          <div className="p-3 bg-slate-100 border border-slate-300">
            <GearSix size={26} weight="bold" className="text-slate-900" />
          </div>
          <div>
            <h1 className="font-display font-black text-4xl sm:text-5xl tracking-tighter text-slate-950">
              Configuración
            </h1>
            <p className="text-slate-600 mt-2 text-sm max-w-2xl">
              Personaliza las listas que usa la aplicación: categorías de ingresos, egresos, métodos de pago y estatus de proyectos (con color).
              Cualquier cambio aplica inmediatamente en los formularios y listas.
            </p>
          </div>
        </div>
      </div>

      <div className="p-8 lg:p-12 space-y-6">
        {loading ? (
          <div className="font-mono text-xs uppercase tracking-[0.3em] text-slate-500">Cargando…</div>
        ) : (
          catalogs.map((c) => (
            <CatalogEditor key={c.key} catalog={c} onSaved={onSaved} />
          ))
        )}

        <div className="bg-emerald-50 border border-emerald-200 px-6 py-4 text-sm text-emerald-900">
          <strong className="font-semibold">Tip:</strong> Los estatus de proyectos ahora son completamente configurables. Cambia el color del estatus desde aquí y los proyectos se actualizarán al instante. <em>Si eliminas un estatus que ya está siendo usado, los proyectos existentes lo mantendrán visualmente como "Gris".</em>
        </div>
      </div>
    </div>
  );
}
