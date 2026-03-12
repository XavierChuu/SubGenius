
export type Language = string;

export enum SplitMode {
  SENTENCE = 'Complete Sentence',
  SINGLE_WORD = '1 Word Per Line',
  THREE_WORDS = '3 Words Per Line',
  SHORT_PHRASE = 'Short Phrase (Max 6 Words)'
}

export enum ModelType {
  GEMINI = 'Gemini',
  WHISPER_LOCAL = 'Whisper (Offline)'
}

export interface WordData {
  text: string;
  start_ms: number;
  end_ms: number;
  is_eos: boolean;
}

export interface SegmentData {
  speaker: string;
  start_ms: number;
  end_ms: number;
  text: string;
  words: WordData[];
  translations: { [key in Language]?: string };
}

export interface MasterTranscript {
  segments: SegmentData[];
}

export interface SubtitleStyle {
  fontSize: number;
  fontFamily: string;
  textColor: string;
  backgroundColor: string;
  showBackground: boolean;
  backgroundOpacity: number;
  borderRadius: number;
  padding: number;
  
  // Text Styling
  fontWeight: 'normal' | 'bold';
  fontStyle: 'normal' | 'italic';
  textDecoration: 'none' | 'underline';

  // Highlight Logic
  highlightWords: boolean;
  highlightColor: string;
  
  // Highlight Specific Styling
  highlightBold: boolean;
  highlightItalic: boolean;
  highlightUnderline: boolean;

  textAlign: 'left' | 'center' | 'right';
  verticalPosition: number; // 0 (top) to 100 (bottom)
  horizontalPosition: number; // 0 (left) to 100 (right)
  maxWidth: number; // New property: 0 to 100 (%)

  // Glow/Shadow Styling
  showGlow: boolean;
  glowColor: string;
  glowOpacity: number;
  glowBlur: number;

  // Secondary Subtitle (Bilingual)
  showSecondarySubtitle: boolean;
}

export interface SubtitleBlock {
  id: number;
  speaker?: string;
  start: string; 
  end: string;   
  originalText: string;
  translations: { [key in Language]?: string };
  words?: WordData[]; 
}

export interface SubtitleCue {
  id: number;
  start: string;
  end: string;
  text: string;
}

export interface GenerationConfig {
  targetLanguages: Language[];
  splitMode: SplitMode;
  modelType: ModelType;
  isOffline: boolean;
  style?: SubtitleStyle;
}

export interface SavedProject {
  id: string;
  name: string;
  date: string;
  config: GenerationConfig;
  subtitles: SubtitleBlock[];
  masterTranscript?: MasterTranscript;
  fileData?: string;
  fileType?: string;
  fileName?: string;
}

export type ProcessingStatus = 'idle' | 'recording' | 'processing' | 'translating' | 'completed' | 'error' | 'loading_model';

export interface MobileEditState {
  blockId: number;
  lang: string;
  value: string;
}
