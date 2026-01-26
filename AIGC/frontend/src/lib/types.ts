// Frontend Types for Cold-Start Video Generation System
// Based on backend/lib/types.ts

// ============================================================================
// Video Project Types
// ============================================================================

export type VideoStatus =
  | "draft"
  | "analyzing"
  | "analyzed"
  | "script_review"
  | "script_approved"
  | "storyboard_review"
  | "storyboard_approved"
  | "generating_assets"
  | "images_review"
  | "assets_review"
  | "assets_approved"
  | "generating_audio"
  | "rendering"
  | "ready"
  | "failed";

export type Language = "zh" | "en" | "fr";

export type VideoDuration = 30 | 60 | 90;

export interface VideoProject {
  id: string;
  userId: string;
  topic: string;
  language: Language;
  duration: VideoDuration;
  isPremium: boolean;
  status: VideoStatus;
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// Story Analysis Types
// ============================================================================

export interface StoryAnalysis {
  concept: string;
  themes: string[];
  characters: string[];
  mood: string;
}

// ============================================================================
// Script Types
// ============================================================================

export interface SceneScript {
  id: string;
  order: number;
  narration: string;
  startTime: number;
  endTime: number;
  visualDescription?: string;
}

export interface Script {
  scriptId: string;
  text: string;
  scenes: SceneScript[];
  wordCount: number;
  estimatedDuration: number;
}

// ============================================================================
// Storyboard Types
// ============================================================================

export interface StoryboardScene {
  id: string;
  order: number;
  title: string;
  description: string;
  imagePrompt: string;
  cameraAngle: string;
  composition: string;
  lighting: string;
  transition: string;
  duration: number;
}

export interface Storyboard {
  storyboardId: string;
  storyboard: {
    title: string;
    description: string;
    visualStyle: string;
    colorPalette: string;
  };
  scenes: StoryboardScene[];
}

// ============================================================================
// Asset Types
// ============================================================================

export type AssetType = "image" | "video_clip" | "audio" | "music";

export type ImageProvider = "dall-e-3" | "gemini-2.5-flash-image" | "gemini-3-pro";

export interface Asset {
  sceneId: string;
  type: AssetType;
  url: string;
  cost: number; // Total cost (image + animation)
  imageCost?: number;
  animationCost?: number;
  reused: boolean;
  imageProvider?: ImageProvider;
  referenceImageCount?: number;
  animationProvider?: "hailuo" | "static";
  generationTime?: number;
}

// ============================================================================
// Video Types
// ============================================================================

export interface Video {
  videoUrl: string;
  audioUrl: string;
  subtitlesUrl?: string;
  duration: number;
  fileSize: number;
  cost: number;
  format: string;
  resolution: string;
}

// ============================================================================
// API Request/Response Types
// ============================================================================

export interface CreateVideoRequest {
  topic: string;
  language: Language;
  duration: VideoDuration;
  isPremium?: boolean;
  userId: string;
}

export interface CreateVideoResponse {
  videoId: string;
  status: VideoStatus;
}

export interface ApprovalRequest {
  approved: boolean;
  revisionNotes?: string;
}

export interface ApprovalResponse {
  status: VideoStatus;
  message: string;
}

export interface SceneRevision {
  sceneId: string;
  newPrompt: string;
}

export interface AssetRevision {
  assetId: string;
  newPrompt: string;
}

// ============================================================================
// UI State Types
// ============================================================================

export interface WizardStep {
  id: number;
  title: string;
  description: string;
  status: "pending" | "current" | "completed";
}

export interface VideoCreationState {
  videoId: string | null;
  currentStep: number;
  storyAnalysis: StoryAnalysis | null;
  script: Script | null;
  storyboard: Storyboard | null;
  assets: Asset[] | null;
  video: Video | null;
  totalCost: number;
}
