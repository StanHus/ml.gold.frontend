/**
 * Pattern Detection Service
 * Identifies technical patterns in gold price data
 */

import prisma from '../db';
import { differenceInDays } from 'date-fns';

const PATTERN_DEFINITIONS = {
  double_top: { name: 'Double Top', description: 'Bearish reversal pattern with two peaks at similar levels', minDuration: 10, maxDuration: 60, typicalImpact: -3 },
  double_bottom: { name: 'Double Bottom', description: 'Bullish reversal pattern with two troughs at similar levels', minDuration: 10, maxDuration: 60, typicalImpact: 3 },
  head_shoulders: { name: 'Head and Shoulders', description: 'Bearish reversal with three peaks, middle being highest', minDuration: 20, maxDuration: 90, typicalImpact: -5 },
  inverse_head_shoulders: { name: 'Inverse Head and Shoulders', description: 'Bullish reversal with three troughs, middle being lowest', minDuration: 20, maxDuration: 90, typicalImpact: 5 },
  breakout_up: { name: 'Bullish Breakout', description: 'Price breaks above resistance with high volume/momentum', minDuration: 1, maxDuration: 5, typicalImpact: 4 },
  breakout_down: { name: 'Bearish Breakout', description: 'Price breaks below support with high volume/momentum', minDuration: 1, maxDuration: 5, typicalImpact: -4 },
  golden_cross: { name: 'Golden Cross', description: '50-day SMA crosses above 200-day SMA (bullish)', minDuration: 1, maxDuration: 1, typicalImpact: 5 },
  death_cross: { name: 'Death Cross', description: '50-day SMA crosses below 200-day SMA (bearish)', minDuration: 1, maxDuration: 1, typicalImpact: -5 },
  support_bounce: { name: 'Support Bounce', description: 'Price bounces off a support level', minDuration: 1, maxDuration: 5, typicalImpact: 2 },
  resistance_rejection: { name: 'Resistance Rejection', description: 'Price rejected at a resistance level', minDuration: 1, maxDuration: 5, typicalImpact: -2 },
  high_volatility_spike: { name: 'High Volatility Spike', description: 'Sudden increase in price volatility', minDuration: 1, maxDuration: 3, typicalImpact: 0 },
  consolidation: { name: 'Consolidation', description: 'Price trading in a tight range, preparing for breakout', minDuration: 5, maxDuration: 30, typicalImpact: 0 },
};

interface PricePoint {
  id: string;
  date: Date;
  closePrice: number;
  dailyChangePct: number | null;
  volatility7d: number | null;
  sma20: number | null;
  sma50: number | null;
  sma200: number | null;
}

interface DetectedPattern {
  patternType: string;
  startDate: Date;
  endDate: Date;
  startPriceId: string;
  confidence: number;
  predictedMove: number;
  details: string;
}

export class PatternDetectorService {
  async initializePatterns(): Promise<void> {
    for (const [key, def] of Object.entries(PATTERN_DEFINITIONS)) {
      await prisma.pattern.upsert({
        where: { name: key },
        update: {
          description: def.description,
          typicalDuration: Math.round((def.minDuration + def.maxDuration) / 2),
          typicalImpact: def.typicalImpact,
        },
        create: {
          name: key,
          description: def.description,
          typicalDuration: Math.round((def.minDuration + def.maxDuration) / 2),
          typicalImpact: def.typicalImpact,
        },
      });
    }
  }

  private detectCrossPatterns(prices: PricePoint[]): DetectedPattern[] {
    const patterns: DetectedPattern[] = [];
    
    for (let i = 1; i < prices.length; i++) {
      const prev = prices[i - 1];
      const curr = prices[i];
      
      if (!prev.sma50 || !prev.sma200 || !curr.sma50 || !curr.sma200) continue;
      
      if (prev.sma50 <= prev.sma200 && curr.sma50 > curr.sma200) {
        patterns.push({
          patternType: 'golden_cross',
          startDate: curr.date,
          endDate: curr.date,
          startPriceId: curr.id,
          confidence: 0.85,
          predictedMove: 5,
          details: `SMA50 (${curr.sma50.toFixed(2)}) crossed above SMA200 (${curr.sma200.toFixed(2)})`,
        });
      }
      
      if (prev.sma50 >= prev.sma200 && curr.sma50 < curr.sma200) {
        patterns.push({
          patternType: 'death_cross',
          startDate: curr.date,
          endDate: curr.date,
          startPriceId: curr.id,
          confidence: 0.85,
          predictedMove: -5,
          details: `SMA50 (${curr.sma50.toFixed(2)}) crossed below SMA200 (${curr.sma200.toFixed(2)})`,
        });
      }
    }
    
    return patterns;
  }

