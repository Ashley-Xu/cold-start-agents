# YouTube Language Learning Video Scraper

A CLI tool to automatically find YouTube videos for language learning, with AI-powered difficulty detection and topic classification.

## Features

- **Multi-language support**: Chinese (HSK 1-6), French (CEFR A1-C2), Japanese (JLPT N5-N1)
- **Hybrid difficulty detection**: Metadata parsing (fast, free) + AI analysis (accurate, ~$0.0002/video)
- **Topic classification**: Cooking, GRWM, Sports, Mukbang, Vlog, Travel, Education, Entertainment
- **CSV export**: Organized by language/level/topic for easy filtering
- **SQLite caching**: Avoid re-analyzing the same videos
- **YouTube API quota management**: Tracks daily usage (10,000 units/day limit)

## Prerequisites

- [Deno 2.x](https://deno.com/) installed
- YouTube Data API v3 key ([Get one here](https://console.cloud.google.com/apis/credentials))
- OpenAI API key ([Get one here](https://platform.openai.com/api-keys))

## Installation

1. Clone this repository:
```bash
git clone <repo-url>
cd yt-scraper
```

2. Copy `.env.example` to `.env` and add your API keys:
```bash
cp .env.example .env
```

3. Edit `.env` and add your API keys:
```bash
YOUTUBE_API_KEY=your_youtube_api_key_here
OPENAI_API_KEY=your_openai_api_key_here
```

## Usage

### Basic Commands

```bash
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

# Check API quota usage
deno task scrape --quota-check
```

### CLI Options

```
Options:
  --language, -l <lang>        Language to search (chinese, french, japanese) [REQUIRED]
  --level <level>              Difficulty level (HSK1-6, A1-C2, N5-N1)
  --topic, -t <topic>          Topic filter (cooking, grwm, sports, mukbang, vlog, travel, education, entertainment)
  --duration, -d <duration>    Video duration filter (shorts, short, medium, long, or "5-10" for custom range)
  --max-results, -n <number>   Maximum videos to fetch (default: 50, max: 500)
  --output, -o <path>          Output directory (default: ./output)
  --ai-only                    Skip metadata analysis, use AI for all videos
  --no-cache                   Ignore cache, re-analyze all videos
  --quota-check                Display current YouTube API quota usage
  --help, -h                   Show help message
  --version, -v                Show version
```

## How It Works

### 1. Search Strategy

The tool builds optimized search queries for each language:

- **Chinese**: Searches for "HSK1 中文", "初级中文", "chinese for beginners"
- **French**: Searches for "français débutant", "french A1", "CEFR A1"
- **Japanese**: Searches for "JLPT N5", "日本語 初級", "japanese beginner"

Combined with topics (e.g., "中文 美食" for Chinese cooking videos)

### 1.5. Duration Filtering

Filter videos by length to match your learning preferences:

- **shorts** - YouTube Shorts (< 60 seconds) - Perfect for quick vocabulary practice
- **short** - Short videos (< 4 minutes) - Bite-sized lessons
- **medium** - Medium videos (4-20 minutes) - Default, ideal for language learning
- **long** - Long videos (> 20 minutes) - Immersive content
- **Custom range** - e.g., "5-10" for videos between 5-10 minutes

**How it works:**
1. Uses YouTube API's duration filter (short/medium/long) for initial search
2. For custom ranges and YouTube Shorts, filters results after fetching metadata
3. Ensures you only get videos in your preferred duration range

### 2. Difficulty Detection (Hybrid Approach)

```
1. Fetch video metadata (title, description)
2. Check cache (skip if already analyzed)
3. Run metadata analyzer (regex pattern matching)
   → If confidence ≥ 70%: Done! (fast, free)
   → If confidence < 70%: Continue to AI
4. Fetch transcript (first 5 minutes, unofficial API)
5. Run AI analyzer (GPT-4o-mini)
6. Cache result for future queries
```

**Metadata Patterns**:
- Explicit mentions: "HSK 2", "CEFR B1", "JLPT N4" → 90% confidence
- Partial matches: "beginner Chinese", "français débutant" → 70-89% confidence

**AI Analysis** (when metadata < 70% confidence):
- Analyzes vocabulary complexity, grammar structures, speaking speed
- Returns difficulty level + confidence score + reasoning
- Cost: ~$0.0002 per video (~$0.06 per 1,000 videos)

### 3. Topic Classification

Uses predefined multilingual keywords:
- **Cooking**: "cooking", "美食", "料理", "recette"
- **GRWM**: "get ready with me", "化妆", "メイク", "maquillage"
- **Sports**: "sports", "运动", "スポーツ", "sport"
- etc.

Falls back to AI if no keyword match found.

### 4. CSV Export

Results are saved in organized CSV files:

```
output/
├── chinese/
│   ├── HSK1/
│   │   ├── cooking.csv       # Chinese HSK1 cooking videos
│   │   ├── vlog.csv          # Chinese HSK1 vlogs
│   │   └── all.csv           # All Chinese HSK1 videos
│   ├── HSK2/ ...
│   └── all_chinese.csv       # All Chinese videos
├── french/
│   ├── A1/ ...
│   └── all_french.csv
└── master.csv                # All videos across all languages
```

**CSV Schema**:
```csv
video_id,title,url,channel_name,channel_url,duration_seconds,view_count,published_date,language,difficulty_level,difficulty_confidence,difficulty_source,topic,transcript_available,transcript_sample,analyzed_date
```

## API Quota Management

### YouTube Data API v3

- **Daily limit**: 10,000 units
- **Search cost**: 100 units per search
- **Video details cost**: 1 unit per video
- **Strategy**: The tool tracks quota usage and warns at 80%, stops at 100%

### OpenAI API

- **Model**: GPT-4o-mini
- **Cost**: ~$0.15/1M input tokens, ~$0.60/1M output tokens
- **Average cost**: ~$0.0002 per video analysis
- **1,000 videos**: ~$0.06 total (if 30% require AI analysis)

## Caching

Videos are cached in SQLite database (`cache/video_cache.db`):

- Avoids re-analyzing the same videos
- Stores difficulty assessment, topic, transcript sample, AI reasoning
- Tracks API quota usage by date

To ignore cache and force re-analysis:
```bash
deno task scrape --language chinese --no-cache
```

## Configuration

### Difficulty Patterns (`config/difficulty_patterns.json`)

Customize regex patterns for detecting difficulty levels in video titles/descriptions.

### Topics (`config/topics.json`)

Add or modify topic categories and their multilingual keywords.

### Environment Variables (`.env`)

```bash
TRANSCRIPT_MINUTES=5                    # Minutes of transcript to analyze (default: 5)
AI_CONFIDENCE_THRESHOLD=0.7             # Trust AI when confidence ≥ 0.7
METADATA_CONFIDENCE_THRESHOLD=0.7       # Skip AI when metadata confidence ≥ 0.7
```

## Troubleshooting

### "YouTube API quota exceeded"
- Wait 24 hours for quota to reset
- Use `--quota-check` to see current usage
- Reduce `--max-results` to fetch fewer videos

### "OpenAI API error"
- Check your API key in `.env`
- Ensure you have credits in your OpenAI account
- Use `--ai-only false` to skip AI analysis temporarily

### "No videos found"
- Try broader search (remove `--level` or `--topic`)
- Check if language code is correct (chinese, french, japanese)
- Some topics may have limited content for certain difficulty levels

## Development

### Project Structure

```
yt-scraper/
├── src/
│   ├── main.ts              # CLI entry point
│   ├── cli/                 # Command-line argument parsing
│   ├── youtube/             # YouTube API client, transcript fetcher
│   ├── analyzer/            # Difficulty & topic analysis
│   ├── storage/             # CSV writer, SQLite cache
│   ├── lib/                 # Types, utilities
│   └── openai/              # OpenAI API client
├── config/                  # Difficulty patterns, topics
├── output/                  # CSV exports (gitignored)
└── cache/                   # SQLite database (gitignored)
```

### Running Tests

```bash
deno test --allow-net --allow-read --allow-write --allow-env
```

## License

MIT

## Contributing

Contributions welcome! Please open an issue or PR.

## Credits

- [YouTube Data API v3](https://developers.google.com/youtube/v3)
- [youtube-transcript](https://www.npmjs.com/package/youtube-transcript) - Unofficial transcript API
- [OpenAI GPT-4o-mini](https://platform.openai.com/docs/models/gpt-4o-mini)
- [Deno](https://deno.com/)
