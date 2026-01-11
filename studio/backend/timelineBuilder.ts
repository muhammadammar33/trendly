/**
 * Timeline Builder
 * 
 * Constructs FFmpeg input list and timing from project slides
 */

import { Slide, Project, EndScreen } from '../types';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Slide with input configuration
 */
export interface SlideInput {
  slide: Slide;
  inputIndex: number;
  localPath: string;
  duration: number;
}

/**
 * Build input list for FFmpeg
 */
export function buildInputList(
  slides: Slide[],
  imageDir: string
): SlideInput[] {
  return slides.map((slide, index) => {
    const fileName = `slide_${index}.jpg`;
    const localPath = path.join(imageDir, fileName);

    return {
      slide,
      inputIndex: index,
      localPath,
      duration: slide.endTime - slide.startTime,
    };
  });
}

/**
 * Calculate total video duration
 */
export function calculateDuration(slides: Slide[]): number {
  if (slides.length === 0) return 0;
  
  const lastSlide = slides[slides.length - 1];
  return lastSlide.endTime;
}

/**
 * Build FFmpeg concat demuxer file
 * 
 * Creates a text file with format:
 * file 'path/to/image1.jpg'
 * duration 3.0
 * file 'path/to/image2.jpg'
 * duration 3.0
 */
export function buildConcatFile(
  slideInputs: SlideInput[],
  outputPath: string
): void {
  const lines: string[] = [];

  slideInputs.forEach((input, index) => {
    // Normalize path for FFmpeg (use forward slashes)
    const normalizedPath = input.localPath.replace(/\\/g, '/');
    
    lines.push(`file '${normalizedPath}'`);
    lines.push(`duration ${input.duration}`);

    // Last image needs to be repeated
    if (index === slideInputs.length - 1) {
      lines.push(`file '${normalizedPath}'`);
    }
  });

  fs.writeFileSync(outputPath, lines.join('\n'));
  console.log(`[TimelineBuilder] Created concat file: ${outputPath}`);
}

/**
 * Validate slide timeline
 * 
 * Ensures:
 * - No gaps
 * - No overlaps
 * - Monotonic increasing
 */
export function validateTimeline(slides: Slide[]): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (slides.length === 0) {
    errors.push('No slides in timeline');
    return { valid: false, errors };
  }

  for (let i = 0; i < slides.length; i++) {
    const slide = slides[i];

    // Check duration
    if (slide.endTime <= slide.startTime) {
      errors.push(`Slide ${i}: End time must be after start time`);
    }

    // Check for gaps/overlaps
    if (i > 0) {
      const prevSlide = slides[i - 1];
      
      if (slide.startTime < prevSlide.endTime) {
        errors.push(`Slide ${i}: Overlaps with previous slide`);
      } else if (slide.startTime > prevSlide.endTime) {
        errors.push(`Slide ${i}: Gap before this slide`);
      }
    } else {
      // First slide should start at 0
      if (slide.startTime !== 0) {
        errors.push('First slide should start at 0');
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Adjust slide timing to fix gaps/overlaps
 */
export function normalizeTimeline(slides: Slide[]): Slide[] {
  if (slides.length === 0) return [];

  const normalized: Slide[] = [];
  let currentTime = 0;

  slides.forEach((slide) => {
    const duration = slide.endTime - slide.startTime;
    
    normalized.push({
      ...slide,
      startTime: currentTime,
      endTime: currentTime + duration,
    });

    currentTime += duration;
  });

  return normalized;
}

/**
 * Add end screen to timeline
 */
export function addEndScreen(
  slides: Slide[],
  endScreen: EndScreen
): Slide[] {
  if (!endScreen.enabled) return slides;

  const lastSlide = slides[slides.length - 1];
  const endScreenStart = lastSlide ? lastSlide.endTime : 0;

  const endSlide: Slide = {
    id: 'end-screen',
    imageUrl: endScreen.type === 'image' ? endScreen.content : '',
    startTime: endScreenStart,
    endTime: endScreenStart + endScreen.duration,
    transition: 'fade',
  };

  return [...slides, endSlide];
}
