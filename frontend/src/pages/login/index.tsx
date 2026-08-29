import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fetchApi } from "@/api";

export default function LoginPage() {
  const navigate = useNavigate();
  const [config, setConfig] = useState<any>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get("token");
    if (token) {
      localStorage.setItem("token", token);
      navigate("/");
    }
  }, [navigate]);

  useEffect(() => {
    fetchApi("/auth/status").then((res: any) => {
      setConfig(res);
      if (res.needs_setup) navigate("/setup");
    }).catch(() => {
      setError("Failed to load auth config");
    });
  }, [navigate]);

  const handleLogin = async (e: any) => {
    e.preventDefault();
    setError("");
    try {
      const res = await fetchApi("/auth/login", {
        method: "POST",
        body: JSON.stringify({ username, password })
      });
      if (res.token) {
        localStorage.setItem("token", res.token);
        navigate("/");
      } else {
        setError("Invalid credentials");
      }
    } catch (err: any) {
      setError("Invalid credentials");
    }
  };

  if (!config) return <div className="flex h-screen items-center justify-center">Loading...</div>;

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
          {error && <div className="text-sm text-destructive text-center font-medium">{error}</div>}
          
          {!config.disableLocal && (
            <form onSubmit={handleLogin} className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="username">Username</Label>
                <Input id="username" type="text" value={username} onChange={e => setUsername(e.target.value)} required />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="password">Password</Label>
                <Input id="password" type="password" value={password} onChange={e => setPassword(e.target.value)} required />
              </div>
              <Button type="submit" className="w-full">
                Login
              </Button>
            </form>
          )}

          {config.hasOidc && (
            <div className="grid gap-4">
              {!config.disableLocal && (
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
              <Button variant="outline" type="button" onClick={() => window.location.href = '/api/auth/oidc/login'} className="w-full">
                {config.oidcName || "Single Sign-On (OIDC)"}
              </Button>
            </div>
          )}
          
          {config.disableLocal && !config.hasOidc && (
            <div className="text-center text-sm text-destructive mt-4 font-medium">
              Authentication misconfigured: Local login is disabled but OIDC variables are missing in .env.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
