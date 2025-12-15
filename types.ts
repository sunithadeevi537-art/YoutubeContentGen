export enum ContentFormat {
  SCRIPT = 'SCRIPT',
  PPT = 'PPT',
  MARKDOWN = 'MARKDOWN'
}

export enum ContentLength {
  SHORT = 'Short (Concise Overview)',
  MEDIUM = 'Medium (Standard Detail)',
  LONG = 'Long (Deep Dive & Comprehensive)'
}

export enum ContentTone {
  PROFESSIONAL = 'Professional & Authoritative',
  CASUAL = 'Casual & Friendly',
  ENTHUSIASTIC = 'Enthusiastic & High Energy',
  WITTY = 'Witty & Humorous',
  STORYTELLING = 'Narrative & Storytelling'
}

export interface GenerationOptions {
  length: ContentLength;
  tone: ContentTone;
  targetAudience: string;
  additionalInstructions: string;
}

export interface VideoSource {
  title: string;
  uri: string;
}

export interface SearchResult {
  content: string;
  sources: VideoSource[];
}

export interface GroundingChunk {
  web?: {
    uri?: string;
    title?: string;
  };
}