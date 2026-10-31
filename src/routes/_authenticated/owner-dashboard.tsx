import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Building2, Coins, ReceiptText, Users, WalletCards } from "lucide-react";
import { db } from "@/lib/db";
import { useMe } from "@/lib/session";
import { PageHeader } from "@/components/PageHeader";
import { fmtNum } from "@/lib/format";
import { SystemBrandingCard } from "@/components/SystemBrandingCard";

export const Route = createFileRoute("/_authenticated/owner-dashboard")({
  head: () => ({ meta: [
    { title: "الرئيسية | مدير النظام" },
    { name: "description", content: "ملخص الشركات والاشتراكات وحسابات شركة البرمجيات." },
    { property: "og:title", content: "الرئيسية | مدير النظام" },
    { property: "og:description", content: "ملخص الشركات والاشتراكات وحسابات شركة البرمجيات." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: OwnerDashboard,
});

function OwnerDashboard() {
  const { data: me } = useMe();
  const summary = useQuery({
    queryKey: ["owner-dashboard"],
    enabled: !!me?.isSuperAdmin,
    queryFn: async () => {
      const [tenants, profiles, payments, finance] = await Promise.all([
        db.from("tenants").select("id,is_active,subscription_fee"),
        db.from("profiles").select("id").not("tenant_id", "is", null),
        db.from("tenant_payments").select("amount"),
        db.from("owner_finance_entries").select("kind,amount,currency"),
      ]);
      const tenantRows = (tenants.data ?? []) as { is_active: boolean }[];
      const paymentRows = (payments.data ?? []) as { amount: number }[];
      const entries = (finance.data ?? []) as { kind: string; amount: number }[];
      return {
        companies: tenantRows.length,
        active: tenantRows.filter((tenant) => tenant.is_active).length,
        users: profiles.data?.length ?? 0,
        received: paymentRows.reduce((sum, row) => sum + Number(row.amount), 0),
        salaries: entries.filter((row) => row.kind === "salary").reduce((sum, row) => sum + Number(row.amount), 0),
        expenses: entries.filter((row) => row.kind === "expense").reduce((sum, row) => sum + Number(row.amount), 0),
      };
    },
  });
  if (me && !me.isSuperAdmin) return <p className="text-muted-foreground">هذه الصفحة مخصصة لمدير النظام فقط.</p>;
  const data = summary.data;
  const cards = [
    { label: "الشركات", value: data?.companies ?? 0, detail: `${data?.active ?? 0} فعّالة`, icon: Building2, tone: "bg-highlight/10 text-highlight" },
    { label: "المستخدمون", value: data?.users ?? 0, detail: "ضمن جميع الشركات", icon: Users, tone: "bg-success/10 text-success" },
    { label: "مقبوضات الاشتراكات", value: fmtNum(data?.received), detail: "إجمالي الدفعات", icon: Coins, tone: "bg-warning/15 text-warning-foreground" },
    { label: "رواتب ومصروفات الشركة", value: fmtNum((data?.salaries ?? 0) + (data?.expenses ?? 0)), detail: "الحسابات الداخلية", icon: WalletCards, tone: "bg-destructive/10 text-destructive" },
  ];
  return (
    <div>
      <PageHeader title={`أهلاً ${me?.fullName ?? ""}`} subtitle="إدارة شركة البرمجيات واشتراكات العملاء من مكان واحد" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => <div key={card.label} className="rounded-lg border bg-card p-5 shadow-soft"><span className={`grid size-10 place-items-center rounded-md ${card.tone}`}><card.icon className="size-5" /></span><p className="mt-4 text-sm text-muted-foreground">{card.label}</p><p className="num mt-1 text-2xl font-bold">{card.value}</p><p className="mt-1 text-xs text-muted-foreground">{card.detail}</p></div>)}
      </div>
      <h2 className="mb-3 mt-8 text-sm font-semibold text-muted-foreground">الوصول السريع</h2>
      <div className="grid gap-3 sm:grid-cols-3">
        <Link to="/companies" className="flex items-center gap-3 rounded-lg border bg-card p-5 shadow-soft transition hover:border-highlight/40 hover:bg-accent"><Building2 className="size-6 text-highlight" /><span><strong className="block">إدارة الشركات</strong><small className="text-muted-foreground">الحسابات والاشتراكات والتفعيل</small></span></Link>
        <Link to="/subscriptions" className="flex items-center gap-3 rounded-lg border bg-card p-5 shadow-soft transition hover:border-highlight/40 hover:bg-accent"><ReceiptText className="size-6 text-success" /><span><strong className="block">فواتير الاشتراكات</strong><small className="text-muted-foreground">المستحقات والدفعات</small></span></Link>
        <Link to="/owner-finance" className="flex items-center gap-3 rounded-lg border bg-card p-5 shadow-soft transition hover:border-highlight/40 hover:bg-accent"><WalletCards className="size-6 text-warning-foreground" /><span><strong className="block">حسابات شركة البرمجيات</strong><small className="text-muted-foreground">رواتب ودفعات ومصروفات</small></span></Link>
      </div>
      <SystemBrandingCard />
    </div>
  );
}