import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Calculator, History, LockKeyhole, PlayCircle, Printer, RotateCcw, Wallet } from "lucide-react";
import { nowLocalInput } from "@/lib/datetime-pref";
import { db, scope } from "@/lib/db";
import { useMe } from "@/lib/session";
import { fmtNum } from "@/lib/format";
import { printPosReceipt } from "@/lib/receipt";
import { useBranding } from "@/lib/branding";
import { useReceiptTemplate } from "@/components/ReceiptTemplateCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const POS_NOTES = { sale: ["بيع نقطة البيع", "مرتجع بيع نقطة البيع"], purchase: ["شراء نقطة البيع", "مرتجع شراء نقطة البيع"] };
const DOC_LABEL: Record<string, string> = { sale: "بيع", purchase: "شراء", sale_return: "مرتجع بيع", purchase_return: "مرتجع شراء" };
const POS_PAY_NOTE = "دفع نقدي - نقطة البيع";

/** Cashier helpers: recent invoices (reprint/return), calculator, POS drawer balance and shifts. */
export function PosTools({ mode, onReturn }: { mode: "sale" | "purchase"; onReturn?: (r: ReturnSeed) => void }) {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const [recentOpen, setRecentOpen] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const [openOpen, setOpenOpen] = useState(false);

  const cash = useQuery({
    queryKey: ["pos_cash_balance", me?.tenantId, me?.userId],
    enabled: !!me?.tenantId,
    refetchInterval: 30000,
    queryFn: async () => {
      const { data, error } = await db.rpc("my_pos_cash");
      if (error) throw error;
      return data?.[0] ?? null;
    },
  });
  const cashId = cash.data?.account_id ?? null;

  const openShift = useQuery({
    queryKey: ["pos_open_shift", me?.userId],
    enabled: !!me?.userId,
    queryFn: async () =>
      (await db.from("pos_shifts").select("id,opened_at").eq("user_id", me!.userId).is("closed_at", null).maybeSingle()).data as { id: string; opened_at: string } | null,
  });
  const shiftStart = openShift.data?.opened_at ?? null;
  const shift = useQuery({
    queryKey: ["pos_shift", me?.userId, shiftStart],
    enabled: !!me?.userId && !!shiftStart,
    refetchInterval: 30000,
    queryFn: async () => {
      const { data } = await scope(
        db.from("documents").select("doc_type,amount,status").eq("created_by", me!.userId).eq("notes", POS_PAY_NOTE).gte("created_at", shiftStart),
        me?.tenantId,
      );
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rows = (data ?? []).filter((d: any) => d.status === "posted");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const inn = rows.filter((d: any) => d.doc_type === "receipt").reduce((s: number, d: any) => s + Number(d.amount), 0);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const docOut = rows.filter((d: any) => d.doc_type === "payment").reduce((s: number, d: any) => s + Number(d.amount), 0);
      // Drawer expenses are posted as journal entries (no document) — subtract them too.
      const { data: exps } = await db
        .from("journal_entries")
        .select("journal_lines(credit)")
        .eq("created_by", me!.userId)
        .like("description", "مصروف من درج%")
        .gte("created_at", shiftStart);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const expenses = (exps ?? []).reduce((s: number, e: any) => s + (e.journal_lines ?? []).reduce((a: number, l: any) => a + Number(l.credit || 0), 0), 0);
      const out = docOut + expenses;
      return { inn, out, expenses, net: inn - out, count: rows.length };
    },
  });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["pos_cash_balance"] });
    qc.invalidateQueries({ queryKey: ["pos_shift"] });
    qc.invalidateQueries({ queryKey: ["pos_open_shift"] });
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-2 rounded-xl border bg-card px-4 py-2 shadow-soft">
        <Wallet className="size-5 text-muted-foreground" />
        <span className="text-sm text-muted-foreground">صندوق نقطة البيع</span>
        <span className="num text-lg font-semibold">{cashId ? fmtNum(cash.data?.balance) : "—"}</span>
        <span className="mx-1 h-5 w-px bg-border" />
        <span className="text-sm text-muted-foreground">نقد الوردية</span>
        <span className="num text-lg font-semibold">{shiftStart ? fmtNum(shift.data?.net) : "—"}</span>
      </div>
      <Button variant="outline" className="h-11" onClick={() => setRecentOpen(true)}><History className="size-4" />الفواتير الأخيرة</Button>
      <CalcButton />
      {shiftStart ? (
        <Button variant="outline" className="h-11" onClick={() => setCloseOpen(true)}>
          <LockKeyhole className="size-4" />إغلاق الوردية
          <span className="text-xs text-muted-foreground">(بدأت {new Date(shiftStart).toLocaleString("ar", { dateStyle: "short", timeStyle: "short" })})</span>
        </Button>
      ) : (
        <Button className="h-11" onClick={() => setOpenOpen(true)}><PlayCircle className="size-4" />بدء الوردية</Button>
      )}
      <RecentDialog open={recentOpen} onOpenChange={setRecentOpen} mode={mode} onReturn={(r) => { setRecentOpen(false); onReturn?.(r); }} />
      <OpenShiftDialog open={openOpen} onOpenChange={setOpenOpen} onDone={refresh} />
      <CloseShiftDialog
        open={closeOpen}
        onOpenChange={setCloseOpen}
        cashId={cashId}
        shiftNet={shift.data?.net ?? 0}
        shiftStart={shiftStart ?? new Date().toISOString()}
        onDone={refresh}
      />
    </div>
  );
}

