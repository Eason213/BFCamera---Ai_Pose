export interface Pose {
  id: string;
  name: string;
  svgPath?: string; // The path data for the SVG (optional if imageUrl is provided)
  viewBox?: string; // Optional if imageUrl is provided
  imageUrl?: string; // URL for raster images (e.g. AI generated)
}

export interface TransformState {
  x: number;
  y: number;
  scale: number;
  rotation: number;
}

export interface TouchState {
  id: number;
  x: number;
  y: number;
}