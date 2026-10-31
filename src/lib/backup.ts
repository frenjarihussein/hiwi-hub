import * as XLSX from "xlsx";

/** Arabic sheet names for each backed-up table. */
export const SHEET_AR: Record<string, string> = {
  tenants: "بيانات الشركة",
  tenant_settings: "الإعدادات",
  tenant_features: "الواجهات",
  profiles: "المستخدمون",
  user_permissions: "الصلاحيات",
  accounts: "شجرة الحسابات",
  warehouses: "المستودعات",
  products: "المواد",
  partners: "الزبائن والموردون",
  projects: "المشاريع",
  boq_items: "جداول الكميات",
  project_milestones: "مراحل المشاريع",
  project_expenses: "مصاريف المشاريع",
  banks: "البنوك",
  cheques: "الشيكات",
  fixed_assets: "الأصول الثابتة",
  exchange_rates: "أسعار الصرف",
  documents: "المستندات",
  document_lines: "بنود المستندات",
  journal_entries: "قيود اليومية",
  journal_lines: "بنود القيود",
  stock_moves: "حركات المخزون",
  subscription_history: "سجل الاشتراك",
  tenant_payments: "الدفعات",
  units: "الوحدات",
  recurring_entries: "القيود الدورية",
  employees: "الموظفون",
  employee_advances: "سلف الموظفين",
  employee_leaves: "إجازات الموظفين",
  employee_adjustments: "تعديلات الرواتب",
  payroll_runs: "مسيرات الرواتب",
  attachments: "المرفقات",
  notifications: "الإشعارات",
  currencies: "العملات",
  branches: "الفروع",
  cost_centers: "مراكز الكلفة",
  hotel_rooms: "غرف الفندق",
  hotel_reservations: "حجوزات الفندق",
  manufacturing_orders: "أوامر التصنيع",
  manufacturing_materials: "مواد التصنيع",
  product_recipes: "وصفات المواد",
  product_batches: "دفعات المواد",
  batch_consumptions: "استهلاك الدفعات",
  pos_shifts: "ورديات البيع",
  user_cash_drawers: "صناديق المستخدمين",
  record_comments: "الملاحظات",
  approval_requests: "طلبات الموافقة",
  partner_inquiries: "استفسارات الشركاء",
  tenant_members: "أعضاء الشركة",
};

/** Report sheets added to the backup file; ignored on restore. */
const REPORT_SHEETS = ["ميزان المراجعة", "قائمة الدخل", "الميزانية العمومية", "كشوف الحسابات"];

type Row = Record<string, unknown>;
const num = (v: unknown) => Number(v) || 0;
const r2 = (n: number) => Math.round(n * 100) / 100;

