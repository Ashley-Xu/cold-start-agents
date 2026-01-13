// CSV Writer for Video Results
// Writes analyzed videos to organized CSV files by language/level/topic

import { stringify } from "@std/csv";
import { ensureDir } from "@std/fs";
import { join } from "@std/path";
import type { VideoCSVRow, Language, DifficultyLevel, TopicId } from "../lib/types.ts";

export class CSVWriter {
  private outputDir: string;

  constructor(outputDir: string = "./output") {
    this.outputDir = outputDir;
  }

  /**
   * Write video to CSV files
   * Creates multiple files: specific (language/level/topic), level-all, language-all, master
   */
  async write(row: VideoCSVRow): Promise<void> {
    const paths = this.generatePaths(row.language, row.difficulty_level, row.topic);

    // Write to all applicable CSV files
    for (const path of paths) {
      await this.appendToCSV(path, row);
    }

    console.log(
      `[CSV] Saved to ${paths.length} files: ${row.video_id} (${row.difficulty_level}, ${row.topic})`
    );
  }

  /**
   * Write multiple videos in batch
   */
  async writeBatch(rows: VideoCSVRow[]): Promise<void> {
    for (const row of rows) {
      await this.write(row);
    }

    console.log(`[CSV] Batch write complete: ${rows.length} videos`);
  }

  /**
   * Generate all CSV file paths for a video
   */
  private generatePaths(
    language: Language,
    level: DifficultyLevel | null,
    topic: TopicId
  ): string[] {
    const paths: string[] = [];

    // Master file (all videos)
    paths.push(join(this.outputDir, "master.csv"));

    // Language-specific file (all videos for this language)
    paths.push(join(this.outputDir, language, `all_${language}.csv`));

    if (level) {
      // Level-specific file (all videos for this language + level)
      paths.push(join(this.outputDir, language, level, "all.csv"));

      // Topic-specific file (language + level + topic)
      paths.push(join(this.outputDir, language, level, `${topic}.csv`));
    }

    return paths;
  }

  /**
   * Append row to CSV file (creates file with headers if doesn't exist)
   */
  private async appendToCSV(filePath: string, row: VideoCSVRow): Promise<void> {
    // Ensure directory exists
    const dir = filePath.substring(0, filePath.lastIndexOf("/"));
    await ensureDir(dir);

    // Check if file exists
    const fileExists = await this.fileExists(filePath);

    // Read existing content (to check for duplicates)
    let existingContent = "";
    if (fileExists) {
      try {
        existingContent = await Deno.readTextFile(filePath);
      } catch {
        // File might be locked or empty
        existingContent = "";
      }
    }

    // Check for duplicate video_id
    if (existingContent.includes(row.video_id)) {
      console.log(`[CSV] Skipping duplicate: ${row.video_id} in ${filePath}`);
      return;
    }

    // Convert row to CSV
    const csvRow = stringify([
      [
        row.video_id,
        row.title,
        row.url,
        row.channel_name,
        row.channel_url,
        row.duration_seconds.toString(),
        row.view_count.toString(),
        row.published_date,
        row.language,
        row.difficulty_level || "",
        row.difficulty_confidence.toFixed(2),
        row.difficulty_source,
        row.topic,
        row.transcript_available ? "true" : "false",
        row.transcript_sample.substring(0, 200), // Truncate for CSV
        row.analyzed_date,
      ],
    ], { headers: false });

    // If file doesn't exist, create with headers
    if (!fileExists) {
      const headers = stringify([
        [
          "video_id",
          "title",
          "url",
          "channel_name",
          "channel_url",
          "duration_seconds",
          "view_count",
          "published_date",
          "language",
          "difficulty_level",
          "difficulty_confidence",
          "difficulty_source",
          "topic",
          "transcript_available",
          "transcript_sample",
          "analyzed_date",
        ],
      ], { headers: false });

      await Deno.writeTextFile(filePath, headers);
    }

    // Append row
    await Deno.writeTextFile(filePath, csvRow, { append: true });
  }

  /**
   * Check if file exists
   */
  private async fileExists(path: string): Promise<boolean> {
    try {
      await Deno.stat(path);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Read all videos from a CSV file
   */
  async read(filePath: string): Promise<VideoCSVRow[]> {
    try {
      const content = await Deno.readTextFile(filePath);
      const lines = content.trim().split("\n");

      // Skip header row
      const dataLines = lines.slice(1);

      return dataLines.map((line) => {
        const values = line.split(",");

        return {
          video_id: values[0],
          title: values[1],
          url: values[2],
          channel_name: values[3],
          channel_url: values[4],
          duration_seconds: parseInt(values[5], 10),
          view_count: parseInt(values[6], 10),
          published_date: values[7],
          language: values[8] as Language,
          difficulty_level: (values[9] || null) as DifficultyLevel | null,
          difficulty_confidence: parseFloat(values[10]),
          difficulty_source: values[11] as "metadata" | "ai" | "unknown",
          topic: values[12] as TopicId,
          transcript_available: values[13] === "true",
          transcript_sample: values[14],
          analyzed_date: values[15],
        };
      });
    } catch (error) {
      throw new Error(`Failed to read CSV file ${filePath}: ${error.message}`);
    }
  }

  /**
   * Get statistics for a CSV file
   */
  async getStats(filePath: string): Promise<{
    totalVideos: number;
    difficultyBreakdown: Record<string, number>;
    topicBreakdown: Record<string, number>;
  }> {
    const videos = await this.read(filePath);

    const difficultyBreakdown: Record<string, number> = {};
    const topicBreakdown: Record<string, number> = {};

    for (const video of videos) {
      const level = video.difficulty_level || "unknown";
      difficultyBreakdown[level] = (difficultyBreakdown[level] || 0) + 1;

      topicBreakdown[video.topic] = (topicBreakdown[video.topic] || 0) + 1;
    }

    return {
      totalVideos: videos.length,
      difficultyBreakdown,
      topicBreakdown,
    };
  }
}
