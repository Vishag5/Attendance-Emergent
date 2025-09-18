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

type EnrollmentStep = "info" | "position" | "capture" | "angles" | "review" | "complete";

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
  const [faceDetected, setFaceDetected] = useState(false);
  const [faceQuality, setFaceQuality] = useState<'good' | 'poor' | 'none'>('none');
  const [angleCaptureStarted, setAngleCaptureStarted] = useState(false);
  const [angleCaptureProgress, setAngleCaptureProgress] = useState(0);
  const [cameraLoading, setCameraLoading] = useState(false);
  const [stableFaceCount, setStableFaceCount] = useState(0);
  const [autoMoveCountdown, setAutoMoveCountdown] = useState(0);
  const [autoCaptureTriggered, setAutoCaptureTriggered] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const { toast } = useToast();
  const { user, session } = useAuth();
  const createStudent = useCreateStudent();
  const enrollStudent = useEnrollStudent();

  // Preload models when component mounts for better performance
  useEffect(() => {
    const preloadModels = async () => {
      try {
        await preloadFaceModels();
        console.log('Face models preloaded successfully');
      } catch (error) {
        console.error('Failed to preload face models:', error);
      }
    };
    preloadModels();
  }, []);

  // Real-time face detection for positioning guide (optimized with better accuracy)
  const checkFaceDetection = useCallback(async () => {
    if (!videoRef.current || isCapturing) return;
    
    try {
      const detection = await detectSingleFaceDescriptor(videoRef.current);
      
      // More strict face detection validation
      const hasFace = detection && 
                     detection.length > 0 && 
                     detection.length === 128 && // Ensure proper descriptor length
                     !detection.every(val => val === 0); // Ensure not all zeros
      
      // Only update state if it changed to prevent unnecessary re-renders
      setFaceDetected(prev => prev !== hasFace ? hasFace : prev);
      setFaceQuality(prev => {
        const newQuality = hasFace ? 'good' : 'none';
        return prev !== newQuality ? newQuality : prev;
      });
      
      // Auto-move logic for position step
      if (currentStep === 'position' && hasFace) {
        setStableFaceCount(prev => {
          const newCount = prev + 1;
          if (newCount >= 3) { // 3 consecutive detections = stable
            // Start countdown for auto-move
            if (autoMoveCountdown === 0) {
              setAutoMoveCountdown(3);
              const countdownInterval = setInterval(() => {
                setAutoMoveCountdown(prev => {
                  if (prev <= 1) {
                    clearInterval(countdownInterval);
                    nextStep();
                    return 0;
                  }
                  return prev - 1;
                });
              }, 1000);
            }
          }
          return newCount;
        });
      } else if (currentStep === 'position' && !hasFace) {
        // Reset count if face is lost
        setStableFaceCount(0);
        setAutoMoveCountdown(0);
      }
      
    } catch (error) {
      // Only update if not already in poor state
      setFaceDetected(prev => prev !== false ? false : prev);
      setFaceQuality(prev => prev !== 'poor' ? 'poor' : prev);
      
      // Reset auto-move on error
      if (currentStep === 'position') {
        setStableFaceCount(0);
        setAutoMoveCountdown(0);
      }
    }
  }, [isCapturing, currentStep, autoMoveCountdown]);

  // Run face detection every 1000ms when on position/capture/angles steps (reduced frequency)
  useEffect(() => {
    if (['position', 'capture', 'angles'].includes(currentStep)) {
      const interval = setInterval(checkFaceDetection, 1000); // Reduced from 500ms to 1000ms
      return () => clearInterval(interval);
    } else {
      // Clear face detection state when not on camera steps
      setFaceDetected(false);
      setFaceQuality('none');
    }
  }, [currentStep, checkFaceDetection]);

  // Cleanup camera on component unmount
  useEffect(() => {
    return () => {
      // Stop camera when component unmounts
      if (videoRef.current?.srcObject) {
        const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
        tracks.forEach(t => t.stop());
        videoRef.current.srcObject = null;
      }
    };
  }, []);

  // Auto-capture reference when on capture step
  useEffect(() => {
    if (currentStep === 'capture' && !autoCaptureTriggered && !isCapturing) {
      console.log('🔄 AUTO-CAPTURE: Starting auto-capture for reference');
      setAutoCaptureTriggered(true);
      const timer = setTimeout(() => {
        console.log('🔄 AUTO-CAPTURE: Executing captureDescriptor');
        captureDescriptor();
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [currentStep]); // Only depend on currentStep

  // Auto-capture angles when on angles step
  useEffect(() => {
    if (currentStep === 'angles' && !autoCaptureTriggered && !isCapturing) {
      console.log('🔄 AUTO-CAPTURE: Starting auto-capture for angles');
      setAutoCaptureTriggered(true);
      const timer = setTimeout(() => {
        console.log('🔄 AUTO-CAPTURE: Executing captureAngles');
        captureAngles();
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [currentStep]); // Only depend on currentStep

  const startCamera = async () => {
    setCameraLoading(true);
    try {
      // Use front-facing camera for enrollment
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: "user" } // Front camera
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        
        // Wait for video to be ready
        videoRef.current.onloadedmetadata = () => {
          setCameraLoading(false);
        };
      }
    } catch (error) {
      console.error("Camera access failed:", error);
      setCameraLoading(false);
      toast({ title: "Camera Error", description: "Failed to access camera. Please check permissions.", variant: "destructive" });
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
    console.log('🔄 NEXTSTEP: Current step:', currentStep);
    
    // Reset auto-move states when changing steps
    setStableFaceCount(0);
    setAutoMoveCountdown(0);
    setAngleCaptureStarted(false);
    setAngleCaptureProgress(0);
    setAutoCaptureTriggered(false);
    
    switch (currentStep) {
      case "info":
        console.log('🔄 NEXTSTEP: Moving from info to position');
        setCurrentStep("position");
        loadFaceModels().finally(startCamera);
        break;
      case "position":
        console.log('🔄 NEXTSTEP: Moving from position to capture');
        setCurrentStep("capture");
        break;
      case "capture":
        console.log('🔄 NEXTSTEP: Moving from capture to angles');
        setCurrentStep("angles");
        break;
      case "angles":
        console.log('🔄 NEXTSTEP: Moving from angles to review');
        setCurrentStep("review");
        // Stop camera when moving to review step
        stopCamera();
        break;
      case "review":
        console.log('🔄 NEXTSTEP: Moving from review to complete');
        setCurrentStep("complete");
        // Stop camera when moving to complete step
        stopCamera();
        break;
      default:
        console.log('🔄 NEXTSTEP: Unknown current step:', currentStep);
    }
  };

  const captureDescriptor = async () => {
    if (!videoRef.current || isCapturing || descriptorB64) {
      console.log('🔄 CAPTURE: Skipping capture - already captured or in progress');
      return; // Prevent multiple clicks or re-capture
    }
    
    // IMMEDIATE FEEDBACK - Set states instantly
    setIsCapturing(true);
    setCaptureProgress(0);
    
    try {
      console.log('Starting capture process...');
      
      // Show immediate progress
      setCaptureProgress(10);
      await new Promise(resolve => setTimeout(resolve, 100)); // Small delay for visual feedback
      
      setCaptureProgress(20);
      console.log('Loading face models...');
      
      // Ensure models are loaded first
      await loadFaceModels();
      setCaptureProgress(40);
      
      console.log('Calling detectSingleFaceDescriptor...');
      const descriptor = await detectSingleFaceDescriptor(videoRef.current);
      
      if (!descriptor) {
        console.log('No descriptor returned from detection');
        toast({ title: "No face detected", description: "Please center your face and try again", variant: "destructive" });
        setIsCapturing(false);
        setCaptureProgress(0);
        return;
      }
      
      setCaptureProgress(60);
      console.log('Descriptor received, length:', descriptor.length);
      
      // Validate descriptor before conversion
      if (descriptor.length === 0) {
        throw new Error('Invalid descriptor: empty array');
      }
      
      setCaptureProgress(80);
      console.log('Converting to base64...');
      
      let b64;
      try {
        b64 = float32ToBase64Simple(descriptor);
        console.log('Base64 conversion successful');
      } catch (base64Error) {
        console.error('❌ Base64 conversion failed:', base64Error);
        throw base64Error;
      }
      
      if (!b64 || b64.length === 0) {
        throw new Error('Failed to convert descriptor to base64');
      }
      
      setCaptureProgress(90);
      console.log('Setting descriptorB64 state...');
      setDescriptorB64(b64);
      
      setCaptureProgress(100);
      console.log('Capture completed successfully');
      
      // Small delay to show 100% completion
      await new Promise(resolve => setTimeout(resolve, 300));
      
      setIsCapturing(false);
      toast({ title: "Face captured successfully", description: "Reference photo saved" });
      
      // Debug logging
      console.log('🔄 AUTO-MOVING: From capture to angles step in 400ms');
      setTimeout(() => {
        console.log('🔄 AUTO-MOVING: Executing nextStep() now');
        nextStep();
      }, 400);
      
    } catch (e: any) {
      console.error('❌ Capture error:', e);
      toast({ 
        title: "Capture failed", 
        description: e?.message ?? "Unexpected error during face capture",
        variant: "destructive" 
      });
      setIsCapturing(false);
      setCaptureProgress(0);
    }
  };

  // New function for angle capture with proper timing
  const captureAngles = async () => {
    if (!videoRef.current || isCapturing || !faceDetected) {
      console.log('🔄 ANGLES: Skipping angles - no face or already capturing');
      toast({ title: "Face not detected", description: "Please position your face in the oval first", variant: "destructive" });
      return;
    }
    
    setIsCapturing(true);
    setAngleCaptureStarted(true);
    setAngleCaptureProgress(0);
    
    try {
      toast({ title: "Angle Capture Started", description: "Please turn your head slowly left, then right" });
      
      // Give user time to start moving
      setAngleCaptureProgress(20);
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Capture left angle
      setAngleCaptureProgress(40);
      toast({ title: "Turn Left", description: "Slowly turn your head to the left" });
      await new Promise(resolve => setTimeout(resolve, 2000)); // Give time to turn
      
      // Capture right angle  
      setAngleCaptureProgress(70);
      toast({ title: "Turn Right", description: "Slowly turn your head to the right" });
      await new Promise(resolve => setTimeout(resolve, 2000)); // Give time to turn
      
      // Final capture
      setAngleCaptureProgress(90);
      toast({ title: "Center Position", description: "Return to center position" });
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      setAngleCaptureProgress(100);
      setAngleCaptureStarted(false);
      setIsCapturing(false);
      
      toast({ title: "Angles Captured", description: "Face angles captured successfully" });
      
      // Auto-move to next step after 2 seconds
      setTimeout(() => {
        nextStep();
      }, 2000);
      
    } catch (e: any) {
      console.error('❌ Angle capture error:', e);
      toast({ 
        title: "Angle capture failed", 
        description: e?.message ?? "Unexpected error during angle capture",
        variant: "destructive" 
      });
      setIsCapturing(false);
      setAngleCaptureStarted(false);
      setAngleCaptureProgress(0);
    }
  };

  const persistStudentAndEnrollment = useCallback(async () => {
    console.log('🚀 ENROLLMENT: Starting enrollment process...');
    console.log('🚀 ENROLLMENT: classId =', classId);
    console.log('🚀 ENROLLMENT: descriptorB64 =', descriptorB64 ? 'Present' : 'Missing');
    console.log('🚀 ENROLLMENT: user =', user ? 'Present' : 'Missing');
    console.log('🚀 ENROLLMENT: isSaving =', isSaving);
    console.log('🚀 ENROLLMENT: enrollmentCompleted =', enrollmentCompleted);
    
    if (!classId) {
      console.log('❌ ENROLLMENT: No classId, stopping');
      return;
    }
    if (!descriptorB64) {
      console.log('❌ ENROLLMENT: No descriptorB64, stopping');
      return;
    }
    if (!user) {
      console.log('❌ ENROLLMENT: No user, stopping');
      toast({ title: "Authentication Error", description: "Please sign in to enroll students", variant: "destructive" });
      return;
    }
    if (isSaving || enrollmentCompleted) {
      console.log('❌ ENROLLMENT: Already saving or completed, stopping');
      return;
    }
    console.log('✅ ENROLLMENT: All checks passed, proceeding...');
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
      
      if (profileError) {
        throw new Error(`Profile error: ${profileError.message}`);
      }
      
      console.log('Creating student with data:', { student_id: studentId, full_name: studentName, facial_id: descriptorB64.substring(0, 50) + '...' });
      const created: any = await createStudent.mutateAsync({ student_id: studentId, full_name: studentName, facial_id: descriptorB64 });
      console.log('Student created successfully:', created);
      const newStudentId: string = created?.id;
      if (!newStudentId) throw new Error("Student creation failed - no ID returned");
      
      console.log('Enrolling student in class:', { classId, studentId: newStudentId });
      const enrollmentResult = await enrollStudent.mutateAsync({ classId, studentId: newStudentId });
      console.log('Enrollment completed successfully:', enrollmentResult);
      
      // Wait a moment for cache invalidation to complete
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      setEnrollmentCompleted(true);
      toast({ title: "Enrollment complete", description: `${studentName} enrolled successfully` });
      
      // Stop camera immediately after enrollment (double safety)
      stopCamera();
      
      // Clear face detection state
      setFaceDetected(false);
      setFaceQuality('none');
      
      // Force stop camera tracks
      if (videoRef.current?.srcObject) {
        const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
        tracks.forEach(t => t.stop());
        videoRef.current.srcObject = null;
      }
      
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
  }, [classId, createStudent, descriptorB64, enrollStudent, stopCamera, studentId, studentName, toast, user, session]);

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
                  Center your face in the oval and look directly at the camera
                </p>
              </CardHeader>
              <CardContent>
                <div className="relative aspect-square bg-camera-overlay rounded-lg overflow-hidden">
                  {cameraLoading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-muted">
                      <div className="text-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2"></div>
                        <div className="text-sm text-muted-foreground">Loading camera...</div>
                      </div>
                    </div>
                  )}
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className={`w-full h-full object-cover ${cameraLoading ? 'opacity-0' : 'opacity-100'} transition-opacity duration-300`}
                  />
                  
                  {/* Dynamic oval face positioning overlay */}
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="relative">
                      {/* Outer oval guide - VERTICAL orientation (1:1.3 aspect ratio) */}
                      <div className={`w-40 h-52 border-4 rounded-full transition-all duration-300 ${
                        faceDetected 
                          ? 'border-green-500 shadow-lg shadow-green-500/30' 
                          : 'border-red-400 shadow-lg shadow-red-400/30'
                      }`}></div>
                      
                      {/* Inner oval guide - VERTICAL orientation */}
                      <div className={`absolute inset-4 border-2 rounded-full transition-all duration-300 ${
                        faceDetected 
                          ? 'border-green-300' 
                          : 'border-red-300'
                      }`}></div>
                      
                      {/* Center alignment dot */}
                      <div className={`absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-2 h-2 rounded-full transition-all duration-300 ${
                        faceDetected ? 'bg-green-500' : 'bg-red-400'
                      }`}></div>
                      
                      {/* Corner alignment guides */}
                      <div className="absolute -top-2 -left-2 w-4 h-4 border-l-2 border-t-2 border-primary/60 rounded-tl-lg"></div>
                      <div className="absolute -top-2 -right-2 w-4 h-4 border-r-2 border-t-2 border-primary/60 rounded-tr-lg"></div>
                      <div className="absolute -bottom-2 -left-2 w-4 h-4 border-l-2 border-b-2 border-primary/60 rounded-bl-lg"></div>
                      <div className="absolute -bottom-2 -right-2 w-4 h-4 border-r-2 border-b-2 border-primary/60 rounded-br-lg"></div>
                    </div>
                  </div>

                  {/* Dynamic status indicator */}
                  <div className="absolute top-4 left-1/2 transform -translate-x-1/2">
                    <div className={`px-3 py-1 rounded-full text-xs font-medium transition-all duration-300 ${
                      faceDetected 
                        ? 'bg-green-500/90 text-white' 
                        : 'bg-red-400/90 text-white'
                    }`}>
                      {autoMoveCountdown > 0 
                        ? `✓ Moving to next step in ${autoMoveCountdown}...`
                        : faceDetected 
                          ? '✓ Face Detected - Perfect!' 
                          : '⚠️ Position your face in the oval'}
                    </div>
                  </div>

                  {/* Quality indicators */}
                  <div className="absolute bottom-4 left-4 right-4">
                    <div className="flex justify-between text-xs">
                      <div className={`px-2 py-1 rounded ${
                        faceDetected ? 'bg-green-500/20 text-green-600' : 'bg-gray-500/20 text-gray-600'
                      }`}>
                        {faceDetected ? '✓ Face Detected' : 'No Face'}
                      </div>
                      <div className={`px-2 py-1 rounded ${
                        faceQuality === 'good' ? 'bg-green-500/20 text-green-600' : 
                        faceQuality === 'poor' ? 'bg-yellow-500/20 text-yellow-600' : 
                        'bg-gray-500/20 text-gray-600'
                      }`}>
                        {faceQuality === 'good' ? '✓ Good Quality' : 
                         faceQuality === 'poor' ? '⚠️ Poor Quality' : 
                         'Quality Unknown'}
                      </div>
                    </div>
                  </div>
                </div>

                <Button 
                  variant="success" 
                  size="lg" 
                  className="w-full mt-4"
                  onClick={nextStep}
                  disabled={!faceDetected || autoMoveCountdown > 0}
                >
                  <CheckCircle className="w-4 h-4 mr-2" />
                  {autoMoveCountdown > 0 
                    ? `Auto-moving in ${autoMoveCountdown}...` 
                    : faceDetected 
                      ? 'Position Looks Good (Click to skip auto-move)' 
                      : 'Please Position Your Face First'}
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
                  {isCapturing ? "Please wait, do not click again..." : "Hold still while we capture your primary reference photo"}
                </p>
              </CardHeader>
              <CardContent>
                <div className="relative aspect-square bg-camera-overlay rounded-lg overflow-hidden">
                  {cameraLoading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-muted">
                      <div className="text-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2"></div>
                        <div className="text-sm text-muted-foreground">Loading camera...</div>
                      </div>
                    </div>
                  )}
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className={`w-full h-full object-cover ${cameraLoading ? 'opacity-0' : 'opacity-100'} transition-opacity duration-300`}
                  />
                  
                  {/* Capture progress overlay with oval guide */}
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="relative">
                      {/* Oval guide - VERTICAL orientation (1:1.3 aspect ratio) */}
                      <div className={`w-40 h-52 border-4 rounded-full transition-all duration-300 ${
                        isCapturing 
                          ? 'border-blue-500 shadow-lg shadow-blue-500/30' 
                          : faceDetected 
                            ? 'border-green-500 shadow-lg shadow-green-500/30' 
                            : 'border-red-400 shadow-lg shadow-red-400/30'
                      }`}></div>
                      
                      {isCapturing && (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="text-center text-primary-foreground">
                            <div className="text-2xl font-bold">{captureProgress}%</div>
                            <div className="text-xs">
                              {captureProgress < 30 ? "Starting..." :
                               captureProgress < 60 ? "Processing face..." :
                               captureProgress < 90 ? "Generating signature..." :
                               "Almost done..."}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Enhanced progress bar */}
                  {isCapturing && (
                    <div className="absolute bottom-4 left-4 right-4">
                      <div className="bg-background/90 rounded-full h-3 p-1">
                        <div 
                          className="bg-camera-success h-full rounded-full transition-all duration-300 ease-out"
                          style={{ width: `${captureProgress}%` }}
                        ></div>
                      </div>
                      <div className="text-center text-xs text-primary-foreground mt-1">
                        {captureProgress < 30 ? "Initializing capture..." :
                         captureProgress < 60 ? "Detecting face features..." :
                         captureProgress < 90 ? "Creating face signature..." :
                         "Finalizing..."}
                      </div>
                    </div>
                  )}
                </div>

                {/* Auto-capture status */}
                <div className="text-center mt-4">
                  {isCapturing ? (
                    <div className="text-sm text-muted-foreground">
                      ⏳ Capturing reference automatically...
                    </div>
                  ) : (
                    <div className="text-sm text-muted-foreground">
                      📸 Reference will be captured automatically
                    </div>
                  )}
                </div>
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
                  <p><strong>Step 1:</strong> Position your face in the oval</p>
                  <p><strong>Step 2:</strong> Angles will be captured automatically</p>
                  <p><strong>Step 3:</strong> Slowly turn your head left, then right when prompted</p>
                  <p><strong>Step 4:</strong> Auto-moves to next step when complete</p>
                </div>
              </CardHeader>
              <CardContent>
                <div className="relative aspect-square bg-camera-overlay rounded-lg overflow-hidden">
                  {cameraLoading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-muted">
                      <div className="text-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2"></div>
                        <div className="text-sm text-muted-foreground">Loading camera...</div>
                      </div>
                    </div>
                  )}
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className={`w-full h-full object-cover ${cameraLoading ? 'opacity-0' : 'opacity-100'} transition-opacity duration-300`}
                  />
                  
                  {/* Angle guidance with oval guide */}
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="relative">
                      {/* Oval guide - VERTICAL orientation (1:1.3 aspect ratio) */}
                      <div className={`w-40 h-52 border-4 rounded-full transition-all duration-300 ${
                        faceDetected 
                          ? 'border-green-500 shadow-lg shadow-green-500/30' 
                          : 'border-red-400 shadow-lg shadow-red-400/30'
                      }`}></div>
                      
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
                    <div className={`px-3 py-1 rounded-full text-xs font-medium transition-all duration-300 ${
                      faceDetected 
                        ? 'bg-green-500/90 text-white' 
                        : 'bg-red-400/90 text-white'
                    }`}>
                      {faceDetected ? '✓ Face Ready - Turn Head Slowly' : '⚠️ Position your face first'}
                    </div>
                  </div>
                </div>

                <div className="space-y-3 mt-4">
                  {/* Auto-capture angles status */}
                  <div className="text-center">
                    {isCapturing ? (
                      <div className="text-sm text-muted-foreground">
                        ⏳ Capturing angles automatically...
                      </div>
                    ) : (
                      <div className="text-sm text-muted-foreground">
                        📸 Angles will be captured automatically
                      </div>
                    )}
                  </div>
                  
                  {/* Angle capture progress */}
                  {angleCaptureStarted && (
                    <div className="space-y-2">
                      <div className="bg-background/90 rounded-full h-3 p-1">
                        <div 
                          className="bg-primary h-full rounded-full transition-all duration-300 ease-out"
                          style={{ width: `${angleCaptureProgress}%` }}
                        ></div>
                      </div>
                      <div className="text-center text-xs text-muted-foreground">
                        {angleCaptureProgress < 30 ? "Starting angle capture..." :
                         angleCaptureProgress < 50 ? "Turn your head to the left..." :
                         angleCaptureProgress < 80 ? "Turn your head to the right..." :
                         "Return to center position..."}
                      </div>
                    </div>
                  )}
                  
                  {/* Status message for angles page */}
                  {isCapturing && !angleCaptureStarted && (
                    <div className="text-center text-sm text-muted-foreground mt-2">
                      ⏳ Please wait, do not click again...
                    </div>
                  )}
                  
                  {/* Debug button state */}
                  <div className="text-xs text-muted-foreground p-2 bg-muted rounded">
                    Button State: descriptorB64={descriptorB64 ? 'Present' : 'Missing'}, 
                    isCapturing={isCapturing}, isSaving={isSaving}, 
                    enrollmentCompleted={enrollmentCompleted}
                  </div>
                  
                </div>
              </CardContent>
            </Card>
          </div>
        );

      case "review":
        return (
          <div className="max-w-md mx-auto space-y-4">
            <Card className="shadow-medium">
              <CardHeader className="text-center">
                <CardTitle className="flex items-center justify-center gap-2">
                  <CheckCircle className="w-6 h-6" />
                  Review & Complete Enrollment
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  Review the student information and complete the enrollment
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-4 bg-muted rounded-lg">
                  <div className="text-lg font-semibold">{studentName}</div>
                  <div className="text-sm text-muted-foreground">{studentId}</div>
                  <div className="text-xs text-success mt-2">
                    ✓ Face data captured successfully
                  </div>
                </div>

                <div className="space-y-2 text-sm text-muted-foreground">
                  <p>✓ Student information entered</p>
                  <p>✓ Primary face reference captured</p>
                  <p>✓ Additional face angles captured</p>
                  <p>✓ Ready to save to database</p>
                </div>

                <Button 
                  variant="success" 
                  size="lg" 
                  className="w-full"
                  onClick={() => {
                    console.log('🔘 BUTTON: Complete Enrollment clicked!');
                    console.log('🔘 BUTTON: descriptorB64 =', descriptorB64 ? 'Present' : 'Missing');
                    console.log('🔘 BUTTON: isCapturing =', isCapturing);
                    console.log('🔘 BUTTON: isSaving =', isSaving);
                    console.log('🔘 BUTTON: enrollmentCompleted =', enrollmentCompleted);
                    persistStudentAndEnrollment();
                  }}
                  disabled={isCapturing || !descriptorB64 || isSaving || enrollmentCompleted}
                >
                  <CheckCircle className="w-4 h-4 mr-2" />
                  {enrollmentCompleted ? "Enrollment Complete!" : isSaving ? "Saving..." : "Complete Enrollment"}
                </Button>
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
          {(["info", "position", "capture", "angles", "review", "complete"] as EnrollmentStep[]).map((step, index) => {
            const isActive = step === currentStep;
            const isCompleted = (["info", "position", "capture", "angles", "review", "complete"] as EnrollmentStep[]).indexOf(currentStep) > index;
            
            return (
              <div key={step} className="flex items-center">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium ${
                  isActive ? "bg-primary text-primary-foreground" :
                  isCompleted ? "bg-success text-success-foreground" :
                  "bg-muted text-muted-foreground"
                }`}>
                  {isCompleted ? "✓" : index + 1}
                </div>
                {index < 5 && (
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
