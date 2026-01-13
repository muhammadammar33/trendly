/**
 * In-Memory Project Store
 * 
 * CRUD operations for Studio projects
 */

import { Project, CreateProjectRequest, DEFAULT_PROJECT_CONFIG, Slide } from './types';
import { v4 as uuidv4 } from 'uuid';
import { ScrapeResult } from '@/lib/types';
import { generateVoiceoverScript } from './backend/scriptGenerator';
import { selectBest4ImagesFor16x9 } from './backend/imageSelector';
import * as fs from 'fs';

/**
 * Global singleton store for projects (fixes Next.js module isolation)
 */
const globalForProjects = globalThis as unknown as {
  projectsStore: Map<string, Project> | undefined;
};

const projects = globalForProjects.projectsStore ?? new Map<string, Project>();

if (process.env.NODE_ENV !== 'production') {
  globalForProjects.projectsStore = projects;
}

/**
 * Auto-cleanup: Remove projects older than 24 hours
 */
setInterval(() => {
  const now = Date.now();
  const maxAge = 24 * 60 * 60 * 1000; // 24 hours

  for (const [id, project] of projects.entries()) {
    if (now - project.createdAt.getTime() > maxAge) {
      projects.delete(id);
      console.log(`[ProjectStore] Cleaned up old project: ${id}`);
    }
  }
}, 60 * 60 * 1000); // Run every hour

/**
 * Create a new project from scraper results
 */
