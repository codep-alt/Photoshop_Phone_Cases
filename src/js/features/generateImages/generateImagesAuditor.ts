import { fs, path } from "../../lib/cep/node";
import { GenerateImagesOrder, GenerateImagesResult, MasterRow } from "../../../shared/generateImages";
import * as XLSX from "xlsx";

function readFileRows(filePath: string): any[][] {
  const isXlsx = filePath.toLowerCase().endsWith(".xlsx");
  if (isXlsx) {
    const buf = fs.readFileSync(filePath);
    const workbook = XLSX.read(buf, { type: "buffer" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    return XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
  }
  const content = fs.readFileSync(filePath, "utf-8");
  let cleaned = content;
  if (content.charCodeAt(0) === 0xFEFF) cleaned = content.substring(1);
  const lines = cleaned.split(/\r?\n/).filter(l => l.trim());
  if (lines.length === 0) return [];
  const test = lines[0];
  const delim = test.split(";").length > test.split(",").length ? ";" : ",";
  return lines.map(line => line.split(delim).map(v => v.trim().replace(/^"|"$/g, "")));
}

export function loadMasterFile(masterPath: string): Map<string, MasterRow> {
  const masterMap = new Map<string, MasterRow>();

  try {
    const rows = readFileRows(masterPath);

    if (rows.length < 2) {
      throw new Error("Master file has no data rows");
    }

    const headers = rows[0].map((h: string) => String(h || "").trim());
    const dataRows = rows.slice(1);

    for (const row of dataRows) {
      const getVal = (search: string): string => {
        const idx = headers.findIndex((h: string) => h.toLowerCase() === search.toLowerCase());
        return idx !== -1 && row[idx] !== undefined ? String(row[idx] || "").trim() : "";
      };

      const sku = getVal("SKU");
      const nlVariant = getVal("NL_Variant");

      if (!sku || !nlVariant) continue;

      const views: string[] = [];
      for (let i = 1; i <= 10; i++) {
        const viewVal = getVal(`Image ${i}`);
        if (viewVal) views.push(viewVal);
      }

      const key = `${sku}_${nlVariant}`;
      masterMap.set(key, {
        sku,
        nlCategory1: getVal("NL_Category_1"),
        nlCategory2: getVal("NL_Category_2"),
        nlVariant,
        brand: getVal("Brand"),
        views,
      });
    }
  } catch (err: any) {
    throw new Error(`Failed to load master file: ${err.message}`);
  }

  return masterMap;
}

export async function auditGenerateImagesOrders(
  xlsxPath: string,
  masterPath: string,
  mockupsBase: string,
  designsBase: string
): Promise<GenerateImagesResult> {
  const stats = { total: 0, valid: 0, skips: [] as { orderId: string; reason: string; details?: string }[] };
  const orders: GenerateImagesOrder[] = [];

  try {
    const masterMap = loadMasterFile(masterPath);

    const rows = readFileRows(xlsxPath);

    if (rows.length < 2) {
      throw new Error("XLSX has no data rows");
    }

    const headers = rows[0].map((h: string) => String(h || "").trim());
    const dataRows = rows.slice(1);

    stats.total = dataRows.length;

    for (const row of dataRows) {
      const getVal = (search: string): string => {
        const idx = headers.findIndex((h: string) => h.toLowerCase() === search.toLowerCase());
        return idx !== -1 && row[idx] !== undefined ? String(row[idx] || "").trim() : "";
      };

      const internalId = getVal("Internal_ID");
      if (!internalId || isNaN(Number(internalId))) {
        continue;
      }

      const sku = getVal("SKU");
      const nlVariant = getVal("NL_Variant") || "";
      const titleLong = getVal("NL_Title_Long") || "";

      if (!sku) {
        stats.skips.push({ orderId: internalId, reason: "Empty SKU" });
        continue;
      }

      const masterKey = `${sku}_${nlVariant}`;
      const masterRow = masterMap.get(masterKey);

      if (!masterRow) {
        stats.skips.push({ orderId: internalId, reason: "Not found in master file", details: masterKey });
        continue;
      }

      const brand = masterRow.brand;
      const nlCategory1 = masterRow.nlCategory1;
      const nlCategory2 = masterRow.nlCategory2;
      const views = masterRow.views;
      const masterVariant = masterRow.nlVariant;

      const design = parseTitle(titleLong);
      if (!design) {
        stats.skips.push({ orderId: internalId, reason: "Failed to parse title", details: titleLong });
        continue;
      }

      const variant = nlVariant.split("_")[0] || "Solid";
      const color = nlVariant.includes("_") ? nlVariant.split("_")[1] : "";

      let mockupDir: string;
      const hasColorSuffix = masterVariant.includes("_");

      if (hasColorSuffix) {
        const colorFromVariant = masterVariant.split("_")[1];
        mockupDir = findMockupDirWithCaseInsensitiveColor(mockupsBase, nlCategory1, variant, nlCategory2, colorFromVariant);
      } else {
        mockupDir = path.join(mockupsBase, nlCategory1, variant, nlCategory2);
      }

      const mockupPaths: { view: string; path: string }[] = [];
      for (const viewName of views) {
        const mockupPath = path.join(mockupDir, `${viewName}.psd`);
        if (!fs.existsSync(mockupPath)) {
          stats.skips.push({ orderId: internalId, reason: "Mockup not found", details: mockupPath });
          continue;
        }
        mockupPaths.push({ view: viewName, path: mockupPath });
      }

      if (mockupPaths.length === 0) {
        continue;
      }

      const designPath = findDesignImage(designsBase, brand, design);
      if (!designPath) {
        stats.skips.push({ orderId: internalId, reason: "Design image not found", details: `${brand}/${design}` });
        continue;
      }

      const originalRow: Record<string, any> = {};
      headers.forEach((h: string, i: number) => {
        originalRow[h] = row[i];
      });

      orders.push({
        orderId: internalId,
        brand,
        model: nlCategory2,
        color,
        design,
        variant,
        designPath,
        mockupPaths,
        originalRow,
      });

      stats.valid++;
    }

    return { orders, stats };
  } catch (err: any) {
    throw new Error(`Audit failed: ${err.message}`);
  }
}

function parseTitle(titleLong: string): string | null {
  const parts = titleLong.split(" - ");
  if (parts.length < 2) return null;
  return parts[parts.length - 1].trim();
}

function findDesignImage(baseDir: string, brand: string, designName: string): string | null {
  const brandFolder = path.join(baseDir, brand);
  if (!fs.existsSync(brandFolder)) return null;

  const files = fs.readdirSync(brandFolder);
  const normalizedTarget = normalize(designName);

  const match = files.find((f: string) => {
    const ext = path.extname(f).toLowerCase();
    if (![".png", ".jpg", ".jpeg"].includes(ext)) return false;
    const base = path.basename(f, ext);
    return normalize(base) === normalizedTarget;
  });

  return match ? path.join(brandFolder, match) : null;
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[\s\-_]/g, "");
}

function findMockupDirWithCaseInsensitiveColor(
  mockupsBase: string,
  brand: string,
  variant: string,
  model: string,
  colorSearch: string
): string {
  const style = variant.split("_")[0];
  const baseDir = path.join(mockupsBase, brand, style, model);
  if (!fs.existsSync(baseDir)) {
    return baseDir;
  }

  const normalizedSearch = normalize(colorSearch);
  const entries = fs.readdirSync(baseDir);

  for (const entry of entries) {
    if (normalize(entry) === normalizedSearch) {
      return path.join(baseDir, entry);
    }
  }

  return path.join(baseDir, colorSearch);
}

export async function exportOrdersWithUrls(
  orders: GenerateImagesOrder[],
  csvPath: string,
  outputPath: string
): Promise<{ success: boolean; error?: string }> {
  try {
    if (orders.length === 0) {
      return { success: false, error: "No orders to export" };
    }

    const { fs } = await import("../../lib/cep/node");

    const buf = fs.readFileSync(csvPath);
    const workbook = XLSX.read(buf, { type: "buffer" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];

    if (rows.length < 2) {
      return { success: false, error: "CSV has no data rows" };
    }

    const headers = rows[0].map((h: string) => String(h || "").trim());
    const dataRows = rows.slice(1);

    let urlColumnIndex = headers.findIndex(h => h.toLowerCase().includes("image"));
    if (urlColumnIndex === -1) {
      urlColumnIndex = headers.length;
      headers.push("Image URL");
      for (let i = 0; i < dataRows.length; i++) {
        dataRows[i].push("");
      }
    }

    const orderMap = new Map<string, GenerateImagesOrder>();
    for (const order of orders) {
      orderMap.set(order.orderId, order);
    }

    for (let rowIdx = 0; rowIdx < dataRows.length; rowIdx++) {
      const row = dataRows[rowIdx];
      const internalIdIdx = headers.findIndex(h => h.toLowerCase() === "internal_id");
      if (internalIdIdx === -1) continue;

      const internalId = String(row[internalIdIdx] || "").trim();
      const order = orderMap.get(internalId);
      if (!order) continue;

      const urls: string[] = [];
      for (const mockup of order.mockupPaths) {
        if (mockup.url) urls.push(mockup.url);
      }
      row[urlColumnIndex] = urls.join(",");
    }

    const newSheet = XLSX.utils.aoa_to_sheet([headers, ...dataRows]);
    const newWorkbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(newWorkbook, newSheet, "Sheet1");
    const csvContent = XLSX.write(newWorkbook, { bookType: "csv", type: "string" });
    const outputFile = path.join(outputPath, "orders_with_urls.csv");
    fs.writeFileSync(outputFile, csvContent, "utf8");

    return { success: true, error: undefined };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}
