/**
 * API Route: POST /api/slideshow/start
 * Starts slideshow generation from scraper results
 */

import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import type { ScrapeResult } from '@/lib/types';
import {
  createJob,
  updateJob,
  pickImagesForSlideshow,
  downloadImages,
  renderSlideshow,
  cleanupImages,
} from '@/slideshow';

export const maxDuration = 300; // 5 minutes for video rendering

/**
 * POST /api/slideshow/start
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { scraperResult, maxImages = 10, durationSec = 15 } = body;

    // Validate input
    if (!scraperResult || !scraperResult.images) {
      return NextResponse.json(
        { error: 'Invalid scraper result. Must include images array.' },
        { status: 400 }
      );
    }

    const scrapeData = scraperResult as ScrapeResult;

    // Create job
    const jobId = randomUUID();
    createJob(jobId);

    // Start async processing (don't await)
    processSlideshowAsync(jobId, scrapeData, maxImages, durationSec).catch((error) => {
      console.error(`Slideshow job ${jobId} failed:`, error);
      updateJob(jobId, {
        status: 'error',
        progress: 0,
        error: error.message || 'Unknown error',
      });
    });

    return NextResponse.json({
      jobId,
      status: 'queued',
    });
  } catch (error: any) {
    console.error('Slideshow start error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to start slideshow generation' },
      { status: 500 }
    );
  }
}

/**
 * Process slideshow asynchronously
 */
async function processSlideshowAsync(
  jobId: string,
  scrapeData: ScrapeResult,
  maxImages: number,
  durationSec: number
): Promise<void> {
  try {
    // Stage 1: Pick images
    updateJob(jobId, {
      status: 'picking',
      progress: 10,
      stage: 'Selecting best images...',
    });

    const { selectedImages, warnings } = pickImagesForSlideshow(scrapeData.images, {
      maxImages,
      minImages: 5,
    });

    if (selectedImages.length === 0) {
      throw new Error('No images could be selected for slideshow');
    }

    console.log(`Job ${jobId}: Selected ${selectedImages.length} images`);
    if (warnings.length > 0) {
      console.warn(`Job ${jobId} warnings:`, warnings);
    }

    // Stage 2: Download images
    updateJob(jobId, {
      status: 'downloading',
      progress: 30,
      stage: `Downloading ${selectedImages.length} images...`,
    });

    const downloadResult = await downloadImages(selectedImages, jobId);

    if (downloadResult.downloaded.length === 0) {
      throw new Error('Failed to download any images');
    }

    console.log(`Job ${jobId}: Downloaded ${downloadResult.downloaded.length} images`);
    if (downloadResult.warnings.length > 0) {
      console.warn(`Job ${jobId} download warnings:`, downloadResult.warnings);
    }

    // Stage 3: Render video
    updateJob(jobId, {
      status: 'rendering',
      progress: 60,
      stage: 'Rendering slideshow video...',
    });

    const renderResult = await renderSlideshow({
      jobId,
      imagePaths: downloadResult.downloaded,
      durationSec,
      businessTitle: scrapeData.business?.title,
      websiteUrl: scrapeData.finalUrl,
    });

    if (!renderResult.success) {
      throw new Error(renderResult.error || 'Video rendering failed');
    }

    // Stage 4: Done
    updateJob(jobId, {
      status: 'done',
      progress: 100,
      stage: 'Complete',
      videoUrl: renderResult.videoPath,
    });

    console.log(`Job ${jobId}: Complete. Video at ${renderResult.videoPath}`);

    // Cleanup downloaded images after 5 minutes
    setTimeout(() => {
      cleanupImages(jobId).catch(console.error);
    }, 5 * 60 * 1000);
  } catch (error: any) {
    console.error(`Job ${jobId} failed:`, error);
    
    updateJob(jobId, {
      status: 'error',
      progress: 0,
      stage: 'Failed',
      error: error.message || 'Unknown error occurred',
    });

    // Cleanup on error
    setTimeout(() => {
      cleanupImages(jobId).catch(console.error);
    }, 60 * 1000);
  }
}
