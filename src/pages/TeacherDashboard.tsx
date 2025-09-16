import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useClasses, useCreateClass } from '@/hooks/useClasses';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { 
  GraduationCap, 
  Users, 
  Plus, 
  Camera, 
  Clock, 
  BookOpen,
  LogOut,
  Settings
} from 'lucide-react';

const TeacherDashboard = () => {
  const { user, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const { data: classes, isLoading: classesLoading } = useClasses();
  const createClassMutation = useCreateClass();
  const { toast } = useToast();
  
  const [showCreateClass, setShowCreateClass] = useState(false);
  const [newClass, setNewClass] = useState({
    name: '',
    subject: '',
    period: ''
  });

  useEffect(() => {
    if (!loading && !user) {
      navigate('/auth');
    }
  }, [user, loading, navigate]);

  const handleSignOut = async () => {
    await signOut();
    toast({
      title: "Signed out",
      description: "You have been signed out successfully",
    });
  };

  const handleCreateClass = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClass.name || !newClass.subject) {
      toast({
        title: "Error",
        description: "Please fill in all required fields",
        variant: "destructive"
      });
      return;
    }

    createClassMutation.mutate(newClass, {
      onSuccess: () => {
        setShowCreateClass(false);
        setNewClass({ name: '', subject: '', period: '' });
      }
    });
  };

  if (loading || classesLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-subtle">
      {/* Header */}
      <header className="bg-card/95 backdrop-blur-sm border-b shadow-soft sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
                <GraduationCap className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h1 className="text-xl font-bold">FaceAttend</h1>
                <p className="text-sm text-muted-foreground">Welcome back, Teacher</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon">
                <Settings className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="icon" onClick={handleSignOut}>
                <LogOut className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-6">
        {/* Quick Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <Card className="bg-card/50 backdrop-blur-sm">
            <CardContent className="p-4 text-center">
              <BookOpen className="w-6 h-6 text-primary mx-auto mb-2" />
              <p className="text-2xl font-bold">{classes?.length || 0}</p>
              <p className="text-sm text-muted-foreground">Classes</p>
            </CardContent>
          </Card>
          <Card className="bg-card/50 backdrop-blur-sm">
            <CardContent className="p-4 text-center">
              <Users className="w-6 h-6 text-accent mx-auto mb-2" />
              <p className="text-2xl font-bold">0</p>
              <p className="text-sm text-muted-foreground">Students</p>
            </CardContent>
          </Card>
          <Card className="bg-card/50 backdrop-blur-sm">
            <CardContent className="p-4 text-center">
              <Camera className="w-6 h-6 text-success-soft mx-auto mb-2" />
              <p className="text-2xl font-bold">0</p>
              <p className="text-sm text-muted-foreground">Scans Today</p>
            </CardContent>
          </Card>
          <Card className="bg-card/50 backdrop-blur-sm">
            <CardContent className="p-4 text-center">
              <Clock className="w-6 h-6 text-warning-soft mx-auto mb-2" />
              <p className="text-2xl font-bold">95%</p>
              <p className="text-sm text-muted-foreground">Avg Attendance</p>
            </CardContent>
          </Card>
        </div>

        {/* Classes Section */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold">Your Classes</h2>
          <Dialog open={showCreateClass} onOpenChange={setShowCreateClass}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="w-4 h-4" />
                New Class
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create New Class</DialogTitle>
                <DialogDescription>
                  Set up a new class for attendance tracking
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleCreateClass} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="class-name">Class Name *</Label>
                  <Input
                    id="class-name"
                    placeholder="e.g., Math 101"
                    value={newClass.name}
                    onChange={(e) => setNewClass({ ...newClass, name: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="subject">Subject *</Label>
                  <Input
                    id="subject"
                    placeholder="e.g., Mathematics"
                    value={newClass.subject}
                    onChange={(e) => setNewClass({ ...newClass, subject: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="period">Period/Time</Label>
                  <Input
                    id="period"
                    placeholder="e.g., 1st Period, 9:00 AM"
                    value={newClass.period}
                    onChange={(e) => setNewClass({ ...newClass, period: e.target.value })}
                  />
                </div>
                <div className="flex gap-2">
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={() => setShowCreateClass(false)}
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                  <Button 
                    type="submit" 
                    className="flex-1"
                    disabled={createClassMutation.isPending}
                  >
                    {createClassMutation.isPending ? "Creating..." : "Create Class"}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Classes Grid */}
        {classes?.length === 0 ? (
          <Card className="p-8 text-center bg-card/50 backdrop-blur-sm">
            <GraduationCap className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Classes Yet</h3>
            <p className="text-muted-foreground mb-4">
              Create your first class to start taking attendance
            </p>
            <Button onClick={() => setShowCreateClass(true)} className="gap-2">
              <Plus className="w-4 h-4" />
              Create First Class
            </Button>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {classes?.map((classItem) => (
              <Card key={classItem.id} className="bg-card/50 backdrop-blur-sm hover:shadow-elegant transition-all">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span className="truncate">{classItem.name}</span>
                    <BookOpen className="w-5 h-5 text-primary flex-shrink-0" />
                  </CardTitle>
                  <CardDescription>
                    {classItem.subject} {classItem.period && `• ${classItem.period}`}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <Users className="w-4 h-4" />
                      <span>0 students</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Clock className="w-4 h-4" />
                      <span>No scans</span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button 
                      onClick={() => navigate(`/scan/${classItem.id}`)}
                      className="flex-1 gap-2"
                      size="sm"
                    >
                      <Camera className="w-4 h-4" />
                      Take Attendance
                    </Button>
                    <Button 
                      onClick={() => navigate(`/class/${classItem.id}`)}
                      variant="outline"
                      size="sm"
                      className="gap-2"
                    >
                      <Settings className="w-4 h-4" />
                      Manage
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default TeacherDashboard;