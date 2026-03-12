
/**
 * Utility for processing audio: extracting from video, resampling, and chunking.
 */

export interface AudioChunk {
  blob: Blob;
  startOffsetMs: number;
  durationMs: number;
}

/**
 * Encodes an AudioBuffer to a mono WAV blob.
 */
export const audioBufferToWav = (buffer: AudioBuffer): Blob => {
  const numChannels = 1; // Force mono for efficiency
  const sampleRate = buffer.sampleRate;
  const format = 1; // PCM
  const bitDepth = 16;

  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;

  const data = buffer.getChannelData(0);
  const bufferLength = data.length * bytesPerSample;
  const headerLength = 44;
  const wavBuffer = new ArrayBuffer(headerLength + bufferLength);
  const view = new DataView(wavBuffer);

  /* RIFF identifier */
  writeString(view, 0, 'RIFF');
  /* RIFF chunk length */
  view.setUint32(4, 36 + bufferLength, true);
  /* RIFF type */
  writeString(view, 8, 'WAVE');
  /* format chunk identifier */
  writeString(view, 12, 'fmt ');
  /* format chunk length */
  view.setUint32(16, 16, true);
  /* sample format (raw) */
  view.setUint16(20, format, true);
  /* channel count */
  view.setUint16(22, numChannels, true);
  /* sample rate */
  view.setUint32(24, sampleRate, true);
  /* byte rate (sample rate * block align) */
  view.setUint32(28, sampleRate * blockAlign, true);
  /* block align (channel count * bytes per sample) */
  view.setUint16(32, blockAlign, true);
  /* bits per sample */
  view.setUint16(34, bitDepth, true);
  /* data chunk identifier */
  writeString(view, 36, 'data');
  /* data chunk length */
  view.setUint32(40, bufferLength, true);

  // Write PCM samples
  let offset = 44;
  for (let i = 0; i < data.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, data[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
  }

  return new Blob([wavBuffer], { type: 'audio/wav' });
};

const writeString = (view: DataView, offset: number, string: string) => {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
};

/**
 * Extracts and chunks audio from a file.
 * @param file The input file (audio or video)
 * @param chunkDurationSeconds Duration of each chunk in seconds
 * @param overlapSeconds Overlap between chunks in seconds
 */
export const extractAndChunkAudio = async (
  file: File | Blob,
  chunkDurationSeconds: number = 30,
  overlapSeconds: number = 5
): Promise<AudioChunk[]> => {
  const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
  const arrayBuffer = await file.arrayBuffer();
  const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
  
  const chunks: AudioChunk[] = [];
  const totalDuration = audioBuffer.duration;
  const sampleRate = audioBuffer.sampleRate;
  
  let start = 0;
  while (start < totalDuration) {
    let end = start + chunkDurationSeconds;
    if (end > totalDuration) end = totalDuration;
    
    const startSample = Math.floor(start * sampleRate);
    const endSample = Math.floor(end * sampleRate);
    const chunkLength = endSample - startSample;
    
    if (chunkLength <= 0) break;
    
    const chunkBuffer = audioCtx.createBuffer(
      1, // Mono
      chunkLength,
      sampleRate
    );
    
    // Copy data from original buffer (using channel 0)
    const channelData = audioBuffer.getChannelData(0);
    const chunkData = chunkBuffer.getChannelData(0);
    for (let i = 0; i < chunkLength; i++) {
      chunkData[i] = channelData[startSample + i];
    }
    
    const wavBlob = audioBufferToWav(chunkBuffer);
    chunks.push({
      blob: wavBlob,
      startOffsetMs: Math.round(start * 1000),
      durationMs: Math.round((end - start) * 1000)
    });
    
    if (end >= totalDuration) break;
    start += (chunkDurationSeconds - overlapSeconds);
  }
  
  await audioCtx.close();
  return chunks;
};

/**
 * Converts a time string (HH:MM:SS,mmm or HH:MM:SS.mmm) to seconds.
 */
export const timeToSeconds = (timeStr: string): number => {
  if (!timeStr) return 0;
  const parts = timeStr.split(':');
  if (parts.length < 3) return 0;
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  const sParts = parts[2].split(/[,.]/);
  const s = parseInt(sParts[0], 10);
  const msStr = sParts[1] || '0';
  const ms = parseInt(msStr.padEnd(3, '0').slice(0, 3), 10);
  return h * 3600 + m * 60 + s + ms / 1000;
};

/**
 * Converts seconds to a time string (HH:MM:SS,mmm).
 */
export const secondsToTime = (seconds: number): string => {
  if (isNaN(seconds) || seconds < 0) return '00:00:00,000';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.round((seconds % 1) * 1000);
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')},${ms.toString().padStart(3, '0')}`;
};
