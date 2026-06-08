import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api, { fmtMXN, fmtDate, fmtErr } from "@/lib/api";
import {
  Receipt, Warning, Clock, CheckCircle, TrendUp, ChartBar, ArrowsClockwise,
  Calendar,
} from "@phosphor-icons/react";
import { toast } from "sonner";

const STATUS_META = {
  overdue: { label: "Atrasado", color: "bg-red-100 text-red-800 border-red-300", Icon: Warning, accent: "border-red-400" },
  due: { label: "Vence hoy", color: "bg-orange-100 text-orange-800 border-orange-300", Icon: Clock, accent: "border-orange-400" },
  upcoming: { label: "Próximo", color: "bg-amber-100 text-amber-800 border-amber-300", Icon: Clock, accent: "border-amber-300" },
  on_track: { label: "Al día", color: "bg-emerald-100 text-emerald-800 border-emerald-300", Icon: CheckCircle, accent: "border-emerald-300" },
  irregular: { label: "Irregular", color: "bg-slate-100 text-slate-700 border-slate-300", Icon: ArrowsClockwise, accent: "border-slate-200" },
  unknown: { label: "Sin datos", color: "bg-slate-100 text-slate-500 border-slate-300", Icon: ArrowsClockwise, accent: "border-slate-200" },
};

function StatCard({ label, value, sub, icon: Icon, accent, testid }) {
  return (
    <div data-testid={testid} className="bg-white border border-slate-200 p-6 flex flex-col gap-3">
      <div className="flex items-start justify-between">
        <div className="text-[10px] uppercase tracking-[0.25em] font-semibold text-slate-500">{label}</div>
        <div className={`p-1.5 ${accent || "bg-slate-100 text-slate-700"}`}>
          <Icon size={16} weight="bold" />
        </div>
      </div>
      <div className="metric-num text-4xl text-slate-950 break-words">{value}</div>
      {sub && <div className="text-xs text-slate-500 font-mono">{sub}</div>}
    </div>
  );
}

function RecurringRow({ g }) {
  const meta = STATUS_META[g.status] || STATUS_META.unknown;
  const SIcon = meta.Icon;
  const days = g.days_until_next;
  const daysCopy =
    days === null || days === undefined ? "—" :
    days < 0 ? `Hace ${Math.abs(days)} días` :
    days === 0 ? "Hoy" :
    `En ${days} días`;

  return (
    <tr
      data-testid={`recurring-row-${g.provider_id}`}
      className={`border-b border-slate-100 hover:bg-slate-50`}
    >
      <td className="px-4 py-3">
        <div className="text-sm font-semibold text-slate-950">{g.provider_name}</div>
        {g.provider_rfc && (
          <div className="text-[10px] text-slate-500 font-mono mt-0.5">{g.provider_rfc}</div>
        )}
      </td>
      <td className="px-4 py-3 text-xs uppercase tracking-wider text-slate-600 font-semibold">
        {g.category}
      </td>
      <td className="px-4 py-3">
        <span
          data-testid={`frequency-${g.provider_id}`}
          className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] uppercase tracking-wider font-bold border ${
            g.is_recurring ? "bg-indigo-50 text-indigo-800 border-indigo-300" : "bg-slate-100 text-slate-600 border-slate-300"
          }`}
        >
          <ArrowsClockwise size={11} weight="bold" /> {g.frequency_label}
        </span>
        <div className="text-[10px] text-slate-500 font-mono mt-1">{g.occurrences} pagos · ~{g.avg_interval_days}d</div>
      </td>
      <td className="px-4 py-3 mono-num text-sm text-slate-950 text-right">
        {fmtMXN(g.avg_amount)}
        <div className="text-[10px] text-slate-500 font-mono mt-0.5">último {fmtMXN(g.last_amount)}</div>
      </td>
      <td className="px-4 py-3 text-xs text-slate-700">
        <div className="font-mono">{fmtDate(g.last_date)}</div>
      </td>
      <td className="px-4 py-3 text-xs text-slate-700">
        {g.next_expected_date ? (
          <>
            <div className="font-mono">{fmtDate(g.next_expected_date)}</div>
            <div className={`text-[10px] mt-0.5 ${
              g.status === "overdue" ? "text-red-700 font-semibold" :
              g.status === "due" ? "text-orange-700 font-semibold" :
              g.status === "upcoming" ? "text-amber-700 font-semibold" :
              "text-slate-500"
            } font-mono`}>{daysCopy}</div>
          </>
        ) : <span className="text-slate-300">—</span>}
      </td>
      <td className="px-4 py-3">
        <span
          data-testid={`status-${g.provider_id}`}
          className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] uppercase tracking-wider font-bold border ${meta.color}`}
        >
          <SIcon size={11} weight={g.status === "overdue" || g.status === "due" ? "fill" : "bold"} /> {meta.label}
        </span>
      </td>
      <td className="px-4 py-3 text-right">
        <Link
          to={`/transactions?provider=${g.provider_id}&scope=operational`}
          data-testid={`view-history-${g.provider_id}`}
          className="text-xs font-semibold text-brand hover:underline whitespace-nowrap"
        >
          Ver historial →
        </Link>
      </td>
    </tr>
  );
}

