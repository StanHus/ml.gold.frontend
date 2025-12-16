import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';

const WORLD_NEWS_API_KEY = process.env.WORLD_NEWS_API_KEY;

interface AnalysisRequest {
  swingId?: string;
  startDate: string;
  endDate: string;
  priceChangeDate: string;
  priceChangePct: number;
  lookbackDays: number;
  searchTerms: string[];
}

interface NewsArticle {
  id: number;
  title: string;
  text: string;
  summary?: string;
  url: string;
  publish_date: string;
  sentiment?: number;
  source_country?: string;
}

// Keyword weights for gold impact analysis
const IMPACT_KEYWORDS = {
  bullish: [
    { term: 'inflation rises', weight: 25 },
    { term: 'inflation surge', weight: 30 },
    { term: 'inflation fears', weight: 20 },
    { term: 'rate cut', weight: 25 },
    { term: 'fed cuts', weight: 25 },
    { term: 'interest rate cut', weight: 25 },
    { term: 'dovish', weight: 20 },
    { term: 'quantitative easing', weight: 30 },
    { term: 'money printing', weight: 25 },
    { term: 'stimulus', weight: 15 },
    { term: 'safe haven', weight: 20 },
    { term: 'geopolitical tension', weight: 20 },
    { term: 'war', weight: 25 },
    { term: 'conflict', weight: 15 },
    { term: 'crisis', weight: 20 },
    { term: 'recession fears', weight: 20 },
    { term: 'economic uncertainty', weight: 20 },
    { term: 'dollar weakness', weight: 25 },
    { term: 'dollar falls', weight: 25 },
    { term: 'usd decline', weight: 25 },
    { term: 'central bank buying', weight: 30 },
    { term: 'gold demand', weight: 20 },
    { term: 'gold rally', weight: 15 },
    { term: 'gold surge', weight: 20 },
    { term: 'record high gold', weight: 25 },
    { term: 'debt ceiling', weight: 15 },
    { term: 'default risk', weight: 20 },
    { term: 'banking crisis', weight: 25 },
    { term: 'bank failure', weight: 25 },
  ],
  bearish: [
    { term: 'rate hike', weight: -25 },
    { term: 'fed raises', weight: -25 },
    { term: 'interest rate increase', weight: -25 },
    { term: 'hawkish', weight: -20 },
    { term: 'taper', weight: -20 },
    { term: 'inflation cools', weight: -20 },
    { term: 'inflation falls', weight: -20 },
    { term: 'strong dollar', weight: -25 },
    { term: 'dollar rises', weight: -25 },
    { term: 'usd strength', weight: -25 },
    { term: 'risk appetite', weight: -15 },
    { term: 'stock rally', weight: -10 },
    { term: 'equity gains', weight: -10 },
    { term: 'gold selloff', weight: -20 },
    { term: 'gold falls', weight: -15 },
    { term: 'gold decline', weight: -15 },
    { term: 'yields rise', weight: -20 },
    { term: 'bond yields up', weight: -20 },
    { term: 'treasury yields', weight: -15 },
    { term: 'economic growth', weight: -10 },
    { term: 'gdp growth', weight: -10 },
    { term: 'jobs report strong', weight: -15 },
    { term: 'unemployment falls', weight: -10 },
  ],
};

