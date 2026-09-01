import { demoProfessionals, mockClinicOperations } from "@/lib/secretary/mock-clinic";
import type {
  ClinicOperations,
  QuickReply,
  SecretaryChatResponse,
  SecretaryIntent,
  SecretaryState,
} from "@/lib/secretary/types";

export const DEMO_NOTICE = "Protótipo: nenhuma consulta ou reserva real é criada.";

const initialState = (): SecretaryState => ({
  phase: "idle",
  flow: null,
  data: {},
  updatedAt: Date.now(),
});

const normalize = (value: string) => value.trim().toLocaleLowerCase("pt-BR");
const formatDate = (date: string) => new Intl.DateTimeFormat("pt-BR", { dateStyle: "long", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));

function replies(items: Array<[string, string]>): QuickReply[] {
  return items.map(([label, value]) => ({ label, value }));
}

function response(
  reply: string,
  state: SecretaryState,
  quickReplies: QuickReply[] = [],
  options: { summary?: string; handoff?: boolean } = {},
): SecretaryChatResponse {
  return {
    reply,
    quickReplies,
    state: { ...state, updatedAt: Date.now() },
    summary: options.summary,
    handoff: options.handoff ?? false,
    demoNotice: DEMO_NOTICE,
  };
}

function cleanName(message: string) {
  return message.trim().replace(/\s+/g, " ").slice(0, 80);
}

function findByText<T extends { id: string; name: string }>(items: T[], message: string) {
  const value = normalize(message);
  const number = Number.parseInt(value, 10);
  if (Number.isInteger(number) && number >= 1 && number <= items.length) return items[number - 1];
  return items.find((item) => normalize(item.name) === value || normalize(item.name).includes(value) || value.includes(normalize(item.name)));
}

function detectIntent(message: string): SecretaryIntent {
  const value = normalize(message);
  if (/\b(urg[eê]ncia|emerg[eê]ncia|dor forte|diagn[oó]stico|rem[eé]dio|prescri|prontu[aá]rio)\b/.test(value)) return "human_handoff";
  if (/\b(pessoa|humano|atendente|equipe|falar com algu[eé]m|reclama|cobran[cç]a)\b/.test(value)) return "human_handoff";
  if (/\b(cancel|remarc|desmarc)\b/.test(value)) return "cancel_or_reschedule";
  if (/\b(alug|loca[cç][aã]o|reservar|reserve|sala|consult[oó]rio)\b/.test(value)) return "room_rental";
  if (/\b(agenda|agend|consulta|marcar|hor[aá]rio com|psicolog|nutri[cç]|fisioter)\b/.test(value)) return "consultation";
  if (/\b(servi[cç]os?|especialidades?|profissionais?|pre[cç]os?|valores?)\b/.test(value)) return "services";
  if (/\b(hor[aá]rio|endere[cç]o|onde fica|localiza[cç][aã]o|funciona)\b/.test(value)) return "hours_and_location";
  if (/^(oi|ol[aá]|olá|bom dia|boa tarde|boa noite|menu|in[ií]cio|ajuda)\b/.test(value)) return "greeting";
  return "unknown";
}

function resetState(state: SecretaryState): SecretaryState {
  return { ...state, phase: "idle", flow: null, data: {} };
}

function beginConsultation(state: SecretaryState) {
  const next = { ...state, phase: "awaiting_name" as const, flow: "consultation" as const, data: {} };
  return response(
    "Claro! Vou te ajudar a solicitar um horário. Antes, qual é o seu nome?",
    next,
    replies([["Voltar ao menu", "menu"]]),
  );
}

function beginRoomRental(state: SecretaryState) {
  const next = { ...state, phase: "awaiting_name" as const, flow: "room_rental" as const, data: {} };
  return response(
    "Perfeito! Vou te ajudar a consultar uma sala. Antes, qual é o seu nome?",
    next,
    replies([["Voltar ao menu", "menu"]]),
  );
}

