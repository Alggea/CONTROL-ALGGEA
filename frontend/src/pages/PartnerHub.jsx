import { useEffect, useState } from "react";
import api, { fmtDate, fmtErr, API } from "@/lib/api";
import {
  Plus, X, Trash, PencilSimple, MagnifyingGlass, PushPin, PushPinSlash,
  Note, Key, Link as LinkIcon, Paperclip, Eye, EyeSlash, Copy, ChatCircle,
  PaperPlaneTilt,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import { FileUploader, FileLink } from "@/components/FileUploader";

const TYPES = [
  { v: "note", l: "Notas", singular: "Nota", icon: Note, color: "text-slate-700" },
  { v: "credential", l: "Credenciales", singular: "Credencial", icon: Key, color: "text-amber-700" },
  { v: "link", l: "Enlaces", singular: "Enlace", icon: LinkIcon, color: "text-blue-700" },
  { v: "file", l: "Archivos", singular: "Archivo", icon: Paperclip, color: "text-emerald-700" },
];

const EMPTY = (type) => ({
  type,
  title: "",
  content: "",
  url: "",
  username: "",
  password: "",
  file_id: null,
  tags: [],
  pinned: false,
});

function TypeBadge({ type }) {
  const t = TYPES.find((x) => x.v === type) || TYPES[0];
  const Icon = t.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-[9px] uppercase tracking-wider font-bold border border-slate-300 ${t.color}`}>
      <Icon size={11} weight="bold" /> {t.singular}
    </span>
  );
}

function ItemForm({ initial, onSubmit, onCancel, submitting }) {
  const [form, setForm] = useState({ ...EMPTY(initial?.type || "note"), ...initial });
  const [tagsInput, setTagsInput] = useState((initial?.tags || []).join(", "));

  const submit = (e) => {
    e.preventDefault();
    if (!form.title.trim()) {
      toast.error("Falta el título");
      return;
    }
    const tags = tagsInput.split(",").map((t) => t.trim()).filter(Boolean);
    onSubmit({ ...form, tags });
  };

  return (
    <form onSubmit={submit} className="space-y-4" data-testid="hub-item-form">
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3">
        <div>
          <label className="block text-xs uppercase tracking-wider font-semibold text-slate-700 mb-2">Tipo</label>
          <div className="grid grid-cols-4 gap-px bg-slate-200 border border-slate-200" data-testid="hub-type-picker">
            {TYPES.map((t) => (
              <button
                key={t.v}
                type="button"
                onClick={() => setForm({ ...form, type: t.v })}
                data-testid={`hub-type-${t.v}`}
                className={`py-2 text-xs uppercase tracking-wider font-semibold transition-colors duration-200 inline-flex items-center justify-center gap-1 ${
                  form.type === t.v ? "bg-slate-950 text-white" : "bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                <t.icon size={12} weight="bold" /> {t.l}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div>
        <label className="block text-xs uppercase tracking-wider font-semibold text-slate-700 mb-2">Título *</label>
        <input
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          required
          data-testid="hub-title"
          className="w-full px-4 py-2.5 bg-white border border-slate-300 focus:border-slate-950 focus:outline-none text-sm"
        />
      </div>

      {form.type === "credential" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs uppercase tracking-wider font-semibold text-slate-700 mb-2">Usuario</label>
            <input
              value={form.username || ""}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              data-testid="hub-username"
              className="w-full px-4 py-2.5 bg-white border border-slate-300 focus:border-slate-950 focus:outline-none text-sm font-mono"
            />
          </div>
          <div>
            <label className="block text-xs uppercase tracking-wider font-semibold text-slate-700 mb-2">Contraseña</label>
            <input
              type="text"
              value={form.password || ""}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              data-testid="hub-password"
              className="w-full px-4 py-2.5 bg-white border border-slate-300 focus:border-slate-950 focus:outline-none text-sm font-mono"
            />
          </div>
        </div>
      )}

      {(form.type === "credential" || form.type === "link") && (
        <div>
          <label className="block text-xs uppercase tracking-wider font-semibold text-slate-700 mb-2">URL</label>
          <input
            type="url"
            value={form.url || ""}
            onChange={(e) => setForm({ ...form, url: e.target.value })}
            placeholder="https://..."
            data-testid="hub-url"
            className="w-full px-4 py-2.5 bg-white border border-slate-300 focus:border-slate-950 focus:outline-none text-sm"
          />
        </div>
      )}

      {form.type === "file" && (
        <div>
          <label className="block text-xs uppercase tracking-wider font-semibold text-slate-700 mb-2">Archivo</label>
          <FileUploader value={form.file_id} onChange={(id) => setForm({ ...form, file_id: id })} />
        </div>
      )}

      <div>
        <label className="block text-xs uppercase tracking-wider font-semibold text-slate-700 mb-2">
          {form.type === "note" ? "Contenido" : "Descripción / notas"}
        </label>
        <textarea
          value={form.content || ""}
          onChange={(e) => setForm({ ...form, content: e.target.value })}
          rows={form.type === "note" ? 5 : 3}
          data-testid="hub-content"
          className="w-full px-4 py-2.5 bg-white border border-slate-300 focus:border-slate-950 focus:outline-none text-sm"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3 items-end">
        <div>
          <label className="block text-xs uppercase tracking-wider font-semibold text-slate-700 mb-2">
            Tags <span className="text-slate-400 font-normal normal-case tracking-normal">(separados por coma)</span>
          </label>
          <input
            value={tagsInput}
            onChange={(e) => setTagsInput(e.target.value)}
            placeholder="sat, banco, urgente"
            data-testid="hub-tags"
            className="w-full px-4 py-2.5 bg-white border border-slate-300 focus:border-slate-950 focus:outline-none text-sm"
          />
        </div>
        <label className="inline-flex items-center gap-2 px-4 py-2.5 border border-slate-300 cursor-pointer hover:bg-slate-50 text-sm font-semibold">
          <input
            type="checkbox"
            checked={!!form.pinned}
            onChange={(e) => setForm({ ...form, pinned: e.target.checked })}
            data-testid="hub-pinned"
          />
          Fijado
        </label>
      </div>

      <div className="flex justify-end gap-3 pt-2">
        <button type="button" onClick={onCancel}
          className="px-5 py-2.5 border border-slate-300 text-slate-700 text-sm font-semibold hover:bg-slate-50">
          Cancelar
        </button>
        <button type="submit" data-testid="hub-submit" disabled={submitting}
          className="px-5 py-2.5 bg-brand text-white text-sm font-semibold hover:bg-brand-hover active:scale-[0.98] transition-all duration-200 disabled:opacity-50">
          {submitting ? "Guardando..." : "Guardar"}
        </button>
      </div>
    </form>
  );
}

