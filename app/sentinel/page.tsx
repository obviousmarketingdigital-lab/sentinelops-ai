import type { Metadata } from "next";
import { SentinelDashboard } from "@/components/sentinel-dashboard";

export const metadata: Metadata = {
  title: "DevOps Sentinel · Autonomous AI Agent",
  description: "Autonomous code and Docker audit engine with real GitHub PR remediation.",
};

export default function SentinelPage() {
  return <SentinelDashboard />;
}
