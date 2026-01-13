// File Storage Utilities for Asset Management

import { ensureDir } from "https://deno.land/std@0.208.0/fs/mod.ts";
import { join } from "https://deno.land/std@0.208.0/path/mod.ts";

// ============================================================================
// Configuration
// ============================================================================

const STORAGE_PATH = Deno.env.get("STORAGE_PATH") || "./uploads";
const BASE_URL = Deno.env.get("BASE_URL") || "http://localhost:8000";

// ============================================================================
// Local File System Storage
// ============================================================================

/**
 * Initialize storage directory
 */
export async function initStorage(): Promise<void> {
  try {
    await ensureDir(STORAGE_PATH);
    console.log(`✅ Storage directory initialized: ${STORAGE_PATH}`);
  } catch (error) {
    console.error("❌ Error initializing storage:", error);
    throw error;
  }
}

/**
 * Generate a unique filename with timestamp
 */
function generateFilename(originalName: string): string {
  const timestamp = Date.now();
  const sanitized = originalName.replace(/[^a-zA-Z0-9.-]/g, "_");
  return `${timestamp}_${sanitized}`;
}

/**
 * Save file to local storage
 * @param file - File data as Uint8Array
 * @param originalName - Original filename
 * @param videoId - Video project ID (for organizing files)
 * @returns Object with file path and URL
 */
export async function saveFile(
  file: Uint8Array,
  originalName: string,
  videoId: string,
): Promise<{ path: string; url: string }> {
  try {
    // Create video-specific directory
    const videoDir = join(STORAGE_PATH, videoId);
    await ensureDir(videoDir);

    // Generate unique filename
    const filename = generateFilename(originalName);
    const filePath = join(videoDir, filename);

    // Write file
    await Deno.writeFile(filePath, file);

    // Generate public URL
    const url = `${BASE_URL}/uploads/${videoId}/${filename}`;

    console.log(`✅ File saved: ${filePath}`);

    return { path: filePath, url };
  } catch (error) {
    console.error("❌ Error saving file:", error);
    throw error;
  }
}

/**
 * Read file from local storage
 * @param path - File path
 * @returns File data as Uint8Array
 */
export async function readFile(path: string): Promise<Uint8Array> {
  try {
    const data = await Deno.readFile(path);
    return data;
  } catch (error) {
    console.error(`❌ Error reading file: ${path}`, error);
    throw error;
  }
}

/**
 * Delete file from local storage
 * @param path - File path
 */
export async function deleteFile(path: string): Promise<void> {
  try {
    await Deno.remove(path);
    console.log(`✅ File deleted: ${path}`);
  } catch (error) {
    console.error(`❌ Error deleting file: ${path}`, error);
    throw error;
  }
}

/**
 * Delete entire video directory
 * @param videoId - Video project ID
 */
export async function deleteVideoFiles(videoId: string): Promise<void> {
  try {
    const videoDir = join(STORAGE_PATH, videoId);
    await Deno.remove(videoDir, { recursive: true });
    console.log(`✅ Video files deleted: ${videoDir}`);
  } catch (error) {
    console.error(`❌ Error deleting video files: ${videoId}`, error);
    throw error;
  }
}

/**
 * Get file size in bytes
 * @param path - File path
 * @returns File size in bytes
 */
export async function getFileSize(path: string): Promise<number> {
  try {
    const fileInfo = await Deno.stat(path);
    return fileInfo.size;
  } catch (error) {
    console.error(`❌ Error getting file size: ${path}`, error);
    throw error;
  }
}

/**
 * Check if file exists
 * @param path - File path
 * @returns True if file exists
 */
export async function fileExists(path: string): Promise<boolean> {
  try {
    await Deno.stat(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Download file from URL to local storage
 * @param url - URL of the file
 * @param videoId - Video project ID
 * @param filename - Desired filename
 * @returns Object with file path and URL
 */
export async function downloadFile(
  url: string,
  videoId: string,
  filename: string,
): Promise<{ path: string; url: string }> {
  try {
    // Fetch file
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to download file: ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const data = new Uint8Array(arrayBuffer);

    // Save to local storage
    return await saveFile(data, filename, videoId);
  } catch (error) {
    console.error(`❌ Error downloading file: ${url}`, error);
    throw error;
  }
}

// ============================================================================
// File Type Detection
// ============================================================================

/**
 * Get MIME type from filename extension
 * @param filename - Filename
 * @returns MIME type
 */
export function getMimeType(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase();

  const mimeTypes: Record<string, string> = {
    // Images
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
    svg: "image/svg+xml",

    // Videos
    mp4: "video/mp4",
    webm: "video/webm",
    mov: "video/quicktime",
    avi: "video/x-msvideo",

    // Audio
    mp3: "audio/mpeg",
    wav: "audio/wav",
    ogg: "audio/ogg",
    m4a: "audio/mp4",

    // Documents
    pdf: "application/pdf",
    txt: "text/plain",
    json: "application/json",

    // Subtitles
    srt: "text/srt",
    vtt: "text/vtt",
  };

  return mimeTypes[ext || ""] || "application/octet-stream";
}

/**
 * Validate file type
 * @param filename - Filename
 * @param allowedTypes - Array of allowed MIME types
 * @returns True if file type is allowed
 */
export function validateFileType(
  filename: string,
  allowedTypes: string[],
): boolean {
  const mimeType = getMimeType(filename);
  return allowedTypes.includes(mimeType);
}

// ============================================================================
// S3 Storage (Optional - for production)
// ============================================================================

/**
 * Upload file to S3 (placeholder - requires AWS SDK)
 * @param file - File data
 * @param key - S3 object key
 * @returns S3 URL
 */
export async function uploadToS3(
  _file: Uint8Array,
  _key: string,
): Promise<string> {
  // TODO: Implement S3 upload using AWS SDK
  // For now, use local storage
  throw new Error("S3 upload not implemented yet. Using local storage.");
}

/**
 * Delete file from S3 (placeholder - requires AWS SDK)
 * @param key - S3 object key
 */
export async function deleteFromS3(_key: string): Promise<void> {
  // TODO: Implement S3 delete using AWS SDK
  throw new Error("S3 delete not implemented yet. Using local storage.");
}

// ============================================================================
// Export all functions
// ============================================================================

export default {
  initStorage,
  saveFile,
  readFile,
  deleteFile,
  deleteVideoFiles,
  getFileSize,
  fileExists,
  downloadFile,
  getMimeType,
  validateFileType,
  uploadToS3,
  deleteFromS3,
};
