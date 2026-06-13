import { fs, path } from "../../lib/cep/node";
import { Order, Mapping, Dimension, OrderStats } from "../../../shared/shared";
import * as XLSX from "xlsx";

export async function auditOrders(
  ordersPath: string,
  dimensionsPath: string,
  designsFolder: string,
  mappings: Mapping[],
  cleanWords: string[]
): Promise<{ orders: Order[]; stats: OrderStats }> {
  const stats: OrderStats = { total: 0, skips: [] };
  const validOrders: Order[] = [];

  try {
    let dimensions: Dimension[] = [];
    
    if (dimensionsPath.toLowerCase().endsWith(".xlsx")) {
      const buf = fs.readFileSync(dimensionsPath);
      const workbook = XLSX.read(buf, { type: "buffer" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
      dimensions = processRawRows(rows);
    } else {
      const dimensionsRaw = fs.readFileSync(dimensionsPath, "utf-8");
      const rows = parseCSVRaw(dimensionsRaw);
      dimensions = processRawRows(rows);
    }

    const ordersRaw = fs.readFileSync(ordersPath, "utf-8");
    const orderRows = parseCSV(ordersRaw);
    stats.total = orderRows.length;

    for (const row of orderRows) {
      const findKey = (search: string) => {
        const key = Object.keys(row).find(k => k.toLowerCase() === search.toLowerCase());
        return key ? row[key] : undefined;
      };

      const orderRawValue = findKey("Order") || findKey("OrderID") || "Unknown";
      const brandRawValue = findKey("Brand") || "Unknown";
      const titleRawValue = findKey("Title") || "";
      const variantRawValue = findKey("Variant") || "";

      const mapping = mappings.find((m) => 
        brandRawValue.toLowerCase() === m.shop.toLowerCase() || 
        brandRawValue.toLowerCase() === m.folder.toLowerCase() ||
        orderRawValue.startsWith(m.prefix)
      );

      if (!mapping) {
        stats.skips.push({ 
          orderId: orderRawValue, 
          reason: "No shop mapping found for brand/prefix", 
          details: `${brandRawValue} | ${orderRawValue}` 
        });
        continue;
      }

      const titleParts = titleRawValue.split("-");
      const design = (titleParts[1] || "Default").trim();
      let rawModelText = (titleParts[0] || "").trim();

      cleanWords.forEach((word) => {
        const regex = new RegExp(word, "gi");
        rawModelText = rawModelText.replace(regex, "").trim();
      });

      const normalizedModel = normalizeModelText(rawModelText);
      const normalizedVariant = normalizeVariantText(variantRawValue);

      const dim = dimensions.find((d) =>
        normalizeModelText(d.model) === normalizedModel &&
        normalizeVariantText(d.variant) === normalizedVariant
      );

      if (!dim) {
        stats.skips.push({ 
          orderId: orderRawValue, 
          reason: "No dimension match found", 
          details: `${rawModelText} | ${variantRawValue}` 
        });
        continue;
      }

      const imagePath = findImage(designsFolder, mapping.folder, design);
      if (!imagePath) {
        stats.skips.push({ 
          orderId: orderRawValue, 
          reason: "No design file found", 
          details: `${mapping.folder}/${design}` 
        });
        continue;
      }

      validOrders.push({
        orderId: orderRawValue,
        sku: brandRawValue,
        model: dim.model,
        variant: dim.variant,
        design: design,
        imagePath: imagePath,
        width_mm: dim.width,
        length_mm: dim.length,
        mirror: variantRawValue.toLowerCase().includes("glass"),
        borderColor: mapping.color,
      });
    }

    return { orders: validOrders, stats };
  } catch (err: any) {
    throw new Error(`Audit Failed: ${err.message}`);
  }
}

function processRawRows(rows: any[][]): Dimension[] {
  if (rows.length < 2) return [];
  let headerIdx = -1;
  for (let i = 0; i < Math.min(15, rows.length); i++) {
    const line = rows[i].map(c => String(c || "").toLowerCase());
    if (line.some(c => c.includes("model")) && line.some(c => c.includes("variant"))) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) return [];
  const headers = rows[headerIdx].map(h => String(h || "").toLowerCase().trim());
  const data = rows.slice(headerIdx + 1);
  return data.map(row => {
    const getVal = (search: string) => {
      const idx = headers.findIndex(h => h.includes(search.toLowerCase()));
      return (idx !== -1 && row[idx] !== undefined) ? row[idx] : undefined;
    };
    return {
      model: (getVal("model") || "").toString().trim(),
      variant: (getVal("variant") || "").toString().trim(),
      width: parseFloat((getVal("width") || "0").toString()) || 0,
      length: parseFloat((getVal("length") || "0").toString()) || 0,
    };
  }).filter(d => d.model && d.width > 0);
}

function parseCSVRaw(content: string): any[][] {
  let cleaned = content;
  if (content.charCodeAt(0) === 0xFEFF) cleaned = content.substring(1);
  const lines = cleaned.split(/\r?\n/).filter(l => l.trim());
  if (lines.length === 0) return [];
  const test = lines[0];
  const delim = test.split(";").length > test.split(",").length ? ";" : ",";
  return lines.map(line => line.split(delim).map(v => v.trim().replace(/^"|"$/g, "")));
}

function parseCSV(content: string): any[] {
  const rows = parseCSVRaw(content);
  if (rows.length < 2) return [];
  const headers = rows[0];
  return rows.slice(1).map(row => {
    const obj: any = {};
    headers.forEach((h, i) => { if (h) obj[h] = row[i]; });
    return obj;
  });
}

function normalizeModelText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeVariantText(value: string): string {
  return value
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function findImage(
  baseDir: string,
  subDir: string,
  designName: string
): string | null {
  const shopFolder = path.join(baseDir, subDir);
  if (!fs.existsSync(shopFolder)) return null;

  const files = fs.readdirSync(shopFolder);
  
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const normalizedTarget = normalize(designName);

  const match = files.find((f) => {
    const ext = path.extname(f).toLowerCase();
    if (!(ext === ".png" || ext === ".jpg" || ext === ".jpeg")) return false;
    
    const base = path.basename(f, ext);
    return normalize(base) === normalizedTarget;
  });

  return match ? path.join(shopFolder, match) : null;
}
