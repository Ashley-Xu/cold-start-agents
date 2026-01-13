// Manual test script for Hailuo API integration
// Run with: deno run --allow-net --allow-env --env-file=.env test_hailuo.ts

import { generateAnimatedVideo, calculateCost } from "./ai/tools/hailuoClient.ts";

console.log("🧪 Testing Hailuo API Integration\n");

// Check if API key is configured
const apiKey = Deno.env.get("MINIMAX_API_KEY");
if (!apiKey) {
  console.error("❌ MINIMAX_API_KEY not found in .env file");
  console.log("\nPlease add your MiniMax API key to .env:");
  console.log("MINIMAX_API_KEY=your-api-key-here");
  console.log("\nGet your API key at: https://platform.minimax.io/");
  Deno.exit(1);
}

console.log("✓ MiniMax API key found");
console.log("\n" + "=".repeat(60));

// Test with a sample DALL-E image URL
// Using a public test image (you can replace with actual DALL-E output)
const testImageUrl = "https://oaidalleapiprodscus.blob.core.windows.net/private/org-your-org/user-your-user/img-test.png";

console.log("\n📋 Test Parameters:");
console.log("  Image URL: " + testImageUrl.substring(0, 60) + "...");
console.log("  Prompt: A knight walking through a misty forest");
console.log("  Resolution: 512p");
console.log("  Duration: 6 seconds");

// Calculate expected cost
const expectedCost = calculateCost("512p", 6);
console.log("\n💰 Expected Cost:");
console.log(`  $${expectedCost.toFixed(3)} (512p × 6 seconds)`);

console.log("\n" + "=".repeat(60));
console.log("\n🎬 Starting animation generation...");
console.log("⏳ This will take 30-90 seconds (polling every 5 seconds)\n");

try {
  const startTime = Date.now();

  const result = await generateAnimatedVideo({
    imageUrl: testImageUrl,
    prompt: "A knight walking through a misty forest with birds flying overhead. Animate with realistic character movement and cinematic camera work.",
    resolution: "512p",
    duration: 6,
  });

  const totalTime = (Date.now() - startTime) / 1000;

  console.log("\n" + "=".repeat(60));
  console.log("\n✅ Animation Generation Successful!\n");
  console.log("📊 Results:");
  console.log(`  Video URL: ${result.videoUrl.substring(0, 60)}...`);
  console.log(`  Generation Time: ${result.generationTime.toFixed(1)}s`);
  console.log(`  Total Time (with polling): ${totalTime.toFixed(1)}s`);
  console.log(`  Cost: $${expectedCost.toFixed(3)}`);

  console.log("\n" + "=".repeat(60));
  console.log("\n🎉 Test Passed!");
  console.log("\nNext Steps:");
  console.log("1. Download video from: " + result.videoUrl);
  console.log("2. Verify animation quality");
  console.log("3. Run full asset generation workflow test");

  Deno.exit(0);
} catch (error) {
  console.log("\n" + "=".repeat(60));
  console.error("\n❌ Animation Generation Failed\n");
  console.error("Error:", error.message);

  if (error.message.includes("401")) {
    console.error("\n🔑 Authentication Error:");
    console.error("  - Check that your MINIMAX_API_KEY is correct");
    console.error("  - Verify your API key at https://platform.minimax.io/");
  } else if (error.message.includes("429")) {
    console.error("\n⏱️  Rate Limit Error:");
    console.error("  - Too many requests");
    console.error("  - Wait a few minutes and try again");
  } else if (error.message.includes("timed out")) {
    console.error("\n⏱️  Timeout Error:");
    console.error("  - Generation took longer than 120 seconds");
    console.error("  - This is unusual, try again");
  } else if (error.message.includes("content")) {
    console.error("\n🚫 Content Policy Violation:");
    console.error("  - Your prompt or image may violate MiniMax policies");
    console.error("  - Try a different prompt");
  }

  console.log("\n" + "=".repeat(60));
  Deno.exit(1);
}
