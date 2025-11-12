import { NextRequest } from "next/server";

import { requireUser } from "@/lib/auth/session";
import { jsonResponse, handleApiError } from "@/lib/api/response";
import { BadRequestError } from "@/lib/errors";
import { ingestAudioChunk } from "@/lib/transcription/live-manager";

type Params = {
  params: { id: string };
};

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const user = await requireUser();
    const body = await request.json();
    const data = body?.data;

    if (typeof data !== "string" || data.length === 0) {
      throw new BadRequestError("Missing audio data");
    }

    await ingestAudioChunk({
      transcriptionId: params.id,
      userId: user.id,
      base64Audio: data,
      durationMs:
        typeof body?.durationMs === "number" ? Math.max(body.durationMs, 0) : undefined,
      isLastChunk: body?.isLast === true,
    });

    return jsonResponse({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}

