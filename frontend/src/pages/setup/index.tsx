import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { setupAdmin } from "@/api";

export default function SetupPage() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const handleSetup = async (e: any) => {
    e.preventDefault();
    setError("");
    try {
      await setupAdmin(username, password);
      navigate("/login");
    } catch (err) {
      setError("Failed to create admin user. Make sure it doesn't already exist.");
    }
  };

  return (
    <div className="flex h-screen w-full items-center justify-center px-4 bg-muted/40">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Initial Setup</CardTitle>
          <CardDescription>Create the first administrator account.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSetup} className="grid gap-4">
            {error && <div className="text-sm text-destructive">{error}</div>}
            <div className="grid gap-2">
              <Label htmlFor="username">Admin Username</Label>
              <Input id="username" type="text" value={username} onChange={(e: any) => setUsername(e.target.value)} required />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="password">Admin Password</Label>
              <Input id="password" type="password" value={password} onChange={(e: any) => setPassword(e.target.value)} required />
            </div>
            <Button type="submit" className="w-full">
              Create Admin Account
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
