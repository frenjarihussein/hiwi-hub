import { createFileRoute } from "@tanstack/react-router";
import { ItemsDirectory } from "@/components/ItemsDirectory";

export const Route = createFileRoute("/_authenticated/products")({
  head: () => ({
    meta: [
      { title: "المواد المستودعية | يوسف سوفت" },
      { name: "description", content: "شجرة وبطاقات المواد المستودعية وأسعارها والباركود والمستودعات." },
      { property: "og:title", content: "المواد المستودعية | يوسف سوفت" },
      { property: "og:description", content: "شجرة وبطاقات المواد المستودعية وأسعارها والباركود والمستودعات." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ProductsPage,
});

function ProductsPage() {
  return <ItemsDirectory kind="stock" />;
}
