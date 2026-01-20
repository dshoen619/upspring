/**
 * Brand Cache Builder Script
 *
 * This script looks up Facebook page IDs for brands and adds them to brands.json
 *
 * Usage:
 *   npx ts-node scripts/build-brands-cache.ts --brands "Nike,Adidas,Puma"
 *   npx ts-node scripts/build-brands-cache.ts --file brands-to-add.txt
 *   npx ts-node scripts/build-brands-cache.ts --interactive
 */

import { ApifyClient } from 'apify-client';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const BRANDS_FILE = path.join(__dirname, '../src/data/brands.json');
const ACTOR_ID = 'curious_coder/facebook-ads-library-scraper';

interface BrandEntry {
  pageId: string;
  name: string;
}

interface BrandsCache {
  brands: Record<string, BrandEntry>;
  _metadata?: {
    lastUpdated: string;
    totalBrands: number;
    note: string;
  };
}

interface RawAdItem {
  page_id?: string;
  pageID?: string;
  page_name?: string;
  pageName?: string;
  snapshot?: {
    page_name?: string;
  };
}

class BrandCacheBuilder {
  private client: ApifyClient;
  private cache: BrandsCache;

  constructor() {
    const apiKey = process.env.APIFY_API_KEY;
    if (!apiKey) {
      throw new Error('APIFY_API_KEY environment variable is required');
    }
    this.client = new ApifyClient({ token: apiKey });
    this.cache = this.loadCache();
  }

  private loadCache(): BrandsCache {
    try {
      const content = fs.readFileSync(BRANDS_FILE, 'utf-8');
      return JSON.parse(content);
    } catch {
      return { brands: {} };
    }
  }

  private saveCache(): void {
    this.cache._metadata = {
      lastUpdated: new Date().toISOString().split('T')[0],
      totalBrands: Object.keys(this.cache.brands).length,
      note: 'Page IDs are cached for faster lookups. New brands are automatically added via dynamic caching.',
    };
    fs.writeFileSync(BRANDS_FILE, JSON.stringify(this.cache, null, 2));
    console.log(`✅ Cache saved with ${this.cache._metadata.totalBrands} brands`);
  }

  async lookupBrand(brandName: string): Promise<{ pageId: string; pageName: string } | null> {
    const normalizedKey = brandName.toLowerCase().trim();

    // Check if already in cache
    if (this.cache.brands[normalizedKey]) {
      console.log(`⏭️  "${brandName}" already in cache (${this.cache.brands[normalizedKey].pageId})`);
      return null;
    }

    console.log(`🔍 Looking up "${brandName}"...`);

    try {
      // Build Meta Ad Library search URL
      const params = new URLSearchParams({
        active_status: 'all',
        ad_type: 'all',
        country: 'US',
        q: brandName,
        search_type: 'page',
        media_type: 'all',
      });
      const searchUrl = `https://www.facebook.com/ads/library/?${params.toString()}`;

      // Run Apify actor
      const run = await this.client.actor(ACTOR_ID).call(
        {
          urls: [{ url: searchUrl }],
          count: 20, // Get some results to find best match
        },
        {
          timeout: 120,
          waitSecs: 120,
        }
      );

      if (run.status !== 'SUCCEEDED') {
        console.log(`❌ Actor run failed for "${brandName}"`);
        return null;
      }

      // Fetch results
      const { items } = await this.client.dataset(run.defaultDatasetId).listItems();

      if (items.length === 0) {
        console.log(`❌ No results found for "${brandName}"`);
        return null;
      }

      // Group by page ID and find best match
      const pageMap = new Map<string, { pageName: string; count: number }>();

      for (const item of items as RawAdItem[]) {
        const pageId = item.page_id || item.pageID;
        const pageName = item.page_name || item.pageName || item.snapshot?.page_name;

        if (!pageId || !pageName) continue;

        const existing = pageMap.get(pageId);
        if (existing) {
          existing.count++;
        } else {
          pageMap.set(pageId, { pageName, count: 1 });
        }
      }

      if (pageMap.size === 0) {
        console.log(`❌ No valid page IDs found for "${brandName}"`);
        return null;
      }

      // Find best match - ONLY consider pages with actual name similarity
      const searchLower = brandName.toLowerCase();
      let bestMatch: { pageId: string; pageName: string; score: number } | null = null;

      for (const [pageId, { pageName, count }] of Array.from(pageMap)) {
        const nameLower = pageName.toLowerCase();

        // Calculate name similarity score - ONLY based on name match
        let nameScore = 0;

        if (nameLower === searchLower) {
          nameScore = 1000; // Exact match
        } else if (nameLower.startsWith(searchLower) || searchLower.startsWith(nameLower)) {
          nameScore = 500; // Starts with
        } else if (nameLower.includes(searchLower) || searchLower.includes(nameLower)) {
          nameScore = 100; // Contains
        }

        // SKIP pages with no name relevance
        if (nameScore === 0) {
          continue;
        }

        // Add ad count bonus only for pages with name relevance
        const totalScore = nameScore + Math.min(count, 50);

        if (!bestMatch || totalScore > bestMatch.score) {
          bestMatch = { pageId, pageName, score: totalScore };
        }
      }

      if (bestMatch) {
        console.log(`✅ Found "${bestMatch.pageName}" (${bestMatch.pageId}) for "${brandName}"`);
        return { pageId: bestMatch.pageId, pageName: bestMatch.pageName };
      }

      console.log(`❌ No matching page found for "${brandName}" (no pages with similar name)`);
      return null;
    } catch (error) {
      console.log(`❌ Error looking up "${brandName}": ${error instanceof Error ? error.message : 'Unknown error'}`);
      return null;
    }
  }

