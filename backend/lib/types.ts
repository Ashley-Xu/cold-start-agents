// Core Types for Cold-Start Video Generation System

// ============================================================================
// User Types
// ============================================================================

export interface User {
  id: string;
  email: string;
  name: string;
  createdAt: Date;
}

export interface CreateUserRequest {
  email: string;
  name: string;
}

export interface CreateUserResponse {
  userId: string;
  email: string;
  name: string;
}

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
  isPremium: boolean; // true = use Sora, false = use DALL-E 3
  status: VideoStatus;
  createdAt: Date;
  updatedAt: Date;
}

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

// ============================================================================
// Story Analysis Types
// ============================================================================

export interface StoryAnalysis {
  id: string;
  videoId: string;
  concept: string;
  themes: string[];
  characters: string[];
  mood: string;
  createdAt: Date;
}

export interface AnalyzeStoryRequest {
  userFeedback?: string; // Optional iterative refinement
}

export interface AnalyzeStoryResponse {
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
  scriptId: string;
  order: number;
  narration: string;
  startTime: number; // in seconds
  endTime: number; // in seconds
}

export interface Script {
  id: string;
  videoId: string;
  text: string;
  wordCount: number;
  scenes: SceneScript[];
  approvedAt: Date | null;
  createdAt: Date;
}

export interface GenerateScriptRequest {
  concept: string;
  approvalNotes?: string;
}

export interface GenerateScriptResponse {
  scriptId: string;
  text: string;
  scenes: Array<{
    order: number;
    narration: string;
    startTime: number;
    endTime: number;
  }>;
  wordCount: number;
}

export interface ApproveScriptRequest {
  approved: boolean;
  revisionNotes?: string;
}

export interface ApproveScriptResponse {
  status: VideoStatus;
  message: string;
}

// ============================================================================
// Storyboard Types
// ============================================================================

export interface StoryboardScene {
  id: string;
  storyboardId: string;
  order: number;
  description: string;
  imagePrompt: string;
  cameraAngle: string;
  transition: string;
}

export interface Storyboard {
  id: string;
  videoId: string;
  scenes: StoryboardScene[];
  approvedAt: Date | null;
  createdAt: Date;
}

export interface GenerateStoryboardRequest {
  scriptId: string;
}

export interface GenerateStoryboardResponse {
  storyboardId: string;
  scenes: Array<{
    order: number;
    description: string;
    imagePrompt: string;
    cameraAngle: string;
    transition: string;
  }>;
}

export interface SceneRevision {
  sceneId: string;
  newPrompt: string;
}

export interface ApproveStoryboardRequest {
  approved: boolean;
  sceneRevisions?: SceneRevision[];
}

export interface ApproveStoryboardResponse {
  status: VideoStatus;
  message: string;
}

// ============================================================================
// Asset Types
// ============================================================================

export type AssetType = "image" | "video_clip" | "audio" | "music";

export type AssetGenerator = "dalle3" | "sora" | "elevenlabs" | "library";

export interface Asset {
  id: string;
  videoId: string;
  sceneId: string;
  type: AssetType;
  url: string;
  generatedBy: AssetGenerator;
  cost: number;
  embedding?: number[]; // Vector embedding for similarity search
  tags: string[];
  reuseCount: number;
  createdAt: Date;
}

export interface GenerateAssetsRequest {
  storyboardId: string;
}

export interface GenerateAssetsResponse {
  jobId: string;
  status: string;
  estimatedTime: number; // in seconds
}

export interface AssetRevision {
  assetId: string;
  newPrompt: string;
}

export interface ApproveAssetsRequest {
  approved: boolean;
  assetRevisions?: AssetRevision[];
}

export interface ApproveAssetsResponse {
  status: VideoStatus;
  message: string;
}

// ============================================================================
// Video Types
// ============================================================================

export interface Video {
  id: string;
  videoProjectId: string;
  url: string;
  duration: number; // in seconds
  fileSize: number; // in bytes
  format: string; // "mp4"
  resolution: string; // "1080x1920"
  totalCost: number;
  renderedAt: Date;
}

