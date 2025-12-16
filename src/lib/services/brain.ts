/**
 * Price Query Engine - "The Brain"
 * 
 * Central service for querying gold price data.
 * Handles:
 * - Date-specific lookups
 * - Volatility/swing searches
 * - Period analysis
 * - Statistical queries
 */

import prisma from '../db';
import { subDays, differenceInDays } from 'date-fns';

export interface PriceData {
  id: string;
  date: Date;
  closePrice: number;
  openPrice: number | null;
  highPrice: number | null;
  lowPrice: number | null;
  dailyChange: number | null;
  dailyChangePct: number | null;
  volatility7d: number | null;
  volatility30d: number | null;
  sma20: number | null;
  sma50: number | null;
  sma200: number | null;
}

export interface DateAnalysis {
  price: PriceData;
  previousDay: PriceData | null;
  nextDay: PriceData | null;
  weekContext: {
    weekStart: PriceData | null;
    weekEnd: PriceData | null;
    weekHigh: number;
    weekLow: number;
    weekChange: number;
  };
  monthContext: {
    monthStart: PriceData | null;
    monthHigh: number;
    monthLow: number;
    monthChange: number;
  };
  technicalContext: {
    aboveSma20: boolean | null;
    aboveSma50: boolean | null;
    aboveSma200: boolean | null;
    trend: 'bullish' | 'bearish' | 'neutral';
  };
}

export interface SwingResult {
  startDate: Date;
  endDate: Date;
  startPrice: number;
  endPrice: number;
  changePercent: number;
  changeAbsolute: number;
  durationDays: number;
  direction: 'up' | 'down';
}

export interface PeriodStats {
  startDate: Date;
  endDate: Date;
  startPrice: number;
  endPrice: number;
  highPrice: number;
  highDate: Date;
  lowPrice: number;
  lowDate: Date;
  avgPrice: number;
  totalChange: number;
  totalChangePct: number;
  avgDailyChange: number;
  avgVolatility: number;
  maxDailyGain: number;
  maxDailyGainDate: Date | null;
  maxDailyLoss: number;
  maxDailyLossDate: Date | null;
  dataPoints: number;
}

export class BrainService {
  /**
   * Get complete analysis for a specific date
   */
  async getDateAnalysis(date: Date): Promise<DateAnalysis | null> {
    const targetDate = new Date(date);
    targetDate.setHours(0, 0, 0, 0);
    
    const price = await prisma.goldPrice.findFirst({
      where: {
        date: {
          gte: new Date(targetDate.getTime() - 3 * 24 * 60 * 60 * 1000),
          lte: new Date(targetDate.getTime() + 3 * 24 * 60 * 60 * 1000),
        },
      },
      orderBy: { date: 'asc' },
    });
    
    if (!price) {
      return null;
    }
    
    const [previousDay, nextDay] = await Promise.all([
      prisma.goldPrice.findFirst({
        where: { date: { lt: price.date } },
        orderBy: { date: 'desc' },
      }),
      prisma.goldPrice.findFirst({
        where: { date: { gt: price.date } },
        orderBy: { date: 'asc' },
      }),
    ]);
    
    const weekPrices = await prisma.goldPrice.findMany({
      where: {
        date: {
          gte: subDays(price.date, 7),
          lte: price.date,
        },
      },
      orderBy: { date: 'asc' },
    });
    
    const monthPrices = await prisma.goldPrice.findMany({
      where: {
        date: {
          gte: subDays(price.date, 30),
          lte: price.date,
        },
      },
      orderBy: { date: 'asc' },
    });
    
    const weekHigh = Math.max(...weekPrices.map(p => p.closePrice));
    const weekLow = Math.min(...weekPrices.map(p => p.closePrice));
    const weekStart = weekPrices[0] || null;
    const weekEnd = weekPrices[weekPrices.length - 1] || null;
    const weekChange = weekStart && weekEnd 
      ? ((weekEnd.closePrice - weekStart.closePrice) / weekStart.closePrice) * 100 
      : 0;
    
    const monthHigh = Math.max(...monthPrices.map(p => p.closePrice));
    const monthLow = Math.min(...monthPrices.map(p => p.closePrice));
    const monthStart = monthPrices[0] || null;
    const monthChange = monthStart 
      ? ((price.closePrice - monthStart.closePrice) / monthStart.closePrice) * 100 
      : 0;
    
    let trend: 'bullish' | 'bearish' | 'neutral' = 'neutral';
    if (price.sma20 && price.sma50 && price.sma200) {
      if (price.closePrice > price.sma20 && price.sma20 > price.sma50 && price.sma50 > price.sma200) {
        trend = 'bullish';
      } else if (price.closePrice < price.sma20 && price.sma20 < price.sma50 && price.sma50 < price.sma200) {
        trend = 'bearish';
      }
    }
    
    return {
      price: price as PriceData,
      previousDay: previousDay as PriceData | null,
      nextDay: nextDay as PriceData | null,
      weekContext: {
        weekStart: weekStart as PriceData | null,
        weekEnd: weekEnd as PriceData | null,
        weekHigh,
        weekLow,
        weekChange,
      },
      monthContext: {
        monthStart: monthStart as PriceData | null,
        monthHigh,
        monthLow,
        monthChange,
      },
      technicalContext: {
        aboveSma20: price.sma20 ? price.closePrice > price.sma20 : null,
        aboveSma50: price.sma50 ? price.closePrice > price.sma50 : null,
        aboveSma200: price.sma200 ? price.closePrice > price.sma200 : null,
        trend,
      },
    };
  }