async function consultationSummary(state: SecretaryState, operations: ClinicOperations) {
  const service = (await operations.listServices()).find((item) => item.id === state.data.serviceId);
  const professional = demoProfessionals.find((item) => item.id === state.data.professionalId);
  const summary = `Consulta de ${service?.name ?? "serviço"}${professional ? ` com ${professional.name}` : ""}, em ${formatDate(state.data.date!)} às ${state.data.time}, para ${state.data.name}.`;
  return response(
    `Confira os dados:\n\n${summary}\n\nPosso registrar esta solicitação de demonstração?`,
    { ...state, phase: "awaiting_confirmation" },
    replies([["Confirmar solicitação", "confirmar"], ["Corrigir dados", "corrigir"]]),
    { summary },
  );
}

async function roomSummary(state: SecretaryState, operations: ClinicOperations) {
  const room = (await operations.listRooms()).find((item) => item.id === state.data.roomId);
  const summary = `Solicitação da ${room?.name ?? "sala"} em ${formatDate(state.data.date!)} por ${state.data.durationHours}h, para ${state.data.name}.`;
  return response(
    `Confira os dados:\n\n${summary}\n\nPosso registrar esta solicitação de demonstração?`,
    { ...state, phase: "awaiting_confirmation" },
    replies([["Confirmar solicitação", "confirmar"], ["Corrigir dados", "corrigir"]]),
    { summary },
  );
}

