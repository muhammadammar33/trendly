/**
 * API Route: GET /api/studio/project/[id]
 * 
 * Get project by ID
 */

import { NextRequest, NextResponse } from 'next/server';
import { getProject } from '@/studio/projectStore';
import * as fs from 'fs';
import * as path from 'path';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    console.log(`[API] GET /api/studio/project/${id}`);
    
    const project = await getProject(id);
    console.log(`[API] Project found:`, project ? 'YES' : 'NO');

    if (!project) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      );
    }

    // Check if preview video exists on disk
    if (project.previewVideoUrl) {
      const videoPath = path.join(process.cwd(), 'public', project.previewVideoUrl);
      const videoExists = fs.existsSync(videoPath);
      
      console.log(`[API] Video check: ${project.previewVideoUrl}`);
      console.log(`[API] Video exists on disk: ${videoExists}`);
      
      if (!videoExists) {
        console.warn(`[API] Video file missing, clearing URL to trigger re-render`);
        // Clear the video URL so frontend knows to re-render
        project.previewVideoUrl = null;
        project.status = 'draft';
      }
    }

    return NextResponse.json(project);
  } catch (error: any) {
    console.error('[API] Get project failed:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to get project' },
      { status: 500 }
    );
  }
}
