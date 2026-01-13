/**
 * Studio Type Definitions
 * 
 * Complete data models for the Studio slideshow video editor
 */

import { ScrapeResult } from '@/lib/types';

/**
 * Individual slide in the timeline
 */
export interface Slide {
  id: string;
  imageUrl: string;
  startTime: number; // seconds
  endTime: number; // seconds
  transition?: 'fade' | 'slideup' | 'slidedown' | 'slideleft' | 'slideright' | 'zoomin' | 'zoomout' | 'wipeleft' | 'wiperight' | 'circlecrop';
  isEndScreen?: boolean; // Flag for end screen slide
  
  // Motion graphics (Ken Burns effect)
  motion?: {
    type: 'zoom-in' | 'zoom-out' | 'pan-left' | 'pan-right' | 'pan-up' | 'pan-down' | 'none';
    intensity: number; // 1-10 scale
  };
  
  // Crop settings
  crop?: {
    x: number; // Crop offset X (0-1)
    y: number; // Crop offset Y (0-1)
    width: number; // Crop width (0-1)
    height: number; // Crop height (0-1)
  };
}

/**
 * Bottom banner overlay configuration
 */
export interface BottomBanner {
  enabled: boolean;
  text: string;
  logoUrl: string | null; // website logo to display
  backgroundColor: string;
  textColor: string;
  fontSize: number;
  position: 'bottom' | 'top';
  startTime: number; // when banner appears
  endTime: number; // when banner disappears
}

/**
 * QR code overlay configuration
 */
export interface QRCode {
  enabled: boolean;
  url: string;
  position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  size: number; // pixels
  startTime: number;
  endTime: number;
}

/**
 * Music configuration
 */
export interface Music {
  enabled: boolean;
  fileName: string | null; // uploaded file name
  filePath: string | null; // server path
  volume: number; // 0-100
  loop: boolean;
  fadeIn: boolean;
  fadeOut: boolean;
}

/**
 * Gradium AI Voice IDs (from official documentation)
 */
export type GradiumVoiceId = 
  | 'YTpq7expH9539ERJ' // Emma - Feminine, American, 20s
  | 'wM3MrSfgxUe6Scov' // Kent - Masculine, American, 30s
  | 'G9a9YCW06V4xKFVj' // Eva - Feminine, British, 30s
  | 'F0XT9eBTB9LVW2HA' // Jack - Masculine, British, 30s
  | 'FI9VrJJAQvHXbdwm' // Elise - Feminine, American, 30s
  | 'rEy5xpRh7RZG6hog' // Leo - Masculine, American, 30s
  | 'eOZ8p0LcXs2MpP0C' // Mia - Feminine, American, 20s
  | 'BnMbHvl4kMt9t4w1' // Maximilian - Masculine, British, 50s
  | '6DKmx4PXv2wV4Jc0' // Valentina - Feminine, Spanish, 30s
  | 'mXNOwOXCZd5MPZ9g' // Sergio - Masculine, Spanish, 40s
  | 'BLOPXk99k4gvxzSW' // Alice - Feminine, British, 30s
  | 'LMQPGhgMgqAYRuXq'; // Davi - Masculine, Brazilian Portuguese, 30s

/**
 * Voice & script configuration
 */
export interface Voice {
  enabled: boolean;
  script: string;
  provider?: 'gradium' | 'auto'; // TTS provider (Gradium AI only)
  voice: string; // Voice ID or voice name
  voiceModel?: GradiumVoiceId | 'en-US-female' | 'en-US-male' | 'en-GB-female' | 'en-GB-male'; // Gradium voice model
  speed: number; // 0.5-2.0
  pitch?: number; // 0.5-2.0 (pitch adjustment)
  volume: number; // 0-100
  language?: string; // Language code (e.g., 'en-US', 'es-ES')
  audioPath?: string | null; // Pre-generated audio file path (auto-generated during project creation)
  generatedWith?: 'gradium' | 'piper'; // Track which service was actually used
  subtitlePath?: string; // Generated subtitle file path (SRT)
}