export type ReturnSeed = { partnerId: string | null; lines: { product_id: string; name: string; qty: number; price: number }[] };

function OpenShiftDialog({ open, onOpenChange, onDone }: { open: boolean; onOpenChange: (v: boolean) => void; onDone: () => void }) {
  const [at, setAt] = useState(nowLocalInput());
  const m = useMutation({
    mutationFn: async () => {
      const { error } = await db.rpc("open_pos_shift", { _at: new Date(at).toISOString() });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("بدأت الوردية"); onDone(); onOpenChange(false); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (v) setAt(nowLocalInput()); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>بدء الوردية</DialogTitle></DialogHeader>
        <label className="text-sm font-medium">تاريخ ووقت بدء الوردية (الحالي افتراضياً)</label>
        <Input type="datetime-local" className="h-11" value={at} onChange={(e) => setAt(e.target.value)} />
        <Button className="h-12" disabled={m.isPending || !at} onClick={() => m.mutate()}><PlayCircle className="size-4" />بدء الوردية</Button>
      </DialogContent>
    </Dialog>
  );
}

function CalcButton() {
  const [expr, setExpr] = useState("");
  const [result, setResult] = useState<string | null>(null);
  function press(k: string) {
    if (k === "C") { setExpr(""); setResult(null); return; }
    if (k === "⌫") { setExpr((e) => e.slice(0, -1)); return; }
    if (k === "=") {
      const safe = expr.replace(/×/g, "*").replace(/÷/g, "/");
      if (!/^[\d+\-*/.() ]+$/.test(safe)) return;
      try {
        // eslint-disable-next-line no-new-func
        const v = Function(`"use strict";return (${safe})`)() as number;
        if (Number.isFinite(v)) { setResult(String(Math.round(v * 1e6) / 1e6)); setExpr(String(Math.round(v * 1e6) / 1e6)); }
      } catch { /* ignore invalid input */ }
      return;
    }
    setResult(null);
    setExpr((e) => e + k);
  }
  const keys = ["7", "8", "9", "÷", "4", "5", "6", "×", "1", "2", "3", "-", "0", ".", "⌫", "+"];
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" className="h-11"><Calculator className="size-4" />آلة حاسبة</Button>
      </PopoverTrigger>
      <PopoverContent className="w-64" dir="ltr">
        <div className="num mb-2 h-12 overflow-x-auto rounded-md bg-muted px-3 text-end text-2xl leading-[3rem]">{expr || result || "0"}</div>
        <div className="grid grid-cols-4 gap-1.5">
          {keys.map((k) => (
            <Button key={k} variant={/\d|\./.test(k) ? "outline" : "secondary"} className="h-11 text-lg" onClick={() => press(k)}>{k}</Button>
          ))}
          <Button variant="ghost" className="col-span-2 h-11" onClick={() => press("C")}>مسح</Button>
          <Button className="col-span-2 h-11 text-lg" onClick={() => press("=")}>=</Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function RecentDialog({ open, onOpenChange, mode, onReturn }: { open: boolean; onOpenChange: (v: boolean) => void; mode: "sale" | "purchase"; onReturn: (r: ReturnSeed) => void }) {
  const { data: me } = useMe();
  const brand = useBranding();
  const receiptTpl = useReceiptTemplate(me?.tenantId);
  const [sel, setSel] = useState<string | null>(null);
  const [printFormat, setPrintFormat] = useState<"thermal" | "a4">("thermal");
  const list = useQuery({
    queryKey: ["pos_recent", me?.tenantId, mode],
    enabled: open && !!me?.tenantId,
    queryFn: async () => {
      const { data, error } = await scope(
        db.from("documents").select("id,doc_no,doc_type,doc_date,status,created_at,partner_id,partners(name)").in("notes", POS_NOTES[mode]).order("created_at", { ascending: false }).limit(30),
        me?.tenantId,
      );
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data ?? []) as any[];
    },
  });
  const detail = useQuery({
    queryKey: ["pos_recent_doc", sel],
    enabled: !!sel,
    queryFn: async (): Promise<{ lines: { product_id: string; name: string; qty: number; price: number }[]; paid: boolean }> => {
      const [lines, pay] = await Promise.all([
        db.from("document_lines").select("product_id,qty,unit_price,products(name)").eq("document_id", sel),
        db.from("documents").select("id").eq("settles_document_id", sel).limit(1),
      ]);
      if (lines.error) throw lines.error;
      return {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        lines: (lines.data ?? []).map((l: any) => ({ product_id: l.product_id, name: l.products?.name ?? "—", qty: Number(l.qty), price: Number(l.unit_price) })),
        paid: !!pay.data?.length,
      };
    },
  });
  const doc = list.data?.find((d) => d.id === sel);
  const total = (detail.data?.lines ?? []).reduce((s, l) => s + l.qty * l.price, 0);
  function reprint() {
    if (!doc || !detail.data) return;
    printPosReceipt({
      company: me?.tenantName ?? "",
      logoUrl: brand.data?.logo_url ?? null,
      title: (DOC_LABEL[doc.doc_type] ?? "") + " (نسخة)",
      docNo: doc.doc_no,
      cashier: me?.fullName || me?.email || "",
      partner: doc.partners?.name ?? "",
      lines: detail.data.lines.map(({ name, qty, price }) => ({ name, qty, price })),
      paid: detail.data.paid,
      date: doc.doc_date,
      template: receiptTpl.data ?? null,
    }, printFormat);
  }
  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) setSel(null); }}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader><DialogTitle>{doc ? `فاتورة رقم ${doc.doc_no}` : "الفواتير الأخيرة"}</DialogTitle></DialogHeader>
        {!sel && (
          <div className="divide-y rounded-lg border">
            {list.isLoading && <p className="p-4 text-center text-muted-foreground">جارٍ التحميل...</p>}
            {list.data?.length === 0 && <p className="p-4 text-center text-muted-foreground">لا توجد فواتير بعد</p>}
            {list.data?.map((d) => (
              <button key={d.id} onClick={() => setSel(d.id)} className="flex w-full items-center gap-3 p-3 text-start hover:bg-accent">
                <span className="num w-14 font-semibold">#{d.doc_no}</span>
                <span className="flex-1 text-sm">{DOC_LABEL[d.doc_type] ?? d.doc_type} · {d.partners?.name ?? "نقدي"}</span>
                <span className="text-xs text-muted-foreground">{new Date(d.created_at).toLocaleString("ar", { dateStyle: "short", timeStyle: "short" })}</span>
              </button>
            ))}
          </div>
        )}
        {sel && (
          <div className="space-y-3">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground"><tr><th className="p-2 text-start">المادة</th><th className="p-2 text-start">الكمية</th><th className="p-2 text-start">السعر</th><th className="p-2 text-start">المجموع</th></tr></thead>
              <tbody>
                {detail.data?.lines.map((l, i) => (
                  <tr key={i} className="border-t"><td className="p-2">{l.name}</td><td className="num p-2">{fmtNum(l.qty)}</td><td className="num p-2">{fmtNum(l.price)}</td><td className="num p-2">{fmtNum(l.qty * l.price)}</td></tr>
                ))}
              </tbody>
            </table>
            <div className="flex items-center justify-between border-t pt-3">
              <span className="text-sm text-muted-foreground">{detail.data?.paid ? "مدفوعة نقداً" : "آجلة"}</span>
              <span className="num text-2xl font-semibold">{fmtNum(total)}</span>
            </div>
            <select aria-label="حجم الفاتورة" className="h-10 rounded-md border bg-background px-3" value={printFormat} onChange={e => setPrintFormat(e.target.value === "a4" ? "a4" : "thermal")}><option value="thermal">حرارية 80 مم</option><option value="a4">فاتورة كبيرة A4</option></select>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setSel(null)}>رجوع للقائمة</Button>
              <Button className="flex-1" disabled={!detail.data} onClick={reprint}><Printer className="size-4" />إعادة الطباعة</Button>
              {doc && (doc.doc_type === "sale" || doc.doc_type === "purchase") && (
                <Button variant="secondary" className="flex-1" disabled={!detail.data} onClick={() => detail.data && onReturn({ partnerId: doc.partner_id ?? null, lines: detail.data.lines })}>
                  <RotateCcw className="size-4" />إرجاع الفاتورة
                </Button>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function CloseShiftDialog(props: {
  open: boolean; onOpenChange: (v: boolean) => void; cashId: string | null; shiftNet: number; shiftStart: string; onDone: () => void;
}) {
  const [amount, setAmount] = useState<string>("");
  const [at, setAt] = useState(nowLocalInput());
  const value = amount === "" ? Math.max(props.shiftNet, 0) : Number(amount);
  const close = useMutation({
    mutationFn: async () => {
      if (value > 0 && !props.cashId) throw new Error("حدد حساب الصندوق في الإعدادات أولاً");
      if (!(value >= 0)) throw new Error("أدخل مبلغاً صحيحاً");
      const { error } = await db.rpc("close_pos_shift", { _amount: value, _at: new Date(at).toISOString() });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(value > 0 ? `أُغلقت الوردية وسُلّم ${fmtNum(value)} للصندوق الرئيسي` : "أُغلقت الوردية");
      props.onDone();
      setAmount("");
      props.onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open={props.open} onOpenChange={(v) => { props.onOpenChange(v); if (v) setAt(nowLocalInput()); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>إغلاق الوردية</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">
          الوردية بدأت {new Date(props.shiftStart).toLocaleString("ar", { dateStyle: "short", timeStyle: "short" })}. صافي النقد المحصّل: <b className="num text-foreground">{fmtNum(props.shiftNet)}</b>
        </p>
        <label className="text-sm font-medium">تاريخ ووقت الإغلاق (الحالي افتراضياً)</label>
        <Input type="datetime-local" className="h-11" value={at} onChange={(e) => setAt(e.target.value)} />
        <label className="text-sm font-medium">المبلغ المسلَّم للصندوق الرئيسي (النقد المعدود)</label>
        <Input type="number" className="h-11" value={amount === "" ? String(Math.max(props.shiftNet, 0)) : amount} onChange={(e) => setAmount(e.target.value)} />
        <Button className="h-12" disabled={close.isPending} onClick={() => close.mutate()}>
          <LockKeyhole className="size-4" />{close.isPending ? "جارٍ الإغلاق..." : "إغلاق الوردية وتسجيل القيد"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
