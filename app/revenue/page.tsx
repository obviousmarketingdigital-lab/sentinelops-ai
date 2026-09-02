import type { Metadata } from "next";
import { RevenueDashboard } from "@/components/revenue-dashboard";

export const metadata: Metadata = {
  title: "Plans · Sentinel",
  description: "Subscription plans and campaign data for Sentinel.",
};

export default function RevenuePage() {
  return <RevenueDashboard />;
}
