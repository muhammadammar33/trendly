/**
 * API Route: GET /api/studio/render/status
 * 
 * Check render job status
 */

import { NextRequest, NextResponse } from 'next/server';
import { getRenderJob } from '@/studio/backend/renderJobStore';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get('jobId');

    if (!jobId) {
      return NextResponse.json(
        { error: 'Missing jobId parameter' },
        { status: 400 }
      );
    }

    const job = getRenderJob(jobId);

    if (!job) {
      return NextResponse.json(
        { error: 'Job not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(job);
  } catch (error: any) {
    console.error('[API] Get render status failed:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to get render status' },
      { status: 500 }
    );
  }
}
