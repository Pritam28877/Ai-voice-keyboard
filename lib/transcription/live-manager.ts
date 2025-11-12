import { GoogleGenAI, LiveServerMessage, Modality, Session } from "@google/genai";
import type { TranscriptionStatus } from "@prisma/client";

import { serverEnv } from "@/lib/env";
import { BadRequestError, NotFoundError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { buildTranscriptionInstruction } from "@/lib/transcription/prompt";

type SessionContext = {
  transcriptionId: string;
  userId: string;
  session: Session;
  queue: Promise<void>;
  finalized: boolean;
  lastPersistedText: string;
  model: string;
  sequence: number;
};

const ai = new GoogleGenAI({
  apiKey: serverEnv.GEMINI_API_KEY,
});

const liveSessions = new Map<string, SessionContext>();

const STATUS_COMPLETED: TranscriptionStatus = "COMPLETED";
const STATUS_STREAMING: TranscriptionStatus = "STREAMING";
const STATUS_FAILED: TranscriptionStatus = "FAILED";
const STATUS_CANCELLED: TranscriptionStatus = "CANCELLED";

type StartSessionArgs = {
  userId: string;
  title?: string | null;
  promptContext?: string | null;
};

export async function startLiveTranscription({
  userId,
  title,
  promptContext,
}: StartSessionArgs) {
  const settings = await prisma.userSetting.findUnique({
    where: { userId },
  });

  const language = settings?.defaultLanguage ?? "en-US";
  const model = settings?.geminiModel ?? serverEnv.GEMINI_MODEL_DEFAULT;
  const dictionary = await prisma.dictionaryEntry.findMany({
    where: { userId },
    orderBy: { priority: "desc" },
  });

  const instruction = buildTranscriptionInstruction({
    language,
    dictionary,
    extraContext: promptContext,
  });

  const transcription = await prisma.transcription.create({
    data: {
      userId,
      title,
      status: STATUS_STREAMING,
      language,
      content: "",
      normalizedContent: "",
      dictionarySnapshot: dictionary.map((entry) => ({
        id: entry.id,
        phrase: entry.phrase,
        canonical: entry.canonical,
        substitution: entry.substitution,
        notes: entry.notes,
        priority: entry.priority,
      })),
      promptContext: promptContext
        ? {
            context: promptContext,
          }
        : undefined,
      segmentCount: 0,
    },
  });

  const config = {
    responseModalities: [Modality.TEXT],
    realtimeInputConfig: {
      automaticActivityDetection: {},
    },
    systemInstruction: {
      role: "system",
      parts: [{ text: instruction }],
    },
  };

  const session = await ai.live.connect({
    model,
    config,
    callbacks: {
      onmessage: (message) => handleLiveMessage(transcription.id, message),
      onerror: (error) => {
        console.error("Gemini live session error", error);
        void failTranscription(transcription.id, userId, error.message);
      },
      onclose: () => {
        liveSessions.delete(transcription.id);
      },
    },
  });

  const ctx: SessionContext = {
    transcriptionId: transcription.id,
    userId,
    session,
    queue: Promise.resolve(),
    finalized: false,
    lastPersistedText: "",
    model,
    sequence: 0,
  };

  liveSessions.set(transcription.id, ctx);

  return {
    transcriptionId: transcription.id,
    model,
  };
}

type IngestChunkArgs = {
  transcriptionId: string;
  userId: string;
  base64Audio: string;
  durationMs?: number;
  isLastChunk?: boolean;
};

export async function ingestAudioChunk({
  transcriptionId,
  userId,
  base64Audio,
  durationMs,
  isLastChunk,
}: IngestChunkArgs) {
  const ctx = liveSessions.get(transcriptionId);
  if (!ctx || ctx.userId !== userId) {
    throw new NotFoundError("Active transcription session not found");
  }

  if (ctx.finalized) {
    throw new BadRequestError("Transcription already finalized");
  }

  ctx.session.sendRealtimeInput({
    audio: {
      data: base64Audio,
      mimeType: "audio/pcm;rate=16000",
    },
  });

  if (durationMs) {
    ctx.queue = ctx.queue.then(async () => {
      await prisma.transcription.update({
        where: { id: transcriptionId },
        data: {
          durationMs: {
            increment: durationMs,
          },
        },
      });
    });
  }

  if (isLastChunk) {
    await finalizeTranscription({ transcriptionId, userId });
  }
}

type FinalizeArgs = {
  transcriptionId: string;
  userId: string;
};

export async function finalizeTranscription({
  transcriptionId,
  userId,
}: FinalizeArgs) {
  const ctx = liveSessions.get(transcriptionId);
  if (!ctx || ctx.userId !== userId) {
    throw new NotFoundError("Active transcription session not found");
  }

  if (ctx.finalized) {
    return;
  }

  ctx.finalized = true;
  ctx.session.close();

  ctx.queue = ctx.queue.then(async () => {
    await prisma.transcription.update({
      where: { id: transcriptionId },
      data: {
        status: STATUS_COMPLETED,
        completedAt: new Date(),
      },
    });
  });

  liveSessions.delete(transcriptionId);
}

export async function cancelTranscription({
  transcriptionId,
  userId,
}: FinalizeArgs) {
  const ctx = liveSessions.get(transcriptionId);
  if (ctx && ctx.userId === userId) {
    ctx.finalized = true;
    ctx.session.close();
    liveSessions.delete(transcriptionId);
  }

  await prisma.transcription.updateMany({
    where: { id: transcriptionId, userId },
    data: { status: STATUS_CANCELLED, updatedAt: new Date() },
  });
}

async function handleLiveMessage(
  transcriptionId: string,
  message: LiveServerMessage,
) {
  const ctx = liveSessions.get(transcriptionId);
  if (!ctx || ctx.finalized) {
    return;
  }

  const inputText = message.serverContent?.inputTranscription?.text;
  const inputFinished = message.serverContent?.inputTranscription?.finished;
  const turnComplete = message.serverContent?.turnComplete ?? false;
  const generationComplete =
    message.serverContent?.generationComplete ?? false;
  const text = inputText ?? message.text;

  if (text && text !== ctx.lastPersistedText) {
    ctx.lastPersistedText = text;
    const chunkSequence = ++ctx.sequence;
    ctx.queue = ctx.queue.then(async () => {
      await prisma.$transaction([
        prisma.transcription.update({
          where: { id: transcriptionId },
          data: {
            content: text,
            normalizedContent: text,
            updatedAt: new Date(),
            segmentCount: chunkSequence,
          },
        }),
        prisma.transcriptionChunk.upsert({
          where: {
            transcriptionId_sequence: {
              transcriptionId,
              sequence: chunkSequence,
            },
          },
          create: {
            transcriptionId,
            sequence: chunkSequence,
            text,
            isFinal: inputFinished ?? false,
            completedAt: inputFinished ? new Date() : undefined,
          },
          update: {
            text,
            isFinal: inputFinished ?? false,
            completedAt: inputFinished ? new Date() : undefined,
          },
        }),
      ]);
    });
  }

  if (generationComplete || turnComplete || (inputFinished && text)) {
    ctx.finalized = true;
    ctx.session.close();
    liveSessions.delete(transcriptionId);
    ctx.queue = ctx.queue.then(async () => {
      await prisma.transcription.update({
        where: { id: transcriptionId },
        data: {
          status: STATUS_COMPLETED,
          completedAt: new Date(),
        },
      });
    });
  }
}

async function failTranscription(
  transcriptionId: string,
  userId: string,
  reason: string,
) {
  const ctx = liveSessions.get(transcriptionId);
  if (ctx && ctx.userId === userId) {
    ctx.finalized = true;
    ctx.session.close();
    liveSessions.delete(transcriptionId);
  }

  await prisma.transcription.updateMany({
    where: { id: transcriptionId, userId },
    data: {
      status: STATUS_FAILED,
      metadata: {
        message: reason,
      },
    },
  });
}