  private detectBreakouts(prices: PricePoint[]): DetectedPattern[] {
    const patterns: DetectedPattern[] = [];
    const lookback = 20;
    
    for (let i = lookback; i < prices.length; i++) {
      const curr = prices[i];
      const window = prices.slice(i - lookback, i);
      
      const windowHigh = Math.max(...window.map(p => p.closePrice));
      const windowLow = Math.min(...window.map(p => p.closePrice));
      const windowRange = windowHigh - windowLow;
      
      if (!curr.dailyChangePct || !curr.volatility7d) continue;
      
      if (curr.closePrice > windowHigh && curr.dailyChangePct > 1.5) {
        const breakoutStrength = (curr.closePrice - windowHigh) / windowRange * 100;
        patterns.push({
          patternType: 'breakout_up',
          startDate: curr.date,
          endDate: curr.date,
          startPriceId: curr.id,
          confidence: Math.min(0.9, 0.5 + breakoutStrength / 100),
          predictedMove: Math.min(8, 2 + breakoutStrength / 10),
          details: `Price broke above ${lookback}-day high of ${windowHigh.toFixed(2)} with ${curr.dailyChangePct.toFixed(2)}% gain`,
        });
      }
      
      if (curr.closePrice < windowLow && curr.dailyChangePct < -1.5) {
        const breakoutStrength = (windowLow - curr.closePrice) / windowRange * 100;
        patterns.push({
          patternType: 'breakout_down',
          startDate: curr.date,
          endDate: curr.date,
          startPriceId: curr.id,
          confidence: Math.min(0.9, 0.5 + breakoutStrength / 100),
          predictedMove: -Math.min(8, 2 + breakoutStrength / 10),
          details: `Price broke below ${lookback}-day low of ${windowLow.toFixed(2)} with ${Math.abs(curr.dailyChangePct).toFixed(2)}% loss`,
        });
      }
    }
    
    return patterns;
  }

  private detectVolatilitySpikes(prices: PricePoint[]): DetectedPattern[] {
    const patterns: DetectedPattern[] = [];
    
    const volatilities = prices.filter(p => p.volatility7d !== null).map(p => p.volatility7d!);
    if (volatilities.length === 0) return patterns;
    
    const avgVolatility = volatilities.reduce((a, b) => a + b, 0) / volatilities.length;
    const stdVolatility = Math.sqrt(volatilities.reduce((a, b) => a + Math.pow(b - avgVolatility, 2), 0) / volatilities.length);
    const threshold = avgVolatility + 2 * stdVolatility;
    
    for (const price of prices) {
      if (price.volatility7d !== null && price.volatility7d > threshold) {
        patterns.push({
          patternType: 'high_volatility_spike',
          startDate: price.date,
          endDate: price.date,
          startPriceId: price.id,
          confidence: Math.min(0.9, 0.5 + (price.volatility7d - threshold) / stdVolatility * 0.1),
          predictedMove: 0,
          details: `Volatility ${price.volatility7d.toFixed(2)}% is ${((price.volatility7d - avgVolatility) / stdVolatility).toFixed(1)} std devs above average`,
        });
      }
    }
    
    return patterns;
  }

  private detectDoublePatterns(prices: PricePoint[]): DetectedPattern[] {
    const patterns: DetectedPattern[] = [];
    const tolerance = 0.02;
    
    const maxima: { index: number; price: PricePoint }[] = [];
    const minima: { index: number; price: PricePoint }[] = [];
    
    for (let i = 2; i < prices.length - 2; i++) {
      const curr = prices[i].closePrice;
      const isMax = prices.slice(i - 2, i).every(p => p.closePrice < curr) && prices.slice(i + 1, i + 3).every(p => p.closePrice < curr);
      const isMin = prices.slice(i - 2, i).every(p => p.closePrice > curr) && prices.slice(i + 1, i + 3).every(p => p.closePrice > curr);
      
      if (isMax) maxima.push({ index: i, price: prices[i] });
      if (isMin) minima.push({ index: i, price: prices[i] });
    }
    
    for (let i = 0; i < maxima.length - 1; i++) {
      for (let j = i + 1; j < maxima.length; j++) {
        const first = maxima[i];
        const second = maxima[j];
        const daysBetween = differenceInDays(second.price.date, first.price.date);
        
        if (daysBetween < 10 || daysBetween > 60) continue;
        
        const priceDiff = Math.abs(first.price.closePrice - second.price.closePrice) / first.price.closePrice;
        
        if (priceDiff <= tolerance) {
          const valleyPrices = prices.slice(first.index, second.index + 1);
          const valley = Math.min(...valleyPrices.map(p => p.closePrice));
          const avgPeak = (first.price.closePrice + second.price.closePrice) / 2;
          const depth = (avgPeak - valley) / avgPeak;
          
          if (depth >= 0.03) {
            patterns.push({
              patternType: 'double_top',
              startDate: first.price.date,
              endDate: second.price.date,
              startPriceId: first.price.id,
              confidence: Math.min(0.85, 0.5 + depth * 5),
              predictedMove: -Math.min(8, depth * 100),
              details: `Double top at ~${avgPeak.toFixed(2)} with ${(depth * 100).toFixed(1)}% valley over ${daysBetween} days`,
            });
          }
        }
      }
    }
    
    for (let i = 0; i < minima.length - 1; i++) {
      for (let j = i + 1; j < minima.length; j++) {
        const first = minima[i];
        const second = minima[j];
        const daysBetween = differenceInDays(second.price.date, first.price.date);
        
        if (daysBetween < 10 || daysBetween > 60) continue;
        
        const priceDiff = Math.abs(first.price.closePrice - second.price.closePrice) / first.price.closePrice;
        
        if (priceDiff <= tolerance) {
          const peakPrices = prices.slice(first.index, second.index + 1);
          const peak = Math.max(...peakPrices.map(p => p.closePrice));
          const avgTrough = (first.price.closePrice + second.price.closePrice) / 2;
          const height = (peak - avgTrough) / avgTrough;
          
          if (height >= 0.03) {
            patterns.push({
              patternType: 'double_bottom',
              startDate: first.price.date,
              endDate: second.price.date,
              startPriceId: first.price.id,
              confidence: Math.min(0.85, 0.5 + height * 5),
              predictedMove: Math.min(8, height * 100),
              details: `Double bottom at ~${avgTrough.toFixed(2)} with ${(height * 100).toFixed(1)}% peak over ${daysBetween} days`,
            });
          }
        }
      }
    }
    
    return patterns;
  }

