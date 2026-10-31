import { createFileRoute, redirect } from "@tanstack/react-router";
import { pageHead } from "@/lib/page-head";

export const Route = createFileRoute("/_authenticated/project-categories")({
  head: () => pageHead("تصنيفات المشاريع", "إدارة تصنيفات المشاريع والتعهدات الرئيسية والفرعية."),
  beforeLoad: () => { throw redirect({ to: "/projects" }); },
});
