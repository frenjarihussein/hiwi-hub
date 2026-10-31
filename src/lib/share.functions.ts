import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";

/* Public partner share links: callers prove access with the unguessable token only.
   The privileged client is loaded inside each handler after the token is checked. */

async function loadLink(token: string) {
  // Cast to a loosely typed client: the generated Database types are regenerated
  // from the backend and may lag the real schema.
  const { supabaseAdmin: admin0 } = await import("@/integrations/supabase/client.server");
  const supabaseAdmin = admin0 as unknown as SupabaseClient;
  const { data: link } = await supabaseAdmin.from("share_links").select("*").eq("token", token).maybeSingle();
  if (!link || link.revoked || new Date(link.expires_at) < new Date()) return { admin: supabaseAdmin, link: null };
  return { admin: supabaseAdmin, link };
}

export const getSharedRecord = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ token: z.string().min(16).max(128) }).parse(d))
  .handler(async ({ data }) => {
    const { admin, link } = await loadLink(data.token);
    if (!link) return { ok: false as const };
    const tenant = (await admin.from("tenants").select("name").eq("id", link.tenant_id).maybeSingle()).data;
    const inquiries = (await admin.from("partner_inquiries").select("id,from_partner,author_name,body,created_at").eq("link_id", link.id).order("created_at")).data ?? [];
    const base = { ok: true as const, tenantName: tenant?.name ?? "", label: link.label ?? "", kind: link.entity_type as "document" | "statement", inquiries };
    if (link.entity_type === "document") {
      const doc = (await admin.from("documents").select("doc_no,doc_type,doc_date,amount,currency,status,notes,partners(name)").eq("id", link.entity_id).eq("tenant_id", link.tenant_id).maybeSingle()).data;
      const lines = (await admin.from("document_lines").select("qty,unit_price,products(name)").eq("document_id", link.entity_id)).data ?? [];
      return { ...base, document: doc, lines, statement: null };
    }
    const partner = (await admin.from("partners").select("name").eq("id", link.entity_id).eq("tenant_id", link.tenant_id).maybeSingle()).data;
    const rows = (await admin.from("journal_lines").select("debit,credit,description,journal_entries!inner(entry_no,entry_date,description)").eq("partner_id", link.entity_id).eq("tenant_id", link.tenant_id).limit(2000)).data ?? [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sorted = (rows as any[]).sort((a, b) => String(a.journal_entries.entry_date).localeCompare(String(b.journal_entries.entry_date)));
    let bal = 0;
    const statement = sorted.map((r) => {
      bal += Number(r.debit) - Number(r.credit);
      return { date: r.journal_entries.entry_date, no: r.journal_entries.entry_no, description: r.description || r.journal_entries.description || "", debit: Number(r.debit), credit: Number(r.credit), balance: bal };
    });
    return { ...base, document: null, lines: [], statement: { partner: partner?.name ?? "", rows: statement } };
  });

export const postPartnerInquiry = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ token: z.string().min(16).max(128), name: z.string().trim().min(1).max(100), body: z.string().trim().min(1).max(2000) }).parse(d))
  .handler(async ({ data }) => {
    const { admin, link } = await loadLink(data.token);
    if (!link) throw new Error("الرابط غير صالح أو منتهي الصلاحية");
    const recent = await admin.from("partner_inquiries").select("id", { count: "exact", head: true }).eq("link_id", link.id).eq("from_partner", true).gte("created_at", new Date(Date.now() - 3600_000).toISOString());
    if ((recent.count ?? 0) >= 20) throw new Error("تم تجاوز عدد الرسائل المسموح، حاول لاحقاً");
    const { error } = await admin.from("partner_inquiries").insert({ tenant_id: link.tenant_id, link_id: link.id, from_partner: true, author_name: data.name, body: data.body });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
