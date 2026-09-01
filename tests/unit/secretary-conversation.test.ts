import { describe, expect, it } from "vitest";
import { createInitialSecretaryState, handleSecretaryMessage } from "@/lib/secretary/conversation";
import { mockClinicOperations } from "@/lib/secretary/mock-clinic";

describe("secretary conversation", () => {
  it("shows a safe menu for a greeting", async () => {
    const result = await handleSecretaryMessage("Oi");

    expect(result.reply).toContain("secretária virtual");
    expect(result.quickReplies.map((reply) => reply.value)).toContain("agendar consulta");
  });

  it("walks through a consultation request and requires confirmation", async () => {
    let state = createInitialSecretaryState();
    let result = await handleSecretaryMessage("agendar consulta", state, mockClinicOperations);
    state = result.state;
    expect(state.phase).toBe("awaiting_name");

    result = await handleSecretaryMessage("Beatriz Lima", state, mockClinicOperations);
    state = result.state;
    expect(state.phase).toBe("awaiting_service");

    result = await handleSecretaryMessage("Psicologia", state, mockClinicOperations);
    state = result.state;
    expect(state.phase).toBe("awaiting_date");

    result = await handleSecretaryMessage("2026-09-02", state, mockClinicOperations);
    state = result.state;
    expect(state.phase).toBe("awaiting_time");

    result = await handleSecretaryMessage("09:00", state, mockClinicOperations);
    state = result.state;
    expect(state.phase).toBe("awaiting_confirmation");
    expect(result.summary).toContain("Beatriz Lima");

    result = await handleSecretaryMessage("confirmar", state, mockClinicOperations);
    expect(result.reply).toContain("CONS-");
    expect(result.reply).toContain("nenhum horário real");
    expect(result.state.phase).toBe("idle");
  });

  it("walks through a room request without creating a real reservation", async () => {
    let state = (await handleSecretaryMessage("alugar sala")).state;
    state = (await handleSecretaryMessage("Carlos Souza", state)).state;
    expect(state.phase).toBe("awaiting_room");
    state = (await handleSecretaryMessage("Sala Serena", state)).state;
    expect(state.phase).toBe("awaiting_room_date");
    state = (await handleSecretaryMessage("2026-09-03", state)).state;
    expect(state.phase).toBe("awaiting_room_duration");
    state = (await handleSecretaryMessage("2", state)).state;
    const result = await handleSecretaryMessage("sim", state);

    expect(result.reply).toContain("SALA-");
    expect(result.reply).toContain("Nenhuma reserva real foi criada");
  });

  it("routes medical and urgent requests to the team", async () => {
    const result = await handleSecretaryMessage("Estou com uma dor forte, qual remédio devo tomar?");

    expect(result.handoff).toBe(true);
    expect(result.state.phase).toBe("handoff");
    expect(result.reply).toContain("equipe");
  });

  it("does not accept unknown service names", async () => {
    const state = (await handleSecretaryMessage("agendar consulta")).state;
    const namedState = (await handleSecretaryMessage("Joana", state)).state;
    const result = await handleSecretaryMessage("Odontologia", namedState);

    expect(result.state.phase).toBe("awaiting_service");
    expect(result.reply).toContain("Não encontrei");
  });
});
