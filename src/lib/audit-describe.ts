/** Human-readable descriptions for audit_log rows and login sessions. */

export const TABLE_LABEL: Record<string, string> = {
  accounts: "الحسابات", documents: "الفواتير والمستندات", document_lines: "أسطر الفواتير",
  journal_entries: "القيود اليومية", journal_lines: "أسطر القيود", partners: "الزبائن والموردون",
  products: "المواد", warehouses: "المستودعات", stock_moves: "حركات المخزون", cheques: "الشيكات",
  banks: "البنوك", employees: "الموظفون", payroll_runs: "الرواتب", employee_advances: "سلف الموظفين",
  fixed_assets: "الأصول الثابتة", projects: "المشاريع", cost_centers: "مراكز الكلفة",
  currencies: "العملات", exchange_rates: "أسعار الصرف", units: "الوحدات", profiles: "المستخدمون",
  user_permissions: "الصلاحيات", tenant_settings: "الإعدادات", branches: "الفروع",
  recurring_entries: "القيود الدورية", manufacturing_orders: "أوامر التصنيع", hotel_reservations: "حجوزات الفندق",
  hotel_rooms: "غرف الفندق", pos_shifts: "ورديات نقطة البيع", product_batches: "دفعات المواد",
  attachments: "المرفقات", record_comments: "الملاحظات", tenants: "الشركات",
};

export const FIELD_LABEL: Record<string, string> = {
  name: "الاسم", code: "الرمز", doc_no: "رقم المستند", entry_no: "رقم القيد", doc_type: "نوع المستند",
  doc_date: "التاريخ", entry_date: "التاريخ", total: "الإجمالي", amount: "المبلغ", debit: "مدين", credit: "دائن",
  description: "البيان", notes: "ملاحظات", status: "الحالة", currency: "العملة", price: "السعر",
  sale_price: "سعر البيع", cost_price: "سعر الكلفة", qty: "الكمية", quantity: "الكمية", phone: "الهاتف",
  email: "البريد", full_name: "الاسم الكامل", is_posted: "مرحّل", posted: "مرحّل", credit_limit: "الحد الائتماني",
  barcode: "الباركود", address: "العنوان", is_active: "فعّال", discount_amount: "الخصم", parent_id: "الأب",
};

const HIDDEN = new Set(["id", "tenant_id", "created_at", "updated_at", "created_by", "branch_id", "search_vector"]);

type Row = Record<string, unknown> | null | undefined;

const pick = (r: Row, ...keys: string[]) => {
  for (const k of keys) { const v = r?.[k]; if (v !== null && v !== undefined && v !== "") return String(v); }
  return "";
};

export function fmtVal(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "نعم" : "لا";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

/** One-line description such as «إضافة: فاتورة/مستند رقم 104 — الإجمالي 250». */
export function describeAudit(r: { action: string; table_name: string; new_data?: unknown; old_data?: unknown }): string {
  const row = (r.new_data ?? r.old_data) as Row;
  const verb = r.action === "INSERT" ? "إضافة" : r.action === "DELETE" ? "حذف" : "تعديل";
  const what = TABLE_LABEL[r.table_name] ?? r.table_name;
  const no = pick(row, "doc_no", "entry_no", "code");
  const name = pick(row, "name", "full_name", "description", "title", "notes");
  const total = pick(row, "total", "amount");
  let s = `${verb} في ${what}`;
  if (no) s += ` رقم ${no}`;
  if (name) s += ` — ${name.slice(0, 60)}`;
  if (total) s += ` — المبلغ ${total}`;
  if (r.action === "UPDATE") {
    const n = changedFields(r.old_data as Row, r.new_data as Row).length;
    if (n) s += ` (تغيّر ${n} حقل)`;
  }
  return s;
}

export function changedFields(oldD: Row, newD: Row) {
  const keys = new Set([...Object.keys(oldD ?? {}), ...Object.keys(newD ?? {})]);
  const out: { key: string; label: string; before: string; after: string }[] = [];
  for (const k of keys) {
    if (HIDDEN.has(k)) continue;
    const a = fmtVal(oldD?.[k]); const b = fmtVal(newD?.[k]);
    if (oldD && newD && a === b) continue;
    out.push({ key: k, label: FIELD_LABEL[k] ?? k, before: oldD ? a : "", after: newD ? b : "" });
  }
  return out;
}

export type LoginEv = { id: string; user_id: string; event: string; created_at: string; ip: string | null; device: string | null; user_agent: string | null; device_id?: string | null; device_info?: Record<string, unknown> | null };
export type Session = { id: string; user_id: string; start: string; end: string | null; ip: string | null; device: string | null; user_agent: string | null; device_id?: string | null };

/** Pairs each sign-in with the same user's next sign-out (before their next sign-in). Newest first. */
export function buildSessions(events: LoginEv[]): Session[] {
  const asc = [...events].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const open = new Map<string, Session>();
  const out: Session[] = [];
  for (const e of asc) {
    if (e.event === "sign_in") {
      const s: Session = { id: e.id, user_id: e.user_id, start: e.created_at, end: null, ip: e.ip, device: e.device, user_agent: e.user_agent, device_id: e.device_id ?? null };
      open.set(e.user_id, s); out.push(s);
    } else {
      const s = open.get(e.user_id);
      if (s) { s.end = e.created_at; open.delete(e.user_id); }
      else out.push({ id: e.id, user_id: e.user_id, start: "", end: e.created_at, ip: e.ip, device: e.device, user_agent: e.user_agent, device_id: e.device_id ?? null });
    }
  }
  return out.sort((a, b) => (b.start || b.end || "").localeCompare(a.start || a.end || ""));
}

export function fmtDuration(ms: number): string {
  const m = Math.max(0, Math.round(ms / 60000));
  const h = Math.floor(m / 60), mm = m % 60;
  if (!h) return `${mm} دقيقة`;
  return mm ? `${h} ساعة و${mm} دقيقة` : `${h} ساعة`;
}
