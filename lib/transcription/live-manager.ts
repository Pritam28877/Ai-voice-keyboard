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
  lastTranscriptionTime: number;
  accumulatedTranscript: string;
  isProcessing: boolean;
  processingChunkCount: number; // Track how many chunks are being processed
  lastChunkRMS: number; // Track audio level of last chunk for pause detection
  wasSilent: boolean; // Track if we were in a silent period
  pendingDbUpdates: Set<Promise<any>>; // Track background DB updates
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

// GOOGLE TRANSLATE SPEED: Ultra-aggressive transcription every 1 second
// Maximum speed for near-instant transcription like Google Translate
const TRANSCRIPTION_INTERVAL_MS = 1000; // 1 second - ULTRA FAST
// Minimum audio duration: 1 second for instant feedback
const MIN_AUDIO_DURATION_SECONDS = 1;
// Maximum recording duration (15 minutes)
const MAX_RECORDING_DURATION_MS = 15 * 60 * 1000;
// VERY LOW threshold - capture even quiet speech and pauses
const MIN_AUDIO_RMS_THRESHOLD = 0.002; // Much lower - don't skip quiet speech

// Helper function to detect Whisper hallucinations/looping
function detectHallucination(text: string): boolean {
  if (!text || text.length < 20) return false;
  
  // Check for repetitive patterns
  const words = text.toLowerCase().split(/\s+/);
  
  // Detect if same phrase repeats 3+ times
  const phrases = text.toLowerCase().split(/[.!?]\s*/);
  const phraseCount = new Map<string, number>();
  
  for (const phrase of phrases) {
    const normalized = phrase.trim();
    if (normalized.length > 5) {
      phraseCount.set(normalized, (phraseCount.get(normalized) || 0) + 1);
      if (phraseCount.get(normalized)! >= 3) {
        console.warn(`🚨 Hallucination detected: "${normalized}" repeated ${phraseCount.get(normalized)} times`);
        return true;
      }
    }
  }
  
  // Check for word-level repetition (same word repeated 5+ times in a row)
  let consecutiveCount = 1;
  for (let i = 1; i < words.length; i++) {
    if (words[i] === words[i - 1] && words[i].length > 2) {
      consecutiveCount++;
      if (consecutiveCount >= 5) {
        console.warn(`🚨 Word repetition detected: "${words[i]}" repeated ${consecutiveCount} times`);
        return true;
      }
    } else {
      consecutiveCount = 1;
    }
  }
  
  return false;
}

