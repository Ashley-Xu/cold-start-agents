// API Client for Cold-Start Video Generation System
// Communicates with backend server at http://localhost:8000

import type {
  ApprovalRequest,
  ApprovalResponse,
  Asset,
  AssetRevision,
  CreateVideoRequest,
  CreateVideoResponse,
  SceneRevision,
  Script,
  Storyboard,
  StoryAnalysis,
  Video,
  VideoProject,
} from "./types";

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

// ============================================================================
// Helper Functions
// ============================================================================

async function fetchJSON<T>(
  endpoint: string,
  options?: RequestInit
): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({
      error: `HTTP ${response.status}: ${response.statusText}`,
    }));
    throw new Error(error.error || "Request failed");
  }

  return response.json();
}

// ============================================================================
// Video Project Endpoints
// ============================================================================

export async function createVideo(
  request: CreateVideoRequest
): Promise<CreateVideoResponse> {
  return fetchJSON<CreateVideoResponse>("/api/videos", {
    method: "POST",
    body: JSON.stringify(request),
  });
}

export async function getVideos(): Promise<VideoProject[]> {
  return fetchJSON<VideoProject[]>("/api/videos");
}

export async function getVideo(videoId: string): Promise<VideoProject> {
  return fetchJSON<VideoProject>(`/api/videos/${videoId}`);
}

// ============================================================================
// Story Analysis Endpoint
// ============================================================================

export async function analyzeStory(
  videoId: string,
  userFeedback?: string
): Promise<StoryAnalysis> {
  return fetchJSON<StoryAnalysis>(`/api/videos/${videoId}/analyze`, {
    method: "POST",
    body: userFeedback ? JSON.stringify({ userFeedback }) : undefined,
  });
}

// ============================================================================
// Script Endpoints
// ============================================================================

export async function generateScript(videoId: string): Promise<Script> {
  return fetchJSON<Script>(`/api/videos/${videoId}/script`, {
    method: "POST",
  });
}

export async function approveScript(
  videoId: string,
  request: ApprovalRequest
): Promise<ApprovalResponse> {
  return fetchJSON<ApprovalResponse>(
    `/api/videos/${videoId}/script/approve`,
    {
      method: "POST",
      body: JSON.stringify(request),
    }
  );
}

// ============================================================================
// Storyboard Endpoints
// ============================================================================

export async function generateStoryboard(
  videoId: string
): Promise<Storyboard> {
  return fetchJSON<Storyboard>(`/api/videos/${videoId}/storyboard`, {
    method: "POST",
  });
}

export async function approveStoryboard(
  videoId: string,
  approved: boolean,
  sceneRevisions?: SceneRevision[]
): Promise<ApprovalResponse> {
  return fetchJSON<ApprovalResponse>(
    `/api/videos/${videoId}/storyboard/approve`,
    {
      method: "POST",
      body: JSON.stringify({ approved, sceneRevisions }),
    }
  );
}

// ============================================================================
// Asset Endpoints
// ============================================================================

export async function generateImages(
  videoId: string
): Promise<{ assets: Asset[]; totalCost: number; imageCost: number; animationCost: number }> {
  return fetchJSON<{ assets: Asset[]; totalCost: number; imageCost: number; animationCost: number }>(
    `/api/videos/${videoId}/generate-images`,
    {
      method: "POST",
    }
  );
}

export async function animateImages(
  videoId: string
): Promise<{ assets: Asset[]; totalCost: number; imageCost: number; animationCost: number }> {
  return fetchJSON<{ assets: Asset[]; totalCost: number; imageCost: number; animationCost: number }>(
    `/api/videos/${videoId}/animate-images`,
    {
      method: "POST",
    }
  );
}

export async function generateAssets(
  videoId: string
): Promise<{ assets: Asset[]; totalCost: number; imageCost: number; animationCost: number }> {
  return fetchJSON<{ assets: Asset[]; totalCost: number; imageCost: number; animationCost: number }>(
    `/api/videos/${videoId}/generate-assets`,
    {
      method: "POST",
    }
  );
}

export async function approveAssets(
  videoId: string,
  approved: boolean,
  assetRevisions?: AssetRevision[]
): Promise<ApprovalResponse> {
  return fetchJSON<ApprovalResponse>(
    `/api/videos/${videoId}/assets/approve`,
    {
      method: "POST",
      body: JSON.stringify({ approved, assetRevisions }),
    }
  );
}

// ============================================================================
// Video Rendering Endpoint
// ============================================================================

export async function renderVideo(videoId: string): Promise<Video> {
  return fetchJSON<Video>(`/api/videos/${videoId}/render`, {
    method: "POST",
  });
}

// ============================================================================
// Health Check
// ============================================================================

export async function healthCheck(): Promise<{ status: string }> {
  return fetchJSON<{ status: string }>("/api/health");
}
