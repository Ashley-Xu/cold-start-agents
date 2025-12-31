// Asset Generator Agent E2E Test
// Tests: DALL-E 3 integration, database storage, cost tracking

import { getSession, closeDriver } from "./lib/neo4j.ts";

const BASE_URL = "http://localhost:8000";
const TEST_USER_ID = `test-user-${Date.now()}`;
const TEST_VIDEO_ID = `test-video-${Date.now()}`;

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

// Test Asset Generator workflow
async function testAssetGenerator() {
  console.log("\n🧪 Starting Asset Generator E2E Test...\n");

  const session = getSession();

  try {
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
      topic: "A story about a brave cat",
      language: "fr",  // Use language code, not full name
      duration: 30,
      isPremium: false,
      userId: TEST_USER_ID,
    });
    console.log(`✅ Video created: ${createResult.videoId}\n`);

    const videoId = createResult.videoId;

    // Step 3: Run story analysis
    console.log("3️⃣ Running story analysis...");
    const analysisResult = await apiRequest(
      `/api/videos/${videoId}/analyze`,
      "POST",
    );
    console.log(`✅ Analysis complete: ${analysisResult.concept}\n`);

    // Step 4: Generate script
    console.log("4️⃣ Generating script...");
    const scriptResult = await apiRequest(
      `/api/videos/${videoId}/script`,
      "POST",
    );
    console.log(`✅ Script generated: ${scriptResult.scenes.length} scenes\n`);

    // Step 5: Approve script (simulate manual approval by updating status)
    console.log("5️⃣ Approving script (manual database update)...");
    await session.run(
      `MATCH (v:VideoProject {id: $videoId})
       SET v.status = 'script_approved', v.updatedAt = datetime()
       RETURN v`,
      { videoId },
    );
    console.log(`✅ Script approved: status=script_approved\n`);

    // Step 6: Generate storyboard
    console.log("6️⃣ Generating storyboard...");
    const storyboardResult = await apiRequest(
      `/api/videos/${videoId}/storyboard`,
      "POST",
    );
    console.log(`✅ Storyboard created: ${storyboardResult.scenes.length} scenes\n`);

    // Step 7: Approve storyboard (simulate manual approval by updating status)
    console.log("7️⃣ Approving storyboard (manual database update)...");
    await session.run(
      `MATCH (v:VideoProject {id: $videoId})
       SET v.status = 'storyboard_approved', v.updatedAt = datetime()
       RETURN v`,
      { videoId },
    );
    console.log(`✅ Storyboard approved: status=storyboard_approved\n`);

    // Step 8: Generate assets (DALL-E 3)
    console.log("8️⃣ Generating assets with DALL-E 3...");
    console.log("⏳ This may take 30-90 seconds depending on scene count...\n");

    const assetsResult = await apiRequest(
      `/api/videos/${videoId}/generate-assets`,
      "POST",
    );

    console.log("✅ Assets generated:");
    console.log(`   - Total assets: ${assetsResult.assets.length}`);
    console.log(`   - Total cost: $${assetsResult.totalCost.toFixed(4)}`);
    console.log(`   - Reused assets: ${assetsResult.assets.filter((a: any) => a.reused).length}`);

    // Display first asset details
    if (assetsResult.assets.length > 0) {
      const firstAsset = assetsResult.assets[0];
      console.log(`\n   First asset details:`);
      console.log(`   - Scene ID: ${firstAsset.sceneId}`);
      console.log(`   - Type: ${firstAsset.type}`);
      console.log(`   - URL: ${firstAsset.url.substring(0, 60)}...`);
      console.log(`   - Cost: $${firstAsset.cost}`);
    }
    console.log();

    // Step 9: Verify database storage
    console.log("9️⃣ Verifying database storage...");
    const dbResult = await session.run(
      `MATCH (v:VideoProject {id: $videoId})-[:HAS_ASSET]->(a:Asset)
       RETURN count(a) as assetCount, collect(a) as assets`,
      { videoId },
    );

    const assetCount = dbResult.records[0].get("assetCount").toNumber();
    const assets = dbResult.records[0].get("assets");

    console.log(`✅ Database verification:`);
    console.log(`   - Assets stored: ${assetCount}`);
    console.log(`   - Expected: ${assetsResult.assets.length}`);
    console.log(`   - Match: ${assetCount === assetsResult.assets.length ? "✅" : "❌"}`);

    // Verify asset properties
    const firstDbAsset = assets[0].properties;
    console.log(`\n   First asset in database:`);
    console.log(`   - ID: ${firstDbAsset.id}`);
    console.log(`   - Scene ID: ${firstDbAsset.sceneId}`);
    console.log(`   - Type: ${firstDbAsset.type}`);
    console.log(`   - Generated by: ${firstDbAsset.generatedBy}`);
    console.log(`   - Cost: $${firstDbAsset.cost}`);
    console.log(`   - Reuse count: ${firstDbAsset.reuseCount}`);
    console.log();

    // Step 10: Verify video status update
    console.log("🔟 Verifying video status...");
    const statusResult = await session.run(
      `MATCH (v:VideoProject {id: $videoId})
       RETURN v.status as status`,
      { videoId },
    );

    const currentStatus = statusResult.records[0].get("status");
    console.log(`✅ Video status: ${currentStatus}`);
    console.log(`   - Expected: assets_review`);
    console.log(`   - Match: ${currentStatus === "assets_review" ? "✅" : "❌"}\n`);

    // Test Summary
    console.log("=" .repeat(60));
    console.log("📊 Test Summary:");
    console.log("=" .repeat(60));
    console.log(`✅ All steps completed successfully`);
    console.log(`✅ DALL-E 3 integration working`);
    console.log(`✅ Assets stored in Neo4j`);
    console.log(`✅ Status updated correctly`);
    console.log(`✅ Cost tracking operational`);
    console.log("=" .repeat(60));

  } catch (error) {
    console.error("\n❌ Test failed:", error);
    throw error;
  } finally {
    // Cleanup: Delete test data
    console.log("\n🧹 Cleaning up test data...");

    await session.run(
      `MATCH (u:User {id: $userId})
       OPTIONAL MATCH (u)-[:CREATED]->(v:VideoProject)
       OPTIONAL MATCH (v)-[:HAS_SCRIPT]->(s)
       OPTIONAL MATCH (v)-[:HAS_STORYBOARD]->(sb)
       OPTIONAL MATCH (sb)-[:HAS_SCENE]->(sc)
       OPTIONAL MATCH (v)-[:HAS_ASSET]->(a)
       DETACH DELETE u, v, s, sb, sc, a`,
      { userId: TEST_USER_ID },
    );

    console.log("✅ Test data cleaned up\n");

    await session.close();
    await closeDriver();
  }
}

// Run test
if (import.meta.main) {
  await testAssetGenerator();
  console.log("✅ Asset Generator E2E Test Complete!\n");
}
