// Debug test to inspect MiniMax API response
// Run with: deno run --allow-net --allow-env --env-file=.env test_hailuo_debug.ts

console.log("🔍 Debugging MiniMax Hailuo API Response\n");

const apiKey = Deno.env.get("MINIMAX_API_KEY_PAY_AS_YOU_GO");
if (!apiKey) {
  console.error("❌ MINIMAX_API_KEY_PAY_AS_YOU_GO not found in .env file");
  Deno.exit(1);
}

console.log("✓ MiniMax API key found");
console.log("\n" + "=".repeat(70));

// Use a simple test image URL (from DALL-E)
const testImageUrl = "https://oaidalleapiprodscus.blob.core.windows.net/private/org-vJ63oVv7JJ3ApQTBVj3QqXD6/user-Z0QsM8SgPzQnsUSMmSCH6goa/img-608dgYc1VvbKj6Rb22BPlK5t.png?st=2026-01-05T04%3A45%3A25Z&se=2026-01-05T06%3A45%3A25Z&sp=r&sv=2024-08-04&sr=b&rscd=inline&rsct=image/png&skoid=9346e9b9-5d29-4d37-a0a9-c6f95f09f79d&sktid=a48cca56-e6da-484e-a814-9c849652bcb3&skt=2026-01-05T05%3A38%3A31Z&ske=2026-01-06T05%3A38%3A31Z&sks=b&skv=2024-08-04&sig=RZpdJt3/yooJ20f/7L2AqfWnPL5fz2xnPSPtxIVe41M%3D";

const requestPayload = {
  model: "MiniMax-Hailuo-2.3",
  prompt: "A knight walking through a misty forest with realistic movement and cinematic camera work",
  first_frame_image: testImageUrl,
  duration: 6,
  resolution: "768P",
};

console.log("\n📤 Request Payload:");
console.log(JSON.stringify(requestPayload, null, 2));

console.log("\n" + "=".repeat(70));
console.log("\n🌐 Calling MiniMax API...\n");

try {
  const response = await fetch("https://api.minimax.io/v1/video_generation", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestPayload),
  });

  console.log(`📊 Response Status: ${response.status} ${response.statusText}`);
  console.log("\n📥 Response Headers:");
  response.headers.forEach((value, key) => {
    console.log(`  ${key}: ${value}`);
  });

  const responseText = await response.text();

  console.log("\n📥 Raw Response Body:");
  console.log(responseText);

  if (!response.ok) {
    console.error("\n❌ API Error!");
    console.error("Status:", response.status);
    console.error("Body:", responseText);
    Deno.exit(1);
  }

  // Try to parse as JSON
  let parsedResponse;
  try {
    parsedResponse = JSON.parse(responseText);
    console.log("\n📥 Parsed JSON Response:");
    console.log(JSON.stringify(parsedResponse, null, 2));

    // Analyze the structure
    console.log("\n🔍 Response Structure Analysis:");
    console.log("  Keys:", Object.keys(parsedResponse).join(", "));

    if (parsedResponse.task_id) {
      console.log(`  ✓ Found task_id: ${parsedResponse.task_id}`);
    } else if (parsedResponse.id) {
      console.log(`  ✓ Found id: ${parsedResponse.id}`);
    } else {
      console.log("  ❌ No task_id or id field found!");
      console.log("  Available fields:", Object.keys(parsedResponse));
    }

    if (parsedResponse.status) {
      console.log(`  ✓ Found status: ${parsedResponse.status}`);
    }

  } catch (e) {
    console.error("\n⚠️  Response is not valid JSON");
    console.error("Parse error:", e.message);
  }

  console.log("\n" + "=".repeat(70));
  console.log("\n✅ Debug Complete!");

} catch (error) {
  console.error("\n❌ Request Failed!");
  console.error("Error:", error.message);
  console.error("\nStack:", error.stack);
  Deno.exit(1);
}
