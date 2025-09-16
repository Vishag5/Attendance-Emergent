import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ArrowLeft, Camera, Users, CheckCircle, Settings, Eye, EyeOff, UserPlus, UserMinus, List } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { useClassEnrollments } from "@/hooks/useClasses";
import { base64ToFloat32Simple, detectMultipleFaces, findBestMatch, loadFaceModels, preloadFaceModels, DetectedFace } from "@/lib/face";
import { supabase } from "@/integrations/supabase/client";

interface FaceDetection {
  id: string;
  name: string;
  confidence: number;
  accuracy: number;
  position: { x: number; y: number; width: number; height: number };
  isRecognized: boolean;
}

const AttendanceScanner = () => {
  const { classId } = useParams();
  const [isScanning, setIsScanning] = useState(false);
  const [recognizedCount, setRecognizedCount] = useState(0);
  const { data: enrollments } = useClassEnrollments(classId ?? "");
  const totalStudents = enrollments?.length ?? 0;
  const videoRef = useRef<HTMLVideoElement>(null);
  const [recognizedIds, setRecognizedIds] = useState<Set<string>>(new Set());
  const [lastRecognition, setLastRecognition] = useState<Date | null>(null);
  const [recognitionStatus, setRecognitionStatus] = useState<'idle' | 'recognizing' | 'success' | 'failed'>('idle');
  const [debugMode, setDebugMode] = useState(false);
  const [debugLogs, setDebugLogs] = useState<string[]>([]);
  const [detectedFaces, setDetectedFaces] = useState<FaceDetection[]>([]);
  const [userHint, setUserHint] = useState<string>('');
  const [scanningMode, setScanningMode] = useState<'single' | 'classroom'>('classroom');
  const [isMobile, setIsMobile] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  
  // Manual Override States
  const [showManualMode, setShowManualMode] = useState(false);
  const [manualAttendance, setManualAttendance] = useState<Record<string, 'present' | 'absent' | 'unset'>>({});
  const [cameraFallbackMode, setCameraFallbackMode] = useState(false);
  const [currentCameraFacing, setCurrentCameraFacing] = useState<'user' | 'environment'>('environment');

  const addDebugLog = (message: string) => {
    if (debugMode) {
      setDebugLogs(prev => [...prev.slice(-9), `${new Date().toLocaleTimeString()}: ${message}`]);
    }
  };

  const getCameraErrorMessage = (error: any): string => {
    if (error.name === 'NotAllowedError') {
      return 'Camera permission denied. Please allow camera access and refresh the page.';
    } else if (error.name === 'NotFoundError') {
      return 'No camera found. Please connect a camera and try again.';
    } else if (error.name === 'NotSupportedError') {
      return 'Camera not supported. Please use HTTPS or localhost.';
    } else if (error.name === 'NotReadableError') {
      return 'Camera is being used by another application. Please close other apps and try again.';
    } else if (error.message.includes('HTTPS')) {
      return 'HTTPS Required: Camera access requires HTTPS on mobile devices.';
    } else {
      return `Camera error: ${error.message || 'Unknown error'}`;
    }
  };

  const startScanning = async () => {
    setIsScanning(true);
    setCameraError(null);
    setUserHint('Requesting camera permission...');
    
    try {
      // Check if getUserMedia is available
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera not supported on this device');
      }
      
      let stream: MediaStream;
      
      // Enhanced camera fallback sequence
      const cameraConfigs = [
        // Primary: Back camera for classroom scanning
        { 
          video: { 
            facingMode: { exact: currentCameraFacing },
            width: { ideal: 1280, min: 640 },
            height: { ideal: 720, min: 480 }
          }
        },
        // Fallback 1: Any back camera
        { 
          video: { 
            facingMode: currentCameraFacing,
            width: { ideal: 1280 },
            height: { ideal: 720 }
          }
        },
        // Fallback 2: Any camera with good resolution
        { 
          video: { 
            width: { ideal: 1280, min: 640 },
            height: { ideal: 720, min: 480 }
          }
        },
        // Fallback 3: Any available camera
        { video: true }
      ];
      
      let cameraStarted = false;
      let lastError: any;
      
      for (const config of cameraConfigs) {
        try {
          console.log(`Trying camera config:`, config);
          stream = await navigator.mediaDevices.getUserMedia(config);
          cameraStarted = true;
          addDebugLog(`✅ Camera started with facing: ${currentCameraFacing}`);
          break;
        } catch (error: any) {
          console.log(`Camera config failed:`, error.message);
          lastError = error;
          continue;
        }
      }
      
      if (!cameraStarted) {
        throw lastError || new Error('All camera configurations failed');
      }
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setUserHint('Camera ready! Detecting faces...');
        
        // Get actual video track settings for debugging
        const videoTrack = stream.getVideoTracks()[0];
        if (videoTrack) {
          const settings = videoTrack.getSettings();
          addDebugLog(`📹 Camera: ${settings.width}x${settings.height}, facing: ${settings.facingMode || 'unknown'}`);
        }
      }
      
      // Load models in background (non-blocking)
      loadFaceModels().then(() => {
        setUserHint('Face recognition ready! Point camera at students.');
        addDebugLog('🧠 Face recognition models loaded');
      }).catch((error) => {
        setUserHint('Camera ready! Basic detection active...');
        addDebugLog(`⚠️ Model loading failed: ${error.message}`);
        setCameraFallbackMode(true);
      });
      
      // Start detection immediately after camera starts
      setTimeout(() => {
        setUserHint(`Scanning for faces... (${currentCameraFacing} camera)`);
      }, 500);
      
    } catch (error: any) {
      console.error("Camera access failed:", error);
      const errorMsg = getCameraErrorMessage(error);
      setCameraError(errorMsg);
      setUserHint('Camera access failed. Try manual mode or check permissions.');
      addDebugLog(`❌ Camera failed: ${error.message}`);
    }
  };

  const switchCamera = async () => {
    if (isScanning) {
      stopCamera();
      const newFacing = currentCameraFacing === 'environment' ? 'user' : 'environment';
      setCurrentCameraFacing(newFacing);
      setTimeout(() => {
        startScanning();
      }, 500);
    } else {
      setCurrentCameraFacing(currentCameraFacing === 'environment' ? 'user' : 'environment');
    }
  };

  const stopCamera = () => {
    if (videoRef.current?.srcObject) {
      const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
      tracks.forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }
  };

  const toggleManualAttendance = (studentId: string) => {
    setManualAttendance(prev => {
      const current = prev[studentId] || 'unset';
      const next = current === 'unset' ? 'present' : current === 'present' ? 'absent' : 'unset';
      
      // Update recognized IDs based on manual changes
      if (next === 'present' && !recognizedIds.has(studentId)) {
        setRecognizedIds(prev => new Set([...prev, studentId]));
        setRecognizedCount(prev => prev + 1);
      } else if (next !== 'present' && recognizedIds.has(studentId)) {
        setRecognizedIds(prev => {
          const newSet = new Set(prev);
          newSet.delete(studentId);
          return newSet;
        });
        setRecognizedCount(prev => prev - 1);
      }
      
      return { ...prev, [studentId]: next };
    });
  };

  const completeScan = async () => {
    if (!classId) return;
    
    // Stop camera and cleanup
    stopCamera();
    setIsScanning(false);
    
    const today = new Date().toISOString().slice(0,10);
    
    // Combine automatic recognition with manual overrides
    const finalPresentIds = new Set<string>();
    const finalAbsentIds = new Set<string>();
    
    (enrollments ?? []).forEach(enrollment => {
      const studentId = enrollment.students.id;
      const manualStatus = manualAttendance[studentId];
      
      if (manualStatus === 'present' || (manualStatus === 'unset' && recognizedIds.has(studentId))) {
        finalPresentIds.add(studentId);
      } else {
        finalAbsentIds.add(studentId);
      }
    });
    
    const finalPresentCount = finalPresentIds.size;
    const finalAbsentCount = finalAbsentIds.size;
    
    await supabase.from('attendance_sessions').insert({
      class_id: classId,
      teacher_id: (await supabase.auth.getUser()).data.user?.id,
      date: today,
      total_students: totalStudents,
      present_count: finalPresentCount,
      absent_count: finalAbsentCount
    });
    
    if (finalPresentIds.size > 0) {
      await supabase.from('attendance_records').insert(
        Array.from(finalPresentIds).map(student_id => ({ 
          class_id: classId, 
          student_id, 
          date: today, 
          status: 'present' 
        }))
      );
    }
    
    if (finalAbsentIds.size > 0) {
      await supabase.from('attendance_records').insert(
        Array.from(finalAbsentIds).map(student_id => ({ 
          class_id: classId, 
          student_id, 
          date: today, 
          status: 'absent' 
        }))
      );
    }
    
    window.location.href = `/results/${classId}`;
  };

  useEffect(() => {
    let raf = 0;
    let cancelled = false;
    let lastDetectionTime = 0;
    let statusTimeout: NodeJS.Timeout | null = null;

    const known = (enrollments ?? [])
      .filter(e => !!e.students.facial_id)
      .map(e => ({ 
        id: e.students.id, 
        name: e.students.full_name, 
        descriptor: base64ToFloat32Simple(e.students.facial_id as string) 
      }));

    const loop = async () => {
      // Only run when actively scanning
      if (!isScanning || !videoRef.current || cancelled) {
        return;
      }

      // Ultra-fast detection - every 150ms for immediate response
      if (Date.now() - lastDetectionTime < 150) {
        raf = requestAnimationFrame(loop);
        return;
      }
      lastDetectionTime = Date.now();

      try {
        // Clear any existing status timeout
        if (statusTimeout) {
          clearTimeout(statusTimeout);
        }

        // Show detection boxes immediately, then do recognition
        const detectedFaces = await detectMultipleFaces(videoRef.current);
        
        addDebugLog(`🔍 Detection attempt: ${detectedFaces.length} faces found`);
        
        if (detectedFaces.length > 0) {
          // First, show all detected faces as "detecting" with boxes
          const newDetectedFaces: FaceDetection[] = detectedFaces.map((face, index) => ({
            id: `detecting_${index}`,
            name: 'Detecting...',
            confidence: face.score,
            accuracy: 0,
            position: face.box,
            isRecognized: false
          }));
          
          setDetectedFaces(newDetectedFaces);
          setRecognitionStatus('recognizing');
          
          // Then do recognition in background if we have known faces
          if (known.length > 0) {
            let hasNewRecognition = false;
            const recognizedFaces: FaceDetection[] = [];
            let recognizedCount = 0;
            
            // Process all faces for recognition
            for (const face of detectedFaces) {
              const match = findBestMatch(face.descriptor, known, 0.5); // Slightly higher threshold for classroom
              
              if (match) {
                const accuracy = Math.max(0, Math.min(100, (1 - match.distance) * 100));
                const isRecognized = !recognizedIds.has(match.id);
                
                recognizedFaces.push({
                  id: match.id,
                  name: match.name,
                  confidence: face.score,
                  accuracy: accuracy,
                  position: face.box,
                  isRecognized: isRecognized
                });
                
                if (isRecognized) {
                  hasNewRecognition = true;
                  recognizedCount++;
                  addDebugLog(`✅ Recognized: ${match.name} (accuracy: ${accuracy.toFixed(1)}%)`);
                }
              } else {
                recognizedFaces.push({
                  id: `unknown_${Date.now()}_${Math.random()}`,
                  name: 'Unknown',
                  confidence: face.score,
                  accuracy: 0,
                  position: face.box,
                  isRecognized: false
                });
              }
            }
            
            // Update with recognition results
            setDetectedFaces(recognizedFaces);
            
            if (hasNewRecognition) {
              // Add all newly recognized faces at once
              const newRecognizedIds = new Set(recognizedIds);
              recognizedFaces.forEach(face => {
                if (face.isRecognized && !recognizedIds.has(face.id)) {
                  newRecognizedIds.add(face.id);
                }
              });
              setRecognizedIds(newRecognizedIds);
              setRecognizedCount(newRecognizedIds.size);
              
              setRecognitionStatus('success');
              setLastRecognition(new Date());
              setUserHint(`${newRecognizedIds.size}/${totalStudents} students recognized - ${detectedFaces.length} faces detected`);
              
              // Reset status after 2 seconds
              statusTimeout = setTimeout(() => {
                setRecognitionStatus('idle');
              }, 2000);
            } else {
              setRecognitionStatus('idle');
              setUserHint(`${detectedFaces.length} face(s) detected - ${recognizedIds.size}/${totalStudents} recognized`);
            }
          } else {
            setRecognitionStatus('idle');
            setUserHint(`${detectedFaces.length} face(s) detected - No enrolled students`);
          }
        } else {
          setRecognitionStatus('idle');
          setUserHint('No faces detected. Try moving closer or adjusting lighting');
          setDetectedFaces([]);
          addDebugLog('❌ No faces detected in this frame');
        }
      } catch (error) {
        setRecognitionStatus('failed');
        setUserHint('Detection error. Try again...');
        addDebugLog(`❌ Detection error: ${error}`);
        setDetectedFaces([]);
        
        // Reset status after 1 second
        statusTimeout = setTimeout(() => {
          setRecognitionStatus('idle');
        }, 1000);
      }
      
      if (!cancelled && isScanning) {
        raf = requestAnimationFrame(loop);
      }
    };
    
    // Only start the loop if scanning
    if (isScanning) {
      raf = requestAnimationFrame(loop);
    }
    
    return () => { 
      cancelled = true; 
      cancelAnimationFrame(raf);
      if (statusTimeout) {
        clearTimeout(statusTimeout);
      }
    };
  }, [enrollments, isScanning, recognizedIds, totalStudents, recognizedCount, lastRecognition]);

  // Detect mobile and check HTTPS
  useEffect(() => {
    const checkMobile = () => {
      const userAgent = navigator.userAgent || navigator.vendor || (window as any).opera;
      const isMobileDevice = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent.toLowerCase());
      setIsMobile(isMobileDevice);
      
      // Check if HTTPS is required for mobile
      if (isMobileDevice && location.protocol !== 'https:' && location.hostname !== 'localhost') {
        setCameraError('HTTPS Required: Camera access requires HTTPS on mobile devices. Please use https:// or localhost');
      }
    };
    
    checkMobile();
    preloadFaceModels();
  }, []);

  // Cleanup effect for component unmount
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  const getBorderGlow = () => {
    switch (recognitionStatus) {
      case 'success': return 'ring-4 ring-green-400 ring-opacity-75';
      case 'failed': return 'ring-4 ring-red-400 ring-opacity-75';
      case 'recognizing': return 'ring-4 ring-yellow-400 ring-opacity-75';
      default: return '';
    }
  };

  const getStatusColor = () => {
    switch (recognitionStatus) {
      case 'success': return 'text-green-500';
      case 'failed': return 'text-red-500';
      case 'recognizing': return 'text-yellow-500';
      default: return 'text-primary';
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
                Take Attendance
              </h1>
              <p className="text-sm text-primary-foreground/80">Math 101</p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setScanningMode(scanningMode === 'classroom' ? 'single' : 'classroom')}
                className="text-primary-foreground hover:bg-primary-foreground/10"
                title={scanningMode === 'classroom' ? 'Switch to Single Face Mode' : 'Switch to Classroom Mode'}
              >
                <Users className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={switchCamera}
                className="text-primary-foreground hover:bg-primary-foreground/10"
                title={`Switch to ${currentCameraFacing === 'environment' ? 'Front' : 'Back'} Camera`}
              >
                <Camera className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setDebugMode(!debugMode)}
                className="text-primary-foreground hover:bg-primary-foreground/10"
              >
                {debugMode ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowManualMode(true)}
                className="text-primary-foreground hover:bg-primary-foreground/10"
                title="Manual Attendance"
              >
                <List className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content - Full Screen Camera */}
      <main className="flex-1 relative overflow-hidden">
        {!isScanning ? (
          /* Pre-scan Setup */
          <div className="max-w-md mx-auto space-y-6">
            <Card className="shadow-medium">
              <CardHeader className="text-center">
                <CardTitle className="flex items-center justify-center gap-2">
                  <Camera className="w-5 h-5" />
                  Ready to Scan
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="text-center space-y-2">
                  <div className="w-32 h-32 mx-auto border-4 border-dashed border-primary/30 rounded-full flex items-center justify-center">
                    <Camera className="w-12 h-12 text-primary/60" />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Position your camera to scan the classroom
                  </p>
                </div>
                
                <div className="bg-muted/50 p-4 rounded-lg space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span>Total Students:</span>
                    <span className="font-semibold">{totalStudents}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span>Expected Present:</span>
                    <span className="font-semibold text-success">~{Math.floor(totalStudents * 0.85)}</span>
                  </div>
                </div>

                {/* Camera Error Display */}
                {cameraError && (
                  <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4">
                    <div className="text-sm text-destructive font-medium mb-2">Camera Access Issue</div>
                    <div className="text-xs text-destructive/80 mb-3">{cameraError}</div>
                    {cameraError.includes('HTTPS') && (
                      <div className="text-xs text-muted-foreground">
                        <strong>Solution:</strong> Use HTTPS or localhost. For mobile testing, try:
                        <br />• <code>https://192.168.1.5:8080</code>
                        <br />• Or use <code>localhost:8080</code> on your computer
                      </div>
                    )}
                  </div>
                )}

                <Button 
                  variant="camera" 
                  size="lg" 
                  className="w-full"
                  onClick={startScanning}
                  disabled={!!cameraError}
                >
                  <Camera className="w-5 h-5 mr-2" />
                  {cameraError ? 'Fix Camera Issue First' : 'Start Scanning'}
                </Button>
              </CardContent>
            </Card>
          </div>
        ) : (
          /* Active Scanning */
          <div className="max-w-2xl mx-auto space-y-4">
            {/* Camera Viewfinder */}
            <Card className={`shadow-medium overflow-hidden transition-all duration-300 ${getBorderGlow()}`}>
              <div className="relative aspect-[4/3] bg-camera-overlay">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                  style={{ transform: 'translateZ(0)' }} // Force hardware acceleration
                />
                
                {/* Live Status Bar */}
                <div className="absolute top-4 left-4 right-4">
                  <div className="bg-background/95 backdrop-blur-sm px-4 py-2 rounded-lg">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full animate-pulse ${
                          recognitionStatus === 'success' ? 'bg-green-500' :
                          recognitionStatus === 'failed' ? 'bg-red-500' :
                          recognitionStatus === 'recognizing' ? 'bg-yellow-500' :
                          'bg-blue-500'
                        }`}></div>
                        <span className="text-sm font-medium">
                          {scanningMode === 'classroom' ? 'Classroom Scan' : 'Single Face'} - {recognizedCount}/{totalStudents} recognized
                        </span>
                        {detectedFaces.length > 0 && (
                          <span className="text-xs text-muted-foreground">
                            ({detectedFaces.length} faces detected)
                          </span>
                        )}
                      </div>
                      
                      {/* Progress Bar */}
                      <div className="w-20 h-1 bg-muted rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-green-500 transition-all duration-300"
                          style={{ width: `${totalStudents > 0 ? (recognizedCount / totalStudents) * 100 : 0}%` }}
                        ></div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Mobile Instructions */}
                {isMobile && detectedFaces.length === 0 && (
                  <div className="absolute top-20 left-4 right-4 pointer-events-none">
                    <div className="bg-background/90 backdrop-blur-sm px-4 py-3 rounded-lg text-center">
                      <div className="text-sm font-semibold mb-1">Mobile Camera Mode</div>
                      <div className="text-xs text-muted-foreground">
                        {scanningMode === 'classroom' ? 'Point camera at class' : 'Point camera at face'} • Tap to focus
                      </div>
                    </div>
                  </div>
                )}

                {/* Classroom Scanning Instructions - Non-blocking */}
                {!isMobile && scanningMode === 'classroom' && detectedFaces.length === 0 && (
                  <div className="absolute top-20 left-4 right-4 pointer-events-none">
                    <div className="bg-background/90 backdrop-blur-sm px-4 py-3 rounded-lg text-center">
                      <div className="text-sm font-semibold mb-1">Classroom Scanning Mode</div>
                      <div className="text-xs text-muted-foreground">
                        Point camera at class • Multiple faces detected automatically
                      </div>
                    </div>
                  </div>
                )}

                {/* User Hint */}
                {userHint && (
                  <div className="absolute bottom-4 left-4 right-4">
                    <div className="bg-background/95 backdrop-blur-sm px-4 py-2 rounded-lg">
                      <p className="text-sm text-center text-muted-foreground">{userHint}</p>
                    </div>
                  </div>
                )}

                {/* Face Detection Boxes */}
                {detectedFaces.map((face, index) => (
                  <div
                    key={`${face.id}_${index}`}
                    className="absolute"
                    style={{
                      left: `${face.position.x}px`,
                      top: `${face.position.y}px`,
                      width: `${face.position.width}px`,
                      height: `${face.position.height}px`,
                    }}
                  >
                    {/* Face Detection Box - Outline Only */}
                    <div
                      className={`absolute border-2 rounded-lg transition-all duration-200 ${
                        face.isRecognized 
                          ? 'border-green-500' 
                          : face.name === 'Detecting...'
                          ? 'border-blue-500'
                          : face.name === 'Unknown'
                          ? 'border-yellow-500'
                          : 'border-red-500'
                      }`}
                      style={{
                        width: '100%',
                        height: '100%',
                        backgroundColor: 'transparent', // No fill, just outline
                      }}
                    />
                    
                    {/* Name and Accuracy Label */}
                    <div className={`absolute -top-8 left-0 px-2 py-1 rounded-md text-xs font-medium whitespace-nowrap ${
                      face.isRecognized 
                        ? 'bg-green-500 text-white' 
                        : face.name === 'Detecting...'
                        ? 'bg-blue-500 text-white'
                        : face.name === 'Unknown'
                        ? 'bg-yellow-500 text-white'
                        : 'bg-red-500 text-white'
                    }`}>
                      <div className="flex items-center gap-1">
                        <span>{face.name}</span>
                        {face.accuracy > 0 && (
                          <span className="text-xs opacity-90">
                            ({face.accuracy.toFixed(0)}%)
                          </span>
                        )}
                        {face.isRecognized && <span>✅</span>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            {/* Enhanced Stats */}
            <Card className="bg-card/50 backdrop-blur-sm">
              <CardContent className="p-6">
                <div className="grid grid-cols-2 gap-6">
                  <div className="text-center">
                    <div className="text-4xl font-bold text-green-600 mb-1">
                      {recognizedCount}
                    </div>
                    <div className="text-sm font-medium text-muted-foreground">Recognized</div>
                    <div className="w-full h-2 bg-muted rounded-full mt-2 overflow-hidden">
                      <div 
                        className="h-full bg-green-500 transition-all duration-500"
                        style={{ width: `${totalStudents > 0 ? (recognizedCount / totalStudents) * 100 : 0}%` }}
                      ></div>
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-4xl font-bold text-gray-600 mb-1">
                      {totalStudents}
                    </div>
                    <div className="text-sm font-medium text-muted-foreground">Total Students</div>
                    <div className="w-full h-2 bg-muted rounded-full mt-2">
                      <div className="h-full bg-gray-400 w-full"></div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Debug Panel */}
            {debugMode && (
              <Card className="bg-muted/50">
                <CardHeader>
                  <CardTitle className="text-sm">Debug Console</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="bg-black text-green-400 p-3 rounded font-mono text-xs h-32 overflow-y-auto">
                    {debugLogs.map((log, index) => (
                      <div key={index}>{log}</div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Controls */}
            <div className="space-y-3">
              <Button 
                variant="success" 
                size="lg" 
                className="w-full"
                onClick={completeScan}
                disabled={recognizedCount === 0 && Object.values(manualAttendance).filter(s => s === 'present').length === 0}
              >
                <CheckCircle className="w-5 h-5 mr-2" />
                Complete Scan ({recognizedCount} auto + {Object.values(manualAttendance).filter(s => s === 'present').length} manual)
              </Button>
              
              <div className="grid grid-cols-2 gap-3">
                <Button 
                  variant="outline" 
                  onClick={() => setShowManualMode(true)}
                  className="flex-1"
                >
                  <List className="w-4 h-4 mr-2" />
                  Manual Override
                </Button>
                
                <Button 
                  variant="outline" 
                  onClick={() => {
                    stopCamera();
                    setIsScanning(false);
                    setRecognizedCount(0);
                    setRecognizedIds(new Set());
                    setRecognitionStatus('idle');
                    setUserHint('');
                    setDetectedFaces([]);
                    setManualAttendance({});
                  }}
                  className="flex-1"
                >
                  Reset Scan
                </Button>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Manual Attendance Dialog */}
      <Dialog open={showManualMode} onOpenChange={setShowManualMode}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Manual Attendance Override</DialogTitle>
            <DialogDescription>
              Mark students present or absent manually. This overrides automatic detection.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {(enrollments ?? []).map((enrollment) => {
              const studentId = enrollment.students.id;
              const studentName = enrollment.students.full_name;
              const isAutoRecognized = recognizedIds.has(studentId);
              const manualStatus = manualAttendance[studentId] || 'unset';
              const finalStatus = manualStatus !== 'unset' ? manualStatus : (isAutoRecognized ? 'present' : 'absent');
              
              return (
                <div key={studentId} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                  <div className="flex-1">
                    <div className="font-medium text-sm">{studentName}</div>
                    <div className="text-xs text-muted-foreground">
                      {isAutoRecognized && manualStatus === 'unset' && (
                        <Badge variant="outline" className="text-xs mr-2">Auto Detected</Badge>
                      )}
                      {manualStatus !== 'unset' && (
                        <Badge variant="secondary" className="text-xs mr-2">Manual Override</Badge>
                      )}
                      ID: {enrollment.students.student_id}
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <Button
                      variant={finalStatus === 'present' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => toggleManualAttendance(studentId)}
                      className={`w-20 ${finalStatus === 'present' ? 'bg-green-600 hover:bg-green-700' : ''}`}
                    >
                      {finalStatus === 'present' ? (
                        <>
                          <UserPlus className="w-3 h-3 mr-1" />
                          Present
                        </>
                      ) : (
                        <>
                          <UserMinus className="w-3 h-3 mr-1" />
                          {finalStatus === 'absent' ? 'Absent' : 'Unset'}
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
          
          <div className="flex justify-between items-center pt-4 border-t">
            <div className="text-sm text-muted-foreground">
              {Object.values(manualAttendance).filter(s => s === 'present').length + recognizedIds.size - Object.keys(manualAttendance).filter(id => manualAttendance[id] === 'absent' && recognizedIds.has(id)).length}/{totalStudents} Present
            </div>
            <Button onClick={() => setShowManualMode(false)}>
              Done
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AttendanceScanner;