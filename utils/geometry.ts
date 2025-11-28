import { TouchState } from '../types';

export const getDistance = (p1: TouchState, p2: TouchState): number => {
  return Math.hypot(p2.x - p1.x, p2.y - p1.y);
};

export const getAngle = (p1: TouchState, p2: TouchState): number => {
  return (Math.atan2(p2.y - p1.y, p2.x - p1.x) * 180) / Math.PI;
};

export const getMidpoint = (p1: TouchState, p2: TouchState): { x: number; y: number } => {
  return {
    x: (p1.x + p2.x) / 2,
    y: (p1.y + p2.y) / 2,
  };
};