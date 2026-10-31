import { createFileRoute, redirect } from "@tanstack/react-router";
import { pageHead } from "@/lib/page-head";

export const Route = createFileRoute("/_authenticated/warehouse-categories")({
  head: () => pageHead("تصنيفات المستودعات", "إدارة التصنيفات الرئيسية والفرعية للمستودعات داخل الشركة."),
  beforeLoad: () => { throw redirect({ to: "/warehouses" }); },
});
