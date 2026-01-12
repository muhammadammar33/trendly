/**
 * In-Memory Project Store
 * 
 * CRUD operations for Studio projects
 */

import { Project, CreateProjectRequest, DEFAULT_PROJECT_CONFIG, Slide } from './types';
import { v4 as uuidv4 } from 'uuid';
import { ScrapeResult } from '@/lib/types';
import { generateVoiceoverScript } from './backend/scriptGenerator';

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

  // Generate AI-powered voiceover script using Groq
  console.log(`[ProjectStore] Generating AI script for ${scraperResult.business.title}...`);
  const aiScript = await generateVoiceoverScript({
    businessName: scraperResult.business.title,
    description: scraperResult.business.description,
  });
  console.log(`[ProjectStore] AI script generated successfully`);

  // Prioritize high-quality images: hero > product > banner > other
  // Filter out icons and very low-scored images
  const qualityImages = scraperResult.images.filter(
    (img) => {
      // Must have valid URL
      if (!img.url || img.url.length === 0) return false;
      
      // Must not be icon type and have good score (increased threshold)
      if (img.typeGuess === 'icon' || img.score < 0.7) return false;
      
      // Validate URL is accessible (basic check)
      try {
        const url = new URL(img.url);
        // Must be http/https
        if (!['http:', 'https:'].includes(url.protocol)) return false;
        return true;
      } catch (e) {
        console.warn(`[ProjectStore] Invalid image URL: ${img.url}`);
        return false;
      }
    }
  );

  console.log(`[ProjectStore] Found ${qualityImages.length} quality images (score >= 0.7, excluding icons)`);
  console.log(`[ProjectStore] Image types:`, qualityImages.map(i => `${i.typeGuess}(${i.score.toFixed(2)})`).join(', '));
  console.log(`[ProjectStore] Top 5 URLs:`, qualityImages.slice(0, 5).map(i => `${i.url.substring(0, 80)}... (${i.score.toFixed(2)})`).join('\n'));

  // Prefer hero and product images, but fall back to any quality images
  const heroAndProductImages = qualityImages.filter(
    (img) => img.typeGuess === 'hero' || img.typeGuess === 'product' || img.typeGuess === 'banner'
  );

  const imagesToUse = heroAndProductImages.length > 0 
    ? heroAndProductImages 
    : qualityImages.slice(0, maxSlides);

  // Take exactly 4 images for main slideshow
  const selectedImages = imagesToUse.slice(0, 4);
  
  console.log(`[ProjectStore] Selected ${selectedImages.length} images for slideshow`);
  if (selectedImages.length < 4) {
    console.warn(`[ProjectStore] WARNING: Only found ${selectedImages.length} valid images, expected 4`);
  }

  // Initialize slides array
  let slides: Slide[] = [];

  // If we don't have enough images, throw error with helpful message
  if (selectedImages.length === 0) {
    // Fallback: try with lower threshold (0.5) if we got 0 with 0.7
    const fallbackImages = scraperResult.images.filter(
      (img) => img.url && img.typeGuess !== 'icon' && img.score >= 0.5
    );
    
    if (fallbackImages.length > 0) {
      console.warn(`[ProjectStore] Using fallback images with score >= 0.5 (found ${fallbackImages.length})`);
      const fallbackSelected = fallbackImages.slice(0, 4);
      slides = fallbackSelected.map((img, index) => ({
        id: uuidv4(),
        imageUrl: img.url,
        startTime: index * defaultSlideDuration,
        endTime: (index + 1) * defaultSlideDuration,
        transition: 'fade' as const,
      }));
    } else {
      throw new Error('No valid images found in scraped data. The website may not have accessible images or they may be blocked by CORS. Try a different website.');
    }
  } else {
    // Generate slides with even timing
    slides = selectedImages.map((img, index) => ({
      id: uuidv4(),
      imageUrl: img.url,
      startTime: index * defaultSlideDuration,
      endTime: (index + 1) * defaultSlideDuration,
      transition: 'fade',
    }));
  }

  // Calculate total duration based on slides (end screen is optional)
  const baseDuration = slides.length * defaultSlideDuration;

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
      text: scraperResult.business.phones[0] || scraperResult.business.emails[0] || '',
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
      script: aiScript, // AI-generated script from Groq
    },
    endScreen: {
      ...DEFAULT_PROJECT_CONFIG.endScreen, // enabled: false by default
      content: `Thank you for watching! Visit ${scraperResult.business.title}`,
      logoUrl,
    },
    status: 'draft',
    previewVideoUrl: null,
    finalVideoUrl: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  projects.set(projectId, project);

  console.log(`[ProjectStore] Created project ${projectId} with ${slides.length} slides (hero images only)`);

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
