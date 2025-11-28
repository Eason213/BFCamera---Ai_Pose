import React from 'react';
import { Pose } from '../types';
import { POSES } from '../constants';

interface PoseSelectorProps {
  selectedPoseId: string | null;
  onSelectPose: (pose: Pose | null) => void;
}

export const PoseSelector: React.FC<PoseSelectorProps> = ({ selectedPoseId, onSelectPose }) => {
  return (
    <div className="w-full bg-gradient-to-t from-black/90 to-transparent pb-8 pt-4">
        {/* Shutter Text / Instruction */}
        <div className="text-center text-white/60 text-xs mb-4 font-medium tracking-wider">
            {selectedPoseId ? "ALIGN SUBJECT TO WIREFRAME" : "SELECT A POSE"}
        </div>

      <div className="flex overflow-x-auto no-scrollbar px-4 space-x-4 items-center h-20">
        <button
          onClick={() => onSelectPose(null)}
          className={`flex-shrink-0 w-14 h-14 rounded-full flex items-center justify-center border-2 transition-all duration-200 ${
            selectedPoseId === null
              ? 'border-yellow-400 bg-white/20'
              : 'border-white/30 bg-black/40'
          }`}
        >
            <span className="text-xs font-bold text-white">OFF</span>
        </button>

        {POSES.map((pose) => (
          <button
            key={pose.id}
            onClick={() => onSelectPose(pose)}
            className={`flex-shrink-0 w-14 h-14 rounded-full flex items-center justify-center border-2 transition-all duration-200 backdrop-blur-sm ${
              selectedPoseId === pose.id
                ? 'border-yellow-400 bg-white/20 scale-110'
                : 'border-white/30 bg-black/40'
            }`}
          >
            <svg
              viewBox={pose.viewBox}
              className="w-8 h-8 stroke-white fill-none stroke-[1.5]"
            >
              <path d={pose.svgPath} />
            </svg>
          </button>
        ))}
        {/* Spacer for right padding */}
        <div className="w-4 flex-shrink-0" />
      </div>
    </div>
  );
};