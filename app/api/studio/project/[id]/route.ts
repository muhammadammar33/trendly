/**
 * API Route: GET /api/studio/project/[id]
 * 
 * Get project by ID
 */

import { NextRequest, NextResponse } from 'next/server';
import { getProject } from '@/studio/projectStore';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    console.log(`[API] GET /api/studio/project/${id}`);
    
    const project = getProject(id);
    console.log(`[API] Project found:`, project ? 'YES' : 'NO');

    if (!project) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      );
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
