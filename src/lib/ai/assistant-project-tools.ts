import { tool } from "ai";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";

/* Project-only assistant tools. No ledger, document or account access; RLS still
   limits rows to what the signed-in project user may see. */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function buildProjectTools(sb: SupabaseClient<any>) {
  return {
    lookup_projects: tool({
      description: "البحث في المشاريع بالاسم أو الرمز أو الحالة (active, paused, completed, closed, lead) وإرجاع نسبة الإنجاز والتواريخ.",
      inputSchema: z.object({ query: z.string().nullable(), status: z.string().nullable() }),
      execute: async ({ query, status }) => {
        let q = sb.from("projects").select("id,code,name,status,completion_pct,start_date,end_date,lead_contact,lead_phone,lead_source").order("name").limit(50);
        if (query) q = q.or(`name.ilike.%${query.replace(/[,()]/g, " ")}%,code.ilike.%${query.replace(/[,()]/g, " ")}%`);
        if (status) q = q.eq("status", status);
        const { data, error } = await q;
        if (error) return { error: error.message };
        return { projects: data ?? [] };
      },
    }),
    get_project_wbs: tool({
      description: "هيكل تجزئة العمل (المراحل والبنود) لمشروع معيّن مع نسب الإنجاز. استخدم معرّف المشروع من lookup_projects.",
      inputSchema: z.object({ project_id: z.string() }),
      execute: async ({ project_id }) => {
        const { data, error } = await sb.from("project_wbs").select("*").eq("project_id", project_id).limit(500);
        if (error) return { error: error.message };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return { items: (data ?? []).map((w: any) => ({ id: w.id, parent_id: w.parent_id, name: w.name ?? w.title, section: w.section, progress: w.progress ?? w.progress_pct, weight: w.weight, start: w.start_date, end: w.end_date, status: w.status })) };
      },
    }),
    get_project_leads: tool({
      description: "قائمة العملاء المهتمين (مشاريع بحالة lead) مع جهة الاتصال والمصدر.",
      inputSchema: z.object({}),
      execute: async () => {
        const { data, error } = await sb.from("projects").select("id,name,lead_contact,lead_phone,lead_source,created_at").eq("status", "lead").order("created_at", { ascending: false }).limit(100);
        if (error) return { error: error.message };
        return { leads: data ?? [] };
      },
    }),
  };
}
