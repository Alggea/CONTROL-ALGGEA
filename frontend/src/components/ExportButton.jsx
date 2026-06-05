import { useState, useRef, useEffect } from "react";
import api, { fmtErr } from "@/lib/api";
import { DownloadSimple, FileXls, FilePdf, CaretDown } from "@phosphor-icons/react";
import { toast } from "sonner";

/**
 * Button with dropdown to export current view as Excel or PDF.
 * Downloads via axios (blob) so token stays in Authorization header.
 *
 * Props:
 *  - endpoint: e.g. "/exports/transactions"
 *  - params: object of current filters (only truthy values are sent)
 *  - filename: base name (without extension)
 *  - testid
 */
export default function ExportButton({ endpoint, params = {}, filename = "export", testid = "export" }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(null); // 'xlsx' | 'pdf' | null
  const ref = useRef(null);

  useEffect(() => {
    const onClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    if (open) document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const download = async (format) => {
    setBusy(format);
    setOpen(false);
    try {
      const cleanParams = Object.fromEntries(Object.entries(params).filter(([, v]) => v));
      const { data } = await api.get(endpoint, {
        params: { ...cleanParams, format },
        responseType: "blob",
      });
      const blob = new Blob([data], {
        type: format === "xlsx"
          ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          : "application/pdf",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      a.download = `${filename}_${stamp}.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 500);
      toast.success(`Descarga ${format.toUpperCase()} lista`);
    } catch (e) {
      toast.error(fmtErr(e) || "Error al exportar");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div ref={ref} className="relative inline-block" data-testid={testid}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        disabled={busy !== null}
        data-testid={`${testid}-trigger`}
        className="inline-flex items-center gap-2 bg-white border border-slate-900 text-slate-900 px-4 py-2.5 text-sm font-semibold hover:bg-slate-900 hover:text-white transition-colors duration-200 disabled:opacity-50"
      >
        <DownloadSimple size={14} weight="bold" />
        {busy ? `Generando ${busy.toUpperCase()}…` : "Exportar"}
        <CaretDown size={12} weight="bold" className={`transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div
          className="absolute right-0 mt-1 w-48 bg-white border border-slate-900 shadow-lg z-40"
          data-testid={`${testid}-menu`}
        >
          <button
            type="button"
            onClick={() => download("xlsx")}
            data-testid={`${testid}-xlsx`}
            className="w-full flex items-center gap-3 px-4 py-3 text-left text-sm hover:bg-emerald-50 text-slate-950 border-b border-slate-100"
          >
            <FileXls size={18} weight="bold" className="text-emerald-700" />
            <div>
              <div className="font-semibold">Excel</div>
              <div className="text-[10px] text-slate-500 uppercase tracking-wider">Hoja .xlsx</div>
            </div>
          </button>
          <button
            type="button"
            onClick={() => download("pdf")}
            data-testid={`${testid}-pdf`}
            className="w-full flex items-center gap-3 px-4 py-3 text-left text-sm hover:bg-red-50 text-slate-950"
          >
            <FilePdf size={18} weight="bold" className="text-red-700" />
            <div>
              <div className="font-semibold">PDF</div>
              <div className="text-[10px] text-slate-500 uppercase tracking-wider">Reporte .pdf</div>
            </div>
          </button>
        </div>
      )}
    </div>
  );
}
