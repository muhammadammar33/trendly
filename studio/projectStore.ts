/**
 * Database-backed Project Store (Prisma + PostgreSQL)
 * 
 * CRUD operations for Studio projects with persistent database storage
 */

import { Project, CreateProjectRequest, DEFAULT_PROJECT_CONFIG, Slide } from './types';
import { v4 as uuidv4 } from 'uuid';
import { ScrapeResult } from '@/lib/types';
import { generateVoiceoverScript } from './backend/scriptGenerator';
import { selectBest4ImagesFor16x9 } from './backend/imageSelector';
import { prisma } from '@/lib/prisma';
import * as fs from 'fs';

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

  // Save to database
  try {
    await prisma.project.create({
      data: {
        id: projectId,
        business: project.business as any,
        brand: project.brand as any,
        sourceImages: project.sourceImages as any,
        slides: project.slides as any,
        bottomBanner: project.bottomBanner as any,
        qrCode: project.qrCode as any,
        music: project.music as any,
        voice: project.voice as any,
        endScreen: project.endScreen as any,
        status: project.status,
        previewVideoUrl: project.previewVideoUrl,
        finalVideoUrl: project.finalVideoUrl,
        lastPreviewConfigHash: project.lastPreviewConfigHash,
        lastPreviewRenderedAt: project.lastPreviewRenderedAt,
      },
    });

    console.log(`[ProjectStore] Created project ${projectId} in database with ${slides.length} slides`);
  } catch (error) {
    console.error(`[ProjectStore] Database error creating project:`, error);
    throw new Error('Failed to save project to database');
  }

  return project;
}

/**
 * Get project by ID from database
 */
export async function getProject(projectId: string): Promise<Project | null> {
  console.log(`[ProjectStore] Getting project ${projectId} from database`);
  
  try {
    const dbProject = await prisma.project.findUnique({
      where: { id: projectId },
    });

    if (!dbProject) {
      console.log(`[ProjectStore] Project ${projectId} not found`);
      return null;
    }

    // Convert database record to Project type
    const project: Project = {
      projectId: dbProject.id,
      business: dbProject.business as any,
      brand: dbProject.brand as any,
      sourceImages: dbProject.sourceImages as any,
      slides: dbProject.slides as any,
      bottomBanner: dbProject.bottomBanner as any,
      qrCode: dbProject.qrCode as any,
      music: dbProject.music as any,
      voice: dbProject.voice as any,
      endScreen: dbProject.endScreen as any,
      status: dbProject.status as any,
      previewVideoUrl: dbProject.previewVideoUrl,
      finalVideoUrl: dbProject.finalVideoUrl,
      lastPreviewConfigHash: dbProject.lastPreviewConfigHash,
      lastPreviewRenderedAt: dbProject.lastPreviewRenderedAt,
      createdAt: dbProject.createdAt,
      updatedAt: dbProject.updatedAt,
    };

    console.log(`[ProjectStore] Found project ${projectId}`);
    return project;
  } catch (error) {
    console.error(`[ProjectStore] Database error getting project:`, error);
    return null;
  }
}

/**
 * Update project in database
 */
