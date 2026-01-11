/**
 * API Route: GET /api/slideshow/status
 * Check slideshow job status and progress
 */

import { NextRequest, NextResponse } from 'next/server';
import { getJob } from '@/slideshow';

/**
 * GET /api/slideshow/status?jobId=xxx
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const jobId = searchParams.get('jobId');

    if (!jobId) {
      return NextResponse.json(
        { error: 'jobId query parameter is required' },
        { status: 400 }
      );
    }

    const job = getJob(jobId);

    if (!job) {
      return NextResponse.json(
        { error: 'Job not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      jobId: job.jobId,
      status: job.status,
      progress: job.progress,
      stage: job.stage,
      videoUrl: job.videoUrl,
      error: job.error,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    });
  } catch (error: any) {
    console.error('Status check error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to check status' },
      { status: 500 }
    );
  }
}