// Helper function to calculate RMS of audio buffer
function calculateBufferRMS(buffer: Buffer): number {
  const samples = new Int16Array(buffer.buffer, buffer.byteOffset, buffer.length / 2);
  let sum = 0;
  for (let i = 0; i < samples.length; i++) {
    const normalized = samples[i] / 32768;
    sum += normalized * normalized;
  }
  return Math.sqrt(sum / samples.length);
}

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

  // Generate sequential title if none provided
  let sessionTitle = title;
  if (!sessionTitle) {
    const count = await prisma.transcription.count({
      where: { userId },
    });
    sessionTitle = `Session #${count + 1}`;
  }

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
      title: sessionTitle,
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
    lastTranscriptionTime: Date.now(),
    accumulatedTranscript: "",
    isProcessing: false,
    processingChunkCount: 0,
    lastChunkRMS: 0,
    wasSilent: false,
    pendingDbUpdates: new Set(),
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

  // If session doesn't exist in memory, restore from database (graceful recovery)
  if (!ctx) {
    console.warn(`⚠️ Session ${transcriptionId} not in memory, restoring from DB...`);
    
    const transcription = await prisma.transcription.findUnique({
      where: { id: transcriptionId, userId },
    });

    if (transcription && transcription.status === "STREAMING") {
      console.log(`✅ Restoring session ${transcriptionId} from database`);
      
      ctx = {
        transcriptionId,
        userId,
        finalized: false,
        audioChunks: [], // Start fresh - previous chunks already processed
        totalDurationMs: transcription.durationMs || 0,
        language: transcription.language.split('-')[0] || 'en',
        prompt: undefined,
        lastTranscriptionTime: Date.now(),
        accumulatedTranscript: transcription.content || "",
        isProcessing: false,
        processingChunkCount: 0,
        lastChunkRMS: 0,
        wasSilent: false,
        pendingDbUpdates: new Set(),
      };
      liveSessions.set(transcriptionId, ctx);
      console.log(`📦 Session restored: ${transcriptionId}`);
    }
  }

  if (!ctx || ctx.userId !== userId) {
    console.error(`❌ Session not found for transcription ${transcriptionId}, user ${userId}`);
    throw new NotFoundError("Active transcription session not found");
  }

  if (ctx.finalized) {
    console.warn(`Attempted to add chunk to already finalized transcription ${transcriptionId}`);
    throw new BadRequestError("Transcription already finalized");
  }

  // Accumulate audio chunks
  const audioBuffer = Buffer.from(base64Audio, 'base64');
  ctx.audioChunks.push(audioBuffer);
  
  // Calculate RMS of this chunk for pause/resume detection
  const chunkRMS = calculateBufferRMS(audioBuffer);
  
  // INSTANT RESUME DETECTION: Detect when speech resumes after silence
  const speechResumed = ctx.wasSilent && chunkRMS > MIN_AUDIO_RMS_THRESHOLD * 3;
  
  if (speechResumed) {
    console.log(`🎤 SPEECH RESUMED after pause! RMS: ${chunkRMS.toFixed(4)} (was silent: ${ctx.lastChunkRMS.toFixed(4)})`);
  }
  
  // Update tracking
  ctx.lastChunkRMS = chunkRMS;
  ctx.wasSilent = chunkRMS < MIN_AUDIO_RMS_THRESHOLD * 2;
  
  // Reduce logging frequency for performance (only log every 10th chunk)
  if (ctx.audioChunks.length % 10 === 0) {
    console.log(`Added chunk to ${transcriptionId}: now have ${ctx.audioChunks.length} chunks`);
  }

  // Update duration
  if (durationMs) {
    ctx.totalDurationMs += durationMs;

    // BACKGROUND DB UPDATE - Don't wait, update in background
    const dbUpdatePromise = prisma.transcription.update({
      where: { id: transcriptionId },
      data: {
        durationMs: ctx.totalDurationMs,
        updatedAt: new Date(),
      },
    }).then(() => {
      ctx.pendingDbUpdates.delete(dbUpdatePromise);
    }).catch((error) => {
      console.error(`⚠️ Background duration update failed:`, error);
      ctx.pendingDbUpdates.delete(dbUpdatePromise);
    });
    
    ctx.pendingDbUpdates.add(dbUpdatePromise);

    // Warn if recording is approaching or exceeds maximum duration
    if (ctx.totalDurationMs >= MAX_RECORDING_DURATION_MS) {
      console.warn(`⚠️ Recording ${transcriptionId} has reached maximum duration (${ctx.totalDurationMs}ms / ${MAX_RECORDING_DURATION_MS}ms)`);
    } else if (ctx.totalDurationMs >= MAX_RECORDING_DURATION_MS * 0.9) {
      console.log(`📢 Recording ${transcriptionId} is at ${Math.round((ctx.totalDurationMs / MAX_RECORDING_DURATION_MS) * 100)}% of maximum duration`);
    }
  }

  // Check if it's time to process accumulated audio chunks
  const now = Date.now();
  const timeSinceLastTranscription = now - ctx.lastTranscriptionTime;
  const shouldProcessNow = timeSinceLastTranscription >= TRANSCRIPTION_INTERVAL_MS;

  // AGGRESSIVE: Also process if we have many chunks (>10) regardless of time
  // This prevents data loss during long speaking sessions - ULTRA AGGRESSIVE for speed
  const hasManyChunks = ctx.audioChunks.length >= 10;
  
  // INSTANT RESUME: Process immediately if speech resumed after pause (even if only 5+ chunks)
  const shouldProcessResume = speechResumed && ctx.audioChunks.length >= 5;

  if ((shouldProcessNow || hasManyChunks || shouldProcessResume) && !ctx.isProcessing && ctx.audioChunks.length > 0) {
    const reason = shouldProcessResume 
      ? `SPEECH RESUMED (${ctx.audioChunks.length} chunks)` 
      : hasManyChunks 
        ? `${ctx.audioChunks.length} chunks accumulated` 
        : `${timeSinceLastTranscription}ms since last`;
    console.log(`🎙️ Triggering transcription for ${transcriptionId} (${reason})`);
    // Process in background without blocking chunk ingestion
    processAccumulatedAudio(ctx).catch((error) => {
      console.error(`Error in periodic transcription for ${transcriptionId}:`, error);
    });
  }

  if (isLastChunk) {
    console.log(`Last chunk received for ${transcriptionId}, initiating finalization`);
    await finalizeTranscription({ transcriptionId, userId });
  }
}

