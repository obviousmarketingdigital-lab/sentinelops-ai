import type { Metadata } from "next";
import { HomePage } from "@/components/home-page";

export const metadata: Metadata = {
  title: "Maré · Imóveis em Garopaba",
  description: "Uma busca simples para encontrar imóveis à venda em Garopaba, Santa Catarina.",
};

export default function Page() {
  return <HomePage />;
}
