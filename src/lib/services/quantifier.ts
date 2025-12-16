/**
 * News Quantifier Engine
 * Analyzes and scores news impact on gold prices
 * Implements the feedback loop for human corrections
 */

import prisma from '../db';
import { subDays, differenceInDays } from 'date-fns';

const CATEGORY_WEIGHTS: Record<string, { baseImpact: number; volatilityMultiplier: number }> = {
  inflation: { baseImpact: 0.7, volatilityMultiplier: 1.2 },
  interest_rates: { baseImpact: 0.8, volatilityMultiplier: 1.3 },
  currency: { baseImpact: 0.6, volatilityMultiplier: 1.1 },
  geopolitics: { baseImpact: 0.9, volatilityMultiplier: 1.5 },
  economy: { baseImpact: 0.5, volatilityMultiplier: 1.0 },
  demand: { baseImpact: 0.6, volatilityMultiplier: 1.0 },
  supply: { baseImpact: 0.5, volatilityMultiplier: 0.9 },
  general: { baseImpact: 0.3, volatilityMultiplier: 0.8 },
};

const SENTIMENT_KEYWORDS = {
  bullish: [
    'gold rises', 'gold gains', 'gold rally', 'gold surges', 'safe haven demand',
    'inflation fears', 'rate cut', 'dovish', 'uncertainty', 'crisis', 'war',
    'dollar weakens', 'stimulus', 'debt concerns', 'recession fears',
    'central bank buying', 'gold demand', 'etf inflows',
  ],
  bearish: [
    'gold falls', 'gold drops', 'gold declines', 'gold tumbles', 'risk-on',
    'rate hike', 'hawkish', 'strong economy', 'dollar strength', 'dollar rally',
    'inflation eases', 'recovery', 'stock rally', 'bond yields rise',
    'etf outflows', 'profit taking',
  ],
};

export interface QuantificationResult {
  newsArticleId: string;
  goldPriceId: string;
  impactScore: number;
  confidenceScore: number;
  lagDays: number;
  impactCategory: string;
  reasoning: string;
}

export interface FeedbackStats {
  totalQuantifications: number;
  humanVerified: number;
  avgAlgorithmScore: number;
  avgHumanScore: number;
  avgDiscrepancy: number;
  categoryAccuracy: Record<string, number>;
}

export class QuantifierService {
  analyzeArticleImpact(article: {
    title: string;
    text: string;
    category: string | null;
    sentiment: number | null;
    publishedAt: Date;
  }): { sentiment: 'bullish' | 'bearish' | 'neutral'; confidence: number; keywords: string[] } {
    const fullText = `${article.title} ${article.text}`.toLowerCase();
    
    let bullishCount = 0;
    let bearishCount = 0;
    const matchedKeywords: string[] = [];
    
    for (const keyword of SENTIMENT_KEYWORDS.bullish) {
      if (fullText.includes(keyword.toLowerCase())) {
        bullishCount++;
        matchedKeywords.push(keyword);
      }
    }
    
    for (const keyword of SENTIMENT_KEYWORDS.bearish) {
      if (fullText.includes(keyword.toLowerCase())) {
        bearishCount++;
        matchedKeywords.push(keyword);
      }
    }
    
    const totalMatches = bullishCount + bearishCount;
    
    if (totalMatches === 0) {
      return { sentiment: 'neutral', confidence: 0.3, keywords: [] };
    }
    
    const netSentiment = bullishCount - bearishCount;
    const confidence = Math.min(0.9, 0.3 + (totalMatches * 0.1));
    
    if (netSentiment > 0) {
      return { sentiment: 'bullish', confidence, keywords: matchedKeywords };
    } else if (netSentiment < 0) {
      return { sentiment: 'bearish', confidence, keywords: matchedKeywords };
    } else {
      return { sentiment: 'neutral', confidence: confidence * 0.5, keywords: matchedKeywords };
    }
  }

