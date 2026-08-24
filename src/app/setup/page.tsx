"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { setupAdmin } from "@/app/actions";

export default function SetupPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!username || !password) {
      setError("Please fill out both fields.");
      return;
    }
    setLoading(true);
    try {
      await setupAdmin(username, password);
      router.push("/login?setup=success");
    } catch (err: any) {
      setError(err.message || "Failed to setup local admin.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-screen w-full items-center justify-center bg-muted/40 px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-sm">
            <img src="/logo.png" width={48} height={48} alt="Sciurus" className="rounded-sm" />
          </div>
          <CardTitle className="text-2xl">Welcome to Sciurus</CardTitle>
          <CardDescription>
            It looks like this is your first time starting up, or no local admin exists. Let's create your master admin account.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSetup} className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="username">Master Username</Label>
              <Input 
                id="username" 
                type="text" 
                value={username} 
                onChange={(e) => setUsername(e.target.value)} 
                required 
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="password">Master Password</Label>
              <Input 
                id="password" 
                type="password" 
                value={password} 
                onChange={(e) => setPassword(e.target.value)} 
                required 
              />
            </div>
            {error && <div className="text-sm text-destructive font-medium text-center">{error}</div>}
            <Button type="submit" className="w-full mt-2" disabled={loading}>
              {loading ? "Securing Vault..." : "Create Account"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
