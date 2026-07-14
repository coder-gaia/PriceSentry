export type ScrapeResult = {
  priceCents: number;
};

export interface ScraperStrategy {
  supports(domain: string): boolean;
  scrape(url: string, selector: string): Promise<ScrapeResult>;
}