/**
 * End screen configuration
 */
export interface EndScreen {
  enabled: boolean;
  type: 'image' | 'text';
  content: string; // image URL or text content (legacy)
  logoUrl: string | null; // website logo to display
  duration: number; // seconds
  backgroundColor: string;
  textColor: string;
  // New fields for phone number banner design
  companyName: string; // Company name (e.g., "SAPPHIRE")
  phoneNumber: string; // Phone number to display
  websiteLink: string; // Website URL (e.g., "pk.sapphireonline.pk")
  phoneNumberColor: string; // Color for phone number text
}

/**
 * Complete project state
 */
export interface Project {
  projectId: string;
  
  // Source data
  business: ScrapeResult['business'];
  brand: ScrapeResult['brand'];
  sourceImages: ScrapeResult['images']; // all scraped images
  
  // Timeline
  slides: Slide[];
  
  // Overlays & effects
  bottomBanner: BottomBanner;
  qrCode: QRCode;
  music: Music;
  voice: Voice;
  endScreen: EndScreen;
  
  // Metadata
  status: 'draft' | 'rendering-preview' | 'preview-ready' | 'rendering-final' | 'final-ready' | 'error';
  previewVideoUrl: string | null;
  finalVideoUrl: string | null;
  lastPreviewConfigHash?: string | null; // Hash of config used for last preview
  lastPreviewRenderedAt?: Date | null; // When last preview was rendered
  
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Request to create a new project
 */
export interface CreateProjectRequest {
  scraperResult: ScrapeResult;
  maxSlides?: number; // default: 10
  defaultSlideDuration?: number; // default: 3 seconds
}

/**
 * Response after creating a project
 */
export interface CreateProjectResponse {
  projectId: string;
  status: string;
}

/**
 * Request to update project settings
 */
export interface UpdateProjectRequest {
  slides?: Slide[];
  bottomBanner?: Partial<BottomBanner>;
  qrCode?: Partial<QRCode>;
  music?: Partial<Music>;
  voice?: Partial<Voice>;
  endScreen?: Partial<EndScreen>;
}

/**
 * Render job tracking
 */
export interface RenderJob {
  jobId: string;
  projectId: string;
  type: 'preview' | 'final';
  status: 'queued' | 'preparing' | 'downloading' | 'rendering' | 'done' | 'error';
  progress: number; // 0-100
  stage: string;
  videoUrl: string | null;
  error: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Render request
 */
export interface RenderRequest {
  projectId: string;
}

/**
 * Render response
 */
export interface RenderResponse {
  jobId: string;
  status: string;
}

/**
 * Default project configuration
 */
export const DEFAULT_PROJECT_CONFIG = {
  bottomBanner: {
    enabled: false,
    text: '',
    logoUrl: null,
    backgroundColor: '#000000',
    textColor: '#FFFFFF',
    fontSize: 32,
    position: 'bottom' as const,
    startTime: 0,
    endTime: 0,
  },
  qrCode: {
    enabled: false,
    url: '',
    position: 'top-right' as const,
    size: 150,
    startTime: 0,
    endTime: 0,
  },
  music: {
    enabled: false,
    fileName: null,
    filePath: null,
    volume: 70,
    loop: true,
    fadeIn: true,
    fadeOut: true,
  },
  voice: {
    enabled: false,
    script: '',
    provider: 'auto' as const,
    voice: 'female',
    speed: 1.0,
    pitch: 1.0,
    volume: 80,
    language: 'en-US',
    audioPath: null,
  },
  endScreen: {
    enabled: false,
    type: 'text' as const,
    content: 'Thank You!',
    logoUrl: null,
    duration: 3,
    backgroundColor: '#FFFFFF',
    textColor: '#000000',
    companyName: '',
    phoneNumber: '',
    websiteLink: '',
    phoneNumberColor: '#F59E0B', // Orange color
  },
};