// Process accumulated audio chunks and append to transcript (called periodically during recording)
async function processAccumulatedAudio(ctx: SessionContext): Promise<void> {
  if (ctx.isProcessing || ctx.audioChunks.length === 0) {
    return;
  }

  ctx.isProcessing = true;
  
  // CRITICAL: Snapshot the current chunks to process and clear the array
  // This prevents data loss - new chunks can arrive while we're processing
  const chunksToProcess = [...ctx.audioChunks];
  ctx.processingChunkCount = chunksToProcess.length;
  ctx.audioChunks = []; // Clear immediately so new chunks go into fresh array

  try {
    console.log(`🎤 Processing ${chunksToProcess.length} audio chunks for ${ctx.transcriptionId}`);

    // Combine all audio chunks from snapshot
    const combinedAudio = Buffer.concat(chunksToProcess);
    const totalAudioBytes = combinedAudio.length;
    
    // Check if we have enough audio to transcribe (at least 1 second at 16kHz = ~32KB)
    // BUT: Lower threshold after pause resume (0.5 seconds = ~16KB) for instant response
    const minBytes = MIN_AUDIO_DURATION_SECONDS * 16000 * 2; // 16kHz * 2 bytes per sample
    const minBytesAfterPause = 0.5 * 16000 * 2; // 0.5 seconds after pause for instant resume
    
    const requiredBytes = ctx.wasSilent ? minBytesAfterPause : minBytes;
    
    if (totalAudioBytes < requiredBytes) {
      console.log(`⏭️ Skipping - only ${totalAudioBytes} bytes (need ${requiredBytes})`);
      // Put chunks back if not enough audio
      ctx.audioChunks = [...chunksToProcess, ...ctx.audioChunks];
      ctx.isProcessing = false;
      ctx.processingChunkCount = 0;
      return;
    }

    // Check if audio is COMPLETELY silent (very low threshold to avoid skipping quiet speech)
    const audioRMS = calculateBufferRMS(combinedAudio);
    
    // Only skip if RMS is EXTREMELY low (pure silence, not just quiet speech)
    if (audioRMS < MIN_AUDIO_RMS_THRESHOLD) {
      console.warn(`⏭️ Skipping - completely silent audio (RMS: ${audioRMS.toFixed(5)})`);
      // Clear silent chunks but keep processing
      ctx.lastTranscriptionTime = Date.now();
      ctx.isProcessing = false;
      ctx.processingChunkCount = 0;
      return;
    }
    
    console.log(`🔊 Audio RMS: ${audioRMS.toFixed(4)} - Processing...`);

    // Convert PCM audio to WAV format
    const audioBlob = createWavBlob(combinedAudio);
    console.log(`📦 WAV blob: ${audioBlob.length} bytes`);

    // Build OPTIMIZED context prompt for better accuracy
    let contextPrompt = "";
    
    // Strategy: Prioritize recent context (last 180 chars) for better accuracy
    // BUT: Make sure we don't feed hallucinated text back as context
    if (ctx.accumulatedTranscript && !detectHallucination(ctx.accumulatedTranscript.slice(-500))) {
      const recentContext = ctx.accumulatedTranscript.slice(-180);
      contextPrompt = recentContext;
    }
    
    // Add dictionary terms if space available
    if (ctx.prompt) {
      const spaceLeft = 224 - contextPrompt.length;
      if (spaceLeft > 30) {
        // Add separator and dictionary terms
        const separator = contextPrompt ? ". " : "";
        const availableForDict = spaceLeft - separator.length;
        const dictTerms = ctx.prompt.slice(0, availableForDict);
        contextPrompt = `${contextPrompt}${separator}${dictTerms}`;
      }
    }
    
    // Ensure we don't exceed Whisper's limit
    if (contextPrompt.length > 224) {
      contextPrompt = contextPrompt.slice(-224);
    }

    // Send to Whisper API with retry logic for long recordings
    console.log(`📡 Sending to Whisper API with context: "${contextPrompt.substring(0, 50)}..."`);
    
    let transcription: OpenAI.Audio.Transcriptions.Transcription | undefined;
    let retryCount = 0;
    const maxRetries = 2;
    
    while (retryCount <= maxRetries) {
      try {
        transcription = await openai.audio.transcriptions.create({
          file: new File([new Uint8Array(audioBlob)], 'audio.wav', { type: 'audio/wav' }),
          model: "whisper-1",
          language: ctx.language,
          prompt: contextPrompt,
          response_format: "json", // Faster than verbose_json
          temperature: 0.2, // Prevents hallucination loops while maintaining accuracy
        });
        break; // Success, exit retry loop
      } catch (error: any) {
        retryCount++;
        if (retryCount > maxRetries) {
          throw error; // Max retries reached
        }
        
        // Check if it's a rate limit error
        if (error?.status === 429 || error?.code === 'rate_limit_exceeded') {
          const waitTime = Math.pow(2, retryCount) * 1000; // Exponential backoff
          console.log(`⏳ Rate limit hit, waiting ${waitTime}ms before retry ${retryCount}/${maxRetries}`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
        } else {
          throw error; // Non-retryable error
        }
      }
    }

    if (!transcription) {
      console.error(`❌ Failed to get transcription after ${maxRetries} retries`);
      // Put chunks back if transcription failed
      ctx.audioChunks = [...chunksToProcess, ...ctx.audioChunks];
      return;
    }

    const newText = transcription.text?.trim() || "";
    
    // CRITICAL: Check for hallucination/looping
    if (newText && detectHallucination(newText)) {
      console.error(`🚨 HALLUCINATION DETECTED AND BLOCKED: "${newText.substring(0, 100)}..."`);
      // Don't add hallucinated text to transcript
      // Clear the audio chunks and move on
      ctx.lastTranscriptionTime = Date.now();
      return;
    }
    
    if (newText) {
      // Append to accumulated transcript with smart spacing
      if (ctx.accumulatedTranscript) {
        // Add space if previous text doesn't end with punctuation
        const needsSpace = !/[.!?,;:]$/.test(ctx.accumulatedTranscript.trim());
        ctx.accumulatedTranscript = needsSpace 
          ? `${ctx.accumulatedTranscript} ${newText}`
          : `${ctx.accumulatedTranscript} ${newText}`;
      } else {
        ctx.accumulatedTranscript = newText;
      }
      
      console.log(`✅ Transcribed: "${newText}" (total: ${ctx.accumulatedTranscript.length} chars)`);

      // INSTANT RESPONSE: Update in-memory immediately, DB in background
      // Don't await - fire and forget for maximum speed
      const dbUpdatePromise = prisma.transcription.update({
        where: { id: ctx.transcriptionId },
        data: {
          content: ctx.accumulatedTranscript,
          normalizedContent: ctx.accumulatedTranscript,
          updatedAt: new Date(),
        },
      }).then(() => {
        console.log(`💾 Background DB update complete: ${ctx.accumulatedTranscript.length} chars`);
        ctx.pendingDbUpdates.delete(dbUpdatePromise);
      }).catch((error) => {
        console.error(`⚠️ Background DB update failed:`, error);
        ctx.pendingDbUpdates.delete(dbUpdatePromise);
        // Don't throw - transcription continues in memory
      });
      
      ctx.pendingDbUpdates.add(dbUpdatePromise);
      console.log(`⚡ INSTANT: Transcript updated in memory, DB updating in background (${ctx.pendingDbUpdates.size} pending)`);
    } else {
      console.log(`⚠️ Whisper returned empty transcription`);
    }

    // Successfully processed - chunks are already cleared
    ctx.lastTranscriptionTime = Date.now();
    
  } catch (error) {
    console.error(`❌ Error processing accumulated audio for ${ctx.transcriptionId}:`, error);
    // Put chunks back on error to prevent data loss
    ctx.audioChunks = [...chunksToProcess, ...ctx.audioChunks];
    // Don't throw - we want to continue recording even if one transcription batch fails
  } finally {
    ctx.isProcessing = false;
    ctx.processingChunkCount = 0;
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
  
  // Wait for any pending background DB updates before finalizing
  if (ctx.pendingDbUpdates.size > 0) {
    console.log(`⏳ Waiting for ${ctx.pendingDbUpdates.size} background DB updates to complete...`);
    await Promise.allSettled(Array.from(ctx.pendingDbUpdates));
    console.log(`✅ All background updates completed`);
    ctx.pendingDbUpdates.clear();
  }
  
  const totalAudioBytes = ctx.audioChunks.reduce((sum, chunk) => sum + chunk.length, 0);
  console.log(`📊 Finalizing with ${ctx.audioChunks.length} unprocessed chunks (${totalAudioBytes} bytes total)`);

  // Process any remaining audio chunks that haven't been transcribed yet
  if (ctx.audioChunks.length > 0 && totalAudioBytes > 0) {
    console.log(`🎤 Processing final batch of audio chunks...`);
    await processAccumulatedAudio(ctx);
  }

  // Use the accumulated transcript (which includes all periodic transcriptions)
  const finalTranscript = ctx.accumulatedTranscript || "";
  console.log(`✅ Final transcript length: ${finalTranscript.length} characters`);

  // Save the final transcription to database
  const result = await prisma.transcription.update({
    where: { id: transcriptionId },
    data: {
      content: finalTranscript,
      normalizedContent: finalTranscript,
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


