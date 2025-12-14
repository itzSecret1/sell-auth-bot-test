import { writeFileSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';

const variantsDataPath = join(process.cwd(), 'variantsData.json');

// Simple sleep function
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getRealStockFromDeliverables(api, productId, variantId, delayMs = 1000) {
  try {
    // Wait to respect rate limits (1 request per minute minimum)
    await sleep(delayMs);

    const response = await api.get(
      `shops/${api.shopId}/products/${productId}/deliverables/${variantId}`,
      { page: 1, perPage: 1 } // Only need count, not full items
    );

    let items = 0;

    // Parse Laravel pagination response
    if (response?.data && Array.isArray(response.data)) {
      items = response.data.length;
    } else if (response?.total && typeof response.total === 'number') {
      items = response.total;
    } else if (typeof response === 'string') {
      items = response.split('\n').filter((item) => item.trim()).length;
    } else if (Array.isArray(response)) {
      items = response.length;
    }

    return items;
  } catch (e) {
    console.error(`[AUTO-SYNC] Error fetching stock for ${productId}/${variantId}:`, e.message);
    return 0;
  }
}

// Sequential processing to avoid rate limit (one at a time)
async function sequentialFetchStocks(api, allVariantsToFetch) {
  const results = [];

  for (let i = 0; i < allVariantsToFetch.length; i++) {
    const { product, variant } = allVariantsToFetch[i];

    // Delay between requests (60+ seconds to respect rate limit)
    // But on first request, no delay
    const delayMs = i === 0 ? 500 : 60000;

    const stock = await getRealStockFromDeliverables(api, product.id, variant.id, delayMs);
    results.push({ productId: product.id, variantId: variant.id, stock });

    // Show progress
    if ((i + 1) % 10 === 0) {
      console.log(`[AUTO-SYNC] Fetched ${i + 1}/${allVariantsToFetch.length} stocks...`);
    }
  }

  return results;
}

async function autoSyncVariants(api) {
  try {
    const startTime = Date.now();
    const allVariants = {};
    let totalVariants = 0;
    let productsWithVariants = 0;

    console.log('[AUTO-SYNC] Starting full sync with proper rate limit handling...');

    // Get all products (with pagination)
    let allProducts = [];
    let page = 1;
    let hasMore = true;

    while (hasMore && page <= 50) {
      try {
        const response = await api.get(`shops/${api.shopId}/products`, { page, perPage: 100 });
        const products = Array.isArray(response?.data) ? response.data : Array.isArray(response) ? response : [];

        if (products.length === 0) {
          hasMore = false;
        } else {
          allProducts = allProducts.concat(products);
          console.log(`[AUTO-SYNC] Loaded products page ${page}: +${products.length} (total: ${allProducts.length})`);
          page++;
        }
      } catch (e) {
        console.error(`[AUTO-SYNC] Error fetching products page ${page}:`, e.message);
        hasMore = false;
      }
    }

    console.log(`[AUTO-SYNC] Total products loaded: ${allProducts.length}`);

    // Collect all variants to fetch
    const allVariantsToFetch = [];
    for (const product of allProducts) {
      if (product.variants && Array.isArray(product.variants) && product.variants.length > 0) {
        for (const variant of product.variants) {
          allVariantsToFetch.push({ product, variant });
        }
      }
    }

    console.log(`[AUTO-SYNC] Total variants to fetch: ${allVariantsToFetch.length}`);

    // Fetch stock sequentially to avoid rate limits
    if (allVariantsToFetch.length > 0) {
      const stockResults = await sequentialFetchStocks(api, allVariantsToFetch);
      const stockMap = new Map(stockResults.map((r) => [`${r.productId}-${r.variantId}`, r.stock]));

      // Build variants data
      // IMPORTANT: Add ALL products, even if they don't have variants yet
      for (const product of allProducts) {
        try {
          const productId = product.id.toString();
          const variantMap = {};
          let hasVariants = false;

          if (product.variants && Array.isArray(product.variants) && product.variants.length > 0) {
            for (const variant of product.variants) {
              const realStock = stockMap.get(`${product.id}-${variant.id}`) || 0;

              variantMap[variant.id.toString()] = {
                id: variant.id,
                name: variant.name,
                stock: realStock
              };

              totalVariants++;
              hasVariants = true;
            }
          }

          // Add ALL products to cache, even if they don't have variants yet
          // This ensures new products are detected even before they have variants
          allVariants[productId] = {
            productId: product.id,
            productName: product.name,
            variants: variantMap
          };

          if (hasVariants) {
            productsWithVariants++;
          }
        } catch (e) {
          console.error(`[AUTO-SYNC] Error processing product ${product.id}:`, e.message);
        }
      }
    }

    // Save to file
    writeFileSync(variantsDataPath, JSON.stringify(allVariants, null, 2));

    const duration = Math.round((Date.now() - startTime) / 1000);
    const timestamp = new Date().toLocaleTimeString();
    const totalProductsInCache = Object.keys(allVariants).length;
    const productsWithoutVariants = totalProductsInCache - productsWithVariants;
    console.log(
      `[AUTO-SYNC] ${timestamp} - Completed! ${totalProductsInCache} total products (${productsWithVariants} with variants, ${productsWithoutVariants} without), ${totalVariants} variants (${duration}s)`
    );
  } catch (error) {
    const timestamp = new Date().toLocaleTimeString();
    console.error(`[AUTO-SYNC] ${timestamp} - Error:`, error.message);
  }
}

export function startAutoSync(api) {
  let hasCachedData = false;

  // Initialize with cached data if exists
  if (existsSync(variantsDataPath)) {
    try {
      const cached = JSON.parse(readFileSync(variantsDataPath, 'utf-8'));
      if (Object.keys(cached).length > 0) {
        hasCachedData = true;
        console.log('[AUTO-SYNC] ✅ Using cached variants data');
      }
    } catch (e) {
      console.log('[AUTO-SYNC] Cache error, will use empty');
    }
  }

  console.log('[AUTO-SYNC] Ready - use /sync-variants command to update');
  console.log('[AUTO-SYNC] ⚠️  Rate limit: 1 request/minute. Use manual /sync-variants for full sync.');
}
