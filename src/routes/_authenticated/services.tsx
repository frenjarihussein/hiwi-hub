import { createFileRoute } from "@tanstack/react-router";
import { ItemsDirectory } from "@/components/ItemsDirectory";

export const Route = createFileRoute("/_authenticated/services")({
  head: () => ({
    meta: [
      { title: "دليل الخدمات | يوسف سوفت" },
      { name: "description", content: "شجرة وبطاقات الخدمات المولدة داخلياً أو المشتراة وربطها بالحسابات ومراكز الكلفة وتقارير مبيعاتها." },
      { property: "og:title", content: "دليل الخدمات | يوسف سوفت" },
      { property: "og:description", content: "شجرة وبطاقات الخدمات وربطها بالحسابات ومراكز الكلفة وتقاريرها." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ServicesPage,
});

function ServicesPage() {
  return <ItemsDirectory kind="service" />;
}
