import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import Layout from "@/components/Layout";
import Auth from "@/pages/Auth";
import InstructorDashboard from "@/pages/instructor/InstructorDashboard";
import Courses from "@/pages/instructor/Courses";
import CourseDetail from "@/pages/instructor/CourseDetail";
import AssignmentDetail from "@/pages/instructor/AssignmentDetail";
import Submissions from "@/pages/instructor/Submissions";
import Analytics from "@/pages/instructor/Analytics";
import Reverifications from "@/pages/instructor/Reverifications";
import StudentDashboard from "@/pages/student/StudentDashboard";
import MyCourses from "@/pages/student/MyCourses";
import SubmitAssignment from "@/pages/student/SubmitAssignment";
import MyGrades from "@/pages/student/MyGrades";
import NotFound from "@/pages/NotFound";

const queryClient = new QueryClient();

function AppRoutes() {
  const { user, role, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!user) return <Auth />;
  if (!role) return <Auth />;

  return (
    <Layout>
      <Routes>
        {role === "instructor" ? (
          <>
            <Route path="/" element={<InstructorDashboard />} />
            <Route path="/courses" element={<Courses />} />
            <Route path="/courses/:courseId" element={<CourseDetail />} />
            <Route path="/assignments/:assignmentId" element={<AssignmentDetail />} />
            <Route path="/submissions" element={<Submissions />} />
            <Route path="/analytics" element={<Analytics />} />
            <Route path="/reverifications" element={<Reverifications />} />
          </>
        ) : (
          <>
            <Route path="/" element={<StudentDashboard />} />
            <Route path="/my-courses" element={<MyCourses />} />
            <Route path="/submit/:assignmentId" element={<SubmitAssignment />} />
            <Route path="/my-grades" element={<MyGrades />} />
          </>
        )}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Layout>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