export default function Operations() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get("/operations/recurring", { params: { months_back: 12 } });
        if (!cancelled) setData(data);
      } catch (e) {
        if (!cancelled) toast.error(fmtErr(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (loading) return (
    <div className="p-12 text-center text-xs uppercase tracking-[0.3em] text-slate-500 font-mono">
      Cargando…
    </div>
  );

  const groups = (data?.groups || []).filter((g) =>
    !filterStatus ? true : g.status === filterStatus
  );

  const counts = {
    all: data?.groups?.length || 0,
    overdue: data?.overdue_count || 0,
    upcoming: data?.upcoming_count || 0,
    on_track: (data?.groups || []).filter((g) => g.status === "on_track").length,
    irregular: data?.irregular_count || 0,
  };

  return (
    <div data-testid="operations-page">
      <div className="px-8 lg:px-12 pt-10 pb-8 border-b border-slate-200 bg-white">
        <div className="font-mono text-xs uppercase tracking-[0.3em] text-slate-500 mb-2">
          Panel / 06
        </div>
        <h1 className="font-display font-black text-4xl sm:text-5xl tracking-tighter text-slate-950">
          Gastos Fijos
        </h1>
        <p className="text-slate-600 mt-2 text-sm max-w-3xl">
          Detección automática de egresos operativos recurrentes (sin proyecto). El sistema agrupa por proveedor,
          calcula la frecuencia y predice el próximo pago para que ningún gasto te tome por sorpresa.
        </p>
      </div>

      <div className="p-8 lg:p-12 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-px bg-slate-200 border border-slate-200">
          <StatCard
            testid="stat-monthly"
            label="Estimado mensual fijo"
            value={fmtMXN(data?.total_monthly_estimate || 0)}
            sub={`Basado en ${data?.recurring_count || 0} flujos recurrentes`}
            icon={ChartBar}
            accent="bg-indigo-50 text-indigo-700"
          />
          <StatCard
            testid="stat-overdue"
            label="Pagos atrasados"
            value={String(counts.overdue)}
            sub="Más de 7 días sin pagar el ciclo esperado"
            icon={Warning}
            accent="bg-red-50 text-red-700"
          />
          <StatCard
            testid="stat-upcoming"
            label="Próximos 7 días"
            value={String(counts.upcoming)}
            sub="Programados o por vencer"
            icon={Clock}
            accent="bg-amber-50 text-amber-700"
          />
          <StatCard
            testid="stat-recurring"
            label="Flujos recurrentes"
            value={String(data?.recurring_count || 0)}
            sub={`${data?.irregular_count || 0} irregulares detectados`}
            icon={Receipt}
            accent="bg-emerald-50 text-emerald-700"
          />
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2 flex-wrap">
          {[
            { v: "", l: "Todos", n: counts.all },
            { v: "overdue", l: "Atrasados", n: counts.overdue },
            { v: "due", l: "Vencen hoy" },
            { v: "upcoming", l: "Próximos" },
            { v: "on_track", l: "Al día", n: counts.on_track },
            { v: "irregular", l: "Irregulares", n: counts.irregular },
          ].map((b) => (
            <button
              key={b.v}
              onClick={() => setFilterStatus(b.v)}
              data-testid={`filter-${b.v || "all"}`}
              className={`px-3 py-2 text-xs uppercase tracking-wider font-semibold border transition-colors duration-200 ${
                filterStatus === b.v
                  ? "bg-slate-950 text-white border-slate-950"
                  : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
              }`}
            >
              {b.l}{typeof b.n === "number" ? <span className="ml-1.5 opacity-60">{b.n}</span> : null}
            </button>
          ))}
        </div>

        {/* Table */}
        {groups.length === 0 ? (
          <div className="bg-white border border-dashed border-slate-300 p-12 text-center" data-testid="operations-empty">
            <Calendar size={32} weight="bold" className="text-slate-400 mx-auto mb-3" />
            <div className="text-sm text-slate-600 max-w-md mx-auto">
              {data?.groups?.length === 0 ? (
                <>
                  Aún no hay suficientes egresos operativos para detectar patrones. Registra al menos 2 pagos del mismo proveedor (sin proyecto)
                  y vuelve aquí para ver la proyección.
                </>
              ) : (
                <>No hay flujos con este filtro. Cambia la categoría para ver otros estados.</>
              )}
            </div>
          </div>
        ) : (
          <div className="bg-white border border-slate-200 overflow-x-auto" data-testid="recurring-table">
            <table className="w-full min-w-[1100px]">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr className="text-[10px] uppercase tracking-wider text-slate-500">
                  <th className="text-left px-4 py-3 font-semibold">Proveedor</th>
                  <th className="text-left px-4 py-3 font-semibold">Categoría</th>
                  <th className="text-left px-4 py-3 font-semibold">Frecuencia</th>
                  <th className="text-right px-4 py-3 font-semibold">Promedio</th>
                  <th className="text-left px-4 py-3 font-semibold">Último pago</th>
                  <th className="text-left px-4 py-3 font-semibold">Próximo esperado</th>
                  <th className="text-left px-4 py-3 font-semibold">Estado</th>
                  <th className="text-right px-4 py-3 font-semibold"></th>
                </tr>
              </thead>
              <tbody>
                {groups.map((g) => <RecurringRow key={g.provider_id} g={g} />)}
              </tbody>
            </table>
          </div>
        )}

        <div className="bg-slate-50 border border-slate-200 p-4 text-xs text-slate-600 leading-relaxed">
          <strong className="text-slate-950">¿Cómo se detectan?</strong> Tomamos los egresos sin proyecto (operativos) de los últimos 12 meses,
          los agrupamos por proveedor y calculamos el intervalo promedio entre pagos. Si está entre 25–35 días → <em>Mensual</em>;
          55–65 → <em>Bimestral</em>; 85–95 → <em>Trimestral</em>; etc. Necesitamos ≥2 pagos para empezar a estimar.
        </div>
      </div>
    </div>
  );
}
