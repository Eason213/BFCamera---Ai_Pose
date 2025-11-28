import { Pose } from './types';

// Simplified wireframe paths resembling human poses
export const POSES: Pose[] = [
  {
    id: 'standing-1',
    name: 'Casual Stand',
    viewBox: "0 0 24 24",
    svgPath: "M12 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm0 4c-1 0-2 1-2 2v4h4V8c0-1-1-2-2-2zm-2 6v6h-2v4h2v-4h2v4h2v-4h-2v-6h-2z"
  },
  {
    id: 'sitting-1',
    name: 'Sitting Lean',
    viewBox: "0 0 24 24",
    svgPath: "M12 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm-1 5c-1.1 0-2 .9-2 2v3h-2v2h2v5h2v-5h2v-3h2v-2c0-1.1-.9-2-2-2h-2zm-3 10v3h8v-3H8z"
  },
  {
    id: 'headshot-1',
    name: 'Headshot Frame',
    viewBox: "0 0 24 24",
    svgPath: "M12 2a5 5 0 1 0 0 10 5 5 0 0 0 0-10zm0 12c-3.3 0-6 1.7-6 4v2h12v-2c0-2.3-2.7-4-6-4z"
  },
  {
    id: 'couple-1',
    name: 'Couple',
    viewBox: "0 0 24 24",
    svgPath: "M9 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm6 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm-6 5c-1.1 0-2 .9-2 2v5h2v6h2v-6h1v-5c0-1.1-.9-2-2-2h-1zm6 0c-1.1 0-2 .9-2 2v5h1v6h2v-6h2v-5c0-1.1-.9-2-2-2h-1z"
  }
];

export const INITIAL_TRANSFORM = {
  x: 0,
  y: 0,
  scale: 1,
  rotation: 0,
};