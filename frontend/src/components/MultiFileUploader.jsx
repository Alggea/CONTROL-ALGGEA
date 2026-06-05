import { useEffect, useState, useRef } from "react";
import api, { fmtErr, API } from "@/lib/api";
import {
  Paperclip, X, FileText, Image as ImageIcon, ArrowSquareOut, Trash, Eye,
} from "@phosphor-icons/react";
import { toast } from "sonner";

function authedDownloadUrl(fileId) {
  const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : "";
  return `${API}/files/${fileId}/download?auth=${encodeURIComponent(token || "")}`;
}

/**
 * MultiFileUploader
 *  - value: array of file_ids
 *  - onChange: (next_array) => void
 *  - testid prefix
 */
export function MultiFileUploader({ value = [], onChange, disabled, testid = "multi-file" }) {
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [metas, setMetas] = useState({}); // {file_id: meta}

  // Hydrate metas for existing file_ids
  useEffect(() => {
    const missing = (value || []).filter((id) => !metas[id]);
    if (missing.length === 0) return;
    Promise.all(
      missing.map((id) => api.get(`/files/${id}`).then((r) => [id, r.data]).catch(() => [id, null]))
    ).then((entries) => {
      setMetas((prev) => ({ ...prev, ...Object.fromEntries(entries) }));
    });
  }, [value, metas]);

  const onPick = () => inputRef.current?.click();

  const onFiles = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setUploading(true);
    const newIds = [];
    const newMetas = {};
    try {
      for (const f of files) {
        const fd = new FormData();
        fd.append("file", f);
        const { data } = await api.post("/files/upload", fd, {
          headers: { "Content-Type": "multipart/form-data" },
        });
        newIds.push(data.id);
        newMetas[data.id] = data;
      }
      setMetas((m) => ({ ...m, ...newMetas }));
      onChange([...(value || []), ...newIds]);
      toast.success(
        files.length === 1 ? "Archivo subido" : `${files.length} archivos subidos`,
      );
    } catch (err) {
      toast.error(fmtErr(err));
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const removeOne = (id) => {
    onChange((value || []).filter((x) => x !== id));
  };

  return (
    <div data-testid={`${testid}-uploader`}>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept="image/jpeg,image/png,image/webp,application/pdf"
        onChange={onFiles}
        className="hidden"
        data-testid={`${testid}-input`}
      />
      {(value || []).length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-2" data-testid={`${testid}-list`}>
          {value.map((id) => {
            const m = metas[id];
            const isImage = m?.content_type?.startsWith("image/");
            const name = m?.original_filename || `Archivo ${id.slice(0, 6)}`;
            return (
              <div
                key={id}
                className="group relative bg-slate-50 border border-slate-200 overflow-hidden"
                data-testid={`${testid}-item-${id}`}
              >
                {isImage ? (
                  <a
                    href={authedDownloadUrl(id)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block aspect-[4/3] bg-slate-100"
                  >
                    <img
                      src={authedDownloadUrl(id)}
                      alt={name}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  </a>
                ) : (
                  <a
                    href={authedDownloadUrl(id)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex flex-col items-center justify-center aspect-[4/3] bg-red-50 text-red-700 hover:bg-red-100"
                  >
                    <FileText size={28} weight="bold" />
                    <span className="text-[10px] font-mono uppercase mt-1">PDF</span>
                  </a>
                )}
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-slate-950/85 to-transparent text-white text-[10px] px-2 py-1 truncate">
                  {name}
                </div>
                {!disabled && (
                  <button
                    type="button"
                    onClick={() => removeOne(id)}
                    className="absolute top-1.5 right-1.5 p-1 bg-white/90 hover:bg-red-600 hover:text-white text-slate-700 transition-colors duration-150"
                    data-testid={`${testid}-remove-${id}`}
                    aria-label="Eliminar"
                  >
                    <Trash size={11} weight="bold" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
      <button
        type="button"
        onClick={onPick}
        disabled={disabled || uploading}
        data-testid={`${testid}-pick`}
        className="w-full flex items-center justify-center gap-2 px-4 py-3 border border-dashed border-slate-300 hover:border-slate-950 text-slate-600 hover:text-slate-950 transition-colors duration-200 text-sm disabled:opacity-50"
      >
        <Paperclip size={14} weight="bold" />
        {uploading
          ? "Subiendo..."
          : (value && value.length > 0)
            ? "Agregar más archivos (selecciona varios con Ctrl/Shift)"
            : "Adjuntar archivos (selecciona varios con Ctrl/Shift · JPG/PNG/PDF · máx 10MB c/u)"}
      </button>
    </div>
  );
}

/**
 * FileGalleryModal — visualizador para una lista de file_ids.
 */
export function FileGalleryModal({ open, onClose, fileIds = [], title = "Archivos del proyecto" }) {
  const [metas, setMetas] = useState({});

  useEffect(() => {
    if (!open) return;
    const missing = fileIds.filter((id) => !metas[id]);
    if (missing.length === 0) return;
    Promise.all(
      missing.map((id) => api.get(`/files/${id}`).then((r) => [id, r.data]).catch(() => [id, null]))
    ).then((entries) => {
      setMetas((prev) => ({ ...prev, ...Object.fromEntries(entries) }));
    });
  }, [open, fileIds, metas]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-slate-950/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white border border-slate-300 max-w-4xl w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        data-testid="file-gallery-modal"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 sticky top-0 bg-white z-10">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-slate-500">
              Visualizador
            </div>
            <h3 className="font-display font-bold text-xl text-slate-950 mt-0.5">{title}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-950 p-1"
            data-testid="file-gallery-close"
            aria-label="Cerrar"
          >
            <X size={20} weight="bold" />
          </button>
        </div>
        <div className="p-6">
          {fileIds.length === 0 ? (
            <div className="text-center text-sm text-slate-400 py-10">Este proyecto no tiene archivos.</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {fileIds.map((id) => {
                const m = metas[id];
                const isImage = m?.content_type?.startsWith("image/");
                const name = m?.original_filename || `Archivo ${id.slice(0, 6)}`;
                return (
                  <div key={id} className="bg-slate-50 border border-slate-200 overflow-hidden" data-testid={`gallery-item-${id}`}>
                    {isImage ? (
                      <a href={authedDownloadUrl(id)} target="_blank" rel="noopener noreferrer" className="block bg-slate-100">
                        <img src={authedDownloadUrl(id)} alt={name} className="w-full max-h-64 object-contain bg-white" loading="lazy" />
                      </a>
                    ) : (
                      <a href={authedDownloadUrl(id)} target="_blank" rel="noopener noreferrer" className="flex flex-col items-center justify-center h-40 bg-red-50 text-red-700 hover:bg-red-100">
                        <FileText size={44} weight="bold" />
                        <span className="text-xs font-mono uppercase mt-2">PDF</span>
                      </a>
                    )}
                    <div className="flex items-center justify-between gap-3 px-3 py-2.5 border-t border-slate-200">
                      <span className="text-xs text-slate-700 truncate">{name}</span>
                      <a
                        href={authedDownloadUrl(id)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-brand hover:text-brand-hover shrink-0 inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-semibold"
                      >
                        Abrir <ArrowSquareOut size={11} weight="bold" />
                      </a>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function GalleryTriggerButton({ count, onClick, testid }) {
  if (!count || count <= 0) {
    return <span className="text-slate-300 text-xs">—</span>;
  }
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testid}
      className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] uppercase tracking-wider font-bold bg-blue-50 text-brand border border-brand/40 hover:bg-brand hover:text-white transition-colors duration-150"
      title="Ver archivos"
    >
      <Eye size={10} weight="bold" /> {count}
    </button>
  );
}