  async addBrand(brandName: string): Promise<boolean> {
    const result = await this.lookupBrand(brandName);
    if (result) {
      const normalizedKey = brandName.toLowerCase().trim();
      this.cache.brands[normalizedKey] = {
        pageId: result.pageId,
        name: result.pageName,
      };
      return true;
    }
    return false;
  }

  async addBrands(brandNames: string[]): Promise<void> {
    let added = 0;
    let skipped = 0;
    let failed = 0;

    for (let i = 0; i < brandNames.length; i++) {
      const brand = brandNames[i].trim();
      if (!brand) continue;

      console.log(`\n[${i + 1}/${brandNames.length}] Processing "${brand}"...`);

      const success = await this.addBrand(brand);
      if (success) {
        added++;
        // Save after each successful addition
        this.saveCache();
      } else if (this.cache.brands[brand.toLowerCase()]) {
        skipped++;
      } else {
        failed++;
      }

      // Rate limiting - wait between requests
      if (i < brandNames.length - 1) {
        console.log('⏳ Waiting 1 seconds before next lookup...');
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    console.log('\n📊 Summary:');
    console.log(`   Added: ${added}`);
    console.log(`   Skipped (already cached): ${skipped}`);
    console.log(`   Failed: ${failed}`);
    console.log(`   Total brands in cache: ${Object.keys(this.cache.brands).length}`);
  }

  async runInteractive(): Promise<void> {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const ask = (question: string): Promise<string> => {
      return new Promise(resolve => {
        rl.question(question, resolve);
      });
    };

    console.log('\n🏗️  Brand Cache Builder - Interactive Mode');
    console.log('Type brand names one at a time, or "quit" to exit.\n');

    while (true) {
      const input = await ask('Enter brand name (or "quit"): ');

      if (input.toLowerCase() === 'quit') {
        break;
      }

      if (input.trim()) {
        await this.addBrand(input.trim());
        this.saveCache();
      }
    }

    rl.close();
    console.log('\nGoodbye! 👋');
  }

  // Manual add without lookup (if you already know the page ID)
  addManual(brandName: string, pageId: string, displayName?: string): void {
    const normalizedKey = brandName.toLowerCase().trim();
    this.cache.brands[normalizedKey] = {
      pageId,
      name: displayName || brandName,
    };
    this.saveCache();
    console.log(`✅ Manually added "${brandName}" with page ID ${pageId}`);
  }
}

// Parse command line arguments
async function main() {
  const args = process.argv.slice(2);
  const builder = new BrandCacheBuilder();

  if (args.includes('--interactive') || args.includes('-i')) {
    await builder.runInteractive();
  } else if (args.includes('--brands') || args.includes('-b')) {
    const brandsIndex = args.findIndex(a => a === '--brands' || a === '-b');
    const brandsList = args[brandsIndex + 1];
    if (!brandsList) {
      console.error('Please provide comma-separated brand names after --brands');
      process.exit(1);
    }
    const brands = brandsList.split(',').map(b => b.trim()).filter(Boolean);
    await builder.addBrands(brands);
  } else if (args.includes('--file') || args.includes('-f')) {
    const fileIndex = args.findIndex(a => a === '--file' || a === '-f');
    const filePath = args[fileIndex + 1];
    if (!filePath) {
      console.error('Please provide a file path after --file');
      process.exit(1);
    }
    const content = fs.readFileSync(filePath, 'utf-8');
    const brands = content.split('\n').map(b => b.trim()).filter(b => b && !b.startsWith('#'));
    await builder.addBrands(brands);
  } else if (args.includes('--manual') || args.includes('-m')) {
    // Usage: --manual "Brand Name" "pageId" "Display Name"
    const manualIndex = args.findIndex(a => a === '--manual' || a === '-m');
    const brandName = args[manualIndex + 1];
    const pageId = args[manualIndex + 2];
    const displayName = args[manualIndex + 3];
    if (!brandName || !pageId) {
      console.error('Usage: --manual "Brand Name" "pageId" ["Display Name"]');
      process.exit(1);
    }
    builder.addManual(brandName, pageId, displayName);
  } else {
    console.log(`
🏗️  Brand Cache Builder

Usage:
  npx ts-node scripts/build-brands-cache.ts --brands "Nike,Adidas,Puma"
  npx ts-node scripts/build-brands-cache.ts --file brands-to-add.txt
  npx ts-node scripts/build-brands-cache.ts --interactive
  npx ts-node scripts/build-brands-cache.ts --manual "Brand Name" "123456789" "Display Name"

Options:
  -b, --brands      Comma-separated list of brand names to look up
  -f, --file        Path to text file with one brand name per line
  -i, --interactive Interactive mode - enter brands one at a time
  -m, --manual      Manually add a brand with known page ID

Examples:
  # Look up multiple brands
  npx ts-node scripts/build-brands-cache.ts -b "Tesla,SpaceX,OpenAI"

  # Add from a file
  echo -e "Tesla\\nSpaceX\\nOpenAI" > brands.txt
  npx ts-node scripts/build-brands-cache.ts -f brands.txt

  # Manually add if you know the page ID
  npx ts-node scripts/build-brands-cache.ts -m "Tesla" "108068145865" "Tesla"
    `);
  }
}

main().catch(console.error);
