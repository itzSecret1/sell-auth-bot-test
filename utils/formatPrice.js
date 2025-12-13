export function formatPrice(price, currency) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency,
    currencyDisplay: 'symbol'
  }).format(price);
}
