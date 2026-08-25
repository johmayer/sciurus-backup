import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import prisma from "@/lib/db";
import ValidateClient from "./ValidateClient";

export default async function ValidatePage() {
  const sources = await prisma.source.findMany();
  const remotes = await prisma.remote.findMany();

  // If there are no sources or remotes, no validation is needed.
  if (sources.length === 0 && remotes.length === 0) {
    // Wait, setting cookies in a server component requires Server Actions or Middleware.
    // In Next.js, you can't set cookies in a Server Component directly during render.
    // I should pass them to the client and let the client set the cookie via a server action.
  }

  return (
    <div className="flex h-screen w-full items-center justify-center px-4 bg-muted/40 overflow-y-auto py-10">
      <ValidateClient initialSources={sources} initialRemotes={remotes} />
    </div>
  );
}
