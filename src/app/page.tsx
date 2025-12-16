"use client";

import { useEffect, useState, useCallback } from "react";

interface PriceData {
  id: string;
  date: string;
  closePrice: number;
  dailyChange: number | null;
  dailyChangePct: number | null;
  volatility7d: number | null;
  sma20: number | null;
  sma50: number | null;
  sma200: number | null;
}

interface SwingResult {
  startDate: string;
  endDate: string;
  startPrice: number;
  endPrice: number;
  changePercent: number;
  durationDays: number;
  direction: "up" | "down";
}

interface PredictionSignal {
  source: string;
  name: string;
  direction: "bullish" | "bearish" | "neutral";
  strength: number;
  description: string;
}

interface Prediction {
  currentPrice: number;
  predictedDirection: "up" | "down" | "sideways";
  predictedChange: number;
  confidence: number;
  timeHorizon: string;
  signals: PredictionSignal[];
  reasoning: string;
}

interface TrainingResult {
  epoch: number;
  accuracy: number;
  patternWeights: { pattern: string; accuracy: number; occurrences: number }[];
}

interface AnalysisArticle {
  id: string;
  articleId: string;
  title: string;
  publishedAt: string;
  url: string;
  impactScore: number;
  confidence: number;
  reasoning: string;
  matchedKeywords: string[];
  humanRating: number | null;
  humanVerified: boolean;
}

interface AnalysisResult {
  priceChange: { date: string; changePct: number };
  newsRange: { start: string; end: string; lookbackDays: number };
  searchTerms: string[];
  articlesFound: number;
  articles: AnalysisArticle[];
  summary: {
    avgImpactScore: number;
    bullishCount: number;
    bearishCount: number;
    neutralCount: number;
  };
}

