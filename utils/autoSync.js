import { writeFileSync, existsSync } from 'fs';
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

async function autoSyncVariants(api) {
  try {
    const allVariants = {};
    let totalVariants = 0;
    let productsWithVariants = 0;

    // Get all products
    const products = await api.get(`shops/${api.shopId}/products`);
    const productList = Array.isArray(products) ? products : (products?.data || []);

    // Process each product
    for (const product of productList) {
      try {
        if (product.variants && Array.isArray(product.variants) && product.variants.length > 0) {
          const variantMap = {};

          for (const variant of product.variants) {
            // Get REAL stock from deliverables endpoint instead of product.variants.stock
            const realStock = await getRealStockFromDeliverables(api, product.id, variant.id);
            
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
  // Run sync immediately on start
  console.log('[AUTO-SYNC] Starting auto-sync...');
  autoSyncVariants(api).catch(err => console.error('[AUTO-SYNC] Initial sync error:', err.message));

  // Run sync every 30 seconds (reduced from 1 second to prevent blocking)
  setInterval(async () => {
    try {
      await autoSyncVariants(api);
    } catch (err) {
      console.error('[AUTO-SYNC] Sync error:', err.message);
    }
  }, 30000);

  console.log('[AUTO-SYNC] Auto-sync started - updating every 30 seconds');
}
