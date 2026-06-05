import { useEffect, useState, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import api, { fmtMXN, fmtDate, fmtErr } from "@/lib/api";
import {
  Plus, X, Trash, PencilSimple, ArrowUpRight, ArrowDownRight,
  Money, ArrowsLeftRight, CheckCircle, Warning,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import { FileUploader, FileLink } from "@/components/FileUploader";
import { AuditBadge } from "@/components/AuditBadge";
import Combobox from "@/components/Combobox";
import ExportButton from "@/components/ExportButton";
import { useAuth } from "@/contexts/AuthContext";

const FALLBACK_CATEGORIES = [
  { value: "general", label: "General" },
  { value: "other", label: "Otros" },
];

function TxForm({
  initial, partners, projects, clients, providers,
  onSubmit, onCancel, submitting,
  onCreateClient, onCreateProvider,
  currentUserId,
  incomeCategories, expenseCategories,
}) {
  const [form, setForm] = useState(initial || {
    type: "expense",
    amount: "",
    payment_method: "transfer",
    description: "",
    counterparty: "",
    client_id: null,
    provider_id: null,
    category: "general",
    project_id: null,
    partner_id: currentUserId || partners[0]?.id || "",
    paid_personally: false,
    date: new Date().toISOString().slice(0, 10),
    file_id: null,
  });
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const setBool = (k) => (e) => setForm({ ...form, [k]: e.target.checked });

  const isIncome = form.type === "income";
  const activeCategories = isIncome
    ? (incomeCategories?.length ? incomeCategories : FALLBACK_CATEGORIES)
    : (expenseCategories?.length ? expenseCategories : FALLBACK_CATEGORIES);

  // Ensure selected category exists in the active list; if not, fall back to first
  useEffect(() => {
    if (!activeCategories.some((c) => c.value === form.category) && activeCategories[0]) {
      setForm((f) => ({ ...f, category: activeCategories[0].value }));
    }
    // eslint-disable-next-line
  }, [form.type, incomeCategories, expenseCategories]);

  const validateAndSubmit = (e) => {
    e.preventDefault();
    if (isIncome && !form.client_id) {
      toast.error("Selecciona un cliente");
      return;
    }
    if (!isIncome && !form.provider_id) {
      toast.error("Selecciona un proveedor");
      return;
    }
    if (!form.project_id) {
      toast.error("Selecciona un proyecto");
      return;
    }
    onSubmit({
      ...form,
      amount: parseFloat(form.amount),
      // mutually exclusive
      client_id: isIncome ? form.client_id : null,
      provider_id: isIncome ? null : form.provider_id,
    });
  };

  return (
    <form onSubmit={validateAndSubmit} className="space-y-4" data-testid="tx-form">
      <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100">
        {[
          { v: "income", l: "Ingreso" },
          { v: "expense", l: "Egreso" },
        ].map((t) => (
          <button
            key={t.v}
            type="button"
            data-testid={`type-${t.v}`}
            onClick={() => setForm({ ...form, type: t.v, client_id: null, provider_id: null })}
            className={`py-2.5 text-sm font-semibold transition-colors duration-200 ${
              form.type === t.v
                ? t.v === "income" ? "bg-emerald-600 text-white" : "bg-red-600 text-white"
                : "bg-transparent text-slate-700"
            }`}
          >
            {t.l}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs uppercase tracking-wider font-semibold text-slate-700 mb-2">Monto MXN *</label>
          <input
            data-testid="tx-amount" type="number" step="0.01" min="0" required
            value={form.amount} onChange={set("amount")}
            className="w-full px-4 py-2.5 bg-white border border-slate-300 focus:border-slate-950 focus:outline-none text-sm mono-num"
          />
        </div>
        <div>
          <label className="block text-xs uppercase tracking-wider font-semibold text-slate-700 mb-2">Fecha *</label>
          <input
            data-testid="tx-date" type="date" required
            value={form.date} onChange={set("date")}
            className="w-full px-4 py-2.5 bg-white border border-slate-300 focus:border-slate-950 focus:outline-none text-sm"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs uppercase tracking-wider font-semibold text-slate-700 mb-2">Descripción *</label>
        <input
          data-testid="tx-description" required
          value={form.description} onChange={set("description")}
          className="w-full px-4 py-2.5 bg-white border border-slate-300 focus:border-slate-950 focus:outline-none text-sm"
        />
      </div>

      <div>
        <label className="block text-xs uppercase tracking-wider font-semibold text-slate-700 mb-2">
          {isIncome ? "Cliente *" : "Proveedor *"}
        </label>
        {isIncome ? (
          <Combobox
            testid="tx-client"
            value={form.client_id}
            onChange={(id) => setForm({ ...form, client_id: id })}
            items={clients.map((c) => ({ id: c.id, name: c.name, sub: c.rfc }))}
            placeholder="Selecciona cliente del catálogo o crea uno nuevo…"
            onCreate={onCreateClient}
            required
          />
        ) : (
          <Combobox
            testid="tx-provider"
            value={form.provider_id}
            onChange={(id) => setForm({ ...form, provider_id: id })}
            items={providers.map((p) => ({ id: p.id, name: p.name, sub: p.rfc }))}
            placeholder="Selecciona proveedor del catálogo o crea uno nuevo…"
            onCreate={onCreateProvider}
            required
          />
        )}
      </div>

      <div>
        <label className="block text-xs uppercase tracking-wider font-semibold text-slate-700 mb-2">Proyecto *</label>
        <Combobox
          testid="tx-project"
          value={form.project_id}
          onChange={(id) => setForm({ ...form, project_id: id })}
          items={projects.map((p) => ({
            id: p.id,
            name: p.code ? `${p.code} · ${p.name}` : p.name,
            sub: p.status === "completed" ? "Completado" : "En progreso",
          }))}
          placeholder="Selecciona un proyecto…"
          required
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs uppercase tracking-wider font-semibold text-slate-700 mb-2">Método de pago</label>
          <select
            data-testid="tx-method" value={form.payment_method} onChange={set("payment_method")}
            className="w-full px-4 py-2.5 bg-white border border-slate-300 focus:border-slate-950 focus:outline-none text-sm"
          >
            <option value="cash">Efectivo</option>
            <option value="transfer">Transferencia</option>
          </select>
        </div>
        <div>
          <label className="block text-xs uppercase tracking-wider font-semibold text-slate-700 mb-2">Categoría</label>
          <select
            data-testid="tx-category" value={form.category} onChange={set("category")}
            className="w-full px-4 py-2.5 bg-white border border-slate-300 focus:border-slate-950 focus:outline-none text-sm"
          >
            {activeCategories.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </div>
      </div>

      <div>
        <label className="block text-xs uppercase tracking-wider font-semibold text-slate-700 mb-2">Socio que registra / debe *</label>
        <select
          data-testid="tx-partner" required value={form.partner_id} onChange={set("partner_id")}
          className="w-full px-4 py-2.5 bg-white border border-slate-300 focus:border-slate-950 focus:outline-none text-sm"
        >
          {partners.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      {!isIncome && (
        <label className="flex items-start gap-3 p-3 border border-slate-200 bg-amber-50/50 cursor-pointer">
          <input
            data-testid="tx-personally" type="checkbox"
            checked={form.paid_personally}
            onChange={setBool("paid_personally")}
            className="mt-1"
          />
          <div>
            <div className="text-sm font-semibold text-slate-950">Pagado con dinero propio</div>
            <div className="text-xs text-slate-600">La sociedad le debe al socio este monto.</div>
          </div>
        </label>
      )}

      <div>
        <label className="block text-xs uppercase tracking-wider font-semibold text-slate-700 mb-2">
          Comprobante <span className="text-slate-500 font-normal normal-case tracking-normal">(opcional)</span>
        </label>
        <FileUploader
          value={form.file_id}
          onChange={(id) => setForm({ ...form, file_id: id })}
        />
      </div>

      <div className="flex justify-end gap-3 pt-2">
        <button type="button" onClick={onCancel}
          className="px-5 py-2.5 border border-slate-300 text-slate-700 text-sm font-semibold hover:bg-slate-50">
          Cancelar
        </button>
        <button type="submit" data-testid="tx-submit" disabled={submitting}
          className="px-5 py-2.5 bg-brand text-white text-sm font-semibold hover:bg-brand-hover active:scale-[0.98] transition-all duration-200 disabled:opacity-50">
          {submitting ? "Guardando..." : initial ? "Guardar cambios" : "Registrar"}
        </button>
      </div>
    </form>
  );
}

export default function Transactions() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [partners, setPartners] = useState([]);
  const [projects, setProjects] = useState([]);
  const [clients, setClients] = useState([]);
  const [providers, setProviders] = useState([]);
  const [incomeCats, setIncomeCats] = useState([]);
  const [expenseCats, setExpenseCats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const filters = {
    type: searchParams.get("type") || "",
    partner_id: searchParams.get("partner") || "",
    project_id: searchParams.get("project") || "",
    payment_method: searchParams.get("method") || "",
  };

  const setFilter = (k, v) => {
    const next = new URLSearchParams(searchParams);
    if (v) next.set(k, v); else next.delete(k);
    setSearchParams(next);
  };

  const reload = async () => {
    setLoading(true);
    try {
      const params = {};
      if (filters.type) params.type = filters.type;
      if (filters.partner_id) params.partner_id = filters.partner_id;
      if (filters.project_id) params.project_id = filters.project_id;
      if (filters.payment_method) params.payment_method = filters.payment_method;
      const [tx, pr, pj, cl, pv, ic, ec] = await Promise.all([
        api.get("/transactions", { params }),
        api.get("/partners"),
        api.get("/projects"),
        api.get("/clients"),
        api.get("/providers"),
        api.get("/settings/catalogs/income_categories"),
        api.get("/settings/catalogs/expense_categories"),
      ]);
      setItems(tx.data);
      setPartners(pr.data);
      setProjects(pj.data);
      setClients(cl.data);
      setProviders(pv.data);
      setIncomeCats(ic.data.items || []);
      setExpenseCats(ec.data.items || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [searchParams.toString()]);

  const partnerById = useMemo(() => Object.fromEntries(partners.map((p) => [p.id, p])), [partners]);
  const projectById = useMemo(() => Object.fromEntries(projects.map((p) => [p.id, p])), [projects]);
  const clientById = useMemo(() => Object.fromEntries(clients.map((c) => [c.id, c])), [clients]);
  const providerById = useMemo(() => Object.fromEntries(providers.map((p) => [p.id, p])), [providers]);

  const submit = async (payload) => {
    setSubmitting(true);
    try {
      if (editing) {
        await api.put(`/transactions/${editing.id}`, payload);
        toast.success("Transacción actualizada");
      } else {
        await api.post("/transactions", payload);
        toast.success("Transacción registrada");
      }
      setShowForm(false); setEditing(null);
      reload();
    } catch (e) { toast.error(fmtErr(e)); }
    finally { setSubmitting(false); }
  };

  const remove = async (id) => {
    if (!window.confirm("¿Eliminar transacción?")) return;
    try {
      await api.delete(`/transactions/${id}`);
      toast.success("Transacción eliminada");
      reload();
    } catch (e) { toast.error(fmtErr(e)); }
  };

  const createClient = async (name) => {
    const { data } = await api.post("/clients", { name });
    setClients((cs) => [...cs, data]);
    toast.success(`Cliente "${name}" creado`);
    return data;
  };
  const createProvider = async (name) => {
    const { data } = await api.post("/providers", { name });
    setProviders((ps) => [...ps, data]);
    toast.success(`Proveedor "${name}" creado`);
    return data;
  };

  const openCreate = () => { setEditing(null); setShowForm(true); };
  const openEdit = (t) => {
    setEditing({
      ...t,
      project_id: t.project_id || null,
      client_id: t.client_id || null,
      provider_id: t.provider_id || null,
      amount: String(t.amount),
    });
    setShowForm(true);
  };

  const totals = useMemo(() => {
    const inc = items.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0);
    const exp = items.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0);
    return { inc, exp, net: inc - exp };
  }, [items]);

  return (
    <div data-testid="transactions-page">
      <div className="px-8 lg:px-12 pt-10 pb-8 border-b border-slate-200 bg-white flex items-end justify-between gap-6 flex-wrap">
        <div>
          <div className="font-mono text-xs uppercase tracking-[0.3em] text-slate-500 mb-2">Panel / 03</div>
          <h1 className="font-display font-black text-4xl sm:text-5xl tracking-tighter text-slate-950">
            Ingresos y Egresos
          </h1>
          <p className="text-slate-600 mt-2 text-sm">Bitácora completa. Cliente/proveedor y proyecto son obligatorios. El comprobante es opcional.</p>
        </div>
        <div className="flex items-center gap-3">
          <ExportButton
            endpoint="/exports/transactions"
            params={{
              type: filters.type || undefined,
              partner_id: filters.partner_id || undefined,
              project_id: filters.project_id || undefined,
              payment_method: filters.payment_method || undefined,
            }}
            filename="ingresos_egresos"
            testid="tx-export"
          />
          <button
            data-testid="new-tx-btn"
            onClick={openCreate}
            className="inline-flex items-center gap-2 bg-slate-950 text-white px-5 py-3 text-sm font-semibold hover:bg-slate-800 active:scale-[0.98] transition-all duration-200"
          >
            <Plus size={16} weight="bold" /> Nuevo movimiento
          </button>
        </div>
      </div>

      <div className="p-8 lg:p-12 space-y-6">
        {/* Filters */}
        <div className="bg-white border border-slate-200 p-5 grid grid-cols-1 md:grid-cols-4 gap-4" data-testid="tx-filters">
          <div>
            <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 mb-2">Tipo</div>
            <select data-testid="filter-type" value={filters.type} onChange={(e) => setFilter("type", e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 bg-white text-sm focus:border-slate-950 focus:outline-none">
              <option value="">Todos</option>
              <option value="income">Ingresos</option>
              <option value="expense">Egresos</option>
            </select>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 mb-2">Socio</div>
            <select data-testid="filter-partner" value={filters.partner_id} onChange={(e) => setFilter("partner", e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 bg-white text-sm focus:border-slate-950 focus:outline-none">
              <option value="">Todos</option>
              {partners.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 mb-2">Proyecto</div>
            <select data-testid="filter-project" value={filters.project_id} onChange={(e) => setFilter("project", e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 bg-white text-sm focus:border-slate-950 focus:outline-none">
              <option value="">Todos</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code ? `${p.code} · ${p.name}` : p.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 mb-2">Método</div>
            <select data-testid="filter-method" value={filters.payment_method} onChange={(e) => setFilter("method", e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 bg-white text-sm focus:border-slate-950 focus:outline-none">
              <option value="">Todos</option>
              <option value="cash">Efectivo</option>
              <option value="transfer">Transferencia</option>
            </select>
          </div>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-3 gap-px bg-slate-200 border border-slate-200">
          <div className="bg-white p-5">
            <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-500">Ingresos (filtro)</div>
            <div className="metric-num text-2xl text-emerald-700 mt-2">{fmtMXN(totals.inc)}</div>
          </div>
          <div className="bg-white p-5">
            <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-500">Egresos (filtro)</div>
            <div className="metric-num text-2xl text-red-700 mt-2">{fmtMXN(totals.exp)}</div>
          </div>
          <div className="bg-white p-5">
            <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-500">Neto (filtro)</div>
            <div className={`metric-num text-2xl mt-2 ${totals.net >= 0 ? "text-slate-950" : "text-red-700"}`}>
              {fmtMXN(totals.net)}
            </div>
          </div>
        </div>

        {loading ? (
          <div className="font-mono text-xs uppercase tracking-[0.3em] text-slate-500">Cargando…</div>
        ) : items.length === 0 ? (
          <div className="bg-white border border-slate-200 p-12 text-center text-sm text-slate-400">
            No hay movimientos con los filtros actuales.
          </div>
        ) : (
          <div className="bg-white border border-slate-200 overflow-x-auto" data-testid="tx-table">
            <table className="w-full min-w-[1300px]">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr className="text-[10px] uppercase tracking-wider text-slate-500">
                  <th className="text-left px-4 py-3 font-semibold">Tipo</th>
                  <th className="text-left px-4 py-3 font-semibold">Fecha</th>
                  <th className="text-left px-4 py-3 font-semibold">Descripción</th>
                  <th className="text-left px-4 py-3 font-semibold">Cliente / Proveedor</th>
                  <th className="text-left px-4 py-3 font-semibold">Proyecto</th>
                  <th className="text-left px-4 py-3 font-semibold">Socio</th>
                  <th className="text-left px-4 py-3 font-semibold">Método</th>
                  <th className="text-left px-4 py-3 font-semibold">Estado</th>
                  <th className="text-center px-4 py-3 font-semibold">Archivo</th>
                  <th className="text-right px-4 py-3 font-semibold">Monto</th>
                  <th className="text-right px-4 py-3 font-semibold"></th>
                </tr>
              </thead>
              <tbody>
                {items.map((t) => {
                  const partner = partnerById[t.partner_id];
                  const project = projectById[t.project_id];
                  const contact = t.type === "income"
                    ? clientById[t.client_id]
                    : providerById[t.provider_id];
                  const contactName = contact?.name || t.counterparty || "—";
                  const isReimbursed = t.reimbursement_status === "reimbursed";
                  const isPending = t.reimbursement_status === "pending";
                  return (
                    <tr key={t.id}
                      className={`border-b border-slate-100 hover:bg-slate-50 ${isReimbursed ? "bg-emerald-50/40" : ""}`}
                      data-testid={`tx-row-${t.id}`}
                    >
                      <td className="px-4 py-3">
                        {t.type === "income" ? (
                          <div className="inline-flex items-center gap-1.5 text-emerald-700 text-xs font-semibold">
                            <ArrowUpRight size={12} weight="bold" /> Ingreso
                          </div>
                        ) : (
                          <div className="inline-flex items-center gap-1.5 text-red-700 text-xs font-semibold">
                            <ArrowDownRight size={12} weight="bold" /> Egreso
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600 font-mono">{fmtDate(t.date)}</td>
                      <td className="px-4 py-3 text-sm text-slate-950">
                        <div>{t.description}</div>
                        <AuditBadge tx={t} />
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-700">{contactName}</td>
                      <td className="px-4 py-3 text-sm text-slate-700">{project ? (project.code ? `${project.code} · ${project.name}` : project.name) : "—"}</td>
                      <td className="px-4 py-3">
                        {partner && (
                          <div className="inline-flex items-center gap-2">
                            <div className="h-2 w-2" style={{ background: partner.color }} />
                            <span className="text-xs text-slate-700">{partner.name}</span>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500">
                        <div className="inline-flex items-center gap-1.5">
                          {t.payment_method === "cash"
                            ? <><Money size={12} weight="bold" /> Efectivo</>
                            : <><ArrowsLeftRight size={12} weight="bold" /> Transfer.</>}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {isReimbursed ? (
                          <span data-testid={`status-reimbursed-${t.id}`}
                            className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] uppercase tracking-wider font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                            <CheckCircle size={11} weight="fill" /> Reembolsado
                          </span>
                        ) : isPending ? (
                          <span data-testid={`status-pending-${t.id}`}
                            className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] uppercase tracking-wider font-bold bg-amber-100 text-amber-800 border border-amber-300">
                            <Warning size={11} weight="bold" /> Pendiente
                          </span>
                        ) : (
                          <span className="text-slate-300 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <FileLink fileId={t.file_id} />
                      </td>
                      <td className={`px-4 py-3 text-right mono-num text-sm font-bold ${
                        t.type === "income" ? "text-emerald-700" : "text-red-700"
                      }`}>
                        {t.type === "income" ? "+" : "-"}{fmtMXN(t.amount)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex items-center gap-1">
                          <button onClick={() => openEdit(t)} data-testid={`edit-tx-${t.id}`}
                            className="text-slate-500 hover:text-brand p-1.5 hover:bg-blue-50" title="Editar">
                            <PencilSimple size={14} weight="bold" />
                          </button>
                          <button
                            onClick={() => remove(t.id)}
                            disabled={isPending}
                            data-testid={`delete-tx-${t.id}`}
                            className={`p-1.5 ${
                              isPending
                                ? "text-slate-300 cursor-not-allowed"
                                : "text-slate-400 hover:text-red-600 hover:bg-red-50"
                            }`}
                            title={
                              isPending
                                ? "No se puede eliminar: el socio aún tiene este préstamo pendiente. Registra primero el reembolso."
                                : "Eliminar"
                            }
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
                {editing ? "Editar movimiento" : "Nuevo movimiento"}
              </h3>
              <button onClick={() => { setShowForm(false); setEditing(null); }}
                className="text-slate-400 hover:text-slate-950">
                <X size={20} weight="bold" />
              </button>
            </div>
            <div className="p-6">
              <TxForm
                initial={editing}
                partners={partners}
                projects={projects}
                clients={clients}
                providers={providers}
                onSubmit={submit}
                onCancel={() => { setShowForm(false); setEditing(null); }}
                submitting={submitting}
                onCreateClient={createClient}
                onCreateProvider={createProvider}
                currentUserId={user?.id}
                incomeCategories={incomeCats}
                expenseCategories={expenseCats}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
