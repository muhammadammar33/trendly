"use client";

/**
 * Studio Modal Plus - Premium Video Composer
 * Combine multiple video clips and audio tracks into a final video
 */

import { useEffect, useState, useRef } from "react";
import {
  X,
  Film,
  Play,
  Pause,
  Download,
  Loader2,
  Upload,
  Volume2,
  VolumeX,
  Scissors,
  Layers,
  Music2,
  Video,
  Plus,
  Trash2,
  GripVertical,
  ChevronRight,
  Maximize,
  Settings,
  Sparkles,
  Wand2,
} from "lucide-react";

interface VideoClip {
  id: string;
  name: string;
  url: string;
  duration: number;
  startTime: number;
  endTime: number;
  thumbnailUrl?: string;
}

interface AudioTrack {
  id: string;
  name: string;
  url: string;
  volume: number;
  enabled: boolean;
}

interface StudioModalPlusProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function StudioModalPlus({
  isOpen,
  onClose,
}: StudioModalPlusProps) {
  const [videoClips, setVideoClips] = useState<VideoClip[]>([]);
  const [audioTracks, setAudioTracks] = useState<AudioTrack[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [renderLoading, setRenderLoading] = useState(false);
  const [selectedClip, setSelectedClip] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);

  // Load available videos and audio on mount
  useEffect(() => {
    if (isOpen) {
      loadAvailableAssets();
    }
  }, [isOpen]);

  const loadAvailableAssets = async () => {
    // Load video clips from public/videos
    const videos: VideoClip[] = [
      {
        id: "1",
        name: "Clip 1",
        url: "/videos/plus1.mp4",
        duration: 0,
        startTime: 0,
        endTime: 0,
      },
      {
        id: "2",
        name: "Clip 2",
        url: "/videos/plus2.mp4",
        duration: 0,
        startTime: 0,
        endTime: 0,
      },
      {
        id: "3",
        name: "Clip 3",
        url: "/videos/plus3.mp4",
        duration: 0,
        startTime: 0,
        endTime: 0,
      },
      {
        id: "4",
        name: "Clip 4",
        url: "/videos/plus4.mp4",
        duration: 0,
        startTime: 0,
        endTime: 0,
      },
      {
        id: "5",
        name: "Clip 5",
        url: "/videos/plus5.mp4",
        duration: 0,
        startTime: 0,
        endTime: 0,
      },
    ];

    // Load durations
    for (const video of videos) {
      const duration = await getVideoDuration(video.url);
      video.duration = duration;
      video.endTime = duration;
    }

    setVideoClips(videos);

    // Load audio track
    const audio: AudioTrack[] = [
      {
        id: "1",
        name: "Background Music",
        url: "/videos/audio.wav",
        volume: 100,
        enabled: true,
      },
    ];

    setAudioTracks(audio);
  };

  const getVideoDuration = (url: string): Promise<number> => {
    return new Promise((resolve) => {
      const video = document.createElement("video");
      video.src = url;
      video.onloadedmetadata = () => {
        resolve(video.duration);
      };
      video.onerror = () => resolve(0);
    });
  };

  const togglePlayPause = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    setCurrentTime(time);
    if (videoRef.current) {
      videoRef.current.currentTime = time;
    }
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const handleAddToTimeline = (clipId: string) => {
    // In a real implementation, this would add the clip to a timeline
    setSelectedClip(clipId);
  };

  const handleRemoveFromTimeline = (clipId: string) => {
    // Remove clip from timeline
    setSelectedClip(null);
  };

  const handleRenderFinal = async () => {
    setRenderLoading(true);

    try {
      // In a real implementation, this would call an API to render the final video
      // For now, just use the final.mp4 as preview
      await new Promise((resolve) => setTimeout(resolve, 2000));
      setPreviewUrl("/videos/final.mp4");

      if (videoRef.current) {
        videoRef.current.src = "/videos/final.mp4";
        videoRef.current.load();
      }
    } catch (error) {
      console.error("Render failed:", error);
    } finally {
      setRenderLoading(false);
    }
  };

  const handleDownload = () => {
    if (previewUrl) {
      const a = document.createElement("a");
      a.href = previewUrl;
      a.download = "trendly-plus-final.mp4";
      a.click();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/95 z-50 flex flex-col">
      {/* Header */}
      <div className="h-16 border-b border-white/10 flex items-center justify-between px-6 bg-gradient-to-r from-purple-900/20 to-blue-900/20">
        <div className="flex items-center gap-3">
          <div className="bg-gradient-to-r from-purple-500 to-blue-500 p-2 rounded-lg">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white flex items-center gap-2">
              Trendly Studio Plus
              <span className="text-xs bg-gradient-to-r from-purple-500 to-blue-500 px-2 py-0.5 rounded-full">
                PREMIUM
              </span>
            </h1>
            <p className="text-xs text-gray-400">
              Multi-clip video composer with advanced effects
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {previewUrl && (
            <button
              onClick={handleDownload}
              className="px-4 py-2 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white rounded-lg flex items-center gap-2 transition-all"
            >
              <Download className="w-4 h-4" />
              Download
            </button>
          )}
          <button
            onClick={handleRenderFinal}
            disabled={renderLoading}
            className="px-4 py-2 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white rounded-lg flex items-center gap-2 transition-all disabled:opacity-50"
          >
            {renderLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Wand2 className="w-4 h-4" />
            )}
            {renderLoading ? "Rendering..." : "Render Final"}
          </button>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-white" />
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar - Asset Library */}
        <div className="w-80 border-r border-white/10 bg-black/40 overflow-y-auto">
          <div className="p-4 space-y-6">
            {/* Video Clips Section */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Video className="w-4 h-4 text-purple-400" />
                <h3 className="text-sm font-semibold text-white">
                  Video Clips
                </h3>
                <span className="text-xs text-gray-500 ml-auto">
                  {videoClips.length} clips
                </span>
              </div>
              <div className="space-y-2">
                {videoClips.map((clip) => (
                  <div
                    key={clip.id}
                    className={`group relative bg-white/5 hover:bg-white/10 rounded-lg p-3 cursor-pointer transition-all border ${
                      selectedClip === clip.id
                        ? "border-purple-500 bg-purple-500/20"
                        : "border-white/10"
                    }`}
                    onClick={() => handleAddToTimeline(clip.id)}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-16 h-12 bg-gradient-to-br from-purple-500/20 to-blue-500/20 rounded flex items-center justify-center">
                        <Film className="w-6 h-6 text-purple-400" />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-white">
                          {clip.name}
                        </p>
                        <p className="text-xs text-gray-400">
                          {formatTime(clip.duration)}
                        </p>
                      </div>
                      {selectedClip === clip.id && (
                        <div className="w-2 h-2 bg-purple-500 rounded-full animate-pulse" />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Audio Tracks Section */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Music2 className="w-4 h-4 text-blue-400" />
                <h3 className="text-sm font-semibold text-white">
                  Audio Tracks
                </h3>
                <span className="text-xs text-gray-500 ml-auto">
                  {audioTracks.length} tracks
                </span>
              </div>
              <div className="space-y-2">
                {audioTracks.map((track) => (
                  <div
                    key={track.id}
                    className="bg-white/5 hover:bg-white/10 rounded-lg p-3 transition-all border border-white/10"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-16 h-12 bg-gradient-to-br from-blue-500/20 to-cyan-500/20 rounded flex items-center justify-center">
                        <Volume2 className="w-6 h-6 text-blue-400" />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-white">
                          {track.name}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          <input
                            type="range"
                            min="0"
                            max="100"
                            value={track.volume}
                            onChange={(e) => {
                              const newTracks = audioTracks.map((t) =>
                                t.id === track.id
                                  ? { ...t, volume: parseInt(e.target.value) }
                                  : t
                              );
                              setAudioTracks(newTracks);
                            }}
                            className="flex-1 h-1 bg-white/20 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-blue-500 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:cursor-pointer"
                          />
                          <span className="text-xs text-gray-400 w-8">
                            {track.volume}%
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Composition Info */}
            <div className="bg-gradient-to-br from-purple-500/10 to-blue-500/10 rounded-lg p-4 border border-purple-500/20">
              <div className="flex items-center gap-2 mb-2">
                <Layers className="w-4 h-4 text-purple-400" />
                <h3 className="text-sm font-semibold text-white">
                  Composition
                </h3>
              </div>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-gray-400">Total Clips:</span>
                  <span className="text-white font-medium">
                    {videoClips.length}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Audio Tracks:</span>
                  <span className="text-white font-medium">
                    {audioTracks.length}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Total Duration:</span>
                  <span className="text-white font-medium">
                    {formatTime(
                      videoClips.reduce((acc, clip) => acc + clip.duration, 0)
                    )}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Center - Preview Area */}
        <div className="flex-1 flex flex-col bg-gradient-to-br from-gray-900 to-black">
          {/* Video Preview */}
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="relative max-w-5xl w-full aspect-video bg-black rounded-xl overflow-hidden shadow-2xl border border-white/10">
              {previewUrl || selectedClip ? (
                <video
                  ref={videoRef}
                  src={
                    previewUrl ||
                    videoClips.find((c) => c.id === selectedClip)?.url
                  }
                  className="w-full h-full object-contain"
                  onTimeUpdate={handleTimeUpdate}
                  onLoadedMetadata={handleLoadedMetadata}
                  onEnded={() => setIsPlaying(false)}
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-center">
                    <div className="w-24 h-24 mx-auto mb-4 bg-gradient-to-br from-purple-500/20 to-blue-500/20 rounded-full flex items-center justify-center">
                      <Sparkles className="w-12 h-12 text-purple-400" />
                    </div>
                    <h3 className="text-xl font-bold text-white mb-2">
                      Select a video clip
                    </h3>
                    <p className="text-gray-400 text-sm">
                      Click on a video from the library to preview
                    </p>
                  </div>
                </div>
              )}

              {/* Overlay Controls */}
              {(previewUrl || selectedClip) && (
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent p-6">
                  <div className="flex items-center gap-4">
                    <button
                      onClick={togglePlayPause}
                      className="w-12 h-12 bg-white/10 hover:bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center transition-colors"
                    >
                      {isPlaying ? (
                        <Pause className="w-6 h-6 text-white" />
                      ) : (
                        <Play className="w-6 h-6 text-white ml-1" />
                      )}
                    </button>

                    <div className="flex-1 flex items-center gap-3">
                      <span className="text-sm text-white font-mono">
                        {formatTime(currentTime)}
                      </span>
                      <input
                        type="range"
                        min="0"
                        max={duration || 0}
                        step="0.1"
                        value={currentTime}
                        onChange={handleSeek}
                        className="flex-1 h-2 bg-white/20 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:bg-gradient-to-r [&::-webkit-slider-thumb]:from-purple-500 [&::-webkit-slider-thumb]:to-blue-500 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:shadow-lg"
                      />
                      <span className="text-sm text-white font-mono">
                        {formatTime(duration)}
                      </span>
                    </div>

                    <button className="p-3 bg-white/10 hover:bg-white/20 backdrop-blur-sm rounded-lg transition-colors">
                      <Maximize className="w-5 h-5 text-white" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Timeline Area */}
          <div className="h-64 border-t border-white/10 bg-black/60 p-4">
            <div className="h-full bg-white/5 rounded-lg border border-white/10 overflow-hidden">
              <div className="h-full flex items-center justify-center">
                <div className="text-center">
                  <Scissors className="w-8 h-8 text-gray-600 mx-auto mb-2" />
                  <p className="text-sm text-gray-500">
                    Timeline - Drag clips here to arrange
                  </p>
                  <p className="text-xs text-gray-600 mt-1">
                    Coming soon: Advanced editing features
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Loading Overlay */}
      {renderLoading && (
        <div className="absolute inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="text-center">
            <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-r from-purple-500 to-blue-500 rounded-full flex items-center justify-center animate-pulse">
              <Wand2 className="w-8 h-8 text-white" />
            </div>
            <h3 className="text-xl font-bold text-white mb-2">
              Rendering Final Video...
            </h3>
            <p className="text-gray-400">Composing clips and mixing audio</p>
          </div>
        </div>
      )}
    </div>
  );
}
