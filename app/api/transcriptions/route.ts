import { NextRequest } from "next/server";

import { requireUser } from "@/lib/auth/session";
import { jsonResponse, handleApiError } from "@/lib/api/response";
import { prisma } from "@/lib/prisma";
import { startLiveTranscription } from "@/lib/transcription/live-manager";

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    const body = (await request.json().catch(() => ({}))) as {
      title?: string;
      context?: string;
    };

    const { transcriptionId, model } = await startLiveTranscription({
      userId: user.id,
      title: body.title,
      promptContext: body.context,
    });

    return jsonResponse(
      {
        transcriptionId,
        model,
      },
      { status: 201 },
    );
  } catch (error) {
    return handleApiError(error);
  }
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser();
    const { searchParams } = new URL(request.url);
    const limitParam = searchParams.get("limit");
    const limit = limitParam ? Math.min(parseInt(limitParam, 10) || 20, 100) : 20;

    const transcriptions = await prisma.transcription.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        title: true,
        content: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        completedAt: true,
        durationMs: true,
      },
    });

    return jsonResponse({ transcriptions });
  } catch (error) {
    return handleApiError(error);
  }
}

