import * as faceapi from 'face-api.js';

export type FaceDescriptor = Float32Array;

let modelsLoaded = false;
let modelLoadingPromise: Promise<void> | null = null;

export async function loadFaceModels(): Promise<void> {
	if (modelsLoaded) return;
	
	// If already loading, return the existing promise
	if (modelLoadingPromise) {
		return modelLoadingPromise;
	}
	
	const MODEL_URL = '/models';
	
	modelLoadingPromise = (async () => {
		try {
			console.log('Loading face models from:', MODEL_URL);
			await Promise.all([
				faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL).catch(err => {
					console.error('Error loading tinyFaceDetector:', err);
					throw err;
				}),
				faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL).catch(err => {
					console.error('Error loading faceLandmark68Net:', err);
					throw err;
				}),
				faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL).catch(err => {
					console.error('Error loading faceRecognitionNet:', err);
					throw err;
				}),
			]);
			modelsLoaded = true;
			console.log('Face models loaded successfully');
		} catch (error) {
			console.error('Failed to load face models:', error);
			modelLoadingPromise = null; // Reset on error so it can be retried
			throw new Error('Failed to load face recognition models. Please check if model files are available.');
		}
	})();
	
	return modelLoadingPromise;
}

// Preload models for faster startup
export function preloadFaceModels(): void {
	if (!modelsLoaded && !modelLoadingPromise) {
		loadFaceModels().catch(console.error);
	}
}

export async function detectSingleFaceDescriptor(
	input: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement,
): Promise<FaceDescriptor | null> {
	try {
		await loadFaceModels();
		console.log('Starting face detection...');
		
		// Check if input is ready
		if (!input) {
			console.log('❌ No input element provided');
			return null;
		}
		
		// For video elements, check if they're ready
		if (input instanceof HTMLVideoElement) {
			if (input.readyState < 2) {
				console.log('❌ Video not ready, waiting...');
				await new Promise(resolve => {
					input.addEventListener('loadeddata', resolve, { once: true });
					setTimeout(resolve, 3000); // 3 second timeout
				});
			}
		}
		
		console.log('🎯 Attempting face detection...');
		
		// Add timeout to prevent hanging
		const detectionPromise = faceapi
			.detectSingleFace(input, new faceapi.TinyFaceDetectorOptions({ 
				inputSize: 224, // Smaller input size for faster processing
				scoreThreshold: 0.5  // Standard threshold
			}))
			.withFaceLandmarks()
			.withFaceDescriptor();
		
		// Add 5 second timeout
		const timeoutPromise = new Promise((_, reject) => 
			setTimeout(() => reject(new Error('Face detection timeout')), 5000)
		);
		
		const detection = await Promise.race([detectionPromise, timeoutPromise]) as any;
		
		if (!detection?.descriptor) {
			console.log('❌ No face detected or no descriptor available');
			return null;
		}
		
		console.log('✅ Face detected successfully!');
		
		// Validate the descriptor
		const descriptor = detection.descriptor;
		console.log('📊 Raw descriptor length:', descriptor.length);
		console.log('📊 Raw descriptor sample:', Array.from(descriptor).slice(0, 5));
		
		// Check for invalid values
		const hasInvalidValues = Array.from(descriptor).some(val => 
			val === null || val === undefined || !isFinite(Number(val)) || isNaN(Number(val))
		);
		
		if (hasInvalidValues) {
			console.warn('⚠️ Descriptor contains invalid values, creating clean version');
			// Create a clean descriptor with only valid values
			const cleanDescriptor = new Float32Array(descriptor.length);
			for (let i = 0; i < descriptor.length; i++) {
				const val = descriptor[i];
				cleanDescriptor[i] = (val === null || val === undefined || !isFinite(Number(val)) || isNaN(Number(val))) ? 0 : Number(val);
			}
			return cleanDescriptor;
		}
		
		console.log('✅ Face detection completed successfully');
		return descriptor;
	} catch (error) {
		console.error('❌ Error in face detection:', error);
		if (error instanceof Error && error.message === 'Face detection timeout') {
			console.log('⏰ Face detection timed out - try again');
		}
		throw error;
	}
}

