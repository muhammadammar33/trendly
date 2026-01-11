"use client";

/**
 * Studio Modal Component
 * Full video editor in a modal overlay
 */

import { useEffect, useState, useRef } from "react";
import {
  X,
  Film,
  MessageSquare,
  Square,
  QrCode,
  Music2,
  Mic,
  Play,
  Download,
  Clock,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  Maximize,
  ZoomIn,
  ZoomOut,
  Keyboard,
  Save,
  ChevronRight,
  ChevronLeft,
} from "lucide-react";
import {
  Project,
  Slide,
  BottomBanner,
  QRCode,
  Music,
  Voice,
  EndScreen,
} from "@/studio/types";

type Section = "slideshow" | "banner" | "endscreen" | "qr" | "music" | "voice";

interface StudioModalProps {
  projectId: string;
  isOpen: boolean;
  onClose: () => void;
}

export default function StudioModal({
  projectId,
  isOpen,
  onClose,
}: StudioModalProps) {
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeSection, setActiveSection] = useState<Section>("slideshow");
  const [renderLoading, setRenderLoading] = useState(false);
  const [renderProgress, setRenderProgress] = useState(0);
  const [renderStage, setRenderStage] = useState("");
  const [currentRenderJobId, setCurrentRenderJobId] = useState<string | null>(
    null
  );
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(100);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [timelineZoom, setTimelineZoom] = useState(1);
  const [showKeyboardShortcuts, setShowKeyboardShortcuts] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error" | "info";
  } | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);

  // Toast notification helper
  const showToast = (
    message: string,
    type: "success" | "error" | "info" = "info"
  ) => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // Load project when modal opens
  useEffect(() => {
    if (isOpen && projectId) {
      loadProject();
    }
  }, [isOpen, projectId]);

  // Video event listeners
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleTimeUpdate = () => setCurrentTime(video.currentTime);
    const handleLoadedMetadata = () => {
      setDuration(video.duration);
      console.log("Video loaded, duration:", video.duration);
    };
    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleEnded = () => setIsPlaying(false);

    video.addEventListener("timeupdate", handleTimeUpdate);
    video.addEventListener("loadedmetadata", handleLoadedMetadata);
    video.addEventListener("play", handlePlay);
    video.addEventListener("pause", handlePause);
    video.addEventListener("ended", handleEnded);

    // If video already has metadata loaded, set duration immediately
    if (video.duration && !isNaN(video.duration)) {
      setDuration(video.duration);
    }

    // Set initial volume and playback rate
    video.volume = volume / 100;
    video.playbackRate = playbackSpeed;
    video.muted = isMuted;

    return () => {
      video.removeEventListener("timeupdate", handleTimeUpdate);
      video.removeEventListener("loadedmetadata", handleLoadedMetadata);
      video.removeEventListener("play", handlePlay);
      video.removeEventListener("pause", handlePause);
      video.removeEventListener("ended", handleEnded);
    };
  }, [project?.previewVideoUrl]);

  // Keyboard shortcuts
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyPress = (e: KeyboardEvent) => {
      const video = videoRef.current;
      if (!video) return;

      // Ignore if user is typing in an input
      if (
        (e.target as HTMLElement).tagName === "INPUT" ||
        (e.target as HTMLElement).tagName === "TEXTAREA"
      )
        return;

      switch (e.key.toLowerCase()) {
        case " ":
        case "k":
          e.preventDefault();
          togglePlayPause();
          break;
        case "arrowleft":
          e.preventDefault();
          video.currentTime = Math.max(0, video.currentTime - 5);
          break;
        case "arrowright":
          e.preventDefault();
          video.currentTime = Math.min(video.duration, video.currentTime + 5);
          break;
        case "j":
          e.preventDefault();
          video.currentTime = Math.max(0, video.currentTime - 10);
          break;
        case "l":
          e.preventDefault();
          video.currentTime = Math.min(video.duration, video.currentTime + 10);
          break;
        case "m":
          e.preventDefault();
          toggleMute();
          break;
        case "f":
          e.preventDefault();
          toggleFullscreen();
          break;
        case "?":
          e.preventDefault();
          setShowKeyboardShortcuts(!showKeyboardShortcuts);
          break;
      }
    };

    window.addEventListener("keydown", handleKeyPress);
    return () => window.removeEventListener("keydown", handleKeyPress);
  }, [isOpen, showKeyboardShortcuts]);

  // Poll render status
  useEffect(() => {
    if (!currentRenderJobId) return;

    let pollCount = 0;
    const maxPolls = 300;

    const interval = setInterval(async () => {
      pollCount++;

      if (pollCount > maxPolls) {
        setRenderLoading(false);
        clearInterval(interval);
        setCurrentRenderJobId(null);
        alert("Render timed out. Please try again.");
        return;
      }

      try {
        const response = await fetch(
          `/api/studio/render/status?jobId=${currentRenderJobId}`
        );
        const job = await response.json();

        setRenderProgress(job.progress);
        setRenderStage(job.stage);

        if (job.status === "done") {
          setRenderLoading(false);
          clearInterval(interval);
          setCurrentRenderJobId(null);
          await loadProject();
        } else if (job.status === "error") {
          setRenderLoading(false);
          clearInterval(interval);
          setCurrentRenderJobId(null);
          alert(`Render failed: ${job.error}`);
        }
      } catch (err) {
        console.error("Failed to check render status:", err);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [currentRenderJobId]);

  const loadProject = async () => {
    try {
      const response = await fetch(`/api/studio/project/${projectId}`);
      if (!response.ok) throw new Error("Project not found");

      const data = await response.json();
      setProject(data);
      setLoading(false);
    } catch (err) {
      console.error("Failed to load project:", err);
      alert("Failed to load project");
      onClose();
    }
  };

  const updateProject = async (updates: Partial<Project>) => {
    if (!project) return;

    try {
      setIsSaving(true);
      const response = await fetch(`/api/studio/project/${projectId}/update`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });

      const updated = await response.json();
      setProject(updated);
      setTimeout(() => setIsSaving(false), 500);
    } catch (err) {
      console.error("Failed to update project:", err);
      alert("Failed to save changes");
      setIsSaving(false);
    }
  };

  const togglePlayPause = () => {
    const video = videoRef.current;
    if (!video) return;
    if (isPlaying) {
      video.pause();
    } else {
      video.play().catch((error) => {
        console.error("Failed to play video:", error);
        // Browser might require user interaction first
        alert("Unable to play video. Please click the play button again.");
      });
    }
  };

  const handleSeek = (time: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = time;
  };

  const handleVolumeChange = (newVolume: number) => {
    const video = videoRef.current;
    if (!video) return;
    setVolume(newVolume);
    video.volume = newVolume / 100;
    if (newVolume > 0 && isMuted) setIsMuted(false);
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    setIsMuted(!isMuted);
    video.muted = !isMuted;
  };

  const handleSpeedChange = (speed: number) => {
    const video = videoRef.current;
    if (!video) return;
    setPlaybackSpeed(speed);
    video.playbackRate = speed;
  };

  const toggleFullscreen = () => {
    const video = videoRef.current;
    if (!video) return;
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      video.requestFullscreen();
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const frames = Math.floor((seconds % 1) * 30);
    return `${mins.toString().padStart(2, "0")}:${secs
      .toString()
      .padStart(2, "0")}:${frames.toString().padStart(2, "0")}`;
  };

  const handleRenderPreview = async () => {
    if (renderLoading) return;

    setRenderLoading(true);
    setRenderProgress(0);
    setRenderStage("Starting...");

    try {
      const response = await fetch("/api/studio/render/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      });

      const data = await response.json();
      setCurrentRenderJobId(data.jobId);
    } catch (err) {
      console.error("Failed to start preview render:", err);
      alert("Failed to start render");
      setRenderLoading(false);
    }
  };

  const handleRenderFinal = async () => {
    if (renderLoading) return;
    if (!confirm("Render final HD video? This may take several minutes."))
      return;

    setRenderLoading(true);
    setRenderProgress(0);
    setRenderStage("Starting...");

    try {
      const response = await fetch("/api/studio/render/final", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      });

      const data = await response.json();
      setCurrentRenderJobId(data.jobId);
    } catch (err) {
      console.error("Failed to start final render:", err);
      alert("Failed to start render");
      setRenderLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md animate-in fade-in duration-300">
      <div className="relative w-full h-full bg-gradient-to-br from-gray-950 via-gray-900 to-black text-white overflow-hidden flex flex-col">
        {/* Professional Header */}
        <div className="bg-gradient-to-r from-gray-900 via-gray-850 to-gray-900 border-b border-gray-700/50 px-6 py-4 flex items-center justify-between shadow-2xl z-50">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gradient-to-br from-red-600 to-red-700 rounded-lg shadow-lg">
                <Film className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-white">Trendly Studio</h1>
                <p className="text-xs text-gray-400">Edit your Brand Ads</p>
              </div>
            </div>
            {project && (
              <div className="ml-6 flex items-center gap-2 text-sm">
                <span className="text-gray-500">Project:</span>
                <span className="text-white font-medium">
                  {project.projectId}
                </span>
                {isSaving && (
                  <span className="flex items-center gap-1 text-blue-400 animate-pulse">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Saving...
                  </span>
                )}
                {!isSaving && (
                  <span className="flex items-center gap-1 text-green-400">
                    <CheckCircle2 className="w-3 h-3" />
                    Saved
                  </span>
                )}
              </div>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowKeyboardShortcuts(!showKeyboardShortcuts)}
              className="flex items-center gap-2 px-3 py-2 bg-gray-700/50 hover:bg-gray-700 rounded-lg transition-colors text-sm border border-gray-700/50"
            >
              <Keyboard className="w-4 h-4" />
              <span>Shortcuts</span>
            </button>
            <button
              onClick={onClose}
              className="p-2 bg-red-600 hover:bg-red-700 rounded-lg transition-all duration-200 hover:scale-110 shadow-lg hover:shadow-red-600/50 group"
              aria-label="Close Studio"
            >
              <X className="w-5 h-5 text-white group-hover:rotate-90 transition-transform duration-200" />
            </button>
          </div>
        </div>

        {/* Loading State */}
        {loading ? (
          <div className="flex flex-col items-center justify-center h-full gap-4">
            <Loader2 className="w-12 h-12 text-red-600 animate-spin" />
            <div className="text-xl text-white font-medium">
              Loading studio...
            </div>
            <div className="text-sm text-gray-400">
              Preparing your video editor
            </div>
          </div>
        ) : !project ? (
          <div className="flex flex-col items-center justify-center h-full gap-4">
            <AlertCircle className="w-16 h-16 text-red-500" />
            <div className="text-xl text-white font-medium">
              Project not found
            </div>
            <div className="text-sm text-gray-400">
              Unable to load the project
            </div>
          </div>
        ) : (
          <div className="flex flex-1 overflow-hidden">
            {/* LEFT SIDEBAR */}
            <LeftSidebar
              activeSection={activeSection}
              onSectionChange={setActiveSection}
              project={project}
              onUpdate={updateProject}
            />

            {/* CENTER PANEL */}
            <CenterPanel
              project={project}
              videoRef={videoRef}
              renderLoading={renderLoading}
              renderProgress={renderProgress}
              renderStage={renderStage}
              onRenderPreview={handleRenderPreview}
              onRenderFinal={handleRenderFinal}
              isPlaying={isPlaying}
              currentTime={currentTime}
              duration={duration}
              volume={volume}
              isMuted={isMuted}
              playbackSpeed={playbackSpeed}
              timelineZoom={timelineZoom}
              onTogglePlayPause={togglePlayPause}
              onSeek={handleSeek}
              onVolumeChange={handleVolumeChange}
              onToggleMute={toggleMute}
              onSpeedChange={handleSpeedChange}
              onZoomChange={setTimelineZoom}
              onToggleFullscreen={toggleFullscreen}
              formatTime={formatTime}
            />

            {/* RIGHT PANEL */}
            <RightPanel project={project} onUpdate={updateProject} />
          </div>
        )}
      </div>
    </div>
  );
}

/* ==================== LEFT SIDEBAR ==================== */

interface LeftSidebarProps {
  activeSection: Section;
  onSectionChange: (section: Section) => void;
  project: Project;
  onUpdate: (updates: Partial<Project>) => void;
}

function LeftSidebar({
  activeSection,
  onSectionChange,
  project,
  onUpdate,
}: LeftSidebarProps) {
  const sections: { id: Section; label: string; icon: any }[] = [
    { id: "slideshow", label: "Slideshow", icon: Film },
    { id: "banner", label: "Bottom Banner", icon: MessageSquare },
    { id: "endscreen", label: "End Screen", icon: Square },
    { id: "qr", label: "QR Code", icon: QrCode },
    { id: "music", label: "Music", icon: Music2 },
    { id: "voice", label: "Voice", icon: Mic },
  ];

  return (
    <div className="w-80 bg-gradient-to-b from-gray-800 to-gray-900 border-r border-gray-700/50 flex flex-col overflow-hidden shadow-2xl">
      {/* Scrollable container for all sections */}
      <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent">
        {sections.map((section) => {
          const Icon = section.icon;
          const isActive = activeSection === section.id;
          return (
            <div key={section.id} className="border-b border-gray-700/30">
              {/* Section Tab - Always visible */}
              <button
                onClick={() =>
                  onSectionChange(isActive ? (null as any) : section.id)
                }
                className={`w-full relative px-6 py-4 text-left font-medium transition-all duration-200 flex items-center gap-3 group ${
                  isActive
                    ? "bg-gradient-to-r from-red-600 to-red-700 text-white shadow-lg"
                    : "text-gray-300 hover:bg-gray-700/50 hover:text-white"
                }`}
              >
                {isActive && (
                  <div className="absolute left-0 top-0 bottom-0 w-1 bg-white rounded-r-full" />
                )}
                <Icon
                  className={`w-5 h-5 transition-transform duration-200 ${
                    isActive ? "scale-110" : "group-hover:scale-110"
                  }`}
                />
                <span>{section.label}</span>
                <ChevronRight
                  className={`w-4 h-4 ml-auto transition-transform duration-200 ${
                    isActive ? "rotate-90" : ""
                  }`}
                />
              </button>

              {/* Section Content - Shows directly below when active */}
              {isActive && (
                <div className="p-6 bg-gray-800/50 animate-in slide-in-from-top duration-200">
                  {section.id === "slideshow" && (
                    <SlideshowControls project={project} onUpdate={onUpdate} />
                  )}
                  {section.id === "banner" && (
                    <BannerControls project={project} onUpdate={onUpdate} />
                  )}
                  {section.id === "endscreen" && (
                    <EndScreenControls project={project} onUpdate={onUpdate} />
                  )}
                  {section.id === "qr" && (
                    <QRControls project={project} onUpdate={onUpdate} />
                  )}
                  {section.id === "music" && (
                    <MusicControls project={project} onUpdate={onUpdate} />
                  )}
                  {section.id === "voice" && (
                    <VoiceControls project={project} onUpdate={onUpdate} />
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ==================== SLIDESHOW CONTROLS ==================== */

interface ControlProps {
  project: Project;
  onUpdate: (updates: Partial<Project>) => void;
}

function SlideshowControls({ project, onUpdate }: ControlProps) {
  const [showGallery, setShowGallery] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [replacingSlideIndex, setReplacingSlideIndex] = useState<number | null>(
    null
  );

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("projectId", project.projectId);

      const response = await fetch("/api/studio/assets/upload-image", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();
      if (data.success) {
        // Find the end screen slide and insert before it
        const endScreenIndex = project.slides.findIndex((s) => s.isEndScreen);
        const slidesWithoutEnd =
          endScreenIndex >= 0
            ? project.slides.slice(0, endScreenIndex)
            : project.slides;
        const endScreenSlide =
          endScreenIndex >= 0 ? project.slides[endScreenIndex] : null;

        // Calculate start time for new slide
        const newStartTime =
          slidesWithoutEnd.length > 0
            ? slidesWithoutEnd[slidesWithoutEnd.length - 1].endTime
            : 0;

        const newSlide: Slide = {
          id: `slide-${Date.now()}`,
          imageUrl: data.url,
          startTime: newStartTime,
          endTime: newStartTime + 3,
          transition: "fade",
        };

        // Build updated slides array
        const updatedSlides = [...slidesWithoutEnd, newSlide];

        // If there's an end screen, adjust its timing while preserving duration
        if (endScreenSlide) {
          const endScreenDuration =
            endScreenSlide.endTime - endScreenSlide.startTime;
          const newEndScreenStart = newStartTime + 3;
          updatedSlides.push({
            ...endScreenSlide,
            startTime: newEndScreenStart,
            endTime: newEndScreenStart + endScreenDuration,
          });
        }

        onUpdate({ slides: updatedSlides });
        alert("Image uploaded successfully!");
      }
    } catch (err) {
      console.error("Upload failed:", err);
      alert("Failed to upload image");
    } finally {
      setUploading(false);
    }
  };

  const handleSelectFromGallery = (imageUrl: string) => {
    if (replacingSlideIndex !== null) {
      // Replace existing slide's image
      const updatedSlides = project.slides.map((slide, idx) =>
        idx === replacingSlideIndex ? { ...slide, imageUrl } : slide
      );
      onUpdate({ slides: updatedSlides });
      setReplacingSlideIndex(null);
      setShowGallery(false);
      return;
    }

    // Add new slide
    const endScreenIndex = project.slides.findIndex((s) => s.isEndScreen);
    const slidesWithoutEnd =
      endScreenIndex >= 0
        ? project.slides.slice(0, endScreenIndex)
        : project.slides;
    const endScreenSlide =
      endScreenIndex >= 0 ? project.slides[endScreenIndex] : null;

    // Calculate start time for new slide
    const newStartTime =
      slidesWithoutEnd.length > 0
        ? slidesWithoutEnd[slidesWithoutEnd.length - 1].endTime
        : 0;

    const newSlide: Slide = {
      id: `slide-${Date.now()}`,
      imageUrl,
      startTime: newStartTime,
      endTime: newStartTime + 3,
      transition: "fade",
    };

    // Build updated slides array
    const updatedSlides = [...slidesWithoutEnd, newSlide];

    // If there's an end screen, adjust its timing while preserving duration
    if (endScreenSlide) {
      const endScreenDuration =
        endScreenSlide.endTime - endScreenSlide.startTime;
      const newEndScreenStart = newStartTime + 3;
      updatedSlides.push({
        ...endScreenSlide,
        startTime: newEndScreenStart,
        endTime: newEndScreenStart + endScreenDuration,
      });
    }

    onUpdate({ slides: updatedSlides });
    setShowGallery(false);
  };

  const moveSlideUp = (index: number) => {
    if (index === 0 || project.slides[index].isEndScreen) return;
    const newSlides = [...project.slides];
    [newSlides[index - 1], newSlides[index]] = [
      newSlides[index],
      newSlides[index - 1],
    ];

    // Recalculate timings
    recalculateTimings(newSlides);
    onUpdate({ slides: newSlides });
  };

  const moveSlideDown = (index: number) => {
    const lastNonEndScreenIndex =
      project.slides.findIndex((s) => s.isEndScreen) - 1;
    const maxIndex =
      lastNonEndScreenIndex >= 0
        ? lastNonEndScreenIndex
        : project.slides.length - 1;

    if (index >= maxIndex || project.slides[index].isEndScreen) return;
    const newSlides = [...project.slides];
    [newSlides[index], newSlides[index + 1]] = [
      newSlides[index + 1],
      newSlides[index],
    ];

    // Recalculate timings
    recalculateTimings(newSlides);
    onUpdate({ slides: newSlides });
  };

  const deleteSlide = (index: number) => {
    if (project.slides[index].isEndScreen) return; // Don't delete end screen via this method
    const newSlides = project.slides.filter((_, idx) => idx !== index);

    // Recalculate timings
    recalculateTimings(newSlides);
    onUpdate({ slides: newSlides });
  };

  const recalculateTimings = (slides: Slide[]) => {
    let currentTime = 0;
    slides.forEach((slide) => {
      const duration = slide.endTime - slide.startTime;
      slide.startTime = currentTime;
      slide.endTime = currentTime + duration;
      currentTime += duration;
    });
  };

  const totalDuration = project.slides.reduce(
    (sum, s) => sum + (s.endTime - s.startTime),
    0
  );

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-left duration-300">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 bg-red-600/20 rounded-lg">
          <Film className="w-6 h-6 text-red-500" />
        </div>
        <h3 className="text-xl font-bold text-white">Slideshow Settings</h3>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-gray-700/50 rounded-lg p-3 border border-gray-700/50">
          <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">
            Total Slides
          </div>
          <div className="text-2xl font-bold text-white">
            {project.slides.length}
          </div>
        </div>
        <div className="bg-gray-700/50 rounded-lg p-3 border border-gray-700/50">
          <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">
            Duration
          </div>
          <div className="text-2xl font-bold text-white">
            {totalDuration.toFixed(1)}s
          </div>
        </div>
      </div>

      {/* Upload and Select Buttons */}
      <div className="flex gap-3">
        <label className="flex-1 px-3 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg cursor-pointer text-center transition-colors font-medium text-sm">
          {uploading ? "⏳ Uploading..." : "📤 Upload Custom Image"}
          <input
            type="file"
            accept="image/*"
            onChange={handleFileUpload}
            disabled={uploading}
            className="hidden"
            aria-label="Upload custom image for slideshow"
          />
        </label>

        <button
          onClick={() => setShowGallery(!showGallery)}
          className="flex-1 px-3 py-2 bg-green-600 hover:bg-green-700 rounded-lg transition-colors font-medium text-sm"
        >
          🖼️ Select from Scraped Images
        </button>
      </div>

      {/* Image Gallery */}
      {showGallery && (
        <div className="border border-gray-600 rounded-lg p-3 max-h-96 overflow-y-auto bg-gray-800/50">
          <div className="flex justify-between items-center mb-3">
            <div>
              <h4 className="text-sm font-semibold text-white">
                {replacingSlideIndex !== null
                  ? `Replace Slide #${replacingSlideIndex + 1}`
                  : "Image Gallery"}
              </h4>
              {replacingSlideIndex !== null && (
                <p className="text-xs text-gray-400 mt-1">Select a new image</p>
              )}
            </div>
            <button
              onClick={() => {
                setShowGallery(false);
                setReplacingSlideIndex(null);
              }}
              className="text-gray-400 hover:text-white"
              aria-label="Close gallery"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {project.sourceImages.map((img, idx) => (
              <div
                key={idx}
                onClick={() => handleSelectFromGallery(img.url)}
                className="relative cursor-pointer group aspect-square rounded-lg overflow-hidden border-2 border-gray-700 hover:border-red-600 transition-all"
              >
                <img
                  src={img.url}
                  alt={`Gallery image ${idx + 1}`}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    // Hide broken images in gallery
                    e.currentTarget.style.display = "none";
                    const parent = e.currentTarget.parentElement;
                    if (parent) {
                      parent.style.display = "none";
                    }
                  }}
                />
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <span className="text-white text-sm font-medium">
                    Click to Add
                  </span>
                </div>
                <div className="absolute top-2 right-2 bg-black/70 text-white text-xs px-2 py-1 rounded">
                  {img.typeGuess}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Slides List */}
      <div className="space-y-3">
        <h4 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">
          Slides ({project.slides.filter((s) => !s.isEndScreen).length})
        </h4>
        {project.slides
          .filter((s) => !s.isEndScreen)
          .map((slide, index) => (
            <div
              key={index}
              className="bg-gradient-to-br from-gray-700 to-gray-800 rounded-xl p-4 space-y-3 hover:shadow-lg hover:shadow-red-600/10 transition-all duration-200 border border-gray-700/50 hover:border-red-600/30"
            >
              <div className="flex items-center gap-3">
                <div className="relative group">
                  <img
                    src={slide.imageUrl}
                    alt=""
                    className="w-16 h-16 object-cover rounded-lg shadow-md group-hover:shadow-red-600/50 transition-shadow duration-200"
                    onError={(e) => {
                      // Fallback to placeholder on error
                      e.currentTarget.src =
                        'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"%3E%3Crect fill="%23374151" width="100" height="100"/%3E%3Ctext x="50" y="50" text-anchor="middle" dy=".3em" fill="%23fff" font-size="12"%3ENo Image%3C/text%3E%3C/svg%3E';
                      e.currentTarget.onerror = null; // Prevent infinite loop
                    }}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-white font-medium flex items-center gap-2">
                    <span className="bg-red-600/20 text-red-400 text-xs px-2 py-1 rounded-full font-bold">
                      #{index + 1}
                    </span>
                    <span className="truncate">Slide {index + 1}</span>
                    <span className="text-xs text-gray-400">
                      ({(slide.endTime - slide.startTime).toFixed(1)}s)
                    </span>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setReplacingSlideIndex(index);
                    setShowGallery(true);
                  }}
                  className="flex-1 px-3 py-2 bg-blue-600/20 hover:bg-blue-600/40 text-blue-400 rounded-lg transition-colors text-sm font-medium border border-blue-600/30"
                  title="Replace image"
                >
                  🔄 Replace
                </button>
                <button
                  onClick={() => moveSlideUp(index)}
                  disabled={index === 0}
                  className="px-3 py-2 bg-gray-600/20 hover:bg-gray-600/40 text-gray-300 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed text-sm font-medium border border-gray-600/30"
                  title="Move up"
                >
                  ↑
                </button>
                <button
                  onClick={() => moveSlideDown(index)}
                  disabled={
                    index ===
                    project.slides.filter((s) => !s.isEndScreen).length - 1
                  }
                  className="px-3 py-2 bg-gray-600/20 hover:bg-gray-600/40 text-gray-300 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed text-sm font-medium border border-gray-600/30"
                  title="Move down"
                >
                  ↓
                </button>
                <button
                  onClick={() => {
                    if (confirm("Delete this slide?")) deleteSlide(index);
                  }}
                  className="px-3 py-2 bg-red-600/20 hover:bg-red-600/40 text-red-400 rounded-lg transition-colors text-sm font-medium border border-red-600/30"
                  title="Delete slide"
                >
                  🗑️
                </button>
              </div>
            </div>
          ))}
      </div>

      <p className="text-sm text-gray-400 p-3 bg-gray-800/30 rounded-lg border border-gray-700/30">
        💡 Upload custom images or select from scraped images, then adjust
        timing in the timeline panel →
      </p>
    </div>
  );
}

/* ==================== BANNER CONTROLS ==================== */

function BannerControls({ project, onUpdate }: ControlProps) {
  const [uploading, setUploading] = useState(false);

  const updateBanner = (updates: Partial<BottomBanner>) => {
    onUpdate({
      bottomBanner: { ...project.bottomBanner, ...updates },
    });
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("projectId", project.projectId);

      const response = await fetch("/api/studio/assets/upload-image", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();
      if (data.success) {
        updateBanner({ logoUrl: data.url });
        alert("Logo uploaded successfully!");
      }
    } catch (err) {
      console.error("Upload failed:", err);
      alert("Failed to upload logo");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-left duration-300">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 bg-blue-600/20 rounded-lg">
          <MessageSquare className="w-6 h-6 text-blue-500" />
        </div>
        <h3 className="text-xl font-bold text-white">Bottom Banner</h3>
      </div>

      {/* Enable Toggle */}
      <label className="flex items-center gap-3 cursor-pointer p-4 bg-gray-700/50 rounded-xl hover:bg-gray-700 transition-colors border border-gray-700/50">
        <input
          type="checkbox"
          checked={project.bottomBanner.enabled}
          onChange={(e) => updateBanner({ enabled: e.target.checked })}
          className="w-5 h-5 accent-red-600 cursor-pointer"
        />
        <span className="text-white font-medium">Enable Bottom Banner</span>
      </label>

      {project.bottomBanner.enabled && (
        <div className="space-y-5 animate-in fade-in slide-in-from-top duration-300">
          {/* Banner Text */}
          <div>
            <label className="block text-sm font-semibold text-gray-400 mb-2 uppercase tracking-wide">
              Banner Text
            </label>
            <input
              type="text"
              value={project.bottomBanner.text}
              onChange={(e) => updateBanner({ text: e.target.value })}
              className="w-full px-4 py-3 bg-gray-700/50 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-red-600 focus:bg-gray-700 transition-all border border-gray-700/50"
              placeholder="Enter banner text..."
              aria-label="Banner text content"
            />
          </div>

          {/* Logo Upload */}
          <div>
            <label className="block text-sm font-semibold text-gray-400 mb-2 uppercase tracking-wide">
              Logo (Optional)
            </label>
            <label className="block w-full px-4 py-3 bg-purple-600 hover:bg-purple-700 rounded-lg cursor-pointer text-center transition-colors font-medium">
              {uploading ? "⏳ Uploading..." : "🖼️ Upload Logo"}
              <input
                type="file"
                accept="image/*"
                onChange={handleLogoUpload}
                disabled={uploading}
                className="hidden"
              />
            </label>
            {project.bottomBanner.logoUrl && (
              <div className="mt-2 p-2 bg-gray-700/30 rounded border border-gray-700/50">
                <img
                  src={project.bottomBanner.logoUrl}
                  alt="Logo"
                  className="w-16 h-16 object-contain mx-auto"
                />
                <p className="text-xs text-gray-400 text-center mt-1">
                  Current Logo
                </p>
              </div>
            )}
          </div>

          {/* Font Size */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="text-sm font-semibold text-gray-400 uppercase tracking-wide">
                Font Size
              </label>
              <span className="text-red-500 font-bold">
                {project.bottomBanner.fontSize}px
              </span>
            </div>
            <input
              type="range"
              min="16"
              max="72"
              value={project.bottomBanner.fontSize}
              onChange={(e) =>
                updateBanner({ fontSize: parseInt(e.target.value) })
              }
              className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-red-600"
              aria-label="Banner font size in pixels"
            />
          </div>

          {/* Color Pickers */}
          <div className="grid grid-cols-2 gap-4">
            {/* Background Color */}
            <div>
              <label className="block text-sm font-semibold text-gray-400 mb-2 uppercase tracking-wide">
                Background
              </label>
              <div className="relative group">
                <input
                  type="color"
                  value={project.bottomBanner.backgroundColor}
                  onChange={(e) =>
                    updateBanner({ backgroundColor: e.target.value })
                  }
                  className="w-full h-12 rounded-lg cursor-pointer border-2 border-gray-700 hover:border-red-600 transition-colors"
                  aria-label="Banner background color"
                  title="Banner background color"
                />
                <div className="absolute inset-0 rounded-lg ring-2 ring-transparent group-hover:ring-red-600/50 transition-all pointer-events-none" />
              </div>
            </div>

            {/* Text Color */}
            <div>
              <label className="block text-sm font-semibold text-gray-400 mb-2 uppercase tracking-wide">
                Text Color
              </label>
              <div className="relative group">
                <input
                  type="color"
                  value={project.bottomBanner.textColor}
                  onChange={(e) => updateBanner({ textColor: e.target.value })}
                  className="w-full h-12 rounded-lg cursor-pointer border-2 border-gray-700 hover:border-red-600 transition-colors"
                  aria-label="Banner text color"
                  title="Banner text color"
                />
                <div className="absolute inset-0 rounded-lg ring-2 ring-transparent group-hover:ring-red-600/50 transition-all pointer-events-none" />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ==================== END SCREEN CONTROLS ==================== */

function EndScreenControls({ project, onUpdate }: ControlProps) {
  const [uploading, setUploading] = useState(false);

  const updateEndScreen = (updates: Partial<EndScreen>) => {
    const newEndScreen = { ...project.endScreen, ...updates };

    // Handle adding/removing end screen slide when enabled state changes
    let updatedSlides = project.slides;

    if ("enabled" in updates) {
      // Find if there's already an end screen slide
      const endScreenSlideIndex = project.slides.findIndex(
        (s) => s.isEndScreen
      );

      if (updates.enabled && endScreenSlideIndex === -1) {
        // Add end screen slide
        const regularSlides = project.slides.filter((s) => !s.isEndScreen);
        const lastSlide = regularSlides[regularSlides.length - 1];
        const endScreenStartTime = lastSlide ? lastSlide.endTime : 0;

        const endScreenSlide: Slide = {
          id: "end-screen",
          imageUrl: "", // Blank - will be rendered with end screen content
          startTime: endScreenStartTime,
          endTime: endScreenStartTime + (newEndScreen.duration || 3),
          transition: "fade",
          isEndScreen: true,
        };

        updatedSlides = [...regularSlides, endScreenSlide];
      } else if (!updates.enabled && endScreenSlideIndex !== -1) {
        // Remove end screen slide
        updatedSlides = project.slides.filter((s) => !s.isEndScreen);
      }
    }

    onUpdate({
      endScreen: newEndScreen,
      slides: updatedSlides,
    });
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("projectId", project.projectId);

      const response = await fetch("/api/studio/assets/upload-image", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();
      if (data.success) {
        updateEndScreen({ logoUrl: data.url });
        alert("Logo uploaded successfully!");
      }
    } catch (err) {
      console.error("Upload failed:", err);
      alert("Failed to upload logo");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-left duration-300">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 bg-purple-600/20 rounded-lg">
          <Square className="w-6 h-6 text-purple-500" />
        </div>
        <h3 className="text-xl font-bold text-white">End Screen</h3>
      </div>

      {/* Enable Toggle */}
      <label className="flex items-center gap-3 cursor-pointer p-4 bg-gray-700/50 rounded-xl hover:bg-gray-700 transition-colors border border-gray-700/50">
        <input
          type="checkbox"
          checked={project.endScreen.enabled}
          onChange={(e) => updateEndScreen({ enabled: e.target.checked })}
          className="w-5 h-5 accent-red-600 cursor-pointer"
        />
        <span className="text-white font-medium">Enable End Screen</span>
      </label>

      {project.endScreen.enabled && (
        <div className="space-y-5 animate-in fade-in slide-in-from-top duration-300">
          {/* Logo Upload */}
          <div>
            <label className="block text-sm font-semibold text-gray-400 mb-2 uppercase tracking-wide">
              Logo (Optional)
            </label>
            <label className="block w-full px-4 py-3 bg-purple-600 hover:bg-purple-700 rounded-lg cursor-pointer text-center transition-colors font-medium">
              {uploading ? "⏳ Uploading..." : "🖼️ Upload Logo"}
              <input
                type="file"
                accept="image/*"
                onChange={handleLogoUpload}
                disabled={uploading}
                className="hidden"
              />
            </label>
            {project.endScreen.logoUrl && (
              <div className="mt-2 p-2 bg-gray-700/30 rounded border border-gray-700/50">
                <img
                  src={project.endScreen.logoUrl}
                  alt="Logo"
                  className="w-16 h-16 object-contain mx-auto"
                />
                <p className="text-xs text-gray-400 text-center mt-1">
                  Current Logo
                </p>
              </div>
            )}
          </div>

          {/* Duration */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="text-sm font-semibold text-gray-400 uppercase tracking-wide">
                Duration
              </label>
              <span className="text-red-500 font-bold">
                {project.endScreen.duration}s
              </span>
            </div>
            <input
              type="range"
              min="1"
              max="10"
              step="0.5"
              value={project.endScreen.duration}
              onChange={(e) =>
                updateEndScreen({ duration: parseFloat(e.target.value) })
              }
              className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-red-600"
              aria-label="End screen duration in seconds"
            />
          </div>

          {/* Content */}
          <div>
            <label className="block text-sm font-semibold text-gray-400 mb-2 uppercase tracking-wide">
              Content
            </label>
            <textarea
              value={project.endScreen.content}
              onChange={(e) => updateEndScreen({ content: e.target.value })}
              className="w-full px-4 py-3 bg-gray-700/50 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-red-600 focus:bg-gray-700 transition-all border border-gray-700/50"
              placeholder="Enter end screen content..."
              rows={4}
              aria-label="End screen text content"
            />
          </div>

          {/* Color Pickers */}
          <div className="grid grid-cols-2 gap-4">
            {/* Background Color */}
            <div>
              <label className="block text-sm font-semibold text-gray-400 mb-2 uppercase tracking-wide">
                Background
              </label>
              <div className="relative group">
                <input
                  type="color"
                  value={project.endScreen.backgroundColor}
                  onChange={(e) =>
                    updateEndScreen({ backgroundColor: e.target.value })
                  }
                  className="w-full h-12 rounded-lg cursor-pointer border-2 border-gray-700 hover:border-red-600 transition-colors"
                  aria-label="End screen background color"
                  title="End screen background color"
                />
                <div className="absolute inset-0 rounded-lg ring-2 ring-transparent group-hover:ring-red-600/50 transition-all pointer-events-none" />
              </div>
            </div>

            {/* Text Color */}
            <div>
              <label className="block text-sm font-semibold text-gray-400 mb-2 uppercase tracking-wide">
                Text Color
              </label>
              <div className="relative group">
                <input
                  type="color"
                  value={project.endScreen.textColor}
                  onChange={(e) =>
                    updateEndScreen({ textColor: e.target.value })
                  }
                  className="w-full h-12 rounded-lg cursor-pointer border-2 border-gray-700 hover:border-red-600 transition-colors"
                  aria-label="End screen text color"
                  title="End screen text color"
                />
                <div className="absolute inset-0 rounded-lg ring-2 ring-transparent group-hover:ring-red-600/50 transition-all pointer-events-none" />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ==================== QR CODE CONTROLS ==================== */

function QRControls({ project, onUpdate }: ControlProps) {
  const updateQR = (updates: Partial<QRCode>) => {
    onUpdate({
      qrCode: { ...project.qrCode, ...updates },
    });
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-left duration-300">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 bg-green-600/20 rounded-lg">
          <QrCode className="w-6 h-6 text-green-500" />
        </div>
        <h3 className="text-xl font-bold text-white">QR Code</h3>
      </div>

      {/* Enable Toggle */}
      <label className="flex items-center gap-3 cursor-pointer p-4 bg-gray-700/50 rounded-xl hover:bg-gray-700 transition-colors border border-gray-700/50">
        <input
          type="checkbox"
          checked={project.qrCode.enabled}
          onChange={(e) => updateQR({ enabled: e.target.checked })}
          className="w-5 h-5 accent-red-600 cursor-pointer"
        />
        <span className="text-white font-medium">Enable QR Code</span>
      </label>

      {project.qrCode.enabled && (
        <div className="space-y-5 animate-in fade-in slide-in-from-top duration-300">
          {/* QR URL */}
          <div>
            <label className="block text-sm font-semibold text-gray-400 mb-2 uppercase tracking-wide">
              QR Code URL
            </label>
            <input
              type="url"
              value={project.qrCode.url}
              onChange={(e) => updateQR({ url: e.target.value })}
              className="w-full px-4 py-3 bg-gray-700/50 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-red-600 focus:bg-gray-700 transition-all border border-gray-700/50"
              placeholder="https://..."
              aria-label="QR code destination URL"
            />
          </div>

          {/* Position */}
          <div>
            <label className="block text-sm font-semibold text-gray-400 mb-2 uppercase tracking-wide">
              Position
            </label>
            <select
              value={project.qrCode.position}
              onChange={(e) => updateQR({ position: e.target.value as any })}
              className="w-full px-4 py-3 bg-gray-700/50 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-red-600 cursor-pointer transition-all border border-gray-700/50 hover:bg-gray-700"
              aria-label="QR Code Position"
            >
              <option value="bottom-right">Bottom Right</option>
              <option value="bottom-left">Bottom Left</option>
              <option value="top-right">Top Right</option>
              <option value="top-left">Top Left</option>
            </select>
          </div>

          {/* Size */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="text-sm font-semibold text-gray-400 uppercase tracking-wide">
                Size
              </label>
              <span className="text-red-500 font-bold">
                {project.qrCode.size}px
              </span>
            </div>
            <input
              type="range"
              min="64"
              max="256"
              step="8"
              value={project.qrCode.size}
              onChange={(e) => updateQR({ size: parseInt(e.target.value) })}
              className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-red-600"
              aria-label="QR code size in pixels"
            />
          </div>
        </div>
      )}
    </div>
  );
}

/* ==================== MUSIC CONTROLS ==================== */

function MusicControls({ project, onUpdate }: ControlProps) {
  const [uploading, setUploading] = useState(false);

  const updateMusic = (updates: Partial<Music>) => {
    onUpdate({
      music: { ...project.music, ...updates },
    });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("projectId", project.projectId);

      const response = await fetch("/api/studio/assets/upload-music", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();
      if (data.success) {
        updateMusic({
          fileName: data.filename,
          filePath: data.url,
          enabled: true,
        });
        alert("Music uploaded successfully!");
      }
    } catch (err) {
      console.error("Upload failed:", err);
      alert("Failed to upload music");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-left duration-300">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 bg-pink-600/20 rounded-lg">
          <Music2 className="w-6 h-6 text-pink-500" />
        </div>
        <h3 className="text-xl font-bold text-white">Background Music</h3>
      </div>

      {/* Enable Toggle */}
      <label className="flex items-center gap-3 cursor-pointer p-4 bg-gray-700/50 rounded-xl hover:bg-gray-700 transition-colors border border-gray-700/50">
        <input
          type="checkbox"
          checked={project.music.enabled}
          onChange={(e) => updateMusic({ enabled: e.target.checked })}
          className="w-5 h-5 accent-red-600 cursor-pointer"
        />
        <span className="text-white font-medium">Enable Background Music</span>
      </label>

      {/* Upload Music Button */}
      <div>
        <label className="block w-full px-4 py-3 bg-purple-600 hover:bg-purple-700 rounded-lg cursor-pointer text-center transition-colors font-medium">
          {uploading ? "⏳ Uploading..." : "🎵 Upload Music File"}
          <input
            type="file"
            accept="audio/*"
            onChange={handleFileUpload}
            disabled={uploading}
            className="hidden"
            aria-label="Upload background music file"
          />
        </label>
        {project.music.fileName && (
          <div className="mt-2 p-2 bg-gray-700/30 rounded border border-gray-700/50 text-sm text-gray-300">
            📁 {project.music.fileName}
          </div>
        )}
      </div>

      {project.music.enabled && (
        <div className="space-y-5 animate-in fade-in slide-in-from-top duration-300">
          {/* Volume */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="text-sm font-semibold text-gray-400 uppercase tracking-wide">
                Volume
              </label>
              <span className="text-red-500 font-bold">
                {project.music.volume}%
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              value={project.music.volume}
              onChange={(e) =>
                updateMusic({ volume: parseInt(e.target.value) })
              }
              className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-red-600"
              aria-label="Music volume percentage"
            />
          </div>

          {/* Loop */}
          <label className="flex items-center gap-3 cursor-pointer p-3 bg-gray-700/50 rounded-lg hover:bg-gray-700 transition-colors border border-gray-700/50">
            <input
              type="checkbox"
              checked={project.music.loop}
              onChange={(e) => updateMusic({ loop: e.target.checked })}
              className="w-4 h-4 accent-red-600 cursor-pointer"
            />
            <span className="text-sm text-white font-medium">Loop Music</span>
          </label>

          {/* Fade Controls */}
          <div className="grid grid-cols-2 gap-4">
            {/* Fade In */}
            <label className="flex items-center gap-3 cursor-pointer p-3 bg-gray-700/50 rounded-lg hover:bg-gray-700 transition-colors border border-gray-700/50">
              <input
                type="checkbox"
                checked={project.music.fadeIn}
                onChange={(e) => updateMusic({ fadeIn: e.target.checked })}
                className="w-4 h-4 accent-red-600 cursor-pointer"
              />
              <span className="text-sm text-white font-medium">Fade In</span>
            </label>

            {/* Fade Out */}
            <label className="flex items-center gap-3 cursor-pointer p-3 bg-gray-700/50 rounded-lg hover:bg-gray-700 transition-colors border border-gray-700/50">
              <input
                type="checkbox"
                checked={project.music.fadeOut}
                onChange={(e) => updateMusic({ fadeOut: e.target.checked })}
                className="w-4 h-4 accent-red-600 cursor-pointer"
              />
              <span className="text-sm text-white font-medium">Fade Out</span>
            </label>
          </div>

          {!project.music.fileName && (
            <p className="text-sm text-yellow-400 p-3 bg-yellow-900/20 rounded-lg border border-yellow-700/30">
              ⚠️ Upload music file above or default track will be used
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/* ==================== VOICE CONTROLS ==================== */

function VoiceControls({ project, onUpdate }: ControlProps) {
  const [voices, setVoices] = useState<any[]>([]);
  const [selectedVoice, setSelectedVoice] = useState("female");
  const [speedRate, setSpeedRate] = useState(1.0);
  const [generating, setGenerating] = useState(false);
  const [generatedAudioUrl, setGeneratedAudioUrl] = useState<string | null>(
    null
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const updateVoice = (updates: Partial<Voice>) => {
    onUpdate({
      voice: { ...project.voice, ...updates },
    });
  };

  // Load available voices on mount
  useEffect(() => {
    loadVoices();
  }, []);

  const loadVoices = async () => {
    try {
      const response = await fetch("/api/voice/voices");
      const data = await response.json();
      if (data.status === "ok" && data.voices) {
        setVoices(data.voices);
      }
    } catch (error) {
      console.error("Failed to load voices:", error);
    }
  };

  const handleGenerateVoiceover = async () => {
    if (!project.voice.script.trim()) {
      setErrorMessage("Please enter a script first");
      return;
    }

    setGenerating(true);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/voice/speaktor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: project.projectId,
          text: project.voice.script,
          voiceName: selectedVoice,
          speedRate: speedRate,
        }),
      });

      const data = await response.json();

      if (data.status === "ok" && data.audioUrlLocal) {
        setGeneratedAudioUrl(data.audioUrlLocal);

        // Get audio duration and adjust slides to match
        const audio = new Audio(data.audioUrlLocal);
        audio.addEventListener("loadedmetadata", () => {
          const audioDuration = audio.duration;
          console.log(`[Voice] Audio duration: ${audioDuration}s`);

          // Calculate total slides duration (excluding end screen)
          const endScreenIndex = project.slides.findIndex((s) => s.isEndScreen);
          const contentSlides =
            endScreenIndex >= 0
              ? project.slides.slice(0, endScreenIndex)
              : project.slides.filter((s) => !s.isEndScreen);
          const endScreenSlide =
            endScreenIndex >= 0 ? project.slides[endScreenIndex] : null;

          const currentContentDuration = contentSlides.reduce(
            (sum, s) => sum + (s.endTime - s.startTime),
            0
          );

          // If audio is longer than content, stretch content slides to match
          if (
            audioDuration > currentContentDuration &&
            contentSlides.length > 0
          ) {
            console.log(
              `[Voice] Adjusting slides from ${currentContentDuration}s to ${audioDuration}s`
            );

            // Distribute extra time evenly across all content slides
            const extraTime = audioDuration - currentContentDuration;
            const timePerSlide = extraTime / contentSlides.length;

            const adjustedSlides: Slide[] = [];
            let currentTime = 0;

            contentSlides.forEach((slide, index) => {
              const originalDuration = slide.endTime - slide.startTime;
              const newDuration = originalDuration + timePerSlide;

              adjustedSlides.push({
                ...slide,
                startTime: currentTime,
                endTime: currentTime + newDuration,
              });

              currentTime += newDuration;
            });

            // Adjust end screen if it exists
            if (endScreenSlide) {
              const endScreenDuration =
                endScreenSlide.endTime - endScreenSlide.startTime;
              adjustedSlides.push({
                ...endScreenSlide,
                startTime: currentTime,
                endTime: currentTime + endScreenDuration,
              });
            }

            // Update project with adjusted slides and audio path
            onUpdate({
              slides: adjustedSlides,
              voice: { ...project.voice, audioPath: data.audioUrlLocal },
            });
          } else {
            // Just update audio path without adjusting slides
            updateVoice({ audioPath: data.audioUrlLocal });
          }
        });

        setErrorMessage(null);
      } else {
        setErrorMessage(data.error || "Failed to generate voiceover");
      }
    } catch (error: any) {
      console.error("Voice generation error:", error);
      setErrorMessage(error.message || "Network error occurred");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-left duration-300">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 bg-yellow-600/20 rounded-lg">
          <Mic className="w-6 h-6 text-yellow-500" />
        </div>
        <h3 className="text-xl font-bold text-white">
          Voice Narration (Piper TTS)
        </h3>
      </div>

      {/* Enable Toggle */}
      <label className="flex items-center gap-3 cursor-pointer p-4 bg-gray-700/50 rounded-xl hover:bg-gray-700 transition-colors border border-gray-700/50">
        <input
          type="checkbox"
          checked={project.voice.enabled}
          onChange={(e) => updateVoice({ enabled: e.target.checked })}
          className="w-5 h-5 accent-red-600 cursor-pointer"
        />
        <span className="text-white font-medium">Enable Voice Narration</span>
      </label>

      {project.voice.enabled && (
        <div className="space-y-5 animate-in fade-in slide-in-from-top duration-300">
          {/* Voice Script */}
          <div>
            <label className="block text-sm font-semibold text-gray-400 mb-2 uppercase tracking-wide">
              Script ({project.voice.script.length} characters)
            </label>
            <textarea
              value={project.voice.script}
              onChange={(e) => updateVoice({ script: e.target.value })}
              className="w-full px-4 py-3 bg-gray-700/50 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-red-600 focus:bg-gray-700 transition-all border border-gray-700/50"
              placeholder="Enter voice narration script..."
              rows={4}
              aria-label="Voice narration script text"
            />
          </div>

          {/* Voice Model Selection */}
          <div>
            <label className="block text-sm font-semibold text-gray-400 mb-2 uppercase tracking-wide">
              Voice Model
            </label>
            {voices.length > 0 ? (
              <select
                value={selectedVoice}
                onChange={(e) => setSelectedVoice(e.target.value)}
                className="w-full px-4 py-3 bg-gray-700/50 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-red-600 cursor-pointer transition-all border border-gray-700/50 hover:bg-gray-700"
                aria-label="Voice Model"
              >
                {voices.map((voice) => (
                  <option key={voice.id} value={voice.id}>
                    {voice.name} - {voice.description}
                  </option>
                ))}
              </select>
            ) : (
              <select
                value={selectedVoice}
                onChange={(e) => setSelectedVoice(e.target.value)}
                className="w-full px-4 py-3 bg-gray-700/50 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-red-600 cursor-pointer transition-all border border-gray-700/50 hover:bg-gray-700"
                aria-label="Voice Model"
              >
                <option value="male">👨 Male (Ryan - US)</option>
                <option value="female">👩 Female (Amy - US)</option>
                <option value="british-male">👨 Male (Northern - UK)</option>
                <option value="british-female">👩 Female (Alba - UK)</option>
              </select>
            )}
          </div>

          {/* Speed Control */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="text-sm font-semibold text-gray-400 uppercase tracking-wide">
                Speech Speed
              </label>
              <span className="text-red-500 font-bold">
                {speedRate.toFixed(1)}x
              </span>
            </div>
            <input
              type="range"
              min="0.8"
              max="1.5"
              step="0.1"
              placeholder="Speed Rate"
              value={speedRate}
              onChange={(e) => setSpeedRate(parseFloat(e.target.value))}
              className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-red-600"
            />
            <div className="flex justify-between text-xs text-gray-500 mt-1">
              <span>Slow</span>
              <span>Normal</span>
              <span>Fast</span>
            </div>
          </div>

          {/* Generate Button */}
          <button
            onClick={handleGenerateVoiceover}
            disabled={generating || !project.voice.script.trim()}
            className="w-full py-3 bg-gradient-to-r from-yellow-600 to-yellow-700 hover:from-yellow-500 hover:to-yellow-600 disabled:from-gray-600 disabled:to-gray-700 text-white font-bold rounded-lg transition-all shadow-lg hover:shadow-yellow-500/20 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {generating ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Mic className="w-5 h-5" />
                Generate Voiceover
              </>
            )}
          </button>

          {/* Error Message */}
          {errorMessage && (
            <div className="p-4 bg-red-900/30 border border-red-700/50 rounded-lg flex items-start gap-3 animate-in fade-in slide-in-from-top duration-300">
              <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <div className="text-red-400 text-sm font-medium">
                  {errorMessage}
                </div>
              </div>
            </div>
          )}

          {/* Success + Audio Player */}
          {generatedAudioUrl && !errorMessage && (
            <div className="p-4 bg-green-900/30 border border-green-700/50 rounded-lg space-y-3 animate-in fade-in slide-in-from-top duration-300">
              <div className="flex items-center gap-2 text-green-400">
                <CheckCircle2 className="w-5 h-5" />
                <span className="font-medium">
                  Voiceover generated successfully!
                </span>
              </div>
              <audio
                src={generatedAudioUrl}
                controls
                className="w-full bg-gray-800/50 rounded-lg"
              />
              <p className="text-xs text-gray-400">
                This voiceover will be included in your video render
              </p>
            </div>
          )}

          {/* Volume */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="text-sm font-semibold text-gray-400 uppercase tracking-wide">
                Volume
              </label>
              <span className="text-red-500 font-bold">
                {project.voice.volume}%
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="200"
              placeholder="Volume"
              value={project.voice.volume}
              onChange={(e) =>
                updateVoice({ volume: parseInt(e.target.value) })
              }
              className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-red-600"
            />
          </div>
        </div>
      )}
    </div>
  );
}

/* ==================== CENTER PANEL ==================== */

interface CenterPanelProps {
  project: Project;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  renderLoading: boolean;
  renderProgress: number;
  renderStage: string;
  onRenderPreview: () => void;
  onRenderFinal: () => void;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  isMuted: boolean;
  playbackSpeed: number;
  timelineZoom: number;
  onTogglePlayPause: () => void;
  onSeek: (time: number) => void;
  onVolumeChange: (volume: number) => void;
  onToggleMute: () => void;
  onSpeedChange: (speed: number) => void;
  onZoomChange: (zoom: number) => void;
  onToggleFullscreen: () => void;
  formatTime: (seconds: number) => string;
}

function CenterPanel({
  project,
  videoRef,
  renderLoading,
  renderProgress,
  renderStage,
  onRenderPreview,
  onRenderFinal,
  isPlaying,
  currentTime,
  duration,
  volume,
  isMuted,
  playbackSpeed,
  timelineZoom,
  onTogglePlayPause,
  onSeek,
  onVolumeChange,
  onToggleMute,
  onSpeedChange,
  onZoomChange,
  onToggleFullscreen,
  formatTime,
}: CenterPanelProps) {
  return (
    <div className="flex-1 flex flex-col bg-gradient-to-br from-black via-gray-950 to-black overflow-hidden">
      {/* Video Preview */}
      <div className="flex-1 flex items-center justify-center p-4 min-h-0">
        {project.previewVideoUrl ? (
          <div className="relative w-full h-full flex items-center justify-center">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-red-600 to-purple-600 rounded-xl opacity-10 blur-2xl pointer-events-none" />
            <video
              ref={videoRef}
              src={project.previewVideoUrl}
              className="relative z-10 max-w-full max-h-full rounded-xl shadow-2xl border border-gray-800/50 [max-height:calc(100vh-400px)]"
              preload="metadata"
              playsInline
            />
          </div>
        ) : (
          <div className="text-center animate-in fade-in slide-in-from-bottom duration-500">
            <div className="inline-block p-6 bg-gray-800/30 rounded-full mb-6 border border-gray-700/30">
              <Film className="w-20 h-20 text-gray-600" />
            </div>
            <div className="text-2xl font-bold text-white mb-2">
              No preview yet
            </div>
            <div className="text-gray-400">
              Render a preview to see your video
            </div>
          </div>
        )}
      </div>

      {/* Professional Video Controls */}
      {project.previewVideoUrl && (
        <div className="bg-gradient-to-b from-gray-900 to-gray-950 border-t border-gray-800/50 p-4 space-y-3">
          {/* Timeline Scrubber */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-gray-400 font-mono">
              <span className="text-white font-semibold">
                {formatTime(currentTime)}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() =>
                    onZoomChange(Math.max(0.5, timelineZoom - 0.5))
                  }
                  className="p-1 hover:bg-gray-700 rounded transition-colors"
                  title="Zoom Out"
                >
                  <ZoomOut className="w-3 h-3" />
                </button>
                <span className="text-gray-500">Zoom: {timelineZoom}x</span>
                <button
                  onClick={() => onZoomChange(Math.min(4, timelineZoom + 0.5))}
                  className="p-1 hover:bg-gray-700 rounded transition-colors"
                  title="Zoom In"
                >
                  <ZoomIn className="w-3 h-3" />
                </button>
              </div>
              <span className="text-white font-semibold">
                {formatTime(duration)}
              </span>
            </div>
            <div className="relative group">
              <input
                type="range"
                min="0"
                max={duration || 100}
                step="0.01"
                value={currentTime}
                onChange={(e) => onSeek(parseFloat(e.target.value))}
                className="w-full h-2 bg-gray-700 rounded-full appearance-none cursor-pointer accent-red-600 hover:accent-red-500 transition-colors"
                title="Video timeline scrubber"
                aria-label="Seek video timeline"
              />
            </div>
          </div>

          {/* Playback Controls */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {/* Play/Pause */}
              <button
                onClick={onTogglePlayPause}
                className="p-3 bg-red-600 hover:bg-red-700 rounded-lg transition-all duration-200 hover:scale-105 shadow-lg hover:shadow-red-600/50"
                title={isPlaying ? "Pause (K)" : "Play (K)"}
              >
                {isPlaying ? (
                  <Pause className="w-5 h-5" />
                ) : (
                  <Play className="w-5 h-5 ml-0.5" />
                )}
              </button>

              {/* Skip Backward */}
              <button
                onClick={() => onSeek(Math.max(0, currentTime - 10))}
                className="p-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
                title="-10s (J)"
              >
                <SkipBack className="w-4 h-4" />
              </button>

              {/* Skip Forward */}
              <button
                onClick={() => onSeek(Math.min(duration, currentTime + 10))}
                className="p-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
                title="+10s (L)"
              >
                <SkipForward className="w-4 h-4" />
              </button>

              {/* Playback Speed */}
              <div className="flex items-center gap-1 ml-2">
                {[0.5, 0.75, 1, 1.25, 1.5, 2].map((speed) => (
                  <button
                    key={speed}
                    onClick={() => onSpeedChange(speed)}
                    className={`px-2 py-1 rounded text-xs font-semibold transition-colors ${
                      playbackSpeed === speed
                        ? "bg-red-600 text-white"
                        : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                    }`}
                  >
                    {speed}x
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-3">
              {/* Volume Control */}
              <div className="flex items-center gap-2">
                <button
                  onClick={onToggleMute}
                  className="p-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
                  title="Mute (M)"
                >
                  {isMuted || volume === 0 ? (
                    <VolumeX className="w-4 h-4" />
                  ) : (
                    <Volume2 className="w-4 h-4" />
                  )}
                </button>
                <input
                  type="range"
                  min="0"
                  max="100"
                  placeholder="Volume"
                  value={isMuted ? 0 : volume}
                  onChange={(e) => onVolumeChange(parseInt(e.target.value))}
                  className="w-20 h-1 bg-gray-700 rounded-full appearance-none cursor-pointer accent-red-600"
                />
                <span className="text-xs text-gray-400 font-mono w-8">
                  {volume}%
                </span>
              </div>

              {/* Fullscreen */}
              <button
                onClick={onToggleFullscreen}
                className="p-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
                title="Fullscreen (F)"
              >
                <Maximize className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Render Controls */}
      <div className="border-t border-gray-700/50 bg-gradient-to-b from-gray-800 to-gray-900 p-6 shadow-2xl">
        <div className="flex items-center justify-center gap-4">
          <button
            onClick={onRenderPreview}
            disabled={renderLoading}
            className="group relative px-8 py-4 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 disabled:from-gray-600 disabled:to-gray-700 text-white font-bold rounded-xl transition-all duration-200 hover:shadow-lg hover:shadow-blue-600/50 disabled:shadow-none hover:scale-105 disabled:scale-100 disabled:cursor-not-allowed"
          >
            <div className="flex items-center gap-3">
              {renderLoading && renderProgress < 100 ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Rendering... {renderProgress}%</span>
                </>
              ) : (
                <>
                  <Play className="w-5 h-5 group-hover:scale-110 transition-transform" />
                  <span>Render Preview (720p)</span>
                </>
              )}
            </div>
          </button>

          <button
            onClick={onRenderFinal}
            disabled={renderLoading}
            className="group relative px-8 py-4 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 disabled:from-gray-600 disabled:to-gray-700 text-white font-bold rounded-xl transition-all duration-200 hover:shadow-lg hover:shadow-red-600/50 disabled:shadow-none hover:scale-105 disabled:scale-100 disabled:cursor-not-allowed"
          >
            <div className="flex items-center gap-3">
              <Download className="w-5 h-5 group-hover:scale-110 transition-transform" />
              <span>Render Final (1080p)</span>
            </div>
          </button>
        </div>

        {renderLoading && (
          <div className="mt-6 animate-in fade-in slide-in-from-bottom duration-300">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 text-sm text-gray-300">
                <Loader2 className="w-4 h-4 animate-spin text-red-500" />
                <span className="font-medium">{renderStage}</span>
              </div>
              <span className="text-sm font-bold text-red-500">
                {renderProgress}%
              </span>
            </div>
            <div className="h-3 bg-gray-700 rounded-full overflow-hidden shadow-inner">
              <div
                className="h-full bg-gradient-to-r from-red-600 via-red-500 to-red-600 bg-size-200 animate-gradient transition-all duration-300 shadow-lg"
                style={{ width: `${renderProgress}%` }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ==================== RIGHT PANEL ==================== */

interface RightPanelProps {
  project: Project;
  onUpdate: (updates: Partial<Project>) => void;
}

function RightPanel({ project, onUpdate }: RightPanelProps) {
  const updateSlideDuration = (index: number, duration: number) => {
    const slides = [...project.slides];
    const startTime = slides[index].startTime;
    slides[index] = { ...slides[index], endTime: startTime + duration };
    onUpdate({ slides });
  };

  const totalDuration =
    project.slides.reduce((sum, s) => sum + (s.endTime - s.startTime), 0) +
    (project.endScreen.enabled ? project.endScreen.duration : 0);

  return (
    <div className="w-80 bg-gradient-to-b from-gray-800 to-gray-900 border-l border-gray-700/50 flex flex-col overflow-hidden shadow-2xl">
      <div className="border-b border-gray-700/50 p-5 bg-gray-800/50">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-600/20 rounded-lg">
            <Clock className="w-5 h-5 text-indigo-500" />
          </div>
          <h3 className="text-lg font-bold text-white">Timeline</h3>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-5 scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent">
        {/* Slide Timeline */}
        <div>
          <h4 className="text-sm font-semibold text-gray-400 mb-3 uppercase tracking-wide flex items-center gap-2">
            <Film className="w-4 h-4" />
            Slide Durations
          </h4>
          <div className="space-y-3">
            {project.slides.map((slide, index) => (
              <div
                key={index}
                className="bg-gradient-to-br from-gray-700 to-gray-800 rounded-xl p-3 space-y-3 hover:shadow-lg hover:shadow-indigo-600/10 transition-all duration-200 border border-gray-700/50 group"
              >
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <img
                      src={slide.imageUrl}
                      alt=""
                      className="w-12 h-12 object-cover rounded-lg shadow-md group-hover:shadow-indigo-600/50 transition-shadow"
                    />
                    <div className="absolute -top-1 -right-1 w-5 h-5 bg-red-600 text-white text-xs font-bold rounded-full flex items-center justify-center">
                      {index + 1}
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-white font-medium">
                      Slide {index + 1}
                    </div>
                    <div className="text-xs text-gray-400 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {(slide.endTime - slide.startTime).toFixed(1)}s
                    </div>
                  </div>
                </div>
                <input
                  type="range"
                  min="1"
                  max="10"
                  step="0.5"
                  value={slide.endTime - slide.startTime}
                  onChange={(e) =>
                    updateSlideDuration(index, parseFloat(e.target.value))
                  }
                  className="w-full h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                  aria-label={`Duration for slide ${index + 1}`}
                  title={`Adjust duration for slide ${index + 1}`}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Track Summary */}
        <div className="border-t border-gray-700/50 pt-5">
          <h4 className="text-sm font-semibold text-gray-400 mb-3 uppercase tracking-wide flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4" />
            Active Tracks
          </h4>
          <div className="space-y-2">
            {project.bottomBanner.enabled && (
              <div className="flex items-center gap-3 text-sm text-gray-300 bg-blue-600/10 p-2 rounded-lg border border-blue-600/20">
                <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
                <MessageSquare className="w-4 h-4 text-blue-500" />
                <span>Bottom Banner</span>
              </div>
            )}
            {project.qrCode.enabled && (
              <div className="flex items-center gap-3 text-sm text-gray-300 bg-green-600/10 p-2 rounded-lg border border-green-600/20">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                <QrCode className="w-4 h-4 text-green-500" />
                <span>QR Code</span>
              </div>
            )}
            {project.music.enabled && (
              <div className="flex items-center gap-3 text-sm text-gray-300 bg-purple-600/10 p-2 rounded-lg border border-purple-600/20">
                <div className="w-2 h-2 bg-purple-500 rounded-full animate-pulse" />
                <Music2 className="w-4 h-4 text-purple-500" />
                <span>Background Music</span>
              </div>
            )}
            {project.voice.enabled && (
              <div className="flex items-center gap-3 text-sm text-gray-300 bg-yellow-600/10 p-2 rounded-lg border border-yellow-600/20">
                <div className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse" />
                <Mic className="w-4 h-4 text-yellow-500" />
                <span>Voice Narration</span>
              </div>
            )}
            {project.endScreen.enabled && (
              <div className="flex items-center gap-3 text-sm text-gray-300 bg-red-600/10 p-2 rounded-lg border border-red-600/20">
                <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                <Square className="w-4 h-4 text-red-500" />
                <span>End Screen</span>
              </div>
            )}
            {!project.bottomBanner.enabled &&
              !project.qrCode.enabled &&
              !project.music.enabled &&
              !project.voice.enabled &&
              !project.endScreen.enabled && (
                <div className="text-center py-4 text-gray-500 text-sm">
                  No additional tracks enabled
                </div>
              )}
          </div>
        </div>

        {/* Total Duration */}
        <div className="border-t border-gray-700/50 pt-5">
          <div className="bg-gradient-to-br from-indigo-600/20 to-purple-600/20 rounded-xl p-4 border border-indigo-600/30">
            <div className="text-sm text-gray-400 font-semibold uppercase tracking-wide mb-1">
              Total Duration
            </div>
            <div className="text-3xl font-bold text-white flex items-baseline gap-2">
              {totalDuration}
              <span className="text-lg text-gray-400">seconds</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
