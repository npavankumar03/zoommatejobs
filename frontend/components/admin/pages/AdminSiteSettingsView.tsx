"use client";

import { AlertTriangle } from "lucide-react";
import { useEffect, useState } from "react";

import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ToastProvider";
import apiClient from "@/lib/api-client";

type SettingsPayload = {
  siteName: string;
  siteTagline: string;
  maintenanceMode: boolean;
  allowRegistration: boolean;
};

export function AdminSiteSettingsView() {
  const { pushToast } = useToast();
  const [settings, setSettings] = useState<SettingsPayload | null>(null);

  useEffect(() => {
    void (async () => {
      const response = await apiClient.get<SettingsPayload>("/admin/settings");
      setSettings({
        siteName: response.data.siteName,
        siteTagline: response.data.siteTagline ?? "",
        maintenanceMode: response.data.maintenanceMode,
        allowRegistration: response.data.allowRegistration
      });
    })();
  }, []);

  const update = async (patch: Partial<SettingsPayload>) => {
    if (!settings) return;

    const next = { ...settings, ...patch };
    setSettings(next);

    try {
      await apiClient.put("/admin/settings", patch);
      pushToast("Settings saved", "success");
    } catch {
      pushToast("Failed to save settings", "error");
      setSettings(settings);
    }
  };

  if (!settings) return <p className="text-sm text-slate-500">Loading settings...</p>;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Site Settings</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div>
          <Label htmlFor="siteName">Site Name</Label>
          <Input id="siteName" value={settings.siteName} onChange={(event) => void update({ siteName: event.target.value })} />
        </div>

        <div>
          <Label htmlFor="siteTagline">Site Tagline</Label>
          <Input id="siteTagline" value={settings.siteTagline} onChange={(event) => void update({ siteTagline: event.target.value })} />
        </div>

        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-300">
          <p className="mb-2 flex items-center gap-2 text-sm font-medium">
            <AlertTriangle className="h-4 w-4" />
            Maintenance warning
          </p>
          <p className="text-xs">This will block all non-admin users.</p>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Maintenance Mode</p>
            <p className="text-xs text-slate-500">Temporarily block non-admin access.</p>
          </div>
          <Switch checked={settings.maintenanceMode} onCheckedChange={(checked) => void update({ maintenanceMode: checked })} />
        </div>

        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Allow New Registrations</p>
            <p className="text-xs text-slate-500">Enable/disable new signups via Google login.</p>
          </div>
          <Switch checked={settings.allowRegistration} onCheckedChange={(checked) => void update({ allowRegistration: checked })} />
        </div>
      </CardContent>
    </Card>
  );
}
