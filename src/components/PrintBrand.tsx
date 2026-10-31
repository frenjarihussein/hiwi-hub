import { useQuery } from "@tanstack/react-query";
import { db } from "@/lib/db";
import { useMe } from "@/lib/session";
import { useBranding } from "@/lib/branding";
import { fmtDate } from "@/lib/format";

/** Company letterhead (header + footer) that appears only when the page is printed. */
export function PrintBrand({ title, period, currency, children }: { title: string; period?: string; currency?: string; children: React.ReactNode }) {
  const { data: me } = useMe();
  const brand = useBranding();
  const company = useQuery({
    queryKey: ["print_company", me?.tenantId],
    enabled: !!me?.tenantId,
    queryFn: async () => (await db.from("tenants").select("name,name_en,phone,address").eq("id", me!.tenantId!).maybeSingle()).data,
  });
  const c = company.data;
  const color = brand.data?.primary_color || "currentColor";
  const now = new Date();
  return (
    <>
      <div className="print-only mb-4 border-b-2 pb-3" style={{ borderColor: color }}>
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-xl font-bold" style={{ color }}>{c?.name ?? me?.tenantName ?? ""}</div>
            {c?.name_en && <div className="text-sm">{c.name_en}</div>}
            <div className="text-xs">{[c?.address, c?.phone].filter(Boolean).join(" — ")}</div>
          </div>
          {brand.data?.logo_url && <img src={brand.data.logo_url} alt="" className="max-h-16 max-w-32 object-contain" />}
        </div>
        <div className="mt-3 text-center">
          <div className="text-lg font-bold">{title}</div>
          <div className="text-xs">{[period, currency ? `العملة: ${currency}` : null].filter(Boolean).join(" — ")}</div>
        </div>
      </div>
      {children}
      <div className="print-only mt-6 flex justify-between border-t pt-2 text-xs" style={{ borderColor: color }}>
        <span>{c?.name ?? me?.tenantName ?? ""}</span>
        <span>طُبع بواسطة: {me?.fullName || "—"}</span>
        <span>تاريخ الطباعة: {fmtDate(now.toISOString().slice(0, 10))} {now.toTimeString().slice(0, 5)}</span>
      </div>
    </>
  );
}
