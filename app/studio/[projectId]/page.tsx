"use client";

/**
 * Studio Page: /studio/[projectId]
 *
 * 3-panel video editor:
 * - LEFT: Settings sidebar
 * - CENTER: Video preview
 * - RIGHT: Timeline editor
 */

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
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

export default function StudioPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.projectId as string;

  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeSection, setActiveSection] = useState<Section>("slideshow");
  const [renderLoading, setRenderLoading] = useState(false);
  const [renderProgress, setRenderProgress] = useState(0);
  const [renderStage, setRenderStage] = useState("");
  const [currentRenderJobId, setCurrentRenderJobId] = useState<string | null>(
    null
  );

  const videoRef = useRef<HTMLVideoElement>(null);

  // Load project
  useEffect(() => {
    loadProject();
  }, [projectId]);

  // Poll render status
  useEffect(() => {
    if (!currentRenderJobId) return;

    let pollCount = 0;
    const maxPolls = 300; // 10 minutes max (300 * 2 seconds)

    const interval = setInterval(async () => {
      pollCount++;

      // Safety timeout
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

          // Reload project to get video URL
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

      if (!response.ok) {
        throw new Error("Project not found");
      }

      const data = await response.json();
      setProject(data);
      setLoading(false);
    } catch (err) {
      console.error("Failed to load project:", err);
      alert("Failed to load project");
      router.push("/");
    }
  };

  const updateProject = async (updates: Partial<Project>) => {
    if (!project) return;

    try {
      const response = await fetch(`/api/studio/project/${projectId}/update`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });

      const updated = await response.json();
      setProject(updated);
    } catch (err) {
      console.error("Failed to update project:", err);
      alert("Failed to save changes");
    }
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

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-xl">Loading project...</div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-xl">Project not found</div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gray-900 text-white overflow-hidden">
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
      />

      {/* RIGHT PANEL */}
      <RightPanel project={project} onUpdate={updateProject} />
    </div>
  );
}

/**
 * Left Sidebar Component
 */
