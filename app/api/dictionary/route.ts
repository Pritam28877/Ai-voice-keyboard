import { NextRequest } from "next/server";

import { requireUser } from "@/lib/auth/session";
import { jsonResponse, handleApiError } from "@/lib/api/response";
import { BadRequestError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import {
  dictionaryEntrySchema,
  type DictionaryEntryInput,
} from "@/lib/dictionary/schema";

export async function GET() {
  try {
    const user = await requireUser();
    const entries = await prisma.dictionaryEntry.findMany({
      where: { userId: user.id },
      orderBy: [
        { priority: "desc" },
        { createdAt: "desc" },
      ],
    });

    return jsonResponse({ entries });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    const json = await request.json();
    const parsed = dictionaryEntrySchema.safeParse({
      ...json,
      priority:
        typeof json?.priority === "number"
          ? json.priority
          : parseInt(json?.priority ?? "0", 10) || 0,
    });
    if (!parsed.success) {
      throw new BadRequestError(parsed.error.errors[0]?.message ?? "Invalid data");
    }

    const payload: DictionaryEntryInput = parsed.data;

    const entry = await prisma.dictionaryEntry.create({
      data: {
        userId: user.id,
        phrase: payload.phrase,
        canonical: payload.canonical,
        substitution: payload.substitution,
        notes: payload.notes,
        priority: payload.priority ?? 0,
      },
    });

    return jsonResponse({ entry }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

