import { createFileRoute } from "@tanstack/react-router";
import { PosScreen } from "@/components/PosScreen";

export const Route = createFileRoute("/_authenticated/purchase-pos")({
  head: () => ({
    meta: [
      { title: "نقطة الشراء — يوسف سوفت" },
      { name: "description", content: "شاشة سريعة لفواتير الشراء من الموردين ومرتجعاتها مع مسح الباركود" },
      { property: "og:title", content: "نقطة الشراء — يوسف سوفت" },
      { property: "og:description", content: "شاشة شراء سريعة مع الباركود والورديات" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <PosScreen mode="purchase" />,
});