  async calculateImpactScore(newsArticleId: string, goldPriceId: string): Promise<QuantificationResult> {
    const [article, priceData] = await Promise.all([
      prisma.newsArticle.findUnique({ where: { id: newsArticleId } }),
      prisma.goldPrice.findUnique({ where: { id: goldPriceId } }),
    ]);
    
    if (!article || !priceData) {
      throw new Error('Article or price data not found');
    }
    
    const lagDays = differenceInDays(priceData.date, article.publishedAt);
    
    const analysis = this.analyzeArticleImpact({
      title: article.title,
      text: article.text,
      category: article.category,
      sentiment: article.sentiment,
      publishedAt: article.publishedAt,
    });
    
    const category = article.category || 'general';
    const weights = CATEGORY_WEIGHTS[category] || CATEGORY_WEIGHTS.general;
    
    let impactScore = 0;
    
    if (analysis.sentiment === 'bullish') {
      impactScore = weights.baseImpact * 50 * analysis.confidence;
    } else if (analysis.sentiment === 'bearish') {
      impactScore = -weights.baseImpact * 50 * analysis.confidence;
    }
    
    if (priceData.dailyChangePct !== null) {
      const priceDirection = priceData.dailyChangePct > 0 ? 1 : -1;
      const sentimentDirection = analysis.sentiment === 'bullish' ? 1 : analysis.sentiment === 'bearish' ? -1 : 0;
      
      if (priceDirection === sentimentDirection && sentimentDirection !== 0) {
        impactScore *= (1 + Math.abs(priceData.dailyChangePct) / 100);
      }
      
      if (priceData.volatility7d !== null) {
        impactScore *= (1 + (priceData.volatility7d * weights.volatilityMultiplier) / 100);
      }
    }
    
    const lagDecay = Math.max(0.2, 1 - (lagDays * 0.15));
    impactScore *= lagDecay;
    impactScore = Math.max(-100, Math.min(100, impactScore));
    
    const reasoning = this.generateReasoning(article, priceData, analysis, impactScore, lagDays);
    
    return {
      newsArticleId,
      goldPriceId,
      impactScore,
      confidenceScore: analysis.confidence * lagDecay,
      lagDays,
      impactCategory: category,
      reasoning,
    };
  }

  private generateReasoning(
    article: { title: string; category: string | null },
    priceData: { date: Date; closePrice: number; dailyChangePct: number | null },
    analysis: { sentiment: string; confidence: number; keywords: string[] },
    impactScore: number,
    lagDays: number
  ): string {
    const direction = impactScore > 0 ? 'bullish' : impactScore < 0 ? 'bearish' : 'neutral';
    const magnitude = Math.abs(impactScore) > 50 ? 'strong' : Math.abs(impactScore) > 25 ? 'moderate' : 'weak';
    
    let reasoning = `Article "${article.title.substring(0, 50)}..." classified as ${article.category || 'general'}. `;
    reasoning += `Sentiment analysis: ${analysis.sentiment} (confidence: ${(analysis.confidence * 100).toFixed(0)}%). `;
    
    if (analysis.keywords.length > 0) {
      reasoning += `Key terms: ${analysis.keywords.slice(0, 3).join(', ')}. `;
    }
    
    reasoning += `Impact assessment: ${magnitude} ${direction} (score: ${impactScore.toFixed(1)}). `;
    
    if (lagDays > 0) {
      reasoning += `Published ${lagDays} day(s) before price date. `;
    }
    
    if (priceData.dailyChangePct !== null) {
      const actualDirection = priceData.dailyChangePct > 0 ? 'up' : 'down';
      reasoning += `Actual price moved ${actualDirection} ${Math.abs(priceData.dailyChangePct).toFixed(2)}%.`;
    }
    
    return reasoning;
  }

  async quantifyNewsForPeriod(startDate: Date, endDate: Date, options: { maxLagDays?: number } = {}): Promise<{ quantified: number; errors: number }> {
    const { maxLagDays = 3 } = options;
    
    const prices = await prisma.goldPrice.findMany({
      where: { date: { gte: startDate, lte: endDate } },
      orderBy: { date: 'asc' },
    });
    
    let quantified = 0;
    let errors = 0;
    
    for (const price of prices) {
      const articles = await prisma.newsArticle.findMany({
        where: {
          publishedAt: {
            gte: subDays(price.date, maxLagDays),
            lte: price.date,
          },
        },
      });
      
      for (const article of articles) {
        try {
          const result = await this.calculateImpactScore(article.id, price.id);
          
          await prisma.newsQuantification.upsert({
            where: {
              newsArticleId_goldPriceId: {
                newsArticleId: article.id,
                goldPriceId: price.id,
              },
            },
            update: {
              impactScore: result.impactScore,
              confidenceScore: result.confidenceScore,
              lagDays: result.lagDays,
              impactCategory: result.impactCategory,
              reasoning: result.reasoning,
            },
            create: {
              newsArticleId: article.id,
              goldPriceId: price.id,
              impactScore: result.impactScore,
              confidenceScore: result.confidenceScore,
              lagDays: result.lagDays,
              impactCategory: result.impactCategory,
              reasoning: result.reasoning,
            },
          });
          
          quantified++;
        } catch (error) {
          console.error(`Failed to quantify article ${article.id} for price ${price.id}:`, error);
          errors++;
        }
      }
    }
    
    return { quantified, errors };
  }

