import { useEffect, useState } from "react";
import { path } from "../lib/cep/node";
import {
  csi,
  subscribeBackgroundColor,
} from "../lib/utils/bolt";
import { auditOrders, generateBatch, printAllDocuments } from "../features/printing";
import { replaceImageInMockup, auditGenerateImagesOrders, debugLayerTree, getSelectedLayerBounds, uploadToR2, clearR2Prefix, clearAllR2, exportOrdersWithUrls, getBatchFiles, copyFileDirect } from "../features/generateImages";
import { ColorMapping } from "../../shared/generateImages";
import { Order, Mapping, OrderStats } from "../../shared/shared";
import "./main.scss";

const DEFAULT_CLEAN_WORDS = "hoesje, case, shockproof, cover, soft, TPU, silicone, hybride, glazen hard, flip, flipcase";
const DEFAULT_MAPPINGS: Mapping[] = [
  { prefix: "TS-INV", shop: "MT", folder: "MT", color: "#0078d4" },
  { prefix: "INV", shop: "Casimoda", folder: "Casimoda", color: "#ff9900" },
  { prefix: "LT-INV", shop: "LT", folder: "LT", color: "#f1641e" },
  { prefix: "LT", shop: "LT", folder: "LT", color: "#f1641e" },
];
const DEFAULT_COLOR_MAPPINGS: ColorMapping[] = [
  { name: "zwart", hex: "#000000" },
  { name: "zwarte", hex: "#000000" },
  { name: "black", hex: "#000000" },
  { name: "bruin", hex: "#8B4513" },
  { name: "bruine", hex: "#8B4513" },
  { name: "brown", hex: "#8B4513" },
  { name: "beige", hex: "#F5F5DC" },
  { name: "rood", hex: "#FF0000" },
  { name: "rode", hex: "#FF0000" },
  { name: "red", hex: "#FF0000" },
  { name: "blauw", hex: "#0000FF" },
  { name: "blauwe", hex: "#0000FF" },
  { name: "blue", hex: "#0000FF" },
  { name: "groen", hex: "#008000" },
  { name: "groene", hex: "#008000" },
  { name: "green", hex: "#008000" },
  { name: "geel", hex: "#FFFF00" },
  { name: "gele", hex: "#FFFF00" },
  { name: "yellow", hex: "#FFFF00" },
];

export const App = () => {
  const [view, setView] = useState<"main" | "settings">("main");
  const [activeTab, setActiveTab] = useState<"printing" | "generateImages" | "batchGenerate">("printing");
  const [bgColor, setBgColor] = useState("#282c34");

  useEffect(() => {
    try {
      if (window.cep) {
        subscribeBackgroundColor(setBgColor);
      }
    } catch (err) {
      console.error("Initialization Error: ", err);
    }
  }, []);

  if (view === "settings") {
    return <SettingsView defaultViewSetter={setView} bgColor={bgColor} />;
  }

  return (
    <div className="app main-view" style={{ backgroundColor: bgColor }}>
      <header className="view-header">
        <h1>Photoshop Automation</h1>
      </header>

      <div className="tab-bar">
        <button
          className={`tab-btn ${activeTab === "printing" ? "active" : ""}`}
          onClick={() => setActiveTab("printing")}
        >
          Printing
        </button>
        <button
          className={`tab-btn ${activeTab === "generateImages" ? "active" : ""}`}
          onClick={() => setActiveTab("generateImages")}
        >
          Generate Images
        </button>
        <button
          className={`tab-btn ${activeTab === "batchGenerate" ? "active" : ""}`}
          onClick={() => setActiveTab("batchGenerate")}
        >
          Batch Generate
        </button>
      </div>

      {activeTab === "printing" && <PrintingView bgColor={bgColor} onOpenSettings={() => setView("settings")} />}
      {activeTab === "generateImages" && <GenerateImagesView bgColor={bgColor} />}
      {activeTab === "batchGenerate" && <BatchGenerateView bgColor={bgColor} />}
    </div>
  );
};

