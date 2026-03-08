import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function getServerSession() {
  return auth();
}

export async function getCurrentUser() {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) return null;

  return prisma.user.findUnique({
    where: { id: userId }
  });
}

export async function isAdmin() {
  const session = await auth();
  return Boolean(session?.user?.isAdmin);
}
