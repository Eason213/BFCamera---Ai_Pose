import React, { useState, useRef } from 'react';
import { RefreshCw, Zap, ZapOff, Loader2, Sparkles, Images, Download, Trash2, X, ChevronRight, ChevronLeft, Mic, MicOff, Headset } from 'lucide-react';

interface ControlsProps {
  onCapture: () => void;
  onFlipCamera: () => void;
  isFrontFacing: boolean;
  flashEnabled: boolean;
  toggleFlash: () => void;
  isGenerating: boolean;
  onGeneratePose: () => void;
  zoomLevel: number;
  onZoomChange: (level: number) => void;
  minZoom: number;
  maxZoom: number;
  hasZoom: boolean;
  galleryCount: number;
  onOpenGallery: () => void;
  latestImage: string | null;
  hasActivePose: boolean;
  onClearPose: () => void;
  isLiveCoaching: boolean;
  toggleLiveCoach: () => void;
}

export const TopControls: React.FC<Pick<ControlsProps, 'onFlipCamera' | 'isFrontFacing' | 'flashEnabled' | 'toggleFlash' | 'hasActivePose' | 'onClearPose' | 'isLiveCoaching' | 'toggleLiveCoach'>> = ({ 
  onFlipCamera, 
  flashEnabled, 
  toggleFlash,
  hasActivePose,
  onClearPose,
  isLiveCoaching,
  toggleLiveCoach
}) => {
  return (
    <div className="absolute top-0 left-0 right-0 p-4 pt- safe-top flex justify-between items-start z-20 bg-gradient-to-b from-black/60 to-transparent h-28 pointer-events-none">
      <button 
        onClick={toggleFlash}
        className="pointer-events-auto p-3 rounded-full bg-black/20 backdrop-blur-md active:bg-white/20 transition-colors"
      >
        {flashEnabled ? <Zap className="text-yellow-400 w-6 h-6" /> : <ZapOff className="text-white w-6 h-6" />}
      </button>

      {/* Center Controls Group */}
      <div className="absolute left-1/2 -translate-x-1/2 mt-2 flex flex-col items-center gap-3 w-full max-w-[200px]">
        
        {/* Live Coach Button (Only when pose is active) */}
        {hasActivePose && (
             <button
                onClick={toggleLiveCoach}
                className={`
                    pointer-events-auto px-5 py-2.5 rounded-full backdrop-blur-md border flex items-center gap-2 transition-all shadow-lg group
                    ${isLiveCoaching 
                        ? 'bg-red-500/80 border-red-400 text-white animate-pulse-slow' 
                        : 'bg-black/40 border-white/20 text-white/90 hover:bg-black/60'}
                `}
            >
                {isLiveCoaching ? (
                    <>
                        <span className="relative flex h-2.5 w-2.5">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-white"></span>
                        </span>
                        <span className="text-xs font-bold tracking-widest uppercase">WATCHING</span>
                    </>
                ) : (
                    <>
                         <Headset className="w-4 h-4" />
                         <span className="text-xs font-bold tracking-widest">COACH</span>
                    </>
                )}
            </button>
        )}

        {/* Clear Button */}
        {hasActivePose && !isLiveCoaching && (
            <button
                onClick={onClearPose}
                className="pointer-events-auto px-4 py-1.5 rounded-full bg-black/20 backdrop-blur-sm border border-white/10 flex items-center gap-2 text-white/70 hover:bg-white/10 active:scale-95 transition-all animate-fade-in"
            >
                <X className="w-3 h-3" />
                <span className="text-[10px] font-bold tracking-widest">CLEAR</span>
            </button>
        )}
      </div>
      
      <button 
        onClick={onFlipCamera}
        className="pointer-events-auto p-3 rounded-full bg-black/20 backdrop-blur-md active:bg-white/20 transition-colors"
      >
        <RefreshCw className="text-white w-6 h-6" />
      </button>
    </div>
  );
};