  /**
   * Find all price swings greater than a threshold within a time period
   */
  async findSwings(
    minSwingPercent: number,
    startDate?: Date,
    endDate?: Date,
    direction?: 'up' | 'down' | 'both'
  ): Promise<SwingResult[]> {
    const whereClause: { date?: { gte?: Date; lte?: Date } } = {};
    
    if (startDate || endDate) {
      whereClause.date = {};
      if (startDate) whereClause.date.gte = startDate;
      if (endDate) whereClause.date.lte = endDate;
    }
    
    const prices = await prisma.goldPrice.findMany({
      where: whereClause,
      orderBy: { date: 'asc' },
    });
    
    const swings: SwingResult[] = [];
    const absThreshold = Math.abs(minSwingPercent);
    
    for (let i = 1; i < prices.length; i++) {
      const prev = prices[i - 1];
      const curr = prices[i];
      const changePct = ((curr.closePrice - prev.closePrice) / prev.closePrice) * 100;
      
      if (Math.abs(changePct) >= absThreshold) {
        const swingDirection = changePct > 0 ? 'up' : 'down';
        
        if (!direction || direction === 'both' || direction === swingDirection) {
          swings.push({
            startDate: prev.date,
            endDate: curr.date,
            startPrice: prev.closePrice,
            endPrice: curr.closePrice,
            changePercent: changePct,
            changeAbsolute: curr.closePrice - prev.closePrice,
            durationDays: 1,
            direction: swingDirection,
          });
        }
      }
    }
    
    // Also find multi-day swings
    let trendStart = 0;
    let currentDirection: 'up' | 'down' | null = null;
    
    for (let i = 1; i < prices.length; i++) {
      const prev = prices[i - 1];
      const curr = prices[i];
      const dayDirection = curr.closePrice > prev.closePrice ? 'up' : 'down';
      
      if (currentDirection === null) {
        currentDirection = dayDirection;
        continue;
      }
      
      if (dayDirection !== currentDirection) {
        const startPrice = prices[trendStart];
        const endPrice = prices[i - 1];
        const changePct = ((endPrice.closePrice - startPrice.closePrice) / startPrice.closePrice) * 100;
        
        if (Math.abs(changePct) >= absThreshold) {
          const swingDirection = changePct > 0 ? 'up' : 'down';
          
          if (!direction || direction === 'both' || direction === swingDirection) {
            const durationDays = differenceInDays(endPrice.date, startPrice.date);
            
            if (durationDays > 1) {
              swings.push({
                startDate: startPrice.date,
                endDate: endPrice.date,
                startPrice: startPrice.closePrice,
                endPrice: endPrice.closePrice,
                changePercent: changePct,
                changeAbsolute: endPrice.closePrice - startPrice.closePrice,
                durationDays,
                direction: swingDirection,
              });
            }
          }
        }
        
        trendStart = i - 1;
        currentDirection = dayDirection;
      }
    }
    
    return swings.sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent));
  }

  /**
   * Get comprehensive statistics for a time period
   */
  async getPeriodStats(startDate: Date, endDate: Date): Promise<PeriodStats | null> {
    const prices = await prisma.goldPrice.findMany({
      where: {
        date: { gte: startDate, lte: endDate },
      },
      orderBy: { date: 'asc' },
    });
    
    if (prices.length === 0) {
      return null;
    }
    
    const firstPrice = prices[0];
    const lastPrice = prices[prices.length - 1];
    
    let highPrice = -Infinity;
    let lowPrice = Infinity;
    let highDate = firstPrice.date;
    let lowDate = firstPrice.date;
    let maxDailyGain = -Infinity;
    let maxDailyGainDate: Date | null = null;
    let maxDailyLoss = Infinity;
    let maxDailyLossDate: Date | null = null;
    let totalVolatility = 0;
    let volatilityCount = 0;
    
    for (const price of prices) {
      if (price.closePrice > highPrice) {
        highPrice = price.closePrice;
        highDate = price.date;
      }
      if (price.closePrice < lowPrice) {
        lowPrice = price.closePrice;
        lowDate = price.date;
      }
      if (price.dailyChangePct !== null) {
        if (price.dailyChangePct > maxDailyGain) {
          maxDailyGain = price.dailyChangePct;
          maxDailyGainDate = price.date;
        }
        if (price.dailyChangePct < maxDailyLoss) {
          maxDailyLoss = price.dailyChangePct;
          maxDailyLossDate = price.date;
        }
      }
      if (price.volatility7d !== null) {
        totalVolatility += price.volatility7d;
        volatilityCount++;
      }
    }
    
    const avgPrice = prices.reduce((sum, p) => sum + p.closePrice, 0) / prices.length;
    const totalChange = lastPrice.closePrice - firstPrice.closePrice;
    const totalChangePct = (totalChange / firstPrice.closePrice) * 100;
    const avgDailyChange = prices
      .filter(p => p.dailyChangePct !== null)
      .reduce((sum, p) => sum + (p.dailyChangePct || 0), 0) / prices.length;
    
    return {
      startDate: firstPrice.date,
      endDate: lastPrice.date,
      startPrice: firstPrice.closePrice,
      endPrice: lastPrice.closePrice,
      highPrice,
      highDate,
      lowPrice,
      lowDate,
      avgPrice,
      totalChange,
      totalChangePct,
      avgDailyChange,
      avgVolatility: volatilityCount > 0 ? totalVolatility / volatilityCount : 0,
      maxDailyGain: maxDailyGain === -Infinity ? 0 : maxDailyGain,
      maxDailyGainDate,
      maxDailyLoss: maxDailyLoss === Infinity ? 0 : maxDailyLoss,
      maxDailyLossDate,
      dataPoints: prices.length,
    };
  }

  /**
   * Search for dates matching specific criteria
   */
  async searchDates(criteria: {
    minPrice?: number;
    maxPrice?: number;
    minDailyChange?: number;
    maxDailyChange?: number;
    minVolatility?: number;
    maxVolatility?: number;
    trend?: 'bullish' | 'bearish';
    startDate?: Date;
    endDate?: Date;
    limit?: number;
  }): Promise<PriceData[]> {
    const where: Record<string, unknown> = {};
    
    if (criteria.minPrice !== undefined || criteria.maxPrice !== undefined) {
      where.closePrice = {};
      if (criteria.minPrice !== undefined) (where.closePrice as Record<string, number>).gte = criteria.minPrice;
      if (criteria.maxPrice !== undefined) (where.closePrice as Record<string, number>).lte = criteria.maxPrice;
    }
    
    if (criteria.minDailyChange !== undefined || criteria.maxDailyChange !== undefined) {
      where.dailyChangePct = {};
      if (criteria.minDailyChange !== undefined) (where.dailyChangePct as Record<string, number>).gte = criteria.minDailyChange;
      if (criteria.maxDailyChange !== undefined) (where.dailyChangePct as Record<string, number>).lte = criteria.maxDailyChange;
    }
    
    if (criteria.minVolatility !== undefined || criteria.maxVolatility !== undefined) {
      where.volatility7d = {};
      if (criteria.minVolatility !== undefined) (where.volatility7d as Record<string, number>).gte = criteria.minVolatility;
      if (criteria.maxVolatility !== undefined) (where.volatility7d as Record<string, number>).lte = criteria.maxVolatility;
    }
    
    if (criteria.startDate || criteria.endDate) {
      where.date = {};
      if (criteria.startDate) (where.date as Record<string, Date>).gte = criteria.startDate;
      if (criteria.endDate) (where.date as Record<string, Date>).lte = criteria.endDate;
    }
    
    const results = await prisma.goldPrice.findMany({
      where,
      orderBy: { date: 'desc' },
      take: criteria.limit || 100,
    });
    
    if (criteria.trend) {
      return results.filter(p => {
        if (!p.sma20 || !p.sma50 || !p.sma200) return false;
        if (criteria.trend === 'bullish') {
          return p.closePrice > p.sma20 && p.sma20 > p.sma50 && p.sma50 > p.sma200;
        } else {
          return p.closePrice < p.sma20 && p.sma20 < p.sma50 && p.sma50 < p.sma200;
        }
      }) as PriceData[];
    }
    
    return results as PriceData[];
  }

  /**
   * Get price by specific date
   */
  async getPriceByDate(date: Date): Promise<PriceData | null> {
    const targetDate = new Date(date);
    targetDate.setHours(0, 0, 0, 0);
    
    const price = await prisma.goldPrice.findUnique({
      where: { date: targetDate },
    });
    
    return price as PriceData | null;
  }

  /**
   * Get all prices in a range
   */
  async getPricesInRange(startDate: Date, endDate: Date): Promise<PriceData[]> {
    const prices = await prisma.goldPrice.findMany({
      where: {
        date: { gte: startDate, lte: endDate },
      },
      orderBy: { date: 'asc' },
    });
    
    return prices as PriceData[];
  }

  /**
   * Get the most recent price
   */
  async getLatestPrice(): Promise<PriceData | null> {
    const price = await prisma.goldPrice.findFirst({
      orderBy: { date: 'desc' },
    });
    
    return price as PriceData | null;
  }

  /**
   * Log a query for analytics
   */
  async logQuery(queryType: string, parameters: Record<string, unknown>, resultsCount: number, executionTimeMs: number): Promise<void> {
    await prisma.queryLog.create({
      data: {
        queryType,
        parameters: JSON.stringify(parameters),
        resultsCount,
        executionTimeMs,
      },
    });
  }
}

export const brainService = new BrainService();
export default brainService;
