import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/PageHeader";
import { NotesTasksBoard } from "@/components/collab/NotesTasksBoard";

export const Route = createFileRoute("/_authenticated/notes")({
  head: () => ({
    meta: [
      { title: "المهام والملاحظات | يوسف سوفت" },
      { name: "description", content: "ملاحظاتك الشخصية والمهام والطلبات المرسلة للزملاء" },
      { property: "og:title", content: "المهام والملاحظات | يوسف سوفت" },
      { property: "og:description", content: "ملاحظات ومهام وطلبات بين مستخدمي الشركة" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: NotesPage,
});

function NotesPage() {
  return (
    <div className="space-y-4">
      <PageHeader title="الملاحظات والمهام (F8)" subtitle="عرض تفصيلي لكل ملاحظاتك ومهامك والطلبات بينك وبين زملائك" />
      <NotesTasksBoard />
    </div>
  );
}
