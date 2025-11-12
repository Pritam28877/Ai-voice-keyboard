import { NextRequest } from "next/server";

import { requireUser } from "@/lib/auth/session";
import { jsonResponse, handleApiError } from "@/lib/api/response";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const user = await requireUser();
    const settings = await prisma.userSetting.findUnique({
      where: { userId: user.id },
    });

    return jsonResponse({
      settings,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await requireUser();
    const json = await request.json();

    const settings = await prisma.userSetting.upsert({
      where: { userId: user.id },
      update: {
        defaultLanguage:
          typeof json?.defaultLanguage === "string" && json.defaultLanguage.trim()
            ? json.defaultLanguage.trim()
            : undefined,
        autoPunctuation:
          typeof json?.autoPunctuation === "boolean"
            ? json.autoPunctuation
            : undefined,
        smartFormatting:
          typeof json?.smartFormatting === "boolean"
            ? json.smartFormatting
            : undefined,
        removeFillerWords:
          typeof json?.removeFillerWords === "boolean"
            ? json.removeFillerWords
            : undefined,
        enableAgentSuggestions:
          typeof json?.enableAgentSuggestions === "boolean"
            ? json.enableAgentSuggestions
            : undefined,
        maxSegmentDurationMs:
          typeof json?.maxSegmentDurationMs === "number"
            ? Math.max(1000, Math.min(20000, Math.floor(json.maxSegmentDurationMs)))
            : undefined,
        extraConfig:
          typeof json?.extraConfig === "object" ? json.extraConfig : undefined,
      },
      create: {
        userId: user.id,
        defaultLanguage:
          typeof json?.defaultLanguage === "string" && json.defaultLanguage.trim()
            ? json.defaultLanguage.trim()
            : "en-US",
        autoPunctuation:
          typeof json?.autoPunctuation === "boolean"
            ? json.autoPunctuation
            : true,
        smartFormatting:
          typeof json?.smartFormatting === "boolean" ? json.smartFormatting : true,
        removeFillerWords:
          typeof json?.removeFillerWords === "boolean"
            ? json.removeFillerWords
            : false,
        enableAgentSuggestions:
          typeof json?.enableAgentSuggestions === "boolean"
            ? json.enableAgentSuggestions
            : true,
        maxSegmentDurationMs:
          typeof json?.maxSegmentDurationMs === "number"
            ? Math.max(1000, Math.min(20000, Math.floor(json.maxSegmentDurationMs)))
            : 7000,
        extraConfig:
          typeof json?.extraConfig === "object" ? json.extraConfig : undefined,
      },
    });

    return jsonResponse({ settings });
  } catch (error) {
    return handleApiError(error);
  }
}

