import { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import api, { fmtMXN, fmtDate, fmtErr } from "@/lib/api";
import {
  Plus, ArrowRight, X, Trash, PencilSimple, MagnifyingGlass,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import Combobox from "@/components/Combobox";
import { AuditBadge } from "@/components/AuditBadge";
import ExportButton from "@/components/ExportButton";
import {
  MultiFileUploader, FileGalleryModal, GalleryTriggerButton,
} from "@/components/MultiFileUploader";

// Tailwind safelist used for project status badges:
// bg-blue-50 text-blue-700 border-blue-300
// bg-indigo-50 text-indigo-700 border-indigo-300
// bg-emerald-50 text-emerald-700 border-emerald-300
// bg-amber-50 text-amber-800 border-amber-400
// bg-red-50 text-red-700 border-red-300
// bg-slate-100 text-slate-700 border-slate-300
// bg-purple-50 text-purple-700 border-purple-300
// bg-pink-50 text-pink-700 border-pink-300
const COLOR_CLASS = {
  blue:    "bg-blue-50 text-blue-700 border-blue-300",
  indigo:  "bg-indigo-50 text-indigo-700 border-indigo-300",
  emerald: "bg-emerald-50 text-emerald-700 border-emerald-300",
  amber:   "bg-amber-50 text-amber-800 border-amber-400",
  red:     "bg-red-50 text-red-700 border-red-300",
  slate:   "bg-slate-100 text-slate-700 border-slate-300",
  purple:  "bg-purple-50 text-purple-700 border-purple-300",
  pink:    "bg-pink-50 text-pink-700 border-pink-300",
};

function statusBadgeCls(color) {
  return COLOR_CLASS[color] || COLOR_CLASS.slate;
}

function ProjectForm({ initial, onSubmit, onCancel, submitting, clients, statusOptions, onCreateClient }) {
  const fallbackStatus = statusOptions[0]?.value || "in_progress";
  const [form, setForm] = useState(initial || {
    name: "", description: "", client_id: null, client_name: "",
    status: fallbackStatus,
    start_date: new Date().toISOString().slice(0, 10),
    end_date: "",
    file_ids: [],
  });
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); onSubmit({ ...form, end_date: form.end_date || null }); }}
      className="space-y-4"
      data-testid="project-form"
    >
      <div>
        <label className="block text-xs uppercase tracking-wider font-semibold text-slate-700 mb-2">
          Nombre del proyecto *
        </label>
        <input
          data-testid="project-name"
          required
          value={form.name}
          onChange={set("name")}
          className="w-full px-4 py-2.5 bg-white border border-slate-300 focus:border-slate-950 focus:outline-none text-sm"
        />
      </div>
      <div>
        <label className="block text-xs uppercase tracking-wider font-semibold text-slate-700 mb-2">
          Cliente
        </label>
        <Combobox
          testid="project-client"
          value={form.client_id}
          onChange={(id, item) => setForm({ ...form, client_id: id, client_name: item?.name || "" })}
          items={clients.map((c) => ({ id: c.id, name: c.name, sub: c.rfc }))}
          placeholder="Selecciona un cliente del catálogo…"
          onCreate={onCreateClient}
        />
      </div>
      <div>
        <label className="block text-xs uppercase tracking-wider font-semibold text-slate-700 mb-2">
          Descripción
        </label>
        <textarea
          rows={3}
          value={form.description || ""}
          onChange={set("description")}
          className="w-full px-4 py-2.5 bg-white border border-slate-300 focus:border-slate-950 focus:outline-none text-sm"
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs uppercase tracking-wider font-semibold text-slate-700 mb-2">Inicio *</label>
          <input
            data-testid="project-start"
            type="date" required
            value={form.start_date}
            onChange={set("start_date")}
            className="w-full px-4 py-2.5 bg-white border border-slate-300 focus:border-slate-950 focus:outline-none text-sm"
          />
        </div>
        <div>
          <label className="block text-xs uppercase tracking-wider font-semibold text-slate-700 mb-2">Cierre</label>
          <input
            data-testid="project-end"
            type="date"
            value={form.end_date || ""}
            onChange={set("end_date")}
            className="w-full px-4 py-2.5 bg-white border border-slate-300 focus:border-slate-950 focus:outline-none text-sm"
          />
        </div>
      </div>
      <div>
        <label className="block text-xs uppercase tracking-wider font-semibold text-slate-700 mb-2">Estado</label>
        <select
          data-testid="project-status"
          value={form.status}
          onChange={set("status")}
          className="w-full px-4 py-2.5 bg-white border border-slate-300 focus:border-slate-950 focus:outline-none text-sm"
        >
          {statusOptions.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-xs uppercase tracking-wider font-semibold text-slate-700 mb-2">
          Archivos del proyecto <span className="text-slate-500 font-normal normal-case tracking-normal">(facturas, órdenes de compra, comprobantes — puedes adjuntar varios a la vez)</span>
        </label>
        <MultiFileUploader
          testid="project-files"
          value={form.file_ids || []}
          onChange={(ids) => setForm({ ...form, file_ids: ids })}
        />
      </div>
      <div className="flex justify-end gap-3 pt-2">
        <button type="button" onClick={onCancel}
          className="px-5 py-2.5 border border-slate-300 text-slate-700 text-sm font-semibold hover:bg-slate-50">
          Cancelar
        </button>
        <button type="submit" data-testid="project-submit" disabled={submitting}
          className="px-5 py-2.5 bg-brand text-white text-sm font-semibold hover:bg-brand-hover active:scale-[0.98] transition-all duration-200 disabled:opacity-50">
          {submitting ? "Guardando..." : initial ? "Guardar cambios" : "Crear proyecto"}
        </button>
      </div>
    </form>
  );
}