export interface RenderVideoRequest {
  videoId: string;
}

export interface RenderVideoResponse {
  jobId: string;
  status: string;
  estimatedTime: number; // in seconds
}

export interface VideoStatusResponse {
  status: VideoStatus;
  progress: number; // 0-100
  estimatedTimeRemaining?: number; // in seconds
  error?: string;
}

// ============================================================================
// Analytics Types
// ============================================================================

export interface CostBreakdown {
  scriptGeneration: number;
  storyboardPlanning: number;
  assetGeneration: number;
  audioGeneration: number;
  total: number;
}

export interface CostAnalyticsRequest {
  userId: string;
  startDate?: string; // ISO date string
  endDate?: string; // ISO date string
}

export interface CostAnalyticsResponse {
  totalCost: number;
  videoCount: number;
  averageCostPerVideo: number;
  breakdown: CostBreakdown;
  assetReuseCount: number;
  assetReuseSavings: number;
}

// ============================================================================
// Agent Input/Output Types (for Mastra agents)
// ============================================================================

export interface StoryAnalyzerInput {
  topic: string;
  language: Language;
  duration: VideoDuration;
  style?: string;
}

export interface StoryAnalyzerOutput {
  concept: string;
  themes: string[];
  characters: string[];
  mood: string;
}

export interface ScriptWriterInput {
  concept: string;
  themes: string[];
  characters: string[];
  mood: string;
  language: Language;
  duration: VideoDuration;
  style?: string;
}

export interface ScriptWriterOutput {
  script: string;
  scenes: Array<{
    order: number;
    narration: string;
    startTime: number;
    endTime: number;
    visualDescription: string;
  }>;
  wordCount: number;
  estimatedDuration: number;
}

export interface ScenePlannerInput {
  script: string;
  scenes: Array<{
    order: number;
    narration: string;
    startTime: number;
    endTime: number;
    visualDescription: string;
  }>;
  language: Language;
  duration: VideoDuration;
  style?: string;
}

export interface ScenePlannerOutput {
  storyboard: {
    title: string;
    description: string;
    visualStyle: string;
    colorPalette: string;
  };
  scenes: Array<{
    order: number;
    title: string;
    description: string;
    imagePrompt: string;
    cameraAngle: string;
    composition: string;
    lighting: string;
    transition: string;
    duration: number;
  }>;
}

export interface AssetGeneratorInput {
  scenes: Array<{
    order: number;
    description: string;
    imagePrompt: string;
  }>;
  isPremium: boolean;
}

export interface AssetGeneratorOutput {
  assets: Array<{
    sceneId: string;
    type: AssetType;
    url: string;
    cost: number;
    reused: boolean;
  }>;
}

export interface VideoScene {
  order: number;
  narration: string;
  startTime: number;
  endTime: number;
  assetUrl: string;
  transition?: string;
}

export interface VideoAssemblerInput {
  videoId: string;
  language: Language;
  scenes: VideoScene[];
  duration: 30 | 60 | 90;
}

// Word-level timestamp for transcript
export interface WordTimestamp {
  word: string;
  start: number; // Start time in seconds
  end: number; // End time in seconds
}

// Complete transcript with word-level timing
export interface Transcript {
  text: string; // Full transcript text
  words: WordTimestamp[]; // Word-level timestamps
  language: Language;
  duration: number; // Total duration in seconds
}

export interface VideoAssemblerOutput {
  videoUrl: string;
  audioUrl: string;
  subtitlesUrl?: string;
  transcript: Transcript; // Word-level transcript with timestamps
  duration: number;
  fileSize: number;
  cost: number;
  format: string;
  resolution: string;
}

// ============================================================================
// Utility Types
// ============================================================================

export interface ApiError {
  error: string;
  code: string;
  details?: unknown;
}

export interface SuccessResponse<T = unknown> {
  success: true;
  data: T;
}

export interface ErrorResponse {
  success: false;
  error: string;
  code: string;
  details?: unknown;
}

export type ApiResponse<T = unknown> = SuccessResponse<T> | ErrorResponse;
