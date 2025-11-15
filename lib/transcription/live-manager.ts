import OpenAI from "openai";
import type { TranscriptionStatus } from "@prisma/client";

import { serverEnv } from "@/lib/env";
import { BadRequestError, NotFoundError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { buildTranscriptionInstruction } from "@/lib/transcription/prompt";

type SessionContext = {
  transcriptionId: string;
  userId: string;
  finalized: boolean;
  audioChunks: Buffer[];
  totalDurationMs: number;
  language: string;
  prompt?: string;
};

const openai = new OpenAI({
  apiKey: serverEnv.OPENAI_API_KEY,
});

// Store sessions in global scope to survive Next.js HMR (Hot Module Reload)
// This prevents losing audio chunks when the dev server recompiles
declare global {
  var liveSessions: Map<string, SessionContext> | undefined;
}

const liveSessions = global.liveSessions ?? new Map<string, SessionContext>();
global.liveSessions = liveSessions;

if (process.env.NODE_ENV !== 'production') {
  console.log('🔄 Live sessions storage initialized (HMR-safe)');
}

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
  const dictionary = await prisma.dictionaryEntry.findMany({
    where: { userId },
    orderBy: { priority: "desc" },
  });

  // Create custom vocabulary prompt for Whisper (limit 224 chars, prioritize high-priority entries)
  let whisperPrompt: string | undefined = undefined;
  if (dictionary.length > 0) {
    const MAX_PROMPT_LENGTH = 224;
    const terms: string[] = [];
    let currentLength = 0;
    
    for (const entry of dictionary) {
      const term = entry.canonical || entry.phrase;
      const termWithSeparator = terms.length === 0 ? term : `, ${term}`;
      
      if (currentLength + termWithSeparator.length <= MAX_PROMPT_LENGTH) {
        terms.push(term);
        currentLength += termWithSeparator.length;
      } else {
        break; // Stop adding once we hit the limit
      }
    }
    
    whisperPrompt = terms.join(", ");
  }

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

  const ctx: SessionContext = {
    transcriptionId: transcription.id,
    userId,
    finalized: false,
    audioChunks: [],
    totalDurationMs: 0,
    language: language.split('-')[0], // Whisper uses language codes like 'en', 'es', etc.
    prompt: whisperPrompt,
  };

  liveSessions.set(transcription.id, ctx);
  console.log(`✨ Created new transcription session: ${transcription.id}`);
  console.log(`📊 Active sessions: ${liveSessions.size}`);
  if (whisperPrompt) {
    console.log(`📖 Dictionary prompt (${whisperPrompt.length}/224 chars): "${whisperPrompt}"`);
  };

  return {
    transcriptionId: transcription.id,
    model: "whisper-1",
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
  let ctx = liveSessions.get(transcriptionId);

  // If session doesn't exist in memory, try to restore it from database
  if (!ctx) {
    console.warn(`⚠️ Session ${transcriptionId} not found in memory! This means audio chunks were lost.`);
    console.log(`Attempting to restore session from database, but audio data cannot be recovered.`);
    
    const transcription = await prisma.transcription.findUnique({
      where: { id: transcriptionId, userId },
    });

    if (transcription && transcription.status === "STREAMING") {
      // Restore session from database, but warn that audio chunks are lost
      console.error(`⚠️ CRITICAL: Restoring session ${transcriptionId} with EMPTY audioChunks array. Previous audio data is lost!`);
      
      ctx = {
        transcriptionId,
        userId,
        finalized: false,
        audioChunks: [], // WARNING: Previous chunks are lost!
        totalDurationMs: transcription.durationMs || 0,
        language: transcription.language.split('-')[0] || 'en',
        prompt: undefined, // Can't restore prompt from DB easily
      };
      liveSessions.set(transcriptionId, ctx);
      console.log(`Session ${transcriptionId} restored from database, but starting with fresh audioChunks`);
    }
  }

  if (!ctx || ctx.userId !== userId) {
    console.error(`Session not found for transcription ${transcriptionId}, user ${userId}`);
    throw new NotFoundError("Active transcription session not found");
  }

  if (ctx.finalized) {
    console.warn(`Attempted to add chunk to already finalized transcription ${transcriptionId}`);
    throw new BadRequestError("Transcription already finalized");
  }

  // Accumulate audio chunks
  const audioBuffer = Buffer.from(base64Audio, 'base64');
  ctx.audioChunks.push(audioBuffer);
  
  console.log(`Added chunk to ${transcriptionId}: now have ${ctx.audioChunks.length} chunks, total ${ctx.audioChunks.reduce((sum, chunk) => sum + chunk.length, 0)} bytes`);

  // Update duration
  if (durationMs) {
    ctx.totalDurationMs += durationMs;

    await prisma.transcription.update({
      where: { id: transcriptionId },
      data: {
        durationMs: ctx.totalDurationMs,
        updatedAt: new Date(),
      },
    });
  }

  if (isLastChunk) {
    console.log(`Last chunk received for ${transcriptionId}, initiating finalization`);
    await finalizeTranscription({ transcriptionId, userId });
  }
}

// Main transcription function - processes all accumulated audio at once
async function transcribeAudio(ctx: SessionContext): Promise<string> {
  if (ctx.audioChunks.length === 0) {
    console.log("No audio chunks to transcribe");
    return "";
  }

  console.log(`Transcribing ${ctx.audioChunks.length} audio chunks, total size: ${ctx.audioChunks.reduce((sum, chunk) => sum + chunk.length, 0)} bytes`);

  // Combine all audio chunks
  const combinedAudio = Buffer.concat(ctx.audioChunks);
  console.log(`Combined audio size: ${combinedAudio.length} bytes`);

  // Validate minimum audio size (at least 1 second of 16kHz audio = ~32KB)
  if (combinedAudio.length < 32000) {
    console.log("Audio too short, skipping transcription");
    return "Audio too short to transcribe";
  }

  try {
    // Convert PCM audio to WAV format
    const audioBlob = createWavBlob(combinedAudio);
    console.log(`WAV blob size: ${audioBlob.length} bytes`);

    // Send to Whisper API
    console.log("Sending to Whisper API...");
    const transcription = await openai.audio.transcriptions.create({
      file: new File([new Uint8Array(audioBlob)], 'audio.wav', { type: 'audio/wav' }),
      model: "whisper-1",
      language: ctx.language,
      prompt: ctx.prompt,
      response_format: "json",
    });

    const result = transcription.text || "";
    console.log(`Whisper result: "${result}"`);
    return result;
  } catch (error) {
    console.error("Whisper transcription error:", error);
    // Return a fallback message instead of throwing
    return `Transcription failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
  }
}

// Helper function to create WAV blob from PCM buffer
function createWavBlob(pcmBuffer: Buffer): Buffer {
  const sampleRate = 16000;
  const numChannels = 1;
  const bitsPerSample = 16;
  const blockAlign = numChannels * bitsPerSample / 8;
  const byteRate = sampleRate * blockAlign;
  const dataSize = pcmBuffer.length;
  const bufferSize = 44 + dataSize;

  const buffer = Buffer.alloc(bufferSize);

  // WAV header
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(bufferSize - 8, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16); // Subchunk1Size
  buffer.writeUInt16LE(1, 20); // AudioFormat (PCM)
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  // Copy PCM data
  pcmBuffer.copy(buffer, 44);

  return buffer;
}

type FinalizeArgs = {
  transcriptionId: string;
  userId: string;
};

export async function finalizeTranscription({
  transcriptionId,
  userId,
}: FinalizeArgs) {
  console.log(`🎯 Finalizing transcription ${transcriptionId} for user ${userId}`);
  console.log(`📊 Active sessions in memory: ${liveSessions.size}`);
  console.log(`📊 Session keys: ${Array.from(liveSessions.keys()).join(', ')}`);

  const ctx = liveSessions.get(transcriptionId);

  // Don't attempt to restore from database if session is missing - this would result in no audio chunks
  if (!ctx) {
    console.error(`❌ CRITICAL: Cannot finalize ${transcriptionId} - session not found in memory!`);
    console.error(`This means all audio chunks are lost. The transcription cannot be completed.`);
    
    // Mark the transcription as failed since we have no audio to process
    await prisma.transcription.updateMany({
      where: { id: transcriptionId, userId },
      data: { 
        status: STATUS_FAILED,
        content: "ERROR: Audio data was lost before transcription could be completed. This may happen if the server restarted or the session expired.",
        completedAt: new Date(),
      },
    });
    
    throw new NotFoundError("Transcription session lost - audio data not available");
  }

  if (ctx.userId !== userId) {
    console.error(`❌ User mismatch for transcription ${transcriptionId}`);
    throw new NotFoundError("Active transcription session not found");
  }

  if (ctx.finalized) {
    console.log(`ℹ️ Transcription ${transcriptionId} already finalized, skipping`);
    return;
  }

  ctx.finalized = true;
  
  const totalAudioBytes = ctx.audioChunks.reduce((sum, chunk) => sum + chunk.length, 0);
  console.log(`📊 Starting transcription process for ${ctx.audioChunks.length} chunks (${totalAudioBytes} bytes total)`);

  // Get the transcription from Whisper (never throws, returns error message if failed)
  const transcribedText = await transcribeAudio(ctx);
  console.log(`✅ Transcription completed: "${transcribedText.substring(0, 100)}${transcribedText.length > 100 ? '...' : ''}"`);

  // Save the transcription to database
  const result = await prisma.transcription.update({
    where: { id: transcriptionId },
    data: {
      content: transcribedText,
      normalizedContent: transcribedText,
      status: STATUS_COMPLETED,
      completedAt: new Date(),
    },
  });
  console.log(`💾 Database updated successfully: ${result.id}`);
  
  // Clean up session
  liveSessions.delete(transcriptionId);
  console.log(`🧹 Session cleaned up for ${transcriptionId}`);
}

export async function cancelTranscription({
  transcriptionId,
  userId,
}: FinalizeArgs) {
  const ctx = liveSessions.get(transcriptionId);
  if (ctx && ctx.userId === userId) {
    ctx.finalized = true;
    liveSessions.delete(transcriptionId);
  }

  await prisma.transcription.updateMany({
    where: { id: transcriptionId, userId },
    data: { status: STATUS_CANCELLED, updatedAt: new Date() },
  });
}


