/**
 * Generic contact catalog page (Clients / Providers).
 * Used by both Clients.jsx and Providers.jsx to avoid duplication.
 */
import { useEffect, useState } from "react";
import api, { fmtDate, fmtErr } from "@/lib/api";
import { Plus, X, Trash, PencilSimple, MagnifyingGlass } from "@phosphor-icons/react";
import { toast } from "sonner";
import { AuditBadge } from "@/components/AuditBadge";
import ExportButton from "@/components/ExportButton";

const PROVIDER_CATEGORIES = [
  { v: "general", l: "General" },
  { v: "services", l: "Servicios" },
  { v: "materials", l: "Materiales" },
  { v: "taxes", l: "Impuestos" },
  { v: "accountant", l: "Contador" },
  { v: "other", l: "Otros" },
];

function ContactForm({ kind, initial, onSubmit, onCancel, submitting }) {
  const isProvider = kind === "provider";
  const [form, setForm] = useState(initial || {
    name: "", rfc: "", contact_name: "", email: "", phone: "", notes: "",
    ...(isProvider ? { category: "general" } : {}),
  });
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); onSubmit(form); }}
      className="space-y-4"
      data-testid={`${kind}-form`}
    >
      <div>
        <label className="block text-xs uppercase tracking-wider font-semibold text-slate-700 mb-2">
          Razón social / Nombre *
        </label>
        <input
          required
          data-testid={`${kind}-name`}
          value={form.name}
          onChange={set("name")}
          className="w-full px-4 py-2.5 bg-white border border-slate-300 focus:border-slate-950 focus:outline-none text-sm"
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs uppercase tracking-wider font-semibold text-slate-700 mb-2">RFC</label>
          <input
            data-testid={`${kind}-rfc`}
            value={form.rfc || ""}
            onChange={set("rfc")}
            className="w-full px-4 py-2.5 bg-white border border-slate-300 focus:border-slate-950 focus:outline-none text-sm uppercase font-mono"
          />
        </div>
        <div>
          <label className="block text-xs uppercase tracking-wider font-semibold text-slate-700 mb-2">Contacto</label>
          <input
            value={form.contact_name || ""}
            onChange={set("contact_name")}
            className="w-full px-4 py-2.5 bg-white border border-slate-300 focus:border-slate-950 focus:outline-none text-sm"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs uppercase tracking-wider font-semibold text-slate-700 mb-2">Email</label>
          <input
            type="email"
            value={form.email || ""}
            onChange={set("email")}
            className="w-full px-4 py-2.5 bg-white border border-slate-300 focus:border-slate-950 focus:outline-none text-sm"
          />
        </div>
        <div>
          <label className="block text-xs uppercase tracking-wider font-semibold text-slate-700 mb-2">Teléfono</label>
          <input
            value={form.phone || ""}
            onChange={set("phone")}
            className="w-full px-4 py-2.5 bg-white border border-slate-300 focus:border-slate-950 focus:outline-none text-sm"
          />
        </div>
      </div>
      {isProvider && (
        <div>
          <label className="block text-xs uppercase tracking-wider font-semibold text-slate-700 mb-2">Categoría</label>
          <select
            value={form.category || "general"}
            onChange={set("category")}
            className="w-full px-4 py-2.5 bg-white border border-slate-300 focus:border-slate-950 focus:outline-none text-sm"
          >
            {PROVIDER_CATEGORIES.map((c) => <option key={c.v} value={c.v}>{c.l}</option>)}
          </select>
        </div>
      )}
      <div>
        <label className="block text-xs uppercase tracking-wider font-semibold text-slate-700 mb-2">Notas</label>
        <textarea
          rows={3}
          value={form.notes || ""}
          onChange={set("notes")}
          className="w-full px-4 py-2.5 bg-white border border-slate-300 focus:border-slate-950 focus:outline-none text-sm"
        />
      </div>
      <div className="flex justify-end gap-3 pt-2">
        <button type="button" onClick={onCancel}
          className="px-5 py-2.5 border border-slate-300 text-slate-700 text-sm font-semibold hover:bg-slate-50">
          Cancelar
        </button>
        <button type="submit" disabled={submitting} data-testid={`${kind}-submit`}
          className="px-5 py-2.5 bg-brand text-white text-sm font-semibold hover:bg-brand-hover active:scale-[0.98] transition-all duration-200 disabled:opacity-50">
          {submitting ? "Guardando..." : initial ? "Guardar cambios" : "Crear"}
        </button>
      </div>
    </form>
  );
}

