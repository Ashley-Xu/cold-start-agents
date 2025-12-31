// Test script for Story Analyzer endpoint

const BASE_URL = "http://localhost:8000";

async function testStoryAnalyzer() {
  console.log("🧪 Testing Story Analyzer Endpoint\n");

  try {
    // Step 1: Create a test user in Neo4j first
    console.log("1️⃣ Creating test user...");
    const userId = crypto.randomUUID();

    // We'll need to use Neo4j driver directly for this
    const neo4j = await import("neo4j-driver");
    const driver = neo4j.default.driver(
      Deno.env.get("NEO4J_URI") || "bolt://localhost:7687",
      neo4j.default.auth.basic(
        Deno.env.get("NEO4J_USERNAME") || "neo4j",
        Deno.env.get("NEO4J_PASSWORD") || "coldstart-password"
      )
    );

    const session = driver.session();
    try {
      await session.run(
        `CREATE (u:User {id: $userId, email: $email, preferredName: $name, nativeLanguage: 'en'})`,
        {
          userId,
          email: "test@example.com",
          name: "Test User",
        }
      );
      console.log(`✅ User created: ${userId}\n`);
    } finally {
      await session.close();
    }

    // Step 2: Create a video project
    console.log("2️⃣ Creating video project...");
    const createVideoResponse = await fetch(`${BASE_URL}/api/videos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        topic: "A magical journey through an enchanted forest where a young girl discovers she can talk to animals",
        language: "en",
        duration: 60,
        isPremium: false,
        userId,
      }),
    });

    if (!createVideoResponse.ok) {
      throw new Error(
        `Failed to create video: ${createVideoResponse.status} ${await createVideoResponse.text()}`
      );
    }

    const { videoId } = await createVideoResponse.json();
    console.log(`✅ Video created: ${videoId}\n`);

    // Step 3: Analyze the story
    console.log("3️⃣ Analyzing story...");
    const analyzeResponse = await fetch(
      `${BASE_URL}/api/videos/${videoId}/analyze`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}), // No userFeedback for first analysis
      }
    );

    if (!analyzeResponse.ok) {
      throw new Error(
        `Failed to analyze story: ${analyzeResponse.status} ${await analyzeResponse.text()}`
      );
    }

    const analysis = await analyzeResponse.json();
    console.log("✅ Analysis complete!\n");
    console.log("📊 Analysis Results:");
    console.log(JSON.stringify(analysis, null, 2));
    console.log();

    // Step 4: Verify the analysis was stored
    console.log("4️⃣ Verifying stored data...");
    const videoDetailsResponse = await fetch(
      `${BASE_URL}/api/videos/${videoId}`
    );

    if (!videoDetailsResponse.ok) {
      throw new Error(
        `Failed to get video details: ${videoDetailsResponse.status}`
      );
    }

    const videoDetails = await videoDetailsResponse.json();
    console.log(`✅ Video status: ${videoDetails.video.status}`);
    console.log();

    // Step 5: Test iterative refinement
    console.log("5️⃣ Testing iterative refinement with feedback...");
    const refineResponse = await fetch(
      `${BASE_URL}/api/videos/${videoId}/analyze`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userFeedback:
            "Make the story more whimsical and add more fantasy elements",
        }),
      }
    );

    if (!refineResponse.ok) {
      throw new Error(
        `Failed to refine analysis: ${refineResponse.status} ${await refineResponse.text()}`
      );
    }

    const refinedAnalysis = await refineResponse.json();
    console.log("✅ Refined analysis complete!\n");
    console.log("📊 Refined Analysis Results:");
    console.log(JSON.stringify(refinedAnalysis, null, 2));
    console.log();

    // Step 6: Test with Chinese language
    console.log("6️⃣ Testing with Chinese language...");
    const chineseVideoResponse = await fetch(`${BASE_URL}/api/videos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        topic: "中秋节的传说：嫦娥奔月",
        language: "zh",
        duration: 30,
        isPremium: false,
        userId,
      }),
    });

    const { videoId: chineseVideoId } = await chineseVideoResponse.json();

    const chineseAnalyzeResponse = await fetch(
      `${BASE_URL}/api/videos/${chineseVideoId}/analyze`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      }
    );

    const chineseAnalysis = await chineseAnalyzeResponse.json();
    console.log("✅ Chinese analysis complete!\n");
    console.log("📊 Chinese Analysis Results:");
    console.log(JSON.stringify(chineseAnalysis, null, 2));
    console.log();

    // Cleanup
    console.log("7️⃣ Cleaning up test data...");
    const cleanupSession = driver.session();
    try {
      await cleanupSession.run(
        `MATCH (u:User {id: $userId}) DETACH DELETE u`,
        { userId }
      );
      console.log("✅ Test data cleaned up\n");
    } finally {
      await cleanupSession.close();
      await driver.close();
    }

    console.log("🎉 All tests passed!");
  } catch (error) {
    console.error("❌ Test failed:", error);
    Deno.exit(1);
  }
}

// Run the test
if (import.meta.main) {
  testStoryAnalyzer();
}
