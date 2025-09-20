import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ArrowLeft, Camera, Users, CheckCircle, Settings, Eye, EyeOff, UserPlus, UserMinus, List, FlipHorizontal } from "lucide-react";
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
  nosePosition?: { x: number; y: number };
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
  const [detectedFaces, setDetectedFaces] = useState<FaceDetection[]>([]);
  const [trackedFaces, setTrackedFaces] = useState<Map<string, FaceDetection>>(new Map());
  const [facePositionHistory, setFacePositionHistory] = useState<Map<string, Array<{x: number, y: number, width: number, height: number}>>>(new Map());
  const [performanceStats, setPerformanceStats] = useState({ detectionTime: 0, recognitionTime: 0, frameRate: 0 });
  const [userHint, setUserHint] = useState<string>('');
  const [isMobile, setIsMobile] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  
  // Manual Override States
  const [showManualMode, setShowManualMode] = useState(false);
  const [manualAttendance, setManualAttendance] = useState<Record<string, 'present' | 'absent' | 'unset'>>({});
  const [cameraFallbackMode, setCameraFallbackMode] = useState(false);
  const [currentCameraFacing, setCurrentCameraFacing] = useState<'user' | 'environment'>('environment');
  const [isMirrored, setIsMirrored] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);


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
        }
      }
      
      // Load models in background (non-blocking)
      setUserHint('Loading face recognition models...');
      loadFaceModels().then(() => {
        setUserHint('Face recognition ready! Point camera at students.');
      }).catch((error) => {
        setUserHint('Camera ready! Basic detection active...');
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
    }
  };

  const switchCamera = async () => {
    if (isScanning) {
      stopCamera();
      const newFacing = currentCameraFacing === 'environment' ? 'user' : 'environment';
      setCurrentCameraFacing(newFacing);
      // Reset mirror state when switching to front camera (always mirrored)
      if (newFacing === 'user') {
        setIsMirrored(false); // Front camera is always mirrored, so reset mirror toggle
      }
      // Clear any existing detection state
      setDetectedFaces([]);
      setTrackedFaces(new Map());
      setFacePositionHistory(new Map());
      setRecognitionStatus('idle');
      setTimeout(() => {
        startScanning();
      }, 500);
    } else {
      const newFacing = currentCameraFacing === 'environment' ? 'user' : 'environment';
      setCurrentCameraFacing(newFacing);
      // Reset mirror state when switching to front camera (always mirrored)
      if (newFacing === 'user') {
        setIsMirrored(false); // Front camera is always mirrored, so reset mirror toggle
      }
    }
  };

  const toggleMirror = () => {
    setIsMirrored(!isMirrored);
  };

  // Calculate distance between two face positions for matching
  const calculateFaceDistance = (face1: { x: number; y: number; width: number; height: number }, face2: { x: number; y: number; width: number; height: number }) => {
    const center1 = { x: face1.x + face1.width / 2, y: face1.y + face1.height / 2 };
    const center2 = { x: face2.x + face2.width / 2, y: face2.y + face2.height / 2 };
    return Math.sqrt(Math.pow(center1.x - center2.x, 2) + Math.pow(center1.y - center2.y, 2));
  };

  // Calculate dynamic face bounding box using landmarks and nose center
  const calculateDynamicFaceBox = (originalBox: { x: number; y: number; width: number; height: number }, landmarks?: any) => {
    // Use face width as the primary dimension for dynamic sizing
    const faceWidth = originalBox.width;
    const faceHeight = originalBox.height;
    
    // Calculate nose position (center of face landmarks if available)
    let noseX = originalBox.x + faceWidth / 2;
    let noseY = originalBox.y + faceHeight * 0.4; // Nose is typically at 40% from top
    
    // If landmarks are available, use actual nose position
    if (landmarks && landmarks.nose) {
      noseX = landmarks.nose.x;
      noseY = landmarks.nose.y;
    }
    
    // Dynamic box size based on face width
    const boxWidth = faceWidth * 0.9; // 90% of face width
    const boxHeight = faceHeight * 0.9; // 90% of face height
    
    // Center the box around the nose
    const boxX = noseX - (boxWidth / 2);
    const boxY = noseY - (boxHeight * 0.3); // Position nose at 30% from top of box
    
    return {
      x: Math.max(0, boxX),
      y: Math.max(0, boxY),
      width: boxWidth,
      height: boxHeight,
      noseX: noseX,
      noseY: noseY
    };
  };

  // Smooth face position to prevent jittering
  const smoothFacePosition = (faceId: string, newPosition: { x: number; y: number; width: number; height: number }) => {
    const history = facePositionHistory.get(faceId) || [];
    const maxHistory = 5; // Keep last 5 positions for smoothing
    
    // Add new position to history
    const updatedHistory = [...history, newPosition].slice(-maxHistory);
    setFacePositionHistory(prev => new Map(prev.set(faceId, updatedHistory)));
    
    // Calculate smoothed position
    if (updatedHistory.length === 1) {
      return newPosition; // No smoothing for first position
    }
    
    const avgX = updatedHistory.reduce((sum, pos) => sum + pos.x, 0) / updatedHistory.length;
    const avgY = updatedHistory.reduce((sum, pos) => sum + pos.y, 0) / updatedHistory.length;
    const avgWidth = updatedHistory.reduce((sum, pos) => sum + pos.width, 0) / updatedHistory.length;
    const avgHeight = updatedHistory.reduce((sum, pos) => sum + pos.height, 0) / updatedHistory.length;
    
    return {
      x: avgX,
      y: avgY,
      width: avgWidth,
      height: avgHeight
    };
  };

  // Match new faces with existing tracked faces
  const matchFacesWithTracked = (newFaces: DetectedFace[]): FaceDetection[] => {
    const matchedFaces: FaceDetection[] = [];
    const usedTrackedIds = new Set<string>();
    
    // First, try to match new faces with existing tracked faces
    newFaces.forEach((newFace, index) => {
      let bestMatch: { id: string; distance: number } | null = null;
      
      // Find the closest tracked face
      trackedFaces.forEach((trackedFace, trackedId) => {
        if (usedTrackedIds.has(trackedId)) return;
        
        const distance = calculateFaceDistance(newFace.box, trackedFace.position);
        const maxDistance = Math.min(newFace.box.width, newFace.box.height) * 0.5; // Max 50% of face size
        
        if (distance < maxDistance && (!bestMatch || distance < bestMatch.distance)) {
          bestMatch = { id: trackedId, distance };
        }
      });
      
      if (bestMatch) {
        // Update existing tracked face with precise landmark-based positioning
        const trackedFace = trackedFaces.get(bestMatch.id)!;
        
        // Calculate dynamic bounding box using face landmarks and nose center
        const dynamicBox = calculateDynamicFaceBox(newFace.box, newFace.landmarks);
        
        // Apply smoothing to prevent jittering
        const smoothedPosition = smoothFacePosition(bestMatch.id, {
          x: dynamicBox.x,
          y: dynamicBox.y,
          width: dynamicBox.width,
          height: dynamicBox.height
        });
        
        const updatedFace: FaceDetection = {
          ...trackedFace,
          position: smoothedPosition,
          nosePosition: {
            x: dynamicBox.noseX,
            y: dynamicBox.noseY
          },
          confidence: newFace.score
        };
        
        matchedFaces.push(updatedFace);
        usedTrackedIds.add(bestMatch.id);
      } else {
        // Create new tracked face with precise positioning
        const newId = `face_${Date.now()}_${index}`;
        
        // Calculate dynamic bounding box using face landmarks and nose center
        const dynamicBox = calculateDynamicFaceBox(newFace.box, newFace.landmarks);
        
        // Apply smoothing to prevent jittering
        const smoothedPosition = smoothFacePosition(newId, {
          x: dynamicBox.x,
          y: dynamicBox.y,
          width: dynamicBox.width,
          height: dynamicBox.height
        });
        
        const newTrackedFace: FaceDetection = {
          id: newId,
          name: 'Detecting...',
          confidence: newFace.score,
          accuracy: 0,
          position: smoothedPosition,
          isRecognized: false,
          nosePosition: {
            x: dynamicBox.noseX,
            y: dynamicBox.noseY
          }
        };
        
        matchedFaces.push(newTrackedFace);
      }
    });
    
    return matchedFaces;
  };

  const stopCamera = () => {
    if (videoRef.current?.srcObject) {
      const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
      tracks.forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }
    setDetectedFaces([]);
    setTrackedFaces(new Map());
    setFacePositionHistory(new Map());
    setRecognitionStatus('idle');
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
    
    // Set completing state to show loading
    setIsCompleting(true);
    
    // Stop camera and cleanup
    stopCamera();
    
    const today = new Date().toISOString().slice(0,10);
    
    console.log('🚀 COMPLETE SCAN: Starting attendance completion...');
    console.log('🚀 COMPLETE SCAN: Class ID:', classId);
    console.log('🚀 COMPLETE SCAN: Total students:', totalStudents);
    console.log('🚀 COMPLETE SCAN: Recognized IDs:', Array.from(recognizedIds));
    console.log('🚀 COMPLETE SCAN: Manual attendance:', manualAttendance);
    
    // Combine automatic recognition with manual overrides
    const finalPresentIds = new Set<string>();
    const finalAbsentIds = new Set<string>();
    
    (enrollments ?? []).forEach(enrollment => {
      const studentId = enrollment.students.id;
      const studentName = enrollment.students.full_name;
      const manualStatus = manualAttendance[studentId];
      
      // Determine final status: manual override takes precedence
      if (manualStatus === 'present') {
        finalPresentIds.add(studentId);
        console.log(`✅ MANUAL PRESENT: ${studentName} (${studentId})`);
      } else if (manualStatus === 'absent') {
        finalAbsentIds.add(studentId);
        console.log(`❌ MANUAL ABSENT: ${studentName} (${studentId})`);
      } else if (recognizedIds.has(studentId)) {
        // Auto-recognized as present
        finalPresentIds.add(studentId);
        console.log(`✅ AUTO PRESENT: ${studentName} (${studentId})`);
      } else {
        // Not recognized and no manual override = absent
        finalAbsentIds.add(studentId);
        console.log(`❌ AUTO ABSENT: ${studentName} (${studentId})`);
      }
    });
    
    const finalPresentCount = finalPresentIds.size;
    const finalAbsentCount = finalAbsentIds.size;
    
    console.log('📊 FINAL COUNTS - Present:', finalPresentCount, 'Absent:', finalAbsentCount);
    
    try {
      // First, delete any existing session for today to avoid conflicts
      console.log('🗑️ Cleaning up existing attendance session for today...');
      const { error: deleteSessionError } = await supabase
        .from('attendance_sessions')
        .delete()
        .eq('class_id', classId)
        .eq('date', today);
      
      if (deleteSessionError) {
        console.error('❌ Delete existing session error:', deleteSessionError);
        throw deleteSessionError;
      }
      console.log('✅ Existing session cleaned up');
      
      // Insert attendance session
      const { error: sessionError } = await supabase.from('attendance_sessions').insert({
      class_id: classId,
      teacher_id: (await supabase.auth.getUser()).data.user?.id,
      date: today,
      total_students: totalStudents,
      present_count: finalPresentCount,
      absent_count: finalAbsentCount
    });
    
      if (sessionError) {
        console.error('❌ Session insert error:', sessionError);
        throw sessionError;
      }
      console.log('✅ Attendance session created');
      
      // First, delete any existing records for today to avoid conflicts
      console.log('🗑️ Cleaning up existing attendance records for today...');
      const { error: deleteError } = await supabase
        .from('attendance_records')
        .delete()
        .eq('class_id', classId)
        .eq('date', today);
      
      if (deleteError) {
        console.error('❌ Delete existing records error:', deleteError);
        throw deleteError;
      }
      console.log('✅ Existing records cleaned up');
      
      // Insert present records
    if (finalPresentIds.size > 0) {
        const presentRecords = Array.from(finalPresentIds).map(student_id => ({ 
          class_id: classId, 
          student_id, 
          date: today, 
          status: 'present' 
        }));
        
        console.log('📝 Inserting present records:', presentRecords);
        const { error: presentError } = await supabase.from('attendance_records').insert(presentRecords);
        
        if (presentError) {
          console.error('❌ Present records insert error:', presentError);
          throw presentError;
        }
        console.log('✅ Present records inserted');
      }
      
      // Insert absent records
    if (finalAbsentIds.size > 0) {
        const absentRecords = Array.from(finalAbsentIds).map(student_id => ({ 
          class_id: classId, 
          student_id, 
          date: today, 
          status: 'absent' 
        }));
        
        console.log('📝 Inserting absent records:', absentRecords);
        const { error: absentError } = await supabase.from('attendance_records').insert(absentRecords);
        
        if (absentError) {
          console.error('❌ Absent records insert error:', absentError);
          throw absentError;
        }
        console.log('✅ Absent records inserted');
      }
      
      console.log('🎉 Attendance completion successful! Redirecting to results...');
    window.location.href = `/results/${classId}`;
      
    } catch (error: any) {
      console.error('❌ Attendance completion failed:', error);
      
      let errorMessage = 'Failed to save attendance. Please try again.';
      
      if (error?.code === '23505') {
        errorMessage = 'Attendance already recorded for today. Please refresh and try again.';
      } else if (error?.message) {
        errorMessage = `Error: ${error.message}`;
      }
      
      alert(errorMessage);
      setIsCompleting(false);
    }
  };

  useEffect(() => {
    let raf = 0;
    let cancelled = false;
    let lastDetectionTime = 0;
    let lastRecognitionTime = 0;
    let statusTimeout: NodeJS.Timeout | null = null;
    let frameCount = 0;
    let errorCount = 0;
    const maxErrors = 5;

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
        console.log('❌ Loop stopped - isScanning:', isScanning, 'videoRef:', !!videoRef.current, 'cancelled:', cancelled);
        return;
      }

      frameCount++;
      
      // Face detection every 2 frames (60fps -> 30fps detection) for speed
      const shouldDetect = frameCount % 2 === 0;
      
      // Recognition only every 8 frames (60fps -> 7.5fps recognition) for speed
      const shouldRecognize = frameCount % 8 === 0;
      
      console.log(`🔄 Frame ${frameCount} - shouldDetect: ${shouldDetect}, shouldRecognize: ${shouldRecognize}`);
      
      // Always continue the loop, but only process when needed
      raf = requestAnimationFrame(loop);
      
      if (!shouldDetect) {
        return;
      }
      
      lastDetectionTime = Date.now();

      try {
        // Clear any existing status timeout
        if (statusTimeout) {
          clearTimeout(statusTimeout);
        }

        // Detect faces and match with existing tracked faces
        const detectionStart = performance.now();
        let detectedFaces: DetectedFace[] = [];
        
        // Check if video is ready and has dimensions
        if (!videoRef.current || videoRef.current.readyState < 2) {
          console.log('❌ Video not ready for detection');
          return;
        }
        
        const video = videoRef.current;
        console.log('🎥 Video state:', {
          readyState: video.readyState,
          videoWidth: video.videoWidth,
          videoHeight: video.videoHeight,
          currentTime: video.currentTime,
          paused: video.paused
        });
        
        try {
          detectedFaces = await detectMultipleFaces(video);
        } catch (error) {
          console.warn('Face detection error, continuing without detection:', error);
          detectedFaces = [];
        }
        
        const detectionTime = performance.now() - detectionStart;
        
        // Debug logging
        console.log(`🔍 Detection: ${detectedFaces.length} faces found in ${detectionTime.toFixed(1)}ms`);
        console.log('🔍 Detected faces:', detectedFaces);
        
        // Reset error count on successful detection
        errorCount = 0;
        
        if (detectedFaces.length > 0) {
          // Filter out very small faces (less than 20px) for speed
          const validFaces = detectedFaces.filter(face => 
            face.box.width > 20 && face.box.height > 20
          );
          
          if (validFaces.length === 0) {
            return;
          }
          
          // Use face tracking to maintain stable face IDs
          const matchedFaces = matchFacesWithTracked(validFaces);
          
          // Debug logging
          if (process.env.NODE_ENV === 'development') {
            console.log(`📊 Tracking: ${matchedFaces.length} tracked faces`);
          }
          
          // Update tracked faces map
          const newTrackedFaces = new Map<string, FaceDetection>();
          matchedFaces.forEach(face => {
            newTrackedFaces.set(face.id, face);
          });
          setTrackedFaces(newTrackedFaces);
          
          // Don't show bounding boxes until recognition is complete
          // Just show face count feedback
          setUserHint(`${validFaces.length} face(s) detected - Processing recognition...`);
          setRecognitionStatus('recognizing');
          
          // Only do recognition every 10 frames for performance
          if (shouldRecognize && known.length > 0) {
            console.log('🔍 Starting recognition with', known.length, 'enrolled students');
            const recognitionStart = performance.now();
            let hasNewRecognition = false;
            const recognizedFaces: FaceDetection[] = [];
            
            // Process only new faces for recognition (not every frame)
            for (let i = 0; i < validFaces.length; i++) {
              const face = validFaces[i];
              const trackedFace = matchedFaces[i];
              
              // Only recognize if this face hasn't been recognized yet
              if (trackedFace && !trackedFace.isRecognized) {
                console.log('🔍 Attempting recognition for face', i);
                const match = findBestMatch(face.descriptor, known, 0.5);
                console.log('🔍 Match result:', match);
                
                if (match) {
                  const accuracy = Math.max(0, Math.min(100, (1 - match.distance) * 100));
                  const isRecognized = !recognizedIds.has(match.id);
                  
                  console.log('✅ Recognized:', match.name, 'with accuracy:', accuracy);
                  
                  // Update the tracked face with recognition results
                  trackedFace.id = match.id;
                  trackedFace.name = match.name;
                  trackedFace.accuracy = accuracy;
                  trackedFace.isRecognized = isRecognized;
                  
                  if (isRecognized) {
                    hasNewRecognition = true;
                  }
                } else {
                  console.log('❌ No match found for face', i);
                }
                // Don't add unrecognized faces to the display
              }
              
              // Only add recognized faces to the display
              if (trackedFace && trackedFace.isRecognized) {
                recognizedFaces.push(trackedFace);
              }
            }
            
            // Update with recognition results
            setDetectedFaces(recognizedFaces);
            
            // Update performance stats
            const recognitionTime = performance.now() - recognitionStart;
            setPerformanceStats(prev => ({
              detectionTime: detectionTime,
              recognitionTime: recognitionTime,
              frameRate: Math.round(1000 / (Date.now() - lastDetectionTime))
            }));
            
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
              setUserHint(`${recognizedIds.size}/${totalStudents} students recognized`);
            }
          } else {
            setRecognitionStatus('idle');
            setUserHint('No enrolled students to recognize');
          }
        } else {
          setRecognitionStatus('idle');
          setUserHint('No faces detected. Try moving closer or adjusting lighting');
          setDetectedFaces([]);
        }
      } catch (error) {
        console.error('Face detection error:', error);
        errorCount++;
        
        if (errorCount >= maxErrors) {
          console.error('Too many detection errors, stopping loop');
          setRecognitionStatus('failed');
          setUserHint('Detection failed. Please refresh the page.');
          setDetectedFaces([]);
          cancelled = true;
          return;
        }
        
        setRecognitionStatus('failed');
        setUserHint('Detection error. Try again...');
        setDetectedFaces([]);
        
        // Reset status after 1 second
        statusTimeout = setTimeout(() => {
          setRecognitionStatus('idle');
        }, 1000);
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
      // Reset error count on cleanup
      errorCount = 0;
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
    <div className="min-h-screen bg-background flex flex-col">
      {/* Minimal Header - Back Button Only */}
      <div className="absolute top-2 left-2 z-20">
        <Button variant="ghost" size="sm" asChild className="text-white hover:bg-white/20 h-8 w-8 p-0">
              <Link to="/">
                <ArrowLeft className="w-4 h-4" />
              </Link>
            </Button>
            </div>

      {/* Main Content - Full Screen Camera */}
      <main className="flex-1 relative overflow-hidden">
        {isCompleting ? (
          /* Completing State */
          <div className="min-h-screen bg-background flex items-center justify-center">
            <div className="text-center space-y-4">
              <div className="w-16 h-16 mx-auto border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
              <h2 className="text-xl font-semibold">Saving Attendance...</h2>
              <p className="text-muted-foreground">Please wait while we process the results</p>
            </div>
          </div>
        ) : !isScanning ? (
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
                    Position your camera at the center of the classroom to scan all students
                  </p>
                </div>
                
                <div className="bg-muted/50 p-4 rounded-lg space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span>Total Students:</span>
                    <span className="font-semibold">{totalStudents}</span>
                  </div>
                  <div className="text-xs text-muted-foreground pt-2 border-t border-border/50">
                    <p><strong>📷 Camera Setup Tips:</strong></p>
                    <p>• Position camera at the center of the classroom</p>
                    <p>• Ensure good lighting on students' faces</p>
                    <p>• Keep camera steady and at eye level</p>
                    <p>• Students should face the camera directly</p>
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
                
                {/* Button explanations */}
                <div className="text-xs text-muted-foreground space-y-1 pt-2">
                  <p><strong>🔧 Available Controls (after starting):</strong></p>
                  <p>• <strong>📷 Camera:</strong> Switch between front/back camera</p>
                  <p>• <strong>📋 List:</strong> Manual attendance override if needed</p>
                </div>
              </CardContent>
            </Card>
          </div>
        ) : (
          /* Full Screen Camera View */
          <div className="absolute inset-0 bg-black">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
              style={{
                transform: currentCameraFacing === 'user' ? 'scaleX(-1)' : (isMirrored ? 'scaleX(-1)' : 'none'),
              }}
            />
            
            {/* Minimal Mobile-Friendly Overlay */}
            <div className="absolute top-0 left-0 right-0 z-10">
              {/* Compact Status Bar */}
              <div className="flex items-center justify-between p-2 text-white">
                <div className="flex items-center gap-2">
                  {recognitionStatus === 'recognizing' && (
                      <div className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse"></div>
                  )}
                  {recognitionStatus === 'success' && (
                      <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                  )}
                </div>
                
                {/* Essential Controls Only */}
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={switchCamera}
                    className="text-white hover:bg-white/20 h-8 w-8 p-0"
                    title={`Switch to ${currentCameraFacing === 'environment' ? 'Front Camera (Selfie - Mirrored)' : 'Back Camera (Classroom - Non-Mirrored)'}`}
                  >
                    <Camera className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={toggleMirror}
                    disabled={currentCameraFacing === 'user'}
                    className={`text-white hover:bg-white/20 h-8 w-8 p-0 ${currentCameraFacing === 'user' ? 'opacity-50' : ''}`}
                    title={currentCameraFacing === 'user' ? 'Mirror mode locked for front camera' : (isMirrored ? 'Disable Mirror' : 'Enable Mirror')}
                  >
                    <FlipHorizontal className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowManualMode(true)}
                    className="text-white hover:bg-white/20 h-8 w-8 p-0"
                    title="Manual Override"
                  >
                    <List className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>


 {/* Face Detection Boxes - Precise tracking with smoothing */}
            {detectedFaces.map((face, index) => (
  <div key={face.id || index}>
    {/* Face Box - Precise size with smooth tracking */}
    <div
      className={`absolute border-2 rounded-lg shadow-lg transition-all duration-300 ${
        face.isRecognized 
          ? 'border-green-500 bg-green-500/10' 
          : 'border-yellow-400 bg-yellow-400/10'
      }`}
                style={{
                  left: `${face.position.x}px`,
                  top: `${face.position.y}px`,
                  width: `${face.position.width}px`,
                  height: `${face.position.height}px`,
                }}
              >
      {/* Nose Center Reference Point */}
      {face.nosePosition && (
        <div 
          className="absolute w-1.5 h-1.5 bg-red-500 rounded-full shadow-sm"
          style={{
            left: `${face.nosePosition.x - face.position.x - 3}px`,
            top: `${face.nosePosition.y - face.position.y - 3}px`,
          }}
        />
      )}
      
      {/* Name Label with better positioning */}
      <div className={`absolute -top-8 left-0 px-2 py-1 rounded text-xs font-medium shadow-sm ${
        face.isRecognized 
          ? 'bg-green-500 text-white' 
          : 'bg-yellow-400 text-black'
      }`}>
        {face.name || 'Unknown'}
        {face.accuracy > 0 && (
          <span className="ml-1 text-xs opacity-75">
            ({Math.round(face.accuracy)}%)
          </span>
        )}
      </div>
                </div>
              </div>
            ))}

            {/* Error Messages */}
            {cameraError && (
              <div className="absolute top-20 left-4 right-4 bg-red-500/90 text-white p-3 rounded-lg">
                <p className="text-sm text-center font-medium">{cameraError}</p>
              </div>
            )}

            {/* Helpful Hints */}
            {userHint && !cameraError && (
              <div className="absolute top-20 left-4 right-4 bg-transparent text-white p-3 rounded-lg">
                <p className="text-sm text-center">{userHint}</p>
              </div>
            )}

            {/* Bottom Controls - Landscape Optimized */}
            <div className="absolute bottom-0 left-0 right-0">
              <div className="p-3">
                <div className="flex gap-2">
                  <Button 
                    variant="outline" 
                    size="lg"
                    onClick={() => setShowManualMode(true)}
                    className="flex-1 bg-transparent border-white/30 text-white hover:bg-white/10 text-sm py-3"
                  >
                    <List className="w-4 h-4 mr-2" />
                    Manual Override
                  </Button>
                  
                  <Button 
                    variant="success" 
                    size="lg" 
                    className="flex-1 bg-green-600/90 border-green-500 text-white hover:bg-green-600 disabled:opacity-50 text-sm py-3"
                    onClick={completeScan}
                    disabled={recognizedCount === 0 && Object.values(manualAttendance).filter(s => s === 'present').length === 0}
                  >
                    <CheckCircle className="w-4 h-4 mr-2" />
                    Complete Scan ({recognizedCount} auto + {Object.values(manualAttendance).filter(s => s === 'present').length} manual)
                  </Button>
                </div>
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
