import { NextRequest } from "next/server";

import { requireUser } from "@/lib/auth/session";
import { jsonResponse, handleApiError } from "@/lib/api/response";
import { BadRequestError, NotFoundError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import {
  dictionaryEntrySchema,
  type DictionaryEntryInput,
} from "@/lib/dictionary/schema";

type Params = {
  params: { id: string };
};

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const user = await requireUser();
    const existing = await prisma.dictionaryEntry.findFirst({
      where: { id: params.id, userId: user.id },
    });
    if (!existing) {
      throw new NotFoundError("Dictionary entry not found");
    }

    const json = await request.json();
    const parsed = dictionaryEntrySchema
      .extend({ phrase: dictionaryEntrySchema.shape.phrase.optional() })
      .safeParse({
        ...json,
        priority:
          typeof json?.priority === "number"
            ? json.priority
            : parseInt(json?.priority ?? `${existing.priority}`, 10) ||
              existing.priority,
      });

    if (!parsed.success) {
      throw new BadRequestError(parsed.error.errors[0]?.message ?? "Invalid data");
    }

    const payload: DictionaryEntryInput = parsed.data;

    const entry = await prisma.dictionaryEntry.update({
      where: { id: existing.id },
      data: {
        phrase: payload.phrase ?? existing.phrase,
        canonical:
          payload.canonical !== undefined ? payload.canonical : existing.canonical,
        substitution:
          payload.substitution !== undefined
            ? payload.substitution
            : existing.substitution,
        notes: payload.notes !== undefined ? payload.notes : existing.notes,
        priority: payload.priority ?? existing.priority,
      },
    });

    return jsonResponse({ entry });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const user = await requireUser();
    const existing = await prisma.dictionaryEntry.findFirst({
      where: { id: params.id, userId: user.id },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundError("Dictionary entry not found");
    }

    await prisma.dictionaryEntry.delete({
      where: { id: existing.id },
    });

    return jsonResponse({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}

