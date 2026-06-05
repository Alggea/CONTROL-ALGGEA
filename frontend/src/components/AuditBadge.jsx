import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Clock } from "@phosphor-icons/react";

const RELATIVE_DIVS = [
  { limit: 60, divisor: 1, unit: "s" },
  { limit: 3600, divisor: 60, unit: "m" },
  { limit: 86400, divisor: 3600, unit: "h" },
  { limit: 2592000, divisor: 86400, unit: "d" },
];
export function timeAgo(iso) {
  if (!iso) return "—";
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 5) return "ahora";
  for (const d of RELATIVE_DIVS) {
    if (diff < d.limit) return `${Math.floor(diff / d.divisor)}${d.unit}`;
  }
  return `${Math.floor(diff / 2592000)}mes`;
}

export function AuditBadge({ tx }) {
  if (!tx) return null;
  const author = tx.updated_by_name || tx.created_by_name;
  const when = tx.updated_at || tx.created_at;
  const edited = !!tx.updated_at;
  if (!author) return null;
  return (
    <div
      className="flex items-center gap-1 text-[10px] text-slate-500 mt-0.5"
      title={`${edited ? "Editado" : "Creado"} por ${author} · ${new Date(when).toLocaleString("es-MX")}`}
    >
      <Clock size={9} weight="bold" />
      <span>{edited ? "Editado" : ""} por {author.split(" ")[0]} · {timeAgo(when)}</span>
    </div>
  );
}

export function useAuditRecent(entityType, entityId, refreshKey) {
  const [log, setLog] = useState(null);
  useEffect(() => {
    if (!entityType || !entityId) return;
    (async () => {
      try {
        const { data } = await api.get("/audit-logs", {
          params: { entity_type: entityType, limit: 30 },
        });
        const match = data.find((l) => l.entity_id === entityId);
        setLog(match);
      } catch (_e) { /* noop */ }
    })();
  }, [entityType, entityId, refreshKey]);
  return log;
}
