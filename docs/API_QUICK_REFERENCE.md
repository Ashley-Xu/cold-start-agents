# API Quick Reference

**Project**: Cold-Start Video Generation System
**Last Updated**: 2025-12-30
**Base URL**: http://localhost:8000

---

## Implemented Endpoints (Phase 1)

### Health Check

**GET /health**

Check server and database health.

```bash
curl http://localhost:8000/health
```

**Response (200 OK)**:
```json
{
  "status": "ok",
  "database": "connected",
  "timestamp": "2025-12-30T12:00:00.000Z"
}
```

---

### Create Video Project

**POST /api/videos**

Create a new video project.

```bash
curl -X POST http://localhost:8000/api/videos \
  -H "Content-Type: application/json" \
  -d '{
    "topic": "A magical adventure in Paris",
    "language": "fr",
    "duration": 60,
    "isPremium": false,
    "userId": "user-123"
  }'
```

**Request Body**:
```typescript
{
  topic: string;        // Video topic/story idea
  language: "zh" | "en" | "fr";  // Target language
  duration: 30 | 60 | 90;        // Video duration in seconds
  isPremium?: boolean;           // Use Sora (true) or DALL-E 3 (false), default: false
  userId: string;                // User ID
}
```

**Response (201 Created)**:
```json
{
  "videoId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "draft"
}
```

**Error Responses**:
- `400 Bad Request`: Missing required fields or invalid values
- `500 Server Error`: Database or server error

---

### List Video Projects

**GET /api/videos**

List all video projects with optional filters.

```bash
# List all videos for a user
curl "http://localhost:8000/api/videos?userId=user-123"

# Filter by status
curl "http://localhost:8000/api/videos?userId=user-123&status=draft"

# Filter by language
curl "http://localhost:8000/api/videos?userId=user-123&language=fr"

# Combine filters
curl "http://localhost:8000/api/videos?userId=user-123&status=draft&language=fr"
```

**Query Parameters**:
- `userId` (optional): Filter by user ID
- `status` (optional): Filter by status (draft, analyzing, analyzed, etc.)
- `language` (optional): Filter by language (zh, en, fr)

**Response (200 OK)**:
```json
{
  "videos": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "userId": "user-123",
      "topic": "A magical adventure in Paris",
      "language": "fr",
      "duration": 60,
      "isPremium": false,
      "status": "draft",
      "createdAt": "2025-12-30T12:00:00.000Z",
      "updatedAt": "2025-12-30T12:00:00.000Z"
    }
  ]
}
```

**Note**: Returns maximum 100 results, ordered by creation date (newest first).

---

### Get Video Details

**GET /api/videos/:videoId**

Get detailed information about a specific video project.

```bash
curl "http://localhost:8000/api/videos/550e8400-e29b-41d4-a716-446655440000"
```

**Response (200 OK)**:
```json
{
  "video": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "userId": "user-123",
    "topic": "A magical adventure in Paris",
    "language": "fr",
    "duration": 60,
    "isPremium": false,
    "status": "draft",
    "createdAt": "2025-12-30T12:00:00.000Z",
    "updatedAt": "2025-12-30T12:00:00.000Z"
  },
  "script": null,
  "storyboard": null,
  "renderedVideo": null
}
```

**Response with Script (200 OK)**:
```json
{
  "video": { ... },
  "script": {
    "id": "script-123",
    "text": "Full script text here...",
    "wordCount": 150
  },
  "storyboard": null,
  "renderedVideo": null
}
```

**Error Responses**:
- `404 Not Found`: Video project not found
- `500 Server Error`: Database or server error

---

## Not Implemented Yet (Phase 2-4)

The following endpoints return `501 Not Implemented` until their respective phases are complete:

### Story Analysis

**POST /api/videos/:videoId/analyze**

Analyze video topic and generate story concept.

**Status**: 501 Not Implemented (Phase 2)

---

### Script Generation

**POST /api/videos/:videoId/script**

