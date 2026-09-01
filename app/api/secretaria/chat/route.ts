import { NextResponse } from "next/server";
import { handleSecretaryMessage } from "@/lib/secretary/conversation";
import type { SecretaryState } from "@/lib/secretary/types";

type ChatBody = {
  message?: unknown;
  state?: unknown;
};

function isSecretaryState(value: unknown): value is SecretaryState {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<SecretaryState>;
  return typeof candidate.phase === "string"
    && (candidate.flow === null || candidate.flow === "consultation" || candidate.flow === "room_rental")
    && typeof candidate.data === "object"
    && candidate.data !== null;
}

export async function POST(request: Request) {
  let body: ChatBody;
  try {
    body = await request.json() as ChatBody;
  } catch {
    return NextResponse.json({ error: "invalid-json" }, { status: 400 });
  }

  if (typeof body.message !== "string" || body.message.trim().length === 0) {
    return NextResponse.json({ error: "message-required" }, { status: 400 });
  }

  if (body.message.length > 500) {
    return NextResponse.json({ error: "message-too-long" }, { status: 413 });
  }

  const state = body.state === undefined ? undefined : isSecretaryState(body.state) ? body.state : undefined;
  const result = await handleSecretaryMessage(body.message, state);

  return NextResponse.json(result, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