export default function Projects() {
  const [items, setItems] = useState([]);
  const [pnls, setPnls] = useState({});
  const [clients, setClients] = useState([]);
  const [statusCatalog, setStatusCatalog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [filter, setFilter] = useState("all");
  const [clientFilter, setClientFilter] = useState(null);
  const [search, setSearch] = useState("");
  const [gallery, setGallery] = useState({ open: false, fileIds: [], title: "" });

  const statusByValue = useMemo(() => {
    const map = {};
    statusCatalog.forEach((s) => { map[s.value] = s; });
    return map;
  }, [statusCatalog]);

  const reload = async () => {
    setLoading(true);
    try {
      const params = {};
      if (filter !== "all") params.status = filter;
      if (clientFilter) params.client_id = clientFilter;
      if (search.trim()) params.q = search.trim();
      const [pj, cl, sc] = await Promise.all([
        api.get("/projects", { params }),
        clients.length ? Promise.resolve({ data: clients }) : api.get("/clients"),
        statusCatalog.length
          ? Promise.resolve({ data: { items: statusCatalog } })
          : api.get("/settings/catalogs/project_statuses"),
      ]);
      setItems(pj.data);
      setClients(cl.data);
      if (!statusCatalog.length) setStatusCatalog(sc.data.items || []);
      const pnlEntries = await Promise.all(
        pj.data.map((p) => api.get(`/projects/${p.id}/pnl`).then((r) => [p.id, r.data]))
      );
      setPnls(Object.fromEntries(pnlEntries));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const t = setTimeout(() => reload(), search.trim() ? 250 : 0);
    return () => clearTimeout(t);
    /* eslint-disable-next-line */
  }, [filter, clientFilter, search]);

  const submit = async (payload) => {
    setSubmitting(true);
    try {
      if (editing) {
        await api.put(`/projects/${editing.id}`, payload);
        toast.success("Proyecto actualizado");
      } else {
        await api.post("/projects", payload);
        toast.success("Proyecto creado");
      }
      setShowForm(false); setEditing(null);
      reload();
    } catch (e) { toast.error(fmtErr(e)); }
    finally { setSubmitting(false); }
  };

  const remove = async (id) => {
    if (!window.confirm("¿Eliminar este proyecto?")) return;
    try {
      await api.delete(`/projects/${id}`);
      toast.success("Proyecto eliminado");
      reload();
    } catch (e) { toast.error(fmtErr(e)); }
  };

  const createClientInline = async (name) => {
    const { data } = await api.post("/clients", { name });
    setClients((cs) => [...cs, data]);
    toast.success(`Cliente "${name}" creado`);
    return data;
  };

  const openCreate = () => { setEditing(null); setShowForm(true); };
  const openEdit = (p) => {
    setEditing({
      ...p,
      client_id: p.client_id || null,
      end_date: p.end_date || "",
      file_ids: p.file_ids || [],
    });
    setShowForm(true);
  };
  const openGallery = (p) => {
    setGallery({
      open: true,
      fileIds: p.file_ids || [],
      title: `${p.code ? `${p.code} · ` : ""}${p.name}`,
    });
  };

  const filtered = items.filter((p) => filter === "all" || p.status === filter);

  return (
    <div data-testid="projects-page">
      <div className="px-8 lg:px-12 pt-10 pb-8 border-b border-slate-200 bg-white flex items-end justify-between gap-6 flex-wrap">
        <div>
          <div className="font-mono text-xs uppercase tracking-[0.3em] text-slate-500 mb-2">
            Panel / 02
          </div>
          <h1 className="font-display font-black text-4xl sm:text-5xl tracking-tighter text-slate-950">
            Proyectos
          </h1>
          <p className="text-slate-600 mt-2 text-sm">Gestión de proyectos con P&L individual.</p>
        </div>
        <div className="flex items-center gap-3">
          <ExportButton
            endpoint="/exports/projects"
            params={{
              status: filter !== "all" ? filter : undefined,
              client_id: clientFilter,
              q: search.trim() || undefined,
            }}
            filename="proyectos"
            testid="projects-export"
          />
          <button
            data-testid="new-project-btn"
            onClick={openCreate}
            className="inline-flex items-center gap-2 bg-slate-950 text-white px-5 py-3 text-sm font-semibold hover:bg-slate-800 active:scale-[0.98] transition-all duration-200"
          >
            <Plus size={16} weight="bold" /> Nuevo proyecto
          </button>
        </div>
      </div>

      <div className="p-8 lg:p-12 space-y-6">
        {/* Filters */}
        <div className="bg-white border border-slate-200 p-5 grid grid-cols-1 md:grid-cols-3 gap-4" data-testid="projects-filters">
          <div>
            <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 mb-2">Buscar por nombre</div>
            <div className="relative">
              <MagnifyingGlass size={14} weight="bold" className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                data-testid="projects-search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar proyecto…"
                className="w-full pl-9 pr-3 py-2 border border-slate-300 bg-white text-sm focus:border-slate-950 focus:outline-none"
              />
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 mb-2">Cliente</div>
            <Combobox
              testid="projects-filter-client"
              value={clientFilter}
              onChange={(id) => setClientFilter(id)}
              items={clients.map((c) => ({ id: c.id, name: c.name, sub: c.rfc }))}
              placeholder="Todos los clientes"
            />
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 mb-2">Estado</div>
            <div className="flex flex-wrap items-center gap-2" data-testid="status-filter">
              <button
                data-testid="filter-all"
                onClick={() => setFilter("all")}
                className={`px-3 py-2 text-xs uppercase tracking-wider font-semibold border transition-colors duration-200 ${filter === "all" ? "bg-slate-950 text-white border-slate-950" : "bg-white text-slate-700 border-slate-300 hover:border-slate-950"}`}
              >
                Todos
              </button>
              {statusCatalog.map((s) => (
                <button
                  key={s.value}
                  data-testid={`filter-${s.value}`}
                  onClick={() => setFilter(s.value)}
                  className={`px-3 py-2 text-xs uppercase tracking-wider font-semibold border transition-colors duration-200 ${
                    filter === s.value ? "bg-slate-950 text-white border-slate-950" : "bg-white text-slate-700 border-slate-300 hover:border-slate-950"
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {loading ? (
          <div className="font-mono text-xs uppercase tracking-[0.3em] text-slate-500">Cargando…</div>
        ) : filtered.length === 0 ? (
          <div className="bg-white border border-slate-200 p-12 text-center text-sm text-slate-400">
            No hay proyectos en esta vista.
          </div>
        ) : (
          <div className="bg-white border border-slate-200 overflow-x-auto" data-testid="projects-table">
            <table className="w-full min-w-[1100px]">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr className="text-[10px] uppercase tracking-wider text-slate-500">
                  <th className="text-left px-4 py-3 font-semibold">ID</th>
                  <th className="text-left px-6 py-3 font-semibold">Proyecto</th>
                  <th className="text-left px-6 py-3 font-semibold">Estado</th>
                  <th className="text-left px-6 py-3 font-semibold">Inicio</th>
                  <th className="text-left px-6 py-3 font-semibold">Cierre</th>
                  <th className="text-right px-6 py-3 font-semibold">Ingresos</th>
                  <th className="text-right px-6 py-3 font-semibold">Egresos</th>
                  <th className="text-right px-6 py-3 font-semibold">Utilidad</th>
                  <th className="text-center px-4 py-3 font-semibold">Archivos</th>
                  <th className="text-right px-6 py-3 font-semibold">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => {
                  const pnl = pnls[p.id] || { income: 0, expenses: 0, net: 0 };
                  const st = statusByValue[p.status] || { label: p.status || "—", color: "slate" };
                  const clientName = clients.find((c) => c.id === p.client_id)?.name || p.client_name || null;
                  const desc = (p.description || "").trim();
                  const fileCount = (p.file_ids || []).length;
                  return (
                    <tr key={p.id} className="border-b border-slate-100 hover:bg-slate-50" data-testid={`project-row-${p.id}`}>
                      <td className="px-4 py-4 text-xs font-mono text-slate-600">
                        <span className="inline-block px-2 py-0.5 bg-slate-100 border border-slate-200 text-slate-700 font-semibold" data-testid={`project-code-${p.id}`}>
                          {p.code || "—"}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div
                          className={`font-semibold text-sm text-slate-950 ${desc ? "underline decoration-dotted decoration-slate-300 cursor-help" : ""}`}
                          title={desc || undefined}
                          data-testid={`project-name-${p.id}`}
                        >
                          {p.name}
                        </div>
                        {clientName && <div className="text-xs text-slate-500 mt-0.5">{clientName}</div>}
                        <AuditBadge tx={p} />
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-block px-2.5 py-1 border text-[10px] uppercase tracking-wider font-bold ${statusBadgeCls(st.color)}`}>
                          {st.label}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-xs text-slate-600 font-mono">{fmtDate(p.start_date)}</td>
                      <td className="px-6 py-4 text-xs text-slate-600 font-mono">{p.end_date ? fmtDate(p.end_date) : "—"}</td>
                      <td className="px-6 py-4 text-right mono-num text-sm text-emerald-700 font-semibold">{fmtMXN(pnl.income)}</td>
                      <td className="px-6 py-4 text-right mono-num text-sm text-red-700 font-semibold">{fmtMXN(pnl.expenses)}</td>
                      <td className={`px-6 py-4 text-right mono-num text-sm font-bold ${pnl.net >= 0 ? "text-slate-950" : "text-red-700"}`}>
                        {fmtMXN(pnl.net)}
                      </td>
                      <td className="px-4 py-4 text-center">
                        <GalleryTriggerButton
                          count={fileCount}
                          onClick={() => openGallery(p)}
                          testid={`project-files-count-${p.id}`}
                        />
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="inline-flex items-center gap-1">
                          <Link
                            to={`/transactions?project=${p.id}`}
                            className="text-xs uppercase tracking-wider font-semibold text-brand hover:text-brand-hover inline-flex items-center gap-1 px-2 py-1.5 hover:bg-blue-50"
                          >
                            Ver <ArrowRight size={12} weight="bold" />
                          </Link>
                          <button
                            data-testid={`edit-project-${p.id}`}
                            onClick={() => openEdit(p)}
                            className="text-slate-500 hover:text-brand p-1.5 hover:bg-blue-50"
                            title="Editar"
                          >
                            <PencilSimple size={14} weight="bold" />
                          </button>
                          <button
                            data-testid={`delete-project-${p.id}`}
                            onClick={() => remove(p.id)}
                            className="text-slate-400 hover:text-red-600 p-1.5 hover:bg-red-50"
                            title="Eliminar"
                          >
                            <Trash size={14} weight="bold" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
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
                {editing ? `Editar proyecto ${editing.code ? `· ${editing.code}` : ""}` : "Nuevo proyecto"}
              </h3>
              <button onClick={() => { setShowForm(false); setEditing(null); }} className="text-slate-400 hover:text-slate-950">
                <X size={20} weight="bold" />
              </button>
            </div>
            <div className="p-6">
              <ProjectForm
                initial={editing}
                clients={clients}
                statusOptions={statusCatalog}
                onCreateClient={createClientInline}
                onSubmit={submit}
                onCancel={() => { setShowForm(false); setEditing(null); }}
                submitting={submitting}
              />
            </div>
          </div>
        </div>
      )}

      <FileGalleryModal
        open={gallery.open}
        fileIds={gallery.fileIds}
        title={gallery.title}
        onClose={() => setGallery({ open: false, fileIds: [], title: "" })}
      />
    </div>
  );
}