function buildReports(data: Record<string, Row[]>) {
  const accounts = (data["accounts"] ?? []) as Row[];
  const entries = new Map(((data["journal_entries"] ?? []) as Row[]).map((e) => [String(e["id"]), e]));
  const lines = ((data["journal_lines"] ?? []) as Row[]).slice().sort((a, b) => {
    const ea = entries.get(String(a["entry_id"])), eb = entries.get(String(b["entry_id"]));
    return String(ea?.["entry_date"] ?? "").localeCompare(String(eb?.["entry_date"] ?? "")) || num(ea?.["entry_no"]) - num(eb?.["entry_no"]);
  });
  const byId = new Map(accounts.map((a) => [String(a["id"]), a]));
  const tot = new Map<string, { d: number; c: number }>();
  for (const l of lines) {
    const k = String(l["account_id"]);
    const t = tot.get(k) ?? { d: 0, c: 0 };
    t.d += num(l["debit"]); t.c += num(l["credit"]);
    tot.set(k, t);
  }
  // Roll leaf totals up to every parent group.
  const roll = new Map<string, { d: number; c: number }>();
  for (const [k, t] of tot) {
    let cur: string | undefined = k; const seen = new Set<string>();
    while (cur && !seen.has(cur)) {
      seen.add(cur);
      const r = roll.get(cur) ?? { d: 0, c: 0 };
      r.d += t.d; r.c += t.c; roll.set(cur, r);
      cur = byId.get(cur)?.["parent_id"] ? String(byId.get(cur)!["parent_id"]) : undefined;
    }
  }
  const sorted = accounts.slice().sort((a, b) => String(a["code"]).localeCompare(String(b["code"])));
  const NAT: Record<string, string> = { assets: "أصول", liabilities: "خصوم", equity: "حقوق ملكية", revenues: "إيرادات", expenses: "مصاريف", cost_centers: "مراكز كلفة", closing: "حسابات ختامية", balance_sheet: "ميزانية", profit_loss: "أرباح وخسائر" };

  const tb: unknown[][] = [["رمز الحساب", "اسم الحساب", "النوع", "تجميعي", "مجموع مدين", "مجموع دائن", "رصيد مدين", "رصيد دائن"]];
  let sd = 0, sc = 0, bd = 0, bc = 0;
  for (const a of sorted) {
    const t = roll.get(String(a["id"]));
    if (!t) continue;
    const bal = t.d - t.c;
    tb.push([a["code"], a["name"], NAT[String(a["nature"])] ?? a["nature"], a["is_group"] ? "نعم" : "لا", r2(t.d), r2(t.c), bal > 0 ? r2(bal) : 0, bal < 0 ? r2(-bal) : 0]);
    if (!a["is_group"]) { sd += t.d; sc += t.c; if (bal > 0) bd += bal; else bc -= bal; }
  }
  tb.push(["", "الإجمالي", "", "", r2(sd), r2(sc), r2(bd), r2(bc)]);

  const leafBal = (nature: string[]) => sorted.filter((a) => !a["is_group"] && nature.includes(String(a["nature"]))).map((a) => {
    const t = tot.get(String(a["id"])); return { a, bal: t ? t.d - t.c : 0 };
  }).filter((x) => Math.abs(x.bal) > 0.0001);

  const rev = leafBal(["revenues"]), exp = leafBal(["expenses"]);
  const revT = rev.reduce((s, x) => s - x.bal, 0), expT = exp.reduce((s, x) => s + x.bal, 0);
  const is: unknown[][] = [["البند", "رمز الحساب", "اسم الحساب", "المبلغ"], ["الإيرادات", "", "", ""]];
  rev.forEach((x) => is.push(["", x.a["code"], x.a["name"], r2(-x.bal)]));
  is.push(["إجمالي الإيرادات", "", "", r2(revT)], ["المصاريف", "", "", ""]);
  exp.forEach((x) => is.push(["", x.a["code"], x.a["name"], r2(x.bal)]));
  is.push(["إجمالي المصاريف", "", "", r2(expT)], ["صافي الربح / (الخسارة)", "", "", r2(revT - expT)]);

  const bs: unknown[][] = [["البند", "رمز الحساب", "اسم الحساب", "المبلغ"]];
  const sect = (title: string, nat: string, sign: number) => {
    bs.push([title, "", "", ""]);
    const xs = leafBal([nat]); let s = 0;
    xs.forEach((x) => { s += sign * x.bal; bs.push(["", x.a["code"], x.a["name"], r2(sign * x.bal)]); });
    bs.push([`إجمالي ${title}`, "", "", r2(s)]); return s;
  };
  const A = sect("الأصول", "assets", 1), L = sect("الخصوم", "liabilities", -1), E = sect("حقوق الملكية", "equity", -1);
  bs.push(["صافي ربح الفترة", "", "", r2(revT - expT)], ["إجمالي الخصوم وحقوق الملكية", "", "", r2(L + E + revT - expT)], ["الفرق", "", "", r2(A - (L + E + revT - expT))]);

  const st: unknown[][] = [["رمز الحساب", "اسم الحساب", "التاريخ", "رقم القيد", "البيان", "مدين", "دائن", "الرصيد"]];
  const perAcc = new Map<string, Row[]>();
  for (const l of lines) { const k = String(l["account_id"]); (perAcc.get(k) ?? perAcc.set(k, []).get(k)!).push(l); }
  for (const a of sorted) {
    const ls = perAcc.get(String(a["id"]));
    if (!ls?.length) continue;
    let bal = 0, d = 0, c = 0;
    for (const l of ls) {
      const e = entries.get(String(l["entry_id"]));
      d += num(l["debit"]); c += num(l["credit"]); bal += num(l["debit"]) - num(l["credit"]);
      st.push([a["code"], a["name"], e?.["entry_date"] ?? "", e?.["entry_no"] ?? "", l["description"] || e?.["description"] || "", r2(num(l["debit"])), r2(num(l["credit"])), r2(bal)]);
    }
    st.push([a["code"], `إجمالي ${a["name"]}`, "", "", "", r2(d), r2(c), r2(bal)], []);
  }
  return [tb, is, bs, st];
}

