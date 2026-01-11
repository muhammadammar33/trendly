/**
 * API Route: POST /api/studio/project/create
 * 
 * Create a new studio project from scraper results
 */

import { NextRequest, NextResponse } from 'next/server';
import { createProject } from '@/studio/projectStore';
import { CreateProjectRequest } from '@/studio/types';

export async function POST(request: NextRequest) {
  try {
    const body: CreateProjectRequest = await request.json();

    if (!body.scraperResult) {
      return NextResponse.json(
        { error: 'Missing scraperResult. Please scrape a website first.' },
        { status: 400 }
      );
    }

    // Validate scraper result has required fields
    if (!body.scraperResult.business || !body.scraperResult.images || !body.scraperResult.brand) {
      return NextResponse.json(
        { error: 'Invalid scraperResult. Missing required fields (business, images, or brand).' },
        { status: 400 }
      );
    }

    // Validate images array is not empty
    if (body.scraperResult.images.length === 0) {
      return NextResponse.json(
        { error: 'No images found in scraper result. Please ensure the website has images.' },
        { status: 400 }
      );
    }

    console.log('[API] Creating project with', body.scraperResult.images.length, 'images');
    const project = await createProject(body);

    console.log('[API] Project created successfully:', project.projectId);
    return NextResponse.json({
      projectId: project.projectId,
      status: project.status,
      slidesCount: project.slides.length,
      message: 'Studio project created successfully!'
    });
  } catch (error: any) {
    console.error('[API] Create project failed:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create project. Please try again.' },
      { status: 500 }
    );
  }
}
