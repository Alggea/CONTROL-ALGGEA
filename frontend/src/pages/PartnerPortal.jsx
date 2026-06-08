import { useEffect, useState } from "react";
import api, { fmtMXN, fmtDate, fmtErr } from "@/lib/api";
import {
  Plus, X, Trash, Wallet, HandCoins, ArrowDown, Receipt, CheckCircle, Warning,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import { FileUploader } from "@/components/FileUploader";
import ExportButton from "@/components/ExportButton";

const METHODS = [
  { v: "cash", l: "Efectivo" },
  { v: "transfer", l: "Transferencia" },
];

function MethodPicker({ value, onChange, testid }) {
  return (
    <div className="grid grid-cols-2 gap-px bg-slate-200 border border-slate-200" data-testid={testid}>
      {METHODS.map((m) => (
        <button
          key={m.v}
          type="button"
          onClick={() => onChange(m.v)}
          className={`py-2.5 text-xs uppercase tracking-wider font-semibold transition-colors duration-200 ${
            value === m.v ? "bg-slate-950 text-white" : "bg-white text-slate-700 hover:bg-slate-50"
          }`}
        >
          {m.l}
        </button>
      ))}
    </div>
  );
}

function DividendForm({ partners, initialPartnerId, onSubmit, onCancel, submitting }) {
  const [form, setForm] = useState({
    partner_id: initialPartnerId || "",
    amount: "",
    payment_method: "transfer",
    description: "",
    date: new Date().toISOString().slice(0, 10),
  });

  const submit = (e) => {
    e.preventDefault();
    onSubmit({ ...form, amount: parseFloat(form.amount) });
  };

  return (
    <form onSubmit={submit} className="space-y-4" data-testid="dividend-form">
      <div>
        <label className="block text-xs uppercase tracking-wider font-semibold text-slate-700 mb-2">Socio</label>
        <select
          required
          data-testid="dividend-partner"
          value={form.partner_id}
          onChange={(e) => setForm({ ...form, partner_id: e.target.value })}
          className="w-full px-4 py-2.5 bg-white border border-slate-300 focus:border-slate-950 focus:outline-none text-sm"
        >
          <option value="">Selecciona…</option>
          {partners.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs uppercase tracking-wider font-semibold text-slate-700 mb-2">Monto MXN</label>
          <input
            data-testid="dividend-amount" type="number" step="0.01" min="0" required
            value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })}
            className="w-full px-4 py-2.5 bg-white border border-slate-300 focus:border-slate-950 focus:outline-none text-sm mono-num"
          />
        </div>
        <div>
          <label className="block text-xs uppercase tracking-wider font-semibold text-slate-700 mb-2">Fecha</label>
          <input type="date" required value={form.date}
            onChange={(e) => setForm({ ...form, date: e.target.value })}
            className="w-full px-4 py-2.5 bg-white border border-slate-300 focus:border-slate-950 focus:outline-none text-sm"
          />
        </div>
      </div>
      <div>
        <label className="block text-xs uppercase tracking-wider font-semibold text-slate-700 mb-2">Método de pago</label>
        <MethodPicker
          value={form.payment_method}
          onChange={(v) => setForm({ ...form, payment_method: v })}
          testid="dividend-method"
        />
      </div>
      <div>
        <label className="block text-xs uppercase tracking-wider font-semibold text-slate-700 mb-2">Descripción</label>
        <input value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          className="w-full px-4 py-2.5 bg-white border border-slate-300 focus:border-slate-950 focus:outline-none text-sm"
        />
      </div>
      <div className="flex justify-end gap-3 pt-2">
        <button type="button" onClick={onCancel}
          className="px-5 py-2.5 border border-slate-300 text-slate-700 text-sm font-semibold hover:bg-slate-50">
          Cancelar
        </button>
        <button type="submit" data-testid="dividend-submit" disabled={submitting}
          className="px-5 py-2.5 bg-brand text-white text-sm font-semibold hover:bg-brand-hover active:scale-[0.98] transition-all duration-200 disabled:opacity-50">
          {submitting ? "Guardando..." : "Registrar retiro"}
        </button>
      </div>
    </form>
  );
}

