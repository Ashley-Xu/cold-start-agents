// Cold-Start Video Generation System - Main HTTP Server

import {
  checkConnection,
  closeDriver,
  getSession,
  initDriver,
  initSchema,
} from "./lib/neo4j.ts";
import { initStorage } from "./lib/storage.ts";
import type {
  ApiError,
  ApproveAssetsRequest,
  ApproveScriptRequest,
  ApproveStoryboardRequest,
  CreateVideoRequest,
  CreateVideoResponse,
  VideoProject,
  VideoStatus,
} from "./lib/types.ts";
import { analyzeStory } from "./ai/agents/storyAnalyzer.ts";
import type {
  StoryAnalyzerInput,
  StoryAnalyzerOutput,
} from "./ai/agents/storyAnalyzer.ts";
import { generateScript } from "./ai/agents/scriptWriter.ts";
import type {
  ScriptWriterInput,
  ScriptWriterOutput,
} from "./ai/agents/scriptWriter.ts";
import { createStoryboard } from "./ai/agents/scenePlanner.ts";
import type {
  ScenePlannerInput,
  ScenePlannerOutput,
} from "./ai/agents/scenePlanner.ts";
import { generateAssets } from "./ai/agents/assetGenerator.ts";
import type {
  AssetGeneratorInput,
  AssetGeneratorOutput,
} from "./ai/agents/assetGenerator.ts";
import { assembleVideo } from "./ai/agents/videoAssembler.ts";
import type {
  VideoAssemblerInput,
  VideoAssemblerOutput,
  VideoScene,
} from "./lib/types.ts";

// ============================================================================
// Server Configuration
// ============================================================================

const PORT = parseInt(Deno.env.get("PORT") || "8000");
const HOST = Deno.env.get("HOST") || "0.0.0.0";

// CORS headers
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Generate a unique ID
 */
function generateId(): string {
  return crypto.randomUUID();
}

/**
 * Parse JSON request body
 */
