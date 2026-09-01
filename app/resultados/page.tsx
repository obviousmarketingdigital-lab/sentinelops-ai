import { Suspense } from "react";
import { ResultsExperience } from "@/components/results-experience";

function ResultsLoading() {
  return <main className="results-page results-loading"><div className="container"><p>Carregando imóveis…</p></div></main>;
}

export default function ResultsPage() {
  return <Suspense fallback={<ResultsLoading />}><ResultsExperience /></Suspense>;
}
