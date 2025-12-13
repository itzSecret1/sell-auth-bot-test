import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const variantsDataPath = join(process.cwd(), 'variantsData.json');

/**
 * Load variants data from cache file
 * @returns {Object} Variants data object
 */
export function loadVariantsData() {
  if (existsSync(variantsDataPath)) {
    try {
      return JSON.parse(readFileSync(variantsDataPath, 'utf-8'));
    } catch (e) {
      console.error('[DATA LOADER] Error parsing variantsData.json:', e.message);
      return {};
    }
  }
  return {};
}

/**
 * Safely get product data by ID
 * @param {string|number} productId Product ID
 * @returns {Object|null} Product data or null
 */
export function getProductData(productId) {
  const variantsData = loadVariantsData();
  return variantsData[productId?.toString()] || null;
}

/**
 * Safely get variant data by product and variant ID
 * @param {string|number} productId Product ID
 * @param {string|number} variantId Variant ID
 * @returns {Object|null} Variant data or null
 */
export function getVariantData(productId, variantId) {
  const productData = getProductData(productId);
  if (!productData) return null;
  return productData.variants?.[variantId?.toString()] || null;
}
