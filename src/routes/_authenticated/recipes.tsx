import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { db, scope } from "@/lib/db";
import { useMe } from "@/lib/session";
import { fmtNum } from "@/lib/format";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Trash2, UtensilsCrossed } from "lucide-react";

export const Route = createFileRoute("/_authenticated/recipes")({
  head: () => ({
    meta: [
      { title: "وصفات الأطباق | يوسف سوفت" },
      { name: "description", content: "اربط كل طبق بمكوناته ليُخصم المخزون تلقائياً عند البيع، مع تكلفة الطبق وهامش الربح." },
      { property: "og:title", content: "وصفات الأطباق | يوسف سوفت" },
      { property: "og:description", content: "اربط كل طبق بمكوناته ليُخصم المخزون تلقائياً عند البيع، مع تكلفة الطبق وهامش الربح." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  validateSearch: (s: Record<string, unknown>): { kind?: "service" } => (s["kind"] === "service" ? { kind: "service" } : {}),
  component: RecipesPage,
});

type RecipeRow = { component_product_id: string; qty: string };

function RecipesPage() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const svc = Route.useSearch().kind === "service";
  const L = svc
    ? { title: "مستلزمات الخدمات", subtitle: "حدد المواد المستودعية التي تستهلكها كل خدمة؛ عند ترحيل فاتورة بيع الخدمة تُسحب الكميات من المستودع تلقائياً", dish: "الخدمة", pick: "— اختر الخدمة —", defined: "الخدمات المعرفة حالياً", comps: "المواد المستهلكة", comp: "مادة", perUnit: "الكمية لكل خدمة", cost: "تكلفة المستلزمات", empty: "لا توجد مستلزمات — أضف مادة", pickFirst: "اختر الخدمة لعرض مستلزماتها", saved: "تم حفظ المستلزمات — ستُسحب من المستودع تلقائياً عند بيع الخدمة", needDish: "اختر الخدمة أولاً" }
    : { title: "وصفات الأطباق", subtitle: "اربط كل طبق بمكوناته من المخزون؛ عند ترحيل فاتورة بيع الطبق يُخصم كل مكوّن بكميته تلقائياً", dish: "الطبق", pick: "— اختر الطبق —", defined: "الأطباق المعرفة حالياً", comps: "المكوّنات", comp: "مكوّن", perUnit: "الكمية لكل طبق", cost: "تكلفة الطبق", empty: "لا توجد مكوّنات — أضف مكوّناً", pickFirst: "اختر الطبق لعرض مكوّناته", saved: "تم حفظ الوصفة — سيُخصم المخزون تلقائياً عند بيع الطبق", needDish: "اختر الطبق أولاً" };
  const [dishId, setDishId] = useState("");
  const [rows, setRows] = useState<RecipeRow[]>([]);

  const products = useQuery({
    queryKey: ["products_recipes", me?.tenantId],
    enabled: !!me?.tenantId,
    queryFn: async () => {
      const { data, error } = await scope(db.from("products").select("id,name,unit,sale_price,avg_cost,item_type").eq("is_group", false), me?.tenantId).order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const recipes = useQuery({
    queryKey: ["product_recipes", me?.tenantId],
    enabled: !!me?.tenantId,
    queryFn: async () => {
      const { data, error } = await scope(db.from("product_recipes").select("*"), me?.tenantId);
      if (error) throw error;
      return data ?? [];
    },
  });

  useEffect(() => {
    if (!dishId) {
      setRows([]);
      return;
    }
    db.from("product_recipes")
      .select("*")
      .eq("product_id", dishId)
      .then(({ data }: { data: { component_product_id: string; qty: number }[] | null }) =>
        setRows((data ?? []).map((r) => ({ component_product_id: r.component_product_id, qty: String(r.qty) }))),
      );
  }, [dishId, recipes.data]);

  const dishNames = useMemo(() => {
    const ids = Array.from(new Set((recipes.data ?? []).map((r: { product_id: string }) => r.product_id)));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return ids.map((id) => ({ id, name: (products.data ?? []).find((p: any) => p.id === id)?.name ?? "—" }));
  }, [recipes.data, products.data]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const all = (products.data ?? []) as any[];
  const dishOptions = svc ? all.filter((p) => p.item_type === "service") : all;
  const compOptions = svc ? all.filter((p) => p.item_type !== "service") : all;
  const cost = rows.reduce((s, r) => {
    const c = (products.data ?? []).find((p: { id: string }) => p.id === r.component_product_id);
    return s + (Number(r.qty) || 0) * Number(c?.avg_cost ?? 0);
  }, 0);
  const dish = (products.data ?? []).find((p: { id: string }) => p.id === dishId);
  const price = Number(dish?.sale_price ?? 0);
  const margin = price > 0 ? ((price - cost) / price) * 100 : 0;

  const save = useMutation({
    mutationFn: async () => {
      if (!dishId) throw new Error(L.needDish);
      const clean = rows.filter((r) => r.component_product_id && Number(r.qty) > 0 && r.component_product_id !== dishId);
      const seen = new Set<string>();
      for (const r of clean) {
        if (seen.has(r.component_product_id)) throw new Error("لا يمكن تكرار المكوّن نفسه");
        seen.add(r.component_product_id);
      }
      const { error: dErr } = await db.from("product_recipes").delete().eq("product_id", dishId);
      if (dErr) throw dErr;
      if (clean.length) {
        const { error } = await db.from("product_recipes").insert(
          clean.map((r) => ({ tenant_id: me!.tenantId, product_id: dishId, component_product_id: r.component_product_id, qty: Number(r.qty) })),
        );
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(L.saved);
      qc.invalidateQueries({ queryKey: ["product_recipes"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div>
      <PageHeader
        title={L.title}
        subtitle={L.subtitle}
      />

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <div className="space-y-1">
          <Label>{L.dish}</Label>
          <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={dishId} onChange={(e) => setDishId(e.target.value)}>
            <option value="">{L.pick}</option>
            {dishOptions.map((p: { id: string; name: string }) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">{L.defined}: {dishNames.length ? dishNames.map((d) => d.name).join("، ") : "لا يوجد"}</p>
        </div>

        <div className="lg:col-span-2">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-sm font-semibold"><UtensilsCrossed className="size-4" /> {L.comps}</h3>
            <Button size="sm" variant="outline" disabled={!dishId} onClick={() => setRows([...rows, { component_product_id: "", qty: "1" }])}>
              {L.comp}
            </Button>
          </div>
          <table className="w-full border text-sm">
            <thead className="bg-secondary">
              <tr>
                <th className="border px-2 py-2 text-right">{L.comp}</th>
                <th className="border px-2 py-2 text-right">{L.perUnit}</th>
                <th className="border px-2 py-2 text-right">تكلفة الوحدة</th>
                <th className="border px-2 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const c = (products.data ?? []).find((p: { id: string }) => p.id === r.component_product_id);
                return (
                  <tr key={i}>
                    <td className="border px-2 py-1">
                      <select
                        className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                        value={r.component_product_id}
                        onChange={(e) => {
                          const next = [...rows];
                          next[i] = { ...r, component_product_id: e.target.value };
                          setRows(next);
                        }}
                      >
                        <option value="">— اختر —</option>
                        {compOptions
                          .filter((p: { id: string }) => p.id !== dishId)
                          .map((p: { id: string; name: string }) => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                          ))}
                      </select>
                    </td>
                    <td className="border px-2 py-1">
                      <Input
                        type="number"
                        value={r.qty}
                        onChange={(e) => {
                          const next = [...rows];
                          next[i] = { ...r, qty: e.target.value };
                          setRows(next);
                        }}
                      />
                    </td>
                    <td className="border px-2 py-1">{fmtNum(Number(c?.avg_cost ?? 0))} {c?.unit ?? ""}</td>
                    <td className="border px-2 py-1 text-center">
                      <Button size="sm" variant="outline" onClick={() => setRows(rows.filter((_, x) => x !== i))}>
                        <Trash2 className="size-4" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-3 py-6 text-center text-muted-foreground">
                    {dishId ? L.empty : L.pickFirst}
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          <div className="mt-3 flex flex-wrap items-center gap-4 text-sm">
            <span>{L.cost}: <b>{fmtNum(cost)}</b></span>
            <span>سعر البيع: <b>{fmtNum(price)}</b></span>
            <span className={margin < 0 ? "text-destructive" : "text-status-posted"}>هامش الربح: <b>{fmtNum(margin)}%</b></span>
            <Button className="ms-auto" onClick={() => save.mutate()} disabled={save.isPending || !dishId}>
              {save.isPending ? "جارٍ الحفظ..." : svc ? "حفظ المستلزمات" : "حفظ الوصفة"}
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {svc ? "ملاحظة: البيع يمنع سحب المستلزمات إذا كانت كمياتها غير متوفرة في المستودع — أكمل مخزونها أولاً." : "ملاحظة: البيع يمنع خصم المكوّنات إذا كانت كمياتها غير متوفرة في المستودع — أكمل مخزون المكوّنات أولاً."}
          </p>
        </div>
      </div>
    </div>
  );
}
