import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, CheckCircle, XCircle, Users, Clock } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { useClassById } from "@/hooks/useClasses";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useMemo, useState } from "react";

type StudentRow = { id: string; full_name: string };

const AttendanceResults = () => {
  const { classId } = useParams();
  const { data: classData } = useClassById(classId ?? "");
  const [present, setPresent] = useState<StudentRow[]>([]);
  const [absent, setAbsent] = useState<StudentRow[]>([]);
  const [dateStr, setDateStr] = useState<string>(new Date().toLocaleDateString());
  const [timeStr, setTimeStr] = useState<string>(new Date().toLocaleTimeString());

  useEffect(() => {
    const load = async () => {
      if (!classId) return;
      const today = new Date().toISOString().slice(0,10);
      // present
      const { data: presentRows } = await supabase
        .from('attendance_records')
        .select('student_id, students ( id, full_name )')
        .eq('class_id', classId)
        .eq('date', today)
        .eq('status', 'present');
      // absent
      const { data: absentRows } = await supabase
        .from('attendance_records')
        .select('student_id, students ( id, full_name )')
        .eq('class_id', classId)
        .eq('date', today)
        .eq('status', 'absent');
      setPresent((presentRows ?? []).map(r => ({ id: (r as any).students.id, full_name: (r as any).students.full_name })));
      setAbsent((absentRows ?? []).map(r => ({ id: (r as any).students.id, full_name: (r as any).students.full_name })));
      const now = new Date();
      setDateStr(now.toLocaleDateString());
      setTimeStr(now.toLocaleTimeString());
    };
    load();
  }, [classId]);

  const totalStudents = present.length + absent.length;
  const attendanceRate = totalStudents > 0 ? Math.round((present.length / totalStudents) * 100) : 0;

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
                {present.map((s) => (
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
                ))}
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
                {absent.map((s) => (
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
                ))}
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