export async function handleSecretaryMessage(
  message: string,
  suppliedState?: SecretaryState,
  operations: ClinicOperations = mockClinicOperations,
): Promise<SecretaryChatResponse> {
  const text = message.trim();
  const state = suppliedState?.phase ? suppliedState : initialState();
  if (!text) return response("Olá! Sou a secretária virtual da Axiss Saúde Integrada. Como posso ajudar?", state, replies([["Agendar consulta", "agendar consulta"], ["Alugar uma sala", "alugar sala"], ["Serviços e valores", "serviços"], ["Horários e endereço", "horários"], ["Falar com a equipe", "falar com a equipe"]]));
  if (text.length > 500) return response("Para sua segurança, envie uma mensagem mais curta ou escolha uma das opções abaixo.", state, replies([["Voltar ao menu", "menu"], ["Falar com a equipe", "falar com a equipe"]]));

  const value = normalize(text);
  if (value === "menu" || value === "início" || value === "inicio") {
    return response("Tudo bem, voltamos ao início. O que você precisa?", resetState(state), replies([["Agendar consulta", "agendar consulta"], ["Alugar uma sala", "alugar sala"], ["Serviços e valores", "serviços"], ["Horários e endereço", "horários"], ["Falar com a equipe", "falar com a equipe"]]));
  }

  if (state.phase === "handoff") return response("Sua solicitação já foi encaminhada para a equipe. Aguarde o retorno por este canal. Se for uma emergência, procure um serviço de urgência ou ligue para o SAMU (192).", state, [], { handoff: true });

  if (state.phase === "idle") {
    const intent = detectIntent(text);
    if (intent === "greeting" || intent === "unknown") return response("Olá! Sou a secretária virtual da Axiss Saúde Integrada. Posso ajudar com consultas, salas e informações gerais. O que você precisa?", state, replies([["Agendar consulta", "agendar consulta"], ["Alugar uma sala", "alugar sala"], ["Serviços e valores", "serviços"], ["Horários e endereço", "horários"], ["Falar com a equipe", "falar com a equipe"]]));
    if (intent === "consultation") return beginConsultation(state);
    if (intent === "room_rental") return beginRoomRental(state);
    if (intent === "services") {
      const services = await operations.listServices();
      return response(`Atendemos, neste protótipo, com:\n\n${services.map((service, index) => `${index + 1}. ${service.name} — ${service.priceLabel}\n   ${service.description}`).join("\n\n")}\n\nQuer solicitar um horário?`, state, replies([["Agendar consulta", "agendar consulta"], ["Voltar ao menu", "menu"]]));
    }
    if (intent === "hours_and_location") return response("O horário de atendimento e o endereço precisam ser confirmados pela equipe da clínica. Neste protótipo, posso mostrar os fluxos de consulta e locação de sala. O que você prefere?", state, replies([["Agendar consulta", "agendar consulta"], ["Alugar uma sala", "alugar sala"], ["Falar com a equipe", "falar com a equipe"]]));
    if (intent === "cancel_or_reschedule") return response("Para cancelar ou remarcar, vou encaminhar você para a equipe, que precisa localizar a solicitação com segurança.", { ...state, phase: "handoff" }, [], { handoff: true });
    return response("Vou encaminhar você para a equipe. Não compartilhe dados de saúde, senhas ou informações de cartão por aqui.", { ...state, phase: "handoff" }, [], { handoff: true });
  }

  if (state.phase === "awaiting_name") {
    const name = cleanName(text);
    if (name.length < 2 || /\d{3,}/.test(name)) return response("Pode me informar seu nome completo, por favor?", state);
    const next = { ...state, data: { ...state.data, name } };
    if (state.flow === "consultation") {
      const services = await operations.listServices();
      return response("Obrigada! Qual serviço você procura?", { ...next, phase: "awaiting_service" }, replies(services.map((service) => [service.name, service.id])));
    }
    const rooms = await operations.listRooms();
    return response("Obrigada! Qual sala você quer consultar?", { ...next, phase: "awaiting_room" }, replies(rooms.map((room) => [room.name, room.id])));
  }

  if (state.phase === "awaiting_service") {
    const services = await operations.listServices();
    const service = findByText(services, text);
    if (!service) return response("Não encontrei esse serviço no catálogo de demonstração. Escolha uma opção abaixo ou fale com a equipe.", state, replies([...services.map((item): [string, string] => [item.name, item.id]), ["Falar com a equipe", "falar com a equipe"]]));
    const professionals = await operations.listProfessionals(service.id);
    const next: SecretaryState = { ...state, data: { ...state.data, serviceId: service.id } };
    if (professionals.length === 1) {
      const availability = await operations.listConsultationAvailability({ serviceId: service.id, professionalId: professionals[0].id });
      const dates = [...new Map(availability.map((slot) => [slot.date, slot])).values()];
      return response(`${service.name} selecionado. Atendimento com ${professionals[0].name}. Qual data funciona melhor?`, { ...next, phase: "awaiting_date", data: { ...next.data, professionalId: professionals[0].id } }, replies(dates.map((slot) => [formatDate(slot.date), slot.date])));
    }
    return response("Qual profissional você prefere?", { ...next, phase: "awaiting_professional" }, replies(professionals.map((item) => [item.name, item.id])));
  }

  if (state.phase === "awaiting_professional") {
    const professionals = await operations.listProfessionals(state.data.serviceId);
    const professional = findByText(professionals, text);
    if (!professional) return response("Não encontrei esse profissional. Escolha uma opção abaixo.", state, replies(professionals.map((item) => [item.name, item.id])));
    const availability = await operations.listConsultationAvailability({ serviceId: state.data.serviceId!, professionalId: professional.id });
    const dates = [...new Map(availability.map((slot) => [slot.date, slot])).values()];
    return response("Ótimo. Qual data funciona melhor?", { ...state, phase: "awaiting_date", data: { ...state.data, professionalId: professional.id } }, replies(dates.map((slot) => [formatDate(slot.date), slot.date])));
  }

  if (state.phase === "awaiting_date") {
    const availability = await operations.listConsultationAvailability({ serviceId: state.data.serviceId!, professionalId: state.data.professionalId });
    const selectedDate = availability.find((slot) => slot.date === value || normalize(slot.label).includes(value))?.date;
    if (!selectedDate) return response("Escolha uma das datas disponíveis abaixo.", state, replies([...new Map(availability.map((slot) => [slot.date, slot])).values()].map((slot) => [formatDate(slot.date), slot.date])));
    const times = availability.filter((slot) => slot.date === selectedDate);
    return response(`Certo, ${formatDate(selectedDate)}. Qual horário você prefere?`, { ...state, phase: "awaiting_time", data: { ...state.data, date: selectedDate } }, replies(times.map((slot) => [slot.time, slot.time])));
  }

  if (state.phase === "awaiting_time") {
    const availability = await operations.listConsultationAvailability({ serviceId: state.data.serviceId!, professionalId: state.data.professionalId });
    const slot = availability.find((item) => item.date === state.data.date && (item.time === value || normalize(item.label).includes(value)));
    if (!slot) return response("Escolha um dos horários disponíveis abaixo.", state, replies(availability.filter((item) => item.date === state.data.date).map((item) => [item.time, item.time])));
    return consultationSummary({ ...state, data: { ...state.data, time: slot.time } }, operations);
  }

  if (state.phase === "awaiting_room") {
    const rooms = await operations.listRooms();
    const room = findByText(rooms, text);
    if (!room) return response("Não encontrei essa sala. Escolha uma opção abaixo.", state, replies(rooms.map((item) => [item.name, item.id])));
    const availability = await operations.listRoomAvailability(room.id);
    const dates = [...new Map(availability.map((slot) => [slot.date, slot])).values()];
    return response(`${room.name}: ${room.description} ${room.priceLabel}. Qual data você quer consultar?`, { ...state, phase: "awaiting_room_date", data: { ...state.data, roomId: room.id } }, replies(dates.map((slot) => [formatDate(slot.date), slot.date])));
  }

  if (state.phase === "awaiting_room_date") {
    const availability = await operations.listRoomAvailability(state.data.roomId!);
    const selectedDate = availability.find((slot) => slot.date === value || normalize(slot.label).includes(value))?.date;
    if (!selectedDate) return response("Escolha uma das datas disponíveis abaixo.", state, replies([...new Map(availability.map((slot) => [slot.date, slot])).values()].map((slot) => [formatDate(slot.date), slot.date])));
    return response(`Certo, ${formatDate(selectedDate)}. Por quantas horas você precisa da sala?`, { ...state, phase: "awaiting_room_duration", data: { ...state.data, date: selectedDate } }, replies([["1 hora", "1"], ["2 horas", "2"], ["4 horas", "4"], ["Dia inteiro", "8"]]));
  }

  if (state.phase === "awaiting_room_duration") {
    const durationHours = Number.parseInt(value, 10);
    if (![1, 2, 4, 8].includes(durationHours)) return response("Escolha uma duração disponível abaixo.", state, replies([["1 hora", "1"], ["2 horas", "2"], ["4 horas", "4"], ["Dia inteiro", "8"]]));
    return roomSummary({ ...state, data: { ...state.data, durationHours } }, operations);
  }

  if (state.phase === "awaiting_confirmation") {
    if (/^(sim|s|confirmar|confirmo|pode|ok|tudo certo)$/.test(value)) {
      if (state.flow === "consultation") {
        const result = await operations.createDemoConsultation({ name: state.data.name!, phone: state.data.phone, serviceId: state.data.serviceId!, professionalId: state.data.professionalId, date: state.data.date!, time: state.data.time! });
        return response(`Solicitação registrada no protótipo! Referência ${result.reference}. O protótipo não bloqueou nenhum horário real. A equipe precisaria confirmar a disponibilidade antes do atendimento.`, resetState(state), replies([["Agendar outra consulta", "agendar consulta"], ["Voltar ao menu", "menu"]]), { summary: state.data.name });
      }
      const result = await operations.createDemoRoomReservation({ name: state.data.name!, phone: state.data.phone, roomId: state.data.roomId!, date: state.data.date!, durationHours: state.data.durationHours! });
      return response(`Solicitação de sala registrada no protótipo! Referência ${result.reference}. Nenhuma reserva real foi criada. A equipe precisaria confirmar valores e disponibilidade.`, resetState(state), replies([["Alugar outra sala", "alugar sala"], ["Voltar ao menu", "menu"]]));
    }
    if (/^(n[aã]o|cancelar|corrigir|voltar)$/.test(value)) return response("Sem problema. Vamos recomeçar para corrigir os dados.", resetState(state), replies([["Agendar consulta", "agendar consulta"], ["Alugar uma sala", "alugar sala"]]));
    return response("Você quer confirmar esta solicitação de demonstração?", state, replies([["Confirmar solicitação", "confirmar"], ["Corrigir dados", "corrigir"]]), { summary: state.flow === "consultation" ? state.data.name : state.data.name });
  }

  return response("Não consegui avançar por aqui. Vou encaminhar você para a equipe.", { ...state, phase: "handoff" }, [], { handoff: true });
}

export function createInitialSecretaryState(): SecretaryState {
  return initialState();
}
