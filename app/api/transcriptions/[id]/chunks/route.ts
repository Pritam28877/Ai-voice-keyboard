import { NextRequest } from "next/server";

import { requireUser } from "@/lib/auth/session";
import { jsonResponse, handleApiError } from "@/lib/api/response";
import { BadRequestError } from "@/lib/errors";
import { ingestAudioChunk } from "@/lib/transcription/live-manager";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    const body = await request.json();
    const data = body?.data;

    if (typeof data !== "string" || data.length === 0) {
      throw new BadRequestError("Missing audio data");
    }

    console.log(`Received chunk for transcription ${id}: ${data.length} chars, isLast=${body?.isLast}`);

    await ingestAudioChunk({
      transcriptionId: id,
      userId: user.id,
      base64Audio: data,
      durationMs:
        typeof body?.durationMs === "number" ? Math.max(body.durationMs, 0) : undefined,
      isLastChunk: body?.isLast === true,
    });

    return jsonResponse({ ok: true });
  } catch (error) {
    console.error("Chunks API error:", error);
    return handleApiError(error);
  }
}