export default function ContactCatalog({ kind, title, subtitle, eyebrow }) {
  const isProvider = kind === "provider";
  const endpoint = isProvider ? "/providers" : "/clients";

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const reload = async () => {
    setLoading(true);
    try {
      const { data } = await api.get(endpoint);
      setItems(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [kind]);

  const submit = async (payload) => {
    setSubmitting(true);
    try {
      if (editing) {
        await api.put(`${endpoint}/${editing.id}`, payload);
        toast.success(`${isProvider ? "Proveedor" : "Cliente"} actualizado`);
      } else {
        await api.post(endpoint, payload);
        toast.success(`${isProvider ? "Proveedor" : "Cliente"} creado`);
      }
      setShowForm(false);
      setEditing(null);
      reload();
    } catch (e) { toast.error(fmtErr(e)); }
    finally { setSubmitting(false); }
  };

  const remove = async (item) => {
    if (!window.confirm(`¿Eliminar "${item.name}"?`)) return;
    try {
      await api.delete(`${endpoint}/${item.id}`);
      toast.success("Eliminado");
      reload();
    } catch (e) { toast.error(fmtErr(e)); }
  };

  const openCreate = () => { setEditing(null); setShowForm(true); };
  const openEdit = (item) => { setEditing(item); setShowForm(true); };

  const filtered = query.trim()
    ? items.filter((i) =>
        (i.name + " " + (i.rfc || "") + " " + (i.contact_name || "") + " " + (i.email || ""))
          .toLowerCase()
          .includes(query.toLowerCase())
      )
    : items;

  return (
    <div data-testid={`${kind}s-page`}>
      <div className="px-8 lg:px-12 pt-10 pb-8 border-b border-slate-200 bg-white flex items-end justify-between gap-6 flex-wrap">
        <div>
          <div className="font-mono text-xs uppercase tracking-[0.3em] text-slate-500 mb-2">
            {eyebrow}
          </div>
          <h1 className="font-display font-black text-4xl sm:text-5xl tracking-tighter text-slate-950">
            {title}
          </h1>
          <p className="text-slate-600 mt-2 text-sm">{subtitle}</p>
        </div>
        <div className="flex items-center gap-3">
          <ExportButton
            endpoint={`/exports/${kind}s`}
            params={{ q: query.trim() || undefined }}
            filename={isProvider ? "proveedores" : "clientes"}
            testid={`${kind}s-export`}
          />
          <button
            data-testid={`new-${kind}-btn`}
            onClick={openCreate}
            className="inline-flex items-center gap-2 bg-slate-950 text-white px-5 py-3 text-sm font-semibold hover:bg-slate-800 active:scale-[0.98] transition-all duration-200"
          >
            <Plus size={16} weight="bold" /> Nuevo {isProvider ? "proveedor" : "cliente"}
          </button>
        </div>
      </div>

      <div className="p-8 lg:p-12 space-y-6">
        <div className="bg-white border border-slate-200 px-4 py-3 flex items-center gap-3">
          <MagnifyingGlass size={16} weight="bold" className="text-slate-400" />
          <input
            data-testid={`${kind}s-search`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Buscar por nombre, RFC, contacto o email…`}
            className="flex-1 bg-transparent text-sm focus:outline-none"
          />
          {query && (
            <button onClick={() => setQuery("")} className="text-slate-400 hover:text-slate-950">
              <X size={14} weight="bold" />
            </button>
          )}
        </div>

        {loading ? (
          <div className="font-mono text-xs uppercase tracking-[0.3em] text-slate-500">Cargando…</div>
        ) : filtered.length === 0 ? (
          <div className="bg-white border border-slate-200 p-12 text-center text-sm text-slate-400">
            {items.length === 0
              ? `Aún no hay ${isProvider ? "proveedores" : "clientes"}. Crea el primero con el botón de arriba.`
              : "Sin resultados para tu búsqueda."}
          </div>
        ) : (
          <div className="bg-white border border-slate-200 overflow-x-auto" data-testid={`${kind}s-table`}>
            <table className="w-full min-w-[900px]">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr className="text-[10px] uppercase tracking-wider text-slate-500">
                  <th className="text-left px-6 py-3 font-semibold">Nombre</th>
                  <th className="text-left px-6 py-3 font-semibold">RFC</th>
                  {isProvider && <th className="text-left px-6 py-3 font-semibold">Categoría</th>}
                  <th className="text-left px-6 py-3 font-semibold">Contacto</th>
                  <th className="text-left px-6 py-3 font-semibold">Email</th>
                  <th className="text-left px-6 py-3 font-semibold">Teléfono</th>
                  <th className="text-right px-6 py-3 font-semibold">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => (
                  <tr key={item.id} className="border-b border-slate-100 hover:bg-slate-50" data-testid={`${kind}-row-${item.id}`}>
                    <td className="px-6 py-4">
                      <div className="font-semibold text-sm text-slate-950">{item.name}</div>
                      {item.notes && <div className="text-xs text-slate-500 mt-0.5 truncate max-w-xs">{item.notes}</div>}
                      <AuditBadge tx={item} />
                    </td>
                    <td className="px-6 py-4 text-xs text-slate-600 font-mono uppercase">{item.rfc || "—"}</td>
                    {isProvider && (
                      <td className="px-6 py-4">
                        <span className="inline-block px-2 py-0.5 bg-slate-100 text-slate-700 text-[10px] uppercase tracking-wider font-bold border border-slate-200">
                          {PROVIDER_CATEGORIES.find((c) => c.v === (item.category || "general"))?.l}
                        </span>
                      </td>
                    )}
                    <td className="px-6 py-4 text-sm text-slate-700">{item.contact_name || "—"}</td>
                    <td className="px-6 py-4 text-xs text-slate-600">{item.email || "—"}</td>
                    <td className="px-6 py-4 text-xs text-slate-600 font-mono">{item.phone || "—"}</td>
                    <td className="px-6 py-4 text-right">
                      <div className="inline-flex items-center gap-2">
                        <button
                          data-testid={`edit-${kind}-${item.id}`}
                          onClick={() => openEdit(item)}
                          className="text-slate-500 hover:text-brand p-1.5 hover:bg-blue-50"
                          title="Editar"
                        >
                          <PencilSimple size={14} weight="bold" />
                        </button>
                        <button
                          data-testid={`delete-${kind}-${item.id}`}
                          onClick={() => remove(item)}
                          className="text-slate-400 hover:text-red-600 p-1.5 hover:bg-red-50"
                          title="Eliminar"
                        >
                          <Trash size={14} weight="bold" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-slate-950/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-300 max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <h3 className="font-display font-bold text-xl text-slate-950">
                {editing ? `Editar ${isProvider ? "proveedor" : "cliente"}` : `Nuevo ${isProvider ? "proveedor" : "cliente"}`}
              </h3>
              <button onClick={() => { setShowForm(false); setEditing(null); }} className="text-slate-400 hover:text-slate-950">
                <X size={20} weight="bold" />
              </button>
            </div>
            <div className="p-6">
              <ContactForm
                kind={kind}
                initial={editing}
                onSubmit={submit}
                onCancel={() => { setShowForm(false); setEditing(null); }}
                submitting={submitting}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
