# Hailuo Animation Feature Documentation

## Overview

The Hailuo animation feature uses MiniMax's Hailuo-2.3 API to transform static DALL-E 3 images into animated video clips with realistic character movement, object animation, and cinematic camera motion.

**Key Benefits:**
- ✨ AI-powered animation of static images
- 🎬 Realistic character movement and gestures
- 📹 Dynamic camera work (zoom, pan, parallax)
- 💰 Cost-effective ($0.27 per 6-second scene at 768p)
- 🔄 Automatic fallback to static FFmpeg effects

## Architecture

### Workflow Overview

```
1. DALL-E 3 Image Generation
   ↓
2. Hailuo Animation (3-step process)
   Step 1: POST /v1/video_generation → receive task_id
   Step 2: GET /v1/query/video_generation → poll until success → receive file_id
   Step 3: GET /v1/files/retrieve → receive download_url
   ↓
3. Video Download & Storage
```

### Integration Points

**File:** `backend/ai/tools/hailuoClient.ts` (255 lines)
- `generateAnimation()` - Initiates video generation
- `pollGenerationStatus()` - Polls until completion (10s intervals)
- `retrieveVideoDownloadUrl()` - Fetches download URL from file_id
- `generateAnimatedVideo()` - Convenience function combining all steps
- `calculateCost()` - Cost estimation utilities

**File:** `backend/ai/agents/assetGenerator.ts`
- `animateImageWithHailuo()` - Animates DALL-E images with Hailuo
- Graceful fallback to `animationProvider: "static"` on failure
- Tracks `generationTime` and `cost` for each asset

**File:** `backend/lib/types.ts`
- `Asset.animationProvider?: "hailuo" | "static"` - Tracks animation method
- `Asset.generationTime?: number` - Tracks API latency in seconds

## API Configuration

### Environment Variables

Add to `.env` file:

```env
# MiniMax Hailuo-02 API (for AI-powered video animation)
# Get your API key at: https://platform.minimax.io/
# IMPORTANT: Use pay-as-you-go API key (coding plan does not cover video generation)
MINIMAX_API_KEY_PAY_AS_YOU_GO=your-api-key-here
```

### API Endpoints

**1. Video Generation**
```
POST https://api.minimax.io/v1/video_generation
Authorization: Bearer {MINIMAX_API_KEY_PAY_AS_YOU_GO}
Content-Type: application/json

Body:
{
  "model": "MiniMax-Hailuo-2.3",
  "prompt": "A knight walking through a misty forest with realistic movement",
  "first_frame_image": "https://example.com/image.jpg",
  "duration": 6,
  "resolution": "768P"  // or "1080P"
}

Response:
{
  "task_id": "352625059377404",
  "base_resp": {
    "status_code": 0,
    "status_msg": "success"
  }
}
```

**2. Status Polling**
```
GET https://api.minimax.io/v1/query/video_generation?task_id={task_id}
Authorization: Bearer {MINIMAX_API_KEY_PAY_AS_YOU_GO}

Response (in-progress):
{
  "status": "Processing",
  "base_resp": {
    "status_code": 0,
    "status_msg": "success"
  }
}

Response (completed):
{
  "status": "Success",
  "file_id": "352625208221880",
  "base_resp": {
    "status_code": 0,
    "status_msg": "success"
  }
}
```

**3. File Retrieval**
```
GET https://api.minimax.io/v1/files/retrieve?file_id={file_id}
Authorization: Bearer {MINIMAX_API_KEY_PAY_AS_YOU_GO}

Response:
{
  "file": {
    "download_url": "https://video-product.cdn.minimax.io/inference_output/video/2026-01-06/ba867df2.../output.mp4"
  }
}
```

## Usage

### Basic Example

```typescript
import { generateAnimatedVideo } from "./ai/tools/hailuoClient.ts";

// Generate animated video from DALL-E image
const { videoUrl, generationTime } = await generateAnimatedVideo({
  imageUrl: "https://example.com/dalle-image.jpg",
  prompt: "A brave knight walking through a misty forest with birds flying overhead",
  resolution: "768p",  // or "1080p"
  duration: 6,         // 5-10 seconds
});

console.log(`Video URL: ${videoUrl}`);
console.log(`Generated in: ${generationTime}s`);
```

