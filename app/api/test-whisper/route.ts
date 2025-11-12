import { NextRequest } from "next/server";
import OpenAI from "openai";
import { toFile } from "openai/uploads";

import { serverEnv } from "@/lib/env";
import { jsonResponse, handleApiError } from "@/lib/api/response";
import { requireUser } from "@/lib/auth/session";

const openai = new OpenAI({
  apiKey: serverEnv.OPENAI_API_KEY,
});

export async function GET(_request: NextRequest) {
  try {
    await requireUser();

    // Create a simple WAV file with silence to test Whisper
    const sampleRate = 16000;
    const duration = 1; // 1 second
    const numSamples = sampleRate * duration;
    const bufferSize = 44 + numSamples * 2; // WAV header + 16-bit samples

    const buffer = Buffer.alloc(bufferSize);

    // WAV header for 16-bit mono PCM at 16kHz
    buffer.write('RIFF', 0);
    buffer.writeUInt32LE(bufferSize - 8, 4);
    buffer.write('WAVE', 8);
    buffer.write('fmt ', 12);
    buffer.writeUInt32LE(16, 16); // Subchunk1Size
    buffer.writeUInt16LE(1, 20); // AudioFormat (PCM)
    buffer.writeUInt16LE(1, 22); // NumChannels
    buffer.writeUInt32LE(sampleRate, 24); // SampleRate
    buffer.writeUInt32LE(sampleRate * 2, 28); // ByteRate
    buffer.writeUInt16LE(2, 32); // BlockAlign
    buffer.writeUInt16LE(16, 34); // BitsPerSample
    buffer.write('data', 36);
    buffer.writeUInt32LE(numSamples * 2, 40); // Subchunk2Size

    // Fill with silence (all zeros)
    // The data is already zeroed by Buffer.alloc

    try {
      const transcription = await openai.audio.transcriptions.create({
        file: await toFile(buffer, 'silence.wav'),
        model: "whisper-1",
        language: "en",
        response_format: "json",
      });

      return jsonResponse({
        success: true,
        transcription: transcription.text,
        message: "Whisper API is working"
      });
    } catch (whisperError) {
      return jsonResponse({
        success: false,
        error: whisperError instanceof Error ? whisperError.message : 'Unknown error',
        message: "Whisper API failed"
      }, { status: 500 });
    }
  } catch (error) {
    return handleApiError(error);
  }
}
