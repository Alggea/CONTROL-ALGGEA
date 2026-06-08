# Control - Administrative Control System

## Original Problem Statement
Professional administrative control web app for a small company with 3 partners. Based on Excel structure with: Dashboard (financial summary), Project Management (with P&L), Income/Expense tracking (by partner & payment type), Partner Portal (33.33% profit distribution).

## Tech Stack
- Backend: FastAPI + MongoDB (Motor) + JWT (PyJWT) + bcrypt
- Frontend: React 19 + Tailwind CSS + Shadcn UI + Phosphor Icons + Recharts + Sonner
- Currency: MXN, Locale: es-MX
- Design: Swiss & High-Contrast (Light theme, rounded-none, Cabinet Grotesk + IBM Plex Sans)

## User Personas
- 3 business partners (Carlos, Ana, Diego) — equal 33.33% profit share
- All have full read/write access (no role hierarchy)

## Core Requirements (P0 — Phase 1 / Done)
- [x] JWT authentication for 3 seeded partner accounts
- [x] Dashboard with Income / Expenses / Net Balance / Cash & Transfer balances
- [x] Project CRUD with status (in_progress / completed) and date range
- [x] Per-project P&L calculation
- [x] Transactions (income/expense) with payment_method, category, project link, partner link, "paid personally" flag
- [x] Transaction filtering by type / partner / project / payment_method
- [x] Partner Portal: 33.33% auto distribution, dividends withdrawn, available to collect
- [x] Monthly trend chart (last 6 months)