### Integration with Asset Generator

The asset generator automatically uses Hailuo when `MINIMAX_API_KEY_PAY_AS_YOU_GO` is set:

```typescript
import { generateAssets } from "./ai/agents/assetGenerator.ts";

const result = await generateAssets({
  scenes: [
    {
      order: 1,
      description: "A knight standing in a forest",
      imagePrompt: "A brave knight in armor standing in a misty forest at dawn",
    },
  ],
  isPremium: false,
});

// Result includes animation metadata
console.log(result.assets[0].animationProvider); // "hailuo" or "static"
console.log(result.assets[0].generationTime);    // 95.5 (seconds)
console.log(result.assets[0].cost);              // 0.31 (DALL-E + Hailuo)
```

## Cost Analysis

### Pricing (Pay-as-you-go)

**MiniMax Hailuo-02 Pricing:**
- 768p: $0.045 per second
- 1080p: $0.08 per second

**Cost Per Scene (6-second duration):**
- DALL-E 3 image (1024x1792): $0.04
- Hailuo animation (768p, 6s): $0.27
- **Total per scene: $0.31**

**Cost Per Scene (1080p):**
- DALL-E 3 image: $0.04
- Hailuo animation (1080p, 6s): $0.48
- **Total per scene: $0.52**

### Monthly Budget Estimates

**For 30-second videos (5 scenes per video):**

| Videos/Month | Resolution | Cost per Video | Monthly Total |
|-------------|-----------|---------------|--------------|
| 100 | 768p | $1.55 | $155 |
| 500 | 768p | $1.55 | $775 |
| 1000 | 768p | $1.55 | $1,550 |
| 100 | 1080p | $2.60 | $260 |
| 500 | 1080p | $2.60 | $1,300 |
| 1000 | 1080p | $2.60 | $2,600 |

### Cost Calculation Utilities

```typescript
import { calculateCost, estimateBatchCost } from "./ai/tools/hailuoClient.ts";

// Single video cost
const cost = calculateCost("768p", 6); // $0.27

// Batch estimation (10 videos, 5 scenes each, 768p, 6s per scene)
const totalCost = estimateBatchCost(50, "768p", 6); // $13.50
```

## Performance Metrics

### Generation Times

Based on testing with 768p resolution:

| Phase | Duration | Description |
|-------|---------|-------------|
| Preparing | 0-25s | Initial setup and queueing |
| Queueing | 25-31s | Waiting for GPU availability |
| Processing | 31-96s | Actual video generation |
| Success | 96-105s | Completion and file storage |

**Average total time:** 95-105 seconds per scene

**Polling interval:** 10 seconds (recommended by MiniMax)

### Status Progression

```
Preparing → Queueing → Processing → Success
   ↓           ↓           ↓            ↓
 0-25s      25-31s      31-96s      96-105s
```

## Error Handling

### Automatic Fallback Strategy

If Hailuo animation fails, the system automatically falls back to static FFmpeg Ken Burns effects:

```typescript
// In assetGenerator.ts
try {
  const animatedAsset = await animateImageWithHailuo(dalleImage, scene);
  return animatedAsset; // animationProvider: "hailuo"
} catch (error) {
  console.warn(`⚠️ Animation failed, using static image:`, error);
  return {
    ...dalleImage,
    animationProvider: "static", // Fallback to FFmpeg
  };
}
```

### Common Errors

**1. Invalid API Key (status_code: 2049)**
```
Error: MiniMax API error: Invalid API key
```
**Solution:** Verify `MINIMAX_API_KEY_PAY_AS_YOU_GO` in `.env` file

**2. Insufficient Balance (status_code: 1008)**
```
Error: MiniMax API error: Insufficient balance
```
**Solution:** Add credits at https://platform.minimax.io/user-center/basic-information