  async detectPatterns(startDate?: Date, endDate?: Date): Promise<DetectedPattern[]> {
    const whereClause: { date?: { gte?: Date; lte?: Date } } = {};
    
    if (startDate || endDate) {
      whereClause.date = {};
      if (startDate) whereClause.date.gte = startDate;
      if (endDate) whereClause.date.lte = endDate;
    }
    
    const prices = await prisma.goldPrice.findMany({
      where: whereClause,
      orderBy: { date: 'asc' },
    }) as PricePoint[];
    
    if (prices.length < 30) {
      return [];
    }
    
    const allPatterns: DetectedPattern[] = [
      ...this.detectCrossPatterns(prices),
      ...this.detectBreakouts(prices),
      ...this.detectVolatilitySpikes(prices),
      ...this.detectDoublePatterns(prices),
    ];
    
    return allPatterns.sort((a, b) => b.confidence - a.confidence);
  }

  async detectAndStorePatterns(startDate?: Date, endDate?: Date): Promise<{ detected: number; stored: number }> {
    await this.initializePatterns();
    
    const patterns = await this.detectPatterns(startDate, endDate);
    let stored = 0;
    
    for (const detected of patterns) {
      try {
        const pattern = await prisma.pattern.findUnique({ where: { name: detected.patternType } });
        
        if (!pattern) continue;
        
        const existing = await prisma.patternOccurrence.findFirst({
          where: { patternId: pattern.id, startDate: detected.startDate },
        });
        
        if (!existing) {
          await prisma.patternOccurrence.create({
            data: {
              patternId: pattern.id,
              startPriceId: detected.startPriceId,
              startDate: detected.startDate,
              endDate: detected.endDate,
              confidence: detected.confidence,
              predictedMove: detected.predictedMove,
            },
          });
          stored++;
        }
      } catch (error) {
        console.error(`Failed to store pattern:`, error);
      }
    }
    
    return { detected: patterns.length, stored };
  }

  async getPatternOccurrences(options: {
    patternType?: string;
    minConfidence?: number;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
  } = {}): Promise<{
    id: string;
    pattern: string;
    startDate: Date;
    endDate: Date | null;
    confidence: number;
    predictedMove: number | null;
    actualMove: number | null;
    humanVerified: boolean;
  }[]> {
    const where: Record<string, unknown> = {};
    
    if (options.patternType) {
      const pattern = await prisma.pattern.findUnique({ where: { name: options.patternType } });
      if (pattern) where.patternId = pattern.id;
    }
    
    if (options.minConfidence !== undefined) {
      where.confidence = { gte: options.minConfidence };
    }
    
    if (options.startDate || options.endDate) {
      where.startDate = {};
      if (options.startDate) (where.startDate as Record<string, Date>).gte = options.startDate;
      if (options.endDate) (where.startDate as Record<string, Date>).lte = options.endDate;
    }
    
    const occurrences = await prisma.patternOccurrence.findMany({
      where,
      include: { pattern: { select: { name: true } } },
      orderBy: { startDate: 'desc' },
      take: options.limit || 100,
    });
    
    return occurrences.map(o => ({
      id: o.id,
      pattern: o.pattern.name,
      startDate: o.startDate,
      endDate: o.endDate,
      confidence: o.confidence,
      predictedMove: o.predictedMove,
      actualMove: o.actualMove,
      humanVerified: o.humanVerified,
    }));
  }

  async submitPatternFeedback(occurrenceId: string, feedback: { confirmed: boolean; actualMove?: number; notes?: string }): Promise<void> {
    await prisma.patternOccurrence.update({
      where: { id: occurrenceId },
      data: {
        humanVerified: true,
        humanConfirmed: feedback.confirmed,
        actualMove: feedback.actualMove,
        humanNotes: feedback.notes,
      },
    });
  }
}

export const patternDetectorService = new PatternDetectorService();
export default patternDetectorService;
