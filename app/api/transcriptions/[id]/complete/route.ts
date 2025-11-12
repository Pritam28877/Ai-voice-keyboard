import { NextRequest } from "next/server";

import { requireUser } from "@/lib/auth/session";
import { jsonResponse, handleApiError } from "@/lib/api/response";
import { finalizeTranscription } from "@/lib/transcription/live-manager";

type Params = {
  params: { id: string };
};

export async function POST(_request: NextRequest, { params }: Params) {
  try {
    const user = await requireUser();
    await finalizeTranscription({
      transcriptionId: params.id,
      userId: user.id,
    });
    return jsonResponse({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}

