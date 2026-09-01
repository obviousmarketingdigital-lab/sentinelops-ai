export type SecretaryIntent =
  | "greeting"
  | "services"
  | "hours_and_location"
  | "consultation"
  | "room_rental"
  | "cancel_or_reschedule"
  | "human_handoff"
  | "unknown";

export type ConversationFlow = "consultation" | "room_rental" | null;

export type ConversationPhase =
  | "idle"
  | "awaiting_name"
  | "awaiting_service"
  | "awaiting_professional"
  | "awaiting_date"
  | "awaiting_time"
  | "awaiting_room"
  | "awaiting_room_date"
  | "awaiting_room_duration"
  | "awaiting_confirmation"
  | "handoff";

export type ConversationData = {
  name?: string;
  phone?: string;
  serviceId?: string;
  professionalId?: string;
  date?: string;
  time?: string;
  roomId?: string;
  durationHours?: number;
  purpose?: string;
};

export type SecretaryState = {
  phase: ConversationPhase;
  flow: ConversationFlow;
  data: ConversationData;
  updatedAt: number;
};

export type ClinicService = {
  id: string;
  name: string;
  description: string;
  durationMinutes: number;
  priceLabel: string;
};

export type ClinicProfessional = {
  id: string;
  name: string;
  specialty: string;
  serviceIds: string[];
};

export type ClinicRoom = {
  id: string;
  name: string;
  description: string;
  capacity: number;
  priceLabel: string;
  features: string[];
};

export type AvailabilitySlot = {
  date: string;
  time: string;
  label: string;
};

export type ConsultationRequest = {
  name: string;
  phone?: string;
  serviceId: string;
  professionalId?: string;
  date: string;
  time: string;
};

export type RoomReservationRequest = {
  name: string;
  phone?: string;
  roomId: string;
  date: string;
  durationHours: number;
  purpose?: string;
};

export type DemoRequestResult = {
  reference: string;
  kind: "consultation" | "room_rental";
};

export interface ClinicOperations {
  listServices(): Promise<ClinicService[]>;
  listProfessionals(serviceId?: string): Promise<ClinicProfessional[]>;
  listConsultationAvailability(input: {
    serviceId: string;
    professionalId?: string;
  }): Promise<AvailabilitySlot[]>;
  listRooms(): Promise<ClinicRoom[]>;
  listRoomAvailability(roomId: string): Promise<AvailabilitySlot[]>;
  createDemoConsultation(input: ConsultationRequest): Promise<DemoRequestResult>;
  createDemoRoomReservation(input: RoomReservationRequest): Promise<DemoRequestResult>;
}

export type QuickReply = {
  label: string;
  value: string;
};

export type SecretaryChatResponse = {
  reply: string;
  quickReplies: QuickReply[];
  state: SecretaryState;
  summary?: string;
  handoff: boolean;
  demoNotice: string;
};
