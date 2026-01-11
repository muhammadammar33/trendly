/**
 * API Route: POST /api/studio/project/[id]/update
 * 
 * Update project settings
 */

import { NextRequest, NextResponse } from 'next/server';
import { getProject, updateProject } from '@/studio/projectStore';
import { UpdateProjectRequest } from '@/studio/types';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const updates: UpdateProjectRequest = await request.json();

    const project = getProject(id);
    if (!project) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      );
    }

    const updated = updateProject(id, updates as any);

    return NextResponse.json(updated);
  } catch (error: any) {
    console.error('[API] Update project failed:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to update project' },
      { status: 500 }
    );
  }
}
