"use client";

import { Play, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ToastProvider";
import apiClient from "@/lib/api-client";

type ScraperLog = {
  id: string;
  runAt: string;
  totalNew: number;
  totalUpdated: number;
  totalExpired: number;
  durationSeconds: number | null;
  status: string;
  errorLog?: string | null;
};

export function AdminScraperView() {
  const { pushToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [logs, setLogs] = useState<ScraperLog[]>([]);
  const [terminalLines, setTerminalLines] = useState<string[]>(["Ready."]);
  const [enabled, setEnabled] = useState(true);
  const [intervalHours, setIntervalHours] = useState("6");

  const load = async () => {
    setLoading(true);
    try {
      const [settingsResponse, logsResponse] = await Promise.all([
        apiClient.get<{ scraperEnabled: boolean; scraperIntervalHours: number }>("/admin/settings"),
        apiClient.get<{ logs: ScraperLog[] }>("/admin/scraper/logs")
      ]);

      setEnabled(settingsResponse.data.scraperEnabled);
      setIntervalHours(String(settingsResponse.data.scraperIntervalHours));
      setLogs(logsResponse.data.logs);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const saveConfig = async (nextEnabled: boolean, nextInterval: string) => {
    try {
      await apiClient.put("/admin/scraper/config", {
        scraperEnabled: nextEnabled,
        scraperIntervalHours: Number(nextInterval)
      });
      pushToast("Scraper config updated", "success");
    } catch {
      pushToast("Failed to update scraper config", "error");
    }
  };

  const runNow = async () => {
    setRunning(true);
    setTerminalLines([`[${new Date().toLocaleTimeString()}] Starting manual scraper run...`]);
    try {
      const response = await apiClient.post<{ summary: Record<string, number>; results: Array<Record<string, unknown>> }>("/admin/scraper/run", {});
      const summary = response.data.summary;
      const lines = [
        `[${new Date().toLocaleTimeString()}] Completed. total=${summary.total}, success=${summary.success}, failed=${summary.failed}`,
        `[${new Date().toLocaleTimeString()}] new=${summary.totalNew}, updated=${summary.totalUpdated}, expired=${summary.totalExpired}`
      ];
      setTerminalLines((current) => [...current, ...lines]);
      pushToast("Scraper run completed", "success");
      await load();
    } catch {
      setTerminalLines((current) => [...current, `[${new Date().toLocaleTimeString()}] ERROR: run failed.`]);
      pushToast("Scraper run failed", "error");
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle>Scraper Controls</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-5">
            <div className="flex items-center gap-2">
              <Switch
                checked={enabled}
                onCheckedChange={(value) => {
                  setEnabled(value);
                  void saveConfig(value, intervalHours);
                }}
              />
              <p className="text-sm">Enable scraper</p>
            </div>

            <div className="flex items-center gap-2">
              <p className="text-sm">Interval</p>
              <Select
                value={intervalHours}
                onChange={(event) => {
                  setIntervalHours(event.target.value);
                  void saveConfig(enabled, event.target.value);
                }}
                className="w-28"
              >
                <option value="1">1hr</option>
                <option value="3">3hr</option>
                <option value="6">6hr</option>
                <option value="12">12hr</option>
                <option value="24">24hr</option>
              </Select>
            </div>

            <Button onClick={() => void runNow()} disabled={running}>
              <Play className="mr-2 h-4 w-4" />
              {running ? "Running..." : "Run Now"}
            </Button>
            <Button variant="outline" onClick={() => void load()} disabled={loading}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-950 p-3 font-mono text-xs text-emerald-300 dark:border-slate-800">
            <div className="h-36 overflow-y-auto space-y-1">
              {terminalLines.map((line, index) => (
                <p key={`${line}-${index}`}>{line}</p>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Scraper Logs</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500">
                  <th className="px-2 py-2">Date</th>
                  <th className="px-2 py-2">Status</th>
                  <th className="px-2 py-2">New</th>
                  <th className="px-2 py-2">Updated</th>
                  <th className="px-2 py-2">Expired</th>
                  <th className="px-2 py-2">Duration</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id} className="border-t border-slate-200 dark:border-slate-800">
                    <td className="px-2 py-2">{new Date(log.runAt).toLocaleString()}</td>
                    <td className="px-2 py-2">{log.status}</td>
                    <td className="px-2 py-2">{log.totalNew}</td>
                    <td className="px-2 py-2">{log.totalUpdated}</td>
                    <td className="px-2 py-2">{log.totalExpired}</td>
                    <td className="px-2 py-2">{log.durationSeconds ?? 0}s</td>
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
