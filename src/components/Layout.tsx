import { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { GraduationCap, LogOut, LayoutDashboard, BookOpen, FileText, BarChart3, AlertCircle } from "lucide-react";

export default function Layout({ children }: { children: ReactNode }) {
  const { user, role, signOut } = useAuth();
  const location = useLocation();

  const instructorLinks = [
    { to: "/", icon: LayoutDashboard, label: "Dashboard" },
    { to: "/courses", icon: BookOpen, label: "Courses" },
    { to: "/submissions", icon: FileText, label: "Submissions" },
    { to: "/analytics", icon: BarChart3, label: "Analytics" },
    { to: "/reverifications", icon: AlertCircle, label: "Re-verify" },
  ];

  const studentLinks = [
    { to: "/", icon: LayoutDashboard, label: "Dashboard" },
    { to: "/my-courses", icon: BookOpen, label: "My Courses" },
    { to: "/my-grades", icon: FileText, label: "My Grades" },
  ];

  const links = role === "instructor" ? instructorLinks : studentLinks;

  return (
    <div className="flex min-h-screen">
      <aside className="w-64 border-r bg-sidebar-background text-sidebar-foreground flex flex-col">
        <div className="flex items-center gap-2 p-4 border-b">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
            <GraduationCap className="h-4 w-4 text-primary-foreground" />
          </div>
          <span className="font-bold text-lg">EvalMate</span>
        </div>
        <nav className="flex-1 p-2 space-y-1">
          {links.map(link => (
            <Link
              key={link.to}
              to={link.to}
              className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors ${
                location.pathname === link.to
                  ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                  : "hover:bg-sidebar-accent/50"
              }`}
            >
              <link.icon className="h-4 w-4" />
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="border-t p-4">
          <div className="text-xs text-muted-foreground mb-2">{user?.email}</div>
          <div className="text-xs text-muted-foreground mb-2 capitalize">{role}</div>
          <Button variant="ghost" size="sm" onClick={signOut} className="w-full justify-start gap-2">
            <LogOut className="h-4 w-4" />
            Sign Out
          </Button>
        </div>
      </aside>
      <main className="flex-1 overflow-auto">
        <div className="p-6">{children}</div>
      </main>
    </div>
  );
}
