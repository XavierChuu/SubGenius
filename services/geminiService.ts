
import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";
import { Language, SplitMode, SubtitleBlock, ModelType, MasterTranscript, SegmentData, WordData } from "../types";
import { msToTimeCode } from "../utils/timeUtils";

const getSystemInstruction = (targetLangsStr: string) => {
  return `
    Role: Professional Audio-to-Subtitle Alignment Expert.
    Task: Transcribe audio with high-precision timestamps and translate to [${targetLangsStr}].

    CRITICAL RULES FOR TIMESTAMPS:
    1. PRECISION: Provide timestamps in milliseconds (ms). Accuracy at the millisecond level is mandatory.
    2. WORD BOUNDARIES: Ensure each word's 'start_ms' and 'end_ms' capture the exact audible start and end. 
    3. TAIL-END ACCURACY: The 'end_ms' of the last word in any segment (especially the final segment of the file) MUST include the natural decay/reverb of the voice. DO NOT cut off early.
    4. SEGMENT ALIGNMENT: The 'start_ms' of a segment MUST be identical to the 'start_ms' of its first word. The 'end_ms' of a segment MUST be identical to the 'end_ms' of its last word.
    5. CONTINUITY: Words within a segment should have sequential timestamps. 
    6. NO GAPS: Ensure subtitles stay on screen until the next speaker starts or until the audio naturally concludes.

    OUTPUT GUIDELINES:
    - Output JSON ONLY.
    - Translations must reflect the meaning of the specific segment.

    JSON SCHEMA:
    {
      "segments": [
        {
          "speaker": "Speaker A",
          "start_ms": 1050,
          "end_ms": 4820,
          "text": "The exact transcription here.",
          "translations": { "Vietnamese": "Bản dịch chính xác.", "Japanese": "..." },
          "words": [
            { "text": "The", "start_ms": 1050, "end_ms": 1200, "is_eos": false },
            { "text": "exact", "start_ms": 1210, "end_ms": 1600, "is_eos": false }
          ]
        }
      ]
    }
  `;
};

const withRetry = async <T>(fn: () => Promise<T>, retries = 2): Promise<T> => {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn();
    } catch (error: any) {
      const errorStr = error.toString() || '';
      const isRetryable = errorStr.includes('429') || errorStr.includes('500') || errorStr.includes('503');
      if (isRetryable && i < retries) {
        const delay = Math.pow(2, i) * 2000 + Math.random() * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      throw error;
    }
  }
  throw new Error("Maximum retries reached");
};

const tryParseJSON = (jsonString: string): any => {
    // 1. Remove Markdown code blocks
    let cleaned = jsonString.replace(/```json\n?|```/g, '').trim();

    try {
        return JSON.parse(cleaned);
    } catch (e) {
        // 2. Try to repair truncated JSON
        // Common truncation cases:
        // - Ends inside a string: ... "text": "some val
        // - Ends inside an object: ... "end_ms": 123
        // - Ends inside an array: ... { ... }, { ...
        
        // Attempt 1: Close string if needed, then close stack
        const stack: string[] = [];
        let inString = false;
        let isEscaped = false;
        
        for (let i = 0; i < cleaned.length; i++) {
            const char = cleaned[i];
            if (isEscaped) {
                isEscaped = false;
                continue;
            }
            if (char === '\\') {
                isEscaped = true;
                continue;
            }
            if (char === '"') {
                inString = !inString;
                continue;
            }
            if (!inString) {
                if (char === '{') stack.push('}');
                else if (char === '[') stack.push(']');
                else if (char === '}' || char === ']') {
                    if (stack.length > 0 && stack[stack.length - 1] === char) {
                        stack.pop();
                    }
                }
            }
        }

        let repaired = cleaned;
        if (inString) repaired += '"';
        while (stack.length > 0) {
            repaired += stack.pop();
        }

        try {
            return JSON.parse(repaired);
        } catch (e2) {
            // Attempt 2: If sophisticated repair fails, try simple suffixing
            const closers = ['}', ']', ']}', '"}', '"]', '"]}'];
            for (const closer of closers) {
                try {
                    return JSON.parse(cleaned + closer);
                } catch (e3) { /* continue */ }
            }
            
            // Attempt 3: Aggressive truncation to last valid object
            if (cleaned.includes('"segments":')) {
                 const lastObjectEnd = cleaned.lastIndexOf('}');
                 if (lastObjectEnd > -1) {
                     const truncated = cleaned.substring(0, lastObjectEnd + 1);
                     // Check if we need to close the array and root object
                     try {
                         return JSON.parse(truncated + ']}');
                     } catch (e4) {
                         try {
                             return JSON.parse(truncated + ']');
                         } catch (e5) {
                             try {
                                 return JSON.parse(truncated + '}');
                             } catch (e6) {}
                         }
                     }
                 }
            }
            
            console.warn("JSON Parse Failed. Returning empty segment list.", e);
            // Return empty structure to prevent crash
            return { segments: [] };
        }
    }
};

