/**
 * API Route: GET /api/studio/video/[filename]
 * Serves rendered video files from the file system
 */

import { NextRequest, NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  try {
    const { filename } = await params;
    
    // Sanitize filename to prevent directory traversal
    const safeFilename = path.basename(filename);
    
    // Look in public folder first, then /data (Railway volume)
    const possiblePaths = [
      path.join(process.cwd(), 'public', 'studio', 'videos', safeFilename),
      path.join('/data', 'studio', 'videos', safeFilename),
      path.join('/app', 'public', 'studio', 'videos', safeFilename),
    ];
    
    let videoPath: string | null = null;
    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        videoPath = p;
        break;
      }
    }
    
    if (!videoPath) {
      console.error(`[Video API] File not found: ${safeFilename}`);
      console.error(`[Video API] Checked paths:`, possiblePaths);
      return NextResponse.json(
        { error: 'Video not found' },
        { status: 404 }
      );
    }
    
    // Read video file
    const videoBuffer = fs.readFileSync(videoPath);
    
    // Return video with appropriate headers
    return new NextResponse(videoBuffer, {
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Length': videoBuffer.length.toString(),
        'Cache-Control': 'public, max-age=31536000',
        'Accept-Ranges': 'bytes',
      },
    });
  } catch (error: any) {
    console.error('[Video API] Error serving video:', error);
    return NextResponse.json(
      { error: 'Failed to serve video' },
      { status: 500 }
    );
  }
}