function CredentialPasswordView({ value }) {
  const [show, setShow] = useState(false);
  if (!value) return <span className="text-slate-300 text-xs">—</span>;
  return (
    <div className="inline-flex items-center gap-2 font-mono text-sm">
      <span data-testid="credential-password-value" className={show ? "text-slate-950" : "tracking-widest"}>
        {show ? value : "••••••••••"}
      </span>
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        data-testid="credential-password-toggle"
        className="text-slate-500 hover:text-slate-950 p-0.5"
        title={show ? "Ocultar" : "Mostrar"}
      >
        {show ? <EyeSlash size={14} weight="bold" /> : <Eye size={14} weight="bold" />}
      </button>
      <button
        type="button"
        onClick={() => { navigator.clipboard.writeText(value); toast.success("Contraseña copiada"); }}
        className="text-slate-500 hover:text-slate-950 p-0.5"
        title="Copiar"
      >
        <Copy size={14} weight="bold" />
      </button>
    </div>
  );
}

function ItemCard({ item, onEdit, onDelete, onTogglePin, onAddComment, onDeleteComment, currentUserId }) {
  const t = TYPES.find((x) => x.v === item.type) || TYPES[0];
  const [showComments, setShowComments] = useState(false);
  const [commentText, setCommentText] = useState("");

  const submitComment = async (e) => {
    e.preventDefault();
    if (!commentText.trim()) return;
    await onAddComment(item.id, commentText.trim());
    setCommentText("");
  };

  return (
    <div
      data-testid={`hub-card-${item.id}`}
      className={`bg-white border ${item.pinned ? "border-amber-400" : "border-slate-200"} flex flex-col`}
    >
      <div className="px-5 py-4 border-b border-slate-200 flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <TypeBadge type={item.type} />
            {item.pinned && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[9px] uppercase tracking-wider font-bold bg-amber-100 text-amber-800 border border-amber-300">
                <PushPin size={10} weight="fill" /> Fijado
              </span>
            )}
          </div>
          <h3 className="font-display font-bold text-lg text-slate-950 mt-2 truncate" data-testid={`hub-card-title-${item.id}`}>
            {item.title}
          </h3>
        </div>
        <div className="inline-flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => onTogglePin(item)}
            data-testid={`hub-pin-${item.id}`}
            title={item.pinned ? "Desfijar" : "Fijar"}
            className="text-slate-400 hover:text-amber-600 p-1.5"
          >
            {item.pinned ? <PushPinSlash size={14} weight="bold" /> : <PushPin size={14} weight="bold" />}
          </button>
          <button
            type="button"
            onClick={() => onEdit(item)}
            data-testid={`hub-edit-${item.id}`}
            title="Editar"
            className="text-slate-400 hover:text-brand p-1.5"
          >
            <PencilSimple size={14} weight="bold" />
          </button>
          <button
            type="button"
            onClick={() => onDelete(item)}
            data-testid={`hub-delete-${item.id}`}
            title="Eliminar"
            className="text-slate-400 hover:text-red-600 p-1.5"
          >
            <Trash size={14} weight="bold" />
          </button>
        </div>
      </div>

      <div className="px-5 py-4 space-y-3 flex-1">
        {item.type === "credential" && (
          <div className="space-y-2">
            {item.username && (
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="text-[10px] uppercase tracking-wider text-slate-500 shrink-0">Usuario</span>
                <span className="font-mono text-slate-950 truncate">{item.username}</span>
              </div>
            )}
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="text-[10px] uppercase tracking-wider text-slate-500 shrink-0">Contraseña</span>
              <CredentialPasswordView value={item.password} />
            </div>
            {item.url && (
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="text-[10px] uppercase tracking-wider text-slate-500 shrink-0">URL</span>
                <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-brand hover:underline text-xs font-mono truncate" data-testid={`hub-url-${item.id}`}>
                  {item.url}
                </a>
              </div>
            )}
          </div>
        )}

        {item.type === "link" && item.url && (
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            data-testid={`hub-url-${item.id}`}
            className="block bg-slate-50 border border-slate-200 px-3 py-2 text-sm text-brand hover:bg-slate-100 truncate font-mono"
          >
            {item.url}
          </a>
        )}

        {item.type === "file" && item.file_id && (
          <div className="bg-emerald-50 border border-emerald-200 px-3 py-2 inline-flex items-center gap-2">
            <Paperclip size={14} weight="bold" className="text-emerald-700" />
            <span className="text-sm text-emerald-900">Archivo adjunto</span>
            <FileLink fileId={item.file_id} />
          </div>
        )}

        {item.content && (
          <p className="text-sm text-slate-700 whitespace-pre-wrap break-words" data-testid={`hub-content-${item.id}`}>
            {item.content}
          </p>
        )}

        {item.tags && item.tags.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            {item.tags.map((tag) => (
              <span key={tag} className="px-2 py-0.5 text-[10px] uppercase tracking-wider font-mono bg-slate-100 text-slate-700 border border-slate-200">
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-between text-[10px] uppercase tracking-wider text-slate-500 font-mono">
        <span>{item.created_by_name || "—"} · {fmtDate(item.created_at)}</span>
        <button
          type="button"
          onClick={() => setShowComments((s) => !s)}
          data-testid={`hub-comments-toggle-${item.id}`}
          className="inline-flex items-center gap-1 hover:text-slate-950"
        >
          <ChatCircle size={12} weight="bold" />
          {item.comments?.length || 0}
        </button>
      </div>

      {showComments && (
        <div className="border-t border-slate-200 bg-slate-50 px-5 py-3 space-y-2" data-testid={`hub-comments-${item.id}`}>
          {(item.comments || []).map((c) => (
            <div key={c.id} className="bg-white border border-slate-200 px-3 py-2 text-sm flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-[10px] uppercase tracking-wider text-slate-500 font-mono mb-0.5">
                  {c.created_by_name} · {fmtDate(c.created_at)}
                </div>
                <div className="text-slate-800 whitespace-pre-wrap break-words">{c.text}</div>
              </div>
              {c.created_by_id === currentUserId && (
                <button
                  type="button"
                  onClick={() => onDeleteComment(item.id, c.id)}
                  className="text-slate-400 hover:text-red-600 p-1 shrink-0"
                  title="Eliminar comentario"
                >
                  <Trash size={12} weight="bold" />
                </button>
              )}
            </div>
          ))}
          <form onSubmit={submitComment} className="flex items-center gap-2">
            <input
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              placeholder="Añadir comentario…"
              data-testid={`hub-comment-input-${item.id}`}
              className="flex-1 px-3 py-2 bg-white border border-slate-300 focus:border-slate-950 focus:outline-none text-sm"
            />
            <button
              type="submit"
              data-testid={`hub-comment-submit-${item.id}`}
              className="px-3 py-2 bg-slate-950 text-white hover:bg-slate-800 disabled:opacity-50"
              disabled={!commentText.trim()}
            >
              <PaperPlaneTilt size={14} weight="bold" />
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

export default function PartnerHub() {
  const [items, setItems] = useState([]);
  const [counts, setCounts] = useState({ all: 0, note: 0, credential: 0, link: 0, file: 0 });
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [filterType, setFilterType] = useState("");
  const [search, setSearch] = useState("");
  const [currentUserId, setCurrentUserId] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const me = await api.get("/auth/me");
        setCurrentUserId(me.data.id);
      } catch (e) {
        // ignore - user info not critical
      }
    })();
  }, []);

  const reloadCounts = async () => {
    try {
      const { data } = await api.get("/hub/counts");
      setCounts(data);
    } catch (e) { /* ignore */ }
  };

  const reload = async () => {
    setLoading(true);
    try {
      const params = {};
      if (filterType) params.type = filterType;
      if (search.trim()) params.q = search.trim();
      const { data } = await api.get("/hub", { params });
      setItems(data);
      reloadCounts();
    } catch (e) {
      toast.error(fmtErr(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const id = setTimeout(reload, 200);
    return () => clearTimeout(id);
  }, [filterType, search]);  // eslint-disable-line react-hooks/exhaustive-deps

  const openNew = () => { setEditing(null); setShowForm(true); };
  const openEdit = (it) => { setEditing(it); setShowForm(true); };

  const submit = async (payload) => {
    setSubmitting(true);
    try {
      if (editing) {
        await api.put(`/hub/${editing.id}`, payload);
        toast.success("Actualizado");
      } else {
        await api.post("/hub", payload);
        toast.success("Item creado");
      }
      setShowForm(false); setEditing(null);
      reload();
    } catch (e) { toast.error(fmtErr(e)); }
    finally { setSubmitting(false); }
  };

  const togglePin = async (it) => {
    try {
      await api.put(`/hub/${it.id}`, { ...it, pinned: !it.pinned });
      reload();
    } catch (e) { toast.error(fmtErr(e)); }
  };

  const remove = async (it) => {
    if (!window.confirm(`¿Eliminar "${it.title}"?`)) return;
    try {
      await api.delete(`/hub/${it.id}`);
      toast.success("Eliminado");
      reload();
    } catch (e) { toast.error(fmtErr(e)); }
  };

  const addComment = async (itemId, text) => {
    try {
      await api.post(`/hub/${itemId}/comments`, { text });
      reload();
    } catch (e) { toast.error(fmtErr(e)); }
  };

  const deleteComment = async (itemId, commentId) => {
    try {
      await api.delete(`/hub/${itemId}/comments/${commentId}`);
      reload();
    } catch (e) { toast.error(fmtErr(e)); }
  };

  const totalAll = counts.all || 0;

  return (
    <div data-testid="hub-page">
      <div className="px-8 lg:px-12 pt-10 pb-8 border-b border-slate-200 bg-white">
        <div className="flex items-end justify-between gap-6 flex-wrap">
          <div>
            <div className="font-mono text-xs uppercase tracking-[0.3em] text-slate-500 mb-2">
              Panel / 05
            </div>
            <h1 className="font-display font-black text-4xl sm:text-5xl tracking-tighter text-slate-950">
              Espacio Socios
            </h1>
            <p className="text-slate-600 mt-2 text-sm max-w-2xl">
              Comparte notas, credenciales, enlaces y archivos clave para la operación de la sociedad. Todo queda auditado.
            </p>
          </div>
          <button
            type="button"
            onClick={openNew}
            data-testid="hub-new"
            className="inline-flex items-center gap-2 px-5 py-3 bg-brand text-white text-sm font-semibold hover:bg-brand-hover active:scale-[0.98] transition-all duration-200"
          >
            <Plus size={16} weight="bold" /> Nuevo item
          </button>
        </div>
      </div>

      <div className="p-8 lg:p-12 space-y-6">
        {/* Search + filters */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex-1 min-w-[260px] relative">
            <MagnifyingGlass size={16} weight="bold" className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              placeholder="Buscar por título, contenido, tag, URL, usuario…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              data-testid="hub-search"
              className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-300 focus:border-slate-950 focus:outline-none text-sm"
            />
          </div>
          <div className="grid grid-cols-5 gap-px bg-slate-200 border border-slate-200">
            <button
              onClick={() => setFilterType("")}
              data-testid="hub-filter-all"
              className={`px-3 py-2 text-xs uppercase tracking-wider font-semibold transition-colors duration-200 ${
                !filterType ? "bg-slate-950 text-white" : "bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              Todos <span className="ml-1 opacity-60">{totalAll}</span>
            </button>
            {TYPES.map((t) => (
              <button
                key={t.v}
                onClick={() => setFilterType(t.v)}
                data-testid={`hub-filter-${t.v}`}
                className={`px-3 py-2 text-xs uppercase tracking-wider font-semibold transition-colors duration-200 inline-flex items-center gap-1.5 ${
                  filterType === t.v ? "bg-slate-950 text-white" : "bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                <t.icon size={12} weight="bold" /> {t.l} <span className="ml-1 opacity-60">{counts[t.v] || 0}</span>
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="p-12 text-center text-xs uppercase tracking-[0.3em] text-slate-500 font-mono">
            Cargando…
          </div>
        ) : items.length === 0 ? (
          <div className="bg-white border border-dashed border-slate-300 p-12 text-center" data-testid="hub-empty">
            <div className="text-sm text-slate-500">
              {search || filterType
                ? "No hay items que coincidan con tu búsqueda."
                : "Aún no hay items en el espacio. Crea el primero para empezar."}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5" data-testid="hub-grid">
            {items.map((it) => (
              <ItemCard
                key={it.id}
                item={it}
                onEdit={openEdit}
                onDelete={remove}
                onTogglePin={togglePin}
                onAddComment={addComment}
                onDeleteComment={deleteComment}
                currentUserId={currentUserId}
              />
            ))}
          </div>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-slate-950/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-300 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <h3 className="font-display font-bold text-xl text-slate-950">
                {editing ? "Editar item" : "Nuevo item del espacio"}
              </h3>
              <button onClick={() => { setShowForm(false); setEditing(null); }} className="text-slate-400 hover:text-slate-950">
                <X size={20} weight="bold" />
              </button>
            </div>
            <div className="p-6">
              <ItemForm
                initial={editing}
                onSubmit={submit}
                onCancel={() => { setShowForm(false); setEditing(null); }}
                submitting={submitting}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
