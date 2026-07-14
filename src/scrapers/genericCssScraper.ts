import axios from "axios";
import * as cheerio from "cheerio";
import type { ScraperStrategy, ScrapeResult } from "./ScraperStrategy";

export function parsePriceToCents(raw: string): number {
  const cleaned = raw
    .replace(/[^\d,.\-]/g, "")
    .trim();

  const normalized = cleaned.includes(",") && cleaned.lastIndexOf(",") > cleaned.lastIndexOf(".")
    ? cleaned.replace(/\./g, "").replace(",", ".")
    : cleaned.replace(/,/g, "");

  const value = Number.parseFloat(normalized);
  if (Number.isNaN(value)) {
    throw new Error(`Could not parse price from "${raw}"`);
  }
  return Math.round(value * 100);
}

export const genericCssScraper: ScraperStrategy = {
  supports() {
    return true;
  },
  async scrape(url: string, selector: string): Promise<ScrapeResult> {
    const response = await axios.get<string>(url, {
      timeout: 10_000,
      headers: { "User-Agent": "PriceSentryBot/0.1 (+https://github.com/pricesentry)" },
    });
    const $ = cheerio.load(response.data);
    const rawText = $(selector).first().text();
    if (!rawText) {
      throw new Error(`Selector "${selector}" matched no content`);
    }
    return { priceCents: parsePriceToCents(rawText) };
  },
};