export const ZoomSlider: React.FC<Pick<ControlsProps, 'zoomLevel' | 'onZoomChange' | 'minZoom' | 'maxZoom' | 'hasZoom'>> = ({
  zoomLevel,
  onZoomChange,
  minZoom,
  maxZoom,
  hasZoom
}) => {
  const [isScrubbing, setIsScrubbing] = useState(false);
  const startX = useRef(0);
  const startZoom = useRef(0);
  const lastHapticZoom = useRef(0);
  const scrubTimeoutRef = useRef<number | null>(null);

  if (!hasZoom) return null;

  // Define cycle presets for tap interaction
  const cyclePresets = [0.5, 1, 2, 5].filter(z => z >= minZoom && z <= maxZoom);
  if (!cyclePresets.includes(1) && 1 >= minZoom && 1 <= maxZoom) cyclePresets.push(1);
  cyclePresets.sort((a,b) => a - b);

  const handleTouchStart = (e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX;
    startZoom.current = zoomLevel;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    const currentX = e.touches[0].clientX;
    const deltaX = currentX - startX.current;

    // Determine if drag started (threshold 5px)
    if (!isScrubbing && Math.abs(deltaX) > 5) {
      setIsScrubbing(true);
      if (scrubTimeoutRef.current) clearTimeout(scrubTimeoutRef.current);
    }

    if (isScrubbing) {
      // Sensitivity: 0.01x per pixel
      const zoomDelta = deltaX * 0.01;
      let newZoom = startZoom.current + zoomDelta;
      
      // Clamp
      newZoom = Math.max(minZoom, Math.min(maxZoom, newZoom));
      
      onZoomChange(newZoom);

      // Haptics on 0.1 increments
      if (Math.abs(newZoom - lastHapticZoom.current) > 0.1) {
        if (navigator.vibrate) navigator.vibrate(5);
        lastHapticZoom.current = newZoom;
      }
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    // Check if it was a tap (no scrubbing)
    if (!isScrubbing) {
        // Tap behavior: Cycle through presets
        const nextPreset = cyclePresets.find(p => p > zoomLevel) || cyclePresets[0];
        onZoomChange(nextPreset);
        if (navigator.vibrate) navigator.vibrate(10);
    } else {
        // Drag end
        scrubTimeoutRef.current = window.setTimeout(() => {
            setIsScrubbing(false);
        }, 300); 
    }
  };

  return (
    <div className="absolute bottom-32 left-0 right-0 z-30 flex justify-center items-center animate-fade-in pointer-events-none">
        {/* 
            Container handles Touch Area.
            pointer-events-auto is crucial here to capture touches only on the pill 
        */}
        <div 
            className={`
                relative h-10 bg-black/50 backdrop-blur-xl rounded-full 
                flex items-center justify-center transition-all duration-300 ease-out shadow-lg border border-white/10
                pointer-events-auto touch-none select-none
                ${isScrubbing ? 'w-48' : 'w-20 active:scale-95 active:bg-black/70'}
            `}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
        >
            {/* Visual Dial (Only visible when scrubbing) */}
            <div className={`absolute inset-0 overflow-hidden rounded-full flex items-center justify-center transition-opacity duration-300 ${isScrubbing ? 'opacity-100' : 'opacity-0'}`}>
                {/* Ruler Ticks Background */}
                <div 
                    className="absolute inset-0 opacity-50 w-[200%]"
                    style={{
                        backgroundImage: `linear-gradient(90deg, rgba(255,255,255,0.8) 1px, transparent 1px)`,
                        backgroundSize: '12px 100%', 
                        transform: `translateX(calc(-25% - ${(zoomLevel - 1) * 30}px))` 
                    }}
                />
                <div className="absolute w-0.5 h-4 bg-yellow-400 z-10" />
            </div>

            {/* Text Label */}
            <span className={`relative z-20 text-white font-bold text-sm tracking-widest flex items-center gap-1 transition-all duration-200 ${isScrubbing ? 'scale-110 text-yellow-400 -translate-y-5' : ''}`}>
                {zoomLevel.toFixed(1)}x
            </span>

        </div>
    </div>
  );
};

export const AIGuideButton: React.FC<Pick<ControlsProps, 'isGenerating' | 'onGeneratePose'>> = ({
    isGenerating,
    onGeneratePose
}) => {
    return (
        <button 
        onClick={onGeneratePose}
        disabled={isGenerating}
        className={`h-12 px-5 rounded-full bg-black/50 backdrop-blur-md border border-white/20 flex items-center justify-center gap-2 transition-all shadow-lg select-none ${isGenerating ? 'opacity-80 cursor-wait' : 'active:bg-white/20 active:scale-95 hover:bg-black/60'}`}
        aria-label="AI Pose Guide"
      >
        {isGenerating ? (
          <Loader2 className="w-4 h-4 text-yellow-400 animate-spin" />
        ) : (
          <Sparkles className="w-4 h-4 text-yellow-400" />
        )}
        <span className="text-white font-bold text-xs tracking-wider whitespace-nowrap">
            {isGenerating ? 'CREATING...' : 'AI POSE'}
        </span>
      </button>
    )
}

export const GalleryButton: React.FC<Pick<ControlsProps, 'onOpenGallery' | 'galleryCount' | 'latestImage'>> = ({
    onOpenGallery,
    galleryCount,
    latestImage
}) => {
    return (
        <button 
            onClick={onOpenGallery}
            className="w-12 h-12 rounded-lg bg-gray-800 border-2 border-white/20 overflow-hidden relative active:scale-95 transition-transform"
        >
            {latestImage ? (
                <img src={latestImage} alt="Gallery" className="w-full h-full object-cover" />
            ) : (
                <div className="w-full h-full flex items-center justify-center">
                    <Images className="w-6 h-6 text-white/50" />
                </div>
            )}
            {galleryCount > 0 && (
                <div className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center shadow-sm">
                    {galleryCount}
                </div>
            )}
        </button>
    );
};

export const ShutterButton: React.FC<{ onClick: () => void; disabled?: boolean }> = ({ onClick, disabled }) => {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="group"
      aria-label="Take Photo"
    >
      <div className={`
        w-20 h-20 rounded-full border-4 border-white 
        flex items-center justify-center transition-transform duration-100
        ${disabled ? 'opacity-50' : 'group-active:scale-95'}
      `}>
        <div className="w-16 h-16 bg-white rounded-full transition-all duration-100 group-active:scale-90" />
      </div>
    </button>
  );
};