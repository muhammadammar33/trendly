"use client";

import { Search } from "lucide-react";
import { useState } from "react";
import type { ScrapeResult } from "@/lib/types";
import StudioModal from "@/app/components/StudioModalV2";

export default function Home() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ScrapeResult | null>(null);
  const [studioProjectId, setStudioProjectId] = useState<string | null>(null);
  const [isStudioOpen, setIsStudioOpen] = useState(false);

  const handleScrape = async () => {
    if (!url.trim()) {
      setError("Please enter a URL");
      return;
    }

    setLoading(true);
    setError("");

    try {
      // Step 1: Scrape website
      const scrapeResponse = await fetch("/api/scrape", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url: url.trim(),
          enableCrawling: true, // Enable multi-page crawling for better images
        }),
      });

      const scraperResult = await scrapeResponse.json();

      if (scraperResult.status === "error") {
        setError(scraperResult.error || "Failed to scrape website");
        setLoading(false);
        return;
      }

      // Step 2: Auto-create studio project
      const projectResponse = await fetch("/api/studio/project/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          scraperResult,
          maxSlides: 10,
          defaultSlideDuration: 3,
        }),
      });

      const projectData = await projectResponse.json();

      if (projectData.projectId) {
        // Step 3: Auto-open studio modal
        console.log("[Home] Opening studio modal:", projectData.projectId);
        setResult(scraperResult);
        setStudioProjectId(projectData.projectId);
        setIsStudioOpen(true);
        setLoading(false);
      } else {
        setError(projectData.error || "Failed to create studio project");
        setLoading(false);
      }
    } catch (err: any) {
      setError(err.message || "Network error occurred");
      setLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !loading) {
      handleScrape();
    }
  };

  return (
    <div className="relative min-h-screen bg-black overflow-hidden">
      {/* Red gradient background */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="w-[1000px] h-[600px] bg-red-600/40 rounded-full blur-[120px]" />
      </div>

      <main className="relative flex min-h-screen flex-col items-center justify-center px-6 py-12">
        {/* Logo */}
        <div className="mb-12">
          <p className="text-red-400 text-xl font-semibold tracking-widest uppercase mb-8">
            TRENDLY
          </p>
        </div>

        {/* Hero Text */}
        <div className="max-w-5xl text-center mb-6">
          <h1 className="text-5xl md:text-6xl font-bold text-white mb-6 leading-tight">
            Not innovative? No issue.
            <br />
            We have everything you need.
          </h1>
          <p className="text-lg md:text-lg text-gray-300 mb-12">
            We'll quickly transform your company name or URL into a television
            advertisement.
          </p>
        </div>

        {/* Search Input */}
        <div className="w-full max-w-2xl mb-12">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-200 w-5 h-5 z-20" />
            <div className="relative bg-black rounded-lg border-2 border-red-700/30 overflow-hidden animate-[borderGlow_2s_ease-in-out_infinite]">
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Enter your business url"
                className="relative w-full px-12 py-4 bg-black border-none rounded-lg text-white placeholder:text-gray-400 focus:outline-none z-10"
                disabled={loading}
              />
            </div>
          </div>
        </div>

        {error && (
          <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
            {error}
          </div>
        )}

        {/* Full-Screen Loading Modal */}
        {loading && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
            <div className="bg-gradient-to-br from-gray-900 to-black rounded-2xl shadow-2xl p-16 text-center border border-red-700/30 max-w-md mx-4">
              <div className="inline-block animate-spin rounded-full h-16 w-16 border-4 border-red-900/30 border-t-red-500 mb-6"></div>
              <h3 className="text-2xl font-bold text-white mb-3">
                Analyzing Website
              </h3>
              <p className="text-gray-400 mb-4">
                Please wait while we process your URL...
              </p>
              <div className="flex items-center justify-center gap-1">
                <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
                <div
                  className="w-2 h-2 bg-red-500 rounded-full animate-pulse"
                  style={{ animationDelay: "0.2s" }}
                ></div>
                <div
                  className="w-2 h-2 bg-red-500 rounded-full animate-pulse"
                  style={{ animationDelay: "0.4s" }}
                ></div>
              </div>
            </div>
          </div>
        )}

        {/* Features */}
        <div className="flex flex-col md:flex-row gap-8 md:gap-12 items-center justify-center text-center md:text-left">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center">
              <svg
                className="w-3 h-3 text-black"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={3}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <p className="text-white text-sm md:text-base">
              Video ready in less than 30 seconds
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center">
              <svg
                className="w-3 h-3 text-black"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={3}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <p className="text-white text-sm md:text-base">100% free</p>
          </div>

          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center">
              <svg
                className="w-3 h-3 text-black"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={3}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <p className="text-white text-sm md:text-base">
              Based on your business & customizable
            </p>
          </div>
        </div>
      </main>

      {/* Studio Modal */}
      {studioProjectId && (
        <StudioModal
          projectId={studioProjectId}
          isOpen={isStudioOpen}
          onClose={() => {
            setIsStudioOpen(false);
            setStudioProjectId(null);
            setResult(null);
          }}
        />
      )}
    </div>
  );
}
