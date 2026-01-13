// Test script for Script Writer endpoint

const BASE_URL = "http://localhost:8000";

async function testScriptWriter() {
  console.log("🧪 Testing Script Writer Endpoint\n");

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
    const analyzeResponse = await fetch(
      `${BASE_URL}/api/videos/${videoId}/analyze`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      },
    );

    const analysis = await analyzeResponse.json();
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
    console.log("✅ Script generation complete!\n");
    console.log("📊 Script Results:");
    console.log(`   Word Count: ${scriptResult.wordCount}`);
    console.log(`   Scene Count: ${scriptResult.scenes.length}`);
    console.log(
      `   Estimated Duration: ${scriptResult.estimatedDuration} seconds`,
    );
    console.log("\n📜 Full Script:");
    console.log(`   ${scriptResult.script}\n`);
    console.log("🎬 Scenes:");
    scriptResult.scenes.forEach((scene: any) => {
      console.log(
        `   Scene ${scene.order} (${scene.startTime}s - ${scene.endTime}s):`,
      );
      console.log(`      Narration: ${scene.narration.substring(0, 80)}...`);
      console.log(
        `      Visual: ${scene.visualDescription.substring(0, 80)}...`,
      );
    });
    console.log();

    // Step 5: Test with Chinese language
    console.log("5️⃣ Testing with Chinese language...");
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

    await fetch(`${BASE_URL}/api/videos/${chineseVideoId}/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });

    const chineseScriptResponse = await fetch(
      `${BASE_URL}/api/videos/${chineseVideoId}/script`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      },
    );

    const chineseScript = await chineseScriptResponse.json();
    console.log("✅ Chinese script generation complete!\n");
    console.log("📊 Chinese Script Results:");
    console.log(`   Word Count: ${chineseScript.wordCount}`);
    console.log(`   Scene Count: ${chineseScript.scenes.length}`);
    console.log("\n📜 Chinese Script:");
    console.log(`   ${chineseScript.script}\n`);

    // Step 6: Verify database storage
    console.log("6️⃣ Verifying database storage...");
    const verifySession = driver.session();
    try {
      const result = await verifySession.run(
        `
        MATCH (v:VideoProject {id: $videoId})-[:HAS_SCRIPT]->(s:Script)-[:HAS_SCENE]->(sc:SceneScript)
        RETURN v.status as status, s.wordCount as wordCount, count(sc) as sceneCount
        `,
        { videoId },
      );

      if (result.records.length > 0) {
        const record = result.records[0];
        console.log(`✅ Script stored in database:`);
        console.log(`   Status: ${record.get("status")}`);
        console.log(
          `   Word Count: ${typeof record.get("wordCount") === "number" ? record.get("wordCount") : record.get("wordCount").toNumber()}`,
        );
        console.log(
          `   Scene Count: ${typeof record.get("sceneCount") === "number" ? record.get("sceneCount") : record.get("sceneCount").toNumber()}`,
        );
      }
    } finally {
      await verifySession.close();
    }
    console.log();

    // Cleanup
    console.log("7️⃣ Cleaning up test data...");
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
  testScriptWriter();
}
