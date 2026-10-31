import { zipSync, strToU8 } from "fflate";
import { supabase } from "@/integrations/supabase/client";
import { PERMIT_DOCS, AGRI_DOC, MUNICIPALITY_DOC, NO_OBJECTION_DOC, PERMIT_STAGES, SECTION_LABEL, type SolarSection } from "@/lib/solar";

type Node = {
  id: string;
  parent_id: string | null;
  name: string;
  section: string;
  weight: number;
  progress: number;
  data: Record<string, unknown>;
};
type Att = {
  attach_type: string;
  file_name: string;
  file_path: string;
  created_at: string;
  notes: string | null;
};

const safe = (s: string) => s.replace(/[\\/:*?"<>|]+/g, "-").trim() || "بدون-اسم";
const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c] ?? c);

/** Folder for a media tag: WBS path, survey area, or government permits vault. */
function folderFor(tag: string, nodes: Map<string, Node>) {
  if (tag.startsWith("wbs:")) {
    const parts: string[] = [];
    let n = nodes.get(tag.slice(4));
    while (n) {
      parts.unshift(safe(n.name));
      n = n.parent_id ? nodes.get(n.parent_id) : undefined;
    }
    return `media/${parts.join("/") || "wbs"}`;
  }
  if (tag.startsWith("permit:")) {
    const k = tag.slice(7);
    const d = [...PERMIT_DOCS, AGRI_DOC, MUNICIPALITY_DOC, NO_OBJECTION_DOC, ...PERMIT_STAGES.map((x) => ({ key: x.doc, label: x.label }))].find((x) => x.key === k);
    return `التراخيص الحكومية/${safe(d?.label ?? k)}`;
  }
  if (tag.startsWith("survey:")) return `media/${safe(SECTION_LABEL.survey)}/${safe(tag.slice(7))}`;
  return "media/عام";
}

export async function exportProjectBundle(p: {
  project: Record<string, unknown>;
  solar: Record<string, unknown>;
  nodes: Node[];
  bom: Record<string, unknown>[];
  milestones: Record<string, unknown>[];
  media: Att[];
  includeFinance: boolean;
  onProgress?: (done: number, total: number) => void;
}) {
  const files: Record<string, Uint8Array> = {};
  const byId = new Map(p.nodes.map((n) => [n.id, n]));
  const name = safe(String(p.project["name"] ?? "project"));
  const meta = {
    project: p.project,
    solar: { ...p.solar, finance: p.includeFinance ? p.solar["finance"] : undefined },
    wbs: p.nodes,
    bom: p.includeFinance ? p.bom : p.bom.map((b) => ({ ...b, unit_cost: undefined })),
    milestones: p.includeFinance ? p.milestones : [],
    exported_at: new Date().toISOString(),
  };
  files["project.json"] = strToU8(JSON.stringify(meta, null, 2));
  files["تقرير المشروع.html"] = strToU8(reportHtml(p, byId));
  let done = 0;
  for (const a of p.media) {
    const { data } = await supabase.storage.from("attachments").download(a.file_path);
    if (data) {
      const stamp = a.created_at.slice(0, 19).replace(/[T:]/g, "-");
      let path = `${folderFor(a.attach_type, byId)}/${stamp}_${safe(a.file_name)}`;
      while (files[path]) path = path.replace(/(\.[^.]*)?$/, "_1$1");
      files[path] = new Uint8Array(await data.arrayBuffer());
    }
    p.onProgress?.(++done, p.media.length);
  }
  const zip = zipSync(files, { level: 6 });
  const blob = new Blob([zip as BlobPart], { type: "application/zip" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${name}.zip`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/** Opens the project report in a print window (save as PDF from the print dialog). */
export function printProjectReport(p: Parameters<typeof exportProjectBundle>[0], w: Window | null) {
  const byId = new Map(p.nodes.map((n) => [n.id, n]));
  if (!w) throw new Error("اسمح بفتح النوافذ المنبثقة لطباعة التقرير");
  w.document.write(reportHtml(p, byId).replace("</html>", "<script>window.onload=()=>window.print()</script></html>"));
  w.document.close();
}

function reportHtml(p: Parameters<typeof exportProjectBundle>[0], byId: Map<string, Node>) {
  const s = (p.solar["survey"] ?? {}) as Record<string, unknown>;
  const depth = (n: Node) => {
    let d = 0,
      c = n;
    while (c.parent_id && byId.get(c.parent_id)) {
      d++;
      c = byId.get(c.parent_id)!;
    }
    return d;
  };
  const order: Node[] = [];
  const walk = (parent: string | null) =>
    p.nodes
      .filter((n) => n.parent_id === parent)
      .forEach((n) => {
        order.push(n);
        walk(n.id);
      });
  walk(null);
  const rows = order
    .map(
      (n) =>
        `<tr><td style="padding-right:${depth(n) * 18}px">${esc(n.name)}</td><td>${esc(n.weight)}</td><td>${Number(n.progress).toFixed(1)}%</td></tr>`,
    )
    .join("");
  const surveyRows = Object.entries(s)
    .map(
      ([k, v]) =>
        `<tr><td>${esc(k)}</td><td>${esc(typeof v === "object" ? JSON.stringify(v) : v)}</td></tr>`,
    )
    .join("");
  const fin = p.includeFinance
    ? `<h2>المالية</h2><pre>${esc(JSON.stringify(p.solar["finance"] ?? {}, null, 2))}</pre>`
    : "";
  return `<!doctype html><html dir="rtl" lang="ar"><meta charset="utf-8"><title>${esc(p.project["name"])}</title>
<style>body{font-family:Tahoma,Arial;margin:24px}table{border-collapse:collapse;width:100%;margin-bottom:16px}td,th{border:1px solid #999;padding:4px 8px;text-align:right}</style>
<h1>${esc(p.project["name"])}</h1><p>نسبة الإنجاز الكلية: <b>${Number(p.project["completion_pct"] ?? 0).toFixed(1)}%</b></p>
<h2>شجرة الأعمال</h2><table><tr><th>البند</th><th>الوزن</th><th>الإنجاز</th></tr>${rows}</table>
<h2>${SECTION_LABEL["survey" as SolarSection]}</h2><table>${surveyRows}</table>${fin}
<p>عدد الملفات المؤرشفة: ${p.media.length}</p></html>`;
}
