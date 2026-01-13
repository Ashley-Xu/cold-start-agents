# Cold-Start Video Generation System - Implementation Plan

**Project**: cold-start-agents (Solving the cold start problem for LingoWhales)
**Last Updated**: 2025-12-30
**Status**: Planning Phase
**Target**: 1000+ short-form videos/month (30-90s) in Chinese, English, French
**Budget**: <$500/month
**Content**: 90% storytelling, 10% educational

---

## Executive Summary

Building an agentic video generation system (cold-start) to create 1000+ multilingual story videos/month for LingoWhales at <$0.50 per video. This system solves the cold start problem by generating initial content at scale. **Critical constraint**: Sora pricing (~$6-36 per video) makes budget impossible, requiring cost-effective alternatives.

**Solution**: Hybrid approach using AI-generated images + motion effects + TTS, with strategic Sora usage only for premium content.

---

## Critical Budget Analysis

**Target**: 1000 videos/month at <$500 = **$0.50 per video max**

**Current Pricing Reality**:
- **Sora**: ~$0.20-0.40/second → 30-90s video = **$6-36 per video** ❌
- **ElevenLabs TTS**: ~$0.15-0.30/1000 chars → ~300 chars/video = **$0.05-0.10 per video** ✅
- **GPT-4o-mini**: ~$0.15/1M tokens → ~2K tokens/video = **$0.0003 per video** ✅
- **Image Generation (DALL-E 3)**: ~$0.04/image → 3-5 images/video = **$0.12-0.20 per video** ✅

**Affordable Approach** (Total: ~$0.20-0.35 per video):
1. GPT-4o-mini for script generation: $0.0003
2. DALL-E 3 for 3-5 story images: $0.12-0.20
3. ElevenLabs TTS for narration: $0.05-0.10
4. Template-based motion effects (free, local processing)
5. Video assembly with FFmpeg (free)

**Premium Option** (5% of videos with Sora):
- 950 videos/month with cheap pipeline: ~$285/month
- 50 videos/month with Sora (30s shorts): ~$210/month
- **Total**: ~$495/month ✅

---

## System Architecture

### Tech Stack

**Backend**:
- **Runtime**: Deno 2.x (same as LangUp for consistency)
- **Database**: Neo4j (graph relationships for assets, scripts, scenes)
- **AI Framework**: Mastra for agent orchestration
- **LLM**: GPT-4o-mini for planning/scripting
- **Image Generation**: DALL-E 3 (OpenAI)
- **Video Generation**: Hybrid (DALL-E + motion effects for most, Sora for premium 5%)
- **Audio/TTS**: ElevenLabs API
- **Video Assembly**: FFmpeg (local processing, no cost)

**Frontend**:
- **Framework**: React (as requested)
- **State Management**: Context API + React Query
- **UI Library**: Tailwind CSS + shadcn/ui
- **Video Preview**: React Player
- **Multi-stage Approval**: Stepper component with review interfaces

### Agent Architecture (5 Agents)

Based on LangUp's 4-agent pattern, adapted for video generation:

**1. Story Analyzer Agent** (`backend/ai/agents/storyAnalyzer.ts`)
- **Input**: Topic, target language, style preferences, duration (30-90s)
- **Output**: Story concept, key themes, character descriptions, mood/tone
- **Role**: Analyzes story requirements and validates feasibility
- **Cost**: ~$0.0001 per story (GPT-4o-mini, ~500 tokens)

**2. Script Writer Agent** (`backend/ai/agents/scriptWriter.ts`)
- **Input**: Story concept from analyzer, target language, duration
- **Output**: Timestamped script with narration, scene descriptions, dialogue
- **Role**: Generates production-ready multilingual scripts
- **Features**:
  - Supports Chinese, English, French
  - Timestamps for scene transitions
  - Character dialogue vs narration
  - Word count targeting (30s = ~75 words, 90s = ~225 words)
- **Cost**: ~$0.0002 per script (GPT-4o-mini, ~1000 tokens)

**3. Scene Planner Agent** (`backend/ai/agents/scenePlanner.ts`)
- **Input**: Script with timestamps, visual style preferences
- **Output**: Storyboard (scene-by-scene breakdown with image prompts)
- **Role**: Creates visual plan for video
- **Features**:
  - 3-7 scenes per video (optimal for 30-90s)
  - DALL-E 3 image generation prompts
  - Camera angles, composition notes
  - Transition suggestions
  - Asset reuse recommendations (cost optimization)
- **Cost**: ~$0.0001 per storyboard (GPT-4o-mini, ~800 tokens)

**4. Asset Generator Agent** (`backend/ai/agents/assetGenerator.ts`)
- **Input**: Scene descriptions, image prompts from planner
- **Output**: Generated/retrieved visual assets (images, video clips)
- **Role**: Generates images or retrieves reusable assets
- **Features**:
  - DALL-E 3 integration for image generation
  - Asset similarity search in Neo4j (reuse existing assets)
  - Sora integration for premium videos (5% of production)
  - Parallel asset generation (5-10 concurrent)
  - Caching strategy (similar scenes → reuse assets)
- **Cost**:
  - Standard (DALL-E 3): $0.12-0.20 per video (3-5 images)
  - Premium (Sora): $6-12 per video (30-60s clips)

**5. Video Assembler Agent** (`backend/ai/agents/videoAssembler.ts`)
- **Input**: Script, scenes, visual assets, audio files
- **Output**: Rendered video file (MP4)
- **Role**: Orchestrates final video assembly
- **Features**:
  - ElevenLabs TTS integration (voice synthesis)
  - FFmpeg video assembly (images + audio + effects)
  - Motion effects (Ken Burns, fade, zoom)
  - Subtitle generation (multilingual)
  - Transition effects
  - Background music (royalty-free library)
- **Cost**: $0.05-0.10 per video (ElevenLabs TTS only, FFmpeg is free)

---

