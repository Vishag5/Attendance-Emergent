import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Plus, Users, UserPlus, History, Settings, Trash2 } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { useClassById, useClassEnrollments, useDeleteStudent } from "@/hooks/useClasses";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

// Supabase-backed data

const ClassManagement = () => {
  const { classId } = useParams();
  const [activeTab, setActiveTab] = useState<"roster" | "settings">("roster");
  const { data: classData } = useClassById(classId ?? "");
  const { data: enrollments } = useClassEnrollments(classId ?? "");
  const deleteStudent = useDeleteStudent();
  const { toast } = useToast();
  
  const activeStudents = useMemo(() => (enrollments ?? []).map(e => ({
    id: e.students.id,
    name: e.students.full_name,
    studentId: e.students.student_id,
    enrolled: e.enrolled_at,
    status: "active" as const
  })), [enrollments]);
  const inactiveStudents: typeof activeStudents = [];

  const handleDeleteStudent = async (studentId: string, studentName: string) => {
    if (!classId) return;
    
    try {
      await deleteStudent.mutateAsync({ studentId, classId });
    } catch (error) {
      // Error handling is done in the hook
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-gradient-primary shadow-soft">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" asChild className="text-primary-foreground hover:bg-primary-foreground/10">
              <Link to="/">
                <ArrowLeft className="w-4 h-4" />
              </Link>
            </Button>
            <div className="flex-1">
              <h1 className="text-xl font-bold text-primary-foreground">
                {classData?.name ?? "Class"}
              </h1>
              <p className="text-sm text-primary-foreground/80">
                {classData?.subject ?? ""} {classData?.period ? `• ${classData?.period}` : ""}
              </p>
            </div>
            <Badge variant="secondary" className="text-sm">
              {activeStudents.length} Active
            </Badge>
          </div>
        </div>
      </header>

      {/* Tab Navigation */}
      <div className="container mx-auto px-4 py-4">
        <div className="flex gap-2 mb-6">
          <Button
            variant={activeTab === "roster" ? "default" : "outline"}
            onClick={() => setActiveTab("roster")}
            className="flex-1"
          >
            <Users className="w-4 h-4 mr-2" />
            Class Roster
          </Button>
          <Button
            variant={activeTab === "settings" ? "default" : "outline"}
            onClick={() => setActiveTab("settings")}
            className="flex-1"
          >
            <Settings className="w-4 h-4 mr-2" />
            Settings
          </Button>
        </div>

        {/* Tab Content */}
        {activeTab === "roster" && (
          <div className="space-y-6">
            {/* Quick Actions */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Button variant="camera" className="h-12" asChild>
                <Link to={`/enroll/${classId}`}>
                  <UserPlus className="w-5 h-5 mr-2" />
                  Enroll New Student
                </Link>
              </Button>
              
              <Button variant="outline" className="h-12" asChild>
                <Link to={`/scan/${classId}`}>
                  <Users className="w-5 h-5 mr-2" />
                  Take Attendance
                </Link>
              </Button>
              
              <Button variant="outline" className="h-12">
                <History className="w-5 h-5 mr-2" />
                View History
              </Button>
            </div>

            {/* Active Students */}
            <Card className="shadow-medium">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="w-5 h-5" />
                  Active Students ({activeStudents.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="max-h-96 overflow-y-auto">
                  {activeStudents.map((student, index) => (
                    <div 
                      key={student.id} 
                      className="flex items-center justify-between p-4 border-b border-border last:border-0 hover:bg-muted/30"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center">
                          <span className="text-xs font-semibold text-primary">
                            {student.name.split(' ').map(n => n[0]).join('')}
                          </span>
                        </div>
                        <div>
                          <div className="font-medium">{student.name}</div>
                          <div className="text-sm text-muted-foreground">{student.studentId}</div>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <Badge variant="outline" className="text-xs">
                            Active
                          </Badge>
                          <div className="text-xs text-muted-foreground mt-1">
                            Enrolled {new Date(student.enrolled).toLocaleDateString()}
                          </div>
                        </div>
                        
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive hover:text-destructive hover:bg-destructive/10"
                              disabled={deleteStudent.isPending}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete Student</AlertDialogTitle>
                              <AlertDialogDescription>
                                Are you sure you want to delete <strong>{student.name}</strong>? 
                                This action cannot be undone and will remove all their face data and attendance records.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => handleDeleteStudent(student.id, student.name)}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                disabled={deleteStudent.isPending}
                              >
                                {deleteStudent.isPending ? "Deleting..." : "Delete"}
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Inactive Students */}
            {inactiveStudents.length > 0 && (
              <Card className="shadow-soft">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-muted-foreground">
                    <Users className="w-5 h-5" />
                    Inactive Students ({inactiveStudents.length})
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  {inactiveStudents.map((student) => (
                    <div 
                      key={student.id} 
                      className="flex items-center justify-between p-4 border-b border-border last:border-0 opacity-60"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-muted rounded-full flex items-center justify-center">
                          <span className="text-xs font-semibold text-muted-foreground">
                            {student.name.split(' ').map(n => n[0]).join('')}
                          </span>
                        </div>
                        <div>
                          <div className="font-medium">{student.name}</div>
                          <div className="text-sm text-muted-foreground">{student.studentId}</div>
                        </div>
                      </div>
                      
                      <Badge variant="outline" className="text-xs text-muted-foreground">
                        Inactive
                      </Badge>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {activeTab === "settings" && (
          <div className="space-y-6">
            <Card className="shadow-medium">
              <CardHeader>
                <CardTitle>Class Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium">Class Name</label>
                    <div className="mt-1 p-3 bg-muted rounded-md">{classData?.name ?? ""}</div>
                  </div>
                  <div>
                    <label className="text-sm font-medium">Subject</label>
                    <div className="mt-1 p-3 bg-muted rounded-md">{classData?.subject ?? ""}</div>
                  </div>
                  <div>
                    <label className="text-sm font-medium">Period</label>
                    <div className="mt-1 p-3 bg-muted rounded-md">{classData?.period ?? ""}</div>
                  </div>
                  <div>
                    <label className="text-sm font-medium">Total Enrolled</label>
                    <div className="mt-1 p-3 bg-muted rounded-md">{activeStudents.length} students</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-medium">
              <CardHeader>
                <CardTitle>Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button variant="outline" className="w-full justify-start">
                  Export Student List
                </Button>
                <Button variant="outline" className="w-full justify-start">
                  Reset All Face Data
                </Button>
                <Button variant="destructive" className="w-full justify-start">
                  Archive Class
                </Button>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
};

export default ClassManagement;