export async function createProject(request: CreateProjectRequest): Promise<Project> {
  const { scraperResult, maxSlides = 10, defaultSlideDuration = 3 } = request;

  const projectId = uuidv4();

  // SMART IMAGE SELECTION: Use aspect ratio intelligence to pick best 4 images for 16:9 video
  console.log(`[ProjectStore] Starting smart image selection (16:9 optimized)...`);
  const selectedImages = await selectBest4ImagesFor16x9(scraperResult.images);
  console.log(`[ProjectStore] Smart selection complete: ${selectedImages.length} images selected`);

  if (selectedImages.length === 0) {
    throw new Error('No valid images found in scraped data. The website may not have accessible images or they may be blocked by CORS. Try a different website.');
  }

  if (selectedImages.length < 4) {
    console.warn(`[ProjectStore] WARNING: Only found ${selectedImages.length} valid images, expected 4`);
  }

  // Calculate total duration for timing
  const endScreenDuration = 3;
  const tempContentDuration = selectedImages.length * defaultSlideDuration;
  const totalDuration = tempContentDuration + endScreenDuration;

  // Generate AI-powered voiceover script using Groq
  console.log(`[ProjectStore] Generating AI script for ${scraperResult.business.title}...`);
  const aiScript = await generateVoiceoverScript({
    businessName: scraperResult.business.title,
    description: scraperResult.business.description,
    totalDuration,
    slideCount: selectedImages.length,
  });
  console.log(`[ProjectStore] AI script generated successfully`);

  // AUTO-GENERATE VOICEOVER AUDIO (Gradium AI)
  console.log('\n╔════════════════════════════════════════════════════════╗');
  console.log('║  🎤 AUTO-GENERATING VOICEOVER                          ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');
  let voiceAudioPath: string | null = null;
  let generatedWith: 'gradium' | undefined = undefined;
  
  try {
    const { generateTTS } = await import('./backend/audioMixer');
    voiceAudioPath = await generateTTS(aiScript, 'en-US-female');
    if (voiceAudioPath) {
      // Gradium AI is the only provider now
      if (voiceAudioPath.includes('voice_gradium_')) {
        generatedWith = 'gradium';
      }
      
      const fileSizeKB = (fs.statSync(voiceAudioPath).size / 1024).toFixed(2);
      
      console.log('╔════════════════════════════════════════════════════════╗');
      console.log(`║  ✅ VOICEOVER AUTO-GENERATION SUCCESSFUL               ║`);
      console.log('╠════════════════════════════════════════════════════════╣');
      console.log(`║  Provider: ${(generatedWith || 'unknown').toUpperCase()}`.padEnd(56) + '║');
      console.log(`║  File Size: ${fileSizeKB} KB`.padEnd(56) + '║');
      console.log(`║  Path: ...${voiceAudioPath.substring(voiceAudioPath.length - 35)}`.padEnd(56) + '║');
      console.log('╚════════════════════════════════════════════════════════╝\n');
    } else {
      console.log('╔════════════════════════════════════════════════════════╗');
      console.log('║  ⚠️  VOICEOVER GENERATION FAILED                        ║');
      console.log('╠════════════════════════════════════════════════════════╣');
      console.log('║  Will retry during video render                       ║');
      console.log('╚════════════════════════════════════════════════════════╝\n');
    }
  } catch (error) {
    console.log('╔════════════════════════════════════════════════════════╗');
    console.log('║  ❌ VOICEOVER GENERATION ERROR                         ║');
    console.log('╠════════════════════════════════════════════════════════╣');
    console.log(`║  Error: ${String(error).substring(0, 45)}`.padEnd(56) + '║');
    console.log('╚════════════════════════════════════════════════════════╝\n');
  }

  // Generate slides with even timing and varied transitions
  const transitions: Array<'fade' | 'slideup' | 'slidedown' | 'slideleft' | 'slideright' | 'wipeleft' | 'wiperight' | 'circlecrop'> = [
    'fade', 
    'slideright', 
    'slideup', 
    'wipeleft', 
    'slidedown', 
    'wiperight',
    'slideleft',
    'circlecrop'
  ];

  // Motion presets mapped to transitions (Ken Burns effect)
  const motions: Array<'zoom-in' | 'zoom-out' | 'pan-left' | 'pan-right' | 'pan-up' | 'pan-down'> = [
    'zoom-in', // fade → Zoom In
    'pan-left', // slideright → Pan Left
    'pan-down', // slideup → Pan Down
    'pan-right', // wipeleft → Pan Right
    'pan-up', // slidedown → Pan Up
    'pan-left', // wiperight → Pan Left
    'pan-right', // slideleft → Pan Right
    'zoom-in', // circlecrop → Zoom In
  ];
  
  const slides: Slide[] = selectedImages.map((img, index) => ({
    id: uuidv4(),
    imageUrl: img.url,
    startTime: index * defaultSlideDuration,
    endTime: (index + 1) * defaultSlideDuration,
    transition: transitions[index % transitions.length], // Rotate through 8 transition types
    motion: {
      type: motions[index % motions.length],
      intensity: 5, // Default intensity (1-10 scale)
    },
  }));

  // Add end screen slide (blank slide with text overlay)
  const contentDuration = slides.length * defaultSlideDuration;
  slides.push({
    id: uuidv4(),
    imageUrl: '', // Blank slide
    startTime: contentDuration,
    endTime: contentDuration + endScreenDuration,
    transition: 'fade',
    isEndScreen: true,
  });

  // Calculate total duration including end screen
  const baseDuration = contentDuration + endScreenDuration;

  // Get logo URL from brand data
  const logoUrl = scraperResult.brand.logoCandidates?.[0] || scraperResult.brand.favicon || null;

  const project: Project = {
    projectId,
    business: scraperResult.business,
    brand: scraperResult.brand,
    sourceImages: scraperResult.images,
    slides,
    bottomBanner: {
      ...DEFAULT_PROJECT_CONFIG.bottomBanner,
      enabled: true,
      text: scraperResult.business.phones[0] || scraperResult.business.emails[0] || scraperResult.business.title,
      logoUrl,
      endTime: baseDuration,
    },
    qrCode: {
      ...DEFAULT_PROJECT_CONFIG.qrCode,
      url: scraperResult.inputUrl || '',
      endTime: baseDuration,
    },
    music: { ...DEFAULT_PROJECT_CONFIG.music },
    voice: {
      ...DEFAULT_PROJECT_CONFIG.voice,
      enabled: true, // Auto-enable voiceover
      script: aiScript, // AI-generated script from Groq
      audioPath: voiceAudioPath, // Pre-generated audio (or null if failed)
      generatedWith, // Track which provider was used (gradium only)
    },
    endScreen: {
      ...DEFAULT_PROJECT_CONFIG.endScreen,
      enabled: true, // Auto-enable end screen
      content: `Thank you for watching! Visit ${scraperResult.business.title}`,
      logoUrl,
      companyName: scraperResult.brand.name,
      phoneNumber: scraperResult.business.phones[0] || '',
      websiteLink: scraperResult.inputUrl ? new URL(scraperResult.inputUrl).hostname : '',
      backgroundColor: '#FFFFFF',
      textColor: '#000000',
      phoneNumberColor: '#F59E0B',
    },
    status: 'draft',
    previewVideoUrl: null,
    finalVideoUrl: null,
    lastPreviewConfigHash: null,
    lastPreviewRenderedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  projects.set(projectId, project);

  console.log(`[ProjectStore] Created project ${projectId} with ${slides.length} slides (${slides.length - 1} content + 1 end screen)`);

  return project;
}

/**
 * Get project by ID
 */
export function getProject(projectId: string): Project | null {
  console.log(`[ProjectStore] Getting project ${projectId}, total projects: ${projects.size}`);
  console.log(`[ProjectStore] Available IDs:`, Array.from(projects.keys()));
  const project = projects.get(projectId) || null;
  console.log(`[ProjectStore] Found:`, project ? 'YES' : 'NO');
  return project;
}

/**
 * Update project
 */
export function updateProject(
  projectId: string,
  updates: Partial<Project>
): Project | null {
  const project = projects.get(projectId);
  if (!project) return null;

  const updated: Project = {
    ...project,
    ...updates,
    updatedAt: new Date(),
  };

  projects.set(projectId, updated);

  console.log(`[ProjectStore] Updated project ${projectId}`);

  return updated;
}

/**
 * Delete project
 */
export function deleteProject(projectId: string): boolean {
  const deleted = projects.delete(projectId);
  if (deleted) {
    console.log(`[ProjectStore] Deleted project ${projectId}`);
  }
  return deleted;
}

/**
 * List all projects (for debugging)
 */
export function listProjects(): Project[] {
  return Array.from(projects.values());
}

/**
 * Get project count
 */
export function getProjectCount(): number {
  return projects.size;
}