## Neo4j Database Schema

```
User
  └─ CREATED → VideoProject
                 ├─ status: draft | script_approved | storyboard_approved | rendering | ready | failed
                 ├─ language: "zh" | "en" | "fr"
                 ├─ duration: 30 | 60 | 90 (seconds)
                 ├─ isPremium: boolean (true = use Sora)
                 │
                 ├─ HAS_SCRIPT → Script
                 │                ├─ text: string
                 │                ├─ wordCount: number
                 │                ├─ approvedAt: timestamp | null
                 │                └─ HAS_SCENE → SceneScript
                 │                                 ├─ order: number
                 │                                 ├─ narration: string
                 │                                 ├─ startTime: number
                 │                                 ├─ endTime: number
                 │
                 ├─ HAS_STORYBOARD → Storyboard
                 │                     ├─ approvedAt: timestamp | null
                 │                     └─ HAS_SCENE → StoryboardScene
                 │                                      ├─ order: number
                 │                                      ├─ description: string
                 │                                      ├─ imagePrompt: string
                 │                                      ├─ cameraAngle: string
                 │                                      ├─ transition: string
                 │
                 ├─ HAS_ASSET → Asset
                 │               ├─ type: "image" | "video_clip" | "audio" | "music"
                 │               ├─ url: string (S3 or local path)
                 │               ├─ generatedBy: "dalle3" | "sora" | "elevenlabs" | "library"
                 │               ├─ cost: number
                 │               ├─ embedding: vector (for similarity search)
                 │               ├─ tags: string[]
                 │               ├─ reuseCount: number (tracks asset reuse)
                 │
                 └─ HAS_VIDEO → Video
                                 ├─ url: string
                                 ├─ duration: number
                                 ├─ fileSize: number
                                 ├─ format: "mp4"
                                 ├─ resolution: "1080x1920" (vertical)
                                 ├─ totalCost: number
                                 ├─ renderedAt: timestamp
```

**Key Optimizations**:
1. **Asset Embeddings**: Vector embeddings on assets enable similarity search for reuse
2. **Reuse Tracking**: `reuseCount` field tracks how often assets are reused (cost savings metric)
3. **Cost Tracking**: Each asset and final video tracks generation cost (budget monitoring)
4. **Approval Timestamps**: `approvedAt` fields track multi-stage approval workflow

---

## API Endpoints

**Base Path**: `/api/`

### Video Project Management

1. **POST /api/videos**
   - Create new video project
   - Body: `{ topic, language, duration, isPremium, userId }`
   - Returns: `{ videoId, status: "draft" }`

2. **GET /api/videos**
   - List user's video projects
   - Query: `?userId={userId}&status={status}&language={language}`
   - Returns: `{ videos: [...] }`

3. **GET /api/videos/:videoId**
   - Get video project details
   - Returns: `{ video, script?, storyboard?, assets?, renderedVideo? }`

### Multi-Stage Workflow Endpoints

4. **POST /api/videos/:videoId/analyze**
   - Story Analyzer Agent
   - Body: `{ userFeedback? }` (optional, for iterative refinement)
   - Returns: `{ concept, themes, characters, mood }`

5. **POST /api/videos/:videoId/script**
   - Script Writer Agent
   - Body: `{ concept, approvalNotes? }`
   - Returns: `{ script, scenes, wordCount }`

6. **POST /api/videos/:videoId/script/approve**
   - Human approval checkpoint
   - Body: `{ approved: boolean, revisionNotes? }`
   - Returns: `{ status: "script_approved" | "draft" }`

7. **POST /api/videos/:videoId/storyboard**
   - Scene Planner Agent
   - Body: `{ script }`
   - Returns: `{ storyboard, scenes: [{order, description, imagePrompt}] }`

8. **POST /api/videos/:videoId/storyboard/approve**
   - Human approval checkpoint
   - Body: `{ approved: boolean, sceneRevisions?: [{sceneId, newPrompt}] }`
   - Returns: `{ status: "storyboard_approved" | "draft" }`

9. **POST /api/videos/:videoId/generate-assets**
   - Asset Generator Agent (async)
   - Generates images/video clips based on storyboard
   - Returns: `{ jobId, status: "generating_assets" }`

10. **GET /api/videos/:videoId/assets**
    - Get generated assets for preview
    - Returns: `{ assets: [{type, url, sceneId}] }`

11. **POST /api/videos/:videoId/assets/approve**
    - Human approval checkpoint (pre-render review)
    - Body: `{ approved: boolean, assetRevisions?: [{assetId, newPrompt}] }`
    - Returns: `{ status: "assets_approved" | "storyboard_approved" }`

12. **POST /api/videos/:videoId/render**
    - Video Assembler Agent (async)
    - Assembles final video with TTS, motion effects, transitions
    - Returns: `{ jobId, status: "rendering" }`

13. **GET /api/videos/:videoId/status**
    - Poll rendering progress
    - Returns: `{ status, progress: 0-100, estimatedTimeRemaining? }`

### Cost Tracking

14. **GET /api/analytics/costs**
    - Query: `?userId={userId}&startDate={date}&endDate={date}`
    - Returns: `{ totalCost, videoCount, averageCostPerVideo, breakdown: {...} }`

---

## Workflows

### Main Workflow: Video Generation Pipeline

**File**: `backend/ai/workflows/videoGenerationWorkflow.ts`

