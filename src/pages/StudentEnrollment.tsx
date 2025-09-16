import { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Camera, User, CheckCircle, RotateCcw } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { detectSingleFaceDescriptor, float32ToBase64Simple, loadFaceModels, preloadFaceModels } from "@/lib/face";
import { useCreateStudent, useEnrollStudent } from "@/hooks/useClasses";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

type EnrollmentStep = "info" | "position" | "capture" | "angles" | "complete";

const StudentEnrollment = () => {
  const { classId } = useParams();
  const [currentStep, setCurrentStep] = useState<EnrollmentStep>("info");
  const [studentName, setStudentName] = useState("");
  const [studentId, setStudentId] = useState(() => `STU${Date.now()}`);
  const [isCapturing, setIsCapturing] = useState(false);
  const [captureProgress, setCaptureProgress] = useState(0);
  const [descriptorB64, setDescriptorB64] = useState<string>("");
  const [isSaving, setIsSaving] = useState(false);
  const [enrollmentCompleted, setEnrollmentCompleted] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const { toast } = useToast();
  const { user, session } = useAuth();
  const createStudent = useCreateStudent();
  const enrollStudent = useEnrollStudent();

  // Preload models when component mounts
  useEffect(() => {
    preloadFaceModels();
  }, []);

  const startCamera = async () => {
    try {
      // Use front-facing camera for enrollment
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: "user" } // Front camera
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (error) {
      console.error("Camera access failed:", error);
    }
  };

  const stopCamera = useCallback(() => {
    if (videoRef.current?.srcObject) {
      const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
      tracks.forEach(t => t.stop());
      videoRef.current.srcObject = null;
    }
  }, []);

  const nextStep = () => {
    switch (currentStep) {
      case "info":
        setCurrentStep("position");
        loadFaceModels().finally(startCamera);
        break;
      case "position":
        setCurrentStep("capture");
        break;
      case "capture":
        setCurrentStep("angles");
        break;
      case "angles":
        setCurrentStep("complete");
        break;
    }
  };

  const captureDescriptor = async () => {
    if (!videoRef.current) return;
    setIsCapturing(true);
    setCaptureProgress(10);
    
    try {
      console.log('Starting capture process...');
      setCaptureProgress(20);
      
      // Ensure models are loaded first
      await loadFaceModels();
      setCaptureProgress(30);
      
      console.log('Calling detectSingleFaceDescriptor...');
      const descriptor = await detectSingleFaceDescriptor(videoRef.current);
      
      if (!descriptor) {
        console.log('No descriptor returned from detection');
        toast({ title: "No face detected", description: "Please center your face and try again", variant: "destructive" });
        setIsCapturing(false);
        setCaptureProgress(0);
        return;
      }
      
      setCaptureProgress(50);
      console.log('Descriptor received, length:', descriptor.length);
      console.log('Descriptor sample:', descriptor.slice(0, 5));
      
      // Validate descriptor before conversion
      if (descriptor.length === 0) {
        throw new Error('Invalid descriptor: empty array');
      }
      
      console.log('Converting to base64...');
      const b64 = float32ToBase64Simple(descriptor);
      console.log('Base64 conversion successful, length:', b64.length);
      console.log('Base64 sample:', b64.substring(0, 50));
      
      if (!b64 || b64.length === 0) {
        throw new Error('Failed to convert descriptor to base64');
      }
      
      setDescriptorB64(b64);
      setCaptureProgress(100);
      setIsCapturing(false);
      toast({ title: "Face captured successfully", description: "Reference photo saved" });
      setTimeout(() => nextStep(), 400);
    } catch (e: any) {
      console.error('Capture error details:', {
        message: e?.message,
        stack: e?.stack,
        name: e?.name,
        error: e
      });
      toast({ 
        title: "Capture failed", 
        description: e?.message ?? "Unexpected error during face capture",
        variant: "destructive" 
      });
      setIsCapturing(false);
      setCaptureProgress(0);
    }
  };

  const persistStudentAndEnrollment = useCallback(async () => {
    if (!classId) return;
    if (!descriptorB64) return;
    if (!user) {
      toast({ title: "Authentication Error", description: "Please sign in to enroll students", variant: "destructive" });
      return;
    }
    if (isSaving || enrollmentCompleted) {
      console.log('Already saving or enrollment completed, ignoring duplicate request');
      return;
    }
    setIsSaving(true);
    try {
      console.log('User authentication status:', {
        user: user?.id,
        email: user?.email,
        session: !!session,
        classId
      });
      
      // Test if user has a profile
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();
      
      console.log('Profile check:', { profile, profileError });
      
      console.log('Creating student with data:', { student_id: studentId, full_name: studentName, facial_id: descriptorB64.substring(0, 50) + '...' });
      const created: any = await createStudent.mutateAsync({ student_id: studentId, full_name: studentName, facial_id: descriptorB64 });
      console.log('Student created successfully:', created);
      const newStudentId: string = created?.id;
      if (!newStudentId) throw new Error("Student creation failed");
      
      console.log('Enrolling student in class:', { classId, studentId: newStudentId });
      await enrollStudent.mutateAsync({ classId, studentId: newStudentId });
      console.log('Enrollment completed successfully');
      
      setEnrollmentCompleted(true);
      toast({ title: "Enrollment complete", description: `${studentName} enrolled successfully` });
      stopCamera();
      setCurrentStep("complete");
    } catch (e: any) {
      console.error('Enrollment error details:', {
        message: e?.message,
        code: e?.code,
        details: e?.details,
        hint: e?.hint,
        error: e
      });
      toast({ title: "Save failed", description: e?.message ?? "Could not save enrollment", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  }, [classId, createStudent, descriptorB64, enrollStudent, stopCamera, studentId, studentName, toast]);

  const renderStepContent = () => {
    switch (currentStep) {
      case "info":
        return (
          <Card className="shadow-medium max-w-md mx-auto">
            <CardHeader className="text-center">
              <CardTitle className="flex items-center justify-center gap-2">
                <User className="w-5 h-5" />
                Student Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Full Name</Label>
                <Input
                  id="name"
                  placeholder="Enter student's full name"
                  value={studentName}
                  onChange={(e) => setStudentName(e.target.value)}
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="studentId">Student ID</Label>
                <Input
                  id="studentId"
                  placeholder="Enter student ID"
                  value={studentId}
                  onChange={(e) => setStudentId(e.target.value)}
                />
              </div>

              <Button 
                variant="camera" 
                size="lg" 
                className="w-full mt-6"
                onClick={nextStep}
                disabled={!studentName.trim() || !studentId.trim()}
              >
                Continue to Face Setup
              </Button>
            </CardContent>
          </Card>
        );

      case "position":
        return (
          <div className="max-w-md mx-auto space-y-4">
            <Card className="shadow-medium">
              <CardHeader className="text-center">
                <CardTitle>Position Your Face</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Center your face in the circle and look directly at the camera
                </p>
              </CardHeader>
              <CardContent>
                <div className="relative aspect-square bg-camera-overlay rounded-lg overflow-hidden">
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover"
                  />
                  
                  {/* Face positioning overlay */}
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="relative">
                      {/* Outer guide circle */}
                      <div className="w-48 h-48 border-4 border-primary/60 rounded-full"></div>
                      {/* Inner guide circle */}
                      <div className="absolute inset-6 border-2 border-camera-success/80 rounded-full"></div>
                      {/* Center dot */}
                      <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-2 h-2 bg-camera-success rounded-full"></div>
                    </div>
                  </div>

                  {/* Status indicator */}
                  <div className="absolute top-4 left-1/2 transform -translate-x-1/2">
                    <div className="bg-success/90 text-success-foreground px-3 py-1 rounded-full text-xs font-medium">
                      Face Detected - Hold Still
                    </div>
                  </div>
                </div>

                <Button 
                  variant="success" 
                  size="lg" 
                  className="w-full mt-4"
                  onClick={nextStep}
                >
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Position Looks Good
                </Button>
              </CardContent>
            </Card>
          </div>
        );

      case "capture":
        return (
          <div className="max-w-md mx-auto space-y-4">
            <Card className="shadow-medium">
              <CardHeader className="text-center">
                <CardTitle>Capturing Reference</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Hold still while we capture your primary reference photo
                </p>
              </CardHeader>
              <CardContent>
                <div className="relative aspect-square bg-camera-overlay rounded-lg overflow-hidden">
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover"
                  />
                  
                  {/* Capture progress overlay */}
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="relative">
                      <div className="w-48 h-48 border-4 border-camera-success rounded-full"></div>
                      {isCapturing && (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="text-center text-primary-foreground">
                            <div className="text-2xl font-bold">{captureProgress}%</div>
                            <div className="text-xs">Capturing...</div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Progress bar */}
                  {isCapturing && (
                    <div className="absolute bottom-4 left-4 right-4">
                      <div className="bg-background/80 rounded-full h-2">
                        <div 
                          className="bg-camera-success h-2 rounded-full transition-all duration-200"
                          style={{ width: `${captureProgress}%` }}
                        ></div>
                      </div>
                    </div>
                  )}
                </div>

                <Button 
                  variant="camera" 
                  size="lg" 
                  className="w-full mt-4"
                  onClick={captureDescriptor}
                  disabled={isCapturing}
                >
                  <Camera className="w-4 h-4 mr-2" />
                  {isCapturing ? "Capturing..." : "Capture Reference"}
                </Button>
              </CardContent>
            </Card>
          </div>
        );

      case "angles":
        return (
          <div className="max-w-md mx-auto space-y-4">
            <Card className="shadow-medium">
              <CardHeader className="text-center">
                <CardTitle>Capture Different Angles</CardTitle>
                <div className="text-sm text-muted-foreground space-y-1">
                  <p><strong>Step 1:</strong> Position your face in the circle</p>
                  <p><strong>Step 2:</strong> Click "Capture Face Angles" button</p>
                  <p><strong>Step 3:</strong> Slowly turn your head left, then right while capturing</p>
                  <p><strong>Step 4:</strong> Click "Complete Enrollment" when done</p>
                </div>
              </CardHeader>
              <CardContent>
                <div className="relative aspect-square bg-camera-overlay rounded-lg overflow-hidden">
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover"
                  />
                  
                  {/* Angle guidance */}
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="relative">
                      <div className="w-48 h-48 border-4 border-primary/60 rounded-full"></div>
                      {/* Left arrow */}
                      <div className="absolute left-0 top-1/2 transform -translate-y-1/2 -translate-x-8">
                        <div className="text-primary-foreground text-2xl animate-pulse">←</div>
                      </div>
                      {/* Right arrow */}
                      <div className="absolute right-0 top-1/2 transform -translate-y-1/2 translate-x-8">
                        <div className="text-primary-foreground text-2xl animate-pulse">→</div>
                      </div>
                    </div>
                  </div>

                  <div className="absolute top-4 left-1/2 transform -translate-x-1/2">
                    <div className="bg-primary/90 text-primary-foreground px-3 py-1 rounded-full text-xs font-medium">
                      Turn Head Slowly Left → Right
                    </div>
                  </div>
                </div>

                <div className="space-y-3 mt-4">
                  <Button 
                    variant="outline" 
                    size="lg" 
                    className="w-full"
                    onClick={captureDescriptor}
                    disabled={isCapturing || isSaving || enrollmentCompleted}
                  >
                    <Camera className="w-4 h-4 mr-2" />
                    {isCapturing ? "Capturing..." : "Capture Face Angles"}
                  </Button>
                  
                  <Button 
                    variant="success" 
                    size="lg" 
                    className="w-full"
                    onClick={persistStudentAndEnrollment}
                    disabled={isCapturing || !descriptorB64 || isSaving || enrollmentCompleted}
                  >
                    <RotateCcw className="w-4 h-4 mr-2" />
                    {enrollmentCompleted ? "Enrollment Complete!" : isSaving ? "Saving..." : "Complete Enrollment"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        );

      case "complete":
        return (
          <div className="max-w-md mx-auto space-y-4">
            <Card className="shadow-medium">
              <CardHeader className="text-center">
                <CardTitle className="flex items-center justify-center gap-2 text-success">
                  <CheckCircle className="w-6 h-6" />
                  Enrollment Complete!
                </CardTitle>
              </CardHeader>
              <CardContent className="text-center space-y-4">
                <div className="p-6 bg-success-bg rounded-lg">
                  <div className="text-lg font-semibold">{studentName}</div>
                  <div className="text-sm text-muted-foreground">{studentId}</div>
                  <div className="text-xs text-success mt-2">
                    Successfully enrolled in Math 101
                  </div>
                </div>

                <div className="space-y-2 text-sm text-muted-foreground">
                  <p>✓ Primary reference captured</p>
                  <p>✓ Multiple angles processed</p>
                  <p>✓ Face signature created</p>
                  <p>✓ Ready for attendance scanning</p>
                </div>

                <div className="flex gap-3 mt-6">
                  <Button variant="camera" className="flex-1" onClick={() => {
                    setStudentName("");
                    setStudentId("");
                    setDescriptorB64("");
                    setCurrentStep("info");
                  }}>
                    Enroll Another Student
                  </Button>
                  <Button variant="outline" className="flex-1" asChild>
                    <Link to={`/class/${classId}`}>
                      Return to Class
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        );
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-gradient-primary shadow-soft">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" asChild className="text-primary-foreground hover:bg-primary-foreground/10">
              <Link to={`/class/${classId}`}>
                <ArrowLeft className="w-4 h-4" />
              </Link>
            </Button>
            <div>
              <h1 className="text-xl font-bold text-primary-foreground">
                Enroll New Student
              </h1>
              <p className="text-sm text-primary-foreground/80">Math 101</p>
            </div>
          </div>
        </div>
      </header>

      {/* Progress Steps */}
      <div className="container mx-auto px-4 py-6">
        <div className="flex items-center justify-center space-x-2 mb-8">
          {(["info", "position", "capture", "angles", "complete"] as EnrollmentStep[]).map((step, index) => {
            const isActive = step === currentStep;
            const isCompleted = (["info", "position", "capture", "angles", "complete"] as EnrollmentStep[]).indexOf(currentStep) > index;
            
            return (
              <div key={step} className="flex items-center">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium ${
                  isActive ? "bg-primary text-primary-foreground" :
                  isCompleted ? "bg-success text-success-foreground" :
                  "bg-muted text-muted-foreground"
                }`}>
                  {isCompleted ? "✓" : index + 1}
                </div>
                {index < 4 && (
                  <div className={`w-8 h-0.5 ${isCompleted ? "bg-success" : "bg-muted"}`}></div>
                )}
              </div>
            );
          })}
        </div>

        {/* Step Content */}
        <main>
          {renderStepContent()}
        </main>
      </div>
    </div>
  );
};

export default StudentEnrollment;