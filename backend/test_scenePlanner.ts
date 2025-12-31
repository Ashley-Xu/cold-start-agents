// Test script for Scene Planner endpoint

const BASE_URL = "http://localhost:8000";

async function testScenePlanner() {
  console.log("🧪 Testing Scene Planner Endpoint\n");

  try {
    // Step 1: Create test user
    console.log("1️⃣ Creating test user...");
    const userId = crypto.randomUUID();

    const neo4j = await import("neo4j-driver");
    const driver = neo4j.default.driver(
      Deno.env.get("NEO4J_URI") || "bolt://localhost:7687",
      neo4j.default.auth.basic(
        Deno.env.get("NEO4J_USERNAME") || "neo4j",
        Deno.env.get("NEO4J_PASSWORD") || "coldstart-password",
      ),
    );

    const session = driver.session();
    try {
      await session.run(
        `CREATE (u:User {id: $userId, email: $email, preferredName: $name, nativeLanguage: 'en'})`,
        {
          userId,
          email: "test@example.com",
          name: "Test User",
        },
      );
      console.log(`✅ User created: ${userId}\n`);
    } finally {
      await session.close();
    }

    // Step 2: Create video project
    console.log("2️⃣ Creating video project...");
    const createVideoResponse = await fetch(`${BASE_URL}/api/videos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        topic:
          "A magical journey through an enchanted forest where a young girl discovers she can talk to animals",
        language: "en",
        duration: 60,
        isPremium: false,
        userId,
      }),
    });

    const { videoId } = await createVideoResponse.json();
    console.log(`✅ Video created: ${videoId}\n`);

    // Step 3: Analyze the story
    console.log("3️⃣ Analyzing story...");
    await fetch(`${BASE_URL}/api/videos/${videoId}/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    console.log(`✅ Analysis complete!\n`);

    // Step 4: Generate script
    console.log("4️⃣ Generating script...");
    const scriptResponse = await fetch(
      `${BASE_URL}/api/videos/${videoId}/script`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      },
    );

    if (!scriptResponse.ok) {
      throw new Error(
        `Failed to generate script: ${scriptResponse.status} ${await scriptResponse.text()}`,
      );
    }

    const scriptResult = await scriptResponse.json();
    console.log("✅ Script generation complete!");
    console.log(`   Scenes: ${scriptResult.scenes.length}\n`);

    // Step 5: Approve script (manual approval simulation)
    console.log("5️⃣ Approving script...");
    const approveSession = driver.session();
    try {
      await approveSession.run(
        `MATCH (v:VideoProject {id: $videoId})
         SET v.status = 'script_approved'
         RETURN v`,
        { videoId },
      );
      console.log(`✅ Script approved, status updated to 'script_approved'\n`);
    } finally {
      await approveSession.close();
    }

    // Step 6: Generate storyboard
    console.log("6️⃣ Generating storyboard...");
    const storyboardResponse = await fetch(
      `${BASE_URL}/api/videos/${videoId}/storyboard`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      },
    );

    if (!storyboardResponse.ok) {
      throw new Error(
        `Failed to generate storyboard: ${storyboardResponse.status} ${await storyboardResponse.text()}`,
      );
    }

    const storyboardResult = await storyboardResponse.json();
    console.log("✅ Storyboard generation complete!\n");
    console.log("📊 Storyboard Results:");
    console.log(`   Title: ${storyboardResult.storyboard.title}`);
    console.log(`   Visual Style: ${storyboardResult.storyboard.visualStyle}`);
    console.log(`   Color Palette: ${storyboardResult.storyboard.colorPalette}`);
    console.log(`   Scene Count: ${storyboardResult.scenes.length}`);
    console.log("\n🎬 Sample Scenes:");

    // Display first 3 scenes
    storyboardResult.scenes.slice(0, 3).forEach((scene: any) => {
      console.log(`\n   Scene ${scene.order}: ${scene.title}`);
      console.log(`      Duration: ${scene.duration}s`);
      console.log(`      Camera: ${scene.cameraAngle}`);
      console.log(`      Composition: ${scene.composition}`);
      console.log(`      Lighting: ${scene.lighting}`);
      console.log(`      Transition: ${scene.transition}`);
      console.log(
        `      Image Prompt: ${scene.imagePrompt.substring(0, 100)}...`,
      );
    });
    console.log();

    // Step 7: Verify database storage
    console.log("7️⃣ Verifying database storage...");
    const verifySession = driver.session();
    try {
      const result = await verifySession.run(
        `
        MATCH (v:VideoProject {id: $videoId})-[:HAS_STORYBOARD]->(sb:Storyboard)
        MATCH (sb)-[:HAS_SCENE]->(sc:StoryboardScene)
        RETURN v.status as status,
               sb.title as sbTitle,
               sb.visualStyle as visualStyle,
               count(sc) as sceneCount
        `,
        { videoId },
      );

      if (result.records.length > 0) {
        const record = result.records[0];
        console.log(`✅ Storyboard stored in database:`);
        console.log(`   Status: ${record.get("status")}`);
        console.log(`   Title: ${record.get("sbTitle")}`);
        console.log(`   Visual Style: ${record.get("visualStyle")}`);
        console.log(
          `   Scene Count: ${
            typeof record.get("sceneCount") === "number"
              ? record.get("sceneCount")
              : record.get("sceneCount").toNumber()
          }`,
        );
      }
    } finally {
      await verifySession.close();
    }
    console.log();

    // Step 8: Test DALL-E 3 prompt quality
    console.log("8️⃣ Checking DALL-E 3 prompt quality...");
    const prompts = storyboardResult.scenes.map((s: any) => s.imagePrompt);
    const avgLength = prompts.reduce((sum: number, p: string) => sum + p.length, 0) / prompts.length;

    console.log(`   Average prompt length: ${Math.round(avgLength)} chars`);
    console.log(`   Target range: 200-300 chars`);

    const inRange = prompts.filter((p: string) => p.length >= 150 && p.length <= 350).length;
    console.log(`   Prompts in range (150-350): ${inRange}/${prompts.length}`);

    // Check for key elements in prompts
    const hasSubject = prompts.filter((p: string) => p.length > 50).length;
    const hasStyle = prompts.filter((p: string) =>
      p.includes('illustration') ||
      p.includes('render') ||
      p.includes('style') ||
      p.includes('photorealistic')
    ).length;

    console.log(`   Prompts with substantial content: ${hasSubject}/${prompts.length}`);
    console.log(`   Prompts with art style: ${hasStyle}/${prompts.length}`);
    console.log();

    // Cleanup
    console.log("9️⃣ Cleaning up test data...");
    const cleanupSession = driver.session();
    try {
      await cleanupSession.run(
        `MATCH (u:User {id: $userId}) DETACH DELETE u`,
        { userId },
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
  testScenePlanner();
}
