import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const settings = await prisma.adminSettings.findUnique({
    where: { id: "global" },
    select: {
      maintenanceMode: true,
      allowRegistration: true,
      siteName: true,
      siteTagline: true,
      activeAiProvider: true,
      openaiModel: true,
      geminiModel: true,
      maxFreeAiFillsPerDay: true
    }
  });

  const provider = settings?.activeAiProvider ?? "OPENAI";
  const providerName =
    provider === "GEMINI"
      ? settings?.geminiModel ?? "gemini-1.5-pro"
      : settings?.openaiModel ?? "gpt-4o";

  return NextResponse.json({
    maintenanceMode: settings?.maintenanceMode ?? false,
    allowRegistration: settings?.allowRegistration ?? true,
    siteName: settings?.siteName ?? "zoommate",
    siteTagline: settings?.siteTagline ?? "Your AI-powered job application copilot",
    activeAiProvider: provider,
    activeAiProviderName: providerName,
    maxFreeAiFillsPerDay: settings?.maxFreeAiFillsPerDay ?? 10
  });
}
