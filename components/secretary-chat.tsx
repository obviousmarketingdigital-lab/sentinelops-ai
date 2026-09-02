"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { ArrowRightIcon, CheckIcon, MapPinIcon, SparkleIcon } from "@/components/icons";
import { createInitialSecretaryState } from "@/lib/secretary/conversation";
import type { QuickReply, SecretaryChatResponse, SecretaryState } from "@/lib/secretary/types";

type ChatMessage = { id: number; role: "assistant" | "user"; text: string };

const welcome: ChatMessage = {
  id: 1,
  role: "assistant",
  text: "Olá! Eu sou a secretária virtual da Axiss Saúde Integrada. Posso ajudar com consultas, locação de salas e informações gerais. Como posso ajudar?",
};

const initialQuickReplies: QuickReply[] = [
  { label: "Agendar consulta", value: "agendar consulta" },
  { label: "Alugar uma sala", value: "alugar sala" },
  { label: "Serviços e valores", value: "serviços" },
  { label: "Horários e endereço", value: "horários" },
  { label: "Falar com a equipe", value: "falar com a equipe" },
];

function createMessageId() {
  return Date.now() + Math.random();
}

export function SecretaryChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([welcome]);
  const [quickReplies, setQuickReplies] = useState(initialQuickReplies);
  const [state, setState] = useState<SecretaryState>(() => createInitialSecretaryState());
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendMessage(value: string) {
    const message = value.trim();
    if (!message || loading) return;
    setMessages((current) => [...current, { id: createMessageId(), role: "user", text: message }]);
    setDraft("");
    setQuickReplies([]);
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/secretaria/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, state }),
      });
      const data = await response.json() as SecretaryChatResponse | { error?: string };
      if (!response.ok || !("reply" in data)) throw new Error("secretary-request-failed");
      setMessages((current) => [...current, { id: createMessageId(), role: "assistant", text: data.reply }]);
      setState(data.state);
      setQuickReplies(data.quickReplies);
    } catch {
      setError("Não foi possível responder agora. Tente novamente.");
      setQuickReplies([{ label: "Tentar novamente", value: message }]);
    } finally {
      setLoading(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendMessage(draft);
  }

  function resetConversation() {
    setMessages([welcome]);
    setQuickReplies(initialQuickReplies);
    setState(createInitialSecretaryState());
    setError(null);
    setDraft("");
  }

  return (
    <main className="secretary-page">
      <header className="site-header container secretary-header">
        <Link className="brand" href="/secretaria"><span className="brand-mark"><span /></span><span>axiss<span className="brand-dot">.</span></span></Link>
        <Link className="secretary-back" href="/secretaria"><ArrowRightIcon size={15} className="secretary-back__icon" /> Voltar para o site</Link>
      </header>

      <section className="secretary-shell container">
        <div className="secretary-intro">
          <span className="eyebrow">Atendimento Axiss</span>
          <h1>Sua clínica,<br /><em>mais perto.</em></h1>
          <p>Uma secretária virtual para orientar suas dúvidas e organizar o próximo passo do seu atendimento.</p>
          <div className="secretary-trust"><span><CheckIcon size={15} /> Respostas em português</span><span><CheckIcon size={15} /> Sem diagnóstico por aqui</span></div>
          <div className="secretary-location"><MapPinIcon size={17} /><span>Axiss Saúde Integrada<br /><small>Endereço e horários confirmados pela equipe</small></span></div>
        </div>

        <div className="secretary-card">
          <div className="secretary-card__top"><div className="secretary-avatar"><SparkleIcon size={18} /></div><div><strong>Secretária Axiss</strong><span><i /> Online no protótipo</span></div><button type="button" className="secretary-reset" onClick={resetConversation}>Recomeçar</button></div>
          <div className="secretary-demo-banner"><SparkleIcon size={14} /><span>Protótipo de demonstração · nenhuma reserva real é criada</span></div>
          <div className="secretary-messages" aria-live="polite">
            {messages.map((message) => <div className={`secretary-message secretary-message--${message.role}`} key={message.id}>{message.text.split("\n").map((line, index) => <span key={`${message.id}-${index}`}>{line}{index < message.text.split("\n").length - 1 && <br />}</span>)}</div>)}
            {loading && <div className="secretary-message secretary-message--assistant secretary-message--typing"><span /><span /><span /></div>}
          </div>
          {error && <p className="secretary-error" role="alert">{error}</p>}
          {quickReplies.length > 0 && <div className="secretary-quick-replies">{quickReplies.map((reply) => <button type="button" key={`${reply.label}-${reply.value}`} onClick={() => void sendMessage(reply.value)} disabled={loading}>{reply.label}</button>)}</div>}
          <form className="secretary-composer" onSubmit={submit}><input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Escreva sua mensagem..." aria-label="Mensagem para a secretária" disabled={loading} maxLength={500} /><button className="button button--dark" type="submit" aria-label="Enviar mensagem" disabled={loading || !draft.trim()}><ArrowRightIcon size={18} /></button></form>
          <p className="secretary-disclaimer">Não envie dados de saúde, senhas ou dados de cartão. Em caso de emergência, procure um serviço de urgência ou ligue 192.</p>
        </div>
      </section>
      <footer className="container secretary-footer"><span>© 2026 Axiss Saúde Integrada</span><span>Atendimento inicial com cuidado e transparência.</span></footer>
    </main>
  );
}
