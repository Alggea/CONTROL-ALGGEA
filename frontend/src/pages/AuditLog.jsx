import { useEffect, useState, useMemo } from "react";
import api, { fmtErr } from "@/lib/api";
import { timeAgo } from "@/components/AuditBadge";
import {
  PencilSimple, Plus, Trash, FunnelSimple, ClockCounterClockwise,
} from "@phosphor-icons/react";
import ExportButton from "@/components/ExportButton";

const ENTITY_LABELS = {
  transaction: "Transacción",
  project: "Proyecto",
  dividend: "Retiro de socio",
  reimbursement: "Reembolso a socio",
  file: "Archivo",
  hub: "Item del espacio",
  hub_comment: "Comentario",
  client: "Cliente",
  provider: "Proveedor",
  settings: "Ajuste",
  user: "Usuario / Socio",
};
const ENTITY_SOURCE = {
  transaction: "Ingresos y Egresos",
  project: "Proyectos",
  dividend: "Portal de Socios",
  reimbursement: "Portal de Socios",
  file: "Archivos",
  hub: "Espacio Socios",
  hub_comment: "Espacio Socios",
  client: "Clientes",
  provider: "Proveedores",
  settings: "Configuración",
  user: "Configuración",
};
const ACTION_LABELS = { create: "Creó", update: "Editó", delete: "Eliminó" };
const ACTION_COLORS = {
  create: "bg-emerald-100 text-emerald-800 border-emerald-300",
  update: "bg-blue-100 text-brand border-brand/40",
  delete: "bg-red-100 text-red-800 border-red-300",
};
const ENTITY_COLORS = {
  transaction: "#002FA7",
  project: "#10B981",
  dividend: "#F59E0B",
  reimbursement: "#EF4444",
  file: "#64748b",
  hub: "#8B5CF6",
  hub_comment: "#A78BFA",
  client: "#0EA5E9",
  provider: "#14B8A6",
  settings: "#475569",
  user: "#475569",
};

const ActionIcon = ({ action, size = 12 }) => {
  if (action === "create") return <Plus size={size} weight="bold" />;
  if (action === "update") return <PencilSimple size={size} weight="bold" />;
  return <Trash size={size} weight="bold" />;
};

