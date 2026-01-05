// Integration test for DALL-E + Hailuo animation workflow
// Run with: deno run --allow-net --allow-env --allow-read --allow-write --env-file=.env test_hailuo_integration.ts

import { generateAssets } from "./ai/agents/assetGenerator.ts";

console.log("🧪 Testing Full DALL-E + Hailuo Integration\n");

// Check if API keys are configured
const openaiKey = Deno.env.get("OPENAI_API_KEY");
const minimaxKey = Deno.env.get("MINIMAX_API_KEY_PAY_AS_YOU_GO");

if (!openaiKey) {
  console.error("❌ OPENAI_API_KEY not found in .env file");
  Deno.exit(1);
}

if (!minimaxKey) {
  console.warn("⚠️  MINIMAX_API_KEY_PAY_AS_YOU_GO not found - will test static fallback only");
  console.log("\nTo test animation, add to .env:");
  console.log("MINIMAX_API_KEY_PAY_AS_YOU_GO=your-api-key-here\n");
}

console.log("✓ OpenAI API key found");
if (minimaxKey) {
  console.log("✓ MiniMax API key found");
}

console.log("\n" + "=".repeat(70));

// Test with 2 simple scenes
const testScenes = [
  {
    order: 1,
    description: "A brave knight standing in a misty forest at dawn",
    imagePrompt: "A brave knight in shining armor standing in a misty forest at dawn, digital illustration style, cinematic lighting, vertical 9:16 composition",
  },
  {
    order: 2,
    description: "The knight walking through the forest with birds flying",
    imagePrompt: "A knight walking through a misty forest with colorful birds flying overhead, magical atmosphere, digital illustration style, vertical 9:16 composition",
  },
];

console.log("\n📋 Test Configuration:");
console.log(`  Scenes: ${testScenes.length}`);
console.log("  Pipeline: DALL-E 3 → Hailuo Animation (512p, 6s)");
if (!minimaxKey) {
  console.log("  Mode: STATIC FALLBACK (no animation)");
}

console.log("\n" + "=".repeat(70));
console.log("\n🎨 Starting Asset Generation...");
console.log("⏳ Phase 1: DALL-E 3 image generation (~30s per scene)");
if (minimaxKey) {
  console.log("⏳ Phase 2: Hailuo animation (~60s per scene)");
} else {
  console.log("⏳ Phase 2: Static image (instant)");
}
console.log("\nTotal estimated time: " + (minimaxKey ? "3-4 minutes" : "1-2 minutes"));
console.log();

try {
  const startTime = Date.now();

  const result = await generateAssets({
    scenes: testScenes,
    isPremium: false, // Not using Sora
  });

  const totalTime = (Date.now() - startTime) / 1000;

  console.log("\n" + "=".repeat(70));
  console.log("\n✅ Asset Generation Successful!\n");
  console.log("📊 Results:");
  console.log(`  Total Assets: ${result.assets.length}`);
  console.log(`  Total Time: ${totalTime.toFixed(1)}s (${(totalTime / 60).toFixed(1)} minutes)`);

  // Analyze results
  let totalCost = 0;
  let animatedCount = 0;
  let staticCount = 0;

  console.log("\n📸 Asset Details:");
  result.assets.forEach((asset, idx) => {
    console.log(`\n  Scene ${idx + 1}:`);
    console.log(`    Type: ${asset.type}`);
    console.log(`    URL: ${asset.url.substring(0, 60)}...`);
    console.log(`    Cost: $${asset.cost.toFixed(3)}`);
    if (asset.animationProvider) {
      console.log(`    Animation: ${asset.animationProvider}`);
      if (asset.animationProvider === "hailuo") {
        animatedCount++;
      } else {
        staticCount++;
      }
    }
    if (asset.generationTime) {
      console.log(`    Generation Time: ${asset.generationTime.toFixed(1)}s`);
    }
    totalCost += asset.cost;
  });

  console.log("\n💰 Cost Summary:");
  console.log(`  Total Cost: $${totalCost.toFixed(3)}`);
  console.log(`  Average per Scene: $${(totalCost / result.assets.length).toFixed(3)}`);
  console.log(`  Animated Scenes: ${animatedCount}`);
  console.log(`  Static Scenes: ${staticCount}`);

  console.log("\n" + "=".repeat(70));
  console.log("\n🎉 Integration Test Passed!");

  console.log("\n📝 Next Steps:");
  console.log("1. Review generated assets:");
  result.assets.forEach((asset, idx) => {
    console.log(`   Scene ${idx + 1}: ${asset.url}`);
  });
  console.log("\n2. Verify animation quality (character movement, camera motion)");
  console.log("3. Test with different prompts and scenes");
  console.log("4. Test error handling (invalid prompts, rate limits)");

  // Save results to file for review
  const outputFile = "./test_hailuo_results.json";
  await Deno.writeTextFile(
    outputFile,
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        totalTime,
        totalCost,
        animatedCount,
        staticCount,
        assets: result.assets.map((a) => ({
          sceneId: a.sceneId,
          type: a.type,
          url: a.url,
          cost: a.cost,
          animationProvider: a.animationProvider,
          generationTime: a.generationTime,
        })),
      },
      null,
      2
    )
  );
  console.log(`\n💾 Results saved to: ${outputFile}`);

  Deno.exit(0);
} catch (error) {
  console.log("\n" + "=".repeat(70));
  console.error("\n❌ Integration Test Failed\n");
  console.error("Error:", error.message);

  if (error.message.includes("DALL-E")) {
    console.error("\n🖼️  DALL-E 3 Error:");
    console.error("  - Check OpenAI API key");
    console.error("  - Verify API quota/credits");
    console.error("  - Check if prompt violates content policy");
  } else if (error.message.includes("Hailuo") || error.message.includes("MiniMax")) {
    console.error("\n🎬 Hailuo Animation Error:");
    console.error("  - Check MiniMax API key");
    console.error("  - Verify API quota/credits");
    console.error("  - Check if image URL is accessible");
  } else if (error.message.includes("content filters")) {
    console.error("\n🚫 Content Policy Violation:");
    console.error("  - OpenAI blocked one or more prompts");
    console.error("  - Try different, safer prompts");
  }

  console.error("\n📋 Stack Trace:");
  console.error(error.stack);

  console.log("\n" + "=".repeat(70));
  Deno.exit(1);
}