  async submitFeedback(quantificationId: string, feedback: { humanScore: number; humanFeedback?: string; verifiedBy?: string }): Promise<void> {
    await prisma.newsQuantification.update({
      where: { id: quantificationId },
      data: {
        humanVerified: true,
        humanScore: feedback.humanScore,
        humanFeedback: feedback.humanFeedback,
        verifiedAt: new Date(),
        verifiedBy: feedback.verifiedBy,
      },
    });
  }

  async getPendingReview(limit: number = 50): Promise<{
    id: string;
    impactScore: number;
    confidenceScore: number;
    reasoning: string;
    article: { title: string; text: string; publishedAt: Date };
    price: { date: Date; closePrice: number; dailyChangePct: number | null };
  }[]> {
    const quantifications = await prisma.newsQuantification.findMany({
      where: { humanVerified: false },
      include: {
        newsArticle: { select: { title: true, text: true, publishedAt: true } },
        goldPrice: { select: { date: true, closePrice: true, dailyChangePct: true } },
      },
      orderBy: [{ confidenceScore: 'desc' }, { createdAt: 'desc' }],
      take: limit,
    });
    
    return quantifications.map(q => ({
      id: q.id,
      impactScore: q.impactScore,
      confidenceScore: q.confidenceScore,
      reasoning: q.reasoning || '',
      article: {
        title: q.newsArticle.title,
        text: q.newsArticle.text,
        publishedAt: q.newsArticle.publishedAt,
      },
      price: {
        date: q.goldPrice.date,
        closePrice: q.goldPrice.closePrice,
        dailyChangePct: q.goldPrice.dailyChangePct,
      },
    }));
  }

  async getFeedbackStats(): Promise<FeedbackStats> {
    const allQuantifications = await prisma.newsQuantification.findMany();
    const verifiedQuantifications = allQuantifications.filter(q => q.humanVerified);
    
    const totalQuantifications = allQuantifications.length;
    const humanVerified = verifiedQuantifications.length;
    
    if (humanVerified === 0) {
      return {
        totalQuantifications,
        humanVerified: 0,
        avgAlgorithmScore: 0,
        avgHumanScore: 0,
        avgDiscrepancy: 0,
        categoryAccuracy: {},
      };
    }
    
    const avgAlgorithmScore = verifiedQuantifications.reduce((a, b) => a + b.impactScore, 0) / humanVerified;
    const avgHumanScore = verifiedQuantifications.reduce((a, b) => a + (b.humanScore || 0), 0) / humanVerified;
    const avgDiscrepancy = verifiedQuantifications.reduce((a, b) => a + Math.abs(b.impactScore - (b.humanScore || 0)), 0) / humanVerified;
    
    const categoryAccuracy: Record<string, number> = {};
    const categoryGroups: Record<string, { correct: number; total: number }> = {};
    
    for (const q of verifiedQuantifications) {
      const category = q.impactCategory || 'general';
      if (!categoryGroups[category]) {
        categoryGroups[category] = { correct: 0, total: 0 };
      }
      categoryGroups[category].total++;
      
      if (q.humanScore !== null && Math.abs(q.impactScore - q.humanScore) <= 20) {
        categoryGroups[category].correct++;
      }
    }
    
    for (const [category, stats] of Object.entries(categoryGroups)) {
      categoryAccuracy[category] = stats.total > 0 ? stats.correct / stats.total : 0;
    }
    
    return {
      totalQuantifications,
      humanVerified,
      avgAlgorithmScore,
      avgHumanScore,
      avgDiscrepancy,
      categoryAccuracy,
    };
  }

  async getHighImpactNews(date: Date, minImpactScore: number = 30): Promise<{
    article: { title: string; publishedAt: Date; category: string | null };
    impactScore: number;
    reasoning: string;
    humanVerified: boolean;
    humanScore: number | null;
  }[]> {
    const targetDate = new Date(date);
    targetDate.setHours(0, 0, 0, 0);
    
    const price = await prisma.goldPrice.findUnique({ where: { date: targetDate } });
    
    if (!price) {
      return [];
    }
    
    const quantifications = await prisma.newsQuantification.findMany({
      where: {
        goldPriceId: price.id,
        OR: [
          { impactScore: { gte: minImpactScore } },
          { impactScore: { lte: -minImpactScore } },
        ],
      },
      include: { newsArticle: { select: { title: true, publishedAt: true, category: true } } },
      orderBy: { impactScore: 'desc' },
    });
    
    return quantifications.map(q => ({
      article: {
        title: q.newsArticle.title,
        publishedAt: q.newsArticle.publishedAt,
        category: q.newsArticle.category,
      },
      impactScore: q.impactScore,
      reasoning: q.reasoning || '',
      humanVerified: q.humanVerified,
      humanScore: q.humanScore,
    }));
  }
}

export const quantifierService = new QuantifierService();
export default quantifierService;
