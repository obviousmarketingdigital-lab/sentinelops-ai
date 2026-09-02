import { Suspense } from "react";
import type { Metadata } from "next";
import { ResultsExperience } from "@/components/results-experience";

export const metadata: Metadata = {
  title: "Buscar imóveis · Maré",
  description: "Imóveis à venda em Garopaba, reunidos de diferentes portais.",
};

function ResultsLoading() {
  return <main className="results-page results-loading"><div className="container"><p>Carregando imóveis…</p></div></main>;
}

export default function ResultsPage() {
  return <Suspense fallback={<ResultsLoading />}><ResultsExperience /></Suspense>;
}