export default function GoldAI() {
  const [activeTab, setActiveTab] = useState<"overview" | "analyze" | "brain" | "predict" | "train">("overview");
  const [latestPrice, setLatestPrice] = useState<PriceData | null>(null);
  const [prediction, setPrediction] = useState<Prediction | null>(null);
  const [swings, setSwings] = useState<SwingResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  
  // Brain query states
  const [dateQuery, setDateQuery] = useState("");
  const [dateResult, setDateResult] = useState<PriceData | null>(null);
  const [swingThreshold, setSwingThreshold] = useState("2");
  
  // Training states
  const [trainingEpochs, setTrainingEpochs] = useState("10");
  const [trainingResult, setTrainingResult] = useState<TrainingResult | null>(null);
  const [isTraining, setIsTraining] = useState(false);

  // Analysis states
  const [selectedSwing, setSelectedSwing] = useState<SwingResult | null>(null);
  const [lookbackDays, setLookbackDays] = useState(7);
  const [searchTerms, setSearchTerms] = useState("gold price, inflation, federal reserve, dollar");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [articleRatings, setArticleRatings] = useState<Record<string, number>>({});

  const fetchLatestPrice = useCallback(async () => {
    try {
      const res = await fetch("/api/gold?action=latest");
      const data = await res.json();
      if (data.success) setLatestPrice(data.data);
    } catch (e) {
      console.error(e);
    }
  }, []);

  const fetchPrediction = useCallback(async () => {
    try {
      const res = await fetch("/api/predict");
      const data = await res.json();
      if (data.success) setPrediction(data.prediction);
    } catch (e) {
      console.error(e);
    }
  }, []);

  const fetchSwings = useCallback(async () => {
    try {
      const res = await fetch(`/api/gold?action=swings&minSwing=${swingThreshold}`);
      const data = await res.json();
      if (data.success) setSwings(data.data?.slice(0, 30) || []);
    } catch (e) {
      console.error(e);
    }
  }, [swingThreshold]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      await Promise.all([fetchLatestPrice(), fetchPrediction(), fetchSwings()]);
      setLoading(false);
    };
    load();
  }, [fetchLatestPrice, fetchPrediction, fetchSwings]);

  const searchDate = async () => {
    if (!dateQuery) return;
    setStatus("Searching...");
    try {
      const res = await fetch(`/api/gold?action=date&date=${dateQuery}`);
      const data = await res.json();
      if (data.success) {
        setDateResult(data.data?.price || null);
        setStatus("");
      } else {
        setStatus("No data found for this date");
      }
    } catch (e) {
      setStatus("Error searching");
    }
  };

  const fetchLivePrice = async () => {
    setStatus("Fetching live price from Metal API...");
    try {
      const res = await fetch("/api/gold", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "fetch-live-price" }),
      });
      const data = await res.json();
      if (data.success) {
        setStatus(`Live price: $${data.data?.price?.toFixed(2) || "N/A"}`);
        await fetchLatestPrice();
      } else {
        setStatus("Failed to fetch live price");
      }
    } catch (e) {
      setStatus("Error fetching live price");
    }
  };

  const runTraining = async () => {
    setIsTraining(true);
    setStatus("Training ML model...");
    try {
      const res = await fetch("/api/train", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ epochs: parseInt(trainingEpochs) }),
      });
      const data = await res.json();
      if (data.success) {
        setTrainingResult(data.finalMetrics);
        setStatus(`Training complete! Accuracy: ${(data.finalMetrics.accuracy * 100).toFixed(1)}%`);
      }
    } catch (e) {
      setStatus("Training failed");
    }
    setIsTraining(false);
  };

  const runAnalysis = async () => {
    if (!selectedSwing) {
      setStatus("Please select a price swing first");
      return;
    }

    setIsAnalyzing(true);
    setStatus("Fetching news and analyzing impact...");
    setAnalysisResult(null);

    try {
      const priceDate = new Date(selectedSwing.endDate);
      const newsEndDate = new Date(priceDate);
      const newsStartDate = new Date(priceDate);
      newsStartDate.setDate(newsStartDate.getDate() - lookbackDays);

      const terms = searchTerms.split(",").map((t) => t.trim()).filter((t) => t);

      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startDate: newsStartDate.toISOString(),
          endDate: newsEndDate.toISOString(),
          priceChangeDate: selectedSwing.endDate,
          priceChangePct: selectedSwing.changePercent,
          lookbackDays,
          searchTerms: terms,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setAnalysisResult(data.data);
        setStatus(`Found ${data.data.articlesFound} articles. Review and rate their impact.`);
      } else {
        setStatus(`Analysis failed: ${data.error}`);
      }
    } catch (e) {
      setStatus("Analysis failed");
    }
    setIsAnalyzing(false);
  };

  const submitRating = async (quantificationId: string, rating: number) => {
    try {
      await fetch("/api/analyze", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quantificationId, rating }),
      });
      
      setArticleRatings((prev) => ({ ...prev, [quantificationId]: rating }));
      
      // Update the article in analysisResult
      if (analysisResult) {
        setAnalysisResult({
          ...analysisResult,
          articles: analysisResult.articles.map((a) =>
            a.id === quantificationId ? { ...a, humanRating: rating, humanVerified: true } : a
          ),
        });
      }
    } catch (e) {
      console.error("Failed to submit rating:", e);
    }
  };

  const formatDate = (d: string) => new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  const formatPrice = (p: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(p);

  const tabs = [
    { id: "overview", label: "Overview", icon: "◈" },
    { id: "analyze", label: "Analyze", icon: "🔍" },
    { id: "brain", label: "Brain", icon: "🧠" },
    { id: "predict", label: "Predict", icon: "🔮" },
    { id: "train", label: "Train", icon: "⚡" },
  ] as const;

  return (
    <main className="min-h-screen bg-[#07090f]">
      {/* Header */}
      <header className="border-b border-[rgba(255,215,0,0.1)] bg-[#0a0d14]/90 backdrop-blur sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-yellow-400 to-yellow-600 flex items-center justify-center shadow-lg shadow-yellow-500/20">
              <span className="text-black font-bold text-sm">Au</span>
            </div>
            <div>
              <h1 className="text-xl font-bold text-white tracking-tight">Gold AI</h1>
              <p className="text-xs text-gray-500">Market Intelligence System</p>
            </div>
          </div>
          
          {latestPrice && (
            <div className="text-right">
              <div className="text-2xl font-bold text-yellow-400 font-mono">
                {formatPrice(latestPrice.closePrice)}
              </div>
              <div className={`text-sm ${(latestPrice.dailyChangePct || 0) >= 0 ? "text-green-400" : "text-red-400"}`}>
                {(latestPrice.dailyChangePct || 0) >= 0 ? "▲" : "▼"} {Math.abs(latestPrice.dailyChangePct || 0).toFixed(2)}%
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Navigation */}
      <nav className="border-b border-[rgba(255,215,0,0.08)] bg-[#0a0d14]/50">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex gap-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-5 py-3 text-sm font-medium transition-all border-b-2 ${
                  activeTab === tab.id
                    ? "border-yellow-500 text-yellow-400 bg-yellow-500/5"
                    : "border-transparent text-gray-400 hover:text-gray-200 hover:bg-white/5"
                }`}
              >
                <span className="mr-2">{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </nav>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Status Bar */}
        {status && (
          <div className="mb-6 px-4 py-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-yellow-300 text-sm">
            {status}
          </div>
        )}

        {/* Overview Tab */}
        {activeTab === "overview" && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-gradient-to-br from-[#161b22] to-[#0d1117] rounded-2xl p-6 border border-yellow-500/10 shadow-xl">
                <div className="text-xs text-gray-500 uppercase tracking-wider mb-2">Gold Price</div>
                <div className="text-3xl font-bold text-yellow-400 font-mono">
                  {latestPrice ? formatPrice(latestPrice.closePrice) : "—"}
                </div>
                <div className="text-xs text-gray-500 mt-2">{latestPrice ? formatDate(latestPrice.date) : ""}</div>
              </div>

              <div className="bg-[#161b22] rounded-2xl p-6 border border-white/5">
                <div className="text-xs text-gray-500 uppercase tracking-wider mb-2">SMA 50</div>
                <div className="text-2xl font-semibold text-blue-400 font-mono">
                  {latestPrice?.sma50 ? formatPrice(latestPrice.sma50) : "—"}
                </div>
                <div className={`text-xs mt-2 ${latestPrice && latestPrice.sma50 && latestPrice.closePrice > latestPrice.sma50 ? "text-green-400" : "text-red-400"}`}>
                  {latestPrice?.sma50 ? (latestPrice.closePrice > latestPrice.sma50 ? "Price Above" : "Price Below") : ""}
                </div>
              </div>

              <div className="bg-[#161b22] rounded-2xl p-6 border border-white/5">
                <div className="text-xs text-gray-500 uppercase tracking-wider mb-2">SMA 200</div>
                <div className="text-2xl font-semibold text-purple-400 font-mono">
                  {latestPrice?.sma200 ? formatPrice(latestPrice.sma200) : "—"}
                </div>
                <div className={`text-xs mt-2 ${latestPrice && latestPrice.sma200 && latestPrice.closePrice > latestPrice.sma200 ? "text-green-400" : "text-red-400"}`}>
                  {latestPrice?.sma200 ? (latestPrice.closePrice > latestPrice.sma200 ? "Price Above" : "Price Below") : ""}
                </div>
              </div>

              <div className="bg-[#161b22] rounded-2xl p-6 border border-white/5">
                <div className="text-xs text-gray-500 uppercase tracking-wider mb-2">Prediction</div>
                <div className={`text-2xl font-bold ${prediction?.predictedDirection === "up" ? "text-green-400" : prediction?.predictedDirection === "down" ? "text-red-400" : "text-gray-400"}`}>
                  {prediction?.predictedDirection === "up" ? "▲ BULLISH" : prediction?.predictedDirection === "down" ? "▼ BEARISH" : "→ NEUTRAL"}
                </div>
                <div className="text-xs text-gray-500 mt-2">{prediction ? `${prediction.confidence.toFixed(0)}% confidence` : ""}</div>
              </div>
            </div>

            {prediction && prediction.signals.length > 0 && (
              <div className="bg-[#161b22] rounded-2xl p-6 border border-white/5">
                <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                  <span className="text-yellow-400">🔮</span> Active Signals
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {prediction.signals.map((signal, i) => (
                    <div key={i} className={`p-4 rounded-xl border ${
                      signal.direction === "bullish" ? "bg-green-500/5 border-green-500/20" :
                      signal.direction === "bearish" ? "bg-red-500/5 border-red-500/20" :
                      "bg-gray-500/5 border-gray-500/20"
                    }`}>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-white">{signal.name}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          signal.direction === "bullish" ? "bg-green-500/20 text-green-400" :
                          signal.direction === "bearish" ? "bg-red-500/20 text-red-400" :
                          "bg-gray-500/20 text-gray-400"
                        }`}>
                          {signal.direction}
                        </span>
                      </div>
                      <div className="text-xs text-gray-400">{signal.description}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-3 flex-wrap">
              <button onClick={fetchLivePrice} className="px-4 py-2 bg-yellow-500 text-black font-semibold rounded-lg hover:bg-yellow-400 transition">
                📡 Fetch Live Price
              </button>
              <button onClick={() => { fetchPrediction(); setStatus("Refreshed prediction"); }} className="px-4 py-2 bg-[#161b22] text-white border border-white/10 rounded-lg hover:bg-white/5 transition">
                🔮 Refresh Prediction
              </button>
            </div>
          </div>
        )}

        {/* Analyze Tab */}
        {activeTab === "analyze" && (
          <div className="space-y-6">
            {/* Step 1: Select Swing */}
            <div className="bg-[#161b22] rounded-2xl p-6 border border-white/5">
              <h3 className="text-lg font-semibold text-white mb-4">
                <span className="text-yellow-400 mr-2">1.</span> Select a Price Swing
              </h3>
              
              <div className="flex items-center gap-3 mb-4">
                <span className="text-sm text-gray-400">Min change %:</span>
                <input
                  type="number"
                  value={swingThreshold}
                  onChange={(e) => setSwingThreshold(e.target.value)}
                  className="w-20 px-3 py-1.5 bg-black/30 border border-white/10 rounded-lg text-white text-center"
                  step="0.5"
                />
                <button onClick={fetchSwings} className="px-4 py-1.5 bg-yellow-500 text-black font-semibold rounded-lg hover:bg-yellow-400 transition text-sm">
                  Search
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-80 overflow-y-auto">
                {swings.map((swing, i) => (
                  <button
                    key={i}
                    onClick={() => setSelectedSwing(swing)}
                    className={`p-4 rounded-xl border text-left transition ${
                      selectedSwing === swing
                        ? "border-yellow-500 bg-yellow-500/10"
                        : "border-white/5 bg-black/20 hover:border-white/20"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className={`text-lg font-bold font-mono ${swing.changePercent >= 0 ? "text-green-400" : "text-red-400"}`}>
                        {swing.changePercent >= 0 ? "+" : ""}{swing.changePercent.toFixed(2)}%
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${swing.direction === "up" ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"}`}>
                        {swing.direction === "up" ? "▲" : "▼"}
                      </span>
                    </div>
                    <div className="text-xs text-gray-400">
                      {formatDate(swing.startDate)} → {formatDate(swing.endDate)}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      {swing.durationDays} days
                    </div>
                  </button>
                ))}
              </div>
              {swings.length === 0 && (
                <div className="text-center py-8 text-gray-500">No swings found. Try a lower threshold.</div>
              )}
            </div>

            {/* Step 2: Configure Analysis */}
            <div className="bg-[#161b22] rounded-2xl p-6 border border-white/5">
              <h3 className="text-lg font-semibold text-white mb-4">
                <span className="text-yellow-400 mr-2">2.</span> Configure Analysis
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="text-sm text-gray-400 block mb-2">Lookback Period (days before price change)</label>
                  <div className="flex gap-2">
                    {[1, 3, 7, 14, 21, 30].map((days) => (
                      <button
                        key={days}
                        onClick={() => setLookbackDays(days)}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                          lookbackDays === days
                            ? "bg-yellow-500 text-black"
                            : "bg-black/30 text-gray-300 border border-white/10 hover:bg-white/5"
                        }`}
                      >
                        {days}d
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-sm text-gray-400 block mb-2">Search Terms (comma-separated)</label>
                  <input
                    type="text"
                    value={searchTerms}
                    onChange={(e) => setSearchTerms(e.target.value)}
                    placeholder="gold price, inflation, federal reserve..."
                    className="w-full px-4 py-2 bg-black/30 border border-white/10 rounded-lg text-white focus:border-yellow-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="mt-6 flex items-center gap-4">
                <button
                  onClick={runAnalysis}
                  disabled={!selectedSwing || isAnalyzing}
                  className="px-6 py-3 bg-yellow-500 text-black font-semibold rounded-lg hover:bg-yellow-400 transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isAnalyzing ? "Analyzing..." : "🔍 Run Analysis"}
                </button>
                
                {selectedSwing && (
                  <div className="text-sm text-gray-400">
                    Analyzing: <span className="text-white">{formatDate(selectedSwing.endDate)}</span> 
                    <span className={`ml-2 ${selectedSwing.changePercent >= 0 ? "text-green-400" : "text-red-400"}`}>
                      ({selectedSwing.changePercent >= 0 ? "+" : ""}{selectedSwing.changePercent.toFixed(2)}%)
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Step 3: Results & Rating */}
            {analysisResult && (
              <div className="bg-[#161b22] rounded-2xl p-6 border border-white/5">
                <h3 className="text-lg font-semibold text-white mb-4">
                  <span className="text-yellow-400 mr-2">3.</span> Results & Rating
                </h3>

                {/* Summary */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                  <div className="p-4 bg-black/20 rounded-xl">
                    <div className="text-2xl font-bold text-white">{analysisResult.articlesFound}</div>
                    <div className="text-xs text-gray-500">Articles Found</div>
                  </div>
                  <div className="p-4 bg-black/20 rounded-xl">
                    <div className="text-2xl font-bold text-green-400">{analysisResult.summary.bullishCount}</div>
                    <div className="text-xs text-gray-500">Bullish</div>
                  </div>
                  <div className="p-4 bg-black/20 rounded-xl">
                    <div className="text-2xl font-bold text-red-400">{analysisResult.summary.bearishCount}</div>
                    <div className="text-xs text-gray-500">Bearish</div>
                  </div>
                  <div className="p-4 bg-black/20 rounded-xl">
                    <div className={`text-2xl font-bold ${analysisResult.summary.avgImpactScore >= 0 ? "text-green-400" : "text-red-400"}`}>
                      {analysisResult.summary.avgImpactScore >= 0 ? "+" : ""}{analysisResult.summary.avgImpactScore.toFixed(1)}
                    </div>
                    <div className="text-xs text-gray-500">Avg Impact</div>
                  </div>
                </div>

                {/* Articles */}
                <div className="space-y-4 max-h-[600px] overflow-y-auto">
                  {analysisResult.articles.map((article) => (
                    <div key={article.id} className="p-4 bg-black/20 rounded-xl border border-white/5">
                      <div className="flex items-start justify-between gap-4 mb-3">
                        <div className="flex-1">
                          <a 
                            href={article.url} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-sm font-medium text-white hover:text-yellow-400 transition"
                          >
                            {article.title}
                          </a>
                          <div className="text-xs text-gray-500 mt-1">{formatDate(article.publishedAt)}</div>
                        </div>
                        <div className="text-right">
                          <div className={`text-xl font-bold ${article.impactScore >= 0 ? "text-green-400" : "text-red-400"}`}>
                            {article.impactScore >= 0 ? "+" : ""}{article.impactScore.toFixed(0)}
                          </div>
                          <div className="text-xs text-gray-500">{(article.confidence * 100).toFixed(0)}% conf</div>
                        </div>
                      </div>

                      <div className="text-xs text-gray-400 mb-3">{article.reasoning}</div>

                      {article.matchedKeywords.length > 0 && (
                        <div className="flex flex-wrap gap-1 mb-3">
                          {article.matchedKeywords.map((kw, i) => (
                            <span key={i} className="px-2 py-0.5 bg-yellow-500/10 text-yellow-400 text-xs rounded-full">
                              {kw}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Rating */}
                      <div className="flex items-center gap-3 pt-3 border-t border-white/5">
                        <span className="text-xs text-gray-500">Rate accuracy (1-10):</span>
                        <div className="flex gap-1">
                          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((rating) => {
                            const currentRating = articleRatings[article.id] || article.humanRating;
                            const isSelected = currentRating === rating;
                            return (
                              <button
                                key={rating}
                                onClick={() => submitRating(article.id, rating)}
                                className={`w-7 h-7 rounded text-xs font-medium transition ${
                                  isSelected
                                    ? "bg-yellow-500 text-black"
                                    : article.humanVerified && !isSelected
                                    ? "bg-gray-700 text-gray-400"
                                    : "bg-black/30 text-gray-400 hover:bg-white/10"
                                }`}
                              >
                                {rating}
                              </button>
                            );
                          })}
                        </div>
                        {article.humanVerified && (
                          <span className="text-xs text-green-400">✓ Rated</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Brain Tab */}
        {activeTab === "brain" && (
          <div className="space-y-6">
            <div className="bg-[#161b22] rounded-2xl p-6 border border-white/5">
              <h3 className="text-lg font-semibold text-white mb-4">🧠 Date Lookup</h3>
              <div className="flex gap-3 mb-4">
                <input
                  type="date"
                  value={dateQuery}
                  onChange={(e) => setDateQuery(e.target.value)}
                  className="flex-1 px-4 py-2 bg-black/30 border border-white/10 rounded-lg text-white focus:border-yellow-500 focus:outline-none"
                />
                <button onClick={searchDate} className="px-6 py-2 bg-yellow-500 text-black font-semibold rounded-lg hover:bg-yellow-400 transition">
                  Search
                </button>
              </div>
              
              {dateResult && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-black/20 rounded-xl">
                  <div>
                    <div className="text-xs text-gray-500">Close Price</div>
                    <div className="text-xl font-bold text-yellow-400">{formatPrice(dateResult.closePrice)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">Daily Change</div>
                    <div className={`text-xl font-bold ${(dateResult.dailyChangePct || 0) >= 0 ? "text-green-400" : "text-red-400"}`}>
                      {(dateResult.dailyChangePct || 0).toFixed(2)}%
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">SMA 20</div>
                    <div className="text-lg text-blue-400">{dateResult.sma20 ? formatPrice(dateResult.sma20) : "—"}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">Volatility 7D</div>
                    <div className="text-lg text-purple-400">{dateResult.volatility7d?.toFixed(2) || "—"}%</div>
                  </div>
                </div>
              )}
            </div>

            <div className="bg-[#161b22] rounded-2xl p-6 border border-white/5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-white">📈 Price Swings</h3>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-gray-400">Min Swing %:</span>
                  <input
                    type="number"
                    value={swingThreshold}
                    onChange={(e) => setSwingThreshold(e.target.value)}
                    className="w-20 px-3 py-1.5 bg-black/30 border border-white/10 rounded-lg text-white text-center"
                    step="0.5"
                  />
                  <button onClick={fetchSwings} className="px-4 py-1.5 bg-yellow-500 text-black font-semibold rounded-lg hover:bg-yellow-400 transition text-sm">
                    Search
                  </button>
                </div>
              </div>
              
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="text-left text-xs text-gray-500 uppercase border-b border-white/5">
                      <th className="pb-3 pr-4">Period</th>
                      <th className="pb-3 pr-4">Direction</th>
                      <th className="pb-3 pr-4">Change</th>
                      <th className="pb-3 pr-4">Start</th>
                      <th className="pb-3 pr-4">End</th>
                      <th className="pb-3">Duration</th>
                    </tr>
                  </thead>
                  <tbody>
                    {swings.slice(0, 15).map((swing, i) => (
                      <tr key={i} className="border-b border-white/5 text-sm">
                        <td className="py-3 pr-4 text-gray-300">{formatDate(swing.startDate)} → {formatDate(swing.endDate)}</td>
                        <td className="py-3 pr-4">
                          <span className={`px-2 py-0.5 rounded-full text-xs ${swing.direction === "up" ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"}`}>
                            {swing.direction === "up" ? "▲ UP" : "▼ DOWN"}
                          </span>
                        </td>
                        <td className={`py-3 pr-4 font-mono font-semibold ${swing.changePercent >= 0 ? "text-green-400" : "text-red-400"}`}>
                          {swing.changePercent.toFixed(2)}%
                        </td>
                        <td className="py-3 pr-4 font-mono text-gray-400">{formatPrice(swing.startPrice)}</td>
                        <td className="py-3 pr-4 font-mono text-gray-400">{formatPrice(swing.endPrice)}</td>
                        <td className="py-3 text-gray-400">{swing.durationDays}d</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Predict Tab */}
        {activeTab === "predict" && prediction && (
          <div className="space-y-6">
            <div className="bg-gradient-to-br from-[#161b22] to-[#0d1117] rounded-2xl p-8 border border-yellow-500/10">
              <div className="text-center mb-8">
                <div className="text-xs text-gray-500 uppercase tracking-wider mb-2">7-Day Prediction</div>
                <div className={`text-5xl font-bold mb-2 ${
                  prediction.predictedDirection === "up" ? "text-green-400" :
                  prediction.predictedDirection === "down" ? "text-red-400" : "text-gray-400"
                }`}>
                  {prediction.predictedDirection === "up" ? "▲ BULLISH" :
                   prediction.predictedDirection === "down" ? "▼ BEARISH" : "→ SIDEWAYS"}
                </div>
                <div className="text-2xl text-gray-400">
                  {prediction.predictedChange >= 0 ? "+" : ""}{prediction.predictedChange.toFixed(2)}% expected
                </div>
                <div className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-yellow-500/10 rounded-full">
                  <span className="text-yellow-400 font-semibold">{prediction.confidence.toFixed(0)}%</span>
                  <span className="text-gray-400">confidence</span>
                </div>
              </div>
              
              <div className="p-4 bg-black/20 rounded-xl text-gray-300 text-sm">
                <span className="text-yellow-400 font-semibold">Analysis: </span>
                {prediction.reasoning}
              </div>
            </div>

            <div className="bg-[#161b22] rounded-2xl p-6 border border-white/5">
              <h3 className="text-lg font-semibold text-white mb-4">Signal Breakdown</h3>
              <div className="space-y-3">
                {prediction.signals.map((signal, i) => (
                  <div key={i} className="flex items-center gap-4 p-3 bg-black/20 rounded-lg">
                    <div className={`w-2 h-2 rounded-full ${
                      signal.direction === "bullish" ? "bg-green-400" :
                      signal.direction === "bearish" ? "bg-red-400" : "bg-gray-400"
                    }`} />
                    <div className="flex-1">
                      <div className="text-sm font-medium text-white">{signal.name}</div>
                      <div className="text-xs text-gray-500">{signal.source} • {signal.description}</div>
                    </div>
                    <div className={`text-sm font-semibold ${
                      signal.direction === "bullish" ? "text-green-400" :
                      signal.direction === "bearish" ? "text-red-400" : "text-gray-400"
                    }`}>
                      {signal.strength.toFixed(0)}%
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Train Tab */}
        {activeTab === "train" && (
          <div className="space-y-6">
            <div className="bg-[#161b22] rounded-2xl p-6 border border-white/5">
              <h3 className="text-lg font-semibold text-white mb-4">⚡ ML Pattern Training</h3>
              <p className="text-gray-400 text-sm mb-6">
                Train the pattern recognition model on historical gold price data.
              </p>
              
              <div className="flex items-center gap-4 mb-6">
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Epochs</label>
                  <input
                    type="number"
                    value={trainingEpochs}
                    onChange={(e) => setTrainingEpochs(e.target.value)}
                    className="w-24 px-3 py-2 bg-black/30 border border-white/10 rounded-lg text-white text-center"
                    min="1"
                    max="100"
                  />
                </div>
                <button 
                  onClick={runTraining} 
                  disabled={isTraining}
                  className="px-6 py-2 bg-yellow-500 text-black font-semibold rounded-lg hover:bg-yellow-400 transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isTraining ? "Training..." : "Start Training"}
                </button>
              </div>

              {trainingResult && (
                <div className="p-4 bg-black/20 rounded-xl">
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div>
                      <div className="text-xs text-gray-500">Final Accuracy</div>
                      <div className="text-2xl font-bold text-green-400">{(trainingResult.accuracy * 100).toFixed(1)}%</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500">Epochs Completed</div>
                      <div className="text-2xl font-bold text-yellow-400">{trainingResult.epoch}</div>
                    </div>
                  </div>
                  
                  <div className="text-xs text-gray-500 mb-2">Pattern Performance</div>
                  <div className="space-y-2">
                    {trainingResult.patternWeights
                      .filter(p => p.occurrences > 0)
                      .sort((a, b) => b.accuracy - a.accuracy)
                      .map((p, i) => (
                        <div key={i} className="flex items-center gap-3">
                          <div className="flex-1 text-sm text-gray-300">{p.pattern.replace(/_/g, " ")}</div>
                          <div className="text-xs text-gray-500">{p.occurrences} samples</div>
                          <div className={`text-sm font-mono font-semibold ${p.accuracy >= 0.6 ? "text-green-400" : p.accuracy >= 0.5 ? "text-yellow-400" : "text-red-400"}`}>
                            {(p.accuracy * 100).toFixed(0)}%
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {loading && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
            <div className="bg-[#161b22] rounded-2xl p-8 flex flex-col items-center gap-4 border border-yellow-500/20">
              <div className="w-12 h-12 border-4 border-yellow-500 border-t-transparent rounded-full animate-spin" />
              <div className="text-gray-400">Loading Gold AI...</div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