Generate timestamped script for the video.

**Status**: 501 Not Implemented (Phase 2)

---

### Storyboard Generation

**POST /api/videos/:videoId/storyboard**

Create visual storyboard with scene descriptions.

**Status**: 501 Not Implemented (Phase 2)

---

### Asset Generation

**POST /api/videos/:videoId/generate-assets**

Generate visual assets (images or video clips).

**Status**: 501 Not Implemented (Phase 3)

---

### Video Rendering

**POST /api/videos/:videoId/render**

Assemble final video with TTS and motion effects.

**Status**: 501 Not Implemented (Phase 4)

---

## Error Response Format

All error responses follow this format:

```json
{
  "error": "Error message here",
  "code": "ERROR_CODE"
}
```

**Common Error Codes**:
- `VALIDATION_ERROR`: Invalid request parameters
- `NOT_FOUND`: Resource not found
- `SERVER_ERROR`: Internal server error
- `NOT_IMPLEMENTED`: Endpoint not yet implemented

---

## CORS

CORS is enabled for all origins in development mode.

**Headers**:
- `Access-Control-Allow-Origin: *`
- `Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS`
- `Access-Control-Allow-Headers: Content-Type, Authorization`

---

## Video Status Values

Video projects progress through these statuses:

1. `draft` - Initial creation
2. `analyzing` - Story analysis in progress
3. `analyzed` - Story analysis complete
4. `script_review` - Script generated, awaiting approval
5. `script_approved` - Script approved by user
6. `storyboard_review` - Storyboard generated, awaiting approval
7. `storyboard_approved` - Storyboard approved by user
8. `generating_assets` - Assets being generated
9. `assets_review` - Assets generated, awaiting approval
10. `assets_approved` - Assets approved by user
11. `generating_audio` - TTS audio being generated
12. `rendering` - Final video being assembled
13. `ready` - Video complete and ready
14. `failed` - Error occurred during processing

---

## Testing Workflow

Here's a complete workflow to test the API:

```bash
# 1. Check server health
curl http://localhost:8000/health

# 2. Create a video project
curl -X POST http://localhost:8000/api/videos \
  -H "Content-Type: application/json" \
  -d '{
    "topic": "A day in the life of a Parisian cat",
    "language": "fr",
    "duration": 60,
    "userId": "test-user-123"
  }'

# Save the videoId from response

# 3. List videos for user
curl "http://localhost:8000/api/videos?userId=test-user-123"

# 4. Get video details
curl "http://localhost:8000/api/videos/{VIDEO_ID}"

# 5. Try to analyze (will return 501 until Phase 2)
curl -X POST "http://localhost:8000/api/videos/{VIDEO_ID}/analyze" \
  -H "Content-Type: application/json" \
  -d '{}'
```

---

## Database Access

You can also query the database directly:

**Neo4j Browser**: http://localhost:7474
- Username: `neo4j`
- Password: `coldstart-password`

**Example Cypher Queries**:

```cypher
// List all video projects
MATCH (v:VideoProject)
RETURN v
ORDER BY v.createdAt DESC
LIMIT 10

// Get video with all relationships
MATCH (v:VideoProject {id: "VIDEO_ID"})
OPTIONAL MATCH (v)-[:HAS_SCRIPT]->(s:Script)
OPTIONAL MATCH (v)-[:HAS_STORYBOARD]->(sb:Storyboard)
RETURN v, s, sb

// Count videos by status
MATCH (v:VideoProject)
RETURN v.status, count(*) as count
ORDER BY count DESC
```

---

## Next Steps

Once Phase 2 (Agent Implementation) is complete, the following endpoints will become functional:
- POST /api/videos/:videoId/analyze
- POST /api/videos/:videoId/script
- POST /api/videos/:videoId/storyboard

See [IMPLEMENTATION_PROGRESS.md](./IMPLEMENTATION_PROGRESS.md) for the full roadmap.

---

**Last Updated**: 2025-12-30
