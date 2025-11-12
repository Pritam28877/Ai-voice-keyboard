"use client";

import { useMemo, useState, useTransition } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import type { DictionaryEntry } from "@prisma/client";
import { useForm } from "react-hook-form";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

import {
  dictionaryEntrySchema,
  type DictionaryEntryInput,
} from "@/lib/dictionary/schema";

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
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const createSchema = dictionaryEntrySchema.extend({
  phrase: dictionaryEntrySchema.shape.phrase,
});

type CreateEntryFormValues = z.infer<typeof createSchema>;

type DictionaryManagerProps = {
  initialEntries: DictionaryEntry[];
};

export function DictionaryManager({ initialEntries }: DictionaryManagerProps) {
  const [entries, setEntries] = useState(
    initialEntries.map((entry) => ({
      ...entry,
      createdAt:
        entry.createdAt instanceof Date
          ? entry.createdAt
          : new Date(entry.createdAt),
      updatedAt:
        entry.updatedAt instanceof Date
          ? entry.updatedAt
          : new Date(entry.updatedAt),
    })),
  );
  const [isPending, startTransition] = useTransition();

  const prioritySortedEntries = useMemo(
    () =>
      [...entries].sort((a, b) => {
        if (b.priority !== a.priority) return b.priority - a.priority;
        return b.createdAt.getTime() - a.createdAt.getTime();
      }),
    [entries],
  );

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreateEntryFormValues>({
    resolver: zodResolver(createSchema),
    defaultValues: {
      phrase: "",
      canonical: "",
      substitution: "",
      priority: 0,
      notes: "",
    },
  });

  const onCreate = handleSubmit((values) => {
    startTransition(async () => {
      try {
        const payload: DictionaryEntryInput = {
          phrase: values.phrase,
          canonical: values.canonical || undefined,
          substitution: values.substitution || undefined,
          notes: values.notes || undefined,
          priority: Number(values.priority) || 0,
        };

        const res = await fetch("/api/dictionary", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          throw new Error("Failed to create dictionary entry");
        }

        const data = await res.json();
        const entry: DictionaryEntry = {
          ...data.entry,
          createdAt: new Date(data.entry.createdAt),
          updatedAt: new Date(data.entry.updatedAt),
        };

        setEntries((prev) => [entry, ...prev]);
        reset();
        toast.success("Dictionary entry added.");
      } catch (error) {
        console.error(error);
        toast.error("Failed to save dictionary entry.");
      }
    });
  });

  const handleDelete = (id: string) => {
    startTransition(async () => {
      try {
        const res = await fetch(`/api/dictionary/${id}`, {
          method: "DELETE",
        });
        if (!res.ok) {
          throw new Error("Failed to delete dictionary entry");
        }
        setEntries((prev) => prev.filter((entry) => entry.id !== id));
        toast.success("Entry removed.");
      } catch (error) {
        console.error(error);
        toast.error("Unable to delete entry.");
      }
    });
  };

  const handleUpdate = (entry: DictionaryEntry, updates: Partial<DictionaryEntryInput>) => {
    startTransition(async () => {
      try {
        const res = await fetch(`/api/dictionary/${entry.id}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(updates),
        });
        if (!res.ok) {
          throw new Error("Failed to update dictionary entry");
        }
        const data = await res.json();
        const updated: DictionaryEntry = {
          ...data.entry,
          createdAt: new Date(data.entry.createdAt),
          updatedAt: new Date(data.entry.updatedAt),
        };
        setEntries((prev) =>
          prev.map((item) => (item.id === entry.id ? updated : item)),
        );
        toast.success("Entry updated.");
      } catch (error) {
        console.error(error);
        toast.error("Unable to update entry.");
      }
    });
  };

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Add vocabulary</CardTitle>
          <CardDescription>
            Prioritize exact spellings and phrases so the model never guesses.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={onCreate}
            className="grid gap-4 md:grid-cols-[1.5fr_1fr_1fr_0.5fr] md:items-end"
          >
            <fieldset className="space-y-2">
              <Label htmlFor="phrase">Phrase</Label>
              <Input
                id="phrase"
                placeholder="e.g. KaiOS"
                {...register("phrase")}
                disabled={isPending}
              />
              {errors.phrase ? (
                <p className="text-xs text-destructive">{errors.phrase.message}</p>
              ) : null}
            </fieldset>
            <fieldset className="space-y-2">
              <Label htmlFor="canonical">Canonical</Label>
              <Input
                id="canonical"
                placeholder="Exact output"
                {...register("canonical")}
                disabled={isPending}
              />
            </fieldset>
            <fieldset className="space-y-2">
              <Label htmlFor="substitution">Preferred substitution</Label>
              <Input
                id="substitution"
                placeholder="Optional fallback"
                {...register("substitution")}
                disabled={isPending}
              />
            </fieldset>
            <fieldset className="space-y-2">
              <Label htmlFor="priority">Priority</Label>
              <Input
                id="priority"
                type="number"
                min={0}
                max={100}
                {...register("priority", { valueAsNumber: true })}
                disabled={isPending}
              />
            </fieldset>
            <fieldset className="md:col-span-4">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                placeholder="Usage notes or phonetic hints"
                {...register("notes")}
                disabled={isPending}
                className="resize-none"
              />
            </fieldset>
            <div className="md:col-span-4 flex justify-end">
              <Button type="submit" disabled={isPending}>
                Add entry
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Active dictionary</CardTitle>
          <CardDescription>
            Higher priority entries win when there’s a conflict. Edits apply to new
            dictations immediately.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-b border-border/60 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="py-2 pr-4 font-medium">Phrase</th>
                  <th className="py-2 pr-4 font-medium">Canonical</th>
                  <th className="py-2 pr-4 font-medium">Substitution</th>
                  <th className="py-2 pr-4 font-medium">Notes</th>
                  <th className="py-2 pr-4 font-medium">Priority</th>
                  <th className="py-2 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {prioritySortedEntries.map((entry) => (
                  <tr key={entry.id} className="align-top">
                    <td className="py-3 pr-4 font-medium text-foreground">
                      {entry.phrase}
                    </td>
                    <td className="py-3 pr-4">
                      {entry.canonical ? (
                        entry.canonical
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="py-3 pr-4">
                      {entry.substitution ? (
                        entry.substitution
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="py-3 pr-4 text-muted-foreground">
                      {entry.notes ?? "—"}
                    </td>
                    <td className="py-3 pr-4">
                      <Badge variant="secondary">{entry.priority}</Badge>
                    </td>
                    <td className="py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <DictionaryEditDialog
                          entry={entry}
                          onSave={(updates) => handleUpdate(entry, updates)}
                          disabled={isPending}
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(entry.id)}
                          disabled={isPending}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                          <span className="sr-only">Delete</span>
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

type DictionaryEditDialogProps = {
  entry: DictionaryEntry;
  onSave: (updates: Partial<DictionaryEntryInput>) => void;
  disabled?: boolean;
};

function DictionaryEditDialog({ entry, onSave, disabled }: DictionaryEditDialogProps) {
  const [open, setOpen] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<Partial<DictionaryEntryInput>>({
    defaultValues: {
      phrase: entry.phrase,
      canonical: entry.canonical ?? "",
      substitution: entry.substitution ?? "",
      notes: entry.notes ?? "",
      priority: entry.priority,
    },
  });

  const submit = handleSubmit(async (values) => {
    await onSave({
      phrase: values.phrase,
      canonical: values.canonical,
      substitution: values.substitution,
      notes: values.notes,
      priority:
        typeof values.priority === "number"
          ? values.priority
          : parseInt(String(values.priority ?? entry.priority), 10) || entry.priority,
    });
    setOpen(false);
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" disabled={disabled}>
          Edit
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit dictionary entry</DialogTitle>
        </DialogHeader>
        <form className="space-y-4" onSubmit={submit}>
          <fieldset className="space-y-2">
            <Label htmlFor={`phrase-${entry.id}`}>Phrase</Label>
            <Input
              id={`phrase-${entry.id}`}
              {...register("phrase")}
              disabled={isSubmitting}
            />
          </fieldset>
          <fieldset className="space-y-2">
            <Label htmlFor={`canonical-${entry.id}`}>Canonical</Label>
            <Input
              id={`canonical-${entry.id}`}
              {...register("canonical")}
              disabled={isSubmitting}
            />
          </fieldset>
          <fieldset className="space-y-2">
            <Label htmlFor={`substitution-${entry.id}`}>Substitution</Label>
            <Input
              id={`substitution-${entry.id}`}
              {...register("substitution")}
              disabled={isSubmitting}
            />
          </fieldset>
          <fieldset className="space-y-2">
            <Label htmlFor={`priority-${entry.id}`}>Priority</Label>
            <Input
              id={`priority-${entry.id}`}
              type="number"
              min={0}
              max={100}
              {...register("priority", { valueAsNumber: true })}
              disabled={isSubmitting}
            />
          </fieldset>
          <fieldset className="space-y-2">
            <Label htmlFor={`notes-${entry.id}`}>Notes</Label>
            <Textarea
              id={`notes-${entry.id}`}
              {...register("notes")}
              disabled={isSubmitting}
              className="resize-none"
            />
          </fieldset>
          <DialogFooter>
            <Button type="submit" disabled={isSubmitting}>
              Save changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

