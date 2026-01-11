/**
 * Slideshow module entry point
 * Orchestrates the entire slideshow generation pipeline
 */

export { pickImagesForSlideshow, type PickedImages, type PickerOptions } from './imagePicker';
export { downloadImages, cleanupImages, type DownloadResult } from './imageDownloader';
export { renderSlideshow, type RenderOptions, type RenderResult } from './slideshowRenderer';
export {
  createJob,
  updateJob,
  getJob,
  deleteJob,
  cleanupOldJobs,
  type SlideshowJob,
  type JobStatus,
} from './slideshowJobStore';
