"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";

import { useBRGym } from "@/components/brgym/provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

export default function BRGymSettingsPage() {
  const { data, hydrated, exportAllData, importAllData, resetAllData, updateSettings } = useBRGym();
  const [message, setMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  if (!hydrated) {
    return <div className="rounded-[28px] bg-white/5 p-5 text-sm text-slate-300">Loading settings…</div>;
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent>
        <h2 className="text-2xl font-semibold text-white">Settings</h2>
        <p className="mt-2 text-sm text-slate-300">
          Recommendations are based on logged performance and are not medical advice.
        </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
        <h3 className="text-lg font-semibold text-white">Rest timer</h3>
        <label className="mt-4 block rounded-2xl border border-white/10 bg-white/5 p-3">
          <span className="text-xs uppercase tracking-[0.18em] text-slate-400">Default seconds</span>
          <Input
            className="mt-2 border-none bg-transparent px-0 text-2xl font-semibold shadow-none focus:border-none"
            inputMode="numeric"
            onChange={(event) =>
              updateSettings({ defaultRestSeconds: Math.max(Number(event.target.value || "0"), 30) })
            }
            value={data.settings.defaultRestSeconds}
          />
        </label>
        <label className="mt-3 flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-4">
          <span className="text-sm text-slate-100">Mute timer sounds</span>
          <Switch
            checked={data.settings.timerSoundMuted}
            onChange={(event) => updateSettings({ timerSoundMuted: event.target.checked })}
          />
        </label>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
        <h3 className="text-lg font-semibold text-white">Backup and restore</h3>
        <div className="mt-4 space-y-3">
          <Button
            className="w-full"
            onClick={() => {
              const payload = exportAllData();
              const blob = new Blob([payload], { type: "application/json" });
              const url = URL.createObjectURL(blob);
              const anchor = document.createElement("a");
              anchor.href = url;
              anchor.download = `br-gym-export-${new Date().toISOString().slice(0, 10)}.json`;
              anchor.click();
              URL.revokeObjectURL(url);
              setMessage("Exported all BR Gym local data as JSON.");
              toast.success("Export complete");
            }}
            size="lg"
          >
            Export all data
          </Button>
          <Button
            className="w-full"
            onClick={() => fileInputRef.current?.click()}
            size="lg"
            variant="secondary"
          >
            Import data from JSON
          </Button>
          <input
            ref={fileInputRef}
            accept="application/json"
            className="hidden"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              if (!file) {
                return;
              }
              const text = await file.text();
              const result = importAllData(text);
              setMessage(result.message);
              if (result.ok) {
                toast.success(result.message);
              } else {
                toast.error(result.message);
              }
              event.target.value = "";
            }}
            type="file"
          />
          <Button
            className="w-full"
            onClick={() => {
              const confirmed = window.confirm("Reset all BR Gym local data? This cannot be undone.");
              if (!confirmed) {
                return;
              }
              resetAllData();
              setMessage("All BR Gym local data was reset.");
              toast.success("Local BR Gym data reset");
            }}
            size="lg"
            variant="destructive"
          >
            Reset all local data
          </Button>
        </div>
        {message ? <p className="mt-4 text-sm text-cyan-100">{message}</p> : null}
        </CardContent>
      </Card>
    </div>
  );
}