export interface DetectedFace {
	descriptor: FaceDescriptor;
	box: { x: number; y: number; width: number; height: number };
	score: number;
}

export async function detectMultipleFaces(
	input: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement,
): Promise<DetectedFace[]> {
	try {
		await loadFaceModels();
		
		// Check if input is ready
		if (!input) {
			return [];
		}
		
		// For video elements, minimal wait time
		if (input instanceof HTMLVideoElement) {
			if (input.readyState < 2) {
				await new Promise(resolve => {
					input.addEventListener('loadeddata', resolve, { once: true });
					setTimeout(resolve, 100); // Very short timeout
				});
			}
		}
		
		// Ultra-sensitive detection parameters
		const detectionPromise = faceapi
			.detectAllFaces(input, new faceapi.TinyFaceDetectorOptions({ 
				inputSize: 224, // Balanced input size
				scoreThreshold: 0.05  // Extremely low threshold to catch any face
			}))
			.withFaceLandmarks()
			.withFaceDescriptors();
		
		// Longer timeout for classroom scanning
		const timeoutPromise = new Promise((_, reject) => 
			setTimeout(() => reject(new Error('Face detection timeout')), 1000)
		);
		
		const detections = await Promise.race([detectionPromise, timeoutPromise]) as any[];
		
		if (!detections || detections.length === 0) {
			return [];
		}
		
		// Process detections with classroom-optimized filtering
		const validFaces: DetectedFace[] = [];
		
		for (const detection of detections) {
			if (!detection?.descriptor || !detection?.detection) {
				continue;
			}
			
			const box = detection.detection.box;
			const score = detection.detection.score;
			
			// Classroom-optimized face filtering
			const aspectRatio = box.width / box.height;
			const area = box.width * box.height;
			
			// Ultra-lenient filtering for maximum detection
			const minArea = 200; // Very small minimum for distant faces
			const maxArea = 200000; // Very large maximum for close faces
			
			// Only filter out extremely obvious non-faces
			if (
				aspectRatio < 0.2 || aspectRatio > 5.0 || // Extremely wide or extremely tall
				area < minArea || area > maxArea || // Extremely small or extremely large
				score < 0.05 // Extremely low confidence threshold
			) {
				continue;
			}
			
			// Quick descriptor validation
			const descriptor = detection.descriptor;
			if (descriptor.length === 0) continue;
			
			validFaces.push({
				descriptor,
				box: {
					x: box.x,
					y: box.y,
					width: box.width,
					height: box.height
				},
				score: score
			});
		}
		
		return validFaces;
	} catch (error) {
		// Silent error handling for better performance
		return [];
	}
}

export function computeEuclideanDistance(a: Float32Array, b: Float32Array): number {
	let sum = 0;
	for (let i = 0; i < a.length; i++) {
		const d = a[i] - b[i];
		sum += d * d;
	}
	return Math.sqrt(sum);
}

export function findBestMatch(
	query: Float32Array,
	knowns: { id: string; name: string; descriptor: Float32Array }[],
	threshold = 0.4, // Lower threshold for better recognition
): { id: string; name: string; distance: number } | null {
	console.log(`🔍 Starting face matching with ${knowns.length} enrolled students`);
	console.log(`📏 Using threshold: ${threshold}`);
	
	if (!knowns || knowns.length === 0) {
		console.log('❌ No enrolled students to match against');
		return null;
	}

	let best: { id: string; name: string; distance: number } | null = null;
	
	for (const k of knowns) {
		try {
			const dist = computeEuclideanDistance(query, k.descriptor);
			console.log(`📊 Distance to ${k.name}: ${dist.toFixed(4)}`);
			
			if (best === null || dist < best.distance) {
				best = { id: k.id, name: k.name, distance: dist };
				console.log(`✅ New best match: ${k.name} with distance ${dist.toFixed(4)}`);
			}
		} catch (error) {
			console.error(`❌ Error computing distance for ${k.name}:`, error);
		}
	}
	
	if (!best) {
		console.log('❌ No valid matches found');
		return null;
	}
	
	console.log(`🎯 Final best match: ${best.name} with distance ${best.distance.toFixed(4)}`);
	console.log(`📏 Threshold check: ${best.distance.toFixed(4)} <= ${threshold} ? ${best.distance <= threshold}`);
	
	return best.distance <= threshold ? best : null;
}