function ReimbursementForm({ partner, onSubmit, onCancel, submitting }) {
  const [form, setForm] = useState({
    partner_id: partner.id,
    amount: "",
    payment_method: "transfer",
    description: "Reembolso préstamo personal",
    date: new Date().toISOString().slice(0, 10),
    source_transaction_ids: [],
    partials: {},
    file_id: null,
  });
  const [pending, setPending] = useState([]);
  const [loadingPending, setLoadingPending] = useState(true);
  const [confirmManual, setConfirmManual] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get(`/partners/${partner.id}/pending-personal-expenses`);
        setPending(data.filter((t) => !t.reimbursed));
      } finally {
        setLoadingPending(false);
      }
    })();
  }, [partner.id]);

  const recomputeAmount = (nextIds, nextPartials) => {
    const sum = nextIds.reduce((s, id) => {
      const tx = pending.find((t) => t.id === id);
      const remaining = tx?.remaining_balance ?? tx?.amount ?? 0;
      const v = nextPartials[id];
      const applied = v === undefined || v === "" ? remaining : Number(v);
      return s + (isFinite(applied) ? applied : 0);
    }, 0);
    return sum > 0 ? sum.toFixed(2) : "";
  };

  const toggleTx = (tx) => {
    const selected = form.source_transaction_ids.includes(tx.id);
    const nextIds = selected
      ? form.source_transaction_ids.filter((id) => id !== tx.id)
      : [...form.source_transaction_ids, tx.id];
    const nextPartials = { ...form.partials };
    if (selected) {
      delete nextPartials[tx.id];
    } else {
      // default: full remaining
      nextPartials[tx.id] = (tx.remaining_balance ?? tx.amount).toFixed(2);
    }
    setForm({
      ...form,
      source_transaction_ids: nextIds,
      partials: nextPartials,
      amount: recomputeAmount(nextIds, nextPartials),
    });
  };

  const setPartial = (tx, value) => {
    const nextPartials = { ...form.partials, [tx.id]: value };
    setForm({
      ...form,
      partials: nextPartials,
      amount: recomputeAmount(form.source_transaction_ids, nextPartials),
    });
  };

  const hasPending = pending.length > 0;
  const noneSelected = form.source_transaction_ids.length === 0;
  const needsManualConfirm = hasPending && noneSelected;

  const submit = (e) => {
    e.preventDefault();
    if (submitting) return;
    if (needsManualConfirm && !confirmManual) {
      toast.error(
        "Hay egresos pendientes. Selecciónalos para saldarlos o confirma que es un reembolso manual sin vincular."
      );
      return;
    }
    // Build numeric partials
    const numericPartials = {};
    for (const id of form.source_transaction_ids) {
      const v = form.partials[id];
      const tx = pending.find((t) => t.id === id);
      const remaining = tx?.remaining_balance ?? tx?.amount ?? 0;
      const applied = v === undefined || v === "" ? remaining : parseFloat(v);
      if (isFinite(applied) && applied > 0) numericPartials[id] = applied;
    }
    onSubmit({
      ...form,
      amount: parseFloat(form.amount),
      partials: Object.keys(numericPartials).length ? numericPartials : null,
    });
  };

  return (
    <form onSubmit={submit} className="space-y-4" data-testid="reimbursement-form">
      <div className="bg-amber-50 border border-amber-200 p-4">
        <div className="text-xs uppercase tracking-wider font-semibold text-amber-800">
          Reembolso para {partner.name}
        </div>
        <div className="mt-1 text-sm text-amber-900">
          Préstamo pendiente: <span className="mono-num font-bold">{fmtMXN(partner.personal_payments_owed)}</span>
        </div>
      </div>

      <div>
        <label className="block text-xs uppercase tracking-wider font-semibold text-slate-700 mb-2">
          Egresos personales pendientes {hasPending ? "(selecciona y/o ajusta los montos parciales)" : ""}
        </label>
        <div className="border border-slate-200 max-h-72 overflow-y-auto" data-testid="pending-list">
          {loadingPending ? (
            <div className="p-4 text-xs text-slate-500">Cargando…</div>
          ) : pending.length === 0 ? (
            <div className="p-4 text-xs text-slate-500">No hay egresos personales pendientes vinculables.</div>
          ) : (
            pending.map((t) => {
              const selected = form.source_transaction_ids.includes(t.id);
              const remaining = t.remaining_balance ?? t.amount;
              const alreadyPaid = t.reimbursed_amount || 0;
              const partialVal = form.partials[t.id];
              return (
                <div
                  key={t.id}
                  data-testid={`pending-tx-${t.id}`}
                  className={`px-4 py-2.5 border-b border-slate-100 last:border-b-0 transition-colors duration-150 ${
                    selected ? "bg-brand/5" : ""
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => toggleTx(t)}
                    className="w-full flex items-center justify-between gap-2 text-left"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`h-4 w-4 border ${selected ? "bg-brand border-brand" : "border-slate-300"} flex items-center justify-center shrink-0`}>
                        {selected && <CheckCircle size={12} weight="fill" className="text-white" />}
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm text-slate-950 truncate">{t.description}</div>
                        <div className="text-xs text-slate-500 font-mono">
                          {fmtDate(t.date)} · total {fmtMXN(t.amount)}
                          {alreadyPaid > 0 && <> · pagado {fmtMXN(alreadyPaid)}</>}
                        </div>
                      </div>
                    </div>
                    <div className="mono-num text-sm text-amber-700 font-bold whitespace-nowrap">
                      {fmtMXN(remaining)}
                    </div>
                  </button>
                  {selected && (
                    <div className="mt-2 ml-7 flex items-center gap-2">
                      <label className="text-[10px] uppercase tracking-wider font-semibold text-slate-500">Aplicar</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0.01"
                        max={remaining}
                        value={partialVal ?? remaining.toFixed(2)}
                        onChange={(e) => setPartial(t, e.target.value)}
                        data-testid={`partial-input-${t.id}`}
                        className="w-32 px-2 py-1 bg-white border border-slate-300 focus:border-slate-950 focus:outline-none text-sm mono-num"
                      />
                      <button
                        type="button"
                        onClick={() => setPartial(t, remaining.toFixed(2))}
                        className="text-[10px] uppercase tracking-wider font-semibold text-brand hover:text-brand-hover"
                      >
                        Saldar total
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
        {needsManualConfirm && (
          <label
            className="mt-2 flex items-start gap-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 px-3 py-2 cursor-pointer"
            data-testid="manual-confirm-label"
          >
            <input
              type="checkbox"
              checked={confirmManual}
              onChange={(e) => setConfirmManual(e.target.checked)}
              className="mt-0.5"
              data-testid="manual-confirm-checkbox"
            />
            <span>
              Reembolso manual sin vincular a un egreso pendiente. <strong>Esto NO reducirá el préstamo pendiente</strong> de {partner.name}.
            </span>
          </label>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs uppercase tracking-wider font-semibold text-slate-700 mb-2">Monto total MXN</label>
          <input
            data-testid="reimbursement-amount" type="number" step="0.01" min="0" required
            value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })}
            className="w-full px-4 py-2.5 bg-white border border-slate-300 focus:border-slate-950 focus:outline-none text-sm mono-num"
          />
        </div>
        <div>
          <label className="block text-xs uppercase tracking-wider font-semibold text-slate-700 mb-2">Fecha</label>
          <input type="date" required value={form.date}
            onChange={(e) => setForm({ ...form, date: e.target.value })}
            className="w-full px-4 py-2.5 bg-white border border-slate-300 focus:border-slate-950 focus:outline-none text-sm"
          />
        </div>
      </div>
      <div>
        <label className="block text-xs uppercase tracking-wider font-semibold text-slate-700 mb-2">Método de pago</label>
        <MethodPicker
          value={form.payment_method}
          onChange={(v) => setForm({ ...form, payment_method: v })}
          testid="reimbursement-method"
        />
      </div>
      <div>
        <label className="block text-xs uppercase tracking-wider font-semibold text-slate-700 mb-2">Descripción</label>
        <input value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          className="w-full px-4 py-2.5 bg-white border border-slate-300 focus:border-slate-950 focus:outline-none text-sm"
        />
      </div>
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
        <button
          type="submit"
          data-testid="reimbursement-submit"
          disabled={submitting || (needsManualConfirm && !confirmManual)}
          className="px-5 py-2.5 bg-amber-600 text-white text-sm font-semibold hover:bg-amber-700 active:scale-[0.98] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? "Guardando..." : "Registrar reembolso"}
        </button>
      </div>
    </form>
  );
}

export default function PartnerPortal() {
  const [portal, setPortal] = useState(null);
  const [dividends, setDividends] = useState([]);
  const [reimbursements, setReimbursements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showDivForm, setShowDivForm] = useState(false);
  const [showRbForm, setShowRbForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [activePartnerId, setActivePartnerId] = useState("");
  const [historyTab, setHistoryTab] = useState("dividends"); // 'dividends' | 'reimbursements'
  const [filterPartnerId, setFilterPartnerId] = useState("");

  const reload = async () => {
    setLoading(true);
    try {
      const [p, d, r] = await Promise.all([
        api.get("/partners/portal"),
        api.get("/dividends"),
        api.get("/reimbursements"),
      ]);
      setPortal(p.data);
      setDividends(d.data);
      setReimbursements(r.data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { reload(); }, []);

  const openDividend = (partnerId) => {
    setActivePartnerId(partnerId);
    setShowDivForm(true);
  };
  const openReimbursement = (partnerId) => {
    setActivePartnerId(partnerId);
    setShowRbForm(true);
  };

  const submitDividend = async (payload) => {
    setSubmitting(true);
    try {
      await api.post("/dividends", payload);
      toast.success("Retiro registrado");
      setShowDivForm(false);
      reload();
    } catch (err) { toast.error(fmtErr(err)); }
    finally { setSubmitting(false); }
  };

  const submitReimbursement = async (payload) => {
    setSubmitting(true);
    try {
      await api.post("/reimbursements", payload);
      toast.success("Reembolso registrado");
      setShowRbForm(false);
      reload();
    } catch (err) { toast.error(fmtErr(err)); }
    finally { setSubmitting(false); }
  };

  const removeDividend = async (id) => {
    if (!window.confirm("¿Eliminar este retiro?")) return;
    try { await api.delete(`/dividends/${id}`); toast.success("Retiro eliminado"); reload(); }
    catch (e) { toast.error(fmtErr(e)); }
  };

  const removeReimbursement = async (id) => {
    if (!window.confirm("¿Eliminar este reembolso?")) return;
    try { await api.delete(`/reimbursements/${id}`); toast.success("Reembolso eliminado"); reload(); }
    catch (e) { toast.error(fmtErr(e)); }
  };

  if (loading || !portal) {
    return <div className="p-12 font-mono text-xs uppercase tracking-[0.3em] text-slate-500">Cargando…</div>;
  }

  const activePartner = portal.partners.find((p) => p.id === activePartnerId) || portal.partners[0];

  const historyList = historyTab === "dividends" ? dividends : reimbursements;
  const filteredHistory = filterPartnerId
    ? historyList.filter((x) => x.partner_id === filterPartnerId)
    : historyList;

  return (
    <div data-testid="partners-page">
      <div className="px-8 lg:px-12 pt-10 pb-8 border-b border-slate-200 bg-white flex items-end justify-between gap-6 flex-wrap">
        <div>
          <div className="font-mono text-xs uppercase tracking-[0.3em] text-slate-500 mb-2">
            Panel / 04
          </div>
          <h1 className="font-display font-black text-4xl sm:text-5xl tracking-tighter text-slate-950">
            Portal de Socios
          </h1>
          <p className="text-slate-600 mt-2 text-sm max-w-2xl">
            Distribución automática 33.33% / 33.33% / 33.33%. Retiros y reembolsos de préstamos personales descuentan directamente del efectivo / transferencia de la sociedad.
          </p>
        </div>
        <ExportButton
          endpoint="/exports/partners"
          params={{
            partner_id: filterPartnerId || undefined,
            kind: historyTab === "dividends" ? "dividends" : historyTab === "reimbursements" ? "reimbursements" : undefined,
          }}
          filename="movimientos_socios"
          testid="partners-export"
        />
      </div>

      <div className="p-8 lg:p-12 space-y-8">
        {/* Net Balance Banner */}
        <div className="bg-slate-950 text-white p-8 lg:p-10" data-testid="net-banner">
          <div className="flex items-start justify-between flex-wrap gap-6">
            <div className="flex-1 min-w-[280px]">
              <div className="font-mono text-xs uppercase tracking-[0.3em] text-slate-400 mb-2">
                Utilidad disponible (después de retiros)
              </div>
              <div className={`metric-num text-5xl lg:text-6xl ${portal.available_to_distribute < 0 ? "text-red-400" : "text-white"}`} data-testid="available-to-distribute">
                {fmtMXN(portal.available_to_distribute)}
              </div>
              <div className="mt-4 grid grid-cols-3 gap-px bg-slate-800 max-w-md">
                <div className="bg-slate-950 p-3">
                  <div className="text-[9px] uppercase tracking-wider text-slate-400">Utilidad bruta</div>
                  <div className="mono-num text-sm text-white mt-1">{fmtMXN(portal.net_balance)}</div>
                </div>
                <div className="bg-slate-950 p-3">
                  <div className="text-[9px] uppercase tracking-wider text-slate-400">− Retiros</div>
                  <div className="mono-num text-sm text-amber-300 mt-1">{fmtMXN(portal.total_dividends_withdrawn)}</div>
                </div>
                <div className="bg-slate-950 p-3">
                  <div className="text-[9px] uppercase tracking-wider text-slate-400">Reembolsos</div>
                  <div className="mono-num text-sm text-slate-300 mt-1">{fmtMXN(portal.total_reimbursements_paid)}</div>
                </div>
              </div>
              <div className="text-slate-400 text-xs mt-3 max-w-md">
                Participación bruta por socio: <span className="text-white font-semibold">{fmtMXN(portal.per_partner_share)}</span> (33.33%). Los reembolsos saldan préstamos personales y no reducen la utilidad.
              </div>
            </div>
            <div className="grid grid-cols-3 gap-px bg-slate-700">
              {portal.partners.map((p) => (
                <div key={p.id} className="bg-slate-950 p-4 min-w-[120px]" data-testid={`banner-partner-${p.id}`}>
                  <div className="h-1 w-8 mb-2" style={{ background: p.color }} />
                  <div className="text-[10px] uppercase tracking-wider text-slate-400">{p.name.split(" ")[0]}</div>
                  <div className={`mono-num text-sm mt-1 ${p.available_to_collect < 0 ? "text-red-300" : "text-white"}`}>
                    {fmtMXN(p.available_to_collect)}
                  </div>
                  <div className="text-[9px] text-slate-500 mt-0.5">disponible</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Partner cards */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {portal.partners.map((p) => (
            <div
              key={p.id}
              data-testid={`partner-card-${p.id}`}
              className={`bg-white border ${
                p.has_critical_alert
                  ? "border-red-400"
                  : p.alerts_count > 0
                  ? "border-amber-400"
                  : "border-slate-200"
              } flex flex-col`}
            >
              {p.alerts_count > 0 && (
                <div
                  data-testid={`alerts-banner-${p.id}`}
                  className={`px-4 py-2 text-xs font-semibold border-b ${
                    p.has_critical_alert
                      ? "bg-red-50 text-red-800 border-red-200"
                      : "bg-amber-50 text-amber-800 border-amber-200"
                  }`}
                >
                  <Warning size={14} weight="fill" className="inline mr-1.5 -mt-0.5" />
                  {p.has_critical_alert ? "Préstamo crítico" : "Préstamos por revisar"} ·{" "}
                  <span className="font-mono">{p.alerts_count} alerta{p.alerts_count > 1 ? "s" : ""}</span>
                </div>
              )}
              <div className="p-6 border-b border-slate-200">
                <div className="flex items-center gap-4">
                  {p.avatar_url ? (
                    <img src={p.avatar_url} alt={p.name} className="h-14 w-14 object-cover border border-slate-300" />
                  ) : (
                    <div className="h-14 w-14 bg-slate-100 flex items-center justify-center font-bold text-xl">
                      {p.name[0]}
                    </div>
                  )}
                  <div className="flex-1">
                    <div className="font-display font-bold text-lg text-slate-950">{p.name}</div>
                    <div className="text-xs text-slate-500 font-mono">{p.email}</div>
                  </div>
                  <div className="h-3 w-3" style={{ background: p.color }} />
                </div>
              </div>

              <div className="p-6 space-y-4 flex-1">
                <div className="flex items-center justify-between">
                  <div className="text-xs uppercase tracking-wider text-slate-500">Participación 33.33%</div>
                  <div className="mono-num text-sm text-slate-950 font-semibold">{fmtMXN(p.profit_share)}</div>
                </div>
                <div className="flex items-center justify-between" title="Préstamos personales pendientes (total - reembolsados)">
                  <div className="text-xs uppercase tracking-wider text-slate-500">+ Préstamos pendientes</div>
                  <div className="mono-num text-sm text-amber-700 font-semibold">{fmtMXN(p.personal_payments_owed)}</div>
                </div>
                {p.reimbursed_total > 0 && (
                  <div className="flex items-center justify-between text-xs text-slate-400 -mt-2">
                    <div className="pl-3">└ ya reembolsado</div>
                    <div className="mono-num">{fmtMXN(p.reimbursed_total)}</div>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <div className="text-xs uppercase tracking-wider text-slate-500">− Retiros</div>
                  <div className="mono-num text-sm text-slate-600 font-semibold">{fmtMXN(p.dividends_withdrawn)}</div>
                </div>

                <div className="border-t border-slate-200 pt-4 mt-4">
                  <div className="text-[10px] uppercase tracking-[0.25em] font-semibold text-slate-500 mb-2">
                    Disponible para retirar
                  </div>
                  <div
                    data-testid={`available-${p.id}`}
                    className={`metric-num text-4xl ${p.available_to_collect >= 0 ? "text-slate-950" : "text-red-700"}`}
                  >
                    {fmtMXN(p.available_to_collect)}
                  </div>
                </div>
              </div>

              <div className="p-4 border-t border-slate-200 grid grid-cols-2 gap-2">
                <button
                  data-testid={`withdraw-${p.id}`}
                  onClick={() => openDividend(p.id)}
                  className="flex items-center justify-center gap-1.5 bg-brand text-white py-2.5 text-xs uppercase tracking-wider font-semibold hover:bg-brand-hover active:scale-[0.98] transition-all duration-200"
                >
                  <HandCoins size={14} weight="bold" /> Retiro
                </button>
                <button
                  data-testid={`reimburse-${p.id}`}
                  onClick={() => openReimbursement(p.id)}
                  className="flex items-center justify-center gap-1.5 bg-amber-600 text-white py-2.5 text-xs uppercase tracking-wider font-semibold hover:bg-amber-700 active:scale-[0.98] transition-all duration-200"
                >
                  <Receipt size={14} weight="bold" /> Reembolso
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* History */}
        <div className="bg-white border border-slate-200" data-testid="history-block">
          <div className="px-6 py-5 border-b border-slate-200 flex items-center justify-between flex-wrap gap-4">
            <div>
              <div className="text-[10px] uppercase tracking-[0.25em] font-semibold text-slate-500">Historial</div>
              <h3 className="font-display font-bold text-xl text-slate-950 mt-1">Movimientos de socios</h3>
            </div>
            <div className="flex items-center gap-3">
              <select
                value={filterPartnerId}
                onChange={(e) => setFilterPartnerId(e.target.value)}
                className="px-3 py-2 border border-slate-300 bg-white text-sm focus:border-slate-950 focus:outline-none"
                data-testid="history-filter-partner"
              >
                <option value="">Todos los socios</option>
                {portal.partners.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <div className="grid grid-cols-2 gap-px bg-slate-200 border border-slate-200">
                <button
                  data-testid="tab-dividends"
                  onClick={() => setHistoryTab("dividends")}
                  className={`px-4 py-2 text-xs uppercase tracking-wider font-semibold transition-colors duration-200 ${
                    historyTab === "dividends" ? "bg-slate-950 text-white" : "bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  Retiros
                </button>
                <button
                  data-testid="tab-reimbursements"
                  onClick={() => setHistoryTab("reimbursements")}
                  className={`px-4 py-2 text-xs uppercase tracking-wider font-semibold transition-colors duration-200 ${
                    historyTab === "reimbursements" ? "bg-slate-950 text-white" : "bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  Reembolsos
                </button>
              </div>
            </div>
          </div>
          {filteredHistory.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-400">
              No hay {historyTab === "dividends" ? "retiros" : "reembolsos"} registrados.
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr className="text-[10px] uppercase tracking-wider text-slate-500">
                  <th className="text-left px-6 py-3 font-semibold">Fecha</th>
                  <th className="text-left px-6 py-3 font-semibold">Socio</th>
                  <th className="text-left px-6 py-3 font-semibold">Método</th>
                  <th className="text-left px-6 py-3 font-semibold">Descripción</th>
                  <th className="text-right px-6 py-3 font-semibold">Monto</th>
                  <th className="text-right px-6 py-3 font-semibold"></th>
                </tr>
              </thead>
              <tbody>
                {filteredHistory.map((item) => {
                  const partner = portal.partners.find((x) => x.id === item.partner_id);
                  const method = item.payment_method || "transfer";
                  const onDelete = historyTab === "dividends" ? removeDividend : removeReimbursement;
                  return (
                    <tr key={item.id} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="px-6 py-3 text-xs font-mono text-slate-600">{fmtDate(item.date)}</td>
                      <td className="px-6 py-3 text-sm">
                        {partner && (
                          <div className="inline-flex items-center gap-2">
                            <div className="h-2 w-2" style={{ background: partner.color }} />
                            <span className="text-slate-950">{partner.name}</span>
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-3 text-xs uppercase tracking-wider text-slate-500">
                        {method === "cash" ? "Efectivo" : "Transferencia"}
                      </td>
                      <td className="px-6 py-3 text-sm text-slate-600">
                        {item.description || "—"}
                        {historyTab === "reimbursements" && item.source_transaction_ids?.length > 0 && (
                          <span className="ml-2 inline-block px-1.5 py-0.5 text-[9px] uppercase tracking-wider font-bold bg-slate-100 text-slate-700 border border-slate-300">
                            {item.source_transaction_ids.length} egreso{item.source_transaction_ids.length > 1 ? "s" : ""} vinculado{item.source_transaction_ids.length > 1 ? "s" : ""}
                          </span>
                        )}
                      </td>
                      <td className={`px-6 py-3 text-right mono-num text-sm font-bold ${
                        historyTab === "reimbursements" ? "text-amber-700" : "text-slate-950"
                      }`}>
                        {fmtMXN(item.amount)}
                      </td>
                      <td className="px-6 py-3 text-right">
                        <button onClick={() => onDelete(item.id)} className="text-slate-400 hover:text-red-600 p-1">
                          <Trash size={14} weight="bold" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {showDivForm && (
        <div className="fixed inset-0 bg-slate-950/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-300 max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <h3 className="font-display font-bold text-xl text-slate-950 flex items-center gap-2">
                <Wallet size={20} weight="bold" /> Registrar retiro
              </h3>
              <button onClick={() => setShowDivForm(false)} className="text-slate-400 hover:text-slate-950">
                <X size={20} weight="bold" />
              </button>
            </div>
            <div className="p-6">
              <DividendForm
                partners={portal.partners}
                initialPartnerId={activePartnerId}
                onSubmit={submitDividend}
                onCancel={() => setShowDivForm(false)}
                submitting={submitting}
              />
            </div>
          </div>
        </div>
      )}

      {showRbForm && activePartner && (
        <div className="fixed inset-0 bg-slate-950/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-300 max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <h3 className="font-display font-bold text-xl text-slate-950 flex items-center gap-2">
                <Receipt size={20} weight="bold" /> Reembolso a socio
              </h3>
              <button onClick={() => setShowRbForm(false)} className="text-slate-400 hover:text-slate-950">
                <X size={20} weight="bold" />
              </button>
            </div>
            <div className="p-6">
              <ReimbursementForm
                partner={activePartner}
                onSubmit={submitReimbursement}
                onCancel={() => setShowRbForm(false)}
                submitting={submitting}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