## Implementation Log
- 2026-02-28: Initial MVP — auth, dashboard, projects, transactions, partner portal, dividends
- 2026-02-28 (later): Reembolsos — reimbursement model + payment_method on dividends, dashboard subtracts both from cash/transfer balances
- 2026-05-29: Comprobantes + Auditoría — file upload via Emergent object storage (JPG/PNG/WEBP/PDF, 10MB max), reimbursement status badges (Pendiente/Reembolsado) with green-tinted rows, full audit log (create/update/delete) with dedicated /audit page + inline "por [Socio] · hace Xh" badges
- 2026-06-01: Catálogos + Edición — Clientes & Proveedores catalogs (CRUD, search, RFC/contacto/email/teléfono/notas, delete-in-use blocked with 409), smart-search Combobox component with inline create, edit functionality for Projects/Transactions/Clients/Providers, mandatory comprobante + cliente/proveedor + proyecto on transactions
- 2026-06-01 (later): Banner socios + Filtros + Exportación — Portal de Socios banner ahora muestra "Utilidad disponible (después de retiros)" con desglose bruto/retiros/reembolsos; filtros en Proyectos (búsqueda por nombre + cliente + estado); Exportación a Excel (.xlsx) y PDF en los 5 módulos respetando filtros aplicados
- 2026-06-02: Cuentas reales + Seguridad — DB completamente vaciada · 3 cuentas reales (Ana Narvaez, Gabriel Barron, Luis Noguez) con `must_change_password=true` · endpoint `/api/auth/change-password` con validación (mín 8 chars, distinta a la actual) · página `/cambiar-contrasena` con medidor de fortaleza · forzado primer cambio · enlace "Cambiar contraseña" en sidebar · login limpio (sin texto demo, sin cuentas de prueba) · Emergent badge enviado al fondo (z-index:0, opacity:0.55)
- 2026-06-03: Iteración 5 — Comprobantes opcionales (ingresos/egresos/reembolsos) · IDs auto-incrementales de proyecto desde 1000 visibles en tabla y dropdowns · Tooltip de descripción en proyectos · Estatus extendidos (En progreso / Iniciado / Pagado / Con adeudo / Finalizado) · Carga de archivos por proyecto · Dashboard rediseñado: removida tarjeta "Saldo Neto", filtros por fecha y proyecto, sección "Reembolsos y retiros por socio" · Exportación Excel/PDF del Portal de Socios · Filtros desde/hasta en Auditoría · Fix bug: botón Reembolso ahora siempre habilitado (permite reembolso sin deuda pendiente)
- 2026-06-03 (iter 6): Iteración 6 — Dashboard: restaurada tarjeta "Saldo Neto" (eliminada "Saldo en cuenta") · Backend lock: no se puede eliminar un egreso con `paid_personally=true` hasta que esté incluido en `source_transaction_ids` de un reembolso (409 con mensaje en español) · Sidebar colapsable: toggle de hamburguesa, modo icon-only en desktop con persistencia en `localStorage`, drawer móvil con overlay · NUEVO módulo Configuración (`/configuracion`): catálogos editables `income_categories`, `expense_categories`, `payment_methods` con CRUD por fila, auto-slugify para valores y reflejo inmediato en formularios de Transacciones
- 2026-06-03 (iter 7): Iteración 7 — MultiFileUploader: ahora los archivos del proyecto se pueden adjuntar en lote desde el inicio (Ctrl/Shift) con thumbnails de imagen y placeholders PDF · FileGalleryModal: la insignia de archivos en la lista de proyectos ahora abre un visualizador con previews · Configuración: nuevo catálogo `project_statuses` editable con paleta de 8 colores; los estatus y sus colores se aplican al instante en la lista, filtros y exportaciones de Proyectos
- 2026-06-05 (iter 8): Iteración 8 — Bug fix de Reembolsos (duplicación) · `partners_portal.reimbursed_total` y `personal_payments_owed` ahora derivan de los egresos personales realmente linkeados (`source_transaction_ids`) — fuente única de verdad · nuevo campo `cash_reimbursed_total` separa el flujo de efectivo del cálculo de adeudo · validación servidor: prohibido vincular el mismo egreso a dos reembolsos (409 `'ya fue reembolsado'`), prohibido linkear egresos de otro socio o inexistentes · UI Portal: cuando hay préstamos pendientes y no se selecciona ninguno, el botón "Registrar reembolso" queda deshabilitado hasta que el usuario marque el checkbox "Reembolso manual sin vincular" (con advertencia explícita: NO reducirá el préstamo) · UI Transacciones: botón eliminar visualmente deshabilitado en filas con status "Pendiente" (slate-300 + cursor-not-allowed + tooltip explicativo) · backend ya bloqueaba con 409 desde iter 6, ahora consistente con el UI
- 2026-06-08 (iter 9): Iteración 9 — **Reembolsos parciales** (un egreso $1000 puede saldarse en $300+$500+$200): nuevo campo `partials:{tx_id: amount}` en `ReimbursementIn`, helper `_reimbursed_amount_by_tx()` agrega partials por tx (con backward-compat para registros legacy sin partials), `pending-personal-expenses` devuelve `reimbursed_amount`/`remaining_balance`/`reimbursed`. UI: input "Aplicar" editable por tx + botón "Saldar total", validación 409 cuando excede saldo · **Alertas de préstamos grandes**: nueva colección `settings_loan_alerts` (umbrales `threshold_amount=5000` / `threshold_days=30` configurables vía `GET/PUT /api/settings/loan-alerts`); cada socio en `/api/partners/portal` ahora trae `alerts[]`/`alerts_count`/`has_critical_alert`; severity `critical` cuando excede ambos umbrales, `warning` cuando excede uno. UI: borde amber/rojo + banner en tarjeta del socio · **Espacio Socios** (nuevo módulo `/espacio`): hub compartido con 4 tipos de items (note, credential, link, file), búsqueda full-text, filtro por tipo, tags, fijado, comentarios por item con authz (solo el autor borra), modelos `HubItemIn/Out` + `HubCommentIn/Out`, 7 endpoints CRUD (`GET/POST /api/hub`, `PUT/DELETE /api/hub/{id}`, `POST/DELETE /api/hub/{id}/comments/{cid}`), credenciales con password enmascarado + toggle Eye + botón copiar al portapapeles, link "Espacio Socios" en sidebar entre Portal de Socios y Auditoría · Fix infra: faltaba `frontend/tailwind.config.js` (re-creado con paleta brand + Cabinet Grotesk/IBM Plex Sans/Mono); `withCredentials:true` removido de axios (conflicto con CORS `*`)
- 2026-06-08 (iter 10): Iteración 10 — **7 mejoras solicitadas por el usuario**: (1) Badge "Parcial" (indigo) en columna Estado de transacciones con fracción `reimbursed_amount / amount`; backend ya marca status='partial' desde iter9. (2) Dashboard card "Saldo Neto" ahora muestra 3 columnas al fondo: Efectivo / Transferencia / **Saldo Alggea** (= cash + transfer; lo que realmente hay en cuentas) con icono Bank; arriba sigue el saldo neto formal. (3) Restaurada `EMERGENT_LLM_KEY` en `backend/.env` → storage de archivos funciona (uploads PDF/JPG/PNG=200). (4) Renombrado UI: "Préstamos pendientes" → **"Monto financiado"** y "Préstamos por revisar" → **"Reembolso pendiente"** (también "Préstamo crítico" → "Reembolso crítico"). (5) Filtros nuevos en `/transactions`: Cliente, Proveedor, **Ámbito** (Con proyecto / Operación sin proyecto / Todos); backend `list_transactions` acepta `?client_id`, `?provider_id`, `?scope=project|operational`. (6) Hub counts ahora vienen de nuevo endpoint `GET /api/hub/counts` (totales globales) en vez de calcularse sobre items filtrados → al filtrar por una categoría los demás conservan su count. (7) Form de movimiento: campo "Categoría" oculto cuando type=Ingreso; egresos pueden marcarse como **"Egreso de operación (sin proyecto)"** (renta, luz, impuestos, etc.) — checkbox deshabilita el select de proyecto y cambia "Categoría" → "Tipo de egreso operativo"; backend persiste `project_id=null` correctamente. Testing: backend 10/10 pytest + frontend Playwright 100% pass.




## Phase 2 Backlog (P1)
- [ ] Invoicing module (CFDI-compatible)
- [ ] Project detail view with full transaction list + KPIs timeline
- [ ] Email notifications on large expenses
- [ ] PATCH endpoints / exclude_unset on PUTs (currently full-replace)
- [ ] Password reset flow (email link)

## P2 Backlog
- [ ] Recurring expenses (auto-generate monthly)
- [ ] Budget vs actual per project
- [ ] Tax (IVA/ISR) calculations
- [ ] Multi-currency support
- [ ] Audit log / transaction history
