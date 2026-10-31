import { createFileRoute, redirect } from "@tanstack/react-router";
import { pageHead } from "@/lib/page-head";

export const Route = createFileRoute("/_authenticated/product-categories")({
  head: () => pageHead("تصنيفات المواد", "إدارة تصنيفات المواد الرئيسية والفرعية داخل الشركة."),
  beforeLoad: () => { throw redirect({ to: "/products" }); },
});
