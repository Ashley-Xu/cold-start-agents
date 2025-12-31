# Word-Level Timestamp Usage Examples

## Basic Usage

### 1. Assemble Video with Timestamps

```typescript
import { assembleVideo } from "./ai/agents/videoAssembler.ts";
import type { VideoAssemblerInput } from "./lib/types.ts";

const input: VideoAssemblerInput = {
  videoId: "story-123",
  language: "en",
  duration: 30,
  scenes: [
    {
      order: 1,
      narration: "Welcome to our story about a brave knight.",
      startTime: 0,
      endTime: 5,
      assetUrl: "https://example.com/scene1.jpg",
      transition: "fade",
    },
    {
      order: 2,
      narration: "The knight embarked on an epic adventure.",
      startTime: 5,
      endTime: 10,
      assetUrl: "https://example.com/scene2.jpg",
      transition: "fade",
    },
  ],
};

const result = await assembleVideo(input);

console.log("Transcript:", result.transcript);
// Output:
// {
//   text: "Welcome to our story about a brave knight. The knight embarked...",
//   words: [
//     { word: "Welcome", start: 0.0, end: 0.234 },
//     { word: "to", start: 0.234, end: 0.345 },
//     // ... etc
//   ],
//   language: "en",
//   duration: 10.5
// }
```

## Advanced Use Cases

### 2. Generate Karaoke-Style Captions

```typescript
// Create WebVTT file with word-level cues for real-time highlighting
function generateKaraokeVTT(transcript: Transcript): string {
  let vtt = "WEBVTT\n\n";

  transcript.words.forEach((word, idx) => {
    const startTime = formatVTTTime(word.start);
    const endTime = formatVTTTime(word.end);

    vtt += `${idx + 1}\n`;
    vtt += `${startTime} --> ${endTime}\n`;
    vtt += `<c.karaoke>${word.word}</c>\n\n`;
  });

  return vtt;
}

function formatVTTTime(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${secs.toFixed(3)}`;
}

// Usage
const karaokeVTT = generateKaraokeVTT(result.transcript);
await Deno.writeTextFile("karaoke.vtt", karaokeVTT);
```

### 3. Interactive Word Replay for Language Learning

```typescript
// Frontend: Play audio segment for a specific word
function playWord(transcript: Transcript, wordIndex: number) {
  const word = transcript.words[wordIndex];
  const audio = new Audio(audioUrl);

  audio.currentTime = word.start;
  audio.play();

  // Stop at word end
  setTimeout(() => {
    audio.pause();
  }, (word.end - word.start) * 1000);

  // Highlight word in UI
  highlightWord(wordIndex);
}

// Example: Click on any word to hear it pronounced
document.querySelectorAll('.word').forEach((element, idx) => {
  element.addEventListener('click', () => playWord(transcript, idx));
});
```

### 4. Analyze Speech Patterns

```typescript
// Calculate speaking rate (words per minute)
function calculateSpeakingRate(transcript: Transcript): number {
  const totalDuration = transcript.duration / 60; // Convert to minutes
  const wordsPerMinute = transcript.words.length / totalDuration;
  return Math.round(wordsPerMinute);
}

// Find longest/shortest words by duration
function analyzeWordDurations(transcript: Transcript) {
  const durations = transcript.words.map(w => ({
    word: w.word,
    duration: w.end - w.start
  }));

  durations.sort((a, b) => b.duration - a.duration);

  return {
    longest: durations.slice(0, 10),
    shortest: durations.slice(-10).reverse(),
    average: durations.reduce((sum, w) => sum + w.duration, 0) / durations.length
  };
}

// Usage
const rate = calculateSpeakingRate(result.transcript);
console.log(`Speaking rate: ${rate} WPM`);

