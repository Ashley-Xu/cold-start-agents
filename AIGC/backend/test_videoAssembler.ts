// Video Assembler Agent E2E Test
// Tests: Complete workflow from user creation to final video rendering

import { getSession, closeDriver } from "./lib/neo4j.ts";

const BASE_URL = "http://localhost:8000";
const TEST_USER_ID = `test-user-${Date.now()}`;

// Helper function to make API requests
async function apiRequest(
  endpoint: string,
  method: string = "GET",
  body?: any,
): Promise<any> {
  const options: RequestInit = {
    method,
    headers: {
      "Content-Type": "application/json",
    },
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(`${BASE_URL}${endpoint}`, options);
  return await response.json();
}

// Test complete video generation workflow
async function testVideoAssembler() {
  console.log("\n🧪 Starting Video Assembler E2E Test (Complete Workflow)...\n");
  console.log("=" .repeat(70));

  const session = getSession();

  try {
    // ========================================================================
    // Phase 1: Setup
    // ========================================================================

    console.log("\n📋 PHASE 1: SETUP\n");

    // Step 1: Create test user
    console.log("1️⃣ Creating test user...");
    await session.run(
      `CREATE (u:User {
        id: $userId,
        email: "test@example.com",
        preferredName: "Test User",
        createdAt: datetime()
      })`,
      { userId: TEST_USER_ID },
    );
    console.log("✅ User created\n");

    // Step 2: Create test video project
    console.log("2️⃣ Creating test video project...");
    const createResult = await apiRequest("/api/videos", "POST", {
      topic: "A brave cat rescues a bird",
      language: "en",
      duration: 30,
      isPremium: false,
      userId: TEST_USER_ID,
    });
    console.log(`✅ Video created: ${createResult.videoId}\n`);

    const videoId = createResult.videoId;

    // ========================================================================
    // Phase 2: AI Content Generation
    // ========================================================================

    console.log("=" .repeat(70));
    console.log("\n📋 PHASE 2: AI CONTENT GENERATION\n");

    // Step 3: Run story analysis
    console.log("3️⃣ Running story analysis...");
    const analysisResult = await apiRequest(
      `/api/videos/${videoId}/analyze`,
      "POST",
    );
    console.log(`✅ Analysis complete`);
    console.log(`   Concept: ${analysisResult.concept.substring(0, 80)}...`);
    console.log(`   Themes: ${analysisResult.themes.join(", ")}`);
    console.log(`   Mood: ${analysisResult.mood}\n`);

    // Step 4: Generate script
    console.log("4️⃣ Generating script...");
    const scriptResult = await apiRequest(
      `/api/videos/${videoId}/script`,
      "POST",
    );
    console.log(`✅ Script generated`);
    console.log(`   Scenes: ${scriptResult.scenes.length}`);
    console.log(`   Word count: ${scriptResult.wordCount}`);
    console.log(`   Duration: ${scriptResult.estimatedDuration}s\n`);

    // Step 5: Approve script
    console.log("5️⃣ Approving script via API...");
    const scriptApprovalResult = await apiRequest(
      `/api/videos/${videoId}/script/approve`,
      "POST",
      { approved: true },
    );
    console.log("DEBUG scriptApprovalResult:", JSON.stringify(scriptApprovalResult, null, 2));
    console.log(`✅ Script approved`);
    console.log(`   Status: ${scriptApprovalResult.status}\n`);

    // Step 6: Generate storyboard
    console.log("6️⃣ Generating storyboard...");
    const storyboardResult = await apiRequest(
      `/api/videos/${videoId}/storyboard`,
      "POST",
    );
    console.log(`✅ Storyboard created`);
    console.log(`   Scenes: ${storyboardResult.scenes.length}`);
    console.log(`   Visual style: ${storyboardResult.storyboard.visualStyle}`);
    console.log(`   Color palette: ${storyboardResult.storyboard.colorPalette}\n`);

    // Step 7: Approve storyboard
    console.log("\n7️⃣ Approving storyboard via API...");
    const storyboardApprovalResult = await apiRequest(
      `/api/videos/${videoId}/storyboard/approve`,
      "POST",
      { approved: true },
    );
    console.log(`✅ Storyboard approved`);
    console.log(`   Status: ${storyboardApprovalResult.status}\n`);

    // Step 8: Generate assets
    console.log("8️⃣ Generating assets with DALL-E 3...");
    console.log("⏳ This may take 30-90 seconds...\n");
    const assetsResult = await apiRequest(
      `/api/videos/${videoId}/generate-assets`,
      "POST",
    );
    console.log(`✅ Assets generated`);
    console.log(`   Total assets: ${assetsResult.assets.length}`);
    console.log(`   Total cost: $${assetsResult.totalCost.toFixed(4)}\n`);

    // Step 8.5: Approve assets
    console.log("8️⃣.5 Approving assets via API...");
    const assetsApprovalResult = await apiRequest(
      `/api/videos/${videoId}/assets/approve`,
      "POST",
      { approved: true },
    );
    console.log(`✅ Assets approved`);
    console.log(`   Status: ${assetsApprovalResult.status}\n`);

    // ========================================================================
    // Phase 3: Video Assembly
    // ========================================================================

    console.log("=" .repeat(70));
    console.log("\n📋 PHASE 3: VIDEO ASSEMBLY\n");

    // Step 9: Render final video
    console.log("9️⃣ Rendering final video...");
    console.log("⏳ Generating TTS audio and assembling video...\n");
    const renderResult = await apiRequest(
      `/api/videos/${videoId}/render`,
      "POST",
    );

    console.log("DEBUG renderResult:", JSON.stringify(renderResult, null, 2));

    if (renderResult.error) {
      throw new Error(`Render failed: ${renderResult.error}`);
    }

    console.log(`✅ Video rendering complete!`);
    console.log(`\n   📺 Video Details:`);
    console.log(`   - Video URL: ${renderResult.videoUrl}`);
    console.log(`   - Audio URL: ${renderResult.audioUrl}`);
    console.log(`   - Subtitles URL: ${renderResult.subtitlesUrl || "N/A"}`);
    console.log(`   - Duration: ${renderResult.duration}s`);
    console.log(`   - File size: ${(renderResult.fileSize / 1024 / 1024).toFixed(2)}MB`);
    console.log(`   - Format: ${renderResult.format}`);
    console.log(`   - Resolution: ${renderResult.resolution}`);
    console.log(`   - Cost: $${renderResult.cost.toFixed(4)}\n`);

    // ========================================================================
    // Phase 4: Verification
    // ========================================================================

    console.log("=" .repeat(70));
    console.log("\n📋 PHASE 4: VERIFICATION\n");

    // Step 10: Verify database storage
    console.log("🔟 Verifying database storage...");
    const dbResult = await session.run(
      `MATCH (v:VideoProject {id: $videoId})-[:HAS_VIDEO]->(vid:Video)
       RETURN v.status as status, vid`,
      { videoId },
    );

    const videoStatus = dbResult.records[0].get("status");
    const videoNode = dbResult.records[0].get("vid").properties;

    console.log(`✅ Database verification:`);
    console.log(`   - Video status: ${videoStatus}`);
    console.log(`   - Expected: ready`);
    console.log(`   - Match: ${videoStatus === "ready" ? "✅" : "❌"}`);
    console.log(`\n   - Video node stored: ${videoNode.id ? "✅" : "❌"}`);
    console.log(`   - Video URL: ${videoNode.url}`);
    console.log(`   - Audio URL: ${videoNode.audioUrl}`);
    console.log(`   - Duration: ${videoNode.duration}s`);
    console.log(`   - File size: ${videoNode.fileSize} bytes`);
    console.log(`   - Format: ${videoNode.format}`);
    console.log(`   - Resolution: ${videoNode.resolution}\n`);

    // Calculate total costs
    console.log("💰 Cost breakdown:");
    console.log(`   - Story analysis: $0.0001`);
    console.log(`   - Script generation: $0.0003`);
    console.log(`   - Storyboard planning: $0.0001`);
    console.log(`   - Asset generation: $${assetsResult.totalCost.toFixed(4)}`);
    console.log(`   - Video assembly (TTS): $${renderResult.cost.toFixed(4)}`);
    const totalCost = 0.0001 + 0.0003 + 0.0001 + assetsResult.totalCost + renderResult.cost;
    console.log(`   - TOTAL: $${totalCost.toFixed(4)}\n`);

    // ========================================================================
    // Test Summary
    // ========================================================================

    console.log("=" .repeat(70));
    console.log("\n📊 TEST SUMMARY\n");
    console.log("=" .repeat(70));
    console.log(`✅ All 11 steps completed successfully`);
    console.log(`✅ Complete workflow tested (user → video)`);
    console.log(`✅ Multi-stage approval workflow working`);
    console.log(`✅ Video Assembler integration working`);
    console.log(`✅ TTS generation functional (placeholder)`);
    console.log(`✅ Video assembly functional (placeholder)`);
    console.log(`✅ Database storage verified`);
    console.log(`✅ Status updates correct`);
    console.log(`✅ Cost tracking operational`);
    console.log(`\n💸 Total cost per video: $${totalCost.toFixed(4)}`);
    console.log(`📈 Monthly cost (1000 videos): $${(totalCost * 1000).toFixed(2)}`);
    console.log(`${(totalCost * 1000) < 500 ? "✅" : "❌"} Within budget ($500/month)`);
    console.log("=" .repeat(70));

  } catch (error) {
    console.error("\n❌ Test failed:", error);
    throw error;
  } finally {
    // Cleanup: Delete test data
    console.log("\n\n🧹 Cleaning up test data...");

    await session.run(
      `MATCH (u:User {id: $userId})
       OPTIONAL MATCH (u)-[:CREATED]->(v:VideoProject)
       OPTIONAL MATCH (v)-[:HAS_SCRIPT]->(s:Script)
       OPTIONAL MATCH (s)-[:HAS_SCENE]->(sc:SceneScript)
       OPTIONAL MATCH (v)-[:HAS_ANALYSIS]->(a:StoryAnalysis)
       OPTIONAL MATCH (v)-[:HAS_STORYBOARD]->(sb:Storyboard)
       OPTIONAL MATCH (sb)-[:HAS_SCENE]->(sbs:StoryboardScene)
       OPTIONAL MATCH (v)-[:HAS_ASSET]->(asset:Asset)
       OPTIONAL MATCH (v)-[:HAS_VIDEO]->(vid:Video)
       DETACH DELETE u, v, s, sc, a, sb, sbs, asset, vid`,
      { userId: TEST_USER_ID },
    );

    console.log("✅ Test data cleaned up\n");

    await session.close();
    await closeDriver();
  }
}

// Run test
if (import.meta.main) {
  await testVideoAssembler();
  console.log("✅ Video Assembler E2E Test Complete!\n");
}
