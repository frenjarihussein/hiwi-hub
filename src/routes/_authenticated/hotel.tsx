import { createFileRoute } from "@tanstack/react-router";
import { CrudPage } from "@/components/CrudPage";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { db, scope } from "@/lib/db";
import { can, useMe } from "@/lib/session";
import { fmtDate, fmtNum } from "@/lib/format";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { LogIn, LogOut, Plus, Wallet } from "lucide-react";

export const Route = createFileRoute("/_authenticated/hotel")({
  head: () => ({
    meta: [
      { title: "الغرف والحجوزات | يوسف سوفت" },
      { name: "description", content: "خريطة الغرف وحالاتها، تسجيل إقامة النزلاء، الدفعات المقدمة، وقيد الإقامة المحاسبي عند الخروج." },
      { property: "og:title", content: "الغرف والحجوزات | يوسف سوفت" },
      { property: "og:description", content: "خريطة الغرف وحالاتها، تسجيل إقامة النزلاء، الدفعات المقدمة، وقيد الإقامة المحاسبي عند الخروج." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: HotelPage,
});

type Reservation = {
  id: string;
  room_id: string;
  guest_name: string;
  guest_phone: string | null;
  check_in: string;
  check_out: string;
  nights: number;
  rate: number;
  advance_amount: number;
  status: string;
  notes: string | null;
  journal_entry_id: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  hotel_rooms?: any;
};

const emptyRes = {
  id: "",
  room_id: "",
  guest_name: "",
  guest_phone: "",
  check_in: "",
  check_out: "",
  rate: "0",
  advance_amount: "0",
  notes: "",
};

function HotelPage() {
  const { data: me } = useMe();
  return (
    <div>
      <PageHeader
        title="الغرف والحجوزات"
        subtitle="سجّل الغرف وحالاتها، وأدر إقامة النزلاء: دفعات مقدمة عند الحجز وقيد الإقامة يُرحّل تلقائياً عند تسجيل الخروج"
      />
      <Tabs defaultValue="rooms" className="mt-3">
        <TabsList>
          <TabsTrigger value="rooms">الغرف</TabsTrigger>
          <TabsTrigger value="reservations">الحجوزات والإقامة</TabsTrigger>
        </TabsList>
        <TabsContent value="rooms">
          <CrudPage
            table="hotel_rooms"
            module="documents"
            title="غرفة"
            subtitle="غيّر حالة الغرفة إلى صيانة لمنع حجزها"
            orderBy="room_no"
            fields={[
              { key: "room_no", label: "رقم الغرفة", required: true },
              { key: "room_type", label: "نوع الغرفة" },
              { key: "floor", label: "الطابق", type: "number" },
              { key: "price_per_night", label: "سعر الليلة", type: "number", defaultValue: 0 },
              {
                key: "status",
                label: "الحالة",
                type: "select",
                defaultValue: "available",
                options: [
                  { value: "available", label: "شاغرة" },
                  { value: "occupied", label: "مشغولة" },
                  { value: "maintenance", label: "صيانة" },
                ],
                render: (r: { status: string }) =>
                  r.status === "available" ? "شاغرة" : r.status === "occupied" ? "مشغولة" : "صيانة",
              },
              { key: "notes", label: "ملاحظات" },
            ]}
          />
        </TabsContent>
        <TabsContent value="reservations">
          <Reservations />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Reservations() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState(emptyRes);

  const list = useQuery({
    queryKey: ["hotel_reservations", me?.tenantId],
    enabled: !!me?.tenantId,
    queryFn: async () => {
      const { data, error } = await scope(db.from("hotel_reservations").select("*, hotel_rooms(room_no)"), me?.tenantId)
        .order("check_in", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Reservation[];
    },
  });

  const rooms = useQuery({
    queryKey: ["hotel_rooms_res", me?.tenantId],
    enabled: !!me?.tenantId,
    queryFn: async () => {
      const { data, error } = await scope(db.from("hotel_rooms").select("id,room_no,price_per_night,status"), me?.tenantId).order("room_no");
      if (error) throw error;
      return data ?? [];
    },
  });

  const nights = Math.max(
    1,
    Math.round((Date.parse(form.check_out) - Date.parse(form.check_in)) / 86_400_000) || 1,
  );

  const save = useMutation({
    mutationFn: async () => {
      if (!form.room_id) throw new Error("اختر الغرفة");
      if (!form.guest_name.trim()) throw new Error("أدخل اسم النزيل");
      if (!form.check_in || !form.check_out) throw new Error("حدد تاريخي الدخول والخروج");
      const payload = {
        tenant_id: me!.tenantId,
        room_id: form.room_id,
        guest_name: form.guest_name.trim(),
        guest_phone: form.guest_phone || null,
        check_in: form.check_in,
        check_out: form.check_out,
        nights,
        rate: Number(form.rate) || 0,
        advance_amount: Number(form.advance_amount) || 0,
        notes: form.notes || null,
      };
      if (editing) {
        const { error } = await db.from("hotel_reservations").update(payload).eq("id", editing);
        if (error) throw error;
      } else {
        const { error } = await db.from("hotel_reservations").insert({ ...payload, created_by: me!.userId });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editing ? "تم حفظ التعديلات" : "تم حفظ الحجز");
      setOpen(false);
      setEditing(null);
      setForm(emptyRes);
      qc.invalidateQueries({ queryKey: ["hotel_reservations"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const checkIn = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.rpc("hotel_check_in", { _id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم تسجيل الدخول — الغرفة صارت مشغولة");
      qc.invalidateQueries({ queryKey: ["hotel_reservations"] });
      qc.invalidateQueries({ queryKey: ["hotel_rooms"] });
      qc.invalidateQueries({ queryKey: ["hotel_rooms_res"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const checkOut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.rpc("hotel_check_out", { _id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم تسجيل الخروج وترحيل قيد الإقامة (ذمم النزلاء مقابل إيرادات الغرف)");
      qc.invalidateQueries({ queryKey: ["hotel_reservations"] });
      qc.invalidateQueries({ queryKey: ["hotel_rooms"] });
      qc.invalidateQueries({ queryKey: ["hotel_rooms_res"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const advance = useMutation({
    mutationFn: async ({ id, amount }: { id: string; amount: number }) => {
      const { error } = await db.rpc("hotel_receive_advance", { _id: id, _amount: amount });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم تسجيل الدفعة المقدمة (صندوق مقابل دفعات النزلاء المقدمة)");
      qc.invalidateQueries({ queryKey: ["hotel_reservations"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const cancel = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from("hotel_reservations").update({ status: "cancelled" }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم إلغاء الحجز");
      qc.invalidateQueries({ queryKey: ["hotel_reservations"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const statusLabel = (s: string) =>
    s === "reserved" ? "محجوزة" : s === "checked_in" ? "مقيم" : s === "checked_out" ? "غادر" : "ملغى";

  return (
    <div>
      <div className="mb-3 flex justify-end">
        {can(me, "documents", "create") && (
          <Button
            onClick={() => {
              setEditing(null);
              setForm(emptyRes);
              setOpen(true);
            }}
          >
            <Plus className="size-4" />
            حجز جديد
          </Button>
        )}
      </div>
      <div className="overflow-x-auto rounded-lg border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-secondary">
            <tr>
              <th className="px-3 py-2 text-right">الغرفة</th>
              <th className="px-3 py-2 text-right">النزيل</th>
              <th className="px-3 py-2 text-right">الدخول</th>
              <th className="px-3 py-2 text-right">الخروج</th>
              <th className="px-3 py-2 text-right">الليالي</th>
              <th className="px-3 py-2 text-right">السعر/ليلة</th>
              <th className="px-3 py-2 text-right">الإجمالي</th>
              <th className="px-3 py-2 text-right">المقدم</th>
              <th className="px-3 py-2 text-center">الحالة</th>
              <th className="px-3 py-2 text-center">إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {(list.data ?? []).map((r) => {
              const total = r.nights * r.rate;
              return (
                <tr key={r.id} className="border-t">
                  <td className="px-3 py-2">{r.hotel_rooms?.room_no ?? "—"}</td>
                  <td className="px-3 py-2">
                    {r.guest_name}
                    {r.guest_phone ? <span className="block text-xs text-muted-foreground">{r.guest_phone}</span> : null}
                  </td>
                  <td className="px-3 py-2">{fmtDate(r.check_in)}</td>
                  <td className="px-3 py-2">{fmtDate(r.check_out)}</td>
                  <td className="px-3 py-2">{r.nights}</td>
                  <td className="px-3 py-2">{fmtNum(r.rate)}</td>
                  <td className="px-3 py-2 font-medium">{fmtNum(total)}</td>
                  <td className="px-3 py-2">{fmtNum(r.advance_amount)}</td>
                  <td className="px-3 py-2 text-center">
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${r.status === "checked_in" ? "bg-status-posted text-status-posted-foreground" : r.status === "cancelled" ? "bg-destructive text-destructive-foreground" : "bg-status-draft text-status-draft-foreground"}`}>
                      {statusLabel(r.status)}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex justify-center gap-1">
                      {r.status === "reserved" && can(me, "documents", "create") && (
                        <Button size="sm" variant="outline" disabled={checkIn.isPending} onClick={() => checkIn.mutate(r.id)}>
                          <LogIn className="size-4" />
                          دخول
                        </Button>
                      )}
                      {r.status === "checked_in" && can(me, "documents", "create") && (
                        <>
                          <Button size="sm" variant="outline" disabled={checkOut.isPending} onClick={() => checkOut.mutate(r.id)}>
                            <LogOut className="size-4" />
                            خروج
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            title="استقبال دفعة مقدمة"
                            onClick={() => {
                              const v = window.prompt("مبلغ الدفعة المقدمة:", "0");
                              const amt = Number(v);
                              if (amt > 0) advance.mutate({ id: r.id, amount: amt });
                            }}
                          >
                            <Wallet className="size-4" />
                          </Button>
                        </>
                      )}
                      {r.status === "reserved" && can(me, "documents", "edit") && (
                        <>
                          <Button
                            size="icon"
                            variant="ghost"
                            title="تعديل"
                            onClick={() => {
                              setEditing(r.id);
                              setForm({
                                id: r.id,
                                room_id: r.room_id,
                                guest_name: r.guest_name,
                                guest_phone: r.guest_phone ?? "",
                                check_in: r.check_in,
                                check_out: r.check_out,
                                rate: String(r.rate),
                                advance_amount: String(r.advance_amount),
                                notes: r.notes ?? "",
                              });
                              setOpen(true);
                            }}
                          >
                            تعديل
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="text-destructive"
                            title="إلغاء الحجز"
                            onClick={() => window.confirm("إلغاء الحجز؟") && cancel.mutate(r.id)}
                          >
                            إلغاء
                          </Button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {(list.data ?? []).length === 0 && (
              <tr>
                <td colSpan={10} className="px-3 py-6 text-center text-muted-foreground">
                  {list.isLoading ? "جارٍ التحميل..." : "لا توجد حجوزات — أضف غرفاً أولاً ثم أنشئ حجزاً"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEditing(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "تعديل الحجز" : "حجز جديد"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>الغرفة</Label>
              <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={form.room_id} onChange={(e) => setForm({ ...form, room_id: e.target.value })}>
                <option value="">— اختر —</option>
                {(rooms.data ?? []).map((r: { id: string; room_no: string; status: string }) => (
                  <option key={r.id} value={r.id}>
                    غرفة {r.room_no} {r.status === "maintenance" ? "(صيانة)" : r.status === "occupied" ? "(مشغولة)" : ""}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label>اسم النزيل</Label>
              <Input value={form.guest_name} onChange={(e) => setForm({ ...form, guest_name: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>الهاتف</Label>
              <Input value={form.guest_phone} onChange={(e) => setForm({ ...form, guest_phone: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>الدخول</Label>
              <Input type="date" value={form.check_in} onChange={(e) => setForm({ ...form, check_in: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>الخروج</Label>
              <Input type="date" value={form.check_out} onChange={(e) => setForm({ ...form, check_out: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>سعر الليلة</Label>
              <Input
                type="number"
                value={form.rate}
                onChange={(e) => setForm({ ...form, rate: e.target.value })}
                onFocus={() => {
                  const room = (rooms.data ?? []).find((r: { id: string }) => r.id === form.room_id);
                  if (room && (!form.rate || form.rate === "0")) setForm((f) => ({ ...f, rate: String(room.price_per_night ?? 0) }));
                }}
              />
            </div>
            <div className="space-y-1">
              <Label>دفعة مقدمة (اختياري — تُسجّل لاحقاً كقيد)</Label>
              <Input type="number" value={form.advance_amount} onChange={(e) => setForm({ ...form, advance_amount: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>ملاحظات</Label>
              <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            الليالي: {nights} · الإجمالي: {fmtNum(nights * (Number(form.rate) || 0))}
          </p>
          <DialogFooter>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              {save.isPending ? "جارٍ الحفظ..." : "حفظ"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
