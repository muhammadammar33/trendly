/**
 * API Route: POST /api/studio/render/preview
 * 
 * Generate low-res preview video (720p, fast encoding)
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
        { error: 'Missing projectId parameter' },
        { status: 400 }
      );
    }

    const project = getProject(projectId);
    if (!project) {
      return NextResponse.json(
        { error: 'Project not found. Please refresh and try again.' },
        { status: 404 }
      );
    }

    // Validate project has slides
    if (!project.slides || project.slides.length === 0) {
      return NextResponse.json(
        { error: 'Project has no slides. Please add some images first.' },
        { status: 400 }
      );
    }

    // Create render job
    console.log('[API] Creating preview render job for project:', projectId);
    const job = createRenderJob(projectId, 'preview');

    // Start async rendering
    processRenderAsync(job.jobId, project, 'preview').catch((err) => {
      console.error('[API] Preview render failed:', err);
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
    console.error('[API] Preview render request failed:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to start preview render' },
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
  const outputDir = path.join(process.cwd(), 'public', 'studio', 'videos');
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
