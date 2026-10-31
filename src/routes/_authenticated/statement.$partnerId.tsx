import { GlLedger } from "./ledgers";
import { pageHead } from "@/lib/page-head";
import { ShareLinkButton } from "@/components/collab/ShareLinkButton";
import { WhatsAppStatementButton } from "@/components/collab/WhatsAppStatementButton";
import { LocalInvoiceStatement } from "@/components/LocalInvoiceStatement";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { db, scope } from "@/lib/db";
import { useMe } from "@/lib/session";
import { useBaseCurrency, useLatestRates, toBaseAtRates } from "@/lib/currencies";
import { exportCsv, printPage } from "@/lib/export";
import { fmtDate, fmtNum } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { ArrowRight, Download, Printer } from "lucide-react";

export const Route = createFileRoute("/_authenticated/statement/$partnerId")({ head: () => pageHead("كشف حساب الشريك", "عرض حركة الزبون أو المورد وأرصدة حسابه. في يوسف سوفت."), component: StatementPage });

const DOC_TYPE_LABEL: Record<string, string> = {
  quote: "عرض سعر",
  sale: "فاتورة مبيع",
  purchase: "فاتورة شراء",
  sale_return: "مرتجع مبيع",
  purchase_return: "مرتجع شراء",
  stock_in: "إدخال مستودع",
  stock_out: "إخراج مستودع",
  transfer: "مناقلة",
  receipt: "سند قبض",
  payment: "سند دفع",
};

function StatementPage() {
  const { partnerId } = Route.useParams();
  const { data: me } = useMe();
  const base = useBaseCurrency();
  const [curFilter, setCurFilter] = useState("");

  const partner = useQuery({
    queryKey: ["partner", partnerId],
    queryFn: async () => (await scope(db.from("partners").select("*"), me?.tenantId).eq("id", partnerId).maybeSingle()).data,
  });

  const lines = useQuery({
    queryKey: ["partner_lines", me?.userId, me?.tenantId, me?.activeBranchId, partnerId, me?.isAuditor],
    enabled: !!me?.tenantId,
    networkMode: "always",
    refetchInterval: 5000,
    refetchOnWindowFocus: "always",
    queryFn: async () => {
      const { data, error } = await scope(
        db
          .from("journal_lines")
          .select(`*, ${me?.isAuditor ? "journal_entries!inner" : "journal_entries"}(entry_no, entry_date, description, currency, exchange_rate, audited, document_id), accounts(code,name)`),
        me?.tenantId,
      ).eq("partner_id", partnerId).eq(me?.isAuditor ? "journal_entries.audited" : "partner_id", me?.isAuditor ? true : partnerId);
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data ?? []).sort((a: any, b: any) =>
        String(a.journal_entries?.entry_date).localeCompare(String(b.journal_entries?.entry_date)),
      );
    },
  });

  const items = useQuery({
    queryKey: ["partner_items", partnerId],
    queryFn: async () => {
      const { data, error } = await scope(
        db
          .from("document_lines")
          .select("qty,unit_price,documents!inner(doc_no,doc_date,doc_type,exchange_rate,partner_id),products(name,unit)"),
        me?.tenantId,
      )
        .eq("documents.partner_id", partnerId)
        .in("documents.doc_type", ["sale", "purchase", "sale_return", "purchase_return", "stock_in", "stock_out", "quote"]);
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data ?? []).sort((a: any, b: any) =>
        String(a.documents?.doc_date).localeCompare(String(b.documents?.doc_date)),
      );
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const itemRows = (items.data ?? []).map((l: any) => {
    const rate = Number(l.documents?.exchange_rate ?? 1) || 1;
    const qty = Number(l.qty);
    const price = Number(l.unit_price) / rate;
    return {
      date: fmtDate(l.documents?.doc_date),
      doc: `${DOC_TYPE_LABEL[l.documents?.doc_type] ?? l.documents?.doc_type} ${l.documents?.doc_no ?? ""}`,
      product: l.products?.name ?? "—",
      unit: l.products?.unit ?? "",
      qty: fmtNum(qty),
      price: fmtNum(price),
      total: fmtNum(qty * price),
    };
  });

  const officialBalance = (lines.data ?? []).reduce((sum: number, line: { debit: number; credit: number; journal_entries?: { exchange_rate?: number } }) => sum + (Number(line.debit) - Number(line.credit)) / (Number(line.journal_entries?.exchange_rate) || 1), 0);
  const journalDocumentIds = (lines.data ?? []).flatMap((line: { journal_entries?: { document_id?: string | null } }) => line.journal_entries?.document_id ? [line.journal_entries.document_id] : []);

  return (
    <div>
      <div className="no-print mb-4 flex justify-between gap-2">
        <Button asChild variant="outline">
          <Link to="/partners">
            <ArrowRight className="size-4" />
            رجوع
          </Link>
        </Button>
        <div className="flex gap-2">
          <WhatsAppStatementButton withLabel partnerId={partnerId} name={partner.data?.name ?? ""} phone={partner.data?.phone} />
          <ShareLinkButton entityType="statement" entityId={partnerId} label={`كشف حساب ${partner.data?.name ?? ""}`} phone={partner.data?.phone} />
          <Button onClick={printPage}>
            <Printer className="size-4" />
            طباعة
          </Button>
        </div>
      </div>

      <div className="print-area rounded-lg border bg-card p-6">
        <GlLedger mode="partner" initialId={partnerId} />

        {!me?.isAuditor && <LocalInvoiceStatement partnerId={partnerId} tenantId={me?.tenantId ?? null} base={base} officialBalance={officialBalance} officialReady={lines.isSuccess && !lines.isError} journalDocumentIds={journalDocumentIds} />}

        <div className="mt-8 mb-4 border-b pb-2 text-center">
          <h2 className="font-semibold">كشف المواد - {partner.data?.name ?? ""}</h2>
          <p className="text-sm text-muted-foreground">المواد المسحوبة والموردة مع الكميات والأسعار (معادلة بالعملة الأساسية)</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border text-sm">
            <thead className="bg-secondary">
              <tr>
                <th className="border px-2 py-2 text-right">التاريخ</th>
                <th className="border px-2 py-2 text-right">المستند</th>
                <th className="border px-2 py-2 text-right">المادة</th>
                <th className="border px-2 py-2 text-right">الوحدة</th>
                <th className="border px-2 py-2 text-right">الكمية</th>
                <th className="border px-2 py-2 text-right">سعر الوحدة</th>
                <th className="border px-2 py-2 text-right">الإجمالي</th>
              </tr>
            </thead>
            <tbody>
              {itemRows.length === 0 && (
                <tr>
                  <td colSpan={7} className="border px-2 py-6 text-center text-muted-foreground">
                    لا توجد حركات مواد
                  </td>
                </tr>
              )}
              {itemRows.map((r: any, i: number) => (
                <tr key={i}>
                  <td className="border px-2 py-2">{r.date}</td>
                  <td className="border px-2 py-2">{r.doc}</td>
                  <td className="border px-2 py-2">{r.product}</td>
                  <td className="border px-2 py-2">{r.unit}</td>
                  <td className="border px-2 py-2">{r.qty}</td>
                  <td className="border px-2 py-2">{r.price}</td>
                  <td className="border px-2 py-2 font-semibold">{r.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
