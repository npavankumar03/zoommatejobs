import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  await prisma.adminSettings.upsert({
    where: { id: "global" },
    update: {},
    create: {
      id: "global",
      activeAiProvider: "OPENAI",
      openaiModel: "gpt-4o",
      geminiModel: "gemini-1.5-pro",
      maxFreeAiFillsPerDay: 10,
      scraperEnabled: true,
      scraperIntervalHours: 6,
      allowRegistration: true,
      maintenanceMode: false,
      siteName: "zoommate"
    }
  });
}

main()
  .catch((error) => {
    console.error("Failed to seed AdminSettings:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
