import { writeFileSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';

const variantsDataPath = join(process.cwd(), 'variantsData.json');

async function getRealStockFromDeliverables(api, productId, variantId) {
  try {
    const deliverablesData = await api.get(
      `shops/${api.shopId}/products/${productId}/deliverables/${variantId}`
    );
    
    let items = [];
    
    if (typeof deliverablesData === 'string') {
      items = deliverablesData.split('\n').filter(item => item.trim());
    } else if (deliverablesData?.deliverables && typeof deliverablesData.deliverables === 'string') {
      items = deliverablesData.deliverables.split('\n').filter(item => item.trim());
    } else if (Array.isArray(deliverablesData)) {
      items = deliverablesData.filter(item => item && item.trim?.());
    }
    
    return items.length;
  } catch (e) {
    return 0;
  }
}

// Limit concurrent promises to avoid overwhelming the API
async function batchPromises(promises, batchSize = 5) {
  const results = [];
  for (let i = 0; i < promises.length; i += batchSize) {
    const batch = promises.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch);
    results.push(...batchResults);
  }
  return results;
}

async function autoSyncVariants(api) {
  try {
    const allVariants = {};
    let totalVariants = 0;
    let productsWithVariants = 0;

    // Get all products
    const products = await api.get(`shops/${api.shopId}/products`);
    const productList = Array.isArray(products) ? products : (products?.data || []);

    // Collect all variants across all products
    const allVariantsToFetch = [];
    for (const product of productList) {
      if (product.variants && Array.isArray(product.variants) && product.variants.length > 0) {
        for (const variant of product.variants) {
          allVariantsToFetch.push({ product, variant });
        }
      }
    }

    // Fetch stock in batches (max 5 concurrent requests)
    const stockPromises = allVariantsToFetch.map(({ product, variant }) =>
      getRealStockFromDeliverables(api, product.id, variant.id)
        .then(stock => ({ productId: product.id, variantId: variant.id, stock }))
        .catch(() => ({ productId: product.id, variantId: variant.id, stock: 0 }))
    );

    const stockResults = await batchPromises(stockPromises, 5);
    const stockMap = new Map(stockResults.map(r => [`${r.productId}-${r.variantId}`, r.stock]));

    // Build variants data with fetched stock
    for (const product of productList) {
      try {
        if (product.variants && Array.isArray(product.variants) && product.variants.length > 0) {
          const variantMap = {};

          for (const variant of product.variants) {
            const realStock = stockMap.get(`${product.id}-${variant.id}`) || 0;
            
            variantMap[variant.id.toString()] = {
              id: variant.id,
              name: variant.name,
              stock: realStock
            };
            
            if (realStock > 0) totalVariants++;
          }

          allVariants[product.id.toString()] = {
            productId: product.id,
            productName: product.name,
            variants: variantMap
          };

          productsWithVariants++;
        }
      } catch (e) {
        // Silently continue on product errors
      }
    }

    // Save to file
    writeFileSync(variantsDataPath, JSON.stringify(allVariants, null, 2));
    
    const timestamp = new Date().toLocaleTimeString();
    console.log(`[AUTO-SYNC] ${timestamp} - Updated ${productsWithVariants} products with ${totalVariants} variants`);

  } catch (error) {
    const timestamp = new Date().toLocaleTimeString();
    console.error(`[AUTO-SYNC] ${timestamp} - Error:`, error.message);
  }
}

export function startAutoSync(api) {
  // Initialize with cached data if exists
  if (existsSync(variantsDataPath)) {
    try {
      const cached = JSON.parse(readFileSync(variantsDataPath, 'utf-8'));
      console.log('[AUTO-SYNC] Using cached variants data immediately');
    } catch (e) {
      console.log('[AUTO-SYNC] Cache error, will regenerate');
    }
  }

  console.log('[AUTO-SYNC] Starting initial sync...');
  
  // Run first sync in background (don't block)
  setImmediate(() => {
    autoSyncVariants(api).catch(err => console.error('[AUTO-SYNC] Initial sync error:', err.message));
  });

  console.log('[AUTO-SYNC] Initial sync queued. Use /sync-variants command to update.');
}
