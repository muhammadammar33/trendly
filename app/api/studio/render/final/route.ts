/**
 * API Route: POST /api/studio/render/final
 * 
 * Generate full HD 1080p final video
 */

import { NextRequest, NextResponse } from 'next/server';
import { getProject, updateProject } from '@/studio/projectStore';
import { createRenderJob, updateRenderJob } from '@/studio/backend/renderJobStore';
import { renderVideo } from '@/studio/backend/videoRenderer';
import * as path from 'path';
import * as fs from 'fs';

export async function POST(request: NextRequest) {
  try {
    const { projectId } = await request.json();

    if (!projectId) {
      return NextResponse.json(
        { error: 'Missing projectId' },
        { status: 400 }
      );
    }

    const project = getProject(projectId);
    if (!project) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      );
    }

    // Create render job
    const job = createRenderJob(projectId, 'final');

    // Start async rendering
    processRenderAsync(job.jobId, project, 'final').catch((err) => {
      console.error('[API] Final render failed:', err);
      updateRenderJob(job.jobId, {
        status: 'error',
        error: err.message,
        progress: 0,
      });
    });

    return NextResponse.json({
      jobId: job.jobId,
      status: job.status,
    });
  } catch (error: any) {
    console.error('[API] Final render request failed:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to start final render' },
      { status: 500 }
    );
  }
}

/**
 * Process render asynchronously
 */
async function processRenderAsync(
  jobId: string,
  project: any,
  type: 'preview' | 'final'
): Promise<void> {
  const resolution = type === 'preview' ? '720p' : '1080p';
  
  // Use /data for Railway persistent volume, fall back to public for local dev
  const isRailway = !!process.env.RAILWAY_ENVIRONMENT;
  const outputDir = isRailway 
    ? path.join('/data', 'studio', 'videos')
    : path.join(process.cwd(), 'public', 'studio', 'videos');
  
  const fileName = `${project.projectId}_${type}.mp4`;
  const outputPath = path.join(outputDir, fileName);

  fs.mkdirSync(outputDir, { recursive: true });

  try {
    // Update status
    updateRenderJob(jobId, {
      status: 'preparing',
      progress: 5,
      stage: 'Preparing',
    });

    // Render video
    await renderVideo({
      project,
      outputPath,
      resolution,
      onProgress: (progress, stage) => {
        updateRenderJob(jobId, {
          status: 'rendering',
          progress,
          stage,
        });
      },
    });

    // Update project
    const videoUrl = `/studio/videos/${fileName}`;
    
    if (type === 'preview') {
      updateProject(project.projectId, {
        status: 'preview-ready',
        previewVideoUrl: videoUrl,
      });
    } else {
      updateProject(project.projectId, {
        status: 'final-ready',
        finalVideoUrl: videoUrl,
      });
    }

    // Mark job complete
    updateRenderJob(jobId, {
      status: 'done',
      progress: 100,
      stage: 'Complete',
      videoUrl,
    });

    console.log(`[API] ${type} render complete: ${videoUrl}`);
  } catch (error: any) {
    console.error(`[API] ${type} render failed:`, error);
    
    updateRenderJob(jobId, {
      status: 'error',
      error: error.message,
      stage: 'Failed',
    });

    updateProject(project.projectId, {
      status: 'error',
    });
  }
}
