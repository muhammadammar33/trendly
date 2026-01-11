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
  transition?: 'fade' | 'slide' | 'zoom';
  isEndScreen?: boolean; // Flag for end screen slide
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
 * Voice & script configuration
 */
export interface Voice {
  enabled: boolean;
  script: string;
  voice: 'male' | 'female';
  speed: number; // 0.5-2.0
  volume: number; // 0-100
  audioPath?: string; // Generated audio file path
  subtitlePath?: string; // Generated subtitle file path (SRT)
}

/**
 * End screen configuration
 */
export interface EndScreen {
  enabled: boolean;
  type: 'image' | 'text';
  content: string; // image URL or text content
  logoUrl: string | null; // website logo to display
  duration: number; // seconds
  backgroundColor: string;
  textColor: string;
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
    voice: 'female' as const,
    speed: 1.0,
    volume: 80,
  },
  endScreen: {
    enabled: false,
    type: 'text' as const,
    content: 'Thank You!',
    logoUrl: null,
    duration: 3,
    backgroundColor: '#000000',
    textColor: '#FFFFFF',
  },
};
