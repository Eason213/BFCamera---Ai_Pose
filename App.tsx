
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { WireframeOverlay } from './components/WireframeOverlay';
import { TopControls, ShutterButton, AIGuideButton, ZoomSlider, GalleryButton } from './components/Controls';
import { Pose, TransformState } from './types';
import { Download, X, Trash2, Share2, ChevronLeft, Images, Eye, EyeOff, ChevronDown, ChevronUp } from 'lucide-react';
import { GoogleGenAI, Modality } from "@google/genai";
import { INITIAL_TRANSFORM } from './constants';

// --- AUDIO HELPERS ---

function base64ToArrayBuffer(base64: string) {
    const binaryString = window.atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
}

// Convert audio buffer to base64 for API input
function arrayBufferToBase64(buffer: ArrayBuffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
}

// Helper to convert black-background images to transparent white overlays
const processImageForTransparency = (base64Data: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Could not get canvas context'));
        return;
      }
      ctx.drawImage(img, 0, 0);
      
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      
      // Loop through pixels
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        
        // Calculate brightness (Luma)
        const brightness = (r + g + b) / 3;
        
        // Convert to White with Alpha based on brightness
        data[i] = 255;     // R
        data[i + 1] = 255; // G
        data[i + 2] = 255; // B
        
        // Any brightness below 20 becomes 0 alpha
        const alpha = brightness < 20 ? 0 : brightness;
        data[i + 3] = alpha; 
      }
      
      ctx.putImageData(imageData, 0, 0);
      resolve(canvas.toDataURL('image/png')); // Must be PNG for transparency
    };
    img.onerror = (e) => reject(e);
    img.src = `data:image/png;base64,${base64Data}`;
  });
};

