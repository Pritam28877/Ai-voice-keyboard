import { NextRequest } from "next/server";

import { requireUser } from "@/lib/auth/session";
import { jsonResponse, handleApiError } from "@/lib/api/response";
import { finalizeTranscription } from "@/lib/transcription/live-manager";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(_request: NextRequest, context: RouteContext) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    await finalizeTranscription({
      transcriptionId: id,
      userId: user.id,
    });
    return jsonResponse({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}