const localizeSpeakerName = (speaker: string, ui: any): string => {
    if (!speaker || !ui?.speaker) return speaker;
    return speaker.replace(/Speaker/gi, ui.speaker);
};

export const generateSubtitles = async (
  audioBase64: string,
  mimeType: string,
  targetLanguages: Language[],
  modelType: ModelType = ModelType.GEMINI,
  ui?: any
): Promise<MasterTranscript> => {
  
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const targetLangsStr = targetLanguages.join(', ');
  const systemInstruction = getSystemInstruction(targetLangsStr);

  try {
    const response: GenerateContentResponse = await withRetry(() => ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: {
        parts: [
          { inlineData: { mimeType: mimeType, data: audioBase64 } },
          { text: `Transcribe with millisecond timestamps and translate to ${targetLangsStr}. Return JSON.` }
        ]
      },
      config: {
        systemInstruction: systemInstruction,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            segments: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        speaker: { type: Type.STRING },
                        start_ms: { type: Type.INTEGER },
                        end_ms: { type: Type.INTEGER },
                        text: { type: Type.STRING },
                        translations: {
                            type: Type.OBJECT,
                            properties: targetLanguages.reduce((acc, lang) => ({...acc, [lang]: {type: Type.STRING}}), {})
                        },
                        words: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    text: { type: Type.STRING },
                                    start_ms: { type: Type.INTEGER },
                                    end_ms: { type: Type.INTEGER },
                                    is_eos: { type: Type.BOOLEAN }
                                },
                                required: ["text", "start_ms", "end_ms", "is_eos"]
                            }
                        }
                    },
                    required: ["speaker", "start_ms", "end_ms", "text", "words", "translations"]
                }
            }
          }
        }
      }
    }));

    const jsonText = response.text;
    if (!jsonText) throw new Error("No response from AI engine.");

    const transcript = tryParseJSON(jsonText) as MasterTranscript;
    
    if (ui) {
        transcript.segments = transcript.segments.map(seg => ({
            ...seg,
            speaker: localizeSpeakerName(seg.speaker, ui)
        }));
    }

    return transcript;

  } catch (error: any) {
    console.error("AI API Error:", error);
    let errorMsg = `Generation failed.`;
    const errorStr = error.toString();
    if (errorStr.includes("401") || errorStr.includes("403")) errorMsg = "AUTH_ERROR";
    else if (errorStr.includes("429")) errorMsg = "QUOTA_EXHAUSTED";
    else errorMsg += " " + (error.message || "Unknown error");
    throw new Error(errorMsg);
  }
};

/**
 * Processes multiple audio chunks and merges the results.
 */
export const generateSubtitlesFromChunks = async (
  chunks: { blob: Blob; startOffsetMs: number }[],
  targetLanguages: Language[],
  modelType: ModelType = ModelType.GEMINI,
  ui?: any,
  onProgress?: (msg: string) => void,
  onCheckCancelled?: () => boolean
): Promise<MasterTranscript> => {
  const allSegments: SegmentData[] = [];
  const overlapMs = 5000; // Assuming 5s overlap as defined in audioUtils

  // Process chunks in series or small batches to avoid rate limits
  for (let i = 0; i < chunks.length; i++) {
    if (onCheckCancelled && onCheckCancelled()) {
      throw new Error("CANCELLED");
    }
    const chunk = chunks[i];
    if (onProgress) onProgress(`${ui?.processingChunk || 'Processing chunk'} ${i + 1} / ${chunks.length}...`);
    
    const base64 = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
      reader.readAsDataURL(chunk.blob);
    });

    const transcript = await generateSubtitles(base64, chunk.blob.type, targetLanguages, modelType, ui);
    
    // Adjust timestamps and filter based on overlap boundaries
    const nextChunkStart = chunks[i + 1]?.startOffsetMs;
    const currentChunkStart = chunk.startOffsetMs;
    
    const lowerBound = i === 0 ? -1 : currentChunkStart + (overlapMs / 2);
    const upperBound = nextChunkStart ? nextChunkStart + (overlapMs / 2) : Infinity;

    transcript.segments.forEach(seg => {
      const adjustedSeg = {
        ...seg,
        start_ms: seg.start_ms + currentChunkStart,
        end_ms: seg.end_ms + currentChunkStart,
        words: seg.words.map(w => ({
          ...w,
          start_ms: w.start_ms + currentChunkStart,
          end_ms: w.end_ms + currentChunkStart
        }))
      };

      // Only keep segments that "start" in this chunk's designated area
      if (adjustedSeg.start_ms >= lowerBound && adjustedSeg.start_ms < upperBound) {
        allSegments.push(adjustedSeg);
      }
    });
  }

  // Sort by start time just in case
  allSegments.sort((a, b) => a.start_ms - b.start_ms);

  return { segments: allSegments };
};

