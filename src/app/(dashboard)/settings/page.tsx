import { auth } from "@/auth";
import prisma from "@/lib/db";
import SettingsClient from "./SettingsClient";
import { redirect } from "next/navigation";

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  
  
  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  
  return <SettingsClient requiresPassword={!!user?.password} />;
}
