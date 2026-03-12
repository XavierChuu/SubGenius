
import { pipeline, env } from '@xenova/transformers';
import { MasterTranscript, SegmentData, WordData, Language, SubtitleBlock } from '../types';

// Tối ưu hóa môi trường transformers.js
env.allowLocalModels = false;
env.useBrowserCache = true;

// Singleton instances để ghi nhớ mô hình, tránh nạp lại
let transcriberInstance: any = null;
let translatorInstance: any = null;

const LANGUAGE_TO_M2M100: Record<string, string> = {
    'English': 'en',
    'Vietnamese': 'vi',
    'Japanese': 'ja',
    'German': 'de',
    'French': 'fr',
    'Chinese (Simplified)': 'zh',
    'Korean': 'ko',
};

/**
 * Resample audio sang 16000Hz (Yêu cầu của Whisper)
 */
async function resampleAudio(audioBuffer: AudioBuffer): Promise<Float32Array> {
    const targetSampleRate = 16000;
    const offlineCtx = new OfflineAudioContext(
        audioBuffer.numberOfChannels,
        audioBuffer.duration * targetSampleRate,
        targetSampleRate
    );

    const source = offlineCtx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(offlineCtx.destination);
    source.start();

    const renderedBuffer = await offlineCtx.startRendering();
    return renderedBuffer.getChannelData(0);
}

export const loadWhisperModel = async (onProgress?: (msg: string) => void, ui?: any) => {
    if (transcriberInstance) return transcriberInstance;
    
    if (onProgress) onProgress(ui?.initSpeechModel || "Initializing Whisper (Speech AI)...");
    
    try {
        transcriberInstance = await pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny', {
            progress_callback: (data: any) => {
                if (data.status === 'progress' && onProgress) {
                    onProgress(`${ui?.initSpeechModel || "Speech Model"}: ${Math.round(data.progress * 100)}%`);
                }
            }
        });
        return transcriberInstance;
    } catch (err) {
        console.error("Whisper Load Error:", err);
        throw new Error("Could not load local Speech AI model.");
    }
};

export const loadTranslationModel = async (onProgress?: (msg: string) => void, ui?: any) => {
    if (translatorInstance) return translatorInstance;
    
    if (onProgress) onProgress(ui?.initTranslatorModel || "Initializing Translator AI...");
    
    try {
        translatorInstance = await pipeline('translation', 'Xenova/m2m100_418M', {
            progress_callback: (data: any) => {
                if (data.status === 'progress' && onProgress) {
                    onProgress(`${ui?.initTranslatorModel || "Translation Model"}: ${Math.round(data.progress * 100)}%`);
                }
            }
        });
        return translatorInstance;
    } catch (err) {
        console.error("Translation Load Error:", err);
        throw new Error("Could not load local Translation AI model.");
    }
};

