"use client";

import { FlaskConical } from "lucide-react";
import { useEffect, useState } from "react";

import { AiProviderToggle } from "@/components/AiProviderToggle";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ToastProvider";
import { apiRequest, useApiQuery } from "@/lib/api";

type AdminSettings = {
  activeAiProvider: "OPENAI" | "GEMINI";
  openaiApiKey?: string | null;
  openaiModel: string;
  geminiApiKey?: string | null;
  geminiModel: string;
  maxFreeAiFillsPerDay: number;
};

type TestPayload = {
  provider: string;
  model: string;
  response: string;
  latencyMs: number;
};

export function AdminAiSettingsView() {
  const { pushToast } = useToast();
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  const [openaiApiKey, setOpenaiApiKey] = useState("");
  const [openaiModel, setOpenaiModel] = useState("gpt-4o");
  const [geminiApiKey, setGeminiApiKey] = useState("");
  const [geminiModel, setGeminiModel] = useState("gemini-1.5-pro");
  const [provider, setProvider] = useState<"OPENAI" | "GEMINI">("OPENAI");
  const [dailyLimit, setDailyLimit] = useState("10");

  const [testResult, setTestResult] = useState<TestPayload | null>(null);
  const [showTestModal, setShowTestModal] = useState(false);

  const settingsQuery = useApiQuery(
    ["admin", "settings"],
    () => apiRequest<AdminSettings>({ url: "/admin/settings", method: "GET" }),
    {
      staleTime: 30_000,
      refetchInterval: 60_000,
    }
  );

  useEffect(() => {
    const data = settingsQuery.data;
    if (!data) return;
    setProvider(data.activeAiProvider);
    setOpenaiApiKey(data.openaiApiKey ?? "");
    setOpenaiModel(data.openaiModel);
    setGeminiApiKey(data.geminiApiKey ?? "");
    setGeminiModel(data.geminiModel);
    setDailyLimit(String(data.maxFreeAiFillsPerDay));
  }, [settingsQuery.data]);

  const switchProvider = async (nextProvider: "OPENAI" | "GEMINI") => {
    setProvider(nextProvider);
    try {
      await apiRequest({
        url: "/admin/switch-ai",
        method: "PUT",
        data: { provider: nextProvider },
      });
      void settingsQuery.refetch();
      pushToast(`Switched active provider to ${nextProvider}`, "success");
    } catch {
      pushToast("Failed to switch provider", "error");
    }
  };

  const saveSettings = async () => {
    setSaving(true);
    try {
      await apiRequest({
        url: "/admin/settings",
        method: "PUT",
        data: {
          activeAiProvider: provider,
          openaiApiKey: openaiApiKey.startsWith("***") ? undefined : openaiApiKey || undefined,
          openaiModel,
          geminiApiKey: geminiApiKey.startsWith("***") ? undefined : geminiApiKey || undefined,
          geminiModel,
          maxFreeAiFillsPerDay: Number(dailyLimit)
        },
      });
      pushToast("AI settings saved", "success");
      await settingsQuery.refetch();
    } catch {
      pushToast("Failed to save AI settings", "error");
    } finally {
      setSaving(false);
    }
  };

  const testCurrentAi = async () => {
    setTesting(true);
    try {
      const response = await apiRequest<TestPayload>({
        url: "/admin/settings/test-ai",
        method: "POST",
        data: {},
      });
      setTestResult(response);
      setShowTestModal(true);
    } catch {
      pushToast("AI test failed", "error");
    } finally {
      setTesting(false);
    }
  };

  if (settingsQuery.isLoading || !settingsQuery.data) {
    return <p className="text-sm text-slate-500">Loading AI settings...</p>;
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle>Active AI Provider</CardTitle>
        </CardHeader>
        <CardContent>
          <AiProviderToggle value={provider} onChange={(value) => void switchProvider(value)} />
        </CardContent>
      </Card>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>OpenAI</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label>API Key</Label>
              <Input value={openaiApiKey} onChange={(event) => setOpenaiApiKey(event.target.value)} placeholder="sk-..." />
            </div>
            <div>
              <Label>Model</Label>
              <Select value={openaiModel} onChange={(event) => setOpenaiModel(event.target.value)}>
                <option value="gpt-4o">gpt-4o</option>
                <option value="gpt-4-turbo">gpt-4-turbo</option>
                <option value="gpt-3.5-turbo">gpt-3.5-turbo</option>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Gemini</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label>API Key</Label>
              <Input value={geminiApiKey} onChange={(event) => setGeminiApiKey(event.target.value)} placeholder="AIza..." />
            </div>
            <div>
              <Label>Model</Label>
              <Select value={geminiModel} onChange={(event) => setGeminiModel(event.target.value)}>
                <option value="gemini-1.5-pro">gemini-1.5-pro</option>
                <option value="gemini-1.5-flash">gemini-1.5-flash</option>
                <option value="gemini-1.0-pro">gemini-1.0-pro</option>
              </Select>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Limits & Validation</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="max-w-xs">
            <Label>Daily AI fills limit per user</Label>
            <Input type="number" min={1} value={dailyLimit} onChange={(event) => setDailyLimit(event.target.value)} />
          </div>

          <div className="flex flex-wrap gap-3">
            <Button onClick={() => void testCurrentAi()} variant="outline" disabled={testing}>
              <FlaskConical className="mr-2 h-4 w-4" />
              {testing ? "Testing..." : "Test Current AI"}
            </Button>
            <Button onClick={() => void saveSettings()} disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Dialog open={showTestModal} onOpenChange={setShowTestModal} title="AI Test Result">
        {testResult ? (
          <div className="space-y-2 text-sm">
            <p>
              <strong>Provider:</strong> {testResult.provider}
            </p>
            <p>
              <strong>Model:</strong> {testResult.model}
            </p>
            <p>
              <strong>Latency:</strong> {testResult.latencyMs}ms
            </p>
            <p className="rounded-md bg-slate-100 p-3 dark:bg-slate-800">
              <strong>Response:</strong> {testResult.response}
            </p>
          </div>
        ) : null}
      </Dialog>
    </div>
  );
}