export default function AuditLog() {
  const [logs, setLogs] = useState([]);
  const [partners, setPartners] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState({ entity_type: "", actor_id: "", action: "", date_from: "", date_to: "" });
  const [err, setErr] = useState("");

  const reload = async () => {
    setLoading(true);
    try {
      const params = Object.fromEntries(Object.entries(filter).filter(([, v]) => v));
      const [logs, prs] = await Promise.all([
        api.get("/audit-logs", { params: { ...params, limit: 300 } }),
        partners.length ? Promise.resolve({ data: partners }) : api.get("/partners"),
      ]);
      setLogs(logs.data);
      setPartners(prs.data);
    } catch (e) {
      setErr(fmtErr(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [filter.entity_type, filter.actor_id, filter.action, filter.date_from, filter.date_to]);

  const partnerById = useMemo(
    () => Object.fromEntries(partners.map((p) => [p.id, p])),
    [partners]
  );

  return (
    <div data-testid="audit-page">
      <div className="px-8 lg:px-12 pt-10 pb-8 border-b border-slate-200 bg-white flex items-end justify-between gap-6 flex-wrap">
        <div>
          <div className="font-mono text-xs uppercase tracking-[0.3em] text-slate-500 mb-2">
            Panel / 05
          </div>
          <h1 className="font-display font-black text-4xl sm:text-5xl tracking-tighter text-slate-950">
            Auditoría
          </h1>
          <p className="text-slate-600 mt-2 text-sm max-w-2xl">
            Bitácora completa de creaciones, ediciones y eliminaciones en todos los módulos. Filtra por socio, módulo o tipo de acción.
          </p>
        </div>
        <ExportButton
          endpoint="/exports/audit"
          params={{
            entity_type: filter.entity_type || undefined,
            actor_id: filter.actor_id || undefined,
            action: filter.action || undefined,
            date_from: filter.date_from || undefined,
            date_to: filter.date_to || undefined,
          }}
          filename="auditoria"
          testid="audit-export"
        />
      </div>

      <div className="p-8 lg:p-12 space-y-6">
        {/* Filters */}
        <div className="bg-white border border-slate-200 p-5 grid grid-cols-1 md:grid-cols-6 gap-4" data-testid="audit-filters">
          <div className="md:col-span-1 flex items-center gap-2 text-slate-500">
            <FunnelSimple size={16} weight="bold" />
            <span className="text-xs uppercase tracking-wider font-semibold">Filtros</span>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 mb-2">Módulo</div>
            <select
              data-testid="audit-filter-entity"
              value={filter.entity_type}
              onChange={(e) => setFilter({ ...filter, entity_type: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 bg-white text-sm focus:border-slate-950 focus:outline-none"
            >
              <option value="">Todos</option>
              {Object.entries(ENTITY_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 mb-2">Acción</div>
            <select
              data-testid="audit-filter-action"
              value={filter.action}
              onChange={(e) => setFilter({ ...filter, action: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 bg-white text-sm focus:border-slate-950 focus:outline-none"
            >
              <option value="">Todas</option>
              <option value="create">Creaciones</option>
              <option value="update">Ediciones</option>
              <option value="delete">Eliminaciones</option>
            </select>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 mb-2">Socio</div>
            <select
              data-testid="audit-filter-actor"
              value={filter.actor_id}
              onChange={(e) => setFilter({ ...filter, actor_id: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 bg-white text-sm focus:border-slate-950 focus:outline-none"
            >
              <option value="">Todos</option>
              {partners.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 mb-2">Desde</div>
            <input
              type="date"
              data-testid="audit-filter-from"
              value={filter.date_from}
              onChange={(e) => setFilter({ ...filter, date_from: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 bg-white text-sm focus:border-slate-950 focus:outline-none"
            />
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 mb-2">Hasta</div>
            <input
              type="date"
              data-testid="audit-filter-to"
              value={filter.date_to}
              onChange={(e) => setFilter({ ...filter, date_to: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 bg-white text-sm focus:border-slate-950 focus:outline-none"
            />
          </div>
        </div>

        {err && (
          <div className="px-4 py-3 bg-red-50 border border-red-200 text-red-700 text-sm">{err}</div>
        )}

        {loading ? (
          <div className="font-mono text-xs uppercase tracking-[0.3em] text-slate-500">Cargando…</div>
        ) : logs.length === 0 ? (
          <div className="bg-white border border-slate-200 p-12 text-center text-sm text-slate-400">
            No hay registros con estos filtros.
          </div>
        ) : (
          <div className="bg-white border border-slate-200" data-testid="audit-list">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <div className="text-xs uppercase tracking-wider font-semibold text-slate-500">
                {logs.length} evento{logs.length !== 1 ? "s" : ""}
              </div>
              <div className="text-xs text-slate-500 inline-flex items-center gap-1.5">
                <ClockCounterClockwise size={12} weight="bold" /> Más recientes primero
              </div>
            </div>
            <div className="divide-y divide-slate-100">
              {logs.map((log) => {
                const partner = partnerById[log.actor_id];
                return (
                  <div
                    key={log.id}
                    data-testid={`audit-row-${log.id}`}
                    className="px-6 py-4 flex items-start gap-4 hover:bg-slate-50 transition-colors duration-150"
                  >
                    <div
                      className="h-9 w-1 shrink-0"
                      style={{ background: ENTITY_COLORS[log.entity_type] || "#64748b" }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] uppercase tracking-wider font-bold border ${ACTION_COLORS[log.action]}`}
                        >
                          <ActionIcon action={log.action} />
                          {ACTION_LABELS[log.action]}
                        </span>
                        <span className="text-[10px] uppercase tracking-wider font-bold text-slate-500">
                          {ENTITY_LABELS[log.entity_type] || log.entity_type}
                        </span>
                        {ENTITY_SOURCE[log.entity_type] && (
                          <span
                            data-testid={`audit-source-${log.id}`}
                            className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] uppercase tracking-wider font-semibold bg-slate-100 text-slate-700 border border-slate-200"
                            title="Módulo donde se originó la acción"
                          >
                            <FunnelSimple size={10} weight="bold" />
                            {ENTITY_SOURCE[log.entity_type]}
                          </span>
                        )}
                      </div>
                      <div className="mt-1.5 text-sm text-slate-950">
                        <span className="font-semibold">{log.actor_name}</span>
                        <span className="text-slate-500"> {ACTION_LABELS[log.action].toLowerCase()} </span>
                        <span className="font-semibold">{(ENTITY_LABELS[log.entity_type] || "").toLowerCase()}</span>
                        {log.label && <span className="text-slate-600"> · «{log.label}»</span>}
                      </div>
                      <div className="mt-1 text-[11px] text-slate-500 font-mono inline-flex items-center gap-3">
                        <span>{new Date(log.timestamp).toLocaleString("es-MX")}</span>
                        <span className="text-slate-400">hace {timeAgo(log.timestamp)}</span>
                        <span className="text-slate-300">·</span>
                        <span className="text-slate-500">ID {log.entity_id?.slice(0, 8) || "—"}</span>
                      </div>
                    </div>
                    {partner && (
                      <div className="hidden sm:flex items-center gap-2 shrink-0">
                        <div className="h-2 w-2" style={{ background: partner.color }} />
                        {partner.avatar_url && (
                          <img
                            src={partner.avatar_url}
                            alt={partner.name}
                            className="h-8 w-8 object-cover border border-slate-200"
                          />
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