function analyzeNewsImpact(article: NewsArticle): {
  score: number;
  confidence: number;
  reasoning: string;
  matchedKeywords: string[];
} {
  const text = `${article.title} ${article.text}`.toLowerCase();
  let score = 0;
  const matchedKeywords: string[] = [];
  const reasons: string[] = [];

  // Check bullish keywords
  for (const { term, weight } of IMPACT_KEYWORDS.bullish) {
    if (text.includes(term)) {
      score += weight;
      matchedKeywords.push(term);
      reasons.push(`"${term}" (+${weight})`);
    }
  }

  // Check bearish keywords
  for (const { term, weight } of IMPACT_KEYWORDS.bearish) {
    if (text.includes(term)) {
      score += weight; // weight is already negative
      matchedKeywords.push(term);
      reasons.push(`"${term}" (${weight})`);
    }
  }

  // Factor in API sentiment if available
  if (article.sentiment !== undefined) {
    const sentimentBonus = article.sentiment * 20;
    score += sentimentBonus;
    if (Math.abs(sentimentBonus) > 5) {
      reasons.push(`API sentiment: ${article.sentiment > 0 ? '+' : ''}${sentimentBonus.toFixed(0)}`);
    }
  }

  // Calculate confidence based on matched keywords
  const confidence = Math.min(0.3 + matchedKeywords.length * 0.1, 0.95);

  // Clamp score
  score = Math.max(-100, Math.min(100, score));

  return {
    score,
    confidence,
    reasoning: reasons.length > 0 ? reasons.join(', ') : 'No significant keywords detected',
    matchedKeywords,
  };
}

async function fetchNewsForAnalysis(
  startDate: Date,
  endDate: Date,
  searchTerms: string[]
): Promise<NewsArticle[]> {
  const allArticles: NewsArticle[] = [];

  for (const term of searchTerms) {
    const url = new URL('https://api.worldnewsapi.com/search-news');
    url.searchParams.set('api-key', WORLD_NEWS_API_KEY || '');
    url.searchParams.set('text', term);
    url.searchParams.set('language', 'en');
    url.searchParams.set('earliest-publish-date', startDate.toISOString().split('T')[0]);
    url.searchParams.set('latest-publish-date', endDate.toISOString().split('T')[0]);
    url.searchParams.set('number', '20');
    url.searchParams.set('sort', 'publish-time');
    url.searchParams.set('sort-direction', 'desc');

    try {
      const response = await fetch(url.toString());
      if (response.ok) {
        const data = await response.json();
        if (data.news) {
          allArticles.push(...data.news);
        }
      }
    } catch (error) {
      console.error(`Failed to fetch news for term "${term}":`, error);
    }
  }

  // Deduplicate by URL
  const seen = new Set<string>();
  return allArticles.filter((article) => {
    if (seen.has(article.url)) return false;
    seen.add(article.url);
    return true;
  });
}

