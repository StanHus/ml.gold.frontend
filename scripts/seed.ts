/**
 * Fast Seed Script - Uses raw SQL for bulk operations
 */

import { Pool } from 'pg';
import { parse } from 'date-fns';
import * as fs from 'fs';
import * as path from 'path';
import 'dotenv/config';

const pool = new Pool({ 
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

function parseCsvDate(dateStr: string): Date {
  const normalized = dateStr.replace(/Sept/g, 'Sep');
  const parsed = parse(normalized, 'd MMM yyyy', new Date());
  if (!isNaN(parsed.getTime())) {
    parsed.setHours(0, 0, 0, 0);
    return parsed;
  }
  throw new Error(`Unable to parse date: ${dateStr}`);
}

function generateId(): string {
  return 'c' + Date.now().toString(36) + Math.random().toString(36).substring(2, 15);
}

async function main() {
  const client = await pool.connect();
  
  try {
    console.log('🚀 Starting fast seed...\n');
    
    const csvPath = path.join(process.cwd(), 'prices.csv');
    const content = fs.readFileSync(csvPath, 'utf-8');
    const lines = content.trim().replace(/\r\n/g, '\n').split('\n');
    
    console.log(`📊 Processing ${lines.length - 1} records...\n`);
    
    // Build bulk insert values
    const values: string[] = [];
    for (let i = 1; i < lines.length; i++) {
      const [dateStr, closeStr] = lines[i].split(',').map(v => v.trim());
      if (!dateStr || !closeStr) continue;
      
      try {
        const date = parseCsvDate(dateStr);
        const closePrice = parseFloat(closeStr);
        if (isNaN(closePrice)) continue;
        
        const id = generateId();
        values.push(`('${id}', '${date.toISOString()}', ${closePrice}, 'csv', NOW(), NOW())`);
      } catch { continue; }
    }
    
    console.log(`  Inserting ${values.length} prices...`);
    
    // Bulk insert in chunks of 1000
    for (let i = 0; i < values.length; i += 1000) {
      const chunk = values.slice(i, i + 1000);
      await client.query(`
        INSERT INTO "GoldPrice" (id, date, "closePrice", source, "createdAt", "updatedAt")
        VALUES ${chunk.join(',')}
        ON CONFLICT (date) DO UPDATE SET "closePrice" = EXCLUDED."closePrice", "updatedAt" = NOW()
      `);
      console.log(`    Inserted ${Math.min(i + 1000, values.length)}/${values.length}`);
    }
    
    console.log('\n📈 Calculating metrics with SQL...');
    
    // Calculate all derived metrics in one SQL query
    await client.query(`
      WITH ordered AS (
        SELECT id, date, "closePrice",
          LAG("closePrice") OVER (ORDER BY date) as prev_price,
          ROW_NUMBER() OVER (ORDER BY date) as rn
        FROM "GoldPrice"
      ),
      with_change AS (
        SELECT id, date, "closePrice", prev_price, rn,
          CASE WHEN prev_price > 0 THEN "closePrice" - prev_price END as daily_change,
          CASE WHEN prev_price > 0 THEN (("closePrice" - prev_price) / prev_price) * 100 END as daily_change_pct
        FROM ordered
      ),
      with_sma AS (
        SELECT id,
          daily_change,
          daily_change_pct,
          AVG("closePrice") OVER (ORDER BY date ROWS BETWEEN 19 PRECEDING AND CURRENT ROW) as sma20,
          AVG("closePrice") OVER (ORDER BY date ROWS BETWEEN 49 PRECEDING AND CURRENT ROW) as sma50,
          AVG("closePrice") OVER (ORDER BY date ROWS BETWEEN 199 PRECEDING AND CURRENT ROW) as sma200
        FROM with_change
      )
      UPDATE "GoldPrice" g SET
        "dailyChange" = ws.daily_change,
        "dailyChangePct" = ws.daily_change_pct,
        sma20 = ws.sma20,
        sma50 = ws.sma50,
        sma200 = ws.sma200
      FROM with_sma ws WHERE g.id = ws.id
    `);
    
    console.log('  ✓ Metrics calculated\n');
    
    // Initialize patterns
    console.log('🔍 Initializing patterns...');
    const patterns = [
      ['double_top', 'Bearish reversal with two peaks', 35, -3],
      ['double_bottom', 'Bullish reversal with two troughs', 35, 3],
      ['golden_cross', 'SMA50 crosses above SMA200', 1, 5],
      ['death_cross', 'SMA50 crosses below SMA200', 1, -5],
      ['breakout_up', 'Price breaks above resistance', 3, 4],
      ['breakout_down', 'Price breaks below support', 3, -4],
    ];
    
    for (const [name, desc, dur, impact] of patterns) {
      await client.query(`
        INSERT INTO "Pattern" (id, name, description, "typicalDuration", "typicalImpact", "createdAt", "updatedAt")
        VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
        ON CONFLICT (name) DO UPDATE SET description = $3
      `, [generateId(), name, desc, dur, impact]);
    }
    
    console.log('  ✓ Patterns initialized\n');
    
    // Summary
    const { rows: [{ count }] } = await client.query('SELECT COUNT(*) FROM "GoldPrice"');
    const { rows: [latest] } = await client.query('SELECT date, "closePrice" FROM "GoldPrice" ORDER BY date DESC LIMIT 1');
    
    console.log('📊 Summary:');
    console.log(`   Total prices: ${count}`);
    console.log(`   Latest: $${latest.closePrice} on ${latest.date.toISOString().split('T')[0]}`);
    console.log('\n🎉 Done!\n');
    
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(e => { console.error(e); process.exit(1); });
