"use client";

import { int16ToBase64 } from "@/lib/audio/encoding";

type RecorderState = "idle" | "loading" | "recording";

type RecorderHandlers = {
  onChunk: (base64: string, meta: { rms: number }) => void;
  onLevel?: (level: number) => void;
  onStateChange?: (state: RecorderState) => void;
  onError?: (error: unknown) => void;
};

const WORKLET_URL = "/workers/audio-recorder.worklet.js";

export class AudioRecorder {
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private worklet: AudioWorkletNode | null = null;
  private gainNode: GainNode | null = null;
  private state: RecorderState = "idle";
  private readonly handlers: RecorderHandlers;

  constructor(handlers: RecorderHandlers) {
    this.handlers = handlers;
  }

  async start() {
    if (this.state !== "idle") {
      return;
    }

    try {
      this.setState("loading");
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: false, // Disable to preserve more audio detail
          autoGainControl: true, // Enable automatic gain adjustment
          sampleRate: 16000,
        },
      });
      this.mediaStream = stream;

      const context = new AudioContext({
        sampleRate: 16000,
      });
      this.audioContext = context;

      await context.audioWorklet.addModule(WORKLET_URL);

      const worklet = new AudioWorkletNode(context, "audio-recorder-worklet", {
        channelCount: 1,
        numberOfOutputs: 0,
      });
      this.worklet = worklet;

      // Create a gain node to boost the microphone volume
      const gainNode = context.createGain();
      gainNode.gain.value = 2.5; // Increase volume by 2.5x (adjust as needed: 1.5-3.0)
      this.gainNode = gainNode;

      const source = context.createMediaStreamSource(stream);
      
      // Connect: source -> gain -> worklet (amplifies the signal)
      source.connect(gainNode);
      gainNode.connect(worklet);

      worklet.port.onmessage = (event) => {
        const { type, payload } = event.data ?? {};
        if (type === "chunk" && payload) {
          const buffer = new Int16Array(payload);
          if (buffer.length === 0) {
            return;
          }
          const base64 = int16ToBase64(buffer);
          const rms = Math.max(0, Math.min(1, calculateRms(buffer)));
          this.handlers.onChunk(base64, { rms });
          this.handlers.onLevel?.(rms);
        } else if (type === "level" && typeof payload === "number") {
          const clamped = Math.max(0, Math.min(1, payload));
          this.handlers.onLevel?.(clamped);
        }
      };

      this.setState("recording");
    } catch (error) {
      this.handlers.onError?.(error);
      await this.stop();
      throw error;
    }
  }

  async stop() {
    if (this.state === "idle") {
      return;
    }

    try {
      this.worklet?.port.postMessage({ type: "flush" });
      this.worklet?.disconnect();
      this.worklet = null;
    } catch {
      // ignore
    }

    try {
      this.gainNode?.disconnect();
      this.gainNode = null;
    } catch {
      // ignore
    }

    this.mediaStream?.getTracks().forEach((track) => {
      track.stop();
    });
    this.mediaStream = null;

    if (this.audioContext) {
      await this.audioContext.close().catch(() => undefined);
      this.audioContext = null;
    }

    this.setState("idle");
  }

  private setState(next: RecorderState) {
    this.state = next;
    this.handlers.onStateChange?.(next);
  }
}

function calculateRms(samples: Int16Array) {
  let sum = 0;
  for (let i = 0; i < samples.length; i++) {
    const value = samples[i] / 32768;
    sum += value * value;
  }
  return Math.sqrt(sum / samples.length);
}

