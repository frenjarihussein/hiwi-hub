import { createFileRoute } from "@tanstack/react-router";
import { PosScreen } from "@/components/PosScreen";

export const Route = createFileRoute("/_authenticated/pos")({
  head: () => ({
    meta: [
      { title: "نقطة البيع — يوسف سوفت" },
      { name: "description", content: "شاشة لمس سريعة لفواتير البيع ومرتجعاتها مع مسح الباركود" },
      { property: "og:title", content: "نقطة البيع — يوسف سوفت" },
      { property: "og:description", content: "شاشة بيع سريعة مع الباركود والورديات" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <PosScreen mode="sale" />,
});
