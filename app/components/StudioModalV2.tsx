"use client";

/**
 * Studio Modal V2 - Professional Video Editor
 * Modern UI with left sidebar, center preview, and bottom timeline
 */

import { useEffect, useState, useRef } from "react";
import {
  X,
  Film,
  Square,
  QrCode,
  Music2,
  Mic,
  Play,
  Pause,
  Download,
  Loader2,
  Settings,
  Image as ImageIcon,
  Save,
  CheckCircle2,
  AlertCircle,
  MessageSquare,
  ChevronUp,
  ChevronDown,
  Trash2,
  Upload,
  RefreshCw,
  Volume2,
  VolumeX,
  Maximize,
  SkipBack,
  SkipForward,
  ZoomIn,
  ZoomOut,
  Clock,
  Keyboard,
  Sparkles,
} from "lucide-react";
import StudioModalPlus from "./StudioModalPlus";
import {
  Project,
  Slide,
  BottomBanner,
  QRCode,
  Music,
  Voice,
  EndScreen,
} from "@/studio/types";

type Section =
  | "slideshow"
  | "banner"
  | "endscreen"
  | "qr"
  | "music"
  | "voice"
  | "ai";

interface StudioModalV2Props {
  projectId: string;
  isOpen: boolean;
  onClose: () => void;
}