**Phases** (based on LangUp's 6-phase pattern):

**Phase 1: Story Analysis** (5-10 seconds)
- Story Analyzer Agent processes topic/language/duration
- Returns concept, themes, characters, mood
- Status: `draft → analyzing`

**Phase 2: Script Generation** (10-15 seconds)
- Script Writer Agent generates timestamped script
- Calculates word count, scene breakdown
- Status: `analyzing → script_review`
- **APPROVAL CHECKPOINT**: Human reviews script

**Phase 3: Storyboard Planning** (15-20 seconds)
- Scene Planner Agent creates visual storyboard
- Generates 3-7 scenes with image prompts
- Checks asset library for reusable assets (cost optimization)
- Status: `script_approved → storyboard_review`
- **APPROVAL CHECKPOINT**: Human reviews storyboard

**Phase 4: Asset Generation** (30-90 seconds, parallel)
- Asset Generator Agent creates/retrieves assets
- **Parallel Processing**: 5-10 concurrent image generations
- **Asset Reuse**: Similarity search for existing assets (saves $0.04-0.10 per reused asset)
- **Premium Logic**: If `isPremium=true`, use Sora for video clips
- Status: `storyboard_approved → generating_assets`
- **Stores assets in Neo4j with embeddings**

**Phase 5: Asset Review** (manual)
- Human previews generated images/clips
- Can request regeneration of specific assets
- Status: `generating_assets → assets_review`
- **APPROVAL CHECKPOINT**: Human approves assets

**Phase 6: Audio Generation** (20-40 seconds)
- ElevenLabs TTS generates narration audio
- Voice selection based on language (Chinese/English/French voices)
- Subtitle generation (SRT format)
- Background music selection (from royalty-free library)
- Status: `assets_approved → generating_audio`

**Phase 7: Video Assembly** (40-90 seconds)
- FFmpeg assembles images + audio + effects
- Motion effects: Ken Burns (pan/zoom on images), fade transitions
- Subtitle overlay
- Resolution: 1080x1920 (vertical for TikTok/Reels)
- Format: MP4 (H.264 codec, AAC audio)
- Status: `generating_audio → rendering → ready`

**Phase 8: Finalization**
- Update video status to `ready`
- Calculate total cost (sum of all asset costs + TTS)
- Store final video URL and metadata
- **Status**: `rendering → ready`

**Total Time Estimate**:
- **Analysis → Script → Storyboard**: 30-45 seconds
- **Asset Generation** (3-5 images): 30-90 seconds
- **Audio Generation**: 20-40 seconds
- **Video Assembly**: 40-90 seconds
- **Total (excluding human reviews)**: ~2-4 minutes per video

**Parallel Optimization**:
- Phase 4: 5-10 concurrent asset generations (use `Promise.allSettled`)
- Phase 6: Audio generation can start while assets are being reviewed
- Similar to LangUp's 38% performance improvement via parallelization

---

## Cost Optimization Strategies

### 1. Asset Reuse System

**Problem**: Generating 3-5 images per video × 1000 videos = 3000-5000 images/month = $120-200

**Solution**: Asset similarity search and reuse

**Implementation**:
- Store embeddings for all generated assets in Neo4j
- Before generating new asset, query similar assets (cosine similarity > 0.85)
- If similar asset exists, reuse it (saves $0.04 per image)
- Track `reuseCount` to measure optimization impact

**Expected Savings**:
- 30% asset reuse rate → ~1000 reused images/month = **~$40/month saved**

**Code Pattern** (from LangUp):
```typescript
// Query similar assets
const result = await session.run(`
  MATCH (a:Asset)
  WHERE a.type = 'image' AND a.tags CONTAINS $theme
  RETURN a
  ORDER BY vector.similarity(a.embedding, $queryEmbedding) DESC
  LIMIT 5
`, { theme, queryEmbedding });

if (result.records.length > 0 && similarity > 0.85) {
  // Reuse existing asset
  await session.run(`
    MATCH (a:Asset {id: $assetId})
    SET a.reuseCount = a.reuseCount + 1
    RETURN a
  `, { assetId });
}
```

### 2. Batch Processing

**Pattern** (from LangUp's batch inserts):
- Batch DALL-E 3 requests (up to 10 concurrent)
- Batch Neo4j inserts (single UNWIND query for all assets)
- Reduces API overhead

**Implementation**:
```typescript
// Parallel asset generation (similar to LangUp's passage extraction)
const assetPromises = scenes.map(async (scene, idx) => {
  // Check for reusable asset first
  const reusableAsset = await findSimilarAsset(scene.imagePrompt);
  if (reusableAsset) return reusableAsset;

  // Generate new asset
  return await generateImage(scene.imagePrompt);
});

const results = await Promise.allSettled(assetPromises); // Max 10 concurrent

// Batch database insert
await session.run(`
  UNWIND $assets AS asset
  CREATE (a:Asset {
    id: asset.id,
    type: asset.type,
    url: asset.url,
    embedding: asset.embedding,
    tags: asset.tags,
    cost: asset.cost,
    reuseCount: 0
  })
  RETURN a
`, { assets: successfulAssets });
```

### 3. Caching Strategy

**Cache Types**:
1. **Voice Cache**: Cache TTS for common phrases (greetings, transitions)
2. **Music Cache**: Reuse background music across videos (royalty-free library)
3. **Template Cache**: Store common scene templates (e.g., "forest background", "city street")

**Expected Savings**:
- Voice caching: ~10% TTS cost reduction = **~$5/month**
- Music reuse: 100% savings on music (use free library)

### 4. Premium Tier Strategy

**Approach**:
- 95% of videos use cheap pipeline (DALL-E 3 + motion effects) = ~$0.20-0.35 per video
- 5% of videos use Sora for premium quality = ~$6-12 per video

**Budget Allocation**:
- 950 cheap videos: 950 × $0.30 = **$285/month**
- 50 premium videos: 50 × $8 = **$400/month** (30s Sora clips)
- **Total**: ~$685/month ⚠️ (still over budget)

**Revised Allocation** (to hit $500 budget):
- 980 cheap videos: 980 × $0.25 = **$245/month**
- 20 premium videos: 20 × $12 = **$240/month** (60s Sora clips)
- **Total**: **$485/month** ✅

**Recommendation**: Start with 0% premium (all cheap), add Sora only when user upgrades budget

### 5. Error Handling & Retry Logic

**Pattern** (from LangUp):
- Use `Promise.allSettled` for parallel operations
- Retry failed generations (max 2 retries)
- Fallback to simpler prompts if generation fails
- Track failures in database for debugging

**Cost Impact**:
- Failed generations can waste money (e.g., failed Sora call = $6-12 lost)
- Robust error handling prevents unnecessary retries

---

## React Frontend Architecture

### Component Structure

```
src/
├── components/
│   ├── video-creator/
│   │   ├── StepperNav.tsx          # Multi-stage progress indicator
│   │   ├── TopicInput.tsx          # Step 1: Topic/language/duration input
│   │   ├── ScriptReview.tsx        # Step 2: Review & approve script
│   │   ├── StoryboardReview.tsx    # Step 3: Review & approve storyboard
│   │   ├── AssetPreview.tsx        # Step 4: Preview generated assets
│   │   ├── VideoPreview.tsx        # Step 5: Final video preview
│   │   └── CostTracker.tsx         # Real-time cost display
│   │
│   ├── video-library/
│   │   ├── VideoGrid.tsx           # List all videos
│   │   ├── VideoCard.tsx           # Individual video item
│   │   ├── FilterBar.tsx           # Filter by language/status
│   │   └── BulkActions.tsx         # Batch operations
│   │
│   └── ui/
│       └── (shadcn/ui components)
│
├── pages/
│   ├── DashboardPage.tsx           # Overview + analytics
│   ├── CreateVideoPage.tsx         # Multi-step video creation
│   ├── VideoLibraryPage.tsx        # Browse all videos
│   ├── VideoDetailsPage.tsx        # Single video view
│   └── AnalyticsPage.tsx           # Cost/usage analytics
│
├── lib/
│   ├── api.ts                      # API client (similar to LangUp)
│   ├── types.ts                    # TypeScript interfaces
│   └── hooks/
│       ├── useVideoWorkflow.ts     # Video creation state machine
│       ├── useApprovalFlow.ts      # Multi-stage approval logic
│       └── useCostTracking.ts      # Real-time cost calculation
│
└── stores/
    ├── videoStore.ts               # Video project state
    └── userStore.ts                # User authentication
```

### Multi-Stage Approval UI Flow

**Step-by-step creation wizard**:

1. **Topic Input** (`TopicInput.tsx`)
   - Form: Topic text, language dropdown (zh/en/fr), duration slider (30/60/90s)
   - Premium toggle: "Use Sora for high-quality video? (+$6-12 per video)"
   - Submit → calls POST /api/videos/:videoId/analyze

2. **Script Review** (`ScriptReview.tsx`)
   - Display generated script with timestamps
   - Scene-by-scene breakdown (collapsible cards)
   - Actions: "Approve Script" or "Request Revision" (text feedback)
   - Cost indicator: "$0.0003 spent on script generation"
   - Submit → calls POST /api/videos/:videoId/script/approve

3. **Storyboard Review** (`StoryboardReview.tsx`)
   - Visual grid of scenes (3-7 cards)
   - Each card: Scene description, image prompt, camera angle
   - Inline editing: Edit prompt, regenerate individual scene
   - Cost indicator: "$0.0001 spent on storyboard planning"
   - Submit → calls POST /api/videos/:videoId/storyboard/approve

4. **Asset Preview** (`AssetPreview.tsx`)
   - Gallery view of generated images/clips
   - Each asset: Preview, cost, "Reused" badge (if applicable)
   - Actions: Regenerate individual asset, approve all
   - Real-time progress: "Generating assets... 3/5 complete"
   - Cost indicator: "$0.16 spent on assets (2 reused, saved $0.08)"
   - Submit → calls POST /api/videos/:videoId/assets/approve

5. **Video Preview** (`VideoPreview.tsx`)
   - Full video player with rendered output
   - Display: Duration, resolution, file size, total cost
   - Download button (MP4)
   - Sharing options (copy link, export metadata)
   - Analytics: "Estimated views per $1 spent: 2000-3000"

### State Management Pattern

**Use React Query for API calls** (similar to LangUp's API client):

```typescript
// lib/hooks/useVideoWorkflow.ts
export function useVideoWorkflow(videoId: string) {
  const { data: video, refetch } = useQuery({
    queryKey: ['video', videoId],
    queryFn: () => api.getVideo(videoId),
  });

  const approveScript = useMutation({
    mutationFn: (data: { approved: boolean; notes?: string }) =>
      api.approveScript(videoId, data),
    onSuccess: () => refetch(),
  });

  const generateAssets = useMutation({
    mutationFn: () => api.generateAssets(videoId),
    onSuccess: () => {
      // Start polling for asset generation status
      const pollInterval = setInterval(async () => {
        const status = await api.getVideoStatus(videoId);
        if (status.status === 'assets_ready') {
          clearInterval(pollInterval);
          refetch();
        }
      }, 3000); // Poll every 3 seconds
    },
  });

  return { video, approveScript, generateAssets };
}
```

**Cost Tracking Hook**:

```typescript
// lib/hooks/useCostTracking.ts
export function useCostTracking(videoId: string) {
  const { data: video } = useQuery({
    queryKey: ['video', videoId],
    queryFn: () => api.getVideo(videoId),
  });

  const totalCost = useMemo(() => {
    if (!video) return 0;

    const scriptCost = 0.0003;
    const storyboardCost = 0.0001;
    const assetCost = video.assets?.reduce((sum, a) => sum + a.cost, 0) || 0;
    const ttsCost = video.duration * 0.0015; // ~$0.15 per 100 seconds

    return scriptCost + storyboardCost + assetCost + ttsCost;
  }, [video]);

  const remainingBudget = 500 - totalCost * 30; // Assuming 30 videos/month

  return { totalCost, remainingBudget, isOverBudget: remainingBudget < 0 };
}
```

---

## Project Structure

```
cold-start-agents/
├── backend/
│   ├── deno.json                   # Deno config, tasks, imports
│   ├── docker-compose.yml          # Neo4j database
│   ├── .env                        # Environment variables
│   ├── main.ts                     # HTTP server + API routes
│   │
│   ├── lib/
│   │   ├── types.ts                # TypeScript interfaces
│   │   ├── neo4j.ts                # Database connection + schema
│   │   ├── storage.ts              # S3 or local file storage
│   │   └── ffmpeg.ts               # Video assembly utilities
│   │
│   ├── mastra/
│   │   ├── index.ts                # Mastra + OpenAI initialization
│   │   │
│   │   ├── agents/
│   │   │   ├── storyAnalyzer.ts    # Story concept analysis
│   │   │   ├── scriptWriter.ts     # Multilingual script generation
│   │   │   ├── scenePlanner.ts     # Storyboard planning
│   │   │   ├── assetGenerator.ts   # Image/video generation
│   │   │   └── videoAssembler.ts   # Final video assembly
│   │   │
│   │   ├── tools/
│   │   │   ├── imageGenerator.ts   # DALL-E 3 integration
│   │   │   ├── videoGenerator.ts   # Sora integration (premium)
│   │   │   ├── ttsGenerator.ts     # ElevenLabs TTS
│   │   │   ├── assetSearch.ts      # Neo4j similarity search
│   │   │   └── ffmpegAssembler.ts  # FFmpeg video assembly
│   │   │
│   │   └── workflows/
│   │       └── videoGenerationWorkflow.ts  # Main pipeline
│   │
│   └── uploads/                    # Local asset storage (temporary)
│
├── frontend/
│   ├── package.json
│   ├── tsconfig.json
│   │
│   ├── src/
│   │   ├── App.tsx                 # Main app component
│   │   ├── components/             # See component structure above
│   │   ├── pages/                  # See pages structure above
│   │   ├── lib/                    # API client, hooks, types
│   │   └── stores/                 # State management
│   │
│   └── public/
│       └── sample-music/           # Royalty-free background music
│
└── docs/
    ├── ARCHITECTURE.md             # This plan (to be created)
    ├── API.md                      # API reference
    └── COST_ANALYSIS.md            # Budget tracking guide
```

---

## Implementation Phases

### Phase 1: Backend Foundation (12-16 hours)

**Goal**: Set up backend infrastructure and database schema

**Tasks**:
1. ✅ Initialize Deno project with deno.json
   - Tasks: dev, start, test, neo4j commands
   - Imports: Mastra, OpenAI SDK, Neo4j driver, Zod

2. ✅ Set up Neo4j database
   - docker-compose.yml with Neo4j
   - Database schema initialization (schema in lib/neo4j.ts)
   - Node types: User, VideoProject, Script, Storyboard, Asset, Video
   - Relationships: HAS_SCRIPT, HAS_STORYBOARD, HAS_ASSET, HAS_VIDEO

3. ✅ Create core API endpoints (main.ts)
   - POST /api/videos (create project)
   - GET /api/videos (list projects)
   - GET /api/videos/:videoId (get details)
   - POST /api/videos/:videoId/analyze (Story Analyzer)

4. ✅ Implement TypeScript interfaces (lib/types.ts)
   - VideoProject, Script, SceneScript, Storyboard, StoryboardScene
   - Asset, Video, User
   - API request/response types

5. ✅ Set up environment variables (.env)
   - OPENAI_API_KEY
   - ELEVENLABS_API_KEY
   - NEO4J_URI, NEO4J_USERNAME, NEO4J_PASSWORD
   - S3_BUCKET (optional, for asset storage)

**Files to Create**:
- `backend/deno.json`
- `backend/docker-compose.yml`
- `backend/.env.example`
- `backend/main.ts` (basic server + 4 endpoints)
- `backend/lib/types.ts`
- `backend/lib/neo4j.ts`

**Testing**:
- Start Neo4j: `deno task neo4j:start`
- Start backend: `deno task dev`
- Test endpoints with curl/Postman

---

### Phase 2: Agent Implementation (16-20 hours)

**Goal**: Implement 5 Mastra agents for video generation pipeline

**Tasks**:

1. ✅ **Story Analyzer Agent** (2-3 hours)
   - File: `backend/ai/agents/storyAnalyzer.ts`
   - Input schema: `{ topic, language, duration, style }`
   - Output schema: `{ concept, themes, characters, mood }`
   - Instructions: Analyze story requirements, validate feasibility
   - Model: GPT-4o-mini
   - Test: Create unit test with sample topics

2. ✅ **Script Writer Agent** (3-4 hours)
   - File: `backend/ai/agents/scriptWriter.ts`
   - Input schema: `{ concept, language, duration }`
   - Output schema: `{ script, scenes: [{narration, startTime, endTime}], wordCount }`
   - Instructions: Generate timestamped multilingual scripts
   - Word count targeting: 30s = ~75 words, 90s = ~225 words
   - Support Chinese, English, French
   - Test: Generate scripts in all 3 languages, verify word counts

3. ✅ **Scene Planner Agent** (3-4 hours)
   - File: `backend/ai/agents/scenePlanner.ts`
   - Input schema: `{ script }`
   - Output schema: `{ scenes: [{order, description, imagePrompt, cameraAngle, transition}] }`
   - Instructions: Create visual storyboard, optimal 3-7 scenes
   - Generate DALL-E 3 prompts
   - Test: Verify scene count, prompt quality

4. ✅ **Asset Generator Agent** (4-5 hours)
   - File: `backend/ai/agents/assetGenerator.ts`
   - Tools: `imageGenerator`, `videoGenerator`, `assetSearch`
   - Logic:
     1. Query Neo4j for similar assets (cosine similarity > 0.85)
     2. If found, reuse asset (increment reuseCount)
     3. Else, generate new asset (DALL-E 3 or Sora)
     4. Store asset with embedding in Neo4j
   - Parallel processing: 5-10 concurrent generations
   - Test: Verify asset reuse, cost tracking

5. ✅ **Video Assembler Agent** (4-5 hours)
   - File: `backend/ai/agents/videoAssembler.ts`
   - Tools: `ttsGenerator`, `ffmpegAssembler`
   - Logic:
     1. Generate TTS audio with ElevenLabs
     2. Assemble images + audio with FFmpeg
     3. Add motion effects (Ken Burns, fade)
     4. Generate subtitles (SRT format)
     5. Overlay subtitles on video
     6. Export MP4 (1080x1920, H.264, AAC)
   - Test: Generate sample video, verify output quality

**Files to Create**:
- `backend/ai/index.ts` (Mastra initialization)
- `backend/ai/agents/storyAnalyzer.ts`
- `backend/ai/agents/scriptWriter.ts`
- `backend/ai/agents/scenePlanner.ts`
- `backend/ai/agents/assetGenerator.ts`
- `backend/ai/agents/videoAssembler.ts`

**Testing**:
- Unit tests for each agent (`backend/ai/agents/*_test.ts`)
- Integration test: Run full pipeline with sample topic

---

### Phase 3: Tools Implementation (8-12 hours)

**Goal**: Implement Mastra tools for external API integrations

**Tasks**:

1. ✅ **Image Generator Tool** (2-3 hours)
   - File: `backend/ai/tools/imageGenerator.ts`
   - Integration: OpenAI DALL-E 3 API
   - Input: `{ prompt, size: "1024x1792" }` (vertical aspect ratio)
   - Output: `{ url, cost }`
   - Error handling: Retry on failure (max 2 retries)
   - Test: Generate sample images, verify URLs

2. ✅ **Video Generator Tool** (2-3 hours)
   - File: `backend/ai/tools/videoGenerator.ts`
   - Integration: Sora API (when available)
   - Input: `{ prompt, duration: 30 | 60 }`
   - Output: `{ url, cost }`
   - Fallback: If Sora unavailable, use image + motion effects
   - Test: Mock Sora API responses for now

3. ✅ **TTS Generator Tool** (2 hours)
   - File: `backend/ai/tools/ttsGenerator.ts`
   - Integration: ElevenLabs API
   - Input: `{ text, language, voice }`
   - Voice selection: Map language → voice ID
     - Chinese: "zh-CN-XiaoxiaoNeural"
     - English: "en-US-GuyNeural"
     - French: "fr-FR-DeniseNeural"
   - Output: `{ audioUrl, duration, cost }`
   - Test: Generate audio in all 3 languages

4. ✅ **Asset Search Tool** (2-3 hours)
   - File: `backend/ai/tools/assetSearch.ts`
   - Neo4j similarity search using vector embeddings
   - Input: `{ queryEmbedding, threshold: 0.85, limit: 5 }`
   - Output: `{ assets: [{id, url, similarity, reuseCount}] }`
   - Test: Store sample assets, query similar ones

5. ✅ **FFmpeg Assembler Tool** (2-3 hours)
   - File: `backend/ai/tools/ffmpegAssembler.ts`
   - FFmpeg video assembly
   - Input: `{ images: [{url, startTime, endTime}], audioUrl, subtitles? }`
   - Process:
     1. Download images/audio to temp directory
     2. Generate FFmpeg filter_complex for motion effects
     3. Overlay subtitles if provided
     4. Export MP4 (1080x1920, 30fps, H.264, AAC)
   - Output: `{ videoUrl, fileSize, duration }`
   - Test: Assemble sample video with 3 images + audio

**Files to Create**:
- `backend/ai/tools/imageGenerator.ts`
- `backend/ai/tools/videoGenerator.ts`
- `backend/ai/tools/ttsGenerator.ts`
- `backend/ai/tools/assetSearch.ts`
- `backend/ai/tools/ffmpegAssembler.ts`

**Dependencies**:
- FFmpeg CLI (install via `brew install ffmpeg` or Docker)
- ElevenLabs SDK (npm package)

---

### Phase 4: Workflow Orchestration (8-10 hours)

**Goal**: Implement main video generation workflow

**Tasks**:

1. ✅ **Create Workflow File** (3-4 hours)
   - File: `backend/ai/workflows/videoGenerationWorkflow.ts`
   - 7 phases (see workflow section above):
     1. Story Analysis
     2. Script Generation
     3. Storyboard Planning
     4. Asset Generation (parallel)
     5. Asset Review (manual approval)
     6. Audio Generation
     7. Video Assembly
   - Parallel optimization: Use `Promise.allSettled` for asset generation
   - Status updates: Update VideoProject status after each phase
   - Error handling: Catch failures, update status to `failed`

2. ✅ **API Integration** (2-3 hours)
   - Update `backend/main.ts` with workflow endpoints:
     - POST /api/videos/:videoId/script (triggers Phase 2)
     - POST /api/videos/:videoId/script/approve (manual checkpoint)
     - POST /api/videos/:videoId/storyboard (triggers Phase 3)
     - POST /api/videos/:videoId/storyboard/approve (manual checkpoint)
     - POST /api/videos/:videoId/generate-assets (triggers Phase 4)
     - POST /api/videos/:videoId/assets/approve (manual checkpoint)
     - POST /api/videos/:videoId/render (triggers Phases 6-7)
   - Status polling: GET /api/videos/:videoId/status

3. ✅ **Cost Tracking Implementation** (2-3 hours)
   - Track costs at each phase:
     - Story analysis: $0.0001
     - Script generation: $0.0002
     - Storyboard planning: $0.0001
     - Asset generation: $0.04-0.10 per image (or $6-12 for Sora)
     - TTS generation: $0.05-0.10
   - Store total cost in Video node
   - Implement GET /api/analytics/costs endpoint

**Testing**:
- E2E test: Full workflow from topic → rendered video
- Verify multi-stage approval works
- Verify cost tracking accuracy
- Test asset reuse logic

---

### Phase 5: Frontend Implementation (20-24 hours)

**Goal**: Build React frontend with multi-stage approval UI

**Tasks**:

1. ✅ **Project Setup** (2 hours)
   - Initialize React + Vite + TypeScript
   - Install dependencies: React Query, Tailwind CSS, shadcn/ui
   - Set up routing (React Router)
   - Create folder structure (components, pages, lib, stores)

2. ✅ **API Client** (3 hours)
   - File: `frontend/src/lib/api.ts`
   - Implement all API calls (similar to LangUp's api.ts):
     - createVideo, getVideos, getVideo
     - analyzeStory, generateScript, approveScript
     - generateStoryboard, approveStoryboard
     - generateAssets, approveAssets
     - renderVideo, getVideoStatus
   - Use fetch with proper error handling

3. ✅ **Video Creation Wizard** (8-10 hours)
   - Components (5 steps):
     - `TopicInput.tsx` (3 hours)
       - Form: Topic, language, duration, premium toggle
       - Submit → analyzeStory API
       - Loading state during analysis
     - `ScriptReview.tsx` (2 hours)
       - Display script with scene breakdown
       - Approve/Reject buttons
       - Revision notes textarea
     - `StoryboardReview.tsx` (2 hours)
       - Grid of scene cards
       - Inline prompt editing
       - Approve/Regenerate actions
     - `AssetPreview.tsx` (2 hours)
       - Gallery of generated images/clips
       - Cost breakdown display
       - Regenerate individual assets
     - `VideoPreview.tsx` (1 hour)
       - Video player (React Player)
       - Download/share buttons
       - Cost summary
   - State management: `useVideoWorkflow` hook
   - Progress stepper: `StepperNav` component

4. ✅ **Video Library** (4-5 hours)
   - Page: `VideoLibraryPage.tsx`
   - Components:
     - `VideoGrid.tsx` (grid layout)
     - `VideoCard.tsx` (thumbnail, title, status, cost)
     - `FilterBar.tsx` (filter by language/status)
   - Pagination: Load 20 videos at a time
   - Search: Filter by title/topic

5. ✅ **Analytics Dashboard** (3-4 hours)
   - Page: `AnalyticsPage.tsx`
   - Charts (use recharts library):
     - Cost over time (line chart)
     - Videos per language (pie chart)
     - Asset reuse rate (bar chart)
   - Summary cards:
     - Total videos created
     - Total cost (current month)
     - Average cost per video
     - Estimated budget remaining

6. ✅ **Cost Tracking UI** (2 hours)
   - Component: `CostTracker.tsx`
   - Real-time cost display during video creation
   - Budget warnings (if over $500/month)
   - Cost breakdown by phase (script, assets, TTS, total)

**Files to Create**:
- `frontend/src/lib/api.ts`
- `frontend/src/lib/types.ts`
- `frontend/src/lib/hooks/useVideoWorkflow.ts`
- `frontend/src/components/video-creator/*` (5 components)
- `frontend/src/pages/*` (4 pages)
- `frontend/src/App.tsx`

**Testing**:
- Manual testing: Full video creation flow
- Verify all approval checkpoints work
- Verify cost tracking updates in real-time

---

### Phase 6: Optimization & Testing (8-12 hours)

**Goal**: Implement cost optimizations and comprehensive testing

**Tasks**:

1. ✅ **Asset Reuse System** (4-5 hours)
   - Implement embedding generation for assets
   - Implement similarity search in Asset Generator Agent
   - Test: Verify 30% reuse rate with sample data
   - Metrics: Track reuse count, savings

2. ✅ **Batch Processing** (2-3 hours)
   - Parallelize asset generation (5-10 concurrent)
   - Batch Neo4j inserts (UNWIND queries)
   - Test: Measure performance improvement

3. ✅ **E2E Testing** (4-5 hours)
   - Backend E2E test (similar to LangUp's e2e_fullWorkflow_test.ts):
     - Create user
     - Create video project
     - Run full workflow: analyze → script → storyboard → assets → render
     - Verify video status updates correctly
     - Verify cost tracking
     - Clean up test data
   - Frontend E2E test (Playwright):
     - Navigate through video creation wizard
     - Approve at each checkpoint
     - Verify final video renders
   - Run tests, fix failures

4. ✅ **Documentation** (1-2 hours)
   - Create `docs/ARCHITECTURE.md` (based on this plan)
   - Create `docs/API.md` (API reference)
   - Create `docs/COST_ANALYSIS.md` (budget optimization guide)
   - Update README.md

**Success Metrics**:
- E2E test passes in <5 minutes
- Asset reuse rate >25%
- Average cost per video <$0.35 (cheap pipeline)
- All API endpoints documented

---

## Critical Files Reference

**Backend Core**:
- `backend/main.ts` - API endpoints (lines TBD after implementation)
- `backend/lib/neo4j.ts` - Database schema (lines TBD)
- `backend/lib/types.ts` - TypeScript interfaces (lines TBD)

**Agents**:
- `backend/ai/agents/storyAnalyzer.ts` - Story analysis
- `backend/ai/agents/scriptWriter.ts` - Script generation
- `backend/ai/agents/scenePlanner.ts` - Storyboard planning
- `backend/ai/agents/assetGenerator.ts` - Asset generation with reuse
- `backend/ai/agents/videoAssembler.ts` - Video assembly

**Tools**:
- `backend/ai/tools/imageGenerator.ts` - DALL-E 3 integration
- `backend/ai/tools/ttsGenerator.ts` - ElevenLabs TTS
- `backend/ai/tools/assetSearch.ts` - Neo4j similarity search
- `backend/ai/tools/ffmpegAssembler.ts` - FFmpeg video assembly

**Workflow**:
- `backend/ai/workflows/videoGenerationWorkflow.ts` - Main pipeline

**Frontend**:
- `frontend/src/lib/api.ts` - API client
- `frontend/src/lib/hooks/useVideoWorkflow.ts` - Workflow state management
- `frontend/src/components/video-creator/*` - Creation wizard components
- `frontend/src/pages/CreateVideoPage.tsx` - Main creation page

---

## Next Steps

1. **Choose Implementation Approach**:
   - Start with Phase 1 (Backend Foundation) to set up infrastructure
   - OR start with Phase 2 (Agent Implementation) if backend already exists
   - OR implement all phases sequentially

2. **Budget Decision**:
   - **Option A**: Start with 0% premium (all DALL-E 3), scale to 1000 videos/month at ~$250-350/month
   - **Option B**: Include 2% premium Sora (20 videos/month), total ~$485/month, 1000 videos/month
   - **Option C**: Reduce volume to 500 videos/month (all cheap), total ~$150/month, then scale up

3. **Clarify Requirements**:
   - Confirm budget flexibility (can you increase to $500-700/month?)
   - Confirm Sora API access (is it available yet?)
   - Confirm acceptable quality for cheap pipeline (DALL-E + motion effects)
   - Confirm multi-stage approval is required (or can automate more?)

4. **Technology Validation**:
   - Test ElevenLabs TTS quality for Chinese/English/French
   - Test DALL-E 3 image quality for storytelling
   - Test FFmpeg motion effects (Ken Burns, fade)
   - Validate Sora API if available

---

## Open Questions

1. **Budget Flexibility**: Can budget increase to $700-1000/month for higher quality or volume?

2. **Sora Availability**: Is Sora API publicly available? If not, when expected?

3. **Quality Acceptance**: Is DALL-E 3 + motion effects acceptable for 95% of content?

4. **Approval Overhead**: With 1000 videos/month, multi-stage approval = ~3000 human reviews/month. Can some stages be automated?

5. **Storage Solution**: Use S3 for asset storage or local file system?

6. **Distribution**: Where will videos be published? (TikTok, YouTube Shorts, own platform?)

7. **Voice Preferences**: Which specific ElevenLabs voices for each language?

8. **Music Library**: Do you have a royalty-free music library, or should we source one?

---

## Estimated Total Implementation Time

- **Phase 1**: Backend Foundation - 12-16 hours
- **Phase 2**: Agent Implementation - 16-20 hours
- **Phase 3**: Tools Implementation - 8-12 hours
- **Phase 4**: Workflow Orchestration - 8-10 hours
- **Phase 5**: Frontend Implementation - 20-24 hours
- **Phase 6**: Optimization & Testing - 8-12 hours

**Total**: **72-94 hours** (9-12 full working days)

**Recommended Approach**:
- Week 1: Phases 1-2 (backend + agents)
- Week 2: Phases 3-4 (tools + workflows)
- Week 3: Phase 5 (frontend)
- Week 4: Phase 6 (optimization + testing)

**Total Calendar Time**: 4 weeks with dedicated full-time work

---

## Success Criteria

**Functional**:
- ✅ Generate 30-90s videos in Chinese, English, French
- ✅ Multi-stage approval workflow (script → storyboard → assets → render)
- ✅ Asset reuse system (>25% reuse rate)
- ✅ Cost tracking (<$0.35 per video average)
- ✅ E2E workflow completes in <5 minutes (excluding human reviews)

**Performance**:
- ✅ 1000 videos/month capacity (33 videos/day)
- ✅ Parallel asset generation (5-10 concurrent)
- ✅ Video assembly time <90 seconds

**Cost**:
- ✅ Monthly budget <$500 (or <$0.50 per video)
- ✅ Transparent cost tracking per video
- ✅ Budget alerts when approaching limit

**Quality**:
- ✅ Scripts match target word count (30s = 75 words, 90s = 225 words)
- ✅ Images align with scene descriptions
- ✅ TTS voice quality acceptable for all 3 languages
- ✅ Final video resolution 1080x1920 (vertical)

---

## Risk Mitigation

**Risk 1: Sora API Not Available**
- **Mitigation**: Use DALL-E 3 + motion effects for 100% of videos
- **Fallback**: Implement premium tier later when Sora launches

**Risk 2: Budget Exceeded**
- **Mitigation**: Real-time cost tracking with alerts
- **Fallback**: Reduce volume or increase budget

**Risk 3: Asset Reuse Rate Too Low**
- **Mitigation**: Adjust similarity threshold (0.85 → 0.80)
- **Fallback**: Use template library for common scenes (city, forest, etc.)

**Risk 4: TTS Quality Issues**
- **Mitigation**: Test all 3 languages early in Phase 3
- **Fallback**: Switch to alternative TTS provider (Google Cloud TTS)

**Risk 5: Human Approval Bottleneck**
- **Mitigation**: Batch approval UI (approve 10 scripts at once)
- **Fallback**: Add AI quality check agent to auto-approve high-confidence outputs

**Risk 6: FFmpeg Performance**
- **Mitigation**: Use GPU acceleration if available
- **Fallback**: Offload to cloud rendering service (AWS MediaConvert)

---

## Conclusion

This plan outlines a comprehensive agentic video generation system for LingoWhales, leveraging Mastra, Neo4j, and React to create 1000+ multilingual story videos per month at <$500 budget.

**Key Innovations**:
1. **Hybrid Video Approach**: DALL-E 3 + motion effects for 95-100% of content (cost-effective)
2. **Asset Reuse System**: Neo4j similarity search to reuse images (30% cost savings)
3. **Multi-Stage Approval**: Human oversight at script, storyboard, assets (quality control)
4. **Parallel Processing**: 5-10 concurrent asset generations (performance)
5. **Real-Time Cost Tracking**: Budget monitoring throughout pipeline (cost control)

**Next Action**: Review this plan, answer open questions, then proceed with Phase 1 implementation.
