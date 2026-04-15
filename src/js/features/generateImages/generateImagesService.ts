import { evalTS } from "../../lib/utils/bolt";

export const replaceImageInMockup = (
  mockupPath: string,
  designImagePath: string,
  outputPath: string,
  viewName: string,
  colorHex?: string
): Promise<{ success: boolean; error?: string }> => {
  return evalTS("replaceImageInMockup", mockupPath, designImagePath, outputPath, viewName, colorHex || "");
};

export const debugLayerTree = (
  mockupFolder: string
): Promise<{ success: boolean; error?: string; layers?: string }> => {
  return evalTS("debugLayerTree", mockupFolder);
};