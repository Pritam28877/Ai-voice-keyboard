"use client";

import { formatDistanceToNow } from "date-fns";
import { Clipboard, ClipboardCheck } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import type { Transcription } from "@prisma/client";

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

type HistoryItem = Pick<
  Transcription,
  | "id"
  | "title"
  | "content"
  | "status"
  | "createdAt"
  | "completedAt"
  | "durationMs"
  | "updatedAt"
>;

type Props = {
  items: HistoryItem[];
};

export function HistoryList({ items }: Props) {
  if (items.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No transcriptions yet</CardTitle>
          <CardDescription>
            Start a dictation session to see transcripts appear here.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="grid gap-4">
      {items.map((item) => (
        <HistoryCard key={item.id} item={item} />
      ))}
    </div>
  );
}

function HistoryCard({ item }: { item: HistoryItem }) {
  const [copied, setCopied] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  const handleCopy = async () => {
    if (!item.content) {
      toast.info("No transcript available to copy yet.");
      return;
    }
    try {
      await navigator.clipboard.writeText(item.content);
      setCopied(true);
      toast.success("Transcript copied to clipboard.");
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error(error);
      toast.error("Copy failed. Try again.");
    }
  };

  const createdAtDate =
    item.createdAt instanceof Date ? item.createdAt : new Date(item.createdAt);
  const createdAt = formatDistanceToNow(createdAtDate, { addSuffix: true });
  const duration =
    item.durationMs && item.durationMs > 0
      ? `${Math.round(item.durationMs / 1000)}s`
      : null;

  return (
    <Card className="border-border/60">
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div className="space-y-1.5">
          <CardTitle className="text-lg font-semibold">
            {item.title ?? "Untitled session"}
          </CardTitle>
          <CardDescription className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
            <span>Recorded {createdAt}</span>
            {duration ? (
              <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs">
                {duration}
              </span>
            ) : null}
          </CardDescription>
        </div>
        <Badge variant={statusVariant(item.status)}>{item.status}</Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="relative">
          <ScrollArea
            className="max-h-48 rounded-md border border-border/60 bg-background/50 p-4"
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
          >
            <p className="whitespace-pre-wrap text-sm leading-relaxed">
              {item.content ?? "Whisper is still processing this transcript."}
            </p>
          </ScrollArea>
          {isHovered && (
            <div
              className="absolute top-2 right-2 bg-background/80 backdrop-blur-sm rounded-md p-2 cursor-pointer hover:bg-background transition-colors border border-border/60"
              onClick={handleCopy}
              title="Copy transcript"
            >
              {copied ? (
                <ClipboardCheck className="h-4 w-4 text-green-600" />
              ) : (
                <Clipboard className="h-4 w-4" />
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function statusVariant(status: string): "default" | "secondary" | "destructive" {
  switch (status) {
    case "COMPLETED":
      return "default";
    case "FAILED":
    case "CANCELLED":
      return "destructive";
    default:
      return "secondary";
  }
}

