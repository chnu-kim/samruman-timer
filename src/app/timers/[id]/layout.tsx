import type { Metadata } from "next";
import { TITLE_TEMPLATE } from "@/lib/site";

export const metadata: Metadata = { title: { default: "타이머", template: TITLE_TEMPLATE } };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