**3. Invalid Parameters (status_code: 2013)**
```
Error: MiniMax API error: Invalid parameters - model MiniMax-Hailuo-2.3 does not support resolution 512P
```
**Solution:** Use supported resolutions: 768P or 1080P

**4. Timeout (120 seconds)**
```
Error: Hailuo generation timed out after 120s
```
**Solution:** Videos typically complete in 95-105s. If timeout occurs:
- Check network connectivity
- Verify MiniMax API status
- System automatically falls back to static images

### Error Response Format

```json
{
  "base_resp": {
    "status_code": 1008,
    "status_msg": "insufficient balance"
  }
}
```

## Best Practices

### 1. Prompting for Better Animation Quality

**Good prompts:**
```typescript
// Specific, actionable movement
"A knight walking through a forest with natural arm movement and flowing cape"

// Clear camera direction
"A bird flying across the sky with smooth camera pan following the motion"

// Realistic motion description
"A person turning their head slowly while standing in a misty environment"
```

**Poor prompts:**
```typescript
// Too vague
"A scene with movement"

// Conflicting instructions
"A static portrait that moves dynamically"

// Impossible physics
"A mountain flying through the air at high speed"
```

### 2. Resolution Selection

**768p (Recommended for most use cases):**
- ✅ Cost-effective ($0.27 per 6s scene)
- ✅ Good quality for social media (TikTok, Reels)
- ✅ Faster generation times
- ✅ Smaller file sizes for faster delivery

**1080p (Premium quality):**
- ✅ Higher quality for professional use
- ❌ 78% more expensive ($0.48 per 6s scene)
- ❌ Slower generation times
- ❌ Larger file sizes

### 3. Duration Optimization

**Supported durations:** 5-10 seconds

**Recommendations:**
- **6 seconds (default):** Optimal balance of quality, cost, and story pacing
- **5 seconds:** Quick cuts, fast-paced content
- **10 seconds:** Cinematic sequences, establishing shots

**Cost impact:**
```typescript
// 5 seconds at 768p = $0.225
// 6 seconds at 768p = $0.270
// 10 seconds at 768p = $0.450
```

**Important Note on Video Duration:**
Hailuo generates 6-second animated clips by default. For longer scenes (e.g., 15-second scenes in 30-second videos), the video assembler automatically loops the 6-second clips to fill the scene duration.

Example for 30-second video with 2 scenes:
- Scene 1 (0-15s): 6-second Hailuo video loops 2.5 times (6s + 6s + 3s)
- Scene 2 (15-30s): 6-second Hailuo video loops 2.5 times (6s + 6s + 3s)
- Total: 30 seconds with smooth transitions at 15s mark

This looping is handled automatically by FFmpeg using `-stream_loop -1` parameter and ensures:
- ✅ Videos match requested duration (30s, 60s, or 90s)
- ✅ Smooth transitions between scenes
- ✅ No audio/video desynchronization
- ✅ Seamless playback without visible loop points

**Implementation Details:**
The video assembler (`backend/ai/agents/videoAssembler.ts`) checks each video's duration against the scene duration:
- If video is **shorter than scene** (e.g., 6s video for 15s scene): Apply `-stream_loop -1` to infinitely loop, then trim to scene duration with `-t`
- If video is **same length or longer**: Just trim to scene duration with `-t`

Additionally, audio is padded with silence using `apad=whole_dur=${totalVideoDuration}` to ensure audio doesn't cut off video early. The explicit duration parameter `-t` ensures the final video is exactly the requested length.

### 4. Monitoring and Logging

The system includes built-in logging for monitoring:

```
🎬 Hailuo generation started: 352625059377404
      [0.2s] Status: Preparing
      [10.3s] Status: Preparing
      [20.6s] Status: Processing
      [95.4s] Status: Success
      Retrieving download URL for file_id: 352625208221880
✓ Animation complete in 96.0s
```

Track these metrics:
- Generation time (should be 95-105s for 768p)
- Success rate (should be >95%)
- Fallback rate (should be <5%)
- Cost per video

## Troubleshooting

### Issue: Videos not animating (fallback to static)

