// Command-line Argument Parser
// Parses and validates CLI arguments for the scraper

import { parse } from "@std/flags";
import type { CLIArgs, Language, DifficultyLevel, TopicId, DurationFilter } from "../lib/types.ts";

const VERSION = "1.0.0";

const LANGUAGES: Language[] = ["chinese", "french", "japanese"];

const DIFFICULTY_LEVELS: Record<Language, DifficultyLevel[]> = {
  chinese: ["HSK1", "HSK2", "HSK3", "HSK4", "HSK5", "HSK6"],
  french: ["A1", "A2", "B1", "B2", "C1", "C2"],
  japanese: ["N5", "N4", "N3", "N2", "N1"],
};

const TOPICS: TopicId[] = [
  "cooking",
  "grwm",
  "sports",
  "mukbang",
  "vlog",
  "travel",
  "education",
  "entertainment",
];

export function parseArgs(args: string[]): CLIArgs {
  const parsed = parse(args, {
    string: ["language", "level", "topic", "output", "duration", "l", "t", "o", "n", "d"],
    boolean: ["ai-only", "no-cache", "quota-check", "help", "version", "h", "v"],
    alias: {
      language: "l",
      topic: "t",
      output: "o",
      duration: "d",
      help: "h",
      version: "v",
      "max-results": "n",
    },
  });

  // Handle help
  if (parsed.help) {
    printHelp();
    Deno.exit(0);
  }

  // Handle version
  if (parsed.version) {
    console.log(`YouTube Language Learning Video Scraper v${VERSION}`);
    Deno.exit(0);
  }

  // Handle quota check
  if (parsed["quota-check"]) {
    return { quotaCheck: true };
  }

  // Validate required arguments
  const language = (parsed.language || parsed.l) as Language | undefined;

  if (!language) {
    console.error("Error: --language (-l) is required");
    console.error("Run with --help for usage information");
    Deno.exit(1);
  }

  if (!LANGUAGES.includes(language)) {
    console.error(`Error: Invalid language "${language}"`);
    console.error(`Valid languages: ${LANGUAGES.join(", ")}`);
    Deno.exit(1);
  }

  // Validate difficulty level
  const level = parsed.level as DifficultyLevel | undefined;

  if (level) {
    const validLevels = DIFFICULTY_LEVELS[language];
    if (!validLevels.includes(level)) {
      console.error(`Error: Invalid difficulty level "${level}" for language "${language}"`);
      console.error(`Valid levels for ${language}: ${validLevels.join(", ")}`);
      Deno.exit(1);
    }
  }

  // Validate topic
  const topic = (parsed.topic || parsed.t) as TopicId | undefined;

  if (topic && !TOPICS.includes(topic)) {
    console.error(`Error: Invalid topic "${topic}"`);
    console.error(`Valid topics: ${TOPICS.join(", ")}`);
    Deno.exit(1);
  }

  // Validate max-results
  const maxResults = parsed["max-results"]
    ? parseInt(parsed["max-results"] as string, 10)
    : 50;

  if (isNaN(maxResults) || maxResults < 1 || maxResults > 500) {
    console.error("Error: --max-results must be between 1 and 500");
    Deno.exit(1);
  }

  // Parse output directory
  const output = (parsed.output || parsed.o) as string | undefined;

  // Parse duration filter
  const durationStr = (parsed.duration || parsed.d) as string | undefined;
  let duration: DurationFilter | undefined;

  if (durationStr) {
    // Check if it's a preset (shorts, short, medium, long)
    if (["shorts", "short", "medium", "long"].includes(durationStr)) {
      duration = durationStr as DurationFilter;
    } else {
      // Parse custom range (e.g., "5-10" means 5 to 10 minutes)
      const match = durationStr.match(/^(\d+)-(\d+)$/);
      if (match) {
        const min = parseInt(match[1], 10);
        const max = parseInt(match[2], 10);

        if (min >= max) {
          console.error("Error: Duration range min must be less than max");
          Deno.exit(1);
        }

        duration = { min, max };
      } else {
        console.error(`Error: Invalid duration format "${durationStr}"`);
        console.error('Valid formats: "shorts", "short", "medium", "long", or "5-10" (custom range in minutes)');
        Deno.exit(1);
      }
    }
  }

  return {
    language,
    level,
    topic,
    maxResults,
    output,
    duration,
    aiOnly: parsed["ai-only"] || false,
    noCache: parsed["no-cache"] || false,
  };
}

function printHelp(): void {
  console.log(`
YouTube Language Learning Video Scraper v${VERSION}

USAGE:
  deno task scrape [OPTIONS]

OPTIONS:
  --language, -l <lang>        Language to search (chinese, french, japanese) [REQUIRED]
  --level <level>              Difficulty level (HSK1-6, A1-C2, N5-N1)
  --topic, -t <topic>          Topic filter (cooking, grwm, sports, mukbang, vlog, travel, education, entertainment)
  --duration, -d <duration>    Video duration filter (shorts, short, medium, long, or "5-10" for custom range)
  --max-results, -n <number>   Maximum videos to fetch (default: 50, max: 500)
  --output, -o <path>          Output directory (default: ./output)
  --ai-only                    Skip metadata analysis, use AI for all videos
  --no-cache                   Ignore cache, re-analyze all videos
  --quota-check                Display current YouTube API quota usage
  --help, -h                   Show this help message
  --version, -v                Show version

EXAMPLES:
  # Find 100 HSK1 Chinese cooking videos
  deno task scrape --language chinese --level HSK1 --topic cooking --max-results 100

  # Find French A2 videos (any topic), use AI analysis
  deno task scrape -l french --level A2 --ai-only -n 50

  # Find Japanese JLPT N3 vlogs
  deno task scrape -l japanese --level N3 -t vlog -n 75

  # Find Chinese YouTube Shorts only (< 60 seconds)
  deno task scrape -l chinese --duration shorts -n 50

  # Find French long videos (> 20 minutes)
  deno task scrape -l french --duration long -n 50

  # Find Japanese videos between 5-10 minutes
  deno task scrape -l japanese --duration 5-10 -n 50

  # Broad search: all Chinese videos (AI will determine difficulty)
  deno task scrape -l chinese -n 200

  # Check quota usage
  deno task scrape --quota-check

DIFFICULTY LEVELS:
  Chinese:  HSK1, HSK2, HSK3, HSK4, HSK5, HSK6
  French:   A1, A2, B1, B2, C1, C2
  Japanese: N5, N4, N3, N2, N1

TOPICS:
  cooking, grwm, sports, mukbang, vlog, travel, education, entertainment

DURATION FILTERS:
  shorts  - YouTube Shorts (< 60 seconds)
  short   - Short videos (< 4 minutes)
  medium  - Medium videos (4-20 minutes) [DEFAULT]
  long    - Long videos (> 20 minutes)
  5-10    - Custom range (5 to 10 minutes)

For more information, visit: https://github.com/your-repo/yt-scraper
  `);
}
