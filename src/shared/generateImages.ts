export interface MasterRow {
  sku: string;
  nlCategory1: string;
  nlCategory2: string;
  nlVariant: string;
  brand: string;
  views: string[];
}

export interface GenerateImagesOrder {
  orderId: string;
  brand: string;
  model: string;
  color: string;
  design: string;
  variant: string;
  designPath: string;
  mockupPaths: { view: string; path: string; url?: string }[];
  frontUrl?: string;
  backUrl?: string;
  sideUrl?: string;
  originalRow: Record<string, any>;
}

export interface ColorMapping {
  name: string;
  hex: string;
}

export interface GenerateImagesStats {
  total: number;
  valid: number;
  skips: {
    orderId: string;
    reason: string;
    details?: string;
  }[];
}

export interface GenerateImagesResult {
  orders: GenerateImagesOrder[];
  stats: GenerateImagesStats;
}
