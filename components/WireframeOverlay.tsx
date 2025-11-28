
import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Pose, TransformState, TouchState } from '../types';
import { getDistance, getAngle, getMidpoint } from '../utils/geometry';

interface WireframeOverlayProps {
  pose: Pose | null;
  containerWidth: number;
  containerHeight: number;
  transform: TransformState;
  onTransformChange: (newTransform: TransformState) => void;
}

export const WireframeOverlay: React.FC<WireframeOverlayProps> = ({ 
  pose, 
  containerWidth, 
  containerHeight,
  transform,
  onTransformChange
}) => {
  const activeTouches = useRef<Map<number, TouchState>>(new Map());
  const initialTransform = useRef<TransformState>({ ...transform });
  const initialGestureData = useRef<{
    distance: number;
    angle: number;
    center: { x: number; y: number };
  } | null>(null);

  const updateTouches = (event: React.TouchEvent) => {
    const map = new Map<number, TouchState>();
    for (let i = 0; i < event.touches.length; i++) {
      const t = event.touches[i];
      map.set(t.identifier, { id: t.identifier, x: t.clientX, y: t.clientY });
    }
    return map;
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    activeTouches.current = updateTouches(e);
    initialTransform.current = { ...transform };

    const points: TouchState[] = Array.from(activeTouches.current.values());

    if (activeTouches.current.size === 2) {
      initialGestureData.current = {
        distance: getDistance(points[0], points[1]),
        angle: getAngle(points[0], points[1]),
        center: getMidpoint(points[0], points[1]),
      };
    } else if (activeTouches.current.size === 1) {
      const point = points[0];
      initialGestureData.current = {
        distance: 0,
        angle: 0,
        center: { x: point.x, y: point.y },
      };
    }
  };

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    activeTouches.current = updateTouches(e);
    const touches: TouchState[] = Array.from(activeTouches.current.values());

    if (touches.length === 2 && initialGestureData.current) {
      const newDist = getDistance(touches[0], touches[1]);
      const newAngle = getAngle(touches[0], touches[1]);
      const newCenter = getMidpoint(touches[0], touches[1]);

      const initial = initialGestureData.current;
      const initialTrans = initialTransform.current;

      const scaleMultiplier = newDist / initial.distance;
      const rotationDelta = newAngle - initial.angle;
      const dx = newCenter.x - initial.center.x;
      const dy = newCenter.y - initial.center.y;

      onTransformChange({
        x: initialTrans.x + dx,
        y: initialTrans.y + dy,
        scale: Math.max(0.2, Math.min(initialTrans.scale * scaleMultiplier, 5)),
        rotation: initialTrans.rotation + rotationDelta,
      });

    } else if (touches.length === 1 && initialGestureData.current) {
      const touch = touches[0];
      const initial = initialGestureData.current;
      const initialTrans = initialTransform.current;

      const dx = touch.x - initial.center.x;
      const dy = touch.y - initial.center.y;

      onTransformChange({
        ...transform,
        x: initialTrans.x + dx,
        y: initialTrans.y + dy,
      });
    }
  }, [transform, onTransformChange]);

  const handleTouchEnd = () => {
    activeTouches.current.clear();
    initialGestureData.current = null;
  };

  if (!pose) return null;

  return (
    <div
      className="absolute inset-0 overflow-hidden flex items-center justify-center touch-none z-10"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
    >
      <div
        style={{
          transform: `translate(${transform.x}px, ${transform.y}px) rotate(${transform.rotation}deg) scale(${transform.scale})`,
          transformOrigin: 'center center',
          width: '100%', 
          height: '100%',
          cursor: 'grab',
        }}
        className="relative pointer-events-none flex items-center justify-center"
      >
        {pose.imageUrl ? (
             <img 
               src={pose.imageUrl} 
               alt="Pose Overlay" 
               className="w-full h-full object-cover pointer-events-none select-none drop-shadow-lg"
             />
        ) : (
            <svg
              viewBox={pose.viewBox}
              className="w-full h-full drop-shadow-lg filter"
              style={{
                fill: 'none',
                stroke: 'white',
                strokeWidth: '1.5',
                strokeLinecap: 'round',
                strokeLinejoin: 'round',
                opacity: 0.8,
                filter: 'drop-shadow(0px 0px 4px rgba(0,0,0,0.8))'
              }}
            >
              <path d={pose.svgPath} />
            </svg>
        )}
        
        {/* Subtle Guide Box */}
        <div className="absolute inset-4 border border-white/10 rounded-lg pointer-events-none opacity-50" />
        
        {/* Helper text */}
        <div className="absolute bottom-20 left-0 right-0 text-center text-white/50 text-[10px] uppercase tracking-widest pointer-events-none shadow-black/50 text-shadow-sm">
          拖曳 • 縮放 • 旋轉
        </div>
      </div>
    </div>
  );
};