function LeftSidebar({
  activeSection,
  onSectionChange,
  project,
  onUpdate,
}: {
  activeSection: Section;
  onSectionChange: (section: Section) => void;
  project: Project;
  onUpdate: (updates: Partial<Project>) => void;
}) {
  const sections: { id: Section; label: string; icon: string }[] = [
    { id: "slideshow", label: "Slideshow", icon: "🎞️" },
    { id: "banner", label: "Bottom Banner", icon: "📋" },
    { id: "endscreen", label: "End Screen", icon: "🏁" },
    { id: "qr", label: "QR Code", icon: "📱" },
    { id: "music", label: "Music", icon: "🎵" },
    { id: "voice", label: "Voice & Script", icon: "🎙️" },
  ];

  return (
    <div className="w-80 bg-gray-800 border-r border-gray-700 flex flex-col">
      <div className="p-4 border-b border-gray-700">
        <h1 className="text-xl font-bold">Studio</h1>
        <p className="text-sm text-gray-400">{project.business.title}</p>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Section Buttons */}
        <div className="p-2">
          {sections.map((section) => (
            <button
              key={section.id}
              onClick={() => onSectionChange(section.id)}
              className={`w-full text-left px-4 py-3 rounded-lg mb-2 flex items-center gap-3 transition ${
                activeSection === section.id
                  ? "bg-blue-600 text-white"
                  : "hover:bg-gray-700 text-gray-300"
              }`}
            >
              <span className="text-2xl">{section.icon}</span>
              <span>{section.label}</span>
            </button>
          ))}
        </div>

        {/* Section Controls */}
        <div className="p-4 border-t border-gray-700">
          {activeSection === "slideshow" && (
            <SlideshowControls project={project} onUpdate={onUpdate} />
          )}
          {activeSection === "banner" && (
            <BannerControls project={project} onUpdate={onUpdate} />
          )}
          {activeSection === "endscreen" && (
            <EndScreenControls project={project} onUpdate={onUpdate} />
          )}
          {activeSection === "qr" && (
            <QRControls project={project} onUpdate={onUpdate} />
          )}
          {activeSection === "music" && (
            <MusicControls project={project} onUpdate={onUpdate} />
          )}
          {activeSection === "voice" && (
            <VoiceControls project={project} onUpdate={onUpdate} />
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Slideshow Controls
 */
function SlideshowControls({
  project,
  onUpdate,
}: {
  project: Project;
  onUpdate: any;
}) {
  return (
    <div className="space-y-4">
      <h3 className="font-bold">Slideshow Settings</h3>
      <div>
        <label className="block text-sm text-gray-400 mb-1">Total Slides</label>
        <div className="text-2xl font-bold">{project.slides.length}</div>
      </div>
      <div>
        <label className="block text-sm text-gray-400 mb-1">
          Total Duration
        </label>
        <div className="text-lg">
          {project.slides[project.slides.length - 1]?.endTime || 0}s
        </div>
      </div>
      <p className="text-sm text-gray-400">
        Adjust slide timing in the timeline →
      </p>
    </div>
  );
}

/**
 * Banner Controls
 */
function BannerControls({
  project,
  onUpdate,
}: {
  project: Project;
  onUpdate: any;
}) {
  const [banner, setBanner] = useState(project.bottomBanner);

  const handleChange = (updates: Partial<BottomBanner>) => {
    const updated = { ...banner, ...updates };
    setBanner(updated);
    onUpdate({ bottomBanner: updated });
  };

  return (
    <div className="space-y-4">
      <h3 className="font-bold">Bottom Banner</h3>

      <div>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={banner.enabled}
            onChange={(e) => handleChange({ enabled: e.target.checked })}
            className="w-4 h-4"
          />
          <span>Enable Banner</span>
        </label>
      </div>

      {banner.enabled && (
        <>
          <div>
            <label className="block text-sm text-gray-400 mb-1">
              Banner Text
            </label>
            <input
              type="text"
              value={banner.text}
              onChange={(e) => handleChange({ text: e.target.value })}
              className="w-full px-3 py-2 bg-gray-700 rounded"
              placeholder="Enter text..."
            />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">
              Font Size
            </label>
            <input
              type="number"
              value={banner.fontSize}
              onChange={(e) =>
                handleChange({ fontSize: parseInt(e.target.value) })
              }
              className="w-full px-3 py-2 bg-gray-700 rounded"
              placeholder="font size"
              min="16"
              max="64"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-sm text-gray-400 mb-1">
                Text Color
              </label>
              <input
                type="color"
                value={banner.textColor}
                onChange={(e) => handleChange({ textColor: e.target.value })}
                className="w-full h-10 bg-gray-700 rounded"
                placeholder="text color"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">
                Background
              </label>
              <input
                type="color"
                value={banner.backgroundColor}
                onChange={(e) =>
                  handleChange({ backgroundColor: e.target.value })
                }
                className="w-full h-10 bg-gray-700 rounded"
                placeholder="background color"
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * End Screen Controls
 */
function EndScreenControls({
  project,
  onUpdate,
}: {
  project: Project;
  onUpdate: any;
}) {
  const [endScreen, setEndScreen] = useState(project.endScreen);

  const handleChange = (updates: Partial<EndScreen>) => {
    const updated = { ...endScreen, ...updates };
    setEndScreen(updated);
    onUpdate({ endScreen: updated });
  };

  return (
    <div className="space-y-4">
      <h3 className="font-bold">End Screen</h3>

      <div>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={endScreen.enabled}
            onChange={(e) => handleChange({ enabled: e.target.checked })}
            className="w-4 h-4"
          />
          <span>Enable End Screen</span>
        </label>
      </div>

      {endScreen.enabled && (
        <>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Content</label>
            <textarea
              value={endScreen.content}
              onChange={(e) => handleChange({ content: e.target.value })}
              className="w-full px-3 py-2 bg-gray-700 rounded h-24"
              placeholder="Thank you message..."
            />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">
              Duration (seconds)
            </label>
            <input
              type="number"
              value={endScreen.duration}
              onChange={(e) =>
                handleChange({ duration: parseInt(e.target.value) })
              }
              className="w-full px-3 py-2 bg-gray-700 rounded"
              placeholder="duration"
              min="1"
              max="10"
            />
          </div>
        </>
      )}
    </div>
  );
}

/**
 * QR Code Controls
 */
function QRControls({
  project,
  onUpdate,
}: {
  project: Project;
  onUpdate: any;
}) {
  const [qr, setQR] = useState(project.qrCode);

  const handleChange = (updates: Partial<QRCode>) => {
    const updated = { ...qr, ...updates };
    setQR(updated);
    onUpdate({ qrCode: updated });
  };

  return (
    <div className="space-y-4">
      <h3 className="font-bold">QR Code</h3>

      <div>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={qr.enabled}
            onChange={(e) => handleChange({ enabled: e.target.checked })}
            className="w-4 h-4"
          />
          <span>Enable QR Code</span>
        </label>
      </div>

      {qr.enabled && (
        <>
          <div>
            <label className="block text-sm text-gray-400 mb-1">URL</label>
            <input
              type="url"
              value={qr.url}
              onChange={(e) => handleChange({ url: e.target.value })}
              className="w-full px-3 py-2 bg-gray-700 rounded"
              placeholder="https://..."
            />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Position</label>
            <select
              value={qr.position}
              onChange={(e) =>
                handleChange({ position: e.target.value as any })
              }
              className="w-full px-3 py-2 bg-gray-700 rounded"
            >
              <option value="top-left">Top Left</option>
              <option value="top-right">Top Right</option>
              <option value="bottom-left">Bottom Left</option>
              <option value="bottom-right">Bottom Right</option>
            </select>
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">
              Size (px)
            </label>
            <input
              type="number"
              value={qr.size}
              onChange={(e) => handleChange({ size: parseInt(e.target.value) })}
              className="w-full px-3 py-2 bg-gray-700 rounded"
              min="50"
              max="300"
              step="10"
            />
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Music Controls
 */
function MusicControls({
  project,
  onUpdate,
}: {
  project: Project;
  onUpdate: any;
}) {
  const [music, setMusic] = useState(project.music);

  const handleChange = (updates: Partial<Music>) => {
    const updated = { ...music, ...updates };
    setMusic(updated);
    onUpdate({ music: updated });
  };

  return (
    <div className="space-y-4">
      <h3 className="font-bold">Background Music</h3>

      <div>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={music.enabled}
            onChange={(e) => handleChange({ enabled: e.target.checked })}
            className="w-4 h-4"
          />
          <span>Enable Music</span>
        </label>
      </div>

      {music.enabled && (
        <>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Volume</label>
            <input
              type="range"
              value={music.volume}
              onChange={(e) =>
                handleChange({ volume: parseInt(e.target.value) })
              }
              className="w-full"
              min="0"
              max="100"
            />
            <div className="text-sm text-gray-400 text-center">
              {music.volume}%
            </div>
          </div>

          <div>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={music.loop}
                onChange={(e) => handleChange({ loop: e.target.checked })}
                className="w-4 h-4"
              />
              <span>Loop Music</span>
            </label>
          </div>

          <p className="text-sm text-gray-400">
            Music upload coming soon. Use default track for now.
          </p>
        </>
      )}
    </div>
  );
}

/**
 * Voice Controls
 */
function VoiceControls({
  project,
  onUpdate,
}: {
  project: Project;
  onUpdate: any;
}) {
  const [voice, setVoice] = useState(project.voice);

  const handleChange = (updates: Partial<Voice>) => {
    const updated = { ...voice, ...updates };
    setVoice(updated);
    onUpdate({ voice: updated });
  };

  return (
    <div className="space-y-4">
      <h3 className="font-bold">Voice & Script</h3>

      <div>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={voice.enabled}
            onChange={(e) => handleChange({ enabled: e.target.checked })}
            className="w-4 h-4"
          />
          <span>Enable Voice</span>
        </label>
      </div>

      {voice.enabled && (
        <>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Script</label>
            <textarea
              value={voice.script}
              onChange={(e) => handleChange({ script: e.target.value })}
              className="w-full px-3 py-2 bg-gray-700 rounded h-32"
              placeholder="Enter script..."
            />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">
              Voice Type
            </label>
            <select
              value={voice.voice}
              onChange={(e) =>
                handleChange({ voice: e.target.value as "male" | "female" })
              }
              className="w-full px-3 py-2 bg-gray-700 rounded"
            >
              <option value="female">Female</option>
              <option value="male">Male</option>
            </select>
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Speed</label>
            <input
              type="range"
              value={voice.speed}
              onChange={(e) =>
                handleChange({ speed: parseFloat(e.target.value) })
              }
              className="w-full"
              min="0.5"
              max="2"
              step="0.1"
            />
            <div className="text-sm text-gray-400 text-center">
              {voice.speed}x
            </div>
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Volume</label>
            <input
              type="range"
              value={voice.volume}
              onChange={(e) =>
                handleChange({ volume: parseInt(e.target.value) })
              }
              className="w-full"
              min="0"
              max="100"
            />
            <div className="text-sm text-gray-400 text-center">
              {voice.volume}%
            </div>
          </div>

          <p className="text-sm text-yellow-400">
            Requires espeak-ng. Install: choco install espeak-ng
          </p>
        </>
      )}
    </div>
  );
}

/**
 * Center Panel Component
 */
function CenterPanel({
  project,
  videoRef,
  renderLoading,
  renderProgress,
  renderStage,
  onRenderPreview,
  onRenderFinal,
}: {
  project: Project;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  renderLoading: boolean;
  renderProgress: number;
  renderStage: string;
  onRenderPreview: () => void;
  onRenderFinal: () => void;
}) {
  const videoUrl = project.previewVideoUrl || project.finalVideoUrl;

  return (
    <div className="flex-1 flex flex-col bg-gray-900">
      <div className="p-4 border-b border-gray-700">
        <h2 className="text-lg font-bold">Preview</h2>
      </div>

      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-4xl">
          {videoUrl ? (
            <video
              ref={videoRef}
              src={videoUrl}
              controls
              className="w-full rounded-lg shadow-2xl"
            />
          ) : (
            <div className="aspect-video bg-gray-800 rounded-lg flex items-center justify-center">
              <div className="text-center">
                <p className="text-gray-400 mb-4">No preview yet</p>
                <button
                  onClick={onRenderPreview}
                  disabled={renderLoading}
                  className="px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50"
                >
                  Generate Preview
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {renderLoading && (
        <div className="p-4 bg-gray-800 border-t border-gray-700">
          <div className="mb-2 flex justify-between text-sm">
            <span>{renderStage}</span>
            <span>{renderProgress}%</span>
          </div>
          <div className="w-full bg-gray-700 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all"
              style={{ width: `${renderProgress}%` }}
            />
          </div>
        </div>
      )}

      <div className="p-4 border-t border-gray-700 flex gap-4">
        <button
          onClick={onRenderPreview}
          disabled={renderLoading}
          className="flex-1 px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50 font-bold"
        >
          {renderLoading ? "Rendering..." : "Preview (720p)"}
        </button>
        <button
          onClick={onRenderFinal}
          disabled={renderLoading}
          className="flex-1 px-6 py-3 bg-green-600 hover:bg-green-700 rounded-lg disabled:opacity-50 font-bold"
        >
          Export Final (1080p)
        </button>
      </div>
    </div>
  );
}

/**
 * Right Panel Component
 */
function RightPanel({
  project,
  onUpdate,
}: {
  project: Project;
  onUpdate: (updates: Partial<Project>) => void;
}) {
  const handleDurationChange = (index: number, newDuration: number) => {
    const slides = [...project.slides];
    const slide = slides[index];

    slide.endTime = slide.startTime + newDuration;

    // Adjust subsequent slides
    for (let i = index + 1; i < slides.length; i++) {
      const prevSlide = slides[i - 1];
      const currentDuration = slides[i].endTime - slides[i].startTime;
      slides[i].startTime = prevSlide.endTime;
      slides[i].endTime = slides[i].startTime + currentDuration;
    }

    onUpdate({ slides });
  };

  const totalDuration = project.slides[project.slides.length - 1]?.endTime || 0;

  return (
    <div className="w-96 bg-gray-800 border-l border-gray-700 flex flex-col">
      <div className="p-4 border-b border-gray-700">
        <h2 className="text-lg font-bold">Timeline</h2>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div className="mb-4">
          <div className="text-sm text-gray-400">Total Duration</div>
          <div className="text-2xl font-bold">{totalDuration.toFixed(1)}s</div>
        </div>

        {/* Slideshow Track */}
        <div>
          <h3 className="text-sm font-bold mb-2 text-blue-400">🎞️ SLIDESHOW</h3>
          <div className="space-y-2">
            {project.slides.map((slide, index) => (
              <div key={slide.id} className="bg-gray-700 rounded p-3">
                <div className="flex items-center gap-2 mb-2">
                  <img
                    src={slide.imageUrl}
                    alt={`Slide ${index + 1}`}
                    className="w-16 h-16 object-cover rounded"
                  />
                  <div className="flex-1">
                    <div className="font-bold">Slide {index + 1}</div>
                    <div className="text-xs text-gray-400">
                      {slide.startTime.toFixed(1)}s - {slide.endTime.toFixed(1)}
                      s
                    </div>
                  </div>
                </div>
                <div>
                  <label className="text-xs text-gray-400">
                    Duration (seconds)
                  </label>
                  <input
                    type="number"
                    value={(slide.endTime - slide.startTime).toFixed(1)}
                    onChange={(e) =>
                      handleDurationChange(index, parseFloat(e.target.value))
                    }
                    className="w-full px-2 py-1 bg-gray-600 rounded text-sm mt-1"
                    min="0.5"
                    step="0.5"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Banner Track */}
        {project.bottomBanner.enabled && (
          <div>
            <h3 className="text-sm font-bold mb-2 text-purple-400">
              📋 BANNER
            </h3>
            <div className="bg-purple-900/30 rounded p-2 text-sm">
              <div>"{project.bottomBanner.text}"</div>
              <div className="text-xs text-gray-400 mt-1">
                0s - {totalDuration}s
              </div>
            </div>
          </div>
        )}

        {/* QR Track */}
        {project.qrCode.enabled && (
          <div>
            <h3 className="text-sm font-bold mb-2 text-green-400">
              📱 QR CODE
            </h3>
            <div className="bg-green-900/30 rounded p-2 text-sm">
              <div className="truncate">{project.qrCode.url}</div>
              <div className="text-xs text-gray-400 mt-1">
                Position: {project.qrCode.position}
              </div>
            </div>
          </div>
        )}

        {/* Voice Track */}
        {project.voice.enabled && (
          <div>
            <h3 className="text-sm font-bold mb-2 text-yellow-400">🎙️ VOICE</h3>
            <div className="bg-yellow-900/30 rounded p-2 text-sm">
              <div className="truncate">
                {project.voice.script.substring(0, 50)}...
              </div>
              <div className="text-xs text-gray-400 mt-1">
                {project.voice.voice} voice, {project.voice.speed}x speed
              </div>
            </div>
          </div>
        )}

        {/* End Screen */}
        {project.endScreen.enabled && (
          <div>
            <h3 className="text-sm font-bold mb-2 text-red-400">
              🏁 END SCREEN
            </h3>
            <div className="bg-red-900/30 rounded p-2 text-sm">
              <div className="truncate">{project.endScreen.content}</div>
              <div className="text-xs text-gray-400 mt-1">
                Duration: {project.endScreen.duration}s
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
