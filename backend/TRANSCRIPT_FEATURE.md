# Word-Level Timestamp Feature

## Overview

The Video Assembler now generates word-level timestamps for all voiceovers using ElevenLabs' advanced TTS API.

## Features

- **Word-Level Precision**: Every word has exact start and end timestamps
- **Multi-Language Support**: Works with Chinese (zh), English (en), and French (fr)
- **Full Transcript**: Complete text with timing data for each word
- **ElevenLabs Integration**: Uses `with-timestamps` endpoint for accurate alignment

## API Response Structure

```typescript
{
  videoUrl: string,
  audioUrl: string,
  subtitlesUrl?: string,
  transcript: {
    text: string,                    // Full narration text
    words: [                          // Array of word timestamps
      {
        word: string,                 // Individual word
        start: number,                // Start time in seconds
        end: number                   // End time in seconds
      },
      ...
    ],
    language: "en" | "zh" | "fr",    // Language code
    duration: number                  // Total audio duration
  },
  duration: number,
  fileSize: number,
  cost: number,
  format: "mp4",
  resolution: "1080x1920"
}
```

## Example Transcript Output

```json
{
  "transcript": {
    "text": "Once upon a time, in a faraway land, there lived a brave knight.",
    "words": [
      { "word": "Once", "start": 0.000, "end": 0.234 },
      { "word": "upon", "start": 0.234, "end": 0.456 },
      { "word": "a", "start": 0.456, "end": 0.512 },
      { "word": "time,", "start": 0.512, "end": 0.789 },
      { "word": "in", "start": 0.789, "end": 0.890 },
      { "word": "a", "start": 0.890, "end": 0.945 },
      { "word": "faraway", "start": 0.945, "end": 1.345 },
      { "word": "land,", "start": 1.345, "end": 1.678 }
    ],
    "language": "en",
    "duration": 5.2
  }
}
```

## Use Cases

1. **Karaoke-Style Captions**: Highlight words as they're spoken
2. **Interactive Learning**: Click on words to hear pronunciation
3. **Accessibility**: Precise synchronization for hearing-impaired users
4. **Video Editing**: Fine-grained control over audio-visual alignment
5. **Analytics**: Track which words viewers replay most

## Implementation Details

### ElevenLabs API Endpoint

```typescript
POST https://api.elevenlabs.io/v1/text-to-speech/{voice_id}/with-timestamps
```

### Voice IDs by Language

- **Chinese (zh)**: `pNInz6obpgDQGcFmaJgB` (Adam voice)
- **English (en)**: `21m00Tcm4TlvDq8ikWAM` (Rachel voice)
- **French (fr)**: `ThT5KcBeYPX3keUQqHPh` (Dorothy voice)

### Timestamp Parsing

ElevenLabs returns character-level timestamps. The system:
1. Receives character arrays with individual timings
2. Reconstructs words by detecting spaces
3. Assigns start time from first character
4. Assigns end time from last character of each word

### Fallback Behavior

If ElevenLabs API is unavailable:
- Silent audio is generated with FFmpeg
- Placeholder timestamps estimated at 0.5s per word
- Word boundaries determined by whitespace splitting

## Cost

- **TTS Generation**: ~$0.15 per 1000 characters (ElevenLabs pricing)
- **Word Timestamps**: Included at no extra cost
- **Example**: 30-second video (~75 words, ~300 chars) = $0.045

## Testing

Run the test suite:

```bash
cd backend
deno test --allow-net --allow-read --allow-write --allow-env --env-file=.env test_videoAssembler.ts
```

## Future Enhancements

- [ ] Phoneme-level timestamps (for pronunciation training)
- [ ] Sentence boundary detection
- [ ] Confidence scores per word
- [ ] Alternative pronunciation suggestions
- [ ] Real-time streaming with live timestamps

---

**Last Updated**: 2025-12-31
**Version**: 1.0.0
**Status**: Production Ready ✅
