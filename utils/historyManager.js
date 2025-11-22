import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const historyFilePath = join(process.cwd(), 'replaceHistory.json');

let historyData = [];

// Load initial history on module import
if (existsSync(historyFilePath)) {
  try {
    historyData = JSON.parse(readFileSync(historyFilePath, 'utf-8'));
  } catch (err) {
    console.error('[HISTORY] Error loading history:', err.message);
    historyData = [];
  }
}

export function saveHistory() {
  try {
    writeFileSync(historyFilePath, JSON.stringify(historyData, null, 2));
  } catch (err) {
    console.error('[HISTORY] Error saving history:', err.message);
    throw err;
  }
}

export function addToHistory(productId, productName, removedItems, variantId = null, variantName = null) {
  if (!productId || !productName || !removedItems) {
    console.error('[HISTORY] Invalid params: missing productId, productName, or removedItems');
    return;
  }

  historyData.push({
    timestamp: new Date().toISOString(),
    productId,
    productName,
    variantId,
    variantName,
    removedItems,
    action: 'removed'
  });

  saveHistory();
}

export function getHistory() {
  // Reload from file to ensure freshness
  if (existsSync(historyFilePath)) {
    try {
      historyData = JSON.parse(readFileSync(historyFilePath, 'utf-8'));
    } catch (err) {
      console.error('[HISTORY] Error loading history:', err.message);
    }
  }
  return historyData;
}

export function restoreFromHistory(count = 1) {
  const history = getHistory();
  if (history.length === 0) {
    return [];
  }
  
  const toRestore = history.splice(-Math.min(count, history.length));
  saveHistory();
  return toRestore;
}

export function clearHistory() {
  historyData = [];
  saveHistory();
}