const PrintingView = ({ bgColor, onOpenSettings }: { bgColor: string; onOpenSettings: () => void }) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [logs, setLogs] = useState<{ text: string; type: "info" | "success" | "warning" | "error" }[]>([]);

  const [ordersPath, setOrdersPath] = useState("");
  const [dimensionsPath, setDimensionsPath] = useState("");
  const [designsPath, setDesignsPath] = useState("");
  const [autoPrint, setAutoPrint] = useState(false);
  const [closeAfter, setCloseAfter] = useState(true);

  const [mappings, setMappings] = useState<Mapping[]>([]);
  const [cleanWords, setCleanWords] = useState("");

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = () => {
    try {
      setOrdersPath(localStorage.getItem("ordersPath") || "");
      setDimensionsPath(localStorage.getItem("dimensionsPath") || "");
      setDesignsPath(localStorage.getItem("designsPath") || "");
      
      const savedMappings = localStorage.getItem("shopMappings");
      if (savedMappings) {
        setMappings(JSON.parse(savedMappings));
      } else {
        setMappings(DEFAULT_MAPPINGS);
      }
      
      setCleanWords(localStorage.getItem("cleanWords") || DEFAULT_CLEAN_WORDS);
      setAutoPrint(localStorage.getItem("autoPrint") === "true");
      setCloseAfter(localStorage.getItem("closeAfter") !== "false");
    } catch (err) {
      console.error("Load Settings Error: ", err);
      setMappings(DEFAULT_MAPPINGS);
    }
  };

  const saveSetting = (key: string, value: any) => {
    localStorage.setItem(key, typeof value === "string" ? value : JSON.stringify(value));
  };

  const addLog = (text: string, type: "info" | "success" | "warning" | "error" = "info") => {
    setLogs((prev) => [{ text, type }, ...prev].slice(0, 100));
  };

  const handlePickFile = (label: string, setter: (val: string) => void, key: string, isFolder = false) => {
    const msg = `Select ${label}`;
    const result = (window.cep.fs.showOpenDialogEx || window.cep.fs.showOpenDialog)(
      false,
      isFolder,
      msg,
      ""
    );
    //@ts-ignore
    if (result?.data?.length > 0) {
      //@ts-ignore
      const picked = decodeURIComponent(result.data[0].replace("file://", ""));
      setter(picked);
      saveSetting(key, picked);
    }
  };

  const handleGenerate = async () => {
    if (!ordersPath || !dimensionsPath || !designsPath) {
      alert("Please select all paths first.");
      return;
    }

    setIsProcessing(true);
    setLogs([]);
    addLog("Starting production batch analysis...", "info");

    try {
      const cleanWordsList = cleanWords.split(",").map((w) => w.trim()).filter((w) => w);
      const { orders, stats } = await auditOrders(
        ordersPath,
        dimensionsPath,
        designsPath,
        mappings,
        cleanWordsList
      );

      stats.skips.forEach((skip) => {
        const details = skip.details ? ` (${skip.details})` : "";
        addLog(`SKIP [${skip.orderId}]: ${skip.reason}${details}`, "warning");
      });

      addLog(`AUDIT COMPLETE: Found ${stats.total} total rows.`, "info");
      addLog(`VALID ORDERS: ${orders.length} ready to print.`, "success");

      if (orders.length === 0) {
        addLog("No valid orders found to process.", "error");
        setIsProcessing(false);
        return;
      }

      addLog(`Sending ${orders.length} orders to Photoshop...`, "info");
       
      await generateBatch(orders);

      if (autoPrint) {
        addLog("Auto-printing generated sheets...", "info");
        await printAllDocuments(closeAfter);
      }

      addLog("SUCCESS: Batch generated successfully!", "success");
    } catch (err: any) {
      addLog(`CRITICAL ERROR: ${err.message}`, "error");
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePrintOnly = async () => {
    try {
      addLog("Printing all open batch documents...", "info");
      await printAllDocuments(closeAfter);
      addLog("Print command sent.", "success");
    } catch (err: any) {
      addLog(`Print Error: ${err.message}`, "error");
    }
  };

  return (
    <>
      <div className="pickers-container">
        <PickerItem
          label="Orders CSV"
          value={ordersPath}
          onPick={() => handlePickFile("Orders CSV", setOrdersPath, "ordersPath")}
        />
        <PickerItem
          label="Dimensions"
          value={dimensionsPath}
          onPick={() => handlePickFile("Dimensions CSV", setDimensionsPath, "dimensionsPath")}
        />
        <PickerItem
          label="Designs Folder"
          value={designsPath}
          isFolder
          onPick={() => handlePickFile("Designs Folder", setDesignsPath, "designsPath", true)}
        />
      </div>

      <div className="log-container">
        {logs.map((log, i) => (
          <div key={i} className={`log-entry ${log.type}`}>
            {`> ${log.text}`}
          </div>
        ))}
      </div>

      <div className="footer-controls">
        <div className="footer-left">
          <div className="checkbox-group">
            <label>
              <input
                type="checkbox"
                checked={autoPrint}
                onChange={(e) => {
                  setAutoPrint(e.target.checked);
                  saveSetting("autoPrint", e.target.checked);
                }}
              />
              Auto-Print
            </label>
            <label>
              <input
                type="checkbox"
                checked={closeAfter}
                onChange={(e) => {
                  setCloseAfter(e.target.checked);
                  saveSetting("closeAfter", e.target.checked);
                }}
/>
              Close after Print
            </label>
          </div>
        </div>
        <div className="footer-right">
          <button className="settings-btn" onClick={onOpenSettings}>
            ⚙️
          </button>
          <button className="print-tabs-btn" onClick={handlePrintOnly}>
            Print Open Tabs
          </button>
        </div>
      </div>

      <button className="generate-btn" disabled={isProcessing} onClick={handleGenerate}>
        {isProcessing ? "Processing..." : "Generate Production Batch"}
      </button>
    </>
  );
};

const GenerateImagesView = ({ bgColor }: { bgColor: string }) => {
  const [csvPath, setCsvPath] = useState("");
  const [masterPath, setMasterPath] = useState("");
  const [mockupsPath, setMockupsPath] = useState("");
  const [designsPath, setDesignsPath] = useState("");
  const [outputPath, setOutputPath] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [logs, setLogs] = useState<{ text: string; type: "info" | "success" | "warning" | "error" }[]>([]);
  const [testOrder, setTestOrder] = useState<any>(null);

  useEffect(() => {
    setCsvPath(localStorage.getItem("genImagesCsvPath") || "");
    setMasterPath(localStorage.getItem("genImagesMasterPath") || "");
    setMockupsPath(localStorage.getItem("genImagesMockupsPath") || "");
    setDesignsPath(localStorage.getItem("genImagesDesignsPath") || "");
    setOutputPath(localStorage.getItem("genImagesOutputPath") || "");
  }, []);

  const clearOutputFolder = async (folderPath: string) => {
    const { fs } = await import("../lib/cep/node");
    if (!fs.existsSync(folderPath)) return;
    const files = fs.readdirSync(folderPath);
    files.forEach((file: string) => {
      const filePath = path.join(folderPath, file);
      try {
        fs.unlinkSync(filePath);
      } catch (e) {
        // Ignore errors
      }
    });
  };

  const addLog = (text: string, type: "info" | "success" | "warning" | "error" = "info") => {
    setLogs((prev) => [{ text, type }, ...prev].slice(0, 100));
  };

  const handleTest = async () => {
    if (!csvPath || !masterPath || !mockupsPath || !designsPath || !outputPath) {
      addLog("Please select all paths first.", "warning");
      return;
    }

    setIsProcessing(true);
    setLogs([]);
    addLog("Parsing first row of CSV...", "info");

    try {
      const { orders, stats } = await auditGenerateImagesOrders(csvPath, masterPath, mockupsPath, designsPath);
      
      if (orders.length === 0) {
        addLog("No valid orders found in CSV.", "error");
        setIsProcessing(false);
        return;
      }

      const testOrderData = orders[0];
      addLog(`Testing with order: ${testOrderData.orderId}`, "info");
      const baseName = `${testOrderData.orderId}_${testOrderData.design.replace(/[^a-zA-Z0-9]/g, "_")}`;
      const outputDir = path.join(outputPath);

      // Clear output folder and R2 before generating
      addLog("Clearing output folder and R2...", "info");
      await clearOutputFolder(outputDir);
      const clearAllResult = await clearAllR2();
      if (clearAllResult.success) {
        addLog(`Cleared ${clearAllResult.deletedCount || 0} existing files from R2.`, "info");
      } else {
        addLog(`R2 clear failed: ${clearAllResult.error}`, "warning");
      }

      for (const mockup of testOrderData.mockupPaths) {
        const outputExt = mockup.isDirectCopy ? ".jpg" : ".png";
        const safeViewName = mockup.view.replace(/\s+/g, "_");
        const viewOutput = path.join(outputDir, `${baseName}_${safeViewName}${outputExt}`);
        let result;
        
        if (mockup.isDirectCopy) {
          result = await copyFileDirect(mockup.path, viewOutput);
        } else {
          result = await replaceImageInMockup(mockup.path, testOrderData.designPath, viewOutput, mockup.view);
        }
        
        if (!result.success) {
          addLog(`  ${mockup.view} failed: ${result.error}`, "error");
        } else {
          addLog(`  ${mockup.view} saved: ${viewOutput}`, "success");
          addLog(`  Uploading ${mockup.view} to R2...`, "info");
          const upload = await uploadToR2(viewOutput, `${testOrderData.orderId}/${baseName}_${safeViewName}${outputExt}`);
          if (upload.success && upload.url) {
            addLog(`  ${mockup.view} URL: ${upload.url}`, "success");
            mockup.url = upload.url;
          } else {
            addLog(`  ${mockup.view} upload failed: ${upload.error}`, "error");
          }
        }
      }

      addLog("Exporting orders with URLs...", "info");
      const exportResult = await exportOrdersWithUrls([testOrderData], csvPath, outputPath);
      if (exportResult.success) {
        addLog("Orders file exported successfully!", "success");
      } else {
        addLog(`Export failed: ${exportResult.error}`, "error");
      }

      addLog("Test complete!", "success");
    } catch (err: any) {
      addLog(`Error: ${err.message}`, "error");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDebug = async () => {
    if (!mockupsPath) {
      addLog("Select mockups folder first", "warning");
      return;
    }

    setIsProcessing(true);
    setLogs([]);
    addLog("Debugging layer tree...", "info");

    try {
      const debugPath = mockupsPath + "/Samsung Galaxy A23/Solid";
      addLog("Path: " + debugPath, "info");
      
      const result = await debugLayerTree(debugPath);
      if (result.success) {
        addLog("Layer tree:\n" + (result.layers || ""), "info");
      } else {
        addLog("Debug failed: " + result.error, "error");
      }
    } catch (err: any) {
      addLog(`Error: ${err.message}`, "error");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleGetLayerBounds = async () => {
    setIsProcessing(true);
    setLogs([]);
    addLog("Getting selected layer bounds...", "info");

    try {
      const result = await getSelectedLayerBounds();
      if (result.success) {
        addLog(`Layer: ${result.name}`, "info");
        addLog(`Bounds: ${result.width}x${result.height} at (${result.left}, ${result.top})`, "info");
      } else {
        addLog("Get bounds failed: " + result.error, "error");
      }
    } catch (err: any) {
      addLog(`Error: ${err.message}`, "error");
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePickFile = (
    label: string,
    setter: (val: string) => void,
    key: string,
    isFolder = false
  ) => {
    const msg = `Select ${label}`;
    const result = (window.cep.fs.showOpenDialogEx || window.cep.fs.showOpenDialog)(
      false,
      isFolder,
      msg,
      ""
    );
    // @ts-ignore
    if (result?.data?.length > 0) {
      // @ts-ignore
      const picked = decodeURIComponent(result.data[0].replace("file://", ""));
      setter(picked);
      localStorage.setItem(key, picked);
    }
  };

  const handleGenerate = async () => {
    if (!csvPath || !masterPath || !mockupsPath || !designsPath || !outputPath) {
      alert("Please select all paths first.");
      return;
    }

    setIsProcessing(true);
    setLogs([]);
    addLog("Starting image generation...", "info");

    try {
      const { fs } = await import("../lib/cep/node");
      const { orders, stats } = await auditGenerateImagesOrders(csvPath, masterPath, mockupsPath, designsPath);

      stats.skips.forEach((skip) => {
        const details = skip.details ? ` (${skip.details})` : "";
        addLog(`SKIP [${skip.orderId}]: ${skip.reason}${details}`, "warning");
      });

      addLog(`AUDIT COMPLETE: Found ${stats.total} total rows.`, "info");
      addLog(`VALID ORDERS: ${stats.valid} ready to process.`, "success");

      if (orders.length === 0) {
        addLog("No valid orders found to process.", "error");
        setIsProcessing(false);
        return;
      }

      setTestOrder(orders[0]);
      addLog(`First order (${orders[0].orderId}) saved for testing.`, "info");
      addLog("Clearing output folder and R2...", "info");
      await clearOutputFolder(outputPath);
      const clearAllResult = await clearAllR2();
      if (clearAllResult.success) {
        addLog(`Cleared ${clearAllResult.deletedCount || 0} existing files from R2.`, "info");
      } else {
        addLog(`R2 clear failed: ${clearAllResult.error}`, "warning");
      }
      addLog(`Processing ${orders.length} orders...`, "info");

      for (let i = 0; i < orders.length; i++) {
        const order = orders[i];
        addLog(`Processing ${order.orderId}...`, "info");

        const baseName = `${order.orderId}_${order.design.replace(/[^a-zA-Z0-9]/g, "_")}`;
        const outputDir = path.join(outputPath);

        for (const mockup of order.mockupPaths) {
          const outputExt = mockup.isDirectCopy ? ".jpg" : ".png";
          const safeViewName = mockup.view.replace(/\s+/g, "_");
          const viewOutput = path.join(outputDir, `${baseName}_${safeViewName}${outputExt}`);
          let result;
          
          if (mockup.isDirectCopy) {
            result = await copyFileDirect(mockup.path, viewOutput);
          } else {
            result = await replaceImageInMockup(mockup.path, order.designPath, viewOutput, mockup.view);
          }
          
          if (!result.success) {
            addLog(`  ${mockup.view} failed: ${result.error}`, "error");
          } else {
            addLog(`  Uploading ${mockup.view} to R2...`, "info");
            const upload = await uploadToR2(viewOutput, `${order.orderId}/${baseName}_${safeViewName}${outputExt}`);
            if (upload.success && upload.url) {
              addLog(`  ${mockup.view} URL: ${upload.url}`, "success");
              mockup.url = upload.url;
            } else {
              addLog(`  ${mockup.view} upload failed: ${upload.error}`, "error");
            }
          }
        }
      }

      addLog("Exporting orders with URLs...", "info");
      const exportResult = await exportOrdersWithUrls(orders, csvPath, outputPath);
      if (exportResult.success) {
        addLog("Orders file exported successfully!", "success");
      } else {
        addLog(`Export failed: ${exportResult.error}`, "error");
      }

      addLog("Image generation complete!", "success");
    } catch (err: any) {
      addLog(`Error: ${err.message}`, "error");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <>
      <div className="pickers-container">
        <PickerItem
          label="Orders CSV"
          value={csvPath}
          onPick={() => handlePickFile("Orders CSV", setCsvPath, "genImagesCsvPath")}
        />
        <PickerItem
          label="Master File"
          value={masterPath}
          onPick={() => handlePickFile("Master File", setMasterPath, "genImagesMasterPath")}
        />
        <PickerItem
          label="Mockups Folder"
          value={mockupsPath}
          isFolder
          onPick={() => handlePickFile("Mockups Folder", setMockupsPath, "genImagesMockupsPath", true)}
        />
        <PickerItem
          label="Designs Folder"
          value={designsPath}
          isFolder
          onPick={() => handlePickFile("Designs Folder", setDesignsPath, "genImagesDesignsPath", true)}
        />
        <PickerItem
          label="Output Folder"
          value={outputPath}
          isFolder
          onPick={() => handlePickFile("Output Folder", setOutputPath, "genImagesOutputPath", true)}
        />
      </div>

      <div className="log-container">
        {logs.map((log, i) => (
          <div key={i} className={`log-entry ${log.type}`}>
            {`> ${log.text}`}
          </div>
        ))}
      </div>

      <div className="generate-images-controls">
        <button className="test-btn" disabled={isProcessing} onClick={handleTest}>
          Test One
        </button>
        <button className="debug-btn" disabled={isProcessing} onClick={handleDebug}>
          Debug Layers
        </button>
        <button className="gen-settings-btn" disabled={isProcessing} onClick={handleGetLayerBounds}>
          Get Layer Bounds
        </button>
        <button className="generate-btn" disabled={isProcessing} onClick={handleGenerate}>
          {isProcessing ? "Processing..." : "Generate Images"}
        </button>
      </div>
    </>
  );
};

const BatchGenerateView = ({ bgColor }: { bgColor: string }) => {
  const [batchFolder, setBatchFolder] = useState("");
  const [masterPath, setMasterPath] = useState("");
  const [mockupsPath, setMockupsPath] = useState("");
  const [designsPath, setDesignsPath] = useState("");
  const [outputPath, setOutputPath] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [logs, setLogs] = useState<{ text: string; type: "info" | "success" | "warning" | "error" }[]>([]);

  useEffect(() => {
    setBatchFolder(localStorage.getItem("batchFolder") || "");
    setMasterPath(localStorage.getItem("genImagesMasterPath") || "");
    setMockupsPath(localStorage.getItem("genImagesMockupsPath") || "");
    setDesignsPath(localStorage.getItem("genImagesDesignsPath") || "");
    setOutputPath(localStorage.getItem("genImagesOutputPath") || "");
  }, []);

  const clearOutputFolder = async (folderPath: string) => {
    const { fs } = await import("../lib/cep/node");
    if (!fs.existsSync(folderPath)) return;
    const files = fs.readdirSync(folderPath);
    files.forEach((file: string) => {
      const filePath = path.join(folderPath, file);
      try {
        fs.unlinkSync(filePath);
      } catch (e) {
        // Ignore errors
      }
    });
  };

  const addLog = (text: string, type: "info" | "success" | "warning" | "error" = "info") => {
    setLogs((prev) => [{ text, type }, ...prev].slice(0, 200));
  };

  const handlePickFile = (
    label: string,
    setter: (val: string) => void,
    key: string,
    isFolder = false
  ) => {
    const msg = `Select ${label}`;
    const result = (window.cep.fs.showOpenDialogEx || window.cep.fs.showOpenDialog)(
      false,
      isFolder,
      msg,
      ""
    );
    // @ts-ignore
    if (result?.data?.length > 0) {
      // @ts-ignore
      const picked = decodeURIComponent(result.data[0].replace("file://", ""));
      setter(picked);
      localStorage.setItem(key, picked);
    }
  };

  const processSingleOrder = async (order: any, outputDir: string, csvFileName: string): Promise<boolean> => {
    const safeCsvName = csvFileName.replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_]/g, "");
    const baseName = `${order.orderId}_${safeCsvName}`;

    for (const mockup of order.mockupPaths) {
      const outputExt = mockup.isDirectCopy ? ".jpg" : ".png";
      const safeViewName = mockup.view.replace(/\s+/g, "_");
      const viewOutput = path.join(outputDir, `${baseName}_${safeViewName}${outputExt}`);
      let result;
      
      if (mockup.isDirectCopy) {
        result = await copyFileDirect(mockup.path, viewOutput);
      } else {
        result = await replaceImageInMockup(mockup.path, order.designPath, viewOutput, mockup.view);
      }
      
      if (!result.success) {
        addLog(`    ${mockup.view} failed: ${result.error}`, "error");
        return false;
      }
      addLog(`    Uploading ${mockup.view} to R2...`, "info");
      const upload = await uploadToR2(viewOutput, `${order.orderId}/${baseName}_${safeViewName}${outputExt}`);
      if (upload.success && upload.url) {
        addLog(`    ${mockup.view} URL: ${upload.url}`, "success");
        mockup.url = upload.url;
      } else {
        addLog(`    ${mockup.view} upload failed: ${upload.error}`, "error");
        return false;
      }
    }
    return true;
  };

  const exportSingleFile = async (orders: any[], csvPath: string, outputDir: string): Promise<boolean> => {
    try {
      const { fs, path: pathModule } = await import("../lib/cep/node");
      const XLSX = await import("xlsx");
      const inputFileName = pathModule.basename(csvPath);
      const baseName = inputFileName.replace(/\.(csv|xlsx)$/i, "");
      const outputFile = pathModule.join(outputDir, `${baseName}_with_urls.csv`);

      const buf = fs.readFileSync(csvPath);
      const workbook = XLSX.read(buf, { type: "buffer" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];

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

      const orderMap = new Map<string, any>();
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
      fs.writeFileSync(outputFile, csvContent, "utf8");
      
      return true;
    } catch (e: any) {
      addLog(`    Export failed: ${e.message}`, "error");
      return false;
    }
  };

  const handleTestBatch = async () => {
    if (!batchFolder || !masterPath || !mockupsPath || !designsPath || !outputPath) {
      addLog("Please select all paths first.", "warning");
      return;
    }

    setIsProcessing(true);
    setLogs([]);
    addLog("Scanning batch folder...", "info");

    try {
      const batchFiles = await getBatchFiles(batchFolder);
      
      if (batchFiles.length === 0) {
        addLog("No CSV/XLSX files found in batch folder.", "error");
        setIsProcessing(false);
        return;
      }

      addLog(`Found ${batchFiles.length} files to test.`, "info");
      
      // Clear output folder and R2 ONCE at start
      addLog("Clearing output folder and R2...", "info");
      await clearOutputFolder(outputPath);
      const clearAllResult = await clearAllR2();
      if (clearAllResult.success) {
        addLog(`Cleared ${clearAllResult.deletedCount || 0} existing files from R2.`, "info");
      } else {
        addLog(`R2 clear failed: ${clearAllResult.error}`, "warning");
      }

      const summary = { filesProcessed: 0, ordersProcessed: 0, success: 0, failed: 0 };

      for (const filePath of batchFiles) {
        const fileName = path.basename(filePath);
        const csvNameOnly = fileName.replace(/\.(csv|xlsx)$/i, "");
        addLog(`=== Testing ${fileName} ===`, "info");

        try {
          const { orders, stats } = await auditGenerateImagesOrders(filePath, masterPath, mockupsPath, designsPath);
          
          if (orders.length === 0) {
            addLog(`  No valid orders found.`, "warning");
            continue;
          }

          const testOrder = orders[0];
          addLog(`  Testing first order: ${testOrder.orderId}`, "info");
          
          const outputDir = path.join(outputPath);
          const success = await processSingleOrder(testOrder, outputDir, csvNameOnly);
          
          if (success) {
            summary.success++;
            // Export single order result
            await exportSingleFile([testOrder], filePath, outputDir);
            addLog(`  Exported test result for ${fileName}`, "success");
          } else {
            summary.failed++;
          }
          
          summary.filesProcessed++;
          summary.ordersProcessed++;
        } catch (e: any) {
          addLog(`  Error: ${e.message}`, "error");
          summary.failed++;
        }
      }

      addLog("=== BATCH TEST SUMMARY ===", "success");
      addLog(`Files processed: ${summary.filesProcessed}`, "success");
      addLog(`Orders processed: ${summary.ordersProcessed}`, "success");
      addLog(`Success: ${summary.success}`, "success");
      addLog(`Failed: ${summary.failed}`, summary.failed > 0 ? "warning" : "success");
    } catch (err: any) {
      addLog(`Error: ${err.message}`, "error");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleGenerateAll = async () => {
    if (!batchFolder || !masterPath || !mockupsPath || !designsPath || !outputPath) {
      addLog("Please select all paths first.", "warning");
      return;
    }

    setIsProcessing(true);
    setLogs([]);
    addLog("Scanning batch folder...", "info");

    try {
      const batchFiles = await getBatchFiles(batchFolder);
      
      if (batchFiles.length === 0) {
        addLog("No CSV/XLSX files found in batch folder.", "error");
        setIsProcessing(false);
        return;
      }

      addLog(`Found ${batchFiles.length} files to process.`, "info");
      
      // Clear output folder and R2 ONCE at start
      addLog("Clearing output folder and R2...", "info");
      await clearOutputFolder(outputPath);
      const clearAllResult = await clearAllR2();
      if (clearAllResult.success) {
        addLog(`Cleared ${clearAllResult.deletedCount || 0} existing files from R2.`, "info");
      } else {
        addLog(`R2 clear failed: ${clearAllResult.error}`, "warning");
      }

      const summary = { 
        filesProcessed: 0, 
        totalOrders: 0, 
        success: 0, 
        failed: 0,
        errors: [] as string[]
      };

      for (const filePath of batchFiles) {
        const fileName = path.basename(filePath);
        const csvNameOnly = fileName.replace(/\.(csv|xlsx)$/i, "");
        addLog(`=== Processing ${fileName} ===`, "info");

        try {
          const { orders, stats } = await auditGenerateImagesOrders(filePath, masterPath, mockupsPath, designsPath);
          
          stats.skips.forEach((skip) => {
            const details = skip.details ? ` (${skip.details})` : "";
            addLog(`  SKIP [${skip.orderId}]: ${skip.reason}${details}`, "warning");
          });

          if (orders.length === 0) {
            addLog(`  No valid orders found.`, "warning");
            continue;
          }

          const outputDir = path.join(outputPath);
          
          for (let i = 0; i < orders.length; i++) {
            const order = orders[i];
            addLog(`  [${i + 1}/${orders.length}] Processing ${order.orderId}...`, "info");
            
            const success = await processSingleOrder(order, outputDir, csvNameOnly);
            
            if (success) {
              summary.success++;
            } else {
              summary.failed++;
              summary.errors.push(`${fileName}: ${order.orderId}`);
            }
          }

          // Export all orders for this file
          await exportSingleFile(orders, filePath, outputDir);
          addLog(`  Exported ${orders.length} orders for ${fileName}`, "success");
          
          summary.filesProcessed++;
          summary.totalOrders += orders.length;
        } catch (e: any) {
          addLog(`  Error: ${e.message}`, "error");
          summary.failed++;
          summary.errors.push(`${fileName}: ${e.message}`);
        }
      }

      addLog("=== BATCH GENERATE SUMMARY ===", "success");
      addLog(`Files processed: ${summary.filesProcessed}/${batchFiles.length}`, "success");
      addLog(`Total orders: ${summary.totalOrders}`, "success");
      addLog(`Success: ${summary.success}`, "success");
      addLog(`Failed: ${summary.failed}`, summary.failed > 0 ? "warning" : "success");
      if (summary.errors.length > 0) {
        addLog(`Errors:`, "warning");
        summary.errors.forEach(err => addLog(`  - ${err}`, "warning"));
      }
    } catch (err: any) {
      addLog(`Error: ${err.message}`, "error");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <>
      <div className="pickers-container">
        <PickerItem
          label="Batch Folder"
          value={batchFolder}
          isFolder
          onPick={() => handlePickFile("Batch Folder", setBatchFolder, "batchFolder", true)}
        />
        <PickerItem
          label="Master File"
          value={masterPath}
          onPick={() => handlePickFile("Master File", setMasterPath, "genImagesMasterPath")}
        />
        <PickerItem
          label="Mockups Folder"
          value={mockupsPath}
          isFolder
          onPick={() => handlePickFile("Mockups Folder", setMockupsPath, "genImagesMockupsPath", true)}
        />
        <PickerItem
          label="Designs Folder"
          value={designsPath}
          isFolder
          onPick={() => handlePickFile("Designs Folder", setDesignsPath, "genImagesDesignsPath", true)}
        />
        <PickerItem
          label="Output Folder"
          value={outputPath}
          isFolder
          onPick={() => handlePickFile("Output Folder", setOutputPath, "genImagesOutputPath", true)}
        />
      </div>

      <div className="log-container">
        {logs.map((log, i) => (
          <div key={i} className={`log-entry ${log.type}`}>
            {`> ${log.text}`}
          </div>
        ))}
      </div>

      <div className="generate-images-controls">
        <button className="test-btn" disabled={isProcessing} onClick={handleTestBatch}>
          Test Batch
        </button>
        <button className="generate-btn" disabled={isProcessing} onClick={handleGenerateAll}>
          {isProcessing ? "Processing..." : "Generate All"}
        </button>
      </div>
    </>
  );
};

const SettingsView = ({ defaultViewSetter, bgColor }: { defaultViewSetter: (v: "main") => void; bgColor: string }) => {
  const [mappings, setMappings] = useState<Mapping[]>([]);
  const [cleanWords, setCleanWords] = useState("");
  const [colorMappings, setColorMappings] = useState<ColorMapping[]>([]);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = () => {
    try {
      const savedMappings = localStorage.getItem("shopMappings");
      if (savedMappings) {
        setMappings(JSON.parse(savedMappings));
      } else {
        setMappings(DEFAULT_MAPPINGS);
      }
      setCleanWords(localStorage.getItem("cleanWords") || DEFAULT_CLEAN_WORDS);
      
      const savedColorMappings = localStorage.getItem("colorMappings");
      if (savedColorMappings) {
        setColorMappings(JSON.parse(savedColorMappings));
      } else {
        setColorMappings(DEFAULT_COLOR_MAPPINGS);
      }
    } catch (err) {
      console.error("Load Settings Error: ", err);
      setMappings(DEFAULT_MAPPINGS);
      setColorMappings(DEFAULT_COLOR_MAPPINGS);
    }
  };

  const saveSetting = (key: string, value: any) => {
    localStorage.setItem(key, typeof value === "string" ? value : JSON.stringify(value));
  };

  return (
    <div className="app settings-view" style={{ backgroundColor: bgColor }}>
      <header className="view-header">
        <button className="back-btn" onClick={() => defaultViewSetter("main")}>
          ← Back
        </button>
        <h2>Settings</h2>
      </header>

      <section className="settings-section">
        <div className="section-header">
          <h3>Shop Mappings</h3>
          <span className="count-badge">{mappings.length}</span>
        </div>
        <div className="mappings-container">
          {mappings.map((m, idx) => (
            <div key={idx} className="mapping-card">
              <div className="card-top">
                <div className="info-group">
                  <span className="label">Prefix</span>
                  <span className="value bold">{m.prefix}</span>
                </div>
                <div className="info-group">
                  <span className="label">Shop</span>
                  <span className="value">{m.shop}</span>
                </div>
                <div className="info-group">
                  <span className="label">Color</span>
                  <input
                    type="color"
                    id={`color-picker-${idx}`}
                    style={{ opacity: 0, width: 0, height: 0, position: "absolute" }}
                    value={m.color.startsWith("#") && m.color.length === 7 ? m.color : "#0078d4"}
                    onChange={(e) => {
                      const newMappings = mappings.map((map, i) =>
                        i === idx ? { ...map, color: e.target.value } : map
                      );
                      setMappings(newMappings);
                      saveSetting("shopMappings", newMappings);
                    }}
                  />
                  <div 
                    className="color-preview-circle clickable" 
                    style={{ backgroundColor: m.color }}
                    onClick={() => document.getElementById(`color-picker-${idx}`)?.click()}
                  />
                </div>
                <button
                  className="delete-card-btn"
                  onClick={() => {
                    const newMappings = mappings.filter((_, i) => i !== idx);
                    setMappings(newMappings);
                    saveSetting("shopMappings", newMappings);
                  }}
                >
                  ×
                </button>
              </div>
              <div className="card-bottom">
                <div className="info-group">
                  <span className="label">Folder</span>
                  <span className="value italic">{m.folder}</span>
                </div>
                <div className="color-control-group">
                  <input
                    type="text"
                    className="hex-input"
                    value={m.color}
                    placeholder="#hex"
                    spellCheck={false}
                    onChange={(e) => {
                      const val = e.target.value;
                      const newMappings = mappings.map((map, i) =>
                        i === idx ? { ...map, color: val } : map
                      );
                      setMappings(newMappings);
                      saveSetting("shopMappings", newMappings);
                    }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
        <MappingForm
          onAdd={(m) => {
            const newMappings = [...mappings, m];
            setMappings(newMappings);
            saveSetting("shopMappings", newMappings);
          }}
        />
      </section>

      <section className="settings-section">
        <h3>Title Cleansing Words</h3>
        <textarea
          value={cleanWords}
          onChange={(e) => {
            setCleanWords(e.target.value);
            saveSetting("cleanWords", e.target.value);
          }}
          placeholder="e.g. hoesje, cover, tpu..."
        />
      </section>
    </div>
  );
};

const PickerItem = ({ label, value, onPick, isFolder = false }: any) => (
  <div className="picker-item">
    <div className="picker-label">{label}</div>
    <div className="picker-input-wrapper">
      <input readOnly value={value ? path.basename(value) : "Not selected..."} />
      <button onClick={onPick}>Pick</button>
    </div>
  </div>
);

const MappingForm = ({ onAdd }: { onAdd: (m: Mapping) => void }) => {
  const [form, setForm] = useState<Mapping>({ prefix: "", shop: "", folder: "", color: "#0078d4" });
  return (
    <div className="mapping-form">
      <input
        placeholder="Prefix"
        value={form.prefix}
        onChange={(e) => setForm({ ...form, prefix: e.target.value })}
      />
      <input
        placeholder="Shop"
        value={form.shop}
        onChange={(e) => setForm({ ...form, shop: e.target.value })}
      />
      <input
        placeholder="Folder"
        value={form.folder}
        onChange={(e) => setForm({ ...form, folder: e.target.value })}
      />
        <div className="form-group color-group-refined">
          <label>Color (Hex)</label>
          <div className="color-row">
            <input
              type="color"
              id="new-shop-color"
              style={{ opacity: 0, width: 0, height: 0, position: "absolute" }}
              value={form.color.startsWith("#") && form.color.length === 7 ? form.color : "#0078d4"}
              onChange={(e) => setForm({ ...form, color: e.target.value })}
            />
            <div 
              className="form-color-circle clickable" 
              style={{ backgroundColor: form.color }}
              onClick={() => document.getElementById("new-shop-color")?.click()}
            />
            <input
              type="text"
              className="hex-input-form"
              value={form.color}
              placeholder="#0078d4"
              spellCheck={false}
              onChange={(e) => setForm({ ...form, color: e.target.value })}
            />
            <button
              className="plus-btn"
              onClick={() => {
                if (form.prefix && form.shop && form.folder) {
                  onAdd(form);
                  setForm({ prefix: "", shop: "", folder: "", color: "#0078d4" });
                }
              }}
            >
              Add Shop
            </button>
          </div>
        </div>
    </div>
  );
};