**Check:**
1. `MINIMAX_API_KEY_PAY_AS_YOU_GO` is set in `.env`
2. API key has sufficient balance
3. Check console logs for error messages
4. Verify network connectivity to `api.minimax.io`

### Issue: Generation timing out

**Solutions:**
1. Increase timeout (currently 120s, safe to increase to 180s)
2. Check MiniMax API status: https://platform.minimax.io/status
3. Reduce polling frequency if rate-limited (currently 10s intervals)
4. System automatically falls back to static on timeout

### Issue: Download URLs returning 404

**Possible causes:**
1. URLs expire after a certain period (check MiniMax documentation)
2. File was not properly uploaded to CDN
3. Network issues during file retrieval

**Solution:** Regenerate the asset if URL has expired

### Issue: Poor animation quality

**Improvements:**
1. Use more specific, actionable prompts
2. Increase resolution to 1080p (higher cost)
3. Ensure DALL-E images are high quality (vertical 1024x1792)
4. Avoid prompts with impossible or conflicting motion

## Testing

### Manual Testing

Run the integration test:

```bash
deno run --allow-net --allow-env --allow-read --allow-write --env-file=.env test_hailuo_integration.ts
```

**Expected output:**
```
✅ Asset Generation Successful!

📊 Results:
  Total Assets: 2
  Total Time: 130.8s (2.2 minutes)

📸 Asset Details:
  Scene 1:
    Type: video_clip
    URL: https://video-product.cdn.minimax.io/inference_output/video/...
    Cost: $0.310
    Animation: hailuo
    Generation Time: 96.0s
```

### Debug Testing

Test the API directly:

```bash
deno run --allow-net --allow-env --env-file=.env test_hailuo_debug.ts
```

This shows raw API requests/responses for debugging.

## API Key Types

**Important:** MiniMax Pay-as-you-go API key is required for video generation:

### Pay-as-you-go (`MINIMAX_API_KEY_PAY_AS_YOU_GO`)
- ✅ **Required for video generation**
- ✅ Supports Hailuo-2.3 video model
- 💰 Requires pre-loaded balance
- Get at: https://platform.minimax.io/user-center/basic-information

**Configuration:**
```env
# ✅ Use this for Hailuo animation
MINIMAX_API_KEY_PAY_AS_YOU_GO=your-pay-as-you-go-key
```

## Resources

### Official Documentation
- MiniMax Platform: https://platform.minimax.io/
- Video Generation Guide: https://platform.minimax.io/docs/guides/video-generation
- Pricing Overview: https://platform.minimax.io/docs/pricing/overview
- API Reference: https://platform.minimax.io/docs/api-reference

### Internal Files
- API Client: `backend/ai/tools/hailuoClient.ts`
- Asset Generator: `backend/ai/agents/assetGenerator.ts`
- Type Definitions: `backend/lib/types.ts`
- Integration Test: `backend/test_hailuo_integration.ts`
- Debug Test: `backend/test_hailuo_debug.ts`

### Support
- MiniMax Support: https://platform.minimax.io/support
- API Status: https://platform.minimax.io/status

## Changelog

### Version 1.0 (2026-01-05)
- ✅ Initial implementation with MiniMax Hailuo-2.3
- ✅ 3-step workflow (generate → poll → retrieve URL)
- ✅ Automatic fallback to static FFmpeg effects
- ✅ Cost tracking and estimation utilities
- ✅ Comprehensive error handling
- ✅ Debug logging and monitoring
- ✅ Integration tests and documentation

### Known Limitations
1. Resolution support: Only 768P and 1080P (512P not supported)
2. Duration limits: 5-10 seconds per scene
3. Generation time: 95-105 seconds per scene (not real-time)
4. No batch processing optimization (processes scenes sequentially)
5. Download URL expiration time unknown (check MiniMax docs)

### Future Enhancements
1. Parallel scene processing for faster batch generation
2. Quality scoring and automatic re-generation
3. Custom animation styles and presets
4. Cost optimization with caching and reuse
5. Real-time progress updates via WebSocket