export default function StudioModalV2({
  projectId,
  isOpen,
  onClose,
}: StudioModalV2Props) {
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
  const [isSaving, setIsSaving] = useState(false);
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error" | "info";
  } | null>(null);
  const [volume, setVolume] = useState(100);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [timelineZoom, setTimelineZoom] = useState(1);
  const [showKeyboardShortcuts, setShowKeyboardShortcuts] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [isStudioPlusOpen, setIsStudioPlusOpen] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const saveInProgressRef = useRef<Promise<void> | null>(null);
  const saveDebounceTimer = useRef<NodeJS.Timeout | null>(null);
  const projectVersionRef = useRef(0);

  // Sidebar sections configuration
  const sidebarSections = [
    { id: "slideshow" as Section, label: "Slideshow", icon: Film },
    { id: "banner" as Section, label: "Bottom banner", icon: ImageIcon },
    { id: "endscreen" as Section, label: "End screen", icon: Square },
    { id: "qr" as Section, label: "QR code", icon: QrCode },
    { id: "music" as Section, label: "Music", icon: Music2 },
    { id: "voice" as Section, label: "Voice & Script", icon: Mic },
    { id: "ai" as Section, label: "AI Input Settings", icon: Settings },
  ];

  // Toast notification
  const showToast = (
    message: string,
    type: "success" | "error" | "info" = "info"
  ) => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // Helper: Generate config hash for change detection (matches server implementation)
  const generateConfigHash = (proj: Project): string => {
    const config = {
      slides: proj.slides.map((s) => ({
        url: s.imageUrl,
        start: s.startTime,
        end: s.endTime,
        transition: s.transition,
      })),
      banner: proj.bottomBanner?.enabled
        ? {
            text: proj.bottomBanner.text,
            logo: proj.bottomBanner.logoUrl,
            color: proj.bottomBanner.backgroundColor,
          }
        : null,
      qr: proj.qrCode?.enabled ? proj.qrCode.url : null,
      music: proj.music?.enabled ? proj.music.fileName : null,
      voice: proj.voice?.enabled ? proj.voice.script : null,
      endScreen: proj.endScreen?.enabled ? proj.endScreen.content : null,
    };

    // Fix Unicode issue: encode to UTF-8 bytes first, then base64
    const jsonString = JSON.stringify(config);
    const utf8Bytes = new TextEncoder().encode(jsonString);
    const binaryString = Array.from(utf8Bytes, (byte) =>
      String.fromCharCode(byte)
    ).join("");
    return btoa(binaryString).substring(0, 32);
  };

  // Load project
  const loadProject = async () => {
    try {
      const res = await fetch(`/api/studio/project/${projectId}`);
      if (!res.ok) throw new Error("Failed to load project");
      const data = await res.json();
      setProject(data);
      setDuration(data.slides?.length * 3 || 0); // 3 seconds per slide
    } catch (error: any) {
      showToast(error.message || "Failed to load project", "error");
    } finally {
      setLoading(false);
    }
  };

  // Save project
  const saveProject = async () => {
    await saveProjectToServer();
  };

  // Render preview
  const handleRenderPreview = async () => {
    // Cancel any pending debounced saves
    if (saveDebounceTimer.current) {
      clearTimeout(saveDebounceTimer.current);
      saveDebounceTimer.current = null;
    }

    // Wait for any in-progress saves to complete
    if (saveInProgressRef.current) {
      showToast("Waiting for save to complete...", "info");
      try {
        await saveInProgressRef.current;
      } catch (err) {
        showToast("Save failed, cannot render", "error");
        return;
      }
    }

    // Force immediate save if there are unsaved changes
    if (hasUnsavedChanges) {
      showToast("Saving changes before rendering...", "info");
      try {
        await saveProjectToServer();
      } catch (err) {
        showToast("Save failed, cannot render", "error");
        return;
      }
    }

    // Extra wait to ensure server has processed the save
    await new Promise((resolve) => setTimeout(resolve, 300));

    setRenderLoading(true);
    try {
      const res = await fetch("/api/studio/render/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Render failed");

      setCurrentRenderJobId(data.jobId);
      pollRenderStatus(data.jobId);
    } catch (error: any) {
      showToast(error.message || "Failed to start render", "error");
      setRenderLoading(false);
    }
  };

  // Render final
  const handleRenderFinal = async () => {
    if (renderLoading) return;
    if (!confirm("Render final HD video? This may take several minutes."))
      return;

    setRenderLoading(true);
    setRenderProgress(0);
    setRenderStage("Starting...");

    try {
      const res = await fetch("/api/studio/render/final", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Render failed");
      setCurrentRenderJobId(data.jobId);
      pollRenderStatus(data.jobId);
    } catch (error: any) {
      showToast(error.message || "Failed to start render", "error");
      setRenderLoading(false);
    }
  };

  // Poll render status
  const pollRenderStatus = async (jobId: string) => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/studio/render/status?jobId=${jobId}`);
        const data = await res.json();

        setRenderProgress(data.progress || 0);
        setRenderStage(data.stage || "");

        if (data.status === "done") {
          clearInterval(interval);
          setRenderLoading(false);
          setCurrentRenderJobId(null);
          await loadProject(); // Reload to get video URL
          showToast("Preview rendered successfully!", "success");
        } else if (data.status === "error") {
          clearInterval(interval);
          setRenderLoading(false);
          setCurrentRenderJobId(null);
          showToast(data.error || "Render failed", "error");
        }
      } catch (error) {
        clearInterval(interval);
        setRenderLoading(false);
        setCurrentRenderJobId(null);
      }
    }, 1000);
  };

  // Video controls
  const togglePlay = async () => {
    const video = videoRef.current;
    if (!video) {
      console.error("[togglePlay] No video ref");
      return;
    }

    console.log("[togglePlay] Video state:", {
      paused: video.paused,
      ended: video.ended,
      currentTime: video.currentTime,
      duration: video.duration,
      readyState: video.readyState,
      src: video.src,
    });

    try {
      if (video.paused) {
        console.log("[togglePlay] Attempting to play...");
        await video.play();
        console.log("[togglePlay] Play successful");
      } else {
        console.log("[togglePlay] Pausing...");
        video.pause();
      }
    } catch (error) {
      console.error("[togglePlay] Playback error:", error);
      // Only show toast for non-abort errors
      if (error instanceof Error && error.name !== "AbortError") {
        showToast("Failed to play video", "error");
      }
    }
  };

  // Update slide
  const updateSlide = (index: number, updates: Partial<Slide>) => {
    if (!project) return;
    const newSlides = [...project.slides];
    newSlides[index] = { ...newSlides[index], ...updates };
    setProject({ ...project, slides: newSlides });
  };

  // Update project
  const updateProject = async (updates: Partial<Project>) => {
    if (!project) return;
    const updatedProject = { ...project, ...updates };
    setProject(updatedProject);
    setHasUnsavedChanges(true);
    projectVersionRef.current++;
    const currentVersion = projectVersionRef.current;

    // Debounce saves - wait for user to stop making changes
    if (saveDebounceTimer.current) {
      clearTimeout(saveDebounceTimer.current);
    }

    saveDebounceTimer.current = setTimeout(async () => {
      const savePromise = saveProjectToServer(updatedProject, currentVersion);
      saveInProgressRef.current = savePromise;
      try {
        await savePromise;
      } finally {
        saveInProgressRef.current = null;
      }
    }, 500); // Wait 500ms after last change
  };

  // Save project to server
  const saveProjectToServer = async (
    projectToSave?: Project,
    version?: number
  ) => {
    const dataToSave = projectToSave || project;
    if (!dataToSave) {
      console.warn("No project data to save");
      return;
    }

    console.log(
      "Saving project version",
      version,
      "with",
      dataToSave.slides.length,
      "slides"
    );
    setIsSaving(true);
    try {
      const res = await fetch(`/api/studio/project/${projectId}/update`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(dataToSave),
      });
      if (res.ok) {
        const saved = await res.json();

        // Only update state if this save is still current (no newer changes made)
        if (!version || version === projectVersionRef.current) {
          setProject(saved);
          setLastSaved(new Date());
          setHasUnsavedChanges(false);
          console.log(
            "Project saved successfully. Server has",
            saved.slides.length,
            "slides"
          );
        } else {
          console.log(
            "Skipping state update - newer changes exist (current:",
            projectVersionRef.current,
            "saved:",
            version,
            ")"
          );
        }
      } else {
        const errorText = await res.text();
        console.error("Save failed:", res.status, errorText);
        throw new Error("Failed to save");
      }
    } catch (err) {
      console.error("Failed to save:", err);
      showToast("Failed to save changes", "error");
      throw err;
    } finally {
      setIsSaving(false);
    }
  };

  // Video volume control
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

  const handleSeek = (time: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = time;
  };

  const skipBackward = () => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = Math.max(0, video.currentTime - 5);
  };

  const skipForward = () => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = Math.min(video.duration, video.currentTime + 5);
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
    if (isNaN(seconds) || !isFinite(seconds)) return "00:00:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const frames = Math.floor((seconds % 1) * 30);
    return `${mins.toString().padStart(2, "0")}:${secs
      .toString()
      .padStart(2, "0")}:${frames.toString().padStart(2, "0")}`;
  };

  // Load project on mount
  useEffect(() => {
    if (isOpen && projectId) {
      loadProject();
    }
  }, [isOpen, projectId]);

  // Auto-generate preview when project loads (if not already generated or config changed)
  useEffect(() => {
    if (!project || renderLoading) return;

    const shouldGeneratePreview = () => {
      // If no preview exists, generate it
      if (!project.previewVideoUrl) {
        console.log("[StudioModalV2] No preview exists, will auto-generate");
        return true;
      }

      // If config hash exists and matches, don't regenerate
      if (project.lastPreviewConfigHash) {
        const currentHash = generateConfigHash(project);
        console.log(
          "[StudioModalV2] Current hash:",
          currentHash,
          "Saved hash:",
          project.lastPreviewConfigHash
        );
        if (currentHash === project.lastPreviewConfigHash) {
          console.log(
            "[StudioModalV2] Config unchanged, skipping auto-preview"
          );
          return false;
        }
        console.log("[StudioModalV2] Config changed, will regenerate preview");
        return true;
      }

      // No hash stored yet, don't auto-regenerate
      return false;
    };

    if (shouldGeneratePreview()) {
      console.log("[StudioModalV2] Auto-generating preview video...");
      handleRenderPreview();
    }
  }, [project, renderLoading]);

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
          togglePlay();
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

  // Video time update
  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      console.log("[Video Effect] No video ref");
      return;
    }

    console.log(
      "[Video Effect] Setting up event listeners for:",
      project?.previewVideoUrl
    );

    const handleTimeUpdate = () => {
      console.log(
        "[Video] Time update:",
        video.currentTime,
        "/",
        video.duration
      );
      setCurrentTime(video.currentTime);
    };
    const handleLoadedMetadata = () => {
      console.log("[Video] Metadata loaded, duration:", video.duration);
      setDuration(video.duration);
    };
    const handlePlay = () => {
      console.log("[Video] Playing");
      setIsPlaying(true);
    };
    const handlePause = () => {
      console.log("[Video] Paused");
      setIsPlaying(false);
    };
    const handleEnded = () => {
      console.log("[Video] Ended");
      setIsPlaying(false);
    };
    const handleError = (e: Event) => {
      const videoElement = e.target as HTMLVideoElement;
      const error = videoElement.error;

      console.error("[Video Error]", {
        code: error?.code,
        message: error?.message,
        src: videoElement.src,
        networkState: videoElement.networkState,
        readyState: videoElement.readyState,
      });

      let errorMessage = "Failed to load video";
      if (error) {
        switch (error.code) {
          case MediaError.MEDIA_ERR_ABORTED:
            errorMessage = "Video loading aborted";
            break;
          case MediaError.MEDIA_ERR_NETWORK:
            errorMessage = "Network error loading video";
            break;
          case MediaError.MEDIA_ERR_DECODE:
            errorMessage = "Video decoding error";
            break;
          case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
            errorMessage = "Video format not supported or file not found";
            break;
        }
      }
      showToast(errorMessage, "error");
    };

    video.addEventListener("timeupdate", handleTimeUpdate);
    video.addEventListener("loadedmetadata", handleLoadedMetadata);
    video.addEventListener("play", handlePlay);
    video.addEventListener("pause", handlePause);
    video.addEventListener("ended", handleEnded);
    video.addEventListener("error", handleError);

    // Set initial values
    if (video.duration && !isNaN(video.duration)) {
      setDuration(video.duration);
    }
    video.volume = volume / 100;
    video.playbackRate = playbackSpeed;
    video.muted = isMuted;

    return () => {
      video.removeEventListener("timeupdate", handleTimeUpdate);
      video.removeEventListener("loadedmetadata", handleLoadedMetadata);
      video.removeEventListener("play", handlePlay);
      video.removeEventListener("pause", handlePause);
      video.removeEventListener("ended", handleEnded);
      video.removeEventListener("error", handleError);
    };
  }, [project?.previewVideoUrl, volume, playbackSpeed, isMuted]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black">
      {/* Header */}
      <div className="h-14 bg-gray-900 border-b border-gray-800 flex items-center justify-between px-6">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded bg-purple-600 flex items-center justify-center">
              <Film className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-red font-semibold text-lg">Trendly Studio</h1>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Save status indicator */}
          {isSaving && (
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Saving...</span>
            </div>
          )}
          {!isSaving && hasUnsavedChanges && (
            <div className="flex items-center gap-2 text-sm text-yellow-400">
              <AlertCircle className="w-4 h-4" />
              <span>Unsaved changes</span>
            </div>
          )}
          {!isSaving && !hasUnsavedChanges && lastSaved && (
            <div className="text-sm text-green-400">✓ Saved</div>
          )}

          <button
            onClick={() => setShowKeyboardShortcuts(true)}
            className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
            title="Keyboard shortcuts (?)"
          >
            <Keyboard className="w-4 h-4 text-gray-400" />
          </button>

          <button
            onClick={() => setIsStudioPlusOpen(true)}
            className="group relative px-4 py-2 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white rounded-lg font-semibold transition-all transform hover:scale-105 shadow-lg hover:shadow-purple-500/50"
          >
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4" />
              <span className="text-sm">Studio Plus</span>
              <span className="text-xs bg-white/20 px-1.5 py-0.5 rounded-full">
                PREMIUM
              </span>
            </div>
          </button>

          <span className="text-sm text-gray-400">Personalize your Ads</span>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex h-[calc(100vh-3.5rem)]">
        {/* Left Sidebar */}
        <div className="w-24 bg-[#0a0a0a] border-r border-gray-800 overflow-y-auto flex-shrink-0">
          <div className="p-0">
            {/* Sidebar Tabs */}
            <div className="space-y-0">
              {sidebarSections.map((section) => {
                const Icon = section.icon;
                const isActive = activeSection === section.id;
                return (
                  <button
                    key={section.id}
                    onClick={() => setActiveSection(section.id)}
                    className={`w-full flex flex-col items-center justify-center gap-1 py-6 transition-colors border-b border-gray-800/50 ${
                      isActive
                        ? "bg-white text-black"
                        : "text-gray-500 hover:bg-gray-900 hover:text-gray-300"
                    }`}
                  >
                    <Icon className="w-6 h-6" />
                    <span className="text-xs font-medium">{section.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Content Panel */}
        <div className="w-80 bg-[#141414] border-r border-gray-800 overflow-y-auto">
          <div className="p-6">
            <h2 className="text-white font-semibold text-xl mb-6">
              {sidebarSections.find((s) => s.id === activeSection)?.label}
            </h2>

            {/* Section Content */}
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
              </div>
            ) : project ? (
              <div>
                {activeSection === "slideshow" && (
                  <SlideshowControls
                    project={project}
                    onUpdate={updateProject}
                  />
                )}
                {activeSection === "banner" && (
                  <BannerControls project={project} onUpdate={updateProject} />
                )}
                {activeSection === "endscreen" && (
                  <EndScreenControls
                    project={project}
                    onUpdate={updateProject}
                  />
                )}
                {activeSection === "qr" && (
                  <QRControls project={project} onUpdate={updateProject} />
                )}
                {activeSection === "music" && (
                  <MusicControls project={project} onUpdate={updateProject} />
                )}
                {activeSection === "voice" && (
                  <VoiceControls project={project} onUpdate={updateProject} />
                )}
                {activeSection === "ai" && (
                  <div className="text-gray-400 text-sm text-center py-8">
                    AI Settings (Coming Soon)
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </div>

        {/* Center Preview Area */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Video Preview */}
          <div className="flex-1 bg-black flex items-center justify-center p-4 min-h-0">
            {renderLoading ? (
              <div className="text-center animate-in fade-in slide-in-from-bottom duration-500 max-w-md">
                <div className="inline-block p-6 bg-purple-600/10 rounded-full mb-6 border border-purple-600/30">
                  <Loader2 className="w-20 h-20 text-purple-500 animate-spin" />
                </div>
                <div className="text-2xl font-bold text-white mb-2">
                  Rendering Video...
                </div>
                <div className="text-gray-400 mb-6">{renderStage}</div>

                {/* Progress Bar */}
                <div className="w-full bg-gray-800 rounded-full h-3 mb-3 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-purple-600 to-pink-600 transition-all duration-300 ease-out rounded-full"
                    style={{ width: `${renderProgress}%` }}
                  />
                </div>
                <div className="text-sm text-gray-400 font-mono">
                  {renderProgress.toFixed(0)}% complete
                </div>
              </div>
            ) : project?.previewVideoUrl ? (
              <div className="relative w-full h-full flex items-center justify-center">
                <div className="absolute -inset-0.5 bg-gradient-to-r from-red-600 to-purple-600 rounded-xl opacity-10 blur-2xl pointer-events-none" />
                <video
                  key={project.previewVideoUrl}
                  ref={videoRef}
                  src={`${project.previewVideoUrl}?t=${
                    project.lastPreviewRenderedAt
                      ? new Date(project.lastPreviewRenderedAt).getTime()
                      : Date.now()
                  }`}
                  className="relative z-10 max-w-full max-h-full rounded-xl shadow-2xl border border-gray-800/50"
                  style={{ maxHeight: "calc(100vh - 400px)" }}
                  preload="metadata"
                  playsInline
                  onError={(e) => {
                    const video = e.currentTarget;
                    const error = video.error;

                    console.error("[Video onError] DETAILED ERROR:", {
                      src: video.src,
                      currentSrc: video.currentSrc,
                      networkState: video.networkState,
                      readyState: video.readyState,
                      errorCode: error?.code,
                      errorMessage: error?.message,
                      MediaError: {
                        MEDIA_ERR_ABORTED: 1,
                        MEDIA_ERR_NETWORK: 2,
                        MEDIA_ERR_DECODE: 3,
                        MEDIA_ERR_SRC_NOT_SUPPORTED: 4,
                      },
                    });

                    let errorMsg = "Failed to load video";
                    if (error) {
                      switch (error.code) {
                        case 1:
                          errorMsg = "Video loading aborted";
                          break;
                        case 2:
                          errorMsg =
                            "Network error - check if video file exists";
                          break;
                        case 3:
                          errorMsg =
                            "Video decode error - file may be corrupted";
                          break;
                        case 4:
                          // 404 error - video file missing, regenerate it
                          errorMsg = "Video file missing - regenerating...";
                          console.log(
                            "[Video] File not found (404), triggering re-render"
                          );

                          // Clear the broken URL and trigger re-render
                          if (project) {
                            setProject({
                              ...project,
                              previewVideoUrl: null,
                              status: "draft",
                            });

                            // Auto-trigger preview generation
                            setTimeout(() => {
                              showToast(
                                "Regenerating video preview...",
                                "info"
                              );
                              handleGeneratePreview();
                            }, 500);
                          }
                          break;
                      }
                    }

                    showToast(errorMsg, "error");
                  }}
                  onLoadStart={() => {
                    console.log("[Video] Load start:", project.previewVideoUrl);
                  }}
                  onLoadedData={() => {
                    console.log("[Video] Loaded data successfully");
                  }}
                  onCanPlay={() => {
                    console.log("[Video] Can play - ready for playback");
                  }}
                />

                {/* Play button overlay */}
                {!isPlaying && (
                  <div
                    className="absolute inset-0 flex items-center justify-center cursor-pointer bg-black/10 z-20"
                    onClick={togglePlay}
                  >
                    <div className="w-20 h-20 rounded-full bg-white/20 backdrop-blur-sm hover:bg-white/30 transition-colors flex items-center justify-center">
                      <Play className="w-10 h-10 text-white ml-1" />
                    </div>
                  </div>
                )}

                {/* Click anywhere to play/pause when playing */}
                {isPlaying && (
                  <div
                    className="absolute inset-0 cursor-pointer z-20"
                    onClick={togglePlay}
                  />
                )}
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

          {/* Timeline Area */}
          <div className="h-64 flex-shrink-0 bg-gray-950 border-t border-gray-800 overflow-y-auto">
            <div className="p-3 min-w-max">
              {/* Playback Controls */}
              <div className="flex items-center gap-3 mb-3">
                <button
                  onClick={togglePlay}
                  disabled={!project?.previewVideoUrl}
                  className="w-10 h-10 rounded-full bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
                >
                  {isPlaying ? (
                    <Pause className="w-5 h-5 text-white" />
                  ) : (
                    <Play className="w-5 h-5 text-white ml-0.5" />
                  )}
                </button>

                <button
                  onClick={skipBackward}
                  disabled={!project?.previewVideoUrl}
                  className="w-8 h-8 rounded-full bg-gray-800 hover:bg-gray-700 disabled:bg-gray-900 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
                >
                  <SkipBack className="w-4 h-4 text-white" />
                </button>

                <button
                  onClick={skipForward}
                  disabled={!project?.previewVideoUrl}
                  className="w-8 h-8 rounded-full bg-gray-800 hover:bg-gray-700 disabled:bg-gray-900 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
                >
                  <SkipForward className="w-4 h-4 text-white" />
                </button>

                <div className="flex-1 flex items-center gap-2">
                  <span className="text-gray-400 text-sm font-mono min-w-[45px]">
                    {formatTime(currentTime)}
                  </span>
                  <div
                    className="flex-1 h-2 bg-gray-800 rounded-full overflow-hidden cursor-pointer"
                    onClick={(e) => {
                      if (!videoRef.current || !duration) return;
                      const rect = e.currentTarget.getBoundingClientRect();
                      const percent = (e.clientX - rect.left) / rect.width;
                      handleSeek(percent * duration);
                    }}
                  >
                    <div
                      className="h-full bg-purple-600 transition-all duration-100"
                      style={{
                        width: `${
                          duration ? (currentTime / duration) * 100 : 0
                        }%`,
                      }}
                    />
                  </div>
                  <span className="text-gray-400 text-sm font-mono min-w-[45px]">
                    {formatTime(duration)}
                  </span>
                </div>

                {/* Volume Control */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={toggleMute}
                    className="w-8 h-8 rounded-full bg-gray-800 hover:bg-gray-700 flex items-center justify-center transition-colors"
                  >
                    {isMuted || volume === 0 ? (
                      <VolumeX className="w-4 h-4 text-white" />
                    ) : (
                      <Volume2 className="w-4 h-4 text-white" />
                    )}
                  </button>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={volume}
                    onChange={(e) =>
                      handleVolumeChange(parseInt(e.target.value))
                    }
                    className="w-20 h-1 bg-gray-800 rounded-full appearance-none cursor-pointer accent-purple-600"
                  />
                </div>

                {/* Speed Control */}
                <select
                  value={playbackSpeed}
                  onChange={(e) =>
                    handleSpeedChange(parseFloat(e.target.value))
                  }
                  className="px-3 py-1 bg-gray-800 hover:bg-gray-700 text-white text-sm rounded transition-colors"
                >
                  <option value="0.5">0.5x</option>
                  <option value="0.75">0.75x</option>
                  <option value="1">1x</option>
                  <option value="1.25">1.25x</option>
                  <option value="1.5">1.5x</option>
                  <option value="2">2x</option>
                </select>

                {/* Fullscreen */}
                <button
                  onClick={toggleFullscreen}
                  disabled={!project?.previewVideoUrl}
                  className="w-8 h-8 rounded-full bg-gray-800 hover:bg-gray-700 disabled:bg-gray-900 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
                >
                  <Maximize className="w-4 h-4 text-white" />
                </button>

                {/* Zoom Controls */}
                <div className="flex items-center gap-1 ml-2 border-l border-gray-700 pl-3">
                  <button
                    onClick={() =>
                      setTimelineZoom(Math.max(0.5, timelineZoom - 0.5))
                    }
                    className="p-1 hover:bg-gray-700 rounded transition-colors"
                    title="Zoom Out"
                  >
                    <ZoomOut className="w-3 h-3 text-gray-400" />
                  </button>
                  <span className="text-xs text-gray-500 min-w-[45px] text-center">
                    {timelineZoom}x
                  </span>
                  <button
                    onClick={() =>
                      setTimelineZoom(Math.min(4, timelineZoom + 0.5))
                    }
                    className="p-1 hover:bg-gray-700 rounded transition-colors"
                    title="Zoom In"
                  >
                    <ZoomIn className="w-3 h-3 text-gray-400" />
                  </button>
                </div>
              </div>

              {/* Timeline Tracks */}
              {project && (
                <div className="space-y-2 min-w-[800px]">
                  {/* Slides Track */}
                  <div className="flex items-center gap-3">
                    <div className="w-32 flex-shrink-0">
                      <div className="flex items-center gap-2 px-3 py-2 bg-gray-900 rounded-lg">
                        <Film className="w-4 h-4 text-gray-400" />
                        <span className="text-sm text-gray-300">Slideshow</span>
                      </div>
                    </div>
                    <div
                      className="flex-1 flex gap-1 min-h-[64px] relative cursor-pointer"
                      onClick={(e) => {
                        const video = videoRef.current;
                        if (!video || !duration) return;

                        const rect = e.currentTarget.getBoundingClientRect();
                        const x = e.clientX - rect.left;
                        const percentage = x / rect.width;
                        const newTime = percentage * duration;

                        console.log(
                          "[Timeline Click] Seeking to:",
                          newTime,
                          "seconds"
                        );
                        video.currentTime = newTime;
                      }}
                    >
                      {/* Progress indicator */}
                      <div
                        className="absolute top-0 bottom-0 w-1 bg-red-500 z-10 transition-all duration-100 pointer-events-none"
                        style={{
                          left: `${
                            duration > 0 ? (currentTime / duration) * 100 : 0
                          }%`,
                          boxShadow: "0 0 10px rgba(239, 68, 68, 0.8)",
                        }}
                      />

                      {project.slides.map((slide, index) => {
                        const totalDuration = project.slides.reduce(
                          (sum, s) => sum + (s.endTime - s.startTime),
                          0
                        );
                        const slideDuration = slide.endTime - slide.startTime;
                        const widthPercent =
                          totalDuration > 0
                            ? (slideDuration / totalDuration) * 100
                            : 100 / project.slides.length;

                        return (
                          <div
                            key={slide.id}
                            className="relative h-16 rounded overflow-hidden border-2 border-gray-700 hover:border-purple-600 transition-colors flex-shrink-0"
                            style={{
                              width: `${widthPercent}%`,
                              minWidth: "80px",
                            }}
                          >
                            <img
                              src={slide.imageUrl}
                              alt={`Slide ${index + 1}`}
                              className="w-full h-full object-cover"
                            />
                            <div className="absolute bottom-0 left-0 right-0 bg-black/70 text-white text-xs px-2 py-1 text-center">
                              {slideDuration.toFixed(1)}s
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Bottom Banner Track */}
                  <div className="flex items-center gap-3">
                    <div className="w-32 flex-shrink-0">
                      <div className="px-3 py-2 bg-pink-900/30 rounded-lg">
                        <span className="text-sm text-pink-300">
                          BOTTOM BANNER
                        </span>
                      </div>
                    </div>
                    <div className="flex-1 h-6 bg-pink-600/50 rounded" />
                  </div>

                  {/* QR Code Track */}
                  <div className="flex items-center gap-3">
                    <div className="w-32 flex-shrink-0">
                      <div className="px-3 py-2 bg-cyan-900/30 rounded-lg">
                        <span className="text-sm text-cyan-300">QR CODE</span>
                      </div>
                    </div>
                    <div className="flex-1 h-6 bg-cyan-600/50 rounded" />
                  </div>

                  {/* Music Track */}
                  <div className="flex items-center gap-3">
                    <div className="w-32 flex-shrink-0">
                      <div className="px-3 py-2 bg-blue-900/30 rounded-lg">
                        <span className="text-sm text-blue-300">MUSIC</span>
                      </div>
                    </div>
                    <div className="flex-1 h-6 bg-blue-600/50 rounded" />
                  </div>

                  {/* Voice Track */}
                  <div className="flex items-center gap-3">
                    <div className="w-32 flex-shrink-0">
                      <div className="px-3 py-2 bg-purple-900/30 rounded-lg">
                        <span className="text-sm text-purple-300">
                          VOICE & SCRIPT
                        </span>
                      </div>
                    </div>
                    <div className="flex-1 h-6 bg-purple-600/50 rounded" />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Action Bar */}
      <div className="absolute bottom-0 right-0 left-[416px] p-4 bg-gray-900 border-t border-gray-800 flex justify-between items-center z-10">
        <button
          onClick={handleRenderPreview}
          disabled={renderLoading || isSaving}
          className="group relative px-8 py-4 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 disabled:from-gray-600 disabled:to-gray-700 text-white font-bold rounded-xl transition-all duration-200 hover:shadow-lg hover:shadow-blue-600/50 disabled:shadow-none hover:scale-105 disabled:scale-100 disabled:cursor-not-allowed flex items-center gap-3"
        >
          {renderLoading && renderProgress < 100 ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>Rendering... {renderProgress}%</span>
            </>
          ) : isSaving ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>Saving...</span>
            </>
          ) : (
            <>
              <Play className="w-5 h-5 group-hover:scale-110 transition-transform" />
              <span>Render Preview (720p)</span>
            </>
          )}
        </button>

        <div className="flex items-center gap-3">
          <button
            onClick={handleRenderFinal}
            disabled={renderLoading || isSaving}
            className="group relative px-8 py-4 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 disabled:from-gray-600 disabled:to-gray-700 text-white font-bold rounded-xl transition-all duration-200 hover:shadow-lg hover:shadow-red-600/50 disabled:shadow-none hover:scale-105 disabled:scale-100 disabled:cursor-not-allowed flex items-center gap-3"
          >
            <Download className="w-5 h-5 group-hover:scale-110 transition-transform" />
            <span>Render Final (1080p)</span>
          </button>

          <button
            onClick={async () => {
              await saveProject();
              onClose();
            }}
            disabled={isSaving}
            className="px-8 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors flex items-center gap-2"
          >
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                Save & Close
              </>
            )}
          </button>
        </div>
      </div>

      {/* Toast Notification */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 animate-in slide-in-from-top">
          <div
            className={`px-6 py-4 rounded-lg shadow-lg flex items-center gap-3 ${
              toast.type === "success"
                ? "bg-green-600 text-white"
                : toast.type === "error"
                ? "bg-red-600 text-white"
                : "bg-blue-600 text-white"
            }`}
          >
            {toast.type === "success" && <CheckCircle2 className="w-5 h-5" />}
            {toast.type === "error" && <AlertCircle className="w-5 h-5" />}
            <span className="font-medium">{toast.message}</span>
          </div>
        </div>
      )}

      {/* Render Progress Overlay */}
      {renderLoading && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="bg-gray-900 rounded-lg p-8 max-w-md w-full mx-4">
            <div className="flex items-center gap-3 mb-4">
              <Loader2 className="w-6 h-6 text-purple-500 animate-spin" />
              <h3 className="text-white text-lg font-semibold">
                Rendering Video...
              </h3>
            </div>
            <div className="space-y-3">
              <div className="w-full h-2 bg-gray-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-purple-600 transition-all duration-300"
                  style={{ width: `${renderProgress}%` }}
                />
              </div>
              <p className="text-gray-400 text-sm">{renderStage}</p>
              <p className="text-gray-500 text-xs">
                {renderProgress}% complete
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Studio Plus Modal */}
      <StudioModalPlus
        isOpen={isStudioPlusOpen}
        onClose={() => setIsStudioPlusOpen(false)}
      />

      {/* Keyboard Shortcuts Modal */}
      {showKeyboardShortcuts && (
        <div
          className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center"
          onClick={() => setShowKeyboardShortcuts(false)}
        >
          <div
            className="bg-gray-900 rounded-xl p-8 max-w-2xl w-full mx-4 shadow-2xl border border-gray-800"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-2xl font-bold text-white flex items-center gap-3">
                <MessageSquare className="w-6 h-6 text-red-500" />
                Keyboard Shortcuts
              </h3>
              <button
                onClick={() => setShowKeyboardShortcuts(false)}
                className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {[
                { key: "Space / K", action: "Play/Pause" },
                { key: "←", action: "Rewind 5s" },
                { key: "→", action: "Forward 5s" },
                { key: "J", action: "Rewind 10s" },
                { key: "L", action: "Forward 10s" },
                { key: "M", action: "Mute/Unmute" },
                { key: "F", action: "Fullscreen" },
                { key: "?", action: "Show shortcuts" },
              ].map((shortcut, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-3 bg-gray-800 rounded-lg"
                >
                  <span className="text-gray-300">{shortcut.action}</span>
                  <kbd className="px-3 py-1 bg-gray-700 text-white rounded font-mono text-sm">
                    {shortcut.key}
                  </kbd>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ==================== CONTROL PANELS ==================== */

interface ControlProps {
  project: Project;
  onUpdate: (updates: Partial<Project>) => void;
}

/* ==================== SLIDESHOW CONTROLS ==================== */

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
        const endScreenIndex = project.slides.findIndex((s) => s.isEndScreen);
        const slidesWithoutEnd =
          endScreenIndex >= 0
            ? project.slides.slice(0, endScreenIndex)
            : project.slides;
        const endScreenSlide =
          endScreenIndex >= 0 ? project.slides[endScreenIndex] : null;

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

        const updatedSlides = [...slidesWithoutEnd, newSlide];

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
      const updatedSlides = project.slides.map((slide, idx) =>
        idx === replacingSlideIndex ? { ...slide, imageUrl } : slide
      );
      onUpdate({ slides: updatedSlides });
      setReplacingSlideIndex(null);
      setShowGallery(false);
      return;
    }

    const endScreenIndex = project.slides.findIndex((s) => s.isEndScreen);
    const slidesWithoutEnd =
      endScreenIndex >= 0
        ? project.slides.slice(0, endScreenIndex)
        : project.slides;
    const endScreenSlide =
      endScreenIndex >= 0 ? project.slides[endScreenIndex] : null;

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

    const updatedSlides = [...slidesWithoutEnd, newSlide];

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
    recalculateTimings(newSlides);
    onUpdate({ slides: newSlides });
  };

  const deleteSlide = (index: number) => {
    if (project.slides[index].isEndScreen) return;
    const newSlides = project.slides.filter((_, idx) => idx !== index);
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

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-gray-900/50 rounded-lg p-3">
          <div className="text-xs text-gray-400 mb-1">Total Slides</div>
          <div className="text-xl font-bold text-white">
            {project.slides.filter((s) => !s.isEndScreen).length}
          </div>
        </div>
        <div className="bg-gray-900/50 rounded-lg p-3">
          <div className="text-xs text-gray-400 mb-1">Duration</div>
          <div className="text-xl font-bold text-white">
            {project.slides
              .reduce((sum, s) => sum + (s.endTime - s.startTime), 0)
              .toFixed(1)}
            s
          </div>
        </div>
      </div>

      <div className="flex gap-2">
        <label className="flex-1 px-3 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg cursor-pointer text-center transition-colors font-medium text-sm">
          {uploading ? "⏳ Uploading..." : "📤 Upload"}
          <input
            type="file"
            accept="image/*"
            onChange={handleFileUpload}
            disabled={uploading}
            className="hidden"
          />
        </label>
        <button
          onClick={() => setShowGallery(!showGallery)}
          className="flex-1 px-3 py-2 bg-green-600 hover:bg-green-700 rounded-lg transition-colors font-medium text-sm"
        >
          🖼️ Gallery
        </button>
      </div>

      {showGallery && (
        <div className="border border-gray-700 rounded-lg p-3 max-h-64 overflow-y-auto bg-gray-900/50">
          <div className="flex justify-between items-center mb-2">
            <h4 className="text-sm font-semibold text-white">
              {replacingSlideIndex !== null
                ? `Replace Slide #${replacingSlideIndex + 1}`
                : "Image Gallery"}
            </h4>
            <button
              onClick={() => {
                setShowGallery(false);
                setReplacingSlideIndex(null);
              }}
              className="text-gray-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {project.sourceImages.map((img, idx) => (
              <div
                key={idx}
                onClick={() => handleSelectFromGallery(img.url)}
                className="relative cursor-pointer group aspect-square rounded overflow-hidden border-2 border-gray-700 hover:border-purple-600 transition-all"
              >
                <img
                  src={img.url}
                  alt=""
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <span className="text-white text-sm">Add</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-2">
        {project.slides
          .filter((s) => !s.isEndScreen)
          .map((slide, index) => (
            <div key={index} className="bg-gray-900 rounded-lg p-3 space-y-2">
              <div className="flex items-center gap-3">
                <img
                  src={slide.imageUrl}
                  alt=""
                  className="w-16 h-16 object-cover rounded"
                />
                <div className="flex-1 min-w-0">
                  <div className="text-white font-medium flex items-center gap-2">
                    <span className="bg-purple-600/20 text-purple-400 text-xs px-2 py-1 rounded">
                      #{index + 1}
                    </span>
                    <span className="text-xs text-gray-400">
                      ({(slide.endTime - slide.startTime).toFixed(1)}s)
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setReplacingSlideIndex(index);
                    setShowGallery(true);
                  }}
                  className="flex-1 px-2 py-1 bg-blue-600/20 hover:bg-blue-600/40 text-blue-400 rounded text-xs"
                >
                  <RefreshCw className="w-3 h-3 inline" /> Replace
                </button>
                <button
                  onClick={() => moveSlideUp(index)}
                  disabled={index === 0}
                  className="px-2 py-1 bg-gray-600/20 hover:bg-gray-600/40 text-gray-300 rounded text-xs disabled:opacity-30"
                >
                  <ChevronUp className="w-3 h-3" />
                </button>
                <button
                  onClick={() => moveSlideDown(index)}
                  disabled={
                    index ===
                    project.slides.filter((s) => !s.isEndScreen).length - 1
                  }
                  className="px-2 py-1 bg-gray-600/20 hover:bg-gray-600/40 text-gray-300 rounded text-xs disabled:opacity-30"
                >
                  <ChevronDown className="w-3 h-3" />
                </button>
                <button
                  onClick={() => {
                    if (confirm("Delete this slide?")) deleteSlide(index);
                  }}
                  className="px-2 py-1 bg-red-600/20 hover:bg-red-600/40 text-red-400 rounded text-xs"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}

