"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Clipboard, ClipboardCheck, Loader2, Mic, Pause, RefreshCcw, Square } from "lucide-react";
import { toast } from "sonner";

import { AudioRecorder } from "@/lib/audio/recorder";
import { useDictationStore } from "@/lib/stores/dictation-store";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";

const POLL_INTERVAL_MS = 1200;

export function DictationWorkspace() {
  const {
    status,
    transcriptionId,
    transcript,
    audioLevel,
    setStatus,
    setTranscriptionId,
    setTranscript,
    setAudioLevel,
    setError,
  } = useDictationStore();

  const [loading, setLoading] = useState(false);
  const recorderRef = useRef<AudioRecorder | null>(null);
  const chunkQueue = useRef<Promise<void>>(Promise.resolve());
  const pollAbortController = useRef<AbortController | null>(null);
  const isStoppingRef = useRef(false);
  const [copied, setCopied] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  const handleCopyTranscript = useCallback(async () => {
    if (!transcript || transcript === "Your transcript will appear here.") {
      toast.info("No transcript available to copy yet.");
      return;
    }
    try {
      await navigator.clipboard.writeText(transcript);
      setCopied(true);
      toast.success("Transcript copied to clipboard.");
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error(error);
      toast.error("Copy failed. Try again.");
    }
  }, [transcript]);

  const stopRecording = useCallback(
    async (skipFinalize = false) => {
      if (!transcriptionId || isStoppingRef.current) {
        return;
      }

      isStoppingRef.current = true;
      setStatus("finishing");

      try {
        // Stop the recorder first to prevent new chunks
        await recorderRef.current?.stop();
        recorderRef.current = null;
        
        // Wait for any pending chunk uploads to complete
        await chunkQueue.current;

        if (!skipFinalize) {
          const res = await fetch(
            `/api/transcriptions/${transcriptionId}/complete`,
            { method: "POST" },
          );
          if (!res.ok) {
            throw new Error("Unable to finalize transcription");
          }
          
          // After finalization, fetch the final transcript
          const transcriptRes = await fetch(`/api/transcriptions/${transcriptionId}`);
          if (transcriptRes.ok) {
            const data = await transcriptRes.json();
            const content = data?.transcription?.content;
            if (typeof content === "string" && content.trim()) {
              setTranscript(content);
            }
          }
        }
      } catch (error) {
        console.error(error);
        setError("Failed to stop recording cleanly.");
      } finally {
        setStatus("idle");
        setTranscriptionId(null);
        setAudioLevel(0);
        pollAbortController.current?.abort();
        pollAbortController.current = null;
        isStoppingRef.current = false;
      }
    },
    [setAudioLevel, setError, setStatus, setTranscriptionId, setTranscript, transcriptionId],
  );

  const startRecording = useCallback(async () => {
    if (status !== "idle") {
      return;
    }

    try {
      setLoading(true);
      setTranscript("");
      setAudioLevel(0);
      setError(null);

      const response = await fetch("/api/transcriptions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      });

      if (!response.ok) {
        throw new Error("Failed to start transcription");
      }

      const data = await response.json();
      const id = data?.transcriptionId as string | undefined;
      if (!id) {
        throw new Error("Unable to obtain transcription session");
      }

      setTranscriptionId(id);
      setStatus("recording");

      const recorder = new AudioRecorder({
        onChunk: (base64, meta) => {
          setAudioLevel(meta.rms);
          
          // Don't upload chunks if we're in the process of stopping
          if (isStoppingRef.current) {
            return;
          }
          
          chunkQueue.current = chunkQueue.current
            .then(async () => {
              // Double-check we're not stopping before uploading
              if (isStoppingRef.current) {
                return;
              }
              
              const res = await fetch(`/api/transcriptions/${id}/chunks`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  data: base64,
                  durationMs: 250,
                }),
              });
              
              if (isStoppingRef.current) {
                return;
              }
              
              if (!res.ok) {
                throw new Error("Failed to upload audio chunk");
              }
            })
            .catch((error) => {
              if (isStoppingRef.current) {
                return;
              }
              console.error(error);
              setError("Failed to stream audio. Stopping recording.");
              void stopRecording(true);
            });
        },
        onLevel: (level) => {
          setAudioLevel(level);
        },
        onError: (error) => {
          console.error(error);
          setError("Microphone error encountered.");
          toast.error("Microphone error encountered.");
        },
      });

      recorderRef.current = recorder;
      await recorder.start();
      toast.success("Recording started");
    } catch (error) {
      console.error(error);
      setStatus("idle");
      setTranscriptionId(null);
      setAudioLevel(0);
      setTranscript("");
      toast.error("Unable to start recording. Check microphone permissions.");
    } finally {
      setLoading(false);
    }
  }, [
    setAudioLevel,
    setError,
    setStatus,
    setTranscriptionId,
    setTranscript,
    status,
    stopRecording,
  ]);

  const cancelRecording = useCallback(async () => {
    if (!transcriptionId) {
      return;
    }
    try {
      await recorderRef.current?.stop();
      recorderRef.current = null;
      await chunkQueue.current;
      await fetch(`/api/transcriptions/${transcriptionId}/cancel`, {
        method: "POST",
      });
      toast("Recording cancelled.");
    } finally {
      setStatus("idle");
      setTranscriptionId(null);
      setAudioLevel(0);
      pollAbortController.current?.abort();
      pollAbortController.current = null;
    }
  }, [setAudioLevel, setStatus, setTranscriptionId, transcriptionId]);

  useEffect(() => {
    if (!transcriptionId || status === "idle") {
      return;
    }

    const controller = new AbortController();
    pollAbortController.current = controller;

    const poll = async () => {
      if (controller.signal.aborted) {
        return;
      }
      try {
        const res = await fetch(`/api/transcriptions/${transcriptionId}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!res.ok) {
          throw new Error("Failed to poll transcription");
        }
        const data = await res.json();

        const content = data?.transcription?.content;
        if (typeof content === "string" && content.trim()) {
          setTranscript(content);
        }
        const statusRemote = data?.transcription?.status;
        if (statusRemote === "COMPLETED") {
          // Transcription completed via backend, clean up UI state but keep transcript
          toast.success("Transcription completed");
          
          // Stop polling
          controller.abort();
          pollAbortController.current = null;
          
          // Clean up recorder and reset state while preserving transcript
          if (recorderRef.current) {
            await recorderRef.current.stop();
            recorderRef.current = null;
          }
          
          setStatus("idle");
          setTranscriptionId(null);
          setAudioLevel(0);
          isStoppingRef.current = false;
          
          return;
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          console.error("Poll error:", error);
        }
      } finally {
        if (!controller.signal.aborted) {
          setTimeout(poll, POLL_INTERVAL_MS);
        }
      }
    };

    poll();
    return () => controller.abort();
  }, [setTranscript, status, stopRecording, transcriptionId]);

  const actionButton = useMemo(() => {
    if (loading) {
      return (
        <Button disabled className="w-full">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Preparing…
        </Button>
      );
    }

    if (status === "idle") {
      return (
        <Button
          onClick={() => {
            void startRecording();
          }}
          className="w-full"
          size="lg"
        >
          <Mic className="mr-2 h-4 w-4" />
          Start dictation
        </Button>
      );
    }

    if (status === "recording") {
      return (
        <div className="flex w-full gap-3">
          <Button
            variant="destructive"
            className="flex-1"
            onClick={() => {
              void stopRecording(false);
            }}
          >
            <Square className="mr-2 h-4 w-4" />
            Stop & process
          </Button>
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => {
              void cancelRecording();
            }}
          >
            <Pause className="mr-2 h-4 w-4" />
            Cancel
          </Button>
        </div>
      );
    }

    return (
      <Button disabled className="w-full">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Finalizing…
      </Button>
    );
  }, [cancelRecording, loading, startRecording, status, stopRecording]);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <Card className="flex flex-col">
        <CardHeader className="space-y-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-2xl font-semibold">
              Live transcription
            </CardTitle>
            <StatusBadge status={status} />
          </div>
          <CardDescription>
            Speak naturally. We’ll stream audio to Whisper, apply your dictionary,
            and mirror the transcript here in seconds.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-1 flex-col gap-4">
          <div
            className="relative"
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
          >
            <ScrollArea className="flex-1 rounded-lg border border-border/60 bg-background/60 p-4">
              <p className="whitespace-pre-wrap text-base leading-relaxed">
                {transcript || "Your transcript will appear here."}
              </p>
            </ScrollArea>
            {isHovered && transcript && transcript !== "Your transcript will appear here." && (
              <Button
                size="icon"
                variant="secondary"
                className="absolute top-2 right-2 h-8 w-8 shadow-md z-10"
                onClick={handleCopyTranscript}
                title="Copy transcript"
              >
                {copied ? (
                  <ClipboardCheck className="h-4 w-4 text-green-600" />
                ) : (
                  <Clipboard className="h-4 w-4" />
                )}
              </Button>
            )}
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Input level
            </p>
            <div className="mt-2 h-3 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${Math.min(1, Math.max(0.05, audioLevel)) * 100}%` }}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-4">
        <Card>
          <CardHeader className="space-y-1">
            <CardTitle>Controls</CardTitle>
            <CardDescription>
              One tap to capture. We handle chunking, buffering, and session state.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {actionButton}
            <Button
              variant="ghost"
              onClick={() => {
                setTranscript("");
                toast.info("Transcript cleared for the next run.");
              }}
              className="w-full"
              disabled={status !== "idle"}
            >
              <RefreshCcw className="mr-2 h-4 w-4" />
              Clear transcript
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Tips</CardTitle>
            <CardDescription>
              Add uncommon spellings in the dictionary for perfect recall. You can
              keep speaking — we merge slices with low latency.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: "idle" | "recording" | "finishing" }) {
  const mapping: Record<typeof status, { label: string; variant: "default" | "secondary" | "destructive" }> =
    {
      idle: { label: "Idle", variant: "secondary" },
      recording: { label: "Recording", variant: "default" },
      finishing: { label: "Finishing", variant: "default" },
    };

  const { label, variant } = mapping[status];
  return <Badge variant={variant}>{label}</Badge>;
}

