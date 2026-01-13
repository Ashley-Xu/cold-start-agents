// YouTube Language Learning Video Scraper
// Main CLI entry point and workflow orchestration

import "@std/dotenv/load";
import { parseArgs } from "./cli/args.ts";
import { YouTubeClient } from "./youtube/api_client.ts";
import { TranscriptFetcher } from "./youtube/transcript.ts";
import { buildSearchQuery } from "./youtube/search.ts";
import { MetadataAnalyzer } from "./analyzer/metadata_analyzer.ts";
import { AIAnalyzer } from "./analyzer/ai_analyzer.ts";
import { TopicClassifier } from "./analyzer/topic_classifier.ts";
import { OpenAIClient } from "./openai/client.ts";
import { VideoCache } from "./storage/cache.ts";
import { CSVWriter } from "./storage/csv_writer.ts";
import type { VideoCSVRow, VideoMetadata } from "./lib/types.ts";
import { progressBar, formatNumber } from "./lib/utils.ts";

async function main() {
  console.log("\n🎥 YouTube Language Learning Video Scraper\n");

  // Parse CLI arguments
  const args = parseArgs(Deno.args);

  // Load environment variables
  const YOUTUBE_API_KEY = Deno.env.get("YOUTUBE_API_KEY");
  const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
  const TRANSCRIPT_MINUTES = parseInt(Deno.env.get("TRANSCRIPT_MINUTES") || "5", 10);
  const AI_CONFIDENCE_THRESHOLD = parseFloat(
    Deno.env.get("AI_CONFIDENCE_THRESHOLD") || "0.7"
  );
  const METADATA_CONFIDENCE_THRESHOLD = parseFloat(
    Deno.env.get("METADATA_CONFIDENCE_THRESHOLD") || "0.7"
  );

  if (!YOUTUBE_API_KEY || !OPENAI_API_KEY) {
    console.error("❌ Error: API keys not configured");
    console.error("Please set YOUTUBE_API_KEY and OPENAI_API_KEY in .env file");
    Deno.exit(1);
  }

  // Initialize clients
  const youtubeClient = new YouTubeClient(YOUTUBE_API_KEY);
  const transcriptFetcher = new TranscriptFetcher(TRANSCRIPT_MINUTES);
  const openaiClient = new OpenAIClient(OPENAI_API_KEY);
  const cache = new VideoCache();
  const csvWriter = new CSVWriter(args.output);

  // Handle quota check
  if (args.quotaCheck) {
    const usage = cache.getUsageToday();
    const youtubeQuota = youtubeClient.getQuotaUsage();

    console.log("\n📊 API Usage (Today)\n");
    console.log(`YouTube API Quota: ${formatNumber(youtubeQuota.used)} / ${formatNumber(youtubeQuota.limit)} units (${youtubeQuota.percentage.toFixed(1)}%)`);
    console.log(`OpenAI Tokens: ${formatNumber(usage.openai_tokens_used)} (~$${openaiClient.estimateCost().toFixed(4)})`);
    console.log();

    cache.close();
    return;
  }

  // Validate required args
  if (!args.language) {
    console.error("❌ Error: --language is required");
    Deno.exit(1);
  }

  // Load configuration files
  console.log("⚙️  Loading configuration...");
  const difficultyConfig = await MetadataAnalyzer.loadConfig();
  const topics = await TopicClassifier.loadConfig();

  // Initialize analyzers
  const metadataAnalyzer = new MetadataAnalyzer(
    difficultyConfig,
    METADATA_CONFIDENCE_THRESHOLD
  );
  const aiAnalyzer = new AIAnalyzer(openaiClient, AI_CONFIDENCE_THRESHOLD);
  const topicClassifier = new TopicClassifier(topics, openaiClient, !args.aiOnly);

  console.log("✓ Configuration loaded\n");

  // Build search query
  const searchQuery = buildSearchQuery(args.language, args.level, args.topic, args.duration);

  console.log(`🔍 Searching for videos...`);
  console.log(`   Language: ${args.language}`);
  if (args.level) console.log(`   Level: ${args.level}`);
  if (args.topic) console.log(`   Topic: ${args.topic}`);
  if (args.duration) {
    if (typeof args.duration === "string") {
      console.log(`   Duration: ${args.duration}`);
    } else {
      console.log(`   Duration: ${args.duration.min}-${args.duration.max} minutes`);
    }
  }
  console.log(`   Max results: ${args.maxResults}`);
  console.log(`   Query: "${searchQuery.query}"\n`);

  // Search YouTube
  const searchResults = await youtubeClient.searchVideos(
    searchQuery.query,
    args.maxResults,
    {
      relevanceLanguage: searchQuery.relevanceLanguage,
      videoDuration: searchQuery.videoDuration,
    }
  );

  if (searchResults.length === 0) {
    console.log("❌ No videos found matching your criteria");
    cache.close();
    return;
  }

  console.log(`✓ Found ${searchResults.length} videos\n`);

  // Fetch detailed metadata
  console.log("📥 Fetching video metadata...");
  const videoIds = searchResults.map((r) => r.videoId);
  const videos = await youtubeClient.getVideoDetails(videoIds, searchQuery.customDurationFilter);

  if (videos.length === 0) {
    console.log("❌ No videos found matching your duration criteria after filtering");
    cache.close();
    return;
  }

  console.log(`✓ Retrieved metadata for ${videos.length} videos\n`);

  // Analyze videos
  console.log("🔬 Analyzing videos...\n");

  let analyzed = 0;
  let cached = 0;
  let metadataOnly = 0;
  let aiAnalyzed = 0;

  for (const [index, video] of videos.entries()) {
    console.log(`\n${progressBar(index + 1, videos.length)}`);
    console.log(`📹 ${video.title.substring(0, 60)}...`);

    // Check cache (unless --no-cache flag)
    if (!args.noCache && cache.has(video.videoId)) {
      console.log("   ✓ Using cached result");
      cached++;
      continue;
    }

    // Analyze difficulty
    let difficulty = metadataAnalyzer.analyze(video, args.language);

    // If metadata confidence is low and not --ai-only, use AI
    if (
      !args.aiOnly &&
      !metadataAnalyzer.shouldSkipAI(difficulty) &&
      difficulty.confidence < METADATA_CONFIDENCE_THRESHOLD
    ) {
      console.log("   → Fetching transcript for AI analysis...");

      const transcript = await transcriptFetcher.getTranscript(video.videoId, args.language);

      if (transcript) {
        difficulty = await aiAnalyzer.analyze(transcript, args.language);
        aiAnalyzed++;
      } else {
        console.log("   ⚠️  No transcript available, using metadata result");
      }
    } else if (args.aiOnly) {
      // Force AI analysis
      console.log("   → Using AI analysis (--ai-only)...");

      const transcript = await transcriptFetcher.getTranscript(video.videoId, args.language);

      if (transcript) {
        difficulty = await aiAnalyzer.analyze(transcript, args.language);
        aiAnalyzed++;
      } else {
        console.log("   ⚠️  No transcript available for AI analysis");
      }
    } else {
      metadataOnly++;
    }

    // Classify topic
    const topicResult = await topicClassifier.classify(video);

    console.log(
      `   ✓ Difficulty: ${difficulty.level || "unknown"} (${(difficulty.confidence * 100).toFixed(0)}%, ${difficulty.source})`
    );
    console.log(`   ✓ Topic: ${topicResult.topic}`);

    // Save to cache
    const transcript = difficulty.source === "ai"
      ? await transcriptFetcher.getTranscript(video.videoId, args.language)
      : null;

    cache.save(
      video.videoId,
      {
        title: video.title,
        channelId: video.channelId,
        channelName: video.channelTitle,
        durationSeconds: video.durationSeconds,
        viewCount: video.viewCount,
        publishedAt: video.publishedAt,
      },
      args.language,
      difficulty,
      topicResult,
      transcript
    );

    // Write to CSV
    const csvRow: VideoCSVRow = {
      video_id: video.videoId,
      title: video.title,
      url: `https://youtube.com/watch?v=${video.videoId}`,
      channel_name: video.channelTitle,
      channel_url: `https://youtube.com/channel/${video.channelId}`,
      duration_seconds: video.durationSeconds,
      view_count: video.viewCount,
      published_date: video.publishedAt,
      language: args.language,
      difficulty_level: difficulty.level,
      difficulty_confidence: difficulty.confidence,
      difficulty_source: difficulty.source,
      topic: topicResult.topic,
      transcript_available: !!transcript,
      transcript_sample: transcript?.substring(0, 200) || "",
      analyzed_date: new Date().toISOString(),
    };

    await csvWriter.write(csvRow);

    analyzed++;
  }

  // Track API usage
  cache.addOpenAITokens(openaiClient.getTokensUsed());

  // Display summary
  console.log("\n\n✅ Analysis Complete!\n");
  console.log("📊 Summary:");
  console.log(`   Total videos: ${videos.length}`);
  console.log(`   Analyzed: ${analyzed}`);
  console.log(`   Cached: ${cached}`);
  console.log(`   Metadata only: ${metadataOnly}`);
  console.log(`   AI analyzed: ${aiAnalyzed}`);

  const youtubeQuota = youtubeClient.getQuotaUsage();
  console.log(`\n💰 API Usage:`);
  console.log(`   YouTube quota: ${formatNumber(youtubeQuota.used)} / ${formatNumber(youtubeQuota.limit)} units (${youtubeQuota.percentage.toFixed(1)}%)`);
  console.log(`   OpenAI tokens: ${formatNumber(openaiClient.getTokensUsed())} (~$${openaiClient.estimateCost().toFixed(4)})`);

  console.log(`\n📁 Output: ${args.output || "./output"}`);
  console.log();

  // Cleanup
  cache.close();
}

// Run main function
if (import.meta.main) {
  try {
    await main();
  } catch (error) {
    console.error(`\n❌ Error: ${error.message}`);
    Deno.exit(1);
  }
}
