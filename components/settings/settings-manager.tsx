"use client";

import { useTransition } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import type { UserSetting } from "@prisma/client";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { settingsSchema, type SettingsInput } from "@/lib/settings/schema";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

type SettingsManagerProps = {
  initialSettings: UserSetting;
};

export function SettingsManager({ initialSettings }: SettingsManagerProps) {
  const [isPending, startTransition] = useTransition();
  const {
    register,
    handleSubmit,
    setValue,
    formState: { isDirty },
    watch,
  } = useForm<SettingsInput>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      defaultLanguage: initialSettings.defaultLanguage ?? "en-US",
      autoPunctuation: initialSettings.autoPunctuation ?? true,
      smartFormatting: initialSettings.smartFormatting ?? true,
      removeFillerWords: initialSettings.removeFillerWords ?? false,
      enableAgentSuggestions: initialSettings.enableAgentSuggestions ?? true,
      maxSegmentDurationMs: initialSettings.maxSegmentDurationMs ?? 7000,
    },
  });

  const onSubmit = handleSubmit((values) => {
    startTransition(async () => {
      try {
        const res = await fetch("/api/settings", {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(values),
        });
        if (!res.ok) {
          throw new Error("Failed to update settings");
        }
        toast.success("Settings saved.");
      } catch (error) {
        console.error(error);
        toast.error("Unable to update settings.");
      }
    });
  });

  const handleReset = () => {
    setValue("defaultLanguage", "en-US", { shouldDirty: true });
    setValue("autoPunctuation", true, { shouldDirty: true });
    setValue("smartFormatting", true, { shouldDirty: true });
    setValue("removeFillerWords", false, { shouldDirty: true });
    setValue("enableAgentSuggestions", true, { shouldDirty: true });
    setValue("maxSegmentDurationMs", 7000, { shouldDirty: true });
  };

  return (
    <Card>
      <CardHeader className="space-y-2">
        <CardTitle>Realtime transcription preferences</CardTitle>
        <CardDescription>
          These defaults feed the Whisper transcription for every dictation. Tweak
          them to match your workflows.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="grid gap-6" onSubmit={onSubmit}>
          <div className="grid gap-4 md:grid-cols-2">
            <fieldset className="space-y-2">
              <Label htmlFor="defaultLanguage">Default language (BCP-47)</Label>
              <Input
                id="defaultLanguage"
                placeholder="en-US"
                {...register("defaultLanguage")}
                disabled={isPending}
              />
            </fieldset>
            <fieldset className="space-y-2">
              <Label htmlFor="maxSegmentDurationMs">
                Slice duration (milliseconds)
              </Label>
              <Input
                id="maxSegmentDurationMs"
                type="number"
                min={1000}
                max={20000}
                step={500}
                {...register("maxSegmentDurationMs", { valueAsNumber: true })}
                disabled={isPending}
              />
              <p className="text-xs text-muted-foreground">
                We buffer audio slices before sending them upstream. Lower values
                reduce latency but increase API chatter.
              </p>
            </fieldset>
          </div>

          <div className="grid gap-3">
            <ToggleRow
              label="Auto punctuation"
              description="Automatically apply commas, periods, and question marks."
              checked={watch("autoPunctuation")}
              onCheckedChange={(value) =>
                setValue("autoPunctuation", value, { shouldDirty: true })
              }
              disabled={isPending}
            />
            <ToggleRow
              label="Smart formatting"
              description="Format bullet lists, capitalize sentences, and tidy whitespace."
              checked={watch("smartFormatting")}
              onCheckedChange={(value) =>
                setValue("smartFormatting", value, { shouldDirty: true })
              }
              disabled={isPending}
            />
            <ToggleRow
              label="Remove filler words"
              description='Strip out “um”, “uh”, and similar disfluencies from the transcript.'
              checked={watch("removeFillerWords")}
              onCheckedChange={(value) =>
                setValue("removeFillerWords", value, { shouldDirty: true })
              }
              disabled={isPending}
            />
            <ToggleRow
              label="Agent suggestions"
              description="Let the assistant propose actions like follow-up summaries."
              checked={watch("enableAgentSuggestions")}
              onCheckedChange={(value) =>
                setValue("enableAgentSuggestions", value, { shouldDirty: true })
              }
              disabled={isPending}
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={isPending || !isDirty}>
              Save preferences
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={handleReset}
              disabled={isPending}
            >
              Reset defaults
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

type ToggleRowProps = {
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
};

function ToggleRow({
  label,
  description,
  checked,
  onCheckedChange,
  disabled,
}: ToggleRowProps) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border border-border/60 bg-background/60 p-4">
      <div className="space-y-1">
        <p className="font-medium">{label}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <Switch
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        aria-label={label}
      />
    </div>
  );
}

