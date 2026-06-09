import { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import api, { fmtMXN, fmtDate } from "@/lib/api";
import {
  TrendUp, TrendDown, Money, ArrowsLeftRight,
  FolderSimple, ArrowUpRight, ArrowDownRight, Receipt, FunnelSimple, Bank,
} from "@phosphor-icons/react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis,
  Tooltip, CartesianGrid, Legend,
} from "recharts";

const PageHeader = ({ eyebrow, title, subtitle, action }) => (
  <div className="px-8 lg:px-12 pt-10 pb-8 border-b border-slate-200 bg-white flex items-end justify-between gap-6">
    <div>
      <div className="font-mono text-xs uppercase tracking-[0.3em] text-slate-500 mb-2">
        {eyebrow}
      </div>
      <h1 className="font-display font-black text-4xl sm:text-5xl tracking-tighter text-slate-950">
        {title}
      </h1>
      {subtitle && <p className="text-slate-600 mt-2 text-sm max-w-2xl">{subtitle}</p>}
    </div>
    {action}
  </div>
);

const MethodBreakdown = ({ cash = 0, transfer = 0, testid, showTotal = false, totalLabel = "Saldo Alggea" }) => {
  const total = Math.abs(cash) + Math.abs(transfer);
  const cashPct = total > 0 ? (Math.abs(cash) / total) * 100 : 0;
  const transferPct = total > 0 ? (Math.abs(transfer) / total) * 100 : 0;
  const sum = cash + transfer;
  return (
    <div className="pt-3 mt-3 border-t border-slate-100" data-testid={testid}>
      <div className="h-1 w-full bg-slate-100 flex overflow-hidden">
        <div className="h-full bg-amber-500" style={{ width: `${cashPct}%` }} />
        <div className="h-full bg-brand" style={{ width: `${transferPct}%` }} />
      </div>
      <div className="grid grid-cols-2 gap-3 mt-2">
        <div className="flex items-center gap-1.5">
          <Money size={11} weight="bold" className="text-amber-600 shrink-0" />
          <div className="min-w-0">
            <div className="text-[9px] uppercase tracking-wider text-slate-500">Efectivo</div>
            <div className="mono-num text-[11px] text-slate-900 font-semibold truncate">{fmtMXN(cash)}</div>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <ArrowsLeftRight size={11} weight="bold" className="text-brand shrink-0" />
          <div className="min-w-0">
            <div className="text-[9px] uppercase tracking-wider text-slate-500">Transferencia</div>
            <div className="mono-num text-[11px] text-slate-900 font-semibold truncate">{fmtMXN(transfer)}</div>
          </div>
        </div>
      </div>
      {showTotal && (
        <div
          className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between gap-2"
          data-testid="alggea-total"
        >
          <div className="flex items-center gap-1.5">
            <Bank size={12} weight="bold" className="text-slate-900 shrink-0" />
            <div className="text-[9px] uppercase tracking-wider text-slate-500 font-semibold">{totalLabel}</div>
          </div>
          <div className={`mono-num text-sm font-bold ${sum < 0 ? "text-red-700" : "text-slate-950"}`}>
            {fmtMXN(sum)}
          </div>
        </div>
      )}
    </div>
  );
};