/** Arabic column headers; unknown columns keep their original name. */
const COL_AR: Record<string, string> = {
  id: "المعرف",
  tenant_id: "معرف الشركة",
  code: "الرمز",
  name: "الاسم",
  parent_id: "معرف الأب",
  is_group: "تجميعي",
  notes: "ملاحظات",
  created_at: "تاريخ الإنشاء",
  is_active: "نشط",
  nature: "النوع",
  currency: "العملة",
  entry_no: "رقم القيد",
  entry_date: "تاريخ القيد",
  description: "البيان",
  exchange_rate: "سعر الصرف",
  doc_type: "نوع المستند",
  doc_no: "رقم المستند",
  doc_date: "تاريخ المستند",
  debit: "مدين",
  credit: "دائن",
  account_id: "معرف الحساب",
  partner_id: "معرف الجهة",
  project_id: "معرف المشروع",
  entry_id: "معرف القيد",
  qty: "الكمية",
  unit_price: "سعر الوحدة",
  unit_cost: "تكلفة الوحدة",
  amount: "المبلغ",
  status: "الحالة",
  phone: "الهاتف",
  address: "العنوان",
  unit: "الوحدة",
  sku: "رمز المادة",
  barcode: "الباركود",
  category: "التصنيف",
  warehouse_id: "معرف المستودع",
  product_id: "معرف المادة",
  document_id: "معرف المستند",
  direction: "الاتجاه",
  move_date: "تاريخ الحركة",
  reference: "المرجع",
  location: "الموقع",
  partner_type: "نوع الجهة",
  email: "البريد",
  full_name: "الاسم الكامل",
  audited: "مدقق",
};
const AR_COL: Record<string, string> = Object.fromEntries(Object.entries(COL_AR).map(([k, v]) => [v, k]));
const AR_SHEET: Record<string, string> = Object.fromEntries(Object.entries(SHEET_AR).map(([k, v]) => [v, k]));

type Data = Record<string, Record<string, unknown>[]>;

export function downloadBackupXlsx(data: Data, filename: string) {
  const wb = XLSX.utils.book_new();
  wb.Workbook = { Views: [{ RTL: true }] };
  for (const [table, rows] of Object.entries(data)) {
    const cols = Array.from(new Set(rows.flatMap((r) => Object.keys(r))));
    const aoa: unknown[][] = [cols.map((c) => COL_AR[c] ?? c)];
    for (const r of rows) {
      aoa.push(cols.map((c) => {
        const v = r[c];
        if (v === null || v === undefined) return "";
        const s = typeof v === "object" ? JSON.stringify(v) : v;
        // Excel cells are limited to 32767 characters; truncate longer values.
        return typeof s === "string" && s.length > 32767 ? s.slice(0, 32767) : s;
      }));
    }
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = cols.map(() => ({ wch: 18 }));
    XLSX.utils.book_append_sheet(wb, ws, (SHEET_AR[table] ?? table).slice(0, 31));
  }
  buildReports(data).forEach((aoa, i) => {
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = (aoa[0] ?? []).map((_, j) => ({ wch: j === 1 || j === 4 ? 30 : 15 }));
    XLSX.utils.book_append_sheet(wb, ws, REPORT_SHEETS[i]!);
  });
  XLSX.writeFile(wb, `${filename}.xlsx`);
}

/** Reads a backup workbook back to table -> rows with original column names. */
export async function readBackupXlsx(file: File): Promise<Data> {
  const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const out: Data = {};
  for (const sheetName of wb.SheetNames) {
    if (REPORT_SHEETS.includes(sheetName)) continue;
    const table = AR_SHEET[sheetName] ?? sheetName;
    const aoa = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheetName]!, { header: 1, raw: true, defval: "" });
    if (!aoa.length) continue;
    const headers = (aoa[0] as string[]).map((h) => AR_COL[String(h)] ?? String(h));
    out[table] = aoa.slice(1).filter((r) => r.some((c) => c !== "")).map((r) => {
      const o: Record<string, unknown> = {};
      headers.forEach((h, i) => {
        const v = r[i];
        // jsonb columns were written as JSON text; turn them back into objects/arrays.
        if (typeof v === "string" && /^\s*[[{]/.test(v)) {
          try { o[h] = JSON.parse(v); return; } catch { /* keep as text */ }
        }
        o[h] = v === "" ? null : v;
      });
      return o;
    });
  }
  return out;
}
