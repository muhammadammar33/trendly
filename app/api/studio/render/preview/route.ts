/**
 * API Route: POST /api/studio/render/preview
 * 
 * Generate low-res preview video (720p, fast encoding)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getProject, updateProject } from '@/studio/projectStore';
import { createRenderJob, updateRenderJob } from '@/studio/backend/renderJobStore';
import { renderVideo } from '@/studio/backend/videoRenderer';
import { generateConfigHash } from '@/studio/backend/imageSelector';
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

  console.log(`[API] ===== Starting ${type} render =====`);
  console.log(`[API] Project ID: ${project.projectId}`);
  console.log(`[API] Job ID: ${jobId}`);
  console.log(`[API] Output: ${outputPath}`);

  try {
    // Update status
    console.log('[API] Setting job status to preparing...');
    updateRenderJob(jobId, {
      status: 'preparing',
      progress: 5,
      stage: 'Preparing',
    });

    // Render video
    console.log('[API] Calling renderVideo()...');
    await renderVideo({
      project,
      outputPath,
      resolution,
      onProgress: (progress, stage) => {
        console.log(`[API] Progress update: ${progress}% - ${stage}`);
        updateRenderJob(jobId, {
          status: 'rendering',
          progress,
          stage,
        });
      },
    });

    console.log('[API] renderVideo() completed successfully!');

    // Update project with config hash
    const videoUrl = `/studio/videos/${fileName}`;
    const configHash = generateConfigHash(project);
    
    console.log(`[API] Generated config hash for ${type}: ${configHash}`);
    
    if (type === 'preview') {
      updateProject(project.projectId, {
        status: 'preview-ready',
        previewVideoUrl: videoUrl,
        lastPreviewConfigHash: configHash,
        lastPreviewRenderedAt: new Date(),
      });
      console.log(`[API] Updated project with preview hash: ${configHash}`);
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
    console.error(`[API] ===== ${type.toUpperCase()} RENDER FAILED =====`);
    console.error('[API] Error message:', error?.message || 'Unknown error');
    console.error('[API] Error stack:', error?.stack || 'No stack trace');
    console.error('[API] Error details:', error);
    
    updateRenderJob(jobId, {
      status: 'error',
      error: error?.message || 'Unknown rendering error',
      stage: 'Failed',
    });

    updateProject(project.projectId, {
      status: 'error',
    });
  }
}