export const generateSubtitlesOffline = async (
    audioBlob: Blob,
    onProgress?: (msg: string) => void,
    ui?: any
): Promise<MasterTranscript> => {
    const model = await loadWhisperModel(onProgress, ui);
    
    if (onProgress) onProgress(ui?.decoding || "Decoding audio data...");
    
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const arrayBuffer = await audioBlob.arrayBuffer();
    
    if (arrayBuffer.byteLength === 0) throw new Error("Audio file is empty.");

    let audioBuffer: AudioBuffer;
    try {
        audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    } catch (err) {
        throw new Error("Failed to decode audio data.");
    } finally {
        audioContext.close().catch(() => {});
    }
    
    if (onProgress) onProgress(ui?.resampling || "Resampling to 16kHz...");
    const audioData = await resampleAudio(audioBuffer);

    if (onProgress) onProgress(ui?.transcribing || "Transcribing with Whisper...");

    try {
        const result = await model(audioData, {
            chunk_length_s: 30,
            stride_length_s: 5,
            return_timestamps: 'word',
            force_full_sequences: false
        });

        const segments: SegmentData[] = [];
        
        if (result && result.chunks && result.chunks.length > 0) {
            let currentWords: WordData[] = [];
            let currentSegmentText = "";
            let segStart = (result.chunks[0].timestamp?.[0] || 0) * 1000;
            
            result.chunks.forEach((chunk: any, idx: number) => {
                const startTs = chunk.timestamp?.[0] ?? (idx > 0 ? result.chunks[idx-1].timestamp[1] : 0);
                const endTs = chunk.timestamp?.[1] ?? (startTs + 0.5);

                const startMs = Math.round(startTs * 1000);
                const endMs = Math.round(endTs * 1000);
                
                const text = chunk.text.trim();
                const isLast = idx === result.chunks.length - 1;
                const hasEOS = /[.!?]$/.test(text);

                if (text) {
                    currentWords.push({
                        text: text,
                        start_ms: startMs,
                        end_ms: endMs,
                        is_eos: hasEOS
                    });
                    currentSegmentText += (currentSegmentText ? " " : "") + text;
                }

                if (currentWords.length > 0 && (hasEOS || currentWords.length >= 12 || isLast)) {
                    segments.push({
                        speaker: ui?.speaker || "Speaker",
                        start_ms: segStart,
                        end_ms: endMs,
                        text: currentSegmentText,
                        words: [...currentWords],
                        translations: {}
                    });
                    currentWords = [];
                    currentSegmentText = "";
                    if (!isLast) {
                        segStart = Math.round((result.chunks[idx + 1]?.timestamp?.[0] ?? endTs) * 1000);
                    }
                }
            });
        }

        return { segments };
    } catch (err: any) {
        console.error("Local ASR Error:", err);
        throw new Error("Transcription failed: " + (err.message || "Unknown error"));
    }
};

/**
 * Dịch thuật offline hàng loạt (Batch Processing) để tránh treo UI.
 */
export const translateSubtitlesOffline = async (
    blocks: SubtitleBlock[],
    targetLanguage: Language,
    onProgress?: (msg: string) => void,
    ui?: any
): Promise<SubtitleBlock[]> => {
    // Luôn lấy instance từ cache
    const translate = await loadTranslationModel(onProgress, ui);
    const targetCode = LANGUAGE_TO_M2M100[targetLanguage];
    
    if (!targetCode) throw new Error(`Offline translation to ${targetLanguage} not supported.`);

    const updatedBlocks = [...blocks];
    const textsToTranslate = blocks.map(b => b.originalText);
    const batchSize = 5; // Dịch 5 câu cùng lúc để tối ưu CPU và không treo UI
    
    if (onProgress) onProgress(`${ui?.translating || "Translating"} to ${targetLanguage}...`);

    for (let i = 0; i < textsToTranslate.length; i += batchSize) {
        const batch = textsToTranslate.slice(i, i + batchSize);
        if (onProgress) onProgress(`${ui?.translating || "Translating"} ${i + 1}/${textsToTranslate.length}...`);
        
        try {
            // M2M100 hỗ trợ truyền mảng các chuỗi để dịch nhanh hơn
            const results = await translate(batch, {
                tgt_lang: targetCode,
                src_lang: 'en', 
            });

            // Gán kết quả vào blocks tương ứng
            batch.forEach((_, idx) => {
                const blockIdx = i + idx;
                const translationResult = results[idx]?.translation_text;
                if (translationResult) {
                    if (!updatedBlocks[blockIdx].translations) updatedBlocks[blockIdx].translations = {};
                    updatedBlocks[blockIdx].translations[targetLanguage] = translationResult;
                }
            });

            // Giải phóng event loop một chút để trình duyệt render UI
            await new Promise(resolve => setTimeout(resolve, 10));
        } catch (err) {
            console.warn(`Translation batch ${i} failed`, err);
        }
    }

    return updatedBlocks;
};
