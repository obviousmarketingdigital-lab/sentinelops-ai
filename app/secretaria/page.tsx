import type { Metadata } from "next";
import { SecretaryChat } from "@/components/secretary-chat";

export const metadata: Metadata = {
  title: "Secretária virtual · Axiss Saúde Integrada",
  description: "Protótipo de atendimento e pré-agendamento da Axiss Saúde Integrada.",
};

export default function SecretaryPage() {
  return <SecretaryChat />;
}
