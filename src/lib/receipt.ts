import type { Receipt } from "./models";

let latest: Receipt | null = null;
const key = (slug: string) => `blendiq:confirmation:${slug}`;

export function saveReceipt(receipt: Receipt) {
  latest = receipt;
  try {
    sessionStorage.setItem(key(receipt.stylist.slug), JSON.stringify(receipt));
  } catch {
    /* The in-memory receipt still works when storage is disabled. */
  }
}
export function loadReceipt(slug: string): Receipt | null {
  if (latest?.stylist.slug === slug) return latest;
  try {
    const stored = sessionStorage.getItem(key(slug));
    if (!stored) return null;
    const receipt = JSON.parse(stored) as Receipt;
    if (receipt.stylist.slug !== slug || !receipt.id || !receipt.booking || !receipt.service)
      return null;
    latest = receipt;
    return receipt;
  } catch {
    return null;
  }
}
