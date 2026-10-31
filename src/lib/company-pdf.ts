// Builds a readable, company-branded full report (accounts, trial balance, entries, stock, partners, documents...)
// from backup data and opens it for printing / saving as PDF. Raw ids and technical fields are never shown.
/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = any;
type Data = Record<string, Row[]>;

const esc = (v: unknown) =>
  String(v ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const n = (v: unknown) => Number(v ?? 0) || 0;
const money = (v: unknown) => n(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const qty = (v: unknown) => n(v).toLocaleString("en-US", { maximumFractionDigits: 3 });
const date = (v: unknown) => (v ? String(v).slice(0, 10) : "");

const NATURE: Record<string, string> = {
  asset: "أصول", assets: "أصول", liability: "خصوم", liabilities: "خصوم", equity: "حقوق ملكية",
  revenue: "إيرادات", income: "إيرادات", expense: "مصاريف", expenses: "مصاريف", cost_center: "مراكز كلفة", closing: "ختامي",
};
const DOC: Record<string, string> = {
  sale: "فاتورة بيع", purchase: "فاتورة شراء", sale_return: "مرتجع بيع", purchase_return: "مرتجع شراء",
  receipt: "سند قبض", payment: "سند دفع", quote: "عرض سعر", transfer: "مناقلة", stock_in: "إدخال مستودع", stock_out: "إخراج مستودع",
};
const STATUS: Record<string, string> = { posted: "مرحّل", draft: "مسودة", cancelled: "ملغى", pending: "معلّق", cleared: "محصّل", bounced: "مرتجع" };
const PTYPE: Record<string, string> = { customer: "زبون", supplier: "مورد", both: "زبون ومورد" };
const tr = (m: Record<string, string>, v: unknown) => (v == null || v === "" ? "" : m[String(v)] ?? String(v));

function table(cols: string[], rows: (string | number)[][], numCols: number[] = [], foot?: (string | number)[]) {
  if (!rows.length) return `<p class="empty">لا توجد بيانات</p>`;
  const td = (c: unknown, i: number) => `<td${numCols.includes(i) ? ' class="num"' : ""}>${esc(c)}</td>`;
  return `<table><thead><tr>${cols.map((c) => `<th>${esc(c)}</th>`).join("")}</tr></thead><tbody>${rows
    .map((r) => `<tr>${r.map(td).join("")}</tr>`).join("")}</tbody>${foot ? `<tfoot><tr>${foot.map(td).join("")}</tr></tfoot>` : ""}</table>`;
}

export const PDF_SECTIONS = [
  ["accounts", "شجرة الحسابات"], ["trial", "ميزان المراجعة"], ["entries", "قيود اليومية"], ["stock", "المستودعات وأرصدة المواد"],
  ["products", "المواد"], ["partners", "الزبائن والموردون"], ["documents", "الفواتير والسندات"], ["cheques", "الشيكات"],
  ["assets", "الأصول الثابتة"], ["employees", "الموظفون"],
  ["acc_statements", "كشوف (تصوير) الحسابات"], ["partner_statements", "كشوف الزبائن والموردين"],
  ["projects", "المشاريع"], ["cost_centers", "مراكز الكلفة"], ["item_moves", "حركات المواد"],
  ["doc_details", "تفاصيل الفواتير"], ["payroll", "الرواتب والسلف والإجازات"], ["banks_fx", "البنوك والعملات وأسعار الصرف"],
  ["other", "الفروع والوحدات والقيود الدورية"], ["ops", "التصنيع والفندق"],
] as const;

export function buildCompanyReportHtml(data: Data, opts: { logo?: string | null; color?: string | null }) {
  const g = (k: string) => data[k] ?? [];
  const co = g("tenants")[0] ?? {};
  const color = opts.color || "#0f766e";
  const acc = new Map(g("accounts").map((a) => [a.id, a]));
  const accLabel = (id: unknown) => { const a = acc.get(id); return a ? `${a.code ?? ""} - ${a.name ?? ""}` : ""; };
  const partner = new Map(g("partners").map((p) => [p.id, p]));
  const prod = new Map(g("products").map((p) => [p.id, p]));
  const wh = new Map(g("warehouses").map((w) => [w.id, w]));
  const byCode = (a: Row, b: Row) => String(a.code ?? "").localeCompare(String(b.code ?? ""), "en", { numeric: true });

  // Balances per account (rolled up to parents) and per partner.
  const own = new Map<string, { d: number; c: number }>();
  const pBal = new Map<string, number>();
  for (const l of g("journal_lines")) {
    const e = own.get(l.account_id) ?? { d: 0, c: 0 };
    e.d += n(l.debit); e.c += n(l.credit); own.set(l.account_id, e);
    if (l.partner_id) pBal.set(l.partner_id, (pBal.get(l.partner_id) ?? 0) + n(l.debit) - n(l.credit));
  }
  const rolled = new Map<string, { d: number; c: number }>();
  for (const [id, v] of own) {
    let cur: Row | undefined = acc.get(id); const seen = new Set();
    while (cur && !seen.has(cur.id)) {
      seen.add(cur.id);
      const r = rolled.get(cur.id) ?? { d: 0, c: 0 }; r.d += v.d; r.c += v.c; rolled.set(cur.id, r);
      cur = acc.get(cur.parent_id);
    }
  }
  const accounts = [...g("accounts")].sort(byCode);

  const sections: any = {};
  sections.accounts = table(["رقم الحساب", "اسم الحساب", "الحساب الأب", "النوع", "العملة", "الرصيد"],
    accounts.map((a) => { const r = rolled.get(a.id); return [a.code ?? "", (a.is_group ? "▸ " : "") + (a.name ?? ""), accLabel(a.parent_id), tr(NATURE, a.nature), a.currency ?? "", r ? money(r.d - r.c) : "0.00"]; }), [5]);

  let td = 0, tc = 0;
  const trial = accounts.filter((a) => own.has(a.id)).map((a) => {
    const v = own.get(a.id)!; const b = v.d - v.c; td += v.d; tc += v.c;
    return [a.code ?? "", a.name ?? "", money(v.d), money(v.c), b > 0 ? money(b) : "", b < 0 ? money(-b) : ""];
  });
  sections.trial = table(["رقم الحساب", "اسم الحساب", "مجموع مدين", "مجموع دائن", "رصيد مدين", "رصيد دائن"], trial, [2, 3, 4, 5],
    ["", "المجموع", money(td), money(tc), td > tc ? money(td - tc) : "", tc > td ? money(tc - td) : ""]);

  const linesBy = new Map<string, Row[]>();
  for (const l of g("journal_lines")) (linesBy.get(l.entry_id) ?? linesBy.set(l.entry_id, []).get(l.entry_id)!).push(l);
  const entries = [...g("journal_entries")].sort((a, b) => String(a.entry_date).localeCompare(String(b.entry_date)) || n(a.entry_no) - n(b.entry_no));
  sections.entries = entries.length ? entries.map((e) => {
    const ls = linesBy.get(e.id) ?? [];
    const d = ls.reduce((s, l) => s + n(l.debit), 0), c = ls.reduce((s, l) => s + n(l.credit), 0);
    return `<div class="entry"><div class="eh"><b>قيد رقم ${esc(e.entry_no ?? "")}</b><span>${esc(date(e.entry_date))}</span><span>${esc(e.currency ?? "")}</span><span class="grow">${esc(e.description ?? "")}</span></div>${table(
      ["الحساب", "البيان", "الطرف", "مدين", "دائن"],
      ls.map((l) => [accLabel(l.account_id), l.description ?? "", partner.get(l.partner_id)?.name ?? "", n(l.debit) ? money(l.debit) : "", n(l.credit) ? money(l.credit) : ""]),
      [3, 4], ["", "", "المجموع", money(d), money(c)])}</div>`;
  }).join("") : `<p class="empty">لا توجد قيود</p>`;

  const stock = new Map<string, number>();
  for (const m of g("stock_moves")) { const k = `${m.warehouse_id}|${m.product_id}`; stock.set(k, (stock.get(k) ?? 0) + (m.direction === "in" ? n(m.qty) : -n(m.qty))); }
  const whs = [...g("warehouses")].sort(byCode);
  sections.stock = whs.length ? whs.map((w) => {
    const rows = [...stock].filter(([k, q]) => k.startsWith(`${w.id}|`) && Math.abs(q) > 1e-9).map(([k, q]) => {
      const p = prod.get(k.split("|")[1]) ?? {}; return [p.sku ?? "", p.name ?? "", p.unit ?? "", qty(q), money(p.avg_cost), money(q * n(p.avg_cost))];
    });
    const tot = rows.reduce((s, r) => s + n(String(r[5]).replace(/,/g, "")), 0);
    return `<h3>${esc(`${w.code ?? ""} ${w.name ?? ""}`)}</h3>${table(["الرمز", "المادة", "الوحدة", "الكمية", "متوسط الكلفة", "القيمة"], rows, [3, 4, 5], ["", "", "", "", "الإجمالي", money(tot)])}`;
  }).join("") : `<p class="empty">لا توجد مستودعات</p>`;

  sections.products = table(["الرمز", "اسم المادة", "الوحدة", "سعر المبيع", "سعر الشراء", "متوسط الكلفة", "الكمية", "العملة"],
    g("products").filter((p) => !p.is_group).sort((a, b) => String(a.sku ?? "").localeCompare(String(b.sku ?? ""), "en", { numeric: true }))
      .map((p) => [p.sku ?? "", p.name ?? "", p.unit ?? "", money(p.sale_price), money(p.purchase_price ?? p.last_purchase_price), money(p.avg_cost), qty(p.qty_on_hand), p.currency ?? ""]), [3, 4, 5, 6]);

  sections.partners = table(["الرمز", "الاسم", "النوع", "الهاتف", "العنوان", "حد الائتمان", "الرصيد"],
    g("partners").filter((p) => !p.is_group).sort(byCode)
      .map((p) => [p.code ?? "", p.name ?? "", tr(PTYPE, p.partner_type), p.phone ?? "", p.address ?? "", n(p.credit_limit) ? money(p.credit_limit) : "", money(pBal.get(p.id) ?? 0)]), [5, 6]);

  sections.documents = table(["التاريخ", "النوع", "الرقم", "الطرف", "المستودع", "المبلغ", "العملة", "الحالة"],
    [...g("documents")].sort((a, b) => String(a.doc_date).localeCompare(String(b.doc_date)))
      .map((d) => [date(d.doc_date), tr(DOC, d.doc_type), d.doc_no ?? "", partner.get(d.partner_id)?.name ?? "", wh.get(d.warehouse_id)?.name ?? "", money(d.amount), d.currency ?? "", tr(STATUS, d.status)]), [5]);

  sections.cheques = table(["رقم الشيك", "الاتجاه", "الطرف", "المبلغ", "العملة", "تاريخ الإصدار", "الاستحقاق", "الحالة"],
    g("cheques").map((c) => [c.cheque_no ?? "", c.direction === "in" ? "وارد" : c.direction === "out" ? "صادر" : c.direction ?? "", partner.get(c.partner_id)?.name ?? "", money(c.amount), c.currency ?? "", date(c.issue_date), date(c.due_date), tr(STATUS, c.status)]), [3]);

  sections.assets = table(["الرمز", "الأصل", "تاريخ الشراء", "الكلفة", "القيمة التخريدية", "العمر (سنوات)", "آخر اهتلاك"],
    g("fixed_assets").map((a) => [a.code ?? "", a.name ?? "", date(a.purchase_date), money(a.cost), money(a.salvage_value), a.useful_life_years ?? "", date(a.last_dep_date)]), [3, 4]);

  sections.employees = table(["الرمز", "الاسم", "المسمى الوظيفي", "القسم", "الهاتف", "تاريخ التعيين", "الراتب الأساسي", "العملة"],
    g("employees").map((e) => [e.code ?? "", e.name ?? "", e.job_title ?? "", e.department ?? "", e.phone ?? "", date(e.hire_date), money(e.base_salary), e.currency ?? ""]), [6]);

  // ---- Statement helpers ----
  const entryOf = new Map(g("journal_entries").map((e) => [e.id, e]));
  const lineSort = (a: Row, b: Row) => {
    const ea = entryOf.get(a.entry_id) ?? {}, eb = entryOf.get(b.entry_id) ?? {};
    return String(ea.entry_date ?? "").localeCompare(String(eb.entry_date ?? "")) || n(ea.entry_no) - n(eb.entry_no);
  };
  const statement = (ls: Row[], showAcc: boolean) => {
    let bal = 0, d = 0, c = 0;
    const rows = [...ls].sort(lineSort).map((l) => {
      const e = entryOf.get(l.entry_id) ?? {}; bal += n(l.debit) - n(l.credit); d += n(l.debit); c += n(l.credit);
      return [date(e.entry_date), e.entry_no ?? "", ...(showAcc ? [accLabel(l.account_id)] : []), l.description || e.description || "", n(l.debit) ? money(l.debit) : "", n(l.credit) ? money(l.credit) : "", money(bal)];
    });
    const k = showAcc ? 4 : 3;
    return table(["التاريخ", "رقم القيد", ...(showAcc ? ["الحساب"] : []), "البيان", "مدين", "دائن", "الرصيد"], rows, [k, k + 1, k + 2],
      [...Array(k).fill(""), money(d), money(c), money(d - c)].map((v, i) => (i === k - 1 ? "المجموع" : v)));
  };
  const group = <T,>(rows: Row[], key: string) => { const m = new Map<T, Row[]>(); for (const r of rows) if (r[key]) (m.get(r[key]) ?? m.set(r[key], []).get(r[key])!).push(r); return m; };
  const jl = g("journal_lines");
  const byAcc = group<string>(jl, "account_id");
  sections.acc_statements = accounts.filter((a) => byAcc.has(a.id)).map((a) => `<h3>${esc(`${a.code ?? ""} - ${a.name ?? ""}`)}${a.currency ? ` (${esc(a.currency)})` : ""}</h3>${statement(byAcc.get(a.id)!, false)}`).join("") || `<p class="empty">لا توجد حركات</p>`;
  const byPartner = group<string>(jl, "partner_id");
  sections.partner_statements = g("partners").filter((p) => byPartner.has(p.id)).sort(byCode).map((p) => `<h3>${esc(`${p.code ?? ""} - ${p.name ?? ""}`)} · ${esc(tr(PTYPE, p.partner_type))}</h3>${statement(byPartner.get(p.id)!, true)}`).join("") || `<p class="empty">لا توجد حركات</p>`;

  const byProj = group<string>(jl, "project_id");
  const projs = [...g("projects")].sort(byCode);
  const projName = new Map(projs.map((x) => [x.id, x.name]));
  sections.projects = table(["الرمز", "المشروع", "الزبون", "قيمة العقد", "العملة", "البداية", "النهاية", "الإنجاز %", "الحالة"],
    projs.filter((x) => !x.is_group).map((x) => [x.code ?? "", x.name ?? "", partner.get(x.client_id)?.name ?? "", money(x.contract_value), x.currency ?? "", date(x.start_date), date(x.end_date), qty(x.completion_pct), tr(STATUS, x.status)]), [3, 7])
    + projs.filter((x) => byProj.has(x.id)).map((x) => `<h3>حركات مشروع: ${esc(x.name ?? "")}</h3>${statement(byProj.get(x.id)!, true)}`).join("")
    + (g("project_expenses").length ? `<h3>مصاريف المشاريع</h3>${table(["التاريخ", "المشروع", "البيان", "الحساب", "المبلغ", "العملة"], g("project_expenses").map((x) => [date(x.expense_date), projName.get(x.project_id) ?? "", x.description ?? "", accLabel(x.account_id), money(x.amount), x.currency ?? ""]), [4])}` : "")
    + (g("project_milestones").length ? `<h3>مراحل المشاريع</h3>${table(["المشروع", "المرحلة", "الاستحقاق", "المبلغ", "منجزة", "مفوترة"], g("project_milestones").map((x) => [projName.get(x.project_id) ?? "", x.name ?? "", date(x.due_date), money(x.amount), x.is_done ? "نعم" : "لا", x.invoiced ? "نعم" : "لا"]), [3])}` : "");

  const byCc = group<string>(jl, "cost_center_id");
  const ccs = [...g("cost_centers")].sort(byCode);
  sections.cost_centers = table(["الرمز", "مركز الكلفة", "الحساب المرتبط", "مدين", "دائن", "الرصيد"],
    ccs.map((x) => { const ls = byCc.get(x.id) ?? []; const d = ls.reduce((s, l) => s + n(l.debit), 0), c = ls.reduce((s, l) => s + n(l.credit), 0); return [x.code ?? "", (x.is_group ? "▸ " : "") + (x.name ?? ""), accLabel(x.account_id), money(d), money(c), money(d - c)]; }), [3, 4, 5])
    + ccs.filter((x) => byCc.has(x.id)).map((x) => `<h3>حركات مركز: ${esc(x.name ?? "")}</h3>${statement(byCc.get(x.id)!, true)}`).join("");

  const byProd = group<string>(g("stock_moves"), "product_id");
  sections.item_moves = g("products").filter((p) => byProd.has(p.id)).sort((a, b) => String(a.sku ?? "").localeCompare(String(b.sku ?? ""), "en", { numeric: true })).map((p) => {
    let bal = 0;
    const rows = [...byProd.get(p.id)!].sort((a, b) => String(a.move_date ?? a.created_at).localeCompare(String(b.move_date ?? b.created_at))).map((m) => {
      const q = n(m.qty); bal += m.direction === "in" ? q : -q;
      return [date(m.move_date ?? m.created_at), wh.get(m.warehouse_id)?.name ?? "", m.direction === "in" ? qty(q) : "", m.direction === "in" ? "" : qty(q), money(m.unit_cost), qty(bal), partner.get(m.partner_id)?.name ?? projName.get(m.project_id) ?? "", m.reference ?? ""];
    });
    return `<h3>${esc(`${p.sku ?? ""} - ${p.name ?? ""}`)}</h3>${table(["التاريخ", "المستودع", "وارد", "صادر", "الكلفة", "الرصيد", "الطرف/المشروع", "المرجع"], rows, [2, 3, 4, 5])}`;
  }).join("") || `<p class="empty">لا توجد حركات</p>`;

  const dl = group<string>(g("document_lines"), "document_id");
  sections.doc_details = [...g("documents")].filter((d) => dl.has(d.id)).sort((a, b) => String(a.doc_date).localeCompare(String(b.doc_date))).map((d) => {
    const ls = dl.get(d.id)!; let tot = 0;
    const rows = ls.map((l) => { const v = n(l.qty) * n(l.unit_price) - n(l.line_discount) + n(l.line_addition); tot += v; const pr = prod.get(l.product_id); return [pr ? `${pr.sku ?? ""} ${pr.name ?? ""}` : l.description || accLabel(l.account_id), qty(l.qty), money(l.unit_price), n(l.line_discount) ? money(l.line_discount) : "", n(l.line_addition) ? money(l.line_addition) : "", money(v)]; });
    return `<div class="entry"><div class="eh"><b>${esc(tr(DOC, d.doc_type))} رقم ${esc(d.doc_no ?? "")}</b><span>${esc(date(d.doc_date))}</span><span>${esc(partner.get(d.partner_id)?.name ?? "")}</span><span>${esc(d.currency ?? "")}</span><span class="grow">${esc(tr(STATUS, d.status))}</span></div>${table(["المادة / البيان", "الكمية", "السعر", "حسم", "إضافة", "القيمة"], rows, [1, 2, 3, 4, 5], ["", "", "", "", "المجموع", money(tot)])}</div>`;
  }).join("") || `<p class="empty">لا توجد تفاصيل</p>`;

  const emp = new Map(g("employees").map((e) => [e.id, e.name]));
  sections.payroll = `<h3>مسيرات الرواتب</h3>${table(["الشهر", "إجمالي الرواتب", "السلف", "الصافي"], g("payroll_runs").map((x) => [x.month ?? "", money(x.total_gross), money(x.total_advances), money(x.total_net)]), [1, 2, 3])}`
    + `<h3>السلف</h3>${table(["التاريخ", "الموظف", "المبلغ", "مخصومة", "شهر الخصم", "ملاحظات"], g("employee_advances").map((x) => [date(x.adv_date), emp.get(x.employee_id) ?? "", money(x.amount), x.deducted ? "نعم" : "لا", x.payroll_month ?? "", x.notes ?? ""]), [2])}`
    + `<h3>الإجازات</h3>${table(["الموظف", "النوع", "من", "إلى", "ملاحظات"], g("employee_leaves").map((x) => [emp.get(x.employee_id) ?? "", x.leave_type ?? "", date(x.start_date), date(x.end_date), x.notes ?? ""]))}`;

  sections.banks_fx = `<h3>البنوك</h3>${table(["البنك", "الفرع", "رقم الحساب", "العملة", "الحساب المحاسبي"], g("banks").map((x) => [x.name ?? "", x.branch ?? "", x.account_no ?? "", x.currency ?? "", accLabel(x.account_id)]))}`
    + `<h3>العملات</h3>${table(["الرمز", "العملة", "الإشارة", "فعالة"], g("currencies").map((x) => [x.code ?? "", x.name ?? "", x.symbol ?? "", x.is_active === false ? "لا" : "نعم"]))}`
    + `<h3>أسعار الصرف</h3>${table(["التاريخ", "العملة", "السعر مقابل الدولار"], [...g("exchange_rates")].sort((a, b) => String(b.rate_date).localeCompare(String(a.rate_date))).map((x) => [date(x.rate_date), x.currency ?? "", qty(x.rate_to_usd)]), [2])}`;

  const FREQ: Record<string, string> = { daily: "يومي", weekly: "أسبوعي", monthly: "شهري", quarterly: "ربعي", yearly: "سنوي" };
  sections.other = `<h3>الفروع</h3>${table(["الرمز", "الفرع", "العنوان", "الهاتف"], g("branches").map((x) => [x.code ?? "", x.name ?? "", x.address ?? "", x.phone ?? ""]))}`
    + `<h3>الوحدات</h3>${table(["الوحدة", "الوحدة الأساسية", "المعامل"], g("units").map((x) => [x.name ?? "", x.base_unit ?? "", qty(x.factor)]), [2])}`
    + `<h3>القيود الدورية</h3>${table(["الاسم", "المدين", "الدائن", "المبلغ", "العملة", "التكرار", "التاريخ القادم", "فعال"], g("recurring_entries").map((x) => [x.name ?? "", accLabel(x.debit_account_id), accLabel(x.credit_account_id), money(x.amount), x.currency ?? "", tr(FREQ, x.frequency), date(x.next_date), x.is_active === false ? "لا" : "نعم"]), [3])}`;

  const room = new Map(g("hotel_rooms").map((r) => [r.id, r.room_no]));
  sections.ops = `<h3>أوامر التصنيع</h3>${table(["الرقم", "التاريخ", "المادة", "المستودع", "الكمية", "كلفة العمالة", "الحالة"], g("manufacturing_orders").map((x) => [x.mo_no ?? "", date(x.mo_date), prod.get(x.product_id)?.name ?? "", wh.get(x.warehouse_id)?.name ?? "", qty(x.qty), money(x.labor_cost), tr(STATUS, x.status)]), [4, 5])}`
    + `<h3>غرف الفندق</h3>${table(["الغرفة", "النوع", "الطابق", "سعر الليلة"], g("hotel_rooms").map((x) => [x.room_no ?? "", x.room_type ?? "", x.floor ?? "", money(x.price_per_night)]), [3])}`
    + `<h3>الحجوزات</h3>${table(["الغرفة", "النزيل", "الهاتف", "الدخول", "الخروج", "الليالي", "السعر", "العربون"], g("hotel_reservations").map((x) => [room.get(x.room_id) ?? "", x.guest_name ?? "", x.guest_phone ?? "", date(x.check_in), date(x.check_out), x.nights ?? "", money(x.rate), money(x.advance_amount)]), [6, 7])}`;

  const counts: [string, number][] = [
    ["الحسابات", g("accounts").length], ["القيود", entries.length], ["المستودعات", whs.length], ["المواد", g("products").filter((p) => !p.is_group).length],
    ["الزبائن والموردون", g("partners").filter((p) => !p.is_group).length], ["المستندات", g("documents").length], ["الشيكات", g("cheques").length], ["الموظفون", g("employees").length],
    ["المشاريع", projs.filter((x) => !x.is_group).length], ["مراكز الكلفة", ccs.length], ["حركات المواد", g("stock_moves").length], ["بنود القيود", jl.length],
  ];
  const head = (t: string) => `<div class="ph">${opts.logo ? `<img src="${esc(opts.logo)}"/>` : ""}<b>${esc(co.name ?? "")}</b><span>${esc(t)}</span></div>`;
  const now = new Date().toLocaleString("ar");

  return `<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>${esc(`تقرير-${co.name ?? "الشركة"}-${new Date().toISOString().slice(0, 10)}`)}</title>
<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box}body{margin:0;font-family:Cairo,Tahoma,Arial,sans-serif;color:#1f2937;background:#e9ecef;-webkit-print-color-adjust:exact;print-color-adjust:exact;font-size:11.5px}
.bar{position:sticky;top:0;z-index:9;display:flex;gap:8px;justify-content:center;padding:10px;background:#1f2937}
.bar button{font-family:inherit;font-weight:700;border:0;border-radius:6px;padding:8px 18px;cursor:pointer}.bar .p{background:${color};color:#fff}
.bar small{color:#cbd5e1;align-self:center}
.sec{width:210mm;margin:14px auto;background:#fff;padding:12mm;box-shadow:0 4px 20px rgba(0,0,0,.1);break-before:page}
.cover{min-height:270mm;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;border-top:10px solid ${color};break-before:auto}
.cover img{max-height:130px;max-width:260px;object-fit:contain;margin-bottom:18px}.cover h1{font-size:30px;margin:0;color:${color}}
.cover h2{font-size:18px;margin:8px 0 4px;font-weight:600}.cover p{margin:2px;color:#6b7280}
.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-top:30px;width:100%}.stats div{border:1px solid #e5e7eb;border-radius:8px;padding:10px}.stats b{display:block;font-size:20px;color:${color}}
.toc{margin-top:26px;text-align:start;width:70%;columns:2}.toc div{padding:3px 0;border-bottom:1px dotted #d1d5db}
.ph{display:flex;align-items:center;gap:10px;border-bottom:3px solid ${color};padding-bottom:6px;margin-bottom:10px}.ph img{height:34px;max-width:90px;object-fit:contain}.ph b{font-size:13px}.ph span{margin-inline-start:auto;font-size:16px;font-weight:800;color:${color}}
h3{margin:14px 0 6px;font-size:13px;color:${color}}
table{width:100%;border-collapse:collapse;margin-bottom:6px}thead{display:table-header-group}th{background:${color};color:#fff;padding:5px 6px;text-align:start;font-weight:700}
td{padding:4px 6px;border-bottom:1px solid #eef0f3}tbody tr:nth-child(even) td{background:#f8fafc}tr{break-inside:avoid}
tfoot td{font-weight:800;background:#f1f5f9;border-top:2px solid ${color}}.num{text-align:left;direction:ltr;white-space:nowrap}
.entry{break-inside:avoid;margin-bottom:10px;border:1px solid #e5e7eb;border-radius:6px;padding:6px}.eh{display:flex;gap:14px;margin-bottom:4px;color:#374151}.eh b{color:${color}}.grow{flex:1}
.empty{color:#9ca3af;padding:10px 0}
@page{size:A4;margin:10mm}
@media print{body{background:#fff}.bar{display:none}.sec{width:auto;margin:0;padding:0;box-shadow:none}.cover{min-height:265mm}}
</style></head><body>
<div class="bar"><button class="p" onclick="window.print()">حفظ PDF / طباعة</button><button onclick="window.close()">إغلاق</button><small>اختر «حفظ كـ PDF» من نافذة الطباعة</small></div>
<div class="sec cover">${opts.logo ? `<img src="${esc(opts.logo)}"/>` : ""}<h1>${esc(co.name ?? "")}</h1>${co.name_en ? `<p>${esc(co.name_en)}</p>` : ""}
<h2>التقرير الشامل للشركة</h2>${co.phone ? `<p>هاتف: ${esc(co.phone)}</p>` : ""}${co.address ? `<p>${esc(co.address)}</p>` : ""}<p>تاريخ الإصدار: ${esc(now)}</p>
<div class="stats">${counts.map(([k, v]) => `<div><b>${v}</b>${esc(k)}</div>`).join("")}</div>
<div class="toc">${PDF_SECTIONS.map(([, t], i) => `<div>${i + 1}. ${esc(t)}</div>`).join("")}</div></div>
${PDF_SECTIONS.map(([k, t]) => `<div class="sec">${head(t)}${sections[k]}</div>`).join("")}
</body></html>`;
}
