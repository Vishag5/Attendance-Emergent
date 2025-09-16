import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import InstallPrompt from "@/components/InstallPrompt";
import TeacherDashboard from "./pages/TeacherDashboard";
import AttendanceScanner from "./pages/AttendanceScanner";
import AttendanceResults from "./pages/AttendanceResults";
import ClassManagement from "./pages/ClassManagement";
import StudentEnrollment from "./pages/StudentEnrollment";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <InstallPrompt />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<TeacherDashboard />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/scan/:classId" element={<AttendanceScanner />} />
            <Route path="/results/:classId" element={<AttendanceResults />} />
            <Route path="/class/:classId" element={<ClassManagement />} />
            <Route path="/enroll/:classId" element={<StudentEnrollment />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
