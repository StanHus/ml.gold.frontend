/**
 * ML Pattern Trainer
 * Trains on historical gold price data to identify predictive patterns
 * Uses a simple neural-network-like approach with epochs
 */

import prisma from '../db';

interface TrainingConfig {
  epochs: number;
  learningRate: number;
  windowSize: number;  // Days to look back for pattern
  predictionHorizon: number;  // Days ahead to predict
}

interface PatternWeight {
  pattern: string;
  weight: number;
  accuracy: number;
  occurrences: number;
}

interface TrainingResult {
  epoch: number;
  loss: number;
  accuracy: number;
  patternWeights: PatternWeight[];
}

// Feature extraction from price data
interface PriceRecord {
  closePrice: number;
  sma50?: number | null;
  sma200?: number | null;
  volatility7d?: number | null;
  dailyChangePct?: number | null;
}

function extractFeatures(prices: PriceRecord[], index: number, windowSize: number): number[] {
  if (index < windowSize) return [];
  
  const window = prices.slice(index - windowSize, index);
  const currentPrice = prices[index].closePrice;
  
  // Calculate features
  const features: number[] = [];
  
  // 1. Price momentum (recent vs older)
  const recentAvg = window.slice(-5).reduce((s, p) => s + p.closePrice, 0) / 5;
  const olderAvg = window.slice(0, 5).reduce((s, p) => s + p.closePrice, 0) / 5;
  features.push((recentAvg - olderAvg) / olderAvg);
  
  // 2. Volatility
  const changes = window.map((p, i) => i > 0 ? (p.closePrice - window[i-1].closePrice) / window[i-1].closePrice : 0);
  const volatility = Math.sqrt(changes.reduce((s, c) => s + c * c, 0) / changes.length);
  features.push(volatility);
  
  // 3. Trend strength (linear regression slope)
  const xMean = windowSize / 2;
  const yMean = window.reduce((s, p) => s + p.closePrice, 0) / windowSize;
  let numerator = 0, denominator = 0;
  window.forEach((p, i) => {
    numerator += (i - xMean) * (p.closePrice - yMean);
    denominator += (i - xMean) * (i - xMean);
  });
  const slope = denominator !== 0 ? numerator / denominator : 0;
  features.push(slope / currentPrice * 100);
  
  // 4. RSI-like indicator
  const gains = changes.filter(c => c > 0);
  const losses = changes.filter(c => c < 0).map(c => -c);
  const avgGain = gains.length > 0 ? gains.reduce((s, g) => s + g, 0) / gains.length : 0;
  const avgLoss = losses.length > 0 ? losses.reduce((s, l) => s + l, 0) / losses.length : 0;
  const rsi = avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss));
  features.push((rsi - 50) / 50);  // Normalize to -1 to 1
  
  // 5. Price position relative to SMA
  const sma = window.reduce((s, p) => s + p.closePrice, 0) / windowSize;
  features.push((currentPrice - sma) / sma);
  
  // 6. Recent high/low position
  const high = Math.max(...window.map(p => p.closePrice));
  const low = Math.min(...window.map(p => p.closePrice));
  const range = high - low;
  features.push(range > 0 ? (currentPrice - low) / range : 0.5);
  
  return features;
}

// Detect patterns in price data
function detectPatterns(prices: PriceRecord[], index: number, windowSize: number): string[] {
  if (index < windowSize) return [];
  
  const window = prices.slice(index - windowSize, index + 1);
  const patterns: string[] = [];
  
  // Golden Cross / Death Cross (simplified)
  if (prices[index].sma50 && prices[index].sma200) {
    const prevSma50 = prices[index - 1]?.sma50;
    const prevSma200 = prices[index - 1]?.sma200;
    
    if (prevSma50 && prevSma200) {
      if (prevSma50 < prevSma200 && prices[index].sma50 > prices[index].sma200) {
        patterns.push('golden_cross');
      }
      if (prevSma50 > prevSma200 && prices[index].sma50 < prices[index].sma200) {
        patterns.push('death_cross');
      }
    }
  }
  
  // High volatility spike
  if (prices[index].volatility7d && prices[index - 7]?.volatility7d) {
    if (prices[index].volatility7d > prices[index - 7].volatility7d * 1.5) {
      patterns.push('high_volatility_spike');
    }
  }
  
  // Breakout detection
  const recentHigh = Math.max(...window.slice(-10).map(p => p.closePrice));
  const recentLow = Math.min(...window.slice(-10).map(p => p.closePrice));
  const previousHigh = Math.max(...window.slice(0, -10).map(p => p.closePrice));
  const previousLow = Math.min(...window.slice(0, -10).map(p => p.closePrice));
  
  if (recentHigh > previousHigh * 1.02) {
    patterns.push('breakout_up');
  }
  if (recentLow < previousLow * 0.98) {
    patterns.push('breakout_down');
  }
  
  // Support bounce / resistance rejection
  const priceChangePct = prices[index].dailyChangePct || 0;
  const nearLow = prices[index].closePrice < previousLow * 1.01;
  const nearHigh = prices[index].closePrice > previousHigh * 0.99;
  
  if (nearLow && priceChangePct > 0.5) {
    patterns.push('support_bounce');
  }
  if (nearHigh && priceChangePct < -0.5) {
    patterns.push('resistance_rejection');
  }
  
  return patterns;
}

