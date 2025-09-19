import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, CheckCircle, XCircle, Users, Clock, Loader2 } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { useClassById } from "@/hooks/useClasses";
import { supabase } from "@/integrations/supabase/client";
import React, { useEffect, useMemo, useState } from "react";

type StudentRow = { id: string; full_name: string };

const AttendanceResults = () => {
  const { classId } = useParams();
  const { data: classData } = useClassById(classId ?? "");
  const [present, setPresent] = useState<StudentRow[]>([]);
  const [absent, setAbsent] = useState<StudentRow[]>([]);
  const [dateStr, setDateStr] = useState<string>(new Date().toLocaleDateString());
  const [timeStr, setTimeStr] = useState<string>(new Date().toLocaleTimeString());
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      if (!classId) return;
      
      setIsLoading(true);
      setError(null);
      
      try {
        const today = new Date().toISOString().slice(0,10);
        
        console.log('🔍 Loading attendance for class:', classId, 'date:', today);
        
        // Get all enrolled students first
        const { data: enrollments } = await supabase
          .from('enrollments')
          .select('student_id, students ( id, full_name )')
          .eq('class_id', classId);
        
        console.log('📚 Enrolled students:', enrollments);
        
        // Get present students
        const { data: presentRows, error: presentError } = await supabase
          .from('attendance_records')
          .select('student_id, students ( id, full_name )')
          .eq('class_id', classId)
          .eq('date', today)
          .eq('status', 'present');
        
        console.log('✅ Present students:', presentRows, 'Error:', presentError);
        
        // Get absent students
        const { data: absentRows, error: absentError } = await supabase
          .from('attendance_records')
          .select('student_id, students ( id, full_name )')
          .eq('class_id', classId)
          .eq('date', today)
          .eq('status', 'absent');
        
        console.log('❌ Absent students:', absentRows, 'Error:', absentError);
        
        // Process all data before setting state to prevent intermediate renders
        const presentStudents = (presentRows ?? []).map(r => ({ 
          id: (r as any).students.id, 
          full_name: (r as any).students.full_name 
        }));
        
        const absentStudents = (absentRows ?? []).map(r => ({ 
          id: (r as any).students.id, 
          full_name: (r as any).students.full_name 
        }));
        
        console.log('📊 Final counts - Present:', presentStudents.length, 'Absent:', absentStudents.length);
        console.log('📊 Setting state - Present:', presentStudents, 'Absent:', absentStudents);
        
        // Use React.startTransition to batch state updates and prevent intermediate renders
        React.startTransition(() => {
          setPresent(presentStudents);
          setAbsent(absentStudents);
        });
        
        const now = new Date();
        setDateStr(now.toLocaleDateString());
        setTimeStr(now.toLocaleTimeString());
        
      } catch (err: any) {
        console.error('❌ Error loading attendance:', err);
        setError(err.message || 'Failed to load attendance data');
      } finally {
        // Add a delay to ensure loading state is visible and data is properly set
        setTimeout(() => {
          console.log('🔄 Setting isLoading to false');
          setIsLoading(false);
        }, 1000);
      }
    };
    load();
  }, [classId]);

  const totalStudents = present.length + absent.length;
  const attendanceRate = totalStudents > 0 ? Math.round((present.length / totalStudents) * 100) : 0;

  console.log('🔄 AttendanceResults render - isLoading:', isLoading, 'present:', present.length, 'absent:', absent.length);

  // Loading state - show loading if still loading OR if we have no data yet
  if (isLoading || (present.length === 0 && absent.length === 0 && !error)) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <Loader2 className="w-12 h-12 animate-spin mx-auto text-primary" />
          <h2 className="text-xl font-semibold">Loading Attendance Results...</h2>
          <p className="text-muted-foreground">Please wait while we fetch the data</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4 max-w-md">
          <XCircle className="w-12 h-12 mx-auto text-destructive" />
          <h2 className="text-xl font-semibold">Error Loading Results</h2>
          <p className="text-muted-foreground">{error}</p>
          <Button asChild>
            <Link to="/">Return to Dashboard</Link>
          </Button>
        </div>
      </div>
    );
  }

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
                Attendance Complete
              </h1>
              <p className="text-sm text-primary-foreground/80">
                {classData?.name ?? "Class"} • {dateStr}
              </p>
            </div>
            <Badge variant="secondary" className="text-sm">
              {attendanceRate}% Present
            </Badge>
          </div>
        </div>
      </header>

      {/* Results Summary */}
      <main className="container mx-auto px-4 py-6">
        {/* Stats Overview */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <Card className="shadow-soft">
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-primary">{totalStudents}</div>
              <div className="text-sm text-muted-foreground">Total</div>
            </CardContent>
          </Card>
          
          <Card className="shadow-soft">
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-success">{present.length}</div>
              <div className="text-sm text-muted-foreground">Present</div>
            </CardContent>
          </Card>
          
          <Card className="shadow-soft">
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-warning">{absent.length}</div>
              <div className="text-sm text-muted-foreground">Absent</div>
            </CardContent>
          </Card>
          
          <Card className="shadow-soft">
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-primary">{attendanceRate}%</div>
              <div className="text-sm text-muted-foreground">Rate</div>
            </CardContent>
          </Card>
        </div>

        {/* Detailed Lists */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Present Students */}
          <Card className="shadow-medium">
            <CardHeader className="bg-success-bg/50">
              <CardTitle className="flex items-center gap-2 text-success">
                <CheckCircle className="w-5 h-5" />
                Present ({present.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="max-h-96 overflow-y-auto">
                {present.length > 0 ? (
                  present.map((s) => (
                    <div 
                      key={s.id} 
                      className="flex items-center gap-3 p-4 border-b border-border last:border-0 hover:bg-muted/30"
                    >
                      <div className="w-2 h-2 bg-success rounded-full"></div>
                      <span className="flex-1">{s.full_name}</span>
                      <Badge variant="outline" className="text-xs text-success border-success/30">
                        Present
                      </Badge>
                    </div>
                  ))
                ) : (
                  <div className="p-8 text-center text-muted-foreground">
                    <CheckCircle className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p className="text-sm">No students marked as present</p>
                    <p className="text-xs mt-1">Check if attendance was properly scanned</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Absent Students */}
          <Card className="shadow-medium">
            <CardHeader className="bg-warning-bg/50">
              <CardTitle className="flex items-center gap-2 text-warning">
                <XCircle className="w-5 h-5" />
                Absent ({absent.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="max-h-96 overflow-y-auto">
                {absent.length > 0 ? (
                  absent.map((s) => (
                    <div 
                      key={s.id} 
                      className="flex items-center gap-3 p-4 border-b border-border last:border-0 hover:bg-muted/30"
                    >
                      <div className="w-2 h-2 bg-warning rounded-full"></div>
                      <span className="flex-1">{s.full_name}</span>
                      <Badge variant="outline" className="text-xs text-warning border-warning/30">
                        Absent
                      </Badge>
                    </div>
                  ))
                ) : (
                  <div className="p-8 text-center text-muted-foreground">
                    <XCircle className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p className="text-sm">No students marked as absent</p>
                    <p className="text-xs mt-1">All enrolled students are present</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Session Info */}
        <Card className="mt-6 shadow-soft">
          <CardContent className="p-4">
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4" />
                Scanned at {timeStr}
              </div>
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4" />
                Session: {classId}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3 mt-6">
          <Button variant="default" className="flex-1" asChild>
            <Link to="/">
              Return to Dashboard
            </Link>
          </Button>
          
          <Button variant="outline" className="flex-1">
            Share Results
          </Button>
          
          <Button variant="outline" className="flex-1">
            Export Data
          </Button>
        </div>
      </main>
    </div>
  );
};

export default AttendanceResults;