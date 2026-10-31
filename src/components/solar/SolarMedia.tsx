import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { compressMedia } from "@/lib/media-compress";
import { studyFileAllowed } from "@/lib/solar-quote";
import { Camera, Download, Paperclip, Trash2, Upload } from "lucide-react";
import { db } from "@/lib/db";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/lib/session";
import { fmtDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export type Att = {
  id: string;
  attach_type: string;
  file_name: string;
  file_path: string;
  mime_type: string | null;
  created_at: string;
  created_by: string | null;
  notes: string | null;
};

/** All project media; each file's attach_type is its location tag (wbs:<id>, survey:<key>, permit:<key>). */
export function useProjectMedia(projectId: string) {
  return useQuery({
    queryKey: ["solar-media", projectId],
    queryFn: async () => {
      const { data, error } = await db
        .from("attachments")
        .select("*")
        .eq("entity_type", "project")
        .eq("entity_id", projectId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Att[];
    },
  });
}

export function MediaButton({
  projectId,
  tag,
  label,
  canEdit,
  accept,
  canUpload,
  canDelete,
}: {
  projectId: string;
  tag: string;
  label?: string;
  canEdit: boolean;
  accept?: string;
  canUpload?: boolean;
  canDelete?: boolean;
}) {
  const media = useProjectMedia(projectId);
  const items = (media.data ?? []).filter((a) => a.attach_type === tag);
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        type="button"
        size="sm"
        variant={items.length ? "secondary" : "outline"}
        onClick={() => setOpen(true)}
        className="h-9 gap-1"
      >
        <Paperclip className="size-4" />
        {label ?? "ملفات"} {items.length > 0 && <span className="num">({items.length})</span>}
      </Button>
      {open && (
        <MediaDialog
          projectId={projectId}
          tag={tag}
          title={label ?? "الملفات"}
          items={items}
          canEdit={canEdit}
          canUpload={canUpload ?? canEdit}
          canDelete={canDelete ?? canEdit}
          accept={accept}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function MediaDialog({
  projectId,
  tag,
  title,
  items,
  canEdit,
  accept,
  onClose,
  canUpload,
  canDelete,
}: {
  projectId: string;
  tag: string;
  title: string;
  items: Att[];
  canEdit: boolean;
  canUpload: boolean;
  canDelete: boolean;
  accept?: string | undefined;
  onClose: () => void;
}) {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const camRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function upload(files: FileList | null) {
    if (!files?.length || !me?.tenantId || !canUpload) return;
    setBusy(true);
    try {
      for (const raw of Array.from(files)) {
        if (!studyFileAllowed(raw.name, tag)) throw new Error("صيغة الملف غير مقبولة لهذا القسم؛ العرض الفني يقبل PDF أو PowerPoint والمخططات تقبل PDF أو CAD أو الصور");
        const f = await compressMedia(raw);
        const ext = f.name.includes(".") ? f.name.split(".").pop() : "bin";
        const path = `${me.tenantId}/project/${projectId}/${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("attachments")
          .upload(path, f, { contentType: f.type || "application/octet-stream" });
        if (upErr) throw upErr;
        const { error } = await db.from("attachments").insert({
          tenant_id: me.tenantId,
          entity_type: "project",
          entity_id: projectId,
          attach_type: tag,
          file_path: path,
          file_name: f.name,
          mime_type: f.type || null,
          size_bytes: f.size,
          notes: me.fullName || me.email,
        });
        if (error) {
          await supabase.storage.from("attachments").remove([path]);
          throw error;
        }
      }
      toast.success("تم رفع الملفات");
      qc.invalidateQueries({ queryKey: ["solar-media", projectId] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function open(a: Att) {
    const { data, error } = await supabase.storage
      .from("attachments")
      .createSignedUrl(a.file_path, 600);
    if (error) {
      toast.error(error.message);
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener");
  }
  async function remove(a: Att) {
    if (!canDelete) return;
    if (!window.confirm(`حذف "${a.file_name}"؟`)) return;
    const { error } = await db.from("attachments").delete().eq("id", a.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    await supabase.storage.from("attachments").remove([a.file_path]);
    qc.invalidateQueries({ queryKey: ["solar-media", projectId] });
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {canUpload && (
          <div className="flex flex-wrap gap-2">
            <input
              ref={fileRef}
              type="file"
              multiple
              hidden
              accept={accept}
              onChange={(e) => {
                void upload(e.target.files);
                e.target.value = "";
              }}
            />
            <input
              ref={camRef}
              type="file"
              hidden
              accept="image/*,video/*"
              capture="environment"
              onChange={(e) => {
                void upload(e.target.files);
                e.target.value = "";
              }}
            />
            {!accept || accept.includes("image") || accept.includes(".jpg") ? <Button className="h-11 flex-1" disabled={busy} onClick={() => camRef.current?.click()}>
              <Camera className="size-5" />
              تصوير الآن
            </Button> : null}
            <Button
              className="h-11 flex-1"
              variant="outline"
              disabled={busy}
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="size-5" />
              رفع ملف
            </Button>
          </div>
        )}
        <ul className="max-h-80 space-y-2 overflow-y-auto">
          {items.length === 0 && (
            <li className="text-sm text-muted-foreground">لا توجد ملفات بعد</li>
          )}
          {items.map((a) => (
            <li key={a.id} className="flex items-center gap-2 rounded border p-2 text-sm">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{a.file_name}</p>
                <p className="text-xs text-muted-foreground">
                  {fmtDate(a.created_at)} · {a.notes}
                </p>
              </div>
              <Button size="icon" variant="ghost" onClick={() => void open(a)}>
                <Download className="size-4" />
              </Button>
              {canDelete && (
                <Button size="icon" variant="ghost" onClick={() => void remove(a)}>
                  <Trash2 className="size-4" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