async function parseBody<T>(req: Request): Promise<T> {
  try {
    const text = await req.text();
    if (!text) {
      throw new Error("Empty request body");
    }
    return JSON.parse(text) as T;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid JSON: ${message}`);
  }
}

/**
 * Create error response
 */
function errorResponse(
  message: string,
  status: number = 400,
  code: string = "ERROR",
): Response {
  const error: ApiError = {
    error: message,
    code,
  };

  return new Response(JSON.stringify(error), {
    status,
    headers: { "content-type": "application/json", ...corsHeaders },
  });
}

/**
 * Create success response
 */
function successResponse<T>(data: T, status: number = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", ...corsHeaders },
  });
}

// ============================================================================
// Request Handler
// ============================================================================

async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;
  const method = req.method;

  console.log(`${method} ${path}`);

  // Handle CORS preflight
  if (method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  // ========================================================================
  // Health Check
  // ========================================================================

  if (path === "/health" || path === "/api/health") {
    const isConnected = await checkConnection();
    return successResponse({
      status: "ok",
      database: isConnected ? "connected" : "disconnected",
      timestamp: new Date().toISOString(),
    });
  }

  // ========================================================================
  // User Endpoints
  // ========================================================================

  // POST /api/users - Create new user (for testing/demo purposes)
  if (path === "/api/users" && method === "POST") {
    try {
      const body = await parseBody<{
        id: string;
        email: string;
        preferredName: string;
        nativeLanguage: string;
      }>(req);

      if (!body.id || !body.email || !body.preferredName || !body.nativeLanguage) {
        return errorResponse(
          "Missing required fields: id, email, preferredName, nativeLanguage",
          400,
          "VALIDATION_ERROR"
        );
      }

      const now = new Date().toISOString();
      const session = getSession();
      try {
        // Create user node
        await session.run(
          `
          CREATE (u:User {
            id: $id,
            email: $email,
            preferredName: $preferredName,
            nativeLanguage: $nativeLanguage,
            createdAt: datetime($now)
          })
          RETURN u
          `,
          {
            id: body.id,
            email: body.email,
            preferredName: body.preferredName,
            nativeLanguage: body.nativeLanguage,
            now,
          }
        );

        return successResponse({ userId: body.id }, 201);
      } finally {
        await session.close();
      }
    } catch (error) {
      console.error("Error creating user:", error);
      const message = error instanceof Error ? error.message : "Unknown error";
      return errorResponse(message, 500, "SERVER_ERROR");
    }
  }

  // ========================================================================
  // Video Project Endpoints
  // ========================================================================

  // POST /api/videos - Create new video project
  if (path === "/api/videos" && method === "POST") {
    try {
      const body = await parseBody<CreateVideoRequest>(req);

      // Validate required fields
      if (!body.topic || !body.language || !body.duration || !body.userId) {
        return errorResponse(
          "Missing required fields: topic, language, duration, userId",
          400,
          "VALIDATION_ERROR",
        );
      }

      // Validate language
      if (!["zh", "en", "fr"].includes(body.language)) {
        return errorResponse(
          "Invalid language. Must be 'zh', 'en', or 'fr'",
          400,
          "VALIDATION_ERROR",
        );
      }

      // Validate duration
      if (![30, 60, 90].includes(body.duration)) {
        return errorResponse(
          "Invalid duration. Must be 30, 60, or 90",
          400,
          "VALIDATION_ERROR",
        );
      }

      const videoId = generateId();
      const now = new Date().toISOString();

      const session = getSession();
      try {
        // Create video project node
        const result = await session.run(
          `
          MATCH (u:User {id: $userId})
          CREATE (v:VideoProject {
            id: $id,
            userId: $userId,
            topic: $topic,
            language: $language,
            duration: $duration,
            isPremium: $isPremium,
            status: 'draft',
            createdAt: datetime($now),
            updatedAt: datetime($now)
          })
          CREATE (u)-[:CREATED]->(v)
          RETURN v
          `,
          {
            id: videoId,
            userId: body.userId,
            topic: body.topic,
            language: body.language,
            duration: body.duration,
            isPremium: body.isPremium || false,
            now,
          },
        );

        // Check if video was actually created (User must exist)
        if (result.records.length === 0) {
          return errorResponse(
            `User with id ${body.userId} not found. Please create a user account first.`,
            404,
            "USER_NOT_FOUND"
          );
        }

        const response: CreateVideoResponse = {
          videoId,
          status: "draft",
        };

        return successResponse(response, 201);
      } finally {
        await session.close();
      }
    } catch (error) {
      console.error("Error creating video:", error);
      const message = error instanceof Error ? error.message : "Unknown error";
      return errorResponse(message, 500, "SERVER_ERROR");
    }
  }

  // GET /api/videos - List all videos (with optional filters)
  if (path === "/api/videos" && method === "GET") {
    try {
      const userId = url.searchParams.get("userId");
      const status = url.searchParams.get("status");
      const language = url.searchParams.get("language");

      const session = getSession();
      try {
        let query = "MATCH (v:VideoProject)";
        const params: Record<string, string> = {};

        // Add filters
        const conditions: string[] = [];
        if (userId) {
          conditions.push("v.userId = $userId");
          params.userId = userId;
        }
        if (status) {
          conditions.push("v.status = $status");
          params.status = status;
        }
        if (language) {
          conditions.push("v.language = $language");
          params.language = language;
        }

        if (conditions.length > 0) {
          query += " WHERE " + conditions.join(" AND ");
        }

        query += " RETURN v ORDER BY v.createdAt DESC LIMIT 100";

        const result = await session.run(query, params);

        const videos = result.records.map((record: any) => {
          const node = record.get("v");
          return {
            id: node.properties.id,
            userId: node.properties.userId,
            topic: node.properties.topic,
            language: node.properties.language,
            duration: typeof node.properties.duration === "number"
              ? node.properties.duration
              : node.properties.duration.toNumber(),
            isPremium: node.properties.isPremium,
            status: node.properties.status,
            createdAt: node.properties.createdAt.toString(),
            updatedAt: node.properties.updatedAt.toString(),
          };
        });

        return successResponse({ videos });
      } finally {
        await session.close();
      }
    } catch (error) {
      console.error("Error listing videos:", error);
      const message = error instanceof Error ? error.message : "Unknown error";
      return errorResponse(message, 500, "SERVER_ERROR");
    }
  }

  // GET /api/videos/:videoId - Get video details
 
  if (path.startsWith("/api/videos/") && method === "GET" &&
      !path.includes("/download") && !path.includes("/subtitles")) {
    try {
      const videoId = path.split("/")[3];

      const session = getSession();
      try {
        const result = await session.run(
          `
          MATCH (v:VideoProject {id: $videoId})
          OPTIONAL MATCH (v)-[:HAS_SCRIPT]->(s:Script)
          OPTIONAL MATCH (v)-[:HAS_STORYBOARD]->(sb:Storyboard)
          OPTIONAL MATCH (v)-[:HAS_VIDEO]->(vid:Video)
          RETURN v, s, sb, vid
          `,
          { videoId },
        );

        if (result.records.length === 0) {
          return errorResponse("Video not found", 404, "NOT_FOUND");
        }

        const record = result.records[0];
        const videoNode = record.get("v");
        const scriptNode = record.get("s");
        const storyboardNode = record.get("sb");
        const videoFileNode = record.get("vid");

        const video: Partial<VideoProject> = {
          id: videoNode.properties.id,
          userId: videoNode.properties.userId,
          topic: videoNode.properties.topic,
          language: videoNode.properties.language,
          duration: typeof videoNode.properties.duration === "number"
            ? videoNode.properties.duration
            : videoNode.properties.duration.toNumber(),
          isPremium: videoNode.properties.isPremium,
          status: videoNode.properties.status,
          createdAt: new Date(videoNode.properties.createdAt.toString()),
          updatedAt: new Date(videoNode.properties.updatedAt.toString()),
        };

        const response: {
          video: Partial<VideoProject>;
          script?: { id: string; text: string; wordCount: number };
          storyboard?: { id: string };
          renderedVideo?: { id: string; url: string };
        } = { video };

        if (scriptNode) {
          response.script = {
            id: scriptNode.properties.id,
            text: scriptNode.properties.text,
            wordCount: typeof scriptNode.properties.wordCount === "number"
              ? scriptNode.properties.wordCount
              : scriptNode.properties.wordCount.toNumber(),
          };
        }

        if (storyboardNode) {
          response.storyboard = {
            id: storyboardNode.properties.id,
          };
        }

        if (videoFileNode) {
          response.renderedVideo = {
            id: videoFileNode.properties.id,
            url: videoFileNode.properties.url,
          };
        }

        return successResponse(response);
      } finally {
        await session.close();
      }
    } catch (error) {
      console.error("Error getting video:", error);
      const message = error instanceof Error ? error.message : "Unknown error";
      return errorResponse(message, 500, "SERVER_ERROR");
    }
  }

  // POST /api/videos/:videoId/analyze - Story Analyzer
  if (path.match(/^\/api\/videos\/[^/]+\/analyze$/) && method === "POST") {
    try {
      const videoId = path.split("/")[3];

      const body = await parseBody<{ userFeedback?: string }>(req).catch(() => ({}));

      const session = getSession();
      try {
      
        const videoResult = await session.run(
          `MATCH (v:VideoProject {id: $videoId}) RETURN v`,
          { videoId },
        );

        if (videoResult.records.length === 0) {
          return errorResponse("Video not found", 404, "NOT_FOUND");
        }

        const videoNode = videoResult.records[0].get("v");
        const videoProps = videoNode.properties;

       
        const analyzerInput: StoryAnalyzerInput = {
          topic: videoProps.topic,
          language: videoProps.language,
          duration: typeof videoProps.duration === "number"
            ? videoProps.duration
            : videoProps.duration.toNumber(),
          userFeedback: body.userFeedback,
        };

        console.log(`🎬 Analyzing story for video ${videoId}...`);

        
        const analysis: StoryAnalyzerOutput = await analyzeStory(analyzerInput);

        console.log(`✅ Story analysis complete:`, {
          concept: analysis.concept.substring(0, 50) + "...",
          themes: analysis.themes,
          mood: analysis.mood,
        });

        
        const analysisId = generateId();
        const now = new Date().toISOString();

        await session.run(
          `
          MATCH (v:VideoProject {id: $videoId})
          CREATE (a:StoryAnalysis {
            id: $analysisId,
            videoId: $videoId,
            concept: $concept,
            themes: $themes,
            characters: $characters,
            mood: $mood,
            createdAt: datetime($now)
          })
          CREATE (v)-[:HAS_ANALYSIS]->(a)
          SET v.status = 'analyzed', v.updatedAt = datetime($now)
          RETURN a
          `,
          {
            videoId,
            analysisId,
            concept: analysis.concept,
            themes: analysis.themes,
            characters: analysis.characters,
            mood: analysis.mood,
            now,
          },
        );

       
        return successResponse({
          analysisId,
          ...analysis,
        });
      } finally {
        await session.close();
      }
    } catch (error) {
      console.error("Error analyzing story:", error);
      const message = error instanceof Error ? error.message : "Unknown error";
      return errorResponse(message, 500, "SERVER_ERROR");
    }
  }

  // POST /api/videos/:videoId/script - Script Writer
  if (path.match(/^\/api\/videos\/[^/]+\/script$/) && method === "POST") {
    try {
      const videoId = path.split("/")[3];

      const session = getSession();
      try {
       
        const result = await session.run(
          `
          MATCH (v:VideoProject {id: $videoId})-[:HAS_ANALYSIS]->(a:StoryAnalysis)
          RETURN v, a
          `,
          { videoId },
        );

        if (result.records.length === 0) {
          return errorResponse(
            "Video or story analysis not found. Please analyze the story first.",
            404,
            "NOT_FOUND",
          );
        }

        const record = result.records[0];
        const videoNode = record.get("v");
        const analysisNode = record.get("a");

        const videoProps = videoNode.properties;
        const analysisProps = analysisNode.properties;

        const existingScript = await session.run(
          `MATCH (v:VideoProject {id: $videoId})-[:HAS_SCRIPT]->(s:Script)
           RETURN s`,
          { videoId }
        );

        if (existingScript.records.length > 0) {
          console.log(`🗑️  Deleting old script before regeneration...`);
          await session.run(
            `MATCH (v:VideoProject {id: $videoId})-[:HAS_SCRIPT]->(s:Script)
             OPTIONAL MATCH (s)-[:HAS_SCENE]->(sc:SceneScript)
             DETACH DELETE s, sc`,
            { videoId }
          );
        }

        const scriptInput: ScriptWriterInput = {
          concept: analysisProps.concept,
          themes: analysisProps.themes,
          characters: analysisProps.characters,
          mood: analysisProps.mood,
          language: videoProps.language,
          duration: typeof videoProps.duration === "number"
            ? videoProps.duration
            : videoProps.duration.toNumber(),
        };

        console.log(`📝 Generating script for video ${videoId}...`);

        const scriptOutput: ScriptWriterOutput = await generateScript(
          scriptInput,
        );

        console.log(`✅ Script generation complete:`, {
          wordCount: scriptOutput.wordCount,
          scenes: scriptOutput.scenes.length,
          estimatedDuration: scriptOutput.estimatedDuration,
        });

        const scriptId = generateId();
        const now = new Date().toISOString();

        await session.run(
          `
          MATCH (v:VideoProject {id: $videoId})
          CREATE (s:Script {
            id: $scriptId,
            videoId: $videoId,
            text: $text,
            wordCount: $wordCount,
            estimatedDuration: $estimatedDuration,
            createdAt: datetime($now)
          })
          CREATE (v)-[:HAS_SCRIPT]->(s)
          SET v.status = 'script_review', v.updatedAt = datetime($now)
          RETURN s
          `,
          {
            videoId,
            scriptId,
            text: scriptOutput.script,
            wordCount: scriptOutput.wordCount,
            estimatedDuration: scriptOutput.estimatedDuration,
            now,
          },
        );

        for (const scene of scriptOutput.scenes) {
          const sceneId = generateId();
          await session.run(
            `
            MATCH (s:Script {id: $scriptId})
            CREATE (sc:SceneScript {
              id: $sceneId,
              scriptId: $scriptId,
              order: $order,
              narration: $narration,
              startTime: $startTime,
              endTime: $endTime,
              visualDescription: $visualDescription,
              createdAt: datetime($now)
            })
            CREATE (s)-[:HAS_SCENE]->(sc)
            RETURN sc
            `,
            {
              scriptId,
              sceneId,
              order: scene.order,
              narration: scene.narration,
              startTime: scene.startTime,
              endTime: scene.endTime,
              visualDescription: scene.visualDescription,
              now,
            },
          );
        }

        // Return script results
        return successResponse({
          scriptId,
          ...scriptOutput,
        });
      } finally {
        await session.close();
      }
    } catch (error) {
      console.error("Error generating script:", error);
      const message = error instanceof Error ? error.message : "Unknown error";
      return errorResponse(message, 500, "SERVER_ERROR");
    }
  }

  // POST /api/videos/:videoId/script/approve - Script approval checkpoint
  if (
    path.match(/^\/api\/videos\/[^/]+\/script\/approve$/) && method === "POST"
  ) {
    try {
      const videoId = path.split("/")[3];
      console.log(`📝 Approve script request for video ${videoId}`);

      const body: ApproveScriptRequest = await req.json();
      console.log(`   Request body:`, JSON.stringify(body));

      // Validate request body
      if (typeof body.approved !== "boolean") {
        console.error(`   ❌ Invalid request body: approved is not a boolean`);
        return errorResponse(
          "Request body must include 'approved' boolean field",
          400,
          "INVALID_REQUEST",
        );
      }

      const session = getSession();
      try {
        // Fetch video and script
        const result = await session.run(
          `MATCH (v:VideoProject {id: $videoId})-[:HAS_SCRIPT]->(s:Script)
           RETURN v, s`,
          { videoId },
        );

        if (result.records.length === 0) {
          console.error(`   ❌ Video or script not found`);
          return errorResponse(
            "Video or script not found",
            404,
            "NOT_FOUND",
          );
        }

        const record = result.records[0];
        const videoProps = record.get("v").properties;
        console.log(`   Current video status: ${videoProps.status}`);

        // Verify video is in correct status (or later - allow going back and re-approving)
        const validStatuses = ["script_review", "script_approved", "storyboard_review", "storyboard_approved", "assets_review", "assets_approved", "rendering", "complete"];
        if (!validStatuses.includes(videoProps.status)) {
          console.error(`   ❌ Invalid status: ${videoProps.status} not in ${validStatuses.join(", ")}`);
          return errorResponse(
            `Cannot approve script. Video status is '${videoProps.status}' but must be one of: ${validStatuses.join(", ")}`,
            400,
            "INVALID_STATUS",
          );
        }
        console.log(`   ✓ Status validation passed`);

        const now = new Date().toISOString();

        if (body.approved) {
          // Approve script: update status to 'script_approved'
          await session.run(
            `MATCH (v:VideoProject {id: $videoId})-[:HAS_SCRIPT]->(s:Script)
             SET v.status = 'script_approved',
                 v.updatedAt = datetime($now),
                 s.approvedAt = datetime($now)
             RETURN v`,
            { videoId, now },
          );

          console.log(`✅ Script approved for video ${videoId}`);

          return successResponse({
            status: "script_approved" as VideoStatus,
            message: "Script approved. You can now proceed to storyboard creation.",
          });
        } else {
          // Reject script: return to 'draft' status for revision
          await session.run(
            `MATCH (v:VideoProject {id: $videoId})
             SET v.status = 'draft',
                 v.updatedAt = datetime($now),
                 v.revisionNotes = $revisionNotes
             RETURN v`,
            { videoId, now, revisionNotes: body.revisionNotes || "" },
          );

          console.log(`❌ Script rejected for video ${videoId}`);

          return successResponse({
            status: "draft" as VideoStatus,
            message: "Script rejected. Please revise and regenerate.",
          });
        }
      } finally {
        await session.close();
      }
    } catch (error) {
      console.error("Error approving script:", error);
      const message = error instanceof Error ? error.message : "Unknown error";
      return errorResponse(message, 500, "SERVER_ERROR");
    }
  }

  // POST /api/videos/:videoId/storyboard - Scene Planner
  if (path.match(/^\/api\/videos\/[^/]+\/storyboard$/) && method === "POST") {
    try {
      const videoId = path.split("/")[3];
      const session = getSession();

      try {
        // Fetch video project and its script with scenes
        const result = await session.run(
          `MATCH (v:VideoProject {id: $videoId})-[:HAS_SCRIPT]->(s:Script)
           MATCH (s)-[:HAS_SCENE]->(sc:SceneScript)
           WITH v, s, sc
           ORDER BY sc.order
           WITH v, s, collect(sc) as scenes
           RETURN v, s, scenes`,
          { videoId },
        );

        if (result.records.length === 0) {
          return errorResponse("Video or script not found", 404, "NOT_FOUND");
        }

        const record = result.records[0];
        const videoProps = record.get("v").properties;
        const scriptProps = record.get("s").properties;
        const scenes = record.get("scenes").map((sceneNode: any) =>
          sceneNode.properties
        );

        // Check if video is in correct status (allow regeneration from later stages)
        const validStatuses = ["script_approved", "storyboard_review", "storyboard_approved", "assets_review", "assets_approved", "rendering", "complete"];
        if (!validStatuses.includes(videoProps.status)) {
          return errorResponse(
            `Cannot create storyboard. Video status is '${videoProps.status}' but must be one of: ${validStatuses.join(", ")}`,
            400,
            "INVALID_STATUS",
          );
        }

        // Delete old storyboard if regenerating
        if (videoProps.status !== "script_approved") {
          console.log(`🗑️  Deleting old storyboard before regeneration...`);
          await session.run(
            `MATCH (v:VideoProject {id: $videoId})-[:HAS_STORYBOARD]->(sb:Storyboard)
             OPTIONAL MATCH (sb)-[:HAS_SCENE]->(sc:StoryboardScene)
             DETACH DELETE sb, sc`,
            { videoId }
          );
        }

        console.log(
          `🎬 Creating storyboard for video ${videoId} with ${scenes.length} scenes...`,
        );

        // Prepare Scene Planner input from script
        const storyboardInput: ScenePlannerInput = {
          script: scriptProps.text,
          scenes: scenes.map((sc: any) => ({
            order: typeof sc.order === "number" ? sc.order : sc.order.toNumber(),
            narration: sc.narration,
            startTime: typeof sc.startTime === "number"
              ? sc.startTime
              : sc.startTime.toNumber(),
            endTime: typeof sc.endTime === "number"
              ? sc.endTime
              : sc.endTime.toNumber(),
            visualDescription: sc.visualDescription || "",
          })),
          language: videoProps.language,
          duration: typeof videoProps.duration === "number"
            ? videoProps.duration
            : videoProps.duration.toNumber(),
        };

        // Generate storyboard
        const storyboardOutput: ScenePlannerOutput = await createStoryboard(
          storyboardInput,
        );

        console.log(`✅ Storyboard created with ${storyboardOutput.scenes.length} scenes`);

        // Create Storyboard node
        const storyboardId = generateId();
        await session.run(
          `MATCH (v:VideoProject {id: $videoId})
           CREATE (sb:Storyboard {
             id: $storyboardId,
             title: $title,
             description: $description,
             visualStyle: $visualStyle,
             colorPalette: $colorPalette,
             createdAt: datetime(),
             approvedAt: null
           })
           CREATE (v)-[:HAS_STORYBOARD]->(sb)
           RETURN sb`,
          {
            videoId,
            storyboardId,
            title: storyboardOutput.storyboard.title,
            description: storyboardOutput.storyboard.description,
            visualStyle: storyboardOutput.storyboard.visualStyle,
            colorPalette: storyboardOutput.storyboard.colorPalette,
          },
        );

        console.log(`📝 Storing ${storyboardOutput.scenes.length} storyboard scenes...`);

        // Create StoryboardScene nodes
        for (const scene of storyboardOutput.scenes) {
          const sceneId = generateId();
          await session.run(
            `MATCH (sb:Storyboard {id: $storyboardId})
             CREATE (sc:StoryboardScene {
               id: $sceneId,
               order: $order,
               title: $title,
               description: $description,
               imagePrompt: $imagePrompt,
               cameraAngle: $cameraAngle,
               composition: $composition,
               lighting: $lighting,
               transition: $transition,
               duration: $duration
             })
             CREATE (sb)-[:HAS_SCENE]->(sc)
             RETURN sc`,
            {
              storyboardId,
              sceneId,
              order: scene.order,
              title: scene.title,
              description: scene.description,
              imagePrompt: scene.imagePrompt,
              cameraAngle: scene.cameraAngle,
              composition: scene.composition,
              lighting: scene.lighting,
              transition: scene.transition,
              duration: scene.duration,
            },
          );
        }

        // Update video status
        await session.run(
          `MATCH (v:VideoProject {id: $videoId})
           SET v.status = 'storyboard_review', v.updatedAt = datetime()
           RETURN v`,
          { videoId },
        );

        console.log(`✅ Storyboard stored in database. Video status: storyboard_review`);

        return successResponse({
          storyboardId,
          storyboard: storyboardOutput.storyboard,
          scenes: storyboardOutput.scenes,
        });
      } finally {
        await session.close();
      }
    } catch (error) {
      console.error("Error creating storyboard:", error);
      const message = error instanceof Error ? error.message : "Unknown error";
      return errorResponse(message, 500, "SERVER_ERROR");
    }
  }

  // POST /api/videos/:videoId/storyboard/approve - Storyboard approval checkpoint
  if (
    path.match(/^\/api\/videos\/[^/]+\/storyboard\/approve$/) &&
    method === "POST"
  ) {
    try {
      const videoId = path.split("/")[3];
      console.log(`📋 Approve storyboard request for video ${videoId}`);

      const body: ApproveStoryboardRequest = await req.json();
      console.log(`   Request body:`, JSON.stringify(body));

      // Validate request body
      if (typeof body.approved !== "boolean") {
        console.error(`   ❌ Invalid request body: approved is not a boolean`);
        return errorResponse(
          "Request body must include 'approved' boolean field",
          400,
          "INVALID_REQUEST",
        );
      }

      const session = getSession();
      try {
        // Fetch video and storyboard
        const result = await session.run(
          `MATCH (v:VideoProject {id: $videoId})-[:HAS_STORYBOARD]->(sb:Storyboard)
           RETURN v, sb`,
          { videoId },
        );

        if (result.records.length === 0) {
          return errorResponse(
            "Video or storyboard not found",
            404,
            "NOT_FOUND",
          );
        }

        const record = result.records[0];
        const videoProps = record.get("v").properties;
        console.log(`   Current video status: ${videoProps.status}`);

        // Verify video is in correct status (or later - allow going back and re-approving)
        const validStatuses = ["storyboard_review", "storyboard_approved", "assets_review", "assets_approved", "rendering", "complete"];
        if (!validStatuses.includes(videoProps.status)) {
          console.error(`   ❌ Invalid status: ${videoProps.status} not in ${validStatuses.join(", ")}`);
          return errorResponse(
            `Cannot approve storyboard. Video status is '${videoProps.status}' but must be one of: ${validStatuses.join(", ")}`,
            400,
            "INVALID_STATUS",
          );
        }
        console.log(`   ✓ Status validation passed`);


        const now = new Date().toISOString();

        // Handle scene revisions if provided
        if (body.sceneRevisions && body.sceneRevisions.length > 0) {
          for (const revision of body.sceneRevisions) {
            await session.run(
              `MATCH (sc:StoryboardScene {id: $sceneId})
               SET sc.imagePrompt = $newPrompt,
                   sc.updatedAt = datetime($now)
               RETURN sc`,
              { sceneId: revision.sceneId, newPrompt: revision.newPrompt, now },
            );
          }
          console.log(
            `🔧 Updated ${body.sceneRevisions.length} scene(s) for video ${videoId}`,
          );
        }

        if (body.approved) {
          // Approve storyboard: update status to 'storyboard_approved'
          await session.run(
            `MATCH (v:VideoProject {id: $videoId})-[:HAS_STORYBOARD]->(sb:Storyboard)
             SET v.status = 'storyboard_approved',
                 v.updatedAt = datetime($now),
                 sb.approvedAt = datetime($now)
             RETURN v`,
            { videoId, now },
          );

          console.log(`✅ Storyboard approved for video ${videoId}`);

          return successResponse({
            status: "storyboard_approved" as VideoStatus,
            message:
              "Storyboard approved. You can now proceed to asset generation.",
          });
        } else {
          // Reject storyboard: return to 'script_approved' status for revision
          await session.run(
            `MATCH (v:VideoProject {id: $videoId})
             SET v.status = 'script_approved',
                 v.updatedAt = datetime($now)
             RETURN v`,
            { videoId, now },
          );

          console.log(`❌ Storyboard rejected for video ${videoId}`);

          return successResponse({
            status: "script_approved" as VideoStatus,
            message:
              "Storyboard rejected. Please regenerate with new parameters.",
          });
        }
      } finally {
        await session.close();
      }
    } catch (error) {
      console.error("Error approving storyboard:", error);
      const message = error instanceof Error ? error.message : "Unknown error";
      return errorResponse(message, 500, "SERVER_ERROR");
    }
  }

  // POST /api/videos/:videoId/generate-assets - Asset Generator
  if (
    path.match(/^\/api\/videos\/[^/]+\/generate-assets$/) && method === "POST"
  ) {
    try {
      const videoId = path.split("/")[3];
      const session = getSession();

      try {
        // Fetch video project and its approved storyboard with scenes
        const result = await session.run(
          `MATCH (v:VideoProject {id: $videoId})-[:HAS_STORYBOARD]->(sb:Storyboard)
           MATCH (sb)-[:HAS_SCENE]->(sc:StoryboardScene)
           WITH v, sb, sc
           ORDER BY sc.order
           WITH v, sb, collect(sc) as scenes
           RETURN v, sb, scenes`,
          { videoId },
        );

        if (result.records.length === 0) {
          return errorResponse("Video or storyboard not found", 404, "NOT_FOUND");
        }

        const record = result.records[0];
        const videoProps = record.get("v").properties;
        const storyboardProps = record.get("sb").properties;
        const scenes = record.get("scenes").map((sceneNode: any) =>
          sceneNode.properties
        );

        // Check if video is in correct status (allow regeneration from later stages)
        const validStatuses = ["storyboard_approved", "assets_review", "assets_approved", "rendering", "complete"];
        if (!validStatuses.includes(videoProps.status)) {
          return errorResponse(
            `Cannot generate assets. Video status is '${videoProps.status}' but must be one of: ${validStatuses.join(", ")}`,
            400,
            "INVALID_STATUS",
          );
        }

        // If regenerating, delete old assets first
        if (videoProps.status !== "storyboard_approved") {
          console.log(`🗑️  Deleting old assets before regeneration...`);
          await session.run(
            `MATCH (v:VideoProject {id: $videoId})-[:HAS_ASSET]->(a:Asset)
             DETACH DELETE a`,
            { videoId },
          );
        }

        console.log(
          `🎨 Generating assets for video ${videoId} with ${scenes.length} scenes...`,
        );

        // Prepare Asset Generator input from storyboard scenes
        const assetsInput: AssetGeneratorInput = {
          scenes: scenes.map((sc: any) => ({
            order: typeof sc.order === "number" ? sc.order : sc.order.toNumber(),
            description: sc.description,
            imagePrompt: sc.imagePrompt,
          })),
          isPremium: videoProps.isPremium || false,
        };

        // Generate assets (with detailed error handling)
        let assetsOutput: AssetGeneratorOutput;
        try {
          assetsOutput = await generateAssets(assetsInput);
          console.log(`✅ Assets generated: ${assetsOutput.assets.length}`);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : "Unknown error";

          // Provide user-friendly error message for content policy violations
          if (errorMessage.includes("content filters")) {
            console.error("❌ Asset generation blocked by content filters");
            return errorResponse(
              "OpenAI blocked the image generation due to content policy violations. Please try a different topic or style. Avoid violent, adult, or otherwise inappropriate content.",
              400,
              "CONTENT_POLICY_VIOLATION",
            );
          }

          console.error("❌ Asset generation failed:", errorMessage);
          return errorResponse(
            `Failed to generate assets: ${errorMessage}`,
            500,
            "ASSET_GENERATION_FAILED",
          );
        }

        // Store Asset nodes in database
        console.log(`📝 Storing ${assetsOutput.assets.length} assets...`);

        for (const asset of assetsOutput.assets) {
          const assetId = generateId();

          // Find the corresponding scene in the database
          const sceneOrder = parseInt(asset.sceneId.replace("scene-", ""));
          const sceneResult = await session.run(
            `MATCH (sb:Storyboard {id: $storyboardId})-[:HAS_SCENE]->(sc:StoryboardScene {order: $order})
             RETURN sc`,
            { storyboardId: storyboardProps.id, order: sceneOrder },
          );

          if (sceneResult.records.length === 0) {
            console.warn(`⚠️  Scene ${sceneOrder} not found, skipping asset storage`);
            continue;
          }

          const actualSceneId = sceneResult.records[0].get("sc").properties.id;

          await session.run(
            `MATCH (v:VideoProject {id: $videoId})
             CREATE (a:Asset {
               id: $assetId,
               sceneId: $sceneId,
               sceneOrder: $sceneOrder,
               type: $type,
               url: $url,
               generatedBy: 'dalle3',
               cost: $cost,
               tags: [],
               reuseCount: 0,
               createdAt: datetime()
             })
             CREATE (v)-[:HAS_ASSET]->(a)
             RETURN a`,
            {
              videoId,
              assetId,
              sceneId: actualSceneId,
              sceneOrder: sceneOrder,
              type: asset.type,
              url: asset.url,
              cost: asset.cost,
            },
          );
        }

        // Update video status
        await session.run(
          `MATCH (v:VideoProject {id: $videoId})
           SET v.status = 'assets_review', v.updatedAt = datetime()
           RETURN v`,
          { videoId },
        );

        console.log(`✅ Assets stored in database. Video status: assets_review`);

        return successResponse({
          assets: assetsOutput.assets,
          totalCost: assetsOutput.assets.reduce((sum, a) => sum + a.cost, 0),
        });
      } finally {
        await session.close();
      }
    } catch (error) {
      console.error("Error generating assets:", error);
      const message = error instanceof Error ? error.message : "Unknown error";
      return errorResponse(message, 500, "SERVER_ERROR");
    }
  }

  // POST /api/videos/:videoId/assets/approve - Assets approval checkpoint
  if (
    path.match(/^\/api\/videos\/[^/]+\/assets\/approve$/) && method === "POST"
  ) {
    try {
      const videoId = path.split("/")[3];
      console.log(`🎨 Approve assets request for video ${videoId}`);

      const body: ApproveAssetsRequest = await req.json();
      console.log(`   Request body:`, JSON.stringify(body));

      // Validate request body
      if (typeof body.approved !== "boolean") {
        console.error(`   ❌ Invalid request body: approved is not a boolean`);
        return errorResponse(
          "Request body must include 'approved' boolean field",
          400,
          "INVALID_REQUEST",
        );
      }

      const session = getSession();
      try {
        // Fetch video and assets
        const result = await session.run(
          `MATCH (v:VideoProject {id: $videoId})-[:HAS_ASSET]->(a:Asset)
           WITH v, collect(a) as assets
           RETURN v, assets`,
          { videoId },
        );

        if (result.records.length === 0) {
          console.error(`   ❌ Video or assets not found`);
          return errorResponse(
            "Video or assets not found",
            404,
            "NOT_FOUND",
          );
        }

        const record = result.records[0];
        const videoProps = record.get("v").properties;
        console.log(`   Current video status: ${videoProps.status}`);

        // Verify video is in correct status (or later - allow going back and re-approving)
        const validStatuses = ["assets_review", "assets_approved", "rendering", "complete"];
        if (!validStatuses.includes(videoProps.status)) {
          console.error(`   ❌ Invalid status: ${videoProps.status} not in ${validStatuses.join(", ")}`);
          return errorResponse(
            `Cannot approve assets. Video status is '${videoProps.status}' but must be one of: ${validStatuses.join(", ")}`,
            400,
            "INVALID_STATUS",
          );
        }
        console.log(`   ✓ Status validation passed`);

        const now = new Date().toISOString();

        // Handle asset revisions if provided
        if (body.assetRevisions && body.assetRevisions.length > 0) {
          for (const revision of body.assetRevisions) {
            // Store revision request (actual regeneration would happen separately)
            await session.run(
              `MATCH (a:Asset {id: $assetId})
               SET a.revisionRequested = true,
                   a.revisionPrompt = $newPrompt,
                   a.updatedAt = datetime($now)
               RETURN a`,
              { assetId: revision.assetId, newPrompt: revision.newPrompt, now },
            );
          }
          console.log(
            `🔧 Requested revision for ${body.assetRevisions.length} asset(s) for video ${videoId}`,
          );
        }

        if (body.approved) {
          // Approve assets: update status to 'assets_approved' (ready for rendering)
          await session.run(
            `MATCH (v:VideoProject {id: $videoId})
             SET v.status = 'assets_approved',
                 v.updatedAt = datetime($now)
             RETURN v`,
            { videoId, now },
          );

          console.log(`✅ Assets approved for video ${videoId}`);

          return successResponse({
            status: "assets_approved" as VideoStatus,
            message: "Assets approved. You can now proceed to video rendering.",
          });
        } else {
          // Reject assets: return to 'storyboard_approved' status for regeneration
          await session.run(
            `MATCH (v:VideoProject {id: $videoId})
             SET v.status = 'storyboard_approved',
                 v.updatedAt = datetime($now)
             RETURN v`,
            { videoId, now },
          );

          console.log(`❌ Assets rejected for video ${videoId}`);

          return successResponse({
            status: "storyboard_approved" as VideoStatus,
            message: "Assets rejected. Please regenerate assets.",
          });
        }
      } finally {
        await session.close();
      }
    } catch (error) {
      console.error("Error approving assets:", error);
      const message = error instanceof Error ? error.message : "Unknown error";
      return errorResponse(message, 500, "SERVER_ERROR");
    }
  }

  // POST /api/videos/:videoId/render - Video Assembler
  if (path.match(/^\/api\/videos\/[^/]+\/render$/) && method === "POST") {
    try {
      const videoId = path.split("/")[3];
      const session = getSession();

      try {
        // Fetch video project with script, scenes, and assets
        const result = await session.run(
          `MATCH (v:VideoProject {id: $videoId})-[:HAS_SCRIPT]->(s:Script)
           MATCH (s)-[:HAS_SCENE]->(sc:SceneScript)
           MATCH (v)-[:HAS_ASSET]->(a:Asset)
           WITH v, s, sc, a
           ORDER BY sc.order
           WITH v, s, collect(DISTINCT sc) as scenes, collect(DISTINCT a) as assets
           RETURN v, s, scenes, assets`,
          { videoId },
        );

        if (result.records.length === 0) {
          return errorResponse(
            "Video, script, or assets not found",
            404,
            "NOT_FOUND",
          );
        }

        const record = result.records[0];
        const videoProps = record.get("v").properties;
        const scenes = record.get("scenes").map((node: any) => node.properties);
        const assets = record.get("assets").map((node: any) => node.properties);

        // Check if video is in correct status
        if (videoProps.status !== "assets_approved") {
          return errorResponse(
            `Cannot render video. Video status is '${videoProps.status}' but must be 'assets_approved'`,
            400,
            "INVALID_STATUS",
          );
        }

        console.log(
          `🎬 Rendering video ${videoId} with ${scenes.length} scenes and ${assets.length} assets...`,
        );

        // Build VideoScene objects by matching scenes with assets
        // Filter out scenes without matching assets (due to content policy violations)
        const videoScenes: VideoScene[] = scenes
          .map((sc: any) => {
            // Find matching asset for this scene (by scene order)
            const sceneOrder = typeof sc.order === "number"
              ? sc.order
              : sc.order.toNumber();

            const matchingAsset = assets.find((asset: any) => {
              const assetSceneOrder = typeof asset.sceneOrder === "number"
                ? asset.sceneOrder
                : asset.sceneOrder.toNumber();
              return assetSceneOrder === sceneOrder;
            });

            if (!matchingAsset) {
              console.warn(
                `⚠️  No asset found for scene ${sceneOrder}. Skipping this scene in video.`,
              );
              return null;
            }

            return {
              order: typeof sc.order === "number" ? sc.order : sc.order.toNumber(),
              narration: sc.narration,
              startTime: typeof sc.startTime === "number"
                ? sc.startTime
                : sc.startTime.toNumber(),
              endTime: typeof sc.endTime === "number"
                ? sc.endTime
                : sc.endTime.toNumber(),
              assetUrl: matchingAsset.url,
              transition: "fade", // Default transition
            };
          })
          .filter((scene): scene is VideoScene => scene !== null);

        // Ensure we have at least one scene with an asset
        if (videoScenes.length === 0) {
          return errorResponse(
            "Cannot render video: No valid scenes with assets. All assets may have been blocked by content filters. Please regenerate with different prompts.",
            400,
            "NO_VALID_SCENES",
          );
        }

        console.log(`✅ Using ${videoScenes.length} scenes with assets for rendering`);

        // Prepare Video Assembler input
        const assemblerInput: VideoAssemblerInput = {
          videoId,
          language: videoProps.language as "zh" | "en" | "fr",
          scenes: videoScenes,
          duration: typeof videoProps.duration === "number"
            ? videoProps.duration as 30 | 60 | 90
            : videoProps.duration.toNumber() as 30 | 60 | 90,
        };

        // Call Video Assembler Agent
        const assemblerOutput: VideoAssemblerOutput = await assembleVideo(
          assemblerInput,
        );

        console.log(`✅ Video rendering complete:`, {
          duration: assemblerOutput.duration,
          fileSize: `${(assemblerOutput.fileSize / 1024 / 1024).toFixed(2)}MB`,
          cost: `$${assemblerOutput.cost.toFixed(4)}`,
        });

        // Create Video node in database
        const now = new Date().toISOString();
        await session.run(
          `MATCH (v:VideoProject {id: $videoId})
           CREATE (vid:Video {
             id: randomUUID(),
             videoProjectId: $videoId,
             url: $url,
             audioUrl: $audioUrl,
             subtitlesUrl: $subtitlesUrl,
             duration: $duration,
             fileSize: $fileSize,
             format: $format,
             resolution: $resolution,
             cost: $cost,
             createdAt: datetime($now)
           })
           CREATE (v)-[:HAS_VIDEO]->(vid)
           SET v.status = 'ready', v.updatedAt = datetime($now)
           RETURN vid`,
          {
            videoId,
            url: assemblerOutput.videoUrl,
            audioUrl: assemblerOutput.audioUrl,
            subtitlesUrl: assemblerOutput.subtitlesUrl || null,
            duration: assemblerOutput.duration,
            fileSize: assemblerOutput.fileSize,
            format: assemblerOutput.format,
            resolution: assemblerOutput.resolution,
            cost: assemblerOutput.cost,
            now,
          },
        );

        console.log(`✅ Video stored in database. Video status: ready`);

        return successResponse(assemblerOutput);
      } finally {
        await session.close();
      }
    } catch (error) {
      console.error("Error rendering video:", error);
      const message = error instanceof Error ? error.message : "Unknown error";
      return errorResponse(message, 500, "SERVER_ERROR");
    }
  }

  // ========================================================================
  // Download Endpoints
  // ========================================================================

  // GET /api/videos/:videoId/download - Download video file
  if (path.match(/^\/api\/videos\/[^/]+\/download$/) && method === "GET") {
    try {
      const videoId = path.split("/")[3];
      const session = getSession();

      try {
        // Fetch video file path from database
        const result = await session.run(
          `MATCH (v:VideoProject {id: $videoId})-[:HAS_VIDEO]->(vid:Video)
           RETURN vid.url as url, vid.format as format`,
          { videoId }
        );

        if (result.records.length === 0) {
          return errorResponse("Video not found or not ready", 404, "NOT_FOUND");
        }

        const videoUrl = result.records[0].get("url");
        const format = result.records[0].get("format") || "mp4";

        // Read video file
        const videoData = await Deno.readFile(videoUrl);

        return new Response(videoData, {
          status: 200,
          headers: {
            "Content-Type": `video/${format}`,
            "Content-Disposition": `attachment; filename="video_${videoId}.${format}"`,
            ...corsHeaders,
          },
        });
      } finally {
        await session.close();
      }
    } catch (error) {
      console.error("Error downloading video:", error);
      const message = error instanceof Error ? error.message : "Unknown error";
      return errorResponse(message, 500, "SERVER_ERROR");
    }
  }

  // GET /api/videos/:videoId/subtitles - Download subtitles file
  if (path.match(/^\/api\/videos\/[^/]+\/subtitles$/) && method === "GET") {
    try {
      const videoId = path.split("/")[3];
      const session = getSession();

      try {
        // Fetch subtitles file path from database
        const result = await session.run(
          `MATCH (v:VideoProject {id: $videoId})-[:HAS_VIDEO]->(vid:Video)
           RETURN vid.subtitlesUrl as url`,
          { videoId }
        );

        if (result.records.length === 0 || !result.records[0].get("url")) {
          return errorResponse("Subtitles not found", 404, "NOT_FOUND");
        }

        const subtitlesUrl = result.records[0].get("url");

        // Read subtitles file
        const subtitlesData = await Deno.readFile(subtitlesUrl);

        return new Response(subtitlesData, {
          status: 200,
          headers: {
            "Content-Type": "text/plain",
            "Content-Disposition": `attachment; filename="subtitles_${videoId}.srt"`,
            ...corsHeaders,
          },
        });
      } finally {
        await session.close();
      }
    } catch (error) {
      console.error("Error downloading subtitles:", error);
      const message = error instanceof Error ? error.message : "Unknown error";
      return errorResponse(message, 500, "SERVER_ERROR");
    }
  }

  // ========================================================================
  // 404 Not Found
  // ========================================================================

  return errorResponse("Not found", 404, "NOT_FOUND");
}

// ============================================================================
// Server Initialization
// ============================================================================

async function startServer() {
  try {
    console.log("🚀 Starting Cold-Start Video Generation System...");

    // Initialize database connection
    console.log("📊 Connecting to Neo4j database...");
    initDriver();

    // Check database connection
    const isConnected = await checkConnection();
    if (!isConnected) {
      throw new Error("Failed to connect to Neo4j database");
    }

    // Initialize database schema
    console.log("🔧 Initializing database schema...");
    await initSchema();

    // Initialize file storage
    console.log("📁 Initializing file storage...");
    await initStorage();

    // Start HTTP server
    console.log(`🌐 Starting HTTP server on ${HOST}:${PORT}...`);
    Deno.serve(
      {
        hostname: HOST,
        port: PORT,
        onListen: ({ hostname, port }) => {
          console.log("\n✅ Server running!");
          console.log(`   URL: http://${hostname}:${port}`);
          console.log(`   API: http://${hostname}:${port}/api`);
          console.log(`   Health: http://${hostname}:${port}/health\n`);
        },
      },
      handler,
    );
  } catch (error) {
    console.error("❌ Failed to start server:", error);
    await closeDriver();
    Deno.exit(1);
  }
}

// Handle shutdown gracefully
Deno.addSignalListener("SIGINT", async () => {
  console.log("\n👋 Shutting down gracefully...");
  await closeDriver();
  Deno.exit(0);
});

Deno.addSignalListener("SIGTERM", async () => {
  console.log("\n👋 Shutting down gracefully...");
  await closeDriver();
  Deno.exit(0);
});

// Start the server
if (import.meta.main) {
  startServer();
}