const MetricCard = ({ label, value, sub, icon: Icon, accent, testid, breakdown }) => (
  <div
    data-testid={testid}
    className="bg-white border border-slate-200 p-6 flex flex-col gap-3 hover:border-slate-400 transition-colors duration-200"
  >
    <div className="flex items-start justify-between">
      <div className="text-[10px] uppercase tracking-[0.25em] font-semibold text-slate-500">
        {label}
      </div>
      <div className={`p-1.5 ${accent || "bg-slate-100 text-slate-700"}`}>
        <Icon size={16} weight="bold" />
      </div>
    </div>
    <div className="metric-num text-4xl text-slate-950 break-words">{value}</div>
    {sub && <div className="text-xs text-slate-500 font-mono">{sub}</div>}
    {breakdown}
  </div>
);

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [opData, setOpData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState([]);
  const [filters, setFilters] = useState({
    date_from: "",
    date_to: "",
    project_id: "",
  });

  const params = useMemo(() => {
    const p = {};
    if (filters.date_from) p.date_from = filters.date_from;
    if (filters.date_to) p.date_to = filters.date_to;
    if (filters.project_id) p.project_id = filters.project_id;
    return p;
  }, [filters]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [summary, pj, op] = await Promise.all([
          api.get("/dashboard/summary", { params }),
          projects.length ? Promise.resolve({ data: projects }) : api.get("/projects"),
          api.get("/operations/recurring", { params: { months_back: 12 } }),
        ]);
        setData(summary.data);
        if (!projects.length) setProjects(pj.data);
        setOpData(op.data);
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line
  }, [params]);

  const resetFilters = () => setFilters({ date_from: "", date_to: "", project_id: "" });
  const hasFilters = filters.date_from || filters.date_to || filters.project_id;

  if (loading && !data) {
    return <div className="p-12 font-mono text-xs uppercase tracking-[0.3em] text-slate-500">Cargando…</div>;
  }
  if (!data) return null;

  return (
    <div data-testid="dashboard-page">
      <PageHeader
        eyebrow="Panel / 01"
        title="Resumen Financiero"
        subtitle="Vista en tiempo real de ingresos, egresos y saldos por método de pago. Todos los montos en MXN."
      />

      <div className="p-8 lg:p-12 space-y-8">
        {/* Filters */}
        <div className="bg-white border border-slate-200 p-5" data-testid="dashboard-filters">
          <div className="flex items-center gap-2 mb-4 text-slate-500">
            <FunnelSimple size={16} weight="bold" />
            <span className="text-xs uppercase tracking-wider font-semibold">Filtros del panel</span>
            {hasFilters && (
              <button
                data-testid="dashboard-filters-clear"
                onClick={resetFilters}
                className="ml-auto text-[10px] uppercase tracking-wider font-bold text-slate-500 hover:text-red-600"
              >
                Limpiar
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 mb-2">Desde</div>
              <input
                type="date"
                data-testid="dashboard-filter-from"
                value={filters.date_from}
                onChange={(e) => setFilters({ ...filters, date_from: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 bg-white text-sm focus:border-slate-950 focus:outline-none"
              />
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 mb-2">Hasta</div>
              <input
                type="date"
                data-testid="dashboard-filter-to"
                value={filters.date_to}
                onChange={(e) => setFilters({ ...filters, date_to: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 bg-white text-sm focus:border-slate-950 focus:outline-none"
              />
            </div>
            <div className="md:col-span-2">
              <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 mb-2">Proyecto</div>
              <select
                data-testid="dashboard-filter-project"
                value={filters.project_id}
                onChange={(e) => setFilters({ ...filters, project_id: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 bg-white text-sm focus:border-slate-950 focus:outline-none"
              >
                <option value="">Todos los proyectos</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.code ? `${p.code} · ${p.name}` : p.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Top Metrics (3 cards) */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-px bg-slate-200 border border-slate-200">
          <MetricCard
            testid="metric-total-income"
            label="Ingresos Totales"
            value={fmtMXN(data.total_income)}
            sub={hasFilters ? "Periodo filtrado" : "Acumulado histórico"}
            icon={TrendUp}
            accent="bg-emerald-50 text-emerald-700"
            breakdown={
              <MethodBreakdown
                cash={data.cash_income}
                transfer={data.transfer_income}
                testid="breakdown-income"
              />
            }
          />
          <MetricCard
            testid="metric-total-expenses"
            label="Egresos Totales"
            value={fmtMXN(data.total_expenses)}
            sub={hasFilters ? "Periodo filtrado" : "Acumulado histórico"}
            icon={TrendDown}
            accent="bg-red-50 text-red-700"
            breakdown={
              <MethodBreakdown
                cash={data.cash_expense}
                transfer={data.transfer_expense}
                testid="breakdown-expense"
              />
            }
          />
          <MetricCard
            testid="metric-net-balance"
            label="Saldo Neto"
            value={fmtMXN(data.real_net_balance)}
            sub="Ingresos − Egresos − Retiros − Reembolsos"
            icon={Money}
            accent="bg-slate-100 text-slate-900"
            breakdown={
              <MethodBreakdown
                cash={data.cash_balance}
                transfer={data.transfer_balance}
                testid="breakdown-net"
                showTotal
                totalLabel="Saldo Alggea"
              />
            }
          />
        </div>

        {/* Chart + Side */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-px bg-slate-200 border border-slate-200">
          <div className="bg-white p-6 lg:col-span-2" data-testid="chart-trend">
            <div className="flex items-center justify-between mb-5">
              <div>
                <div className="text-[10px] uppercase tracking-[0.25em] font-semibold text-slate-500">
                  Tendencia mensual
                </div>
                <h3 className="font-display font-bold text-xl text-slate-950 mt-1">
                  Ingresos vs Egresos
                </h3>
              </div>
            </div>
            <div className="h-72">
              {data.trend.length === 0 ? (
                <div className="h-full flex items-center justify-center text-sm text-slate-400">
                  Aún no hay transacciones registradas
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.trend} margin={{ top: 8, right: 0, left: 0, bottom: 0 }}>
                    <CartesianGrid stroke="#E4E4E7" strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="month" stroke="#71717A" fontSize={11} tickLine={false} axisLine={{ stroke: "#E4E4E7" }} />
                    <YAxis stroke="#71717A" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                    <Tooltip
                      cursor={{ fill: "#F4F4F5" }}
                      contentStyle={{ borderRadius: 0, border: "1px solid #09090B", background: "white" }}
                      formatter={(v) => fmtMXN(v)}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="income" name="Ingresos" fill="#10B981" />
                    <Bar dataKey="expenses" name="Egresos" fill="#EF4444" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          <div className="bg-white p-6" data-testid="projects-summary">
            <div className="text-[10px] uppercase tracking-[0.25em] font-semibold text-slate-500 mb-1">
              Proyectos
            </div>
            <h3 className="font-display font-bold text-xl text-slate-950 mb-5">Estado actual</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between p-4 border border-slate-200">
                <div className="flex items-center gap-3">
                  <div className="h-2 w-2 bg-brand" />
                  <div>
                    <div className="text-xs uppercase tracking-wider text-slate-500">En progreso</div>
                    <div className="metric-num text-2xl text-slate-950 mt-1">{data.projects_in_progress}</div>
                  </div>
                </div>
                <FolderSimple size={24} weight="bold" className="text-slate-300" />
              </div>
              <div className="flex items-center justify-between p-4 border border-slate-200">
                <div className="flex items-center gap-3">
                  <div className="h-2 w-2 bg-emerald-500" />
                  <div>
                    <div className="text-xs uppercase tracking-wider text-slate-500">Finalizados</div>
                    <div className="metric-num text-2xl text-slate-950 mt-1">{data.projects_completed}</div>
                  </div>
                </div>
                <FolderSimple size={24} weight="bold" className="text-slate-300" />
              </div>
              <Link
                to="/projects"
                data-testid="link-view-projects"
                className="block mt-4 text-center border border-slate-900 text-slate-900 py-2.5 text-xs uppercase tracking-wider font-semibold hover:bg-slate-900 hover:text-white transition-colors duration-200"
              >
                Ver todos los proyectos →
              </Link>
            </div>
          </div>
        </div>

        {/* Gastos Fijos / Operación widget */}
        {opData && (opData.recurring_count > 0 || opData.irregular_count > 0) && (
          <Link
            to="/operacion"
            data-testid="operations-widget"
            className={`block border ${
              opData.overdue_count > 0 ? "border-red-300 bg-red-50/60" :
              opData.upcoming_count > 0 ? "border-amber-300 bg-amber-50/60" :
              "border-slate-200 bg-white"
            } px-6 py-5 hover:border-slate-900 transition-colors duration-200`}
          >
            <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto_auto] gap-6 items-center">
              <div>
                <div className="text-[10px] uppercase tracking-[0.25em] font-semibold text-slate-500">
                  Gastos fijos · Operación
                </div>
                <div className="font-display font-bold text-xl text-slate-950 mt-1">
                  Estimado mensual: <span className="mono-num">{fmtMXN(opData.total_monthly_estimate)}</span>
                </div>
                <div className="text-xs text-slate-600 mt-1">
                  {opData.recurring_count} flujo{opData.recurring_count === 1 ? "" : "s"} recurrente{opData.recurring_count === 1 ? "" : "s"} detectado{opData.recurring_count === 1 ? "" : "s"}.
                </div>
              </div>
              {opData.overdue_count > 0 && (
                <div className="text-center px-4">
                  <div className="metric-num text-2xl text-red-700">{opData.overdue_count}</div>
                  <div className="text-[9px] uppercase tracking-wider font-semibold text-red-700 mt-1">Atrasados</div>
                </div>
              )}
              {opData.upcoming_count > 0 && (
                <div className="text-center px-4">
                  <div className="metric-num text-2xl text-amber-700">{opData.upcoming_count}</div>
                  <div className="text-[9px] uppercase tracking-wider font-semibold text-amber-700 mt-1">Próximos 7d</div>
                </div>
              )}
              <span className="text-xs font-semibold text-brand whitespace-nowrap">Ver gastos fijos →</span>
            </div>
          </Link>
        )}

        {/* Reimbursements + Dividends by partner */}
        <div className="bg-white border border-slate-200" data-testid="partner-payouts">
          <div className="px-6 py-5 border-b border-slate-200 flex items-center gap-3">
            <Receipt size={18} weight="bold" className="text-amber-600" />
            <div>
              <div className="text-[10px] uppercase tracking-[0.25em] font-semibold text-slate-500">
                Pagos a socios {hasFilters ? "(periodo filtrado)" : ""}
              </div>
              <h3 className="font-display font-bold text-xl text-slate-950 mt-1">
                Reembolsos y retiros por socio
              </h3>
            </div>
          </div>
          {data.by_partner && data.by_partner.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-slate-200">
              {data.by_partner.map((p) => (
                <div key={p.id} className="bg-white p-5" data-testid={`payout-partner-${p.id}`}>
                  <div className="flex items-center gap-3 mb-4">
                    {p.avatar_url ? (
                      <img src={p.avatar_url} alt={p.name} className="h-10 w-10 object-cover border border-slate-300" />
                    ) : (
                      <div className="h-10 w-10 bg-slate-100 flex items-center justify-center font-bold">
                        {p.name?.[0]}
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="font-semibold text-sm text-slate-950 truncate">{p.name}</div>
                      <div className="h-1 w-8 mt-1" style={{ background: p.color }} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-500">Reembolsos</div>
                      <div className="mono-num text-sm text-amber-700 font-bold" data-testid={`payout-reimbursement-${p.id}`}>
                        {fmtMXN(p.reimbursements_total || 0)}
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-500">Retiros</div>
                      <div className="mono-num text-sm text-slate-700 font-bold" data-testid={`payout-dividend-${p.id}`}>
                        {fmtMXN(p.dividends_total || 0)}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-8 text-center text-sm text-slate-400">Aún no hay pagos a socios en este periodo.</div>
          )}
        </div>

        {/* Recent */}
        <div className="bg-white border border-slate-200" data-testid="recent-tx">
          <div className="px-6 py-5 border-b border-slate-200 flex items-center justify-between">
            <div>
              <div className="text-[10px] uppercase tracking-[0.25em] font-semibold text-slate-500">
                Bitácora
              </div>
              <h3 className="font-display font-bold text-xl text-slate-950 mt-1">
                Movimientos recientes
              </h3>
            </div>
            <Link to="/transactions" className="text-xs uppercase tracking-wider font-semibold text-brand hover:text-brand-hover">
              Ver todo →
            </Link>
          </div>
          {data.recent_transactions.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-400">No hay transacciones aún</div>
          ) : (
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr className="text-[10px] uppercase tracking-wider text-slate-500">
                  <th className="text-left px-6 py-3 font-semibold">Tipo</th>
                  <th className="text-left px-6 py-3 font-semibold">Descripción</th>
                  <th className="text-left px-6 py-3 font-semibold">Método</th>
                  <th className="text-left px-6 py-3 font-semibold">Fecha</th>
                  <th className="text-right px-6 py-3 font-semibold">Monto</th>
                </tr>
              </thead>
              <tbody>
                {data.recent_transactions.map((t) => (
                  <tr key={t.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-6 py-4">
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
                    <td className="px-6 py-4 text-sm text-slate-950">{t.description}</td>
                    <td className="px-6 py-4 text-xs uppercase tracking-wider text-slate-500">
                      {t.payment_method === "cash" ? "Efectivo" : "Transferencia"}
                    </td>
                    <td className="px-6 py-4 text-xs text-slate-500 font-mono">{fmtDate(t.date)}</td>
                    <td className={`px-6 py-4 text-right mono-num text-sm font-semibold ${t.type === "income" ? "text-emerald-700" : "text-red-700"}`}>
                      {t.type === "income" ? "+" : "-"}{fmtMXN(t.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