export function float32ToBase64(descriptor: Float32Array): string {
  try {
    // Convert Float32Array to regular array, ensuring all values are valid numbers
    const array = Array.from(descriptor).map(val => {
      // Handle all edge cases that could break JSON
      if (val === null || val === undefined || !isFinite(val) || isNaN(val)) {
        console.warn('Invalid value in descriptor:', val);
        return 0;
      }
      // Round to avoid floating point precision issues
      return Math.round(val * 1000000) / 1000000;
    });
    
    console.log('Array length:', array.length);
    console.log('Array sample:', array.slice(0, 10));
    console.log('Array has invalid values:', array.some(val => !isFinite(val) || isNaN(val)));
    
    const jsonString = JSON.stringify(array);
    console.log('JSON string length:', jsonString.length);
    console.log('JSON string sample:', jsonString.substring(0, 100));
    
    return btoa(jsonString);
  } catch (error) {
    console.error('Error converting descriptor to base64:', error);
    console.error('Descriptor:', descriptor);
    throw new Error('Failed to convert face descriptor');
  }
}

// Alternative approach: Use a simpler encoding method that doesn't rely on JSON
export function float32ToBase64Simple(descriptor: Float32Array): string {
  try {
    console.log('Converting descriptor to base64 (simple method)...');
    console.log('Descriptor type:', typeof descriptor);
    console.log('Descriptor constructor:', descriptor.constructor.name);
    console.log('Descriptor length:', descriptor.length);
    console.log('Descriptor buffer length:', descriptor.buffer.byteLength);
    
    // Validate descriptor first
    if (!descriptor || descriptor.length === 0) {
      throw new Error('Invalid descriptor: empty or null');
    }
    
    // Check if descriptor has valid values
    const hasValidValues = Array.from(descriptor).some(val => 
      val !== null && val !== undefined && isFinite(val) && !isNaN(val)
    );
    
    if (!hasValidValues) {
      throw new Error('Invalid descriptor: no valid values found');
    }
    
    // Convert Float32Array to Uint8Array and then to base64
    const bytes = new Uint8Array(descriptor.buffer);
    console.log('Bytes length:', bytes.length);
    
    if (bytes.length === 0) {
      throw new Error('Invalid descriptor: empty buffer');
    }
    
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    
    const result = btoa(binary);
    console.log('Base64 conversion successful, length:', result.length);
    
    if (!result || result.length === 0) {
      throw new Error('Base64 conversion resulted in empty string');
    }
    
    return result;
  } catch (error) {
    console.error('Error in simple base64 conversion:', error);
    console.error('Descriptor details:', {
      type: typeof descriptor,
      constructor: descriptor?.constructor?.name,
      length: descriptor?.length,
      buffer: descriptor?.buffer
    });
    throw new Error('Failed to convert face descriptor');
  }
}

export function base64ToFloat32Simple(b64: string): Float32Array {
  try {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new Float32Array(bytes.buffer);
  } catch (error) {
    console.error('Error in simple base64 decoding:', error);
    throw new Error('Failed to parse face descriptor');
  }
}

export function base64ToFloat32(b64: string): Float32Array {
  try {
    const jsonString = atob(b64);
    const array = JSON.parse(jsonString);
    if (!Array.isArray(array)) {
      throw new Error('Parsed data is not an array');
    }
    return new Float32Array(array);
  } catch (error) {
    console.error('Error converting base64 to descriptor:', error);
    console.error('Base64 string:', b64);
    console.error('Decoded string:', atob(b64));
    throw new Error('Failed to parse face descriptor');
  }
}


