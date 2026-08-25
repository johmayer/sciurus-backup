export const dynamic = "force-dynamic";
import { redirect } from "next/navigation";
import prisma from "@/lib/db";
import { signIn } from "@/auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default async function LoginPage() {
  
  const disableLocal = process.env.DISABLE_LOCAL_AUTH === "true";
  const hasOidc = !!(process.env.OIDC_CLIENT_ID || process.env.AUTHENTIK_CLIENT_ID);

  const adminCount = await prisma.user.count({ where: { password: { not: null } } });
  if (adminCount === 0) {
    redirect("/setup");
  }

  return (
    <div className="flex h-screen w-full items-center justify-center px-4 bg-muted/40">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-sm">
            <img src="/logo.png" width={48} height={48} alt="Sciurus" className="rounded-sm" />
          </div>
          <CardTitle className="text-2xl">Sciurus</CardTitle>
          <CardDescription>Sign in to access your backup dashboard.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {!disableLocal && (
            <form
              action={async (formData) => {
                "use server"
                await signIn("credentials", {
                  username: formData.get("username"),
                  password: formData.get("password"),
                  redirectTo: "/"
                })
              }}
              className="grid gap-4"
            >
              <div className="grid gap-2">
                <Label htmlFor="username">Username</Label>
                <Input id="username" name="username" type="text" required />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="password">Password</Label>
                <Input id="password" name="password" type="password" required />
              </div>
              <Button type="submit" className="w-full">
                Login
              </Button>
            </form>
          )}

          {hasOidc && (
            <form
              action={async () => {
                "use server"
                await signIn("oidc", { redirectTo: "/" })
              }}
            >
              {!disableLocal && (
                <div className="relative my-4">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-background px-2 text-muted-foreground">
                      Or continue with
                    </span>
                  </div>
                </div>
              )}
              <Button variant="outline" type="submit" className="w-full">
                {process.env.OIDC_NAME || "Single Sign-On (OIDC)"}
              </Button>
            </form>
          )}
          
          {disableLocal && !hasOidc && (
            <div className="text-center text-sm text-destructive mt-4 font-medium">
              Authentication misconfigured: Local login is disabled but OIDC variables are missing in .env.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