// Simple neural network layer
class SimpleLayer {
  weights: number[];
  bias: number;
  
  constructor(inputSize: number) {
    // Initialize with small random weights
    this.weights = Array(inputSize).fill(0).map(() => (Math.random() - 0.5) * 0.1);
    this.bias = 0;
  }
  
  forward(inputs: number[]): number {
    let sum = this.bias;
    for (let i = 0; i < inputs.length; i++) {
      sum += inputs[i] * this.weights[i];
    }
    // Tanh activation for -1 to 1 output
    return Math.tanh(sum);
  }
  
  backward(inputs: number[], error: number, learningRate: number): void {
    // Gradient descent
    const gradient = error * (1 - Math.pow(this.forward(inputs), 2)); // Tanh derivative
    
    for (let i = 0; i < this.weights.length; i++) {
      this.weights[i] += learningRate * gradient * inputs[i];
    }
    this.bias += learningRate * gradient;
  }
}

export async function trainPatternModel(config: TrainingConfig): Promise<TrainingResult[]> {
  const { epochs, learningRate, windowSize, predictionHorizon } = config;
  
  // Fetch all historical prices
  const prices = await prisma.goldPrice.findMany({
    orderBy: { date: 'asc' },
  });
  
  console.log(`Training on ${prices.length} price records`);
  
  // Initialize pattern weights
  const patternNames = [
    'golden_cross', 'death_cross', 'breakout_up', 'breakout_down',
    'support_bounce', 'resistance_rejection', 'high_volatility_spike',
    'momentum_positive', 'momentum_negative', 'volatility_squeeze'
  ];
  
  const patternWeights: Map<string, { weight: number; correct: number; total: number }> = new Map();
  patternNames.forEach(p => patternWeights.set(p, { weight: 0, correct: 0, total: 0 }));
  
  // Initialize neural network for feature-based prediction
  const featureLayer = new SimpleLayer(6); // 6 features
  
  const results: TrainingResult[] = [];
  
  for (let epoch = 0; epoch < epochs; epoch++) {
    let totalLoss = 0;
    let correct = 0;
    let total = 0;
    
    // Training loop
    for (let i = windowSize; i < prices.length - predictionHorizon; i++) {
      const features = extractFeatures(prices, i, windowSize);
      if (features.length === 0) continue;
      
      const patterns = detectPatterns(prices, i, windowSize);
      
      // Actual outcome: did price go up or down?
      const futurePrice = prices[i + predictionHorizon].closePrice;
      const currentPrice = prices[i].closePrice;
      const actualChange = (futurePrice - currentPrice) / currentPrice;
      const actualDirection = actualChange > 0 ? 1 : -1;
      
      // Feature-based prediction
      const featurePrediction = featureLayer.forward(features);
      const featureError = actualDirection - featurePrediction;
      featureLayer.backward(features, featureError, learningRate);
      
      // Pattern-based learning
      patterns.forEach(pattern => {
        const pw = patternWeights.get(pattern)!;
        pw.total++;
        
        // Did the pattern correctly predict direction?
        const patternBullish = ['golden_cross', 'breakout_up', 'support_bounce'].includes(pattern);
        const patternCorrect = (patternBullish && actualDirection > 0) || (!patternBullish && actualDirection < 0);
        
        if (patternCorrect) {
          pw.correct++;
          pw.weight += learningRate * 0.1;
        } else {
          pw.weight -= learningRate * 0.1;
        }
      });
      
      // Calculate loss (MSE)
      totalLoss += Math.pow(featureError, 2);
      
      // Check if prediction was correct
      const predictedDirection = featurePrediction > 0 ? 1 : -1;
      if (predictedDirection === actualDirection) {
        correct++;
      }
      total++;
    }
    
    const avgLoss = totalLoss / total;
    const accuracy = correct / total;
    
    // Compile pattern weights for this epoch
    const epochPatternWeights: PatternWeight[] = [];
    patternWeights.forEach((value, key) => {
      epochPatternWeights.push({
        pattern: key,
        weight: value.weight,
        accuracy: value.total > 0 ? value.correct / value.total : 0,
        occurrences: value.total,
      });
    });
    
    results.push({
      epoch: epoch + 1,
      loss: avgLoss,
      accuracy,
      patternWeights: epochPatternWeights,
    });
    
    console.log(`Epoch ${epoch + 1}/${epochs} - Loss: ${avgLoss.toFixed(6)}, Accuracy: ${(accuracy * 100).toFixed(2)}%`);
  }
  
  // Save training run to database
  await prisma.trainingRun.create({
    data: {
      runType: 'pattern_predictor',
      parameters: JSON.stringify(config),
      metrics: JSON.stringify(results[results.length - 1]),
      status: 'completed',
      completedAt: new Date(),
    },
  });
  
  return results;
}

export async function getTrainedModel(): Promise<{
  featureWeights: number[];
  patternWeights: PatternWeight[];
} | null> {
  const lastRun = await prisma.trainingRun.findFirst({
    where: { runType: 'pattern_predictor', status: 'completed' },
    orderBy: { completedAt: 'desc' },
  });
  
  if (!lastRun) return null;
  
  const metrics = JSON.parse(lastRun.metrics || '{}');
  return {
    featureWeights: [], // Would need to persist these
    patternWeights: metrics.patternWeights || [],
  };
}