export async function POST(request: NextRequest) {
  try {
    const body: AnalysisRequest = await request.json();
    const { startDate, endDate, priceChangeDate, priceChangePct, lookbackDays, searchTerms } = body;

    if (!startDate || !endDate || !searchTerms || searchTerms.length === 0) {
      return NextResponse.json(
        { success: false, error: 'startDate, endDate, and searchTerms are required' },
        { status: 400 }
      );
    }

    // Fetch news
    const articles = await fetchNewsForAnalysis(
      new Date(startDate),
      new Date(endDate),
      searchTerms
    );

    // Get the price record for the change date
    const priceDate = new Date(priceChangeDate);
    priceDate.setHours(0, 0, 0, 0);
    
    let goldPrice = await prisma.goldPrice.findFirst({
      where: {
        date: {
          gte: new Date(priceDate.getTime() - 24 * 60 * 60 * 1000),
          lte: new Date(priceDate.getTime() + 24 * 60 * 60 * 1000),
        },
      },
      orderBy: { date: 'desc' },
    });

    if (!goldPrice) {
      // Create a placeholder price record
      goldPrice = await prisma.goldPrice.create({
        data: {
          date: priceDate,
          closePrice: 0,
          dailyChangePct: priceChangePct,
          source: 'analysis',
        },
      });
    }

    // Analyze and store each article
    const results = [];

    for (const article of articles) {
      const analysis = analyzeNewsImpact(article);
      const externalId = String(article.id);

      // Store article
      const storedArticle = await prisma.newsArticle.upsert({
        where: { externalId },
        update: {
          title: article.title,
          text: article.text,
          summary: article.summary,
          sentiment: article.sentiment,
        },
        create: {
          externalId,
          title: article.title,
          text: article.text,
          summary: article.summary,
          url: article.url,
          publishedAt: new Date(article.publish_date),
          source: 'worldnews',
          sentiment: article.sentiment,
        },
      });

      // Store quantification
      const quantification = await prisma.newsQuantification.upsert({
        where: {
          newsArticleId_goldPriceId: {
            newsArticleId: storedArticle.id,
            goldPriceId: goldPrice.id,
          },
        },
        update: {
          impactScore: analysis.score,
          confidenceScore: analysis.confidence,
          reasoning: analysis.reasoning,
          lagDays: lookbackDays,
        },
        create: {
          newsArticleId: storedArticle.id,
          goldPriceId: goldPrice.id,
          impactScore: analysis.score,
          confidenceScore: analysis.confidence,
          reasoning: analysis.reasoning,
          lagDays: lookbackDays,
        },
      });

      results.push({
        id: quantification.id,
        articleId: storedArticle.id,
        title: article.title,
        publishedAt: article.publish_date,
        url: article.url,
        impactScore: analysis.score,
        confidence: analysis.confidence,
        reasoning: analysis.reasoning,
        matchedKeywords: analysis.matchedKeywords,
        humanRating: quantification.humanScore,
        humanVerified: quantification.humanVerified,
      });
    }

    // Sort by absolute impact score
    results.sort((a, b) => Math.abs(b.impactScore) - Math.abs(a.impactScore));

    return NextResponse.json({
      success: true,
      data: {
        priceChange: {
          date: priceChangeDate,
          changePct: priceChangePct,
        },
        newsRange: {
          start: startDate,
          end: endDate,
          lookbackDays,
        },
        searchTerms,
        articlesFound: results.length,
        articles: results,
        summary: {
          avgImpactScore: results.length > 0
            ? results.reduce((sum, r) => sum + r.impactScore, 0) / results.length
            : 0,
          bullishCount: results.filter((r) => r.impactScore > 10).length,
          bearishCount: results.filter((r) => r.impactScore < -10).length,
          neutralCount: results.filter((r) => Math.abs(r.impactScore) <= 10).length,
        },
      },
    });
  } catch (error) {
    console.error('Analysis error:', error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}

// Rate an analysis
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { quantificationId, rating, feedback } = body;

    if (!quantificationId || rating === undefined) {
      return NextResponse.json(
        { success: false, error: 'quantificationId and rating are required' },
        { status: 400 }
      );
    }

    // Convert 1-10 rating to -100 to +100 scale for consistency
    // 1 = completely wrong, 5 = neutral, 10 = perfectly accurate
    const normalizedScore = ((rating - 5) / 5) * 100;

    const updated = await prisma.newsQuantification.update({
      where: { id: quantificationId },
      data: {
        humanScore: normalizedScore,
        humanVerified: true,
        humanFeedback: feedback,
        verifiedAt: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      data: updated,
    });
  } catch (error) {
    console.error('Rating error:', error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}

// Get saved analyses
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '50');
    const unratedOnly = searchParams.get('unrated') === 'true';

    const quantifications = await prisma.newsQuantification.findMany({
      where: unratedOnly ? { humanVerified: false } : {},
      include: {
        newsArticle: true,
        goldPrice: true,
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    const results = quantifications.map((q: typeof quantifications[number]) => ({
      id: q.id,
      articleId: q.newsArticleId,
      title: q.newsArticle.title,
      publishedAt: q.newsArticle.publishedAt,
      url: q.newsArticle.url,
      impactScore: q.impactScore,
      confidence: q.confidenceScore,
      reasoning: q.reasoning,
      priceDate: q.goldPrice.date,
      priceChange: q.goldPrice.dailyChangePct,
      humanRating: q.humanScore !== null ? ((q.humanScore / 100) * 5 + 5) : null, // Convert back to 1-10
      humanVerified: q.humanVerified,
      humanFeedback: q.humanFeedback,
    }));

    return NextResponse.json({
      success: true,
      data: results,
    });
  } catch (error) {
    console.error('Fetch error:', error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}

