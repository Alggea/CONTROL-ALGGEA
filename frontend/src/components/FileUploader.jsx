import { useState, useRef } from "react";
import api, { fmtErr, API } from "@/lib/api";
import { Paperclip, X, FileText, Image as ImageIcon, ArrowSquareOut } from "@phosphor-icons/react";
import { toast } from "sonner";

export function FileUploader({ value, onChange, disabled }) {
  const [uploading, setUploading] = useState(false);
  const [meta, setMeta] = useState(null);
  const inputRef = useRef(null);

  const onPick = () => inputRef.current?.click();

  const onFile = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", f);
      const { data } = await api.post("/files/upload", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setMeta(data);
      onChange(data.id);
      toast.success("Comprobante subido");
    } catch (err) {
      toast.error(fmtErr(err));
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const clear = () => {
    setMeta(null);
    onChange(null);
  };

  return (
    <div data-testid="file-uploader">
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,application/pdf"
        onChange={onFile}
        className="hidden"
        data-testid="file-input"
      />
      {value || meta ? (
        <div className="flex items-center justify-between gap-3 px-3 py-2.5 bg-emerald-50 border border-emerald-200">
          <div className="flex items-center gap-2 min-w-0">
            <Paperclip size={16} weight="bold" className="text-emerald-700 shrink-0" />
            <span className="text-sm text-emerald-900 truncate">
              {meta?.original_filename || "Comprobante adjunto"}
            </span>
          </div>
          <button
            type="button"
            onClick={clear}
            disabled={disabled}
            className="text-emerald-700 hover:text-red-600 p-1"
            data-testid="file-clear"
          >
            <X size={14} weight="bold" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={onPick}
          disabled={disabled || uploading}
          data-testid="file-pick"
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 border border-dashed border-slate-300 hover:border-slate-950 text-slate-600 hover:text-slate-950 transition-colors duration-200 text-sm disabled:opacity-50"
        >
          <Paperclip size={14} weight="bold" />
          {uploading ? "Subiendo..." : "Adjuntar comprobante (JPG/PNG/PDF · máx 10MB)"}
        </button>
      )}
    </div>
  );
}

export function FileLink({ fileId }) {
  if (!fileId) return <span className="text-slate-300 text-xs">—</span>;
  const token = localStorage.getItem("access_token");
  const url = `${API}/files/${fileId}/download?auth=${encodeURIComponent(token || "")}`;
  return (
    <a
      data-testid={`file-link-${fileId}`}
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-brand hover:text-brand-hover text-xs font-semibold"
      title="Ver comprobante"
    >
      <Paperclip size={12} weight="bold" />
      <ArrowSquareOut size={10} weight="bold" />
    </a>
  );
}

export function FileBadgeIcon({ contentType }) {
  if (contentType?.includes("pdf")) return <FileText size={14} weight="bold" />;
  return <ImageIcon size={14} weight="bold" />;
}