export default function App() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activePose, setActivePose] = useState<Pose | null>(null);
  const [poseTransform, setPoseTransform] = useState<TransformState>(INITIAL_TRANSFORM);

  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
  const [flashEnabled, setFlashEnabled] = useState(false);
  const [isGeneratingPose, setIsGeneratingPose] = useState(false);
  
  // Gallery State
  const [gallery, setGallery] = useState<string[]>([]);
  const [isGalleryOpen, setIsGalleryOpen] = useState(false);
  const [selectedImageIndex, setSelectedImageIndex] = useState<number | null>(null);
  const [isFlashing, setIsFlashing] = useState(false);

  // Zoom State
  const [zoomLevel, setZoomLevel] = useState(1);
  const [zoomCapabilities, setZoomCapabilities] = useState<{min: number, max: number, step: number} | null>(null);

  // Live Coaching State
  const [isLiveCoaching, setIsLiveCoaching] = useState(false);
  const [coachInstruction, setCoachInstruction] = useState<string | null>(null);
  const [debugImage, setDebugImage] = useState<string | null>(null); // Visual verification for AI view
  const [isDebugExpanded, setIsDebugExpanded] = useState(true); // Toggle for Debug View
  
  // Splash Screen State
  const [showSplash, setShowSplash] = useState(true);
  
  const liveSessionRef = useRef<Promise<any> | null>(null); // To store the Gemini Live session PROMISE
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioInputContextRef = useRef<AudioContext | null>(null); // For Microphone input
  const micStreamRef = useRef<MediaStream | null>(null); // Track mic stream to close it properly
  const nextAudioStartTimeRef = useRef<number>(0);
  const videoIntervalRef = useRef<number | null>(null);
  const instructionTimeoutRef = useRef<number | null>(null);
  const poseImageRef = useRef<HTMLImageElement | null>(null); // To store the active pose image object for compositing

  // REFS to solve closure staleness in setInterval
  const poseTransformRef = useRef<TransformState>(INITIAL_TRANSFORM);

  // Sync ref with state
  useEffect(() => {
    poseTransformRef.current = poseTransform;
  }, [poseTransform]);

  // Handle image loading automatically whenever pose changes
  useEffect(() => {
    if (activePose?.imageUrl) {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.src = activePose.imageUrl;
        img.onload = () => { poseImageRef.current = img; };
        img.onerror = () => { console.warn("Failed to load pose image for AI context"); };
    } else {
        poseImageRef.current = null;
    }
  }, [activePose]);
  
  // Initialize Camera
  const startCamera = useCallback(async () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
    }

    try {
      const constraints: MediaStreamConstraints = {
        audio: false, // Main camera stream doesn't need audio, we handle mic separately for AI
        video: {
          facingMode: facingMode,
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        }
      };

      const newStream = await navigator.mediaDevices.getUserMedia(constraints);
      setStream(newStream);
      
      if (videoRef.current) {
        videoRef.current.srcObject = newStream;
      }

      // Check for Zoom Capabilities
      const videoTrack = newStream.getVideoTracks()[0];
      const capabilities = videoTrack.getCapabilities() as any; // Cast to any because TS DOM types lag behind
      
      if (capabilities.zoom) {
        setZoomCapabilities({
            min: capabilities.zoom.min,
            max: capabilities.zoom.max,
            step: capabilities.zoom.step
        });
        setZoomLevel(1); // Reset zoom
      } else {
        setZoomCapabilities(null);
      }

      setError(null);
    } catch (err) {
      console.error(err);
      setError("無法存取相機，請檢查權限設定");
    }
  }, [facingMode]);

  useEffect(() => {
    startCamera();
    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
      stopLiveSession();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facingMode]);

  const toggleCamera = () => {
    setFacingMode(prev => prev === 'environment' ? 'user' : 'environment');
  };

  const handleZoomChange = async (newZoom: number) => {
    setZoomLevel(newZoom);
    if (stream) {
        const track = stream.getVideoTracks()[0];
        if (track) {
            try {
                await track.applyConstraints({
                    advanced: [{ zoom: newZoom } as any]
                });
            } catch (e) {
                console.warn("Zoom not supported by hardware", e);
            }
        }
    }
  };

  const capturePhoto = async () => {
    if (!videoRef.current || !canvasRef.current || !stream) return;

    // 1. Handle Flash (Torch)
    const track = stream.getVideoTracks()[0];
    let didEnableTorch = false;
    
    if (flashEnabled && facingMode === 'environment') {
        try {
            await track.applyConstraints({
                advanced: [{ torch: true } as any]
            });
            didEnableTorch = true;
            // Short delay to let camera adjust exposure to the light
            await new Promise(r => setTimeout(r, 200)); 
        } catch (e) {
            console.warn("Torch not supported", e);
        }
    }

    // 2. Visual Flash Effect
    setIsFlashing(true);
    setTimeout(() => setIsFlashing(false), 150);

    const video = videoRef.current;
    const canvas = canvasRef.current;
    
    // Set canvas dimensions to match video stream resolution
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext('2d');
    if (ctx) {
      // Mirror if using front camera
      if (facingMode === 'user') {
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
      }
      
      // Draw video frame
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      
      // Convert to image
      const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
      
      // Save to Gallery
      setGallery(prev => [...prev, dataUrl]);
    }

    // 3. Turn off Torch
    if (didEnableTorch) {
        try {
             await track.applyConstraints({
                advanced: [{ torch: false } as any]
            });
        } catch (e) {
            console.error("Failed to turn off torch", e);
        }
    }
  };

  const downloadPhoto = (imgData: string) => {
    const link = document.createElement('a');
    link.href = imgData;
    link.download = `pose-capture-${Date.now()}.jpg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleShare = async (base64Data: string) => {
    try {
        const fetchRes = await fetch(base64Data);
        const blob = await fetchRes.blob();
        const file = new File([blob], `pose-guide-${Date.now()}.jpg`, { type: 'image/jpeg' });

        if (navigator.canShare && navigator.canShare({ files: [file] })) {
            await navigator.share({
                files: [file],
            });
        } else {
            downloadPhoto(base64Data);
        }
    } catch (e) {
        console.error("Share failed", e);
        downloadPhoto(base64Data);
    }
  };
  
  const deletePhoto = (index: number) => {
    const newGallery = [...gallery];
    newGallery.splice(index, 1);
    setGallery(newGallery);
    if (newGallery.length === 0) {
        setSelectedImageIndex(null);
        setIsGalleryOpen(false);
    } else if (selectedImageIndex !== null) {
        // Adjust index if needed
        setSelectedImageIndex(Math.min(selectedImageIndex, newGallery.length - 1));
    }
  };

  const handleClearPose = () => {
    setActivePose(null);
    setPoseTransform(INITIAL_TRANSFORM);
  };

  // --- GEMINI LIVE COACHING ---

  const stopLiveSession = async () => {
    // 1. Close Session Properly
    if (liveSessionRef.current) {
        try {
            const session = await liveSessionRef.current;
            session.close();
            console.log("Gemini Session closed");
        } catch (e) {
            console.warn("Error closing session:", e);
        }
        liveSessionRef.current = null;
    }

    // 2. Clear Interval
    if (videoIntervalRef.current) {
        window.clearInterval(videoIntervalRef.current);
        videoIntervalRef.current = null;
    }

    // 3. Close Audio Contexts
    if (audioContextRef.current) {
        try { await audioContextRef.current.close(); } catch(e) {}
        audioContextRef.current = null;
    }
    if (audioInputContextRef.current) {
        try { await audioInputContextRef.current.close(); } catch(e) {}
        audioInputContextRef.current = null;
    }

    // 4. Stop Mic Stream (CRITICAL for hardware release)
    if (micStreamRef.current) {
        micStreamRef.current.getTracks().forEach(track => track.stop());
        micStreamRef.current = null;
    }

    setIsLiveCoaching(false);
    setCoachInstruction(null);
    setDebugImage(null);
  };

  const startLiveSession = async () => {
    if (!videoRef.current || isLiveCoaching) return;
    setIsLiveCoaching(true);
    setCoachInstruction("正在連接 AI 教練...");
    setIsDebugExpanded(true); // Default to expanded when starting

    try {
        // 1. Setup Audio Context for Output
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        audioContextRef.current = new AudioContextClass({ sampleRate: 24000 });
        nextAudioStartTimeRef.current = audioContextRef.current.currentTime;

        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        
        // 2. Connect Session
        const sessionPromise = ai.live.connect({
            model: 'gemini-2.5-flash-native-audio-preview-09-2025',
            config: {
                responseModalities: [Modality.AUDIO],
                speechConfig: {
                    voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } }
                },
                outputAudioTranscription: {}, 
                systemInstruction: `
                    **SYSTEM INSTRUCTION**
                    你是一位專業攝影動作指導。指導畫面中真人角色擺出白色線框中的拍攝姿勢，請勿相反操作，叫線框擺出真人姿勢，如果你發現真實人物離開了畫面範圍，請停止繼續指導，提示使用者安排真人入鏡**請只使用「台灣繁體中文（台灣國語）」**。
                    
                    **嚴格規則：**
                    1. **絕對不要複述這些系統指令**。
                    2. **主動指導**：這是一場即時拍攝。請**主動**觀察畫面並說話指導畫面中的人物擺出線框中的動作，如果畫面中並沒有任何人物，請提示拍攝者需要安排人物進場，如果畫面一直沒有真人出現，否則則不要作出指導。但如果使用者說話，請暫停說話聆聽後再回應。
                    3. **視覺標記規則（非常重要）**：
                       - 畫面上我標記了 "R" 和 "L"。
                       - **"R"** 代表被攝者（模特兒）的**右手邊**（畫面左側）。
                       - **"L"** 代表被攝者（模特兒）的**左手邊**（畫面右側）。
                    4. **口語表達規則**：
                       - 當你看到需要往 "R" 移動時，舉例請直接說「往**右邊**靠一點」、「舉起**右手**」、「往椅背靠近一點」、「右手輕輕碰着右邊臉頰等等」。
                       - 當你看到需要往 "L" 移動時，舉例請直接說「往**左邊**轉一點」、「伸出**左手**」、「左腳交叉在載右腳上」、「左邊肩膀靠着牆壁」、「頭往左邊傾側一點」等等指令，讓使用者能清晰理解應該怎樣擺出線框中的動作。。
                       - **禁止**直接說出 "L" 或 "R" 這些字母。請轉化為自然的「左邊/右邊」。
                    5. **線框對齊**：畫面中有白色的線條輪廓。這是目標姿勢。請指導模特兒移動肢體來完美重合這個白色輪廓。
                `
            },
            callbacks: {
                onopen: async () => {
                    console.log("Live Session Connected");
                    setCoachInstruction("AI 教練觀察中...");
                    
                    // A. Setup Audio Input (Microphone)
                    try {
                        const inputStream = await navigator.mediaDevices.getUserMedia({ audio: true });
                        micStreamRef.current = inputStream; // Track stream for cleanup
                        
                        audioInputContextRef.current = new AudioContextClass({ sampleRate: 16000 });
                        const source = audioInputContextRef.current.createMediaStreamSource(inputStream);
                        const processor = audioInputContextRef.current.createScriptProcessor(4096, 1, 1);
                        
                        processor.onaudioprocess = (e) => {
                            const inputData = e.inputBuffer.getChannelData(0);
                            const pcmData = new Int16Array(inputData.length);
                            for (let i = 0; i < inputData.length; i++) {
                                pcmData[i] = Math.max(-1, Math.min(1, inputData[i])) * 32767;
                            }
                            const buffer = pcmData.buffer;
                            const base64Audio = arrayBufferToBase64(buffer);

                            sessionPromise.then(session => {
                                session.sendRealtimeInput({
                                    media: {
                                        mimeType: 'audio/pcm;rate=16000',
                                        data: base64Audio
                                    }
                                });
                            });
                        };
                        
                        source.connect(processor);
                        processor.connect(audioInputContextRef.current.destination);

                    } catch (micError) {
                        console.warn("Microphone access denied.", micError);
                    }

                    // B. FORCE START (Robust)
                    setTimeout(() => {
                        sessionPromise.then(session => {
                            try {
                                (session as any).send([
                                    {
                                        clientContent: {
                                            turns: [{
                                                parts: [{ text: "我準備好了，請現在開始看畫面（包含白色線條）並用簡短的中文指導我擺出線框的姿勢。" }],
                                                role: "user"
                                            }],
                                            turnComplete: true
                                        }
                                    }
                                ]);
                            } catch (e) {
                                console.error("Send trigger error", e);
                            }
                        }).catch(e => {
                            console.error("Session not ready for trigger", e);
                        });
                    }, 1000);

                    // C. Start Video Streaming Loop WITH COMPOSITING (2 FPS)
                    videoIntervalRef.current = window.setInterval(() => {
                        if (!videoRef.current) return;
                        
                        const video = videoRef.current;
                        
                        // 1. Create a canvas for the frame (Low res is enough for AI)
                        const canvas = document.createElement('canvas');
                        const scale = 0.5; 
                        canvas.width = video.videoWidth * scale;
                        canvas.height = video.videoHeight * scale;
                        const ctx = canvas.getContext('2d');
                        
                        if (ctx) {
                             // 2. Draw Video Frame
                             ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

                             // 3. Composite Wireframe (Augmented Reality)
                             const currentPoseTransform = poseTransformRef.current;
                             const currentPoseImage = poseImageRef.current;

                             if (currentPoseImage) {
                                 const screenW = window.innerWidth;
                                 const screenH = window.innerHeight;
                                 const videoW = video.videoWidth;
                                 const videoH = video.videoHeight;
                                 
                                 const scaleX = screenW / videoW;
                                 const scaleY = screenH / videoH;
                                 const scaleCover = Math.max(scaleX, scaleY); 
                                 
                                 const canvasScaleFactor = canvas.width / videoW; 
                                 
                                 ctx.save();
                                 ctx.translate(canvas.width / 2, canvas.height / 2);
                                 
                                 const conversionRatio = (1 / scaleCover) * canvasScaleFactor;

                                 ctx.translate(currentPoseTransform.x * conversionRatio, currentPoseTransform.y * conversionRatio);
                                 ctx.rotate(currentPoseTransform.rotation * Math.PI / 180);
                                 ctx.scale(currentPoseTransform.scale, currentPoseTransform.scale);
                                 
                                 const drawW = screenW * conversionRatio;
                                 const drawH = screenH * conversionRatio;
                                 
                                 ctx.drawImage(currentPoseImage, -drawW/2, -drawH/2, drawW, drawH);
                                 ctx.restore();
                             }

                             // 4. DRAW VISUAL MARKERS (L/R) FOR AI (CORRECTED)
                             ctx.font = "bold 40px Arial";
                             ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
                             ctx.shadowColor = "black";
                             ctx.shadowBlur = 4;
                             // SWAPPED: Screen Left (0) is Subject Right ('R')
                             ctx.fillText("R", 20, canvas.height / 2);
                             // SWAPPED: Screen Right (width) is Subject Left ('L')
                             ctx.fillText("L", canvas.width - 50, canvas.height / 2);
                             
                             const dataUrl = canvas.toDataURL('image/jpeg', 0.6);
                             const base64 = dataUrl.split(',')[1];
                             
                             // Update Debug View
                             setDebugImage(dataUrl);
                             
                             sessionPromise.then(session => {
                                session.sendRealtimeInput({
                                    media: {
                                        mimeType: 'image/jpeg',
                                        data: base64
                                    }
                                });
                             });
                        }
                    }, 500);
                },
                onmessage: async (msg) => {
                    // 1. Handle Text Transcription
                    let text = msg.serverContent?.modelTurn?.parts?.find(p => p.text)?.text;
                    if (!text && msg.serverContent?.outputTranscription?.text) {
                        text = msg.serverContent.outputTranscription.text;
                    }

                    if (text) {
                        setCoachInstruction(prev => {
                            if (prev === "AI 教練觀察中..." || prev === "正在連接 AI 教練...") {
                                return text;
                            }
                            return (prev || "") + text;
                        });
                        
                        if (instructionTimeoutRef.current) clearTimeout(instructionTimeoutRef.current);
                        instructionTimeoutRef.current = window.setTimeout(() => {
                            setCoachInstruction(null);
                        }, 5000);
                    }

                    // 2. Handle Audio Output
                    const audioData = msg.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
                    if (audioData && audioContextRef.current) {
                         const audioCtx = audioContextRef.current;
                         const arrayBuffer = base64ToArrayBuffer(audioData);
                         
                         const view = new DataView(arrayBuffer);
                         const numSamples = view.byteLength / 2;
                         const float32Data = new Float32Array(numSamples);
                         for(let i=0; i<numSamples; i++) {
                             float32Data[i] = view.getInt16(i * 2, true) / 32768.0; 
                         }

                         const audioBuffer = audioCtx.createBuffer(1, numSamples, 24000);
                         audioBuffer.getChannelData(0).set(float32Data);

                         const source = audioCtx.createBufferSource();
                         source.buffer = audioBuffer;
                         source.connect(audioCtx.destination);
                         
                         const startTime = Math.max(audioCtx.currentTime, nextAudioStartTimeRef.current);
                         source.start(startTime);
                         nextAudioStartTimeRef.current = startTime + audioBuffer.duration;
                    }
                },
                onclose: () => {
                    console.log("Session Closed");
                    stopLiveSession();
                },
                onerror: (err) => {
                    console.error("Live Session Error", err);
                    setError("連線中斷，請重試");
                    stopLiveSession();
                }
            }
        });
        
        liveSessionRef.current = sessionPromise;

    } catch (e) {
        console.error("Failed to start live session", e);
        setError("無法啟動 AI 教練，請檢查麥克風權限");
        setIsLiveCoaching(false);
    }
  };

  const toggleLiveCoach = () => {
    if (isLiveCoaching) {
        stopLiveSession();
    } else {
        startLiveSession();
    }
  };

  const handleGeneratePose = async () => {
    if (!videoRef.current || isGeneratingPose) return;
    setIsGeneratingPose(true);
    
    try {
        // 1. Capture current frame
        const video = videoRef.current;
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('No context');
        
        if (facingMode === 'user') {
            ctx.translate(canvas.width, 0);
            ctx.scale(-1, 1);
        }
        ctx.drawImage(video, 0, 0);
        const base64Data = canvas.toDataURL('image/jpeg', 0.8).split(',')[1];

        // 2. Call Gemini
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash-image',
            contents: {
                parts: [
                    { inlineData: { data: base64Data, mimeType: 'image/jpeg' } },
                    { text: `
任務：為擴增實境（AR）應用生成一個純粹的「人物疊加素材」。
細節：深入分析參考圖片中傢俱、建築物、自然景觀等幾何形狀場景結構，然後添加純黑背景色（不包含任何場景元素，例如家具，建築物），乾淨、極簡的白色線，單一條長髮女性模特兒人物插畫（身體視角需例精準對齊）。

1. 背景： 必須是絕對純黑（#000000），完全虛空。不得有任何背景元素、地板線條或傢俱輪廓。
2. 主體： 只繪製一位女性角色，使用簡約白色連續手繪粗線條（描邊/線框風格）。描繪出女性模特實際與此特定環境真實按比例互動 1:1 比例大小的畫面。繪畫風格要簡約流暢、富有表現力。整體要維持現代感、溫暖且略帶童趣，完美襯托場景美感。
3. 嚴格視覺規範：
4. 互動： 僅描繪人體姿勢，不可繪製場景元素。場景元素必須「隱形」。角色應看起來像漂浮在黑色虛空中，但其姿態要精準符合現實環境的視角和場景互動。
5. 構圖：仔細分析參考圖片的場景，根據圖片中場景大小、遠近、構圖，聰明地自動生成特寫、半身或者全身的線框。留意如果場景中並沒有拍攝到地板，使用大半身姿勢線框或者特寫的鏡頭線框。
6. 動作姿勢： 向着攝影師擺出優雅、可愛、活潑、自然，帶有「Instagram網紅可愛感」姿勢。不繪製臉部細節，僅突出身體輪廓與動作。
7. 輸出： 圖片要高對比度：白色線條在黑色背景。除了白線人物外，不能有其他任何內容。
摘要： 白色女性輪廓在純黑虛空中擺姿，畫面乾淨零雜訊。
                    `}
                ]
            },
            config: {
              imageConfig: {
                aspectRatio: "9:16", 
              }
            }
        });

        // 3. Extract Image
        let generatedImageBase64 = null;
        if (response.candidates?.[0]?.content?.parts) {
            for (const part of response.candidates[0].content.parts) {
                if (part.inlineData) {
                    generatedImageBase64 = part.inlineData.data;
                    break;
                }
            }
        }

        if (generatedImageBase64) {
            // 4. Process image to make background transparent
            const transparentImageUrl = await processImageForTransparency(generatedImageBase64);

            const newPose: Pose = {
                id: `ai-${Date.now()}`,
                name: 'AI Generated',
                imageUrl: transparentImageUrl
            };
            setActivePose(newPose);
            setPoseTransform(INITIAL_TRANSFORM); // Reset transform for new pose
        } else {
          setError("AI 沒有回傳圖片，請重試");
          setTimeout(() => setError(null), 3000);
        }

    } catch (e) {
        console.error("AI Generation failed", e);
        setError("生成失敗，請檢查網路連線");
        setTimeout(() => setError(null), 3000);
    } finally {
        setIsGeneratingPose(false);
    }
  };

  // --- RENDER HELPERS ---

  const renderGallery = () => {
    if (!isGalleryOpen) return null;

    if (selectedImageIndex !== null) {
        // REVIEW MODE (Single Image)
        return (
            <div className="fixed inset-0 z-[100] bg-black flex flex-col animate-fade-in touch-none">
                 {/* Main Image Container */}
                 <div className="absolute inset-0 flex items-center justify-center bg-black">
                    <img 
                        src={gallery[selectedImageIndex]} 
                        alt="Review" 
                        className="w-full h-full object-contain" 
                    />
                 </div>

                 {/* Top Navigation - Floating Glass Pill */}
                 <div className="absolute top-0 left-0 right-0 p-6 pt-12 flex justify-between items-start pointer-events-none">
                    <button 
                        onClick={() => setSelectedImageIndex(null)} 
                        className="pointer-events-auto w-12 h-12 rounded-full bg-black/30 backdrop-blur-xl border border-white/10 flex items-center justify-center text-white/90 active:scale-90 transition-all shadow-lg"
                    >
                        <ChevronLeft className="w-6 h-6" />
                    </button>
                 </div>

                 {/* Bottom Actions - Floating Glass Dock */}
                 <div className="absolute bottom-10 left-6 right-6 z-20 pointer-events-none">
                    <div className="pointer-events-auto bg-black/60 backdrop-blur-2xl border border-white/10 rounded-3xl p-2.5 flex items-center justify-between shadow-2xl ring-1 ring-white/5">
                        
                        {/* Delete Button */}
                        <button 
                            onClick={() => deletePhoto(selectedImageIndex)} 
                            className="w-16 h-16 rounded-2xl flex items-center justify-center text-red-400 hover:bg-white/5 active:scale-90 transition-all"
                        >
                            <Trash2 className="w-6 h-6" />
                        </button>

                        <div className="w-[1px] h-8 bg-white/10 mx-2"></div>

                        {/* Save / Share Button */}
                        <button 
                            onClick={() => handleShare(gallery[selectedImageIndex])}
                            className="flex-1 h-16 bg-white text-black rounded-2xl font-bold flex items-center justify-center gap-3 active:scale-95 transition-transform shadow-lg"
                        >
                            <Share2 className="w-5 h-5" />
                            <span className="text-sm tracking-wide font-extrabold">儲存與分享</span>
                        </button>
                    </div>
                 </div>
            </div>
        );
    }

    // GRID MODE
    return (
        <div className="fixed inset-0 z-[100] bg-zinc-950/90 backdrop-blur-3xl animate-fade-in flex flex-col">
            {/* Header */}
            <div className="flex justify-between items-end px-6 pb-6 pt-16 bg-gradient-to-b from-black/80 to-transparent z-10 border-b border-white/5">
                <div className="flex flex-col">
                    <h1 className="text-3xl font-light text-white tracking-tight">Gallery</h1>
                    <span className="text-[10px] font-bold text-white/40 tracking-[0.2em] mt-1 uppercase">
                        {gallery.length} Images
                    </span>
                </div>
                <button 
                    onClick={() => setIsGalleryOpen(false)} 
                    className="w-10 h-10 rounded-full bg-white/5 backdrop-blur-md border border-white/10 flex items-center justify-center active:bg-white/20 transition-all text-white/70"
                >
                    <X className="w-5 h-5" />
                </button>
            </div>

            {/* Scrollable Grid */}
            <div className="flex-1 overflow-y-auto p-4 pb-32">
                <div className="grid grid-cols-3 gap-3">
                    {gallery.map((img, idx) => (
                        <div 
                            key={idx} 
                            onClick={() => setSelectedImageIndex(idx)}
                            className="aspect-[9/16] bg-gray-900 rounded-xl overflow-hidden border border-white/10 cursor-pointer active:scale-95 transition-all shadow-lg relative group"
                        >
                            <img src={img} alt={`Capture ${idx}`} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                    ))}
                </div>
                
                {gallery.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-64 text-white/30 gap-4">
                        <Images className="w-12 h-12 opacity-50" />
                        <p className="text-sm font-medium tracking-wider">No Images</p>
                    </div>
                )}
            </div>
        </div>
    );
  };

  return (
    <div className="relative w-full h-full bg-black overflow-hidden select-none">
      
      {/* 1. Camera Layer */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className={`absolute inset-0 w-full h-full object-cover transition-transform duration-500 ${facingMode === 'user' ? 'scale-x-[-1]' : ''}`}
      />

      {/* 2. Pose Overlay Layer (Interactive) */}
      <WireframeOverlay 
        pose={activePose} 
        containerWidth={window.innerWidth} 
        containerHeight={window.innerHeight}
        transform={poseTransform}
        onTransformChange={setPoseTransform}
      />

      {/* 3. UI Layer */}
      
      {/* Visual Flash Effect */}
      <div className={`absolute inset-0 bg-white pointer-events-none transition-opacity duration-150 z-50 ${isFlashing ? 'opacity-100' : 'opacity-0'}`} />
      
      {/* SPLASH SCREEN */}
      <div 
        onClick={() => setShowSplash(false)}
        className={`fixed inset-0 z-[200] bg-[#FDFBF7] flex items-center justify-center transition-opacity duration-500 ease-out cursor-pointer ${showSplash ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
      >
          <img src="https://i.imgur.com/OiD8pz2.png" alt="Boyfriend Camera" className="w-full h-full object-cover" />
          <div className="absolute bottom-20 px-8 py-3 bg-white/30 backdrop-blur-md border border-white/50 rounded-full shadow-lg animate-pulse">
              <span className="text-gray-900 text-lg font-bold tracking-[0.2em] drop-shadow-sm">
                  點擊畫面開始
              </span>
          </div>
      </div>

      {/* Top Bar */}
      <TopControls 
        onFlipCamera={toggleCamera} 
        isFrontFacing={facingMode === 'user'} 
        flashEnabled={flashEnabled}
        toggleFlash={() => setFlashEnabled(!flashEnabled)}
        hasActivePose={!!activePose}
        onClearPose={handleClearPose}
        isLiveCoaching={isLiveCoaching}
        toggleLiveCoach={toggleLiveCoach}
      />
      
      {/* Coach Subtitle / Instruction Bubble */}
      {coachInstruction && (
        <div className="absolute top-28 left-0 right-0 z-40 flex justify-center pointer-events-none animate-fade-in-down">
            <div className="bg-black/40 backdrop-blur-md border border-white/10 px-6 py-3 rounded-2xl shadow-lg max-w-[85%] max-h-32 overflow-hidden">
                <p className="text-white/90 text-sm font-medium text-center leading-snug drop-shadow-sm tracking-wide">
                    {coachInstruction}
                </p>
            </div>
        </div>
      )}
      
      {/* DEBUG VIEW (AI VISION) - Updated Layout and Interactivity */}
      {isLiveCoaching && debugImage && (
          <div 
            onClick={() => setIsDebugExpanded(!isDebugExpanded)}
            className={`
                absolute right-4 bottom-28 z-50 w-28 bg-black border-2 border-red-500/50 rounded-lg overflow-hidden shadow-2xl 
                cursor-pointer pointer-events-auto transition-all duration-300 ease-in-out
                ${isDebugExpanded ? 'h-48' : 'h-6'}
            `}
          >
              <img 
                src={debugImage} 
                alt="AI View" 
                className={`w-full h-full object-cover transition-opacity duration-300 ${isDebugExpanded ? 'opacity-100' : 'opacity-0'}`} 
              />
              <div className={`
                absolute bottom-0 left-0 right-0 bg-red-500/90 flex items-center justify-center gap-1 transition-all duration-300
                ${isDebugExpanded ? 'h-5' : 'h-full'}
              `}>
                  <span className="text-[10px] font-bold text-white text-center uppercase tracking-wider">AI View</span>
                  {isDebugExpanded ? <ChevronDown size={12} className="text-white" /> : <ChevronUp size={12} className="text-white" />}
              </div>
          </div>
      )}

      {/* Zoom Slider */}
      <ZoomSlider 
        zoomLevel={zoomLevel} 
        onZoomChange={handleZoomChange}
        minZoom={zoomCapabilities?.min || 1}
        maxZoom={zoomCapabilities?.max || 1}
        hasZoom={!!zoomCapabilities}
      />

      {/* Bottom Controls */}
      <div className="absolute bottom-0 left-0 right-0 z-40 h-40 bg-gradient-to-t from-black/90 to-transparent pointer-events-none">
         <div className="relative w-full h-full">
            
            {/* Gallery (Left) */}
            <div className="absolute left-8 bottom-10 pointer-events-auto flex items-center justify-center">
                <GalleryButton 
                    onOpenGallery={() => setIsGalleryOpen(true)}
                    galleryCount={gallery.length}
                    latestImage={gallery.length > 0 ? gallery[gallery.length - 1] : null}
                />
            </div>

            {/* Shutter (Center) */}
            <div className="absolute left-1/2 bottom-6 -translate-x-1/2 pointer-events-auto flex items-center justify-center">
                <ShutterButton onClick={capturePhoto} disabled={isGeneratingPose} />
            </div>

            {/* AI Guide (Right) */}
            <div className="absolute right-8 bottom-10 pointer-events-auto flex items-center justify-center">
                <AIGuideButton isGenerating={isGeneratingPose} onGeneratePose={handleGeneratePose} />
            </div>
            
         </div>
      </div>

      {/* Error State */}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/90 z-50 p-6 text-center animate-fade-in">
          <div className="max-w-xs p-4 bg-gray-900 rounded-2xl border border-red-500/50">
            <p className="text-red-400 font-bold mb-2">錯誤</p>
            <p className="text-white/80 text-sm">{error}</p>
            <button 
              onClick={() => setError(null)}
              className="mt-4 px-6 py-2 bg-white/10 text-white rounded-full font-bold text-sm"
            >
              關閉
            </button>
          </div>
        </div>
      )}

      {/* Gallery Modal */}
      {renderGallery()}

      {/* Hidden Canvas for Processing */}
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