export const processTranscriptToBlocks = (
    transcript: MasterTranscript, 
    splitMode: SplitMode
): SubtitleBlock[] => {
    const blocks: SubtitleBlock[] = [];
    let currentId = 1;

    const createBlock = (words: WordData[], translations: { [key in Language]?: string }, speaker: string, isLastOfAll: boolean = false) => {
        if (words.length === 0) return;
        const startMs = words[0].start_ms;
        let endMs = words[words.length - 1].end_ms;
        if (isLastOfAll) endMs += 400;

        blocks.push({
            id: currentId++,
            speaker: speaker,
            start: msToTimeCode(startMs),
            end: msToTimeCode(endMs),
            originalText: words.map(w => w.text).join(' '),
            translations: translations || {},
            words: words // Pass word level data
        });
    };

    if (splitMode === SplitMode.SENTENCE) {
        transcript.segments.forEach((seg, idx) => {
             const isLastSeg = idx === transcript.segments.length - 1;
             let endMs = seg.end_ms;
             if (isLastSeg) endMs += 400;
             blocks.push({
                 id: currentId++,
                 speaker: seg.speaker,
                 start: msToTimeCode(seg.start_ms),
                 end: msToTimeCode(endMs),
                 originalText: seg.text,
                 translations: seg.translations || {},
                 words: seg.words
             });
        });
        return blocks;
    }

    transcript.segments.forEach((seg, segIdx) => {
        let currentChunk: WordData[] = [];
        const totalWordsInSegment = seg.words.length;
        const isLastSeg = segIdx === transcript.segments.length - 1;

        const flushChunk = (isLastChunkInSeg: boolean) => {
             if (currentChunk.length > 0) {
                 const chunkStartIndex = seg.words.indexOf(currentChunk[0]);
                 const chunkWordCount = currentChunk.length;
                 const splitTranslations: { [key in Language]?: string } = {};
                 Object.entries(seg.translations || {}).forEach(([lang, fullText]) => {
                     if (!fullText) return;
                     const transWords = fullText.split(' ');
                     const start = Math.floor((chunkStartIndex / totalWordsInSegment) * transWords.length);
                     const end = Math.floor(((chunkStartIndex + chunkWordCount) / totalWordsInSegment) * transWords.length);
                     splitTranslations[lang as Language] = transWords.slice(start, Math.max(end, start + 1)).join(' ');
                 });
                 const isLastOfAll = isLastSeg && isLastChunkInSeg;
                 createBlock(currentChunk, splitTranslations, seg.speaker, isLastOfAll);
                 currentChunk = [];
             }
        };

        seg.words.forEach((word, index) => {
            currentChunk.push(word);
            let shouldSplit = false;
            const isLastWordInSeg = index === seg.words.length - 1;
            if (splitMode === SplitMode.SINGLE_WORD) shouldSplit = true;
            else if (splitMode === SplitMode.THREE_WORDS && currentChunk.length >= 3) shouldSplit = true;
            else if (splitMode === SplitMode.SHORT_PHRASE) {
                if (word.is_eos || currentChunk.length >= 6) shouldSplit = true;
                const nextWord = seg.words[index + 1];
                if (nextWord && (nextWord.start_ms - word.end_ms > 400)) shouldSplit = true;
            }
            if (shouldSplit || isLastWordInSeg) flushChunk(isLastWordInSeg);
        });
    });
    return blocks;
};

export const reTranslateSubtitles = async (
  blocks: SubtitleBlock[],
  targetLanguage: Language,
  modelType: ModelType = ModelType.GEMINI
): Promise<SubtitleBlock[]> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const textPayload = blocks.map(b => ({ id: b.id, text: b.originalText }));
  const prompt = `Translate to ${targetLanguage}: ${JSON.stringify(textPayload)}`;
  try {
    const response: GenerateContentResponse = await withRetry(() => ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: { parts: [{ text: prompt }] },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: { id: { type: Type.INTEGER }, translation: { type: Type.STRING } },
            required: ["id", "translation"],
          }
        }
      }
    }));
    const parsed = tryParseJSON(response.text || "[]");
    const updatedBlocks = [...blocks];
    parsed.forEach((item: any) => {
      const block = updatedBlocks.find(b => b.id === item.id);
      if (block) {
        if (!block.translations) block.translations = {};
        block.translations[targetLanguage] = item.translation;
      }
    });
    return updatedBlocks;
  } catch (error: any) {
    console.error("Re-translation error", error);
    throw error;
  }
};
