import { NextRequest } from "next/server";

import { requireUser } from "@/lib/auth/session";
import { jsonResponse, handleApiError } from "@/lib/api/response";
import { BadRequestError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    const transcription = await prisma.transcription.findFirst({
      where: { id, userId: user.id },
      include: {
        chunks: {
          orderBy: { sequence: "asc" },
          select: {
            id: true,
            sequence: true,
            text: true,
            isFinal: true,
            startedAt: true,
            completedAt: true,
          },
        },
      },
    });

    if (!transcription) {
      return jsonResponse({ error: "Not found" }, { status: 404 });
    }

    return jsonResponse({ transcription });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    const body = await request.json();

    if (!body.title || typeof body.title !== "string") {
      throw new BadRequestError("Title is required");
    }

    const transcription = await prisma.transcription.findFirst({
      where: { id, userId: user.id },
    });

    if (!transcription) {
      return jsonResponse({ error: "Not found" }, { status: 404 });
    }

    const updated = await prisma.transcription.update({
      where: { id },
      data: {
        title: body.title,
        updatedAt: new Date(),
      },
    });

    return jsonResponse({ transcription: updated });
  } catch (error) {
    return handleApiError(error);
  }
}

