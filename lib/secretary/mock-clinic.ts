import type {
  AvailabilitySlot,
  ClinicOperations,
  ClinicProfessional,
  ClinicRoom,
  ClinicService,
  ConsultationRequest,
  DemoRequestResult,
  RoomReservationRequest,
} from "@/lib/secretary/types";

export const demoServices: ClinicService[] = [
  {
    id: "psicologia",
    name: "Psicologia",
    description: "Atendimento psicológico individual para adultos e adolescentes.",
    durationMinutes: 50,
    priceLabel: "A partir de R$ 180",
  },
  {
    id: "nutricao",
    name: "Nutrição",
    description: "Avaliação e acompanhamento nutricional personalizado.",
    durationMinutes: 60,
    priceLabel: "A partir de R$ 160",
  },
  {
    id: "fisioterapia",
    name: "Fisioterapia",
    description: "Sessões de fisioterapia e reabilitação funcional.",
    durationMinutes: 50,
    priceLabel: "A partir de R$ 150",
  },
];

export const demoProfessionals: ClinicProfessional[] = [
  { id: "ana-clara", name: "Dra. Ana Clara", specialty: "Psicologia clínica", serviceIds: ["psicologia"] },
  { id: "marina", name: "Dra. Marina", specialty: "Nutrição funcional", serviceIds: ["nutricao"] },
  { id: "rafael", name: "Rafael", specialty: "Fisioterapia", serviceIds: ["fisioterapia"] },
];

export const demoRooms: ClinicRoom[] = [
  {
    id: "sala-serena",
    name: "Sala Serena",
    description: "Sala silenciosa para atendimentos individuais.",
    capacity: 3,
    priceLabel: "R$ 45 por hora",
    features: ["Ar-condicionado", "Wi-Fi", "Mesa de atendimento"],
  },
  {
    id: "sala-movimento",
    name: "Sala Movimento",
    description: "Ambiente amplo para fisioterapia e atividades corporais.",
    capacity: 8,
    priceLabel: "R$ 70 por hora",
    features: ["Espelhos", "Colchonetes", "Ar-condicionado"],
  },
];

const demoSlots: AvailabilitySlot[] = [
  { date: "2026-09-02", time: "09:00", label: "quarta-feira, 2 de setembro às 9h" },
  { date: "2026-09-02", time: "14:00", label: "quarta-feira, 2 de setembro às 14h" },
  { date: "2026-09-03", time: "10:30", label: "quinta-feira, 3 de setembro às 10h30" },
];

function createReference(prefix: string, input: { name: string; date: string; time?: string; roomId?: string }) {
  const source = `${prefix}|${input.name}|${input.date}|${input.time ?? input.roomId ?? ""}`;
  let hash = 0;
  for (const character of source) hash = (hash * 31 + character.charCodeAt(0)) % 10000;
  return `${prefix}-${String(hash).padStart(4, "0")}`;
}

export const mockClinicOperations: ClinicOperations = {
  async listServices() {
    return demoServices;
  },

  async listProfessionals(serviceId) {
    return serviceId ? demoProfessionals.filter((professional) => professional.serviceIds.includes(serviceId)) : demoProfessionals;
  },

  async listConsultationAvailability() {
    return demoSlots;
  },

  async listRooms() {
    return demoRooms;
  },

  async listRoomAvailability() {
    return demoSlots.map((slot) => ({ ...slot, label: `${slot.label} (disponível)` }));
  },

  async createDemoConsultation(input: ConsultationRequest): Promise<DemoRequestResult> {
    return { kind: "consultation", reference: createReference("CONS", input) };
  },

  async createDemoRoomReservation(input: RoomReservationRequest): Promise<DemoRequestResult> {
    return { kind: "room_rental", reference: createReference("SALA", input) };
  },
};