const analysis = analyzeWordDurations(result.transcript);
console.log("Longest words:", analysis.longest);
console.log("Average word duration:", analysis.average.toFixed(3), "seconds");
```

### 5. Generate JSON for External Tools

```typescript
// Export transcript for subtitle editors or other tools
function exportTranscript(result: VideoAssemblerOutput, format: "json" | "csv") {
  if (format === "json") {
    return JSON.stringify({
      videoId: result.videoUrl,
      language: result.transcript.language,
      duration: result.transcript.duration,
      wordCount: result.transcript.words.length,
      words: result.transcript.words.map(w => ({
        text: w.word,
        startMs: Math.round(w.start * 1000),
        endMs: Math.round(w.end * 1000),
        durationMs: Math.round((w.end - w.start) * 1000)
      }))
    }, null, 2);
  } else {
    // CSV format
    let csv = "Index,Word,Start (s),End (s),Duration (s)\n";
    result.transcript.words.forEach((w, idx) => {
      csv += `${idx + 1},${w.word},${w.start.toFixed(3)},${w.end.toFixed(3)},${(w.end - w.start).toFixed(3)}\n`;
    });
    return csv;
  }
}

// Usage
const jsonExport = exportTranscript(result, "json");
await Deno.writeTextFile("transcript.json", jsonExport);

const csvExport = exportTranscript(result, "csv");
await Deno.writeTextFile("transcript.csv", csvExport);
```

### 6. Search Within Video by Word

```typescript
// Find all occurrences of a word and their timestamps
function findWord(transcript: Transcript, searchTerm: string): Array<{word: string, start: number, end: number, index: number}> {
  return transcript.words
    .map((w, idx) => ({ ...w, index: idx }))
    .filter(w => w.word.toLowerCase().includes(searchTerm.toLowerCase()));
}

// Usage
const knightMentions = findWord(result.transcript, "knight");
console.log(`"knight" appears ${knightMentions.length} times:`);
knightMentions.forEach(mention => {
  console.log(`  - At ${mention.start.toFixed(1)}s (word #${mention.index + 1})`);
});
```

## Integration with Frontend

### React Component Example

```tsx
import React, { useState } from 'react';
import type { Transcript } from '../types';

function TranscriptViewer({ transcript, audioUrl }: { transcript: Transcript, audioUrl: string }) {
  const [currentWordIdx, setCurrentWordIdx] = useState<number | null>(null);
  const audioRef = React.useRef<HTMLAudioElement>(null);

  const playWord = (idx: number) => {
    const word = transcript.words[idx];
    if (audioRef.current) {
      audioRef.current.currentTime = word.start;
      audioRef.current.play();
      setCurrentWordIdx(idx);

      setTimeout(() => {
        audioRef.current?.pause();
        setCurrentWordIdx(null);
      }, (word.end - word.start) * 1000);
    }
  };

  return (
    <div>
      <audio ref={audioRef} src={audioUrl} />
      <div className="transcript">
        {transcript.words.map((word, idx) => (
          <span
            key={idx}
            className={`word ${currentWordIdx === idx ? 'active' : ''}`}
            onClick={() => playWord(idx)}
            style={{ cursor: 'pointer', margin: '0 4px' }}
          >
            {word.word}
          </span>
        ))}
      </div>
    </div>
  );
}
```

## API Integration

### Storing Transcript in Database

```typescript
// Neo4j Cypher query to store transcript
async function storeTranscript(videoId: string, transcript: Transcript) {
  const session = getSession();

  await session.run(`
    MATCH (v:Video {id: $videoId})
    CREATE (v)-[:HAS_TRANSCRIPT]->(t:Transcript {
      id: randomUUID(),
      text: $text,
      language: $language,
      duration: $duration,
      wordCount: $wordCount,
      createdAt: datetime()
    })
    WITH t
    UNWIND $words AS word
    CREATE (t)-[:HAS_WORD]->(w:Word {
      text: word.word,
      start: word.start,
      end: word.end,
      order: word.order
    })
  `, {
    videoId,
    text: transcript.text,
    language: transcript.language,
    duration: transcript.duration,
    wordCount: transcript.words.length,
    words: transcript.words.map((w, idx) => ({ ...w, order: idx }))
  });

  await session.close();
}
```

---

**Last Updated**: 2025-12-31
**Examples**: Production-Ready ✅
