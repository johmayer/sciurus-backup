import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";

export function LogoutButton() {
  return (
    <Button 
      variant="outline" 
      size="sm"
      className="gap-2"
      onClick={() => {
        localStorage.removeItem("token");
        window.location.href = "/login";
      }}
    >
      <LogOut className="h-4 w-4" />
      <span className="hidden sm:inline">Log out</span>
    </Button>
  );
}
