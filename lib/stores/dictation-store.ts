"use client";

import { create } from "zustand";

export type TranscriptionSummary = {
  id: string;
  title: string | null;
  content: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  durationMs: number | null;
};

type DictationStatus = "idle" | "recording" | "finishing";

type DictationState = {
  status: DictationStatus;
  transcriptionId: string | null;
  transcript: string;
  audioLevel: number;
  error: string | null;
  history: TranscriptionSummary[];
  setStatus: (status: DictationStatus) => void;
  setTranscriptionId: (id: string | null) => void;
  setTranscript: (text: string) => void;
  setAudioLevel: (level: number) => void;
  setError: (message: string | null) => void;
  setHistory: (records: TranscriptionSummary[]) => void;
};

export const useDictationStore = create<DictationState>((set) => ({
  status: "idle",
  transcriptionId: null,
  transcript: "",
  audioLevel: 0,
  error: null,
  history: [],
  setStatus: (status) => set({ status }),
  setTranscriptionId: (id) => set({ transcriptionId: id }),
  setTranscript: (transcript) => set({ transcript }),
  setAudioLevel: (audioLevel) => set({ audioLevel }),
  setError: (error) => set({ error }),
  setHistory: (history) => set({ history }),
}));

