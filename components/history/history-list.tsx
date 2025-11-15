"use client";

import { formatDistanceToNow } from "date-fns";
import { Clipboard, ClipboardCheck, Pencil, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
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
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  const [searchQuery, setSearchQuery] = useState("");
  const [localItems, setLocalItems] = useState(items);

  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) {
      return localItems;
    }

    const query = searchQuery.toLowerCase();
    
    // Create scored results for better relevance
    const scoredItems = localItems
      .map((item) => {
        const title = (item.title || "Untitled session").toLowerCase();
        const content = (item.content || "").toLowerCase();
        
        let score = 0;
        
        // Exact title match (highest priority)
        if (title === query) {
          score = 100;
        }
        // Title starts with query
        else if (title.startsWith(query)) {
          score = 80;
        }
        // Title contains query
        else if (title.includes(query)) {
          score = 60;
        }
        // Content contains query (lower priority)
        else if (content.includes(query)) {
          // Only include if query is substantial (3+ chars) to avoid too many results
          if (query.length >= 3) {
            score = 20;
          }
        }
        
        return { item, score };
      })
      .filter((result) => result.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((result) => result.item);
    
    return scoredItems;
  }, [localItems, searchQuery]);

  const handleUpdateTitle = (id: string, newTitle: string) => {
    setLocalItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, title: newTitle } : item))
    );
  };

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
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="text"
          placeholder="Search transcriptions by title or content..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9 pr-9"
        />
        {searchQuery && (
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2"
            onClick={() => setSearchQuery("")}
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {filteredItems.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No results found</CardTitle>
            <CardDescription>
              Try adjusting your search query or clear the search to see all transcriptions.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="grid gap-4">
          {filteredItems.map((item) => (
            <HistoryCard key={item.id} item={item} onUpdateTitle={handleUpdateTitle} />
          ))}
        </div>
      )}
    </div>
  );
}

function HistoryCard({ item, onUpdateTitle }: { item: HistoryItem; onUpdateTitle: (id: string, title: string) => void }) {
  const [copied, setCopied] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editTitle, setEditTitle] = useState(item.title || "");
  const [isUpdating, setIsUpdating] = useState(false);

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

  const handleSaveTitle = async () => {
    if (!editTitle.trim()) {
      toast.error("Title cannot be empty");
      return;
    }

    setIsUpdating(true);
    try {
      const response = await fetch(`/api/transcriptions/${item.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ title: editTitle.trim() }),
      });

      if (!response.ok) {
        throw new Error("Failed to update title");
      }

      onUpdateTitle(item.id, editTitle.trim());
      setIsEditDialogOpen(false);
      toast.success("Title updated successfully");
    } catch (error) {
      console.error(error);
      toast.error("Failed to update title. Please try again.");
    } finally {
      setIsUpdating(false);
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
    <>
      <Card className="border-border/60">
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div className="flex-1 space-y-1.5">
            <div className="flex items-center gap-2">
              <CardTitle className="text-lg font-semibold">
                {item.title ?? "Untitled session"}
              </CardTitle>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => {
                  setEditTitle(item.title || "");
                  setIsEditDialogOpen(true);
                }}
                title="Edit title"
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
            </div>
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
          <div
            className="relative"
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
          >
            <ScrollArea className="max-h-48 rounded-md border border-border/60 bg-background/50 p-4">
              <p className="whitespace-pre-wrap text-sm leading-relaxed">
                {item.content ?? "Whisper is still processing this transcript."}
              </p>
            </ScrollArea>
            {isHovered && (
              <Button
                size="icon"
                variant="secondary"
                className="absolute top-2 right-2 h-8 w-8 shadow-md z-10"
                onClick={handleCopy}
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
        </CardContent>
      </Card>

      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Title</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                placeholder="Enter a title for this transcription"
                disabled={isUpdating}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !isUpdating) {
                    handleSaveTitle();
                  }
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsEditDialogOpen(false)}
              disabled={isUpdating}
            >
              Cancel
            </Button>
            <Button onClick={handleSaveTitle} disabled={isUpdating}>
              {isUpdating ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
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

