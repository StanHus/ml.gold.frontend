/**
 * Gold Price Predictor
 * Combines pattern detection, news sentiment, and economic indicators
 * to generate price predictions with confidence levels
 */

import prisma from '../db';

interface PredictionSignal {
  source: 'pattern' | 'news' | 'technical' | 'economic';
  name: string;
  direction: 'bullish' | 'bearish' | 'neutral';
  strength: number;  // 0-100
  description: string;
}

interface Prediction {
  date: Date;
  currentPrice: number;
  predictedDirection: 'up' | 'down' | 'sideways';
  predictedChange: number;  // Percentage
  confidence: number;  // 0-100
  timeHorizon: string;  // e.g., "7 days"
  signals: PredictionSignal[];
  reasoning: string;
}

// Technical indicator calculations
function calculateRSI(prices: number[], period: number = 14): number {
  if (prices.length < period + 1) return 50;
  
  const changes = prices.slice(1).map((p, i) => p - prices[i]);
  const recentChanges = changes.slice(-period);
  
  const gains = recentChanges.filter(c => c > 0);
  const losses = recentChanges.filter(c => c < 0).map(c => -c);
  
  const avgGain = gains.length > 0 ? gains.reduce((a, b) => a + b, 0) / period : 0;
  const avgLoss = losses.length > 0 ? losses.reduce((a, b) => a + b, 0) / period : 0;
  
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

function calculateMACD(prices: number[]): { macd: number; signal: number; histogram: number } {
  if (prices.length < 26) return { macd: 0, signal: 0, histogram: 0 };
  
  const ema = (data: number[], period: number): number => {
    const k = 2 / (period + 1);
    let ema = data[0];
    for (let i = 1; i < data.length; i++) {
      ema = data[i] * k + ema * (1 - k);
    }
    return ema;
  };
  
  const ema12 = ema(prices.slice(-12), 12);
  const ema26 = ema(prices.slice(-26), 26);
  const macd = ema12 - ema26;
  const signal = ema([macd], 9);  // Simplified
  
  return { macd, signal, histogram: macd - signal };
}

interface PriceRecord {
  closePrice: number;
  sma50?: number | null;
  sma200?: number | null;
}

function detectTechnicalPatterns(prices: PriceRecord[]): PredictionSignal[] {
  const signals: PredictionSignal[] = [];
  const closePrices = prices.map(p => p.closePrice);
  
  // RSI
  const rsi = calculateRSI(closePrices);
  if (rsi > 70) {
    signals.push({
      source: 'technical',
      name: 'RSI Overbought',
      direction: 'bearish',
      strength: Math.min((rsi - 70) * 3, 100),
      description: `RSI at ${rsi.toFixed(1)} indicates overbought conditions`,
    });
  } else if (rsi < 30) {
    signals.push({
      source: 'technical',
      name: 'RSI Oversold',
      direction: 'bullish',
      strength: Math.min((30 - rsi) * 3, 100),
      description: `RSI at ${rsi.toFixed(1)} indicates oversold conditions`,
    });
  }
  
  // MACD
  const macdData = calculateMACD(closePrices);
  if (macdData.histogram > 0 && macdData.macd > macdData.signal) {
    signals.push({
      source: 'technical',
      name: 'MACD Bullish',
      direction: 'bullish',
      strength: Math.min(Math.abs(macdData.histogram) * 10, 80),
      description: 'MACD crossed above signal line',
    });
  } else if (macdData.histogram < 0 && macdData.macd < macdData.signal) {
    signals.push({
      source: 'technical',
      name: 'MACD Bearish',
      direction: 'bearish',
      strength: Math.min(Math.abs(macdData.histogram) * 10, 80),
      description: 'MACD crossed below signal line',
    });
  }
  
  // Moving Average Crossovers
  const latest = prices[prices.length - 1];
  if (latest.sma50 && latest.sma200) {
    const diff = (latest.sma50 - latest.sma200) / latest.sma200 * 100;
    if (diff > 0) {
      signals.push({
        source: 'technical',
        name: 'Golden Cross Active',
        direction: 'bullish',
        strength: Math.min(diff * 5, 70),
        description: `50-day SMA ${diff.toFixed(2)}% above 200-day SMA`,
      });
    } else {
      signals.push({
        source: 'technical',
        name: 'Death Cross Active',
        direction: 'bearish',
        strength: Math.min(Math.abs(diff) * 5, 70),
        description: `50-day SMA ${Math.abs(diff).toFixed(2)}% below 200-day SMA`,
      });
    }
  }
  
  // Trend analysis
  if (prices.length >= 20) {
    const recent5 = prices.slice(-5).reduce((s, p) => s + p.closePrice, 0) / 5;
    const recent20 = prices.slice(-20).reduce((s, p) => s + p.closePrice, 0) / 20;
    const trendStrength = ((recent5 - recent20) / recent20) * 100;
    
    if (Math.abs(trendStrength) > 1) {
      signals.push({
        source: 'technical',
        name: trendStrength > 0 ? 'Uptrend' : 'Downtrend',
        direction: trendStrength > 0 ? 'bullish' : 'bearish',
        strength: Math.min(Math.abs(trendStrength) * 20, 60),
        description: `Price ${trendStrength > 0 ? 'rising' : 'falling'} ${Math.abs(trendStrength).toFixed(2)}% from 20-day average`,
      });
    }
  }
  
  return signals;
}

async function getPatternSignals(): Promise<PredictionSignal[]> {
  const signals: PredictionSignal[] = [];
  
  // Get recent pattern occurrences
  const recentPatterns = await prisma.patternOccurrence.findMany({
    where: {
      startDate: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
    },
    include: { pattern: true },
    orderBy: { startDate: 'desc' },
  });
  
  for (const occurrence of recentPatterns) {
    const pattern = occurrence.pattern;
    if (!pattern) continue;
    
    const isBullish = (pattern.typicalImpact || 0) > 0;
    
    signals.push({
      source: 'pattern',
      name: pattern.name,
      direction: isBullish ? 'bullish' : 'bearish',
      strength: Math.min(Math.abs(occurrence.confidence || 50), 100),
      description: pattern.description || `${pattern.name} pattern detected`,
    });
  }
  
  return signals;
}

async function getNewsSignals(): Promise<PredictionSignal[]> {
  const signals: PredictionSignal[] = [];
  
  // Get recent verified news quantifications
  const recentNews = await prisma.newsQuantification.findMany({
    where: {
      createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
    },
    include: { newsArticle: true },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });
  
  // Aggregate news sentiment
  let totalImpact = 0;
  let count = 0;
  
  for (const quant of recentNews) {
    const impact = quant.humanScore ?? quant.algorithmScore ?? 0;
    totalImpact += impact;
    count++;
  }
  
  if (count > 0) {
    const avgImpact = totalImpact / count;
    
    if (Math.abs(avgImpact) > 10) {
      signals.push({
        source: 'news',
        name: 'News Sentiment',
        direction: avgImpact > 0 ? 'bullish' : 'bearish',
        strength: Math.min(Math.abs(avgImpact), 100),
        description: `${count} recent news articles with avg impact of ${avgImpact.toFixed(1)}`,
      });
    }
  }
  
  return signals;
}

async function getEconomicSignals(): Promise<PredictionSignal[]> {
  const signals: PredictionSignal[] = [];
  
  // Get recent economic indicators
  const indicators = await prisma.economicIndicator.findMany({
    where: {
      date: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
    },
    orderBy: { date: 'desc' },
  });
  
  // Group by indicator type
  const indicatorMap = new Map<string, { value: number }[]>();
  indicators.forEach(ind => {
    if (!indicatorMap.has(ind.indicator)) {
      indicatorMap.set(ind.indicator, []);
    }
    indicatorMap.get(ind.indicator)!.push(ind);
  });
  
  // Analyze each indicator
  indicatorMap.forEach((values: { value: number }[], name: string) => {
    if (values.length < 2) return;
    
    const latest = values[0].value;
    const previous = values[1].value;
    const change = ((latest - previous) / previous) * 100;
    
    // Interpret based on indicator type
    let direction: 'bullish' | 'bearish' | 'neutral' = 'neutral';
    let description = '';
    
    if (name.includes('inflation') || name.includes('CPI')) {
      direction = change > 0 ? 'bullish' : 'bearish';  // Inflation = bullish for gold
      description = `Inflation ${change > 0 ? 'rising' : 'falling'} (${change.toFixed(2)}%)`;
    } else if (name.includes('interest') || name.includes('FEDFUNDS')) {
      direction = change > 0 ? 'bearish' : 'bullish';  // Higher rates = bearish for gold
      description = `Interest rates ${change > 0 ? 'rising' : 'falling'}`;
    } else if (name.includes('USD') || name.includes('DXY')) {
      direction = change > 0 ? 'bearish' : 'bullish';  // Stronger USD = bearish for gold
      description = `USD strength ${change > 0 ? 'increasing' : 'decreasing'}`;
    }
    
    if (direction !== 'neutral' && Math.abs(change) > 0.5) {
      signals.push({
        source: 'economic',
        name: name,
        direction,
        strength: Math.min(Math.abs(change) * 10, 50),
        description,
      });
    }
  });
  
  return signals;
}

export async function generatePrediction(horizonDays: number = 7): Promise<Prediction> {
  // Get recent prices
  const prices = await prisma.goldPrice.findMany({
    orderBy: { date: 'desc' },
    take: 200,
  });
  
  prices.reverse();  // Oldest to newest
  
  const latestPrice = prices[prices.length - 1];
  
  // Collect all signals
  const technicalSignals = detectTechnicalPatterns(prices);
  const patternSignals = await getPatternSignals();
  const newsSignals = await getNewsSignals();
  const economicSignals = await getEconomicSignals();
  
  const allSignals = [...technicalSignals, ...patternSignals, ...newsSignals, ...economicSignals];
  
  // Calculate weighted prediction
  let bullishScore = 0;
  let bearishScore = 0;
  let totalWeight = 0;
  
  const sourceWeights = {
    technical: 0.35,
    pattern: 0.25,
    news: 0.25,
    economic: 0.15,
  };
  
  allSignals.forEach(signal => {
    const weight = sourceWeights[signal.source] * (signal.strength / 100);
    totalWeight += weight;
    
    if (signal.direction === 'bullish') {
      bullishScore += weight;
    } else if (signal.direction === 'bearish') {
      bearishScore += weight;
    }
  });
  
  // Determine direction and confidence
  let predictedDirection: 'up' | 'down' | 'sideways';
  let confidence: number;
  let predictedChange: number;
  
  const netScore = totalWeight > 0 ? (bullishScore - bearishScore) / totalWeight : 0;
  
  if (Math.abs(netScore) < 0.1) {
    predictedDirection = 'sideways';
    confidence = 30 + (1 - Math.abs(netScore) * 10) * 20;
    predictedChange = 0;
  } else if (netScore > 0) {
    predictedDirection = 'up';
    confidence = Math.min(50 + netScore * 50, 90);
    predictedChange = netScore * 5;  // Scale to reasonable percentage
  } else {
    predictedDirection = 'down';
    confidence = Math.min(50 + Math.abs(netScore) * 50, 90);
    predictedChange = netScore * 5;
  }
  
  // Generate reasoning
  const bullishSignals = allSignals.filter(s => s.direction === 'bullish');
  const bearishSignals = allSignals.filter(s => s.direction === 'bearish');
  
  let reasoning = `Based on ${allSignals.length} signals: `;
  reasoning += `${bullishSignals.length} bullish, ${bearishSignals.length} bearish. `;
  
  const topSignals = [...allSignals].sort((a, b) => b.strength - a.strength).slice(0, 3);
  reasoning += `Key factors: ${topSignals.map(s => s.name).join(', ')}.`;
  
  return {
    date: new Date(),
    currentPrice: latestPrice.closePrice,
    predictedDirection,
    predictedChange,
    confidence,
    timeHorizon: `${horizonDays} days`,
    signals: allSignals,
    reasoning,
  };
}

// Historical accuracy tracking
export async function evaluatePredictionAccuracy(): Promise<{
  totalPredictions: number;
  correctPredictions: number;
  accuracy: number;
  bySource: { source: string; accuracy: number }[];
}> {
  // This would compare past predictions against actual outcomes
  // For now, return placeholder
  return {
    totalPredictions: 0,
    correctPredictions: 0,
    accuracy: 0,
    bySource: [],
  };
}