/* ==================== BANNER CONTROLS ==================== */

function BannerControls({ project, onUpdate }: ControlProps) {
  const [uploading, setUploading] = useState(false);

  const updateBanner = (updates: Partial<BottomBanner>) => {
    onUpdate({ bottomBanner: { ...project.bottomBanner, ...updates } });
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
      alert("Failed to upload logo");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-4">
      <label className="flex items-center gap-3 cursor-pointer p-3 bg-gray-900/50 rounded-lg hover:bg-gray-800 transition-colors">
        <input
          type="checkbox"
          checked={project.bottomBanner.enabled}
          onChange={(e) => updateBanner({ enabled: e.target.checked })}
          className="w-4 h-4 accent-purple-600 cursor-pointer"
        />
        <span className="text-white font-medium text-sm">
          Enable Bottom Banner
        </span>
      </label>

      {project.bottomBanner.enabled && (
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-400 mb-2">
              Banner Text
            </label>
            <input
              type="text"
              value={project.bottomBanner.text}
              onChange={(e) => updateBanner({ text: e.target.value })}
              className="w-full px-3 py-2 bg-gray-900/50 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-600 text-sm"
              placeholder="Enter banner text..."
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-400 mb-2">
              Logo (Optional)
            </label>
            <label className="block w-full px-3 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg cursor-pointer text-center transition-colors text-sm">
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
              <div className="mt-2 p-2 bg-gray-900/30 rounded">
                <img
                  src={project.bottomBanner.logoUrl}
                  alt="Logo"
                  className="w-12 h-12 object-contain mx-auto"
                />
              </div>
            )}
          </div>

          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="text-xs font-semibold text-gray-400">
                Font Size
              </label>
              <span className="text-purple-500 font-bold text-sm">
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
              className="w-full h-1 bg-gray-700 rounded appearance-none cursor-pointer accent-purple-600"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-400 mb-2">
                Background
              </label>
              <input
                type="color"
                value={project.bottomBanner.backgroundColor}
                onChange={(e) =>
                  updateBanner({ backgroundColor: e.target.value })
                }
                className="w-full h-10 rounded cursor-pointer"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-400 mb-2">
                Text Color
              </label>
              <input
                type="color"
                value={project.bottomBanner.textColor}
                onChange={(e) => updateBanner({ textColor: e.target.value })}
                className="w-full h-10 rounded cursor-pointer"
              />
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
    let updatedSlides = project.slides;

    if ("enabled" in updates) {
      const endScreenSlideIndex = project.slides.findIndex(
        (s) => s.isEndScreen
      );
      if (updates.enabled && endScreenSlideIndex === -1) {
        const regularSlides = project.slides.filter((s) => !s.isEndScreen);
        const lastSlide = regularSlides[regularSlides.length - 1];
        const endScreenStartTime = lastSlide ? lastSlide.endTime : 0;
        const endScreenSlide: Slide = {
          id: "end-screen",
          imageUrl: "",
          startTime: endScreenStartTime,
          endTime: endScreenStartTime + (newEndScreen.duration || 3),
          transition: "fade",
          isEndScreen: true,
        };
        updatedSlides = [...regularSlides, endScreenSlide];
      } else if (!updates.enabled && endScreenSlideIndex !== -1) {
        updatedSlides = project.slides.filter((s) => !s.isEndScreen);
      }
    }

    onUpdate({ endScreen: newEndScreen, slides: updatedSlides });
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
      alert("Failed to upload logo");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-4">
      <label className="flex items-center gap-3 cursor-pointer p-3 bg-gray-900/50 rounded-lg hover:bg-gray-800 transition-colors">
        <input
          type="checkbox"
          checked={project.endScreen.enabled}
          onChange={(e) => updateEndScreen({ enabled: e.target.checked })}
          className="w-4 h-4 accent-purple-600 cursor-pointer"
        />
        <span className="text-white font-medium text-sm">
          Enable End Screen
        </span>
      </label>

      {project.endScreen.enabled && (
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-400 mb-2">
              Logo (Optional)
            </label>
            <label className="block w-full px-3 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg cursor-pointer text-center transition-colors text-sm">
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
              <div className="mt-2 p-2 bg-gray-900/30 rounded">
                <img
                  src={project.endScreen.logoUrl}
                  alt="Logo"
                  className="w-12 h-12 object-contain mx-auto"
                />
              </div>
            )}
          </div>

          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="text-xs font-semibold text-gray-400">
                Duration
              </label>
              <span className="text-purple-500 font-bold text-sm">
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
              className="w-full h-1 bg-gray-700 rounded appearance-none cursor-pointer accent-purple-600"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-400 mb-2">
              Content
            </label>
            <textarea
              value={project.endScreen.content}
              onChange={(e) => updateEndScreen({ content: e.target.value })}
              className="w-full px-3 py-2 bg-gray-900/50 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-600 text-sm"
              placeholder="Enter end screen content..."
              rows={3}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-400 mb-2">
                Background
              </label>
              <input
                type="color"
                value={project.endScreen.backgroundColor}
                onChange={(e) =>
                  updateEndScreen({ backgroundColor: e.target.value })
                }
                className="w-full h-10 rounded cursor-pointer"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-400 mb-2">
                Text Color
              </label>
              <input
                type="color"
                value={project.endScreen.textColor}
                onChange={(e) => updateEndScreen({ textColor: e.target.value })}
                className="w-full h-10 rounded cursor-pointer"
              />
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
    onUpdate({ qrCode: { ...project.qrCode, ...updates } });
  };

  return (
    <div className="space-y-4">
      <label className="flex items-center gap-3 cursor-pointer p-3 bg-gray-900/50 rounded-lg hover:bg-gray-800 transition-colors">
        <input
          type="checkbox"
          checked={project.qrCode.enabled}
          onChange={(e) => updateQR({ enabled: e.target.checked })}
          className="w-4 h-4 accent-purple-600 cursor-pointer"
        />
        <span className="text-white font-medium text-sm">Enable QR Code</span>
      </label>

      {project.qrCode.enabled && (
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-400 mb-2">
              QR Code URL
            </label>
            <input
              type="url"
              value={project.qrCode.url}
              onChange={(e) => updateQR({ url: e.target.value })}
              className="w-full px-3 py-2 bg-gray-900/50 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-600 text-sm"
              placeholder="https://..."
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-400 mb-2">
              Position
            </label>
            <select
              value={project.qrCode.position}
              onChange={(e) => updateQR({ position: e.target.value as any })}
              className="w-full px-3 py-2 bg-gray-900/50 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-600 cursor-pointer text-sm"
            >
              <option value="bottom-right">Bottom Right</option>
              <option value="bottom-left">Bottom Left</option>
              <option value="top-right">Top Right</option>
              <option value="top-left">Top Left</option>
            </select>
          </div>

          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="text-xs font-semibold text-gray-400">
                Size
              </label>
              <span className="text-purple-500 font-bold text-sm">
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
              className="w-full h-1 bg-gray-700 rounded appearance-none cursor-pointer accent-purple-600"
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
    onUpdate({ music: { ...project.music, ...updates } });
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
      alert("Failed to upload music");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-4">
      <label className="flex items-center gap-3 cursor-pointer p-3 bg-gray-900/50 rounded-lg hover:bg-gray-800 transition-colors">
        <input
          type="checkbox"
          checked={project.music.enabled}
          onChange={(e) => updateMusic({ enabled: e.target.checked })}
          className="w-4 h-4 accent-purple-600 cursor-pointer"
        />
        <span className="text-white font-medium text-sm">
          Enable Background Music
        </span>
      </label>

      <div>
        <label className="block w-full px-3 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg cursor-pointer text-center transition-colors text-sm">
          {uploading ? "⏳ Uploading..." : "🎵 Upload Music File"}
          <input
            type="file"
            accept="audio/*"
            onChange={handleFileUpload}
            disabled={uploading}
            className="hidden"
          />
        </label>
        {project.music.fileName && (
          <div className="mt-2 p-2 bg-gray-900/30 rounded text-sm text-gray-300">
            📁 {project.music.fileName}
          </div>
        )}
      </div>

      {project.music.enabled && (
        <div className="space-y-4">
          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="text-xs font-semibold text-gray-400">
                Volume
              </label>
              <span className="text-purple-500 font-bold text-sm">
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
              className="w-full h-1 bg-gray-700 rounded appearance-none cursor-pointer accent-purple-600"
            />
          </div>

          <div className="grid grid-cols-3 gap-2">
            <label className="flex items-center gap-2 cursor-pointer p-2 bg-gray-900/50 rounded text-xs">
              <input
                type="checkbox"
                checked={project.music.loop}
                onChange={(e) => updateMusic({ loop: e.target.checked })}
                className="w-3 h-3 accent-purple-600 cursor-pointer"
              />
              <span className="text-white">Loop</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer p-2 bg-gray-900/50 rounded text-xs">
              <input
                type="checkbox"
                checked={project.music.fadeIn}
                onChange={(e) => updateMusic({ fadeIn: e.target.checked })}
                className="w-3 h-3 accent-purple-600 cursor-pointer"
              />
              <span className="text-white">Fade In</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer p-2 bg-gray-900/50 rounded text-xs">
              <input
                type="checkbox"
                checked={project.music.fadeOut}
                onChange={(e) => updateMusic({ fadeOut: e.target.checked })}
                className="w-3 h-3 accent-purple-600 cursor-pointer"
              />
              <span className="text-white">Fade Out</span>
            </label>
          </div>
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
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const updateVoice = (updates: Partial<Voice>) => {
    onUpdate({ voice: { ...project.voice, ...updates } });
  };

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
        const audio = new Audio(data.audioUrlLocal);
        audio.addEventListener("loadedmetadata", () => {
          const audioDuration = audio.duration;
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

          if (
            audioDuration > currentContentDuration &&
            contentSlides.length > 0
          ) {
            const extraTime = audioDuration - currentContentDuration;
            const timePerSlide = extraTime / contentSlides.length;
            const adjustedSlides: Slide[] = [];
            let currentTime = 0;

            contentSlides.forEach((slide) => {
              const originalDuration = slide.endTime - slide.startTime;
              const newDuration = originalDuration + timePerSlide;
              adjustedSlides.push({
                ...slide,
                startTime: currentTime,
                endTime: currentTime + newDuration,
              });
              currentTime += newDuration;
            });

            if (endScreenSlide) {
              const endScreenDuration =
                endScreenSlide.endTime - endScreenSlide.startTime;
              adjustedSlides.push({
                ...endScreenSlide,
                startTime: currentTime,
                endTime: currentTime + endScreenDuration,
              });
            }

            onUpdate({
              slides: adjustedSlides,
              voice: { ...project.voice, audioPath: data.audioUrlLocal },
            });
          } else {
            updateVoice({ audioPath: data.audioUrlLocal });
          }
        });

        setErrorMessage(null);
      } else {
        setErrorMessage(data.error || "Failed to generate voiceover");
      }
    } catch (error: any) {
      setErrorMessage(error.message || "Network error occurred");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-4">
      <label className="flex items-center gap-3 cursor-pointer p-3 bg-gray-900/50 rounded-lg hover:bg-gray-800 transition-colors">
        <input
          type="checkbox"
          checked={project.voice.enabled}
          onChange={(e) => updateVoice({ enabled: e.target.checked })}
          className="w-4 h-4 accent-purple-600 cursor-pointer"
        />
        <span className="text-white font-medium text-sm">
          Enable Voice Narration
        </span>
      </label>

      {project.voice.enabled && (
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-400 mb-2">
              Script ({project.voice.script.length} characters)
            </label>
            <textarea
              value={project.voice.script}
              onChange={(e) => updateVoice({ script: e.target.value })}
              className="w-full px-3 py-2 bg-gray-900/50 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-600 text-sm"
              placeholder="Enter your voiceover script..."
              rows={4}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-400 mb-2">
              Voice
            </label>
            <select
              value={selectedVoice}
              onChange={(e) => setSelectedVoice(e.target.value)}
              className="w-full px-3 py-2 bg-gray-900/50 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-600 cursor-pointer text-sm"
            >
              <option value="female">Female</option>
              <option value="male">Male</option>
              {voices.map((voice) => (
                <option key={voice.id} value={voice.id}>
                  {voice.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="text-xs font-semibold text-gray-400">
                Speed Rate
              </label>
              <span className="text-purple-500 font-bold text-sm">
                {speedRate}x
              </span>
            </div>
            <input
              type="range"
              min="0.5"
              max="2"
              step="0.1"
              value={speedRate}
              onChange={(e) => setSpeedRate(parseFloat(e.target.value))}
              className="w-full h-1 bg-gray-700 rounded appearance-none cursor-pointer accent-purple-600"
            />
          </div>

          <button
            onClick={handleGenerateVoiceover}
            disabled={generating || !project.voice.script.trim()}
            className="w-full px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
          >
            {generating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Mic className="w-4 h-4" />
                Generate Voiceover
              </>
            )}
          </button>

          {errorMessage && (
            <div className="p-3 bg-red-900/20 border border-red-700/30 rounded-lg text-red-400 text-sm">
              {errorMessage}
            </div>
          )}

          {project.voice.audioPath && (
            <div className="p-3 bg-green-900/20 border border-green-700/30 rounded-lg text-green-400 text-sm">
              ✓ Voiceover generated successfully
            </div>
          )}
        </div>
      )}
    </div>
  );
}