export async function updateProject(
  projectId: string,
  updates: Partial<Project>
): Promise<Project | null> {
  console.log(`[ProjectStore] Updating project ${projectId}`);

  try {
    // Prepare update data (exclude projectId, createdAt from updates)
    const { projectId: _, createdAt, ...updateData } = updates;

    const dbProject = await prisma.project.update({
      where: { id: projectId },
      data: {
        ...(updateData.business && { business: updateData.business as any }),
        ...(updateData.brand && { brand: updateData.brand as any }),
        ...(updateData.sourceImages && { sourceImages: updateData.sourceImages as any }),
        ...(updateData.slides && { slides: updateData.slides as any }),
        ...(updateData.bottomBanner && { bottomBanner: updateData.bottomBanner as any }),
        ...(updateData.qrCode && { qrCode: updateData.qrCode as any }),
        ...(updateData.music && { music: updateData.music as any }),
        ...(updateData.voice && { voice: updateData.voice as any }),
        ...(updateData.endScreen && { endScreen: updateData.endScreen as any }),
        ...(updateData.status && { status: updateData.status }),
        ...(updateData.previewVideoUrl !== undefined && { previewVideoUrl: updateData.previewVideoUrl }),
        ...(updateData.finalVideoUrl !== undefined && { finalVideoUrl: updateData.finalVideoUrl }),
        ...(updateData.lastPreviewConfigHash !== undefined && { lastPreviewConfigHash: updateData.lastPreviewConfigHash }),
        ...(updateData.lastPreviewRenderedAt !== undefined && { lastPreviewRenderedAt: updateData.lastPreviewRenderedAt }),
      },
    });

    // Convert back to Project type
    const project: Project = {
      projectId: dbProject.id,
      business: dbProject.business as any,
      brand: dbProject.brand as any,
      sourceImages: dbProject.sourceImages as any,
      slides: dbProject.slides as any,
      bottomBanner: dbProject.bottomBanner as any,
      qrCode: dbProject.qrCode as any,
      music: dbProject.music as any,
      voice: dbProject.voice as any,
      endScreen: dbProject.endScreen as any,
      status: dbProject.status as any,
      previewVideoUrl: dbProject.previewVideoUrl,
      finalVideoUrl: dbProject.finalVideoUrl,
      lastPreviewConfigHash: dbProject.lastPreviewConfigHash,
      lastPreviewRenderedAt: dbProject.lastPreviewRenderedAt,
      createdAt: dbProject.createdAt,
      updatedAt: dbProject.updatedAt,
    };

    console.log(`[ProjectStore] Updated project ${projectId}`);
    return project;
  } catch (error) {
    console.error(`[ProjectStore] Database error updating project:`, error);
    return null;
  }
}

/**
 * Delete project from database
 */
export async function deleteProject(projectId: string): Promise<boolean> {
  console.log(`[ProjectStore] Deleting project ${projectId}`);

  try {
    await prisma.project.delete({
      where: { id: projectId },
    });

    console.log(`[ProjectStore] Deleted project ${projectId}`);
    return true;
  } catch (error) {
    console.error(`[ProjectStore] Database error deleting project:`, error);
    return false;
  }
}

/**
 * List all projects from database (newest first)
 */
export async function listProjects(): Promise<Project[]> {
  console.log(`[ProjectStore] Listing all projects from database`);

  try {
    const dbProjects = await prisma.project.findMany({
      orderBy: { createdAt: 'desc' },
    });

    const projects: Project[] = dbProjects.map((dbProject) => ({
      projectId: dbProject.id,
      business: dbProject.business as any,
      brand: dbProject.brand as any,
      sourceImages: dbProject.sourceImages as any,
      slides: dbProject.slides as any,
      bottomBanner: dbProject.bottomBanner as any,
      qrCode: dbProject.qrCode as any,
      music: dbProject.music as any,
      voice: dbProject.voice as any,
      endScreen: dbProject.endScreen as any,
      status: dbProject.status as any,
      previewVideoUrl: dbProject.previewVideoUrl,
      finalVideoUrl: dbProject.finalVideoUrl,
      lastPreviewConfigHash: dbProject.lastPreviewConfigHash,
      lastPreviewRenderedAt: dbProject.lastPreviewRenderedAt,
      createdAt: dbProject.createdAt,
      updatedAt: dbProject.updatedAt,
    }));

    console.log(`[ProjectStore] Found ${projects.length} projects`);
    return projects;
  } catch (error) {
    console.error(`[ProjectStore] Database error listing projects:`, error);
    return [];
  }
}

/**
 * Get project count from database
 */
export async function getProjectCount(): Promise<number> {
  try {
    const count = await prisma.project.count();
    console.log(`[ProjectStore] Total projects in database: ${count}`);
    return count;
  } catch (error) {
    console.error(`[ProjectStore] Database error counting projects:`, error);
    return 0;
  }
}
