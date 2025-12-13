/**
 * Centralized deliverables parsing logic
 * Handles multiple response formats from SellAuth API
 */

export function parseDeliverables(deliverablesData) {
  let items = [];

  // Handle null/undefined
  if (!deliverablesData) {
    return items;
  }

  // Handle string (newline-separated items)
  if (typeof deliverablesData === 'string') {
    items = deliverablesData.split('\n').filter((item) => item?.trim());
    return items;
  }

  // Handle object with deliverables property (string)
  if (deliverablesData?.deliverables && typeof deliverablesData.deliverables === 'string') {
    items = deliverablesData.deliverables.split('\n').filter((item) => item?.trim());
    return items;
  }

  // Handle object with content property (string)
  if (deliverablesData?.content && typeof deliverablesData.content === 'string') {
    items = deliverablesData.content.split('\n').filter((item) => item?.trim());
    return items;
  }

  // Handle object with data property (string)
  if (deliverablesData?.data && typeof deliverablesData.data === 'string') {
    items = deliverablesData.data.split('\n').filter((item) => item?.trim());
    return items;
  }

  // Handle array of items
  if (Array.isArray(deliverablesData)) {
    items = deliverablesData
      .map((item) => {
        if (typeof item === 'string') return item.trim();
        if (typeof item === 'object' && item?.value) return String(item.value).trim();
        return String(item).trim();
      })
      .filter((item) => item);
    return items;
  }

  // Handle object with items array
  if (deliverablesData?.items && Array.isArray(deliverablesData.items)) {
    items = deliverablesData.items
      .map((item) => {
        if (typeof item === 'string') return item.trim();
        if (typeof item === 'object' && item?.value) return String(item.value).trim();
        return String(item).trim();
      })
      .filter((item) => item);
    return items;
  }

  // Handle generic object (convert values to strings)
  if (typeof deliverablesData === 'object') {
    items = Object.values(deliverablesData)
      .map((val) => String(val).trim())
      .filter((item) => item);
    return items;
  }

  return items;
}
