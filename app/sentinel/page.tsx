import type { Metadata } from "next";
import { SentinelDashboard } from "@/components/sentinel-dashboard";

export const metadata: Metadata = {
  title: "Sentinel · repository audit",
  description: "Reads a repository and reports what it found: Docker, TypeScript, lockfile and dependency advisories.",
};

export default function SentinelPage() {
  return <SentinelDashboard />;
}
