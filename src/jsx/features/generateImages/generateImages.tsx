export const debugLayerTree = (
  mockupFolder: string
): { success: boolean; error?: string; layers?: string } => {
  try {
    var psdFile: any = null;
    
    if (mockupFolder.toLowerCase().indexOf(".psd") !== -1) {
      psdFile = new File(mockupFolder);
      if (!psdFile.exists) {
        return { success: false, error: "PSD file not found: " + mockupFolder };
      }
    } else {
      var folder = new Folder(mockupFolder);
      if (!folder.exists) {
        return { success: false, error: "Folder not found: " + mockupFolder };
      }

      var files = folder.getFiles();
      for (var i = 0; i < files.length; i++) {
        var fName = String(files[i].name);
        if (fName.toLowerCase().indexOf(".psd") !== -1) {
          psdFile = files[i];
          break;
        }
      }

      if (!psdFile) {
        return { success: false, error: "No PSD file found in: " + mockupFolder };
      }
    }

    var doc = app.open(psdFile);
    
    var layerTree = "LAYERS:\n";
    
    function dumpLayers(layer: any, indent: string) {
      try {
        layerTree += indent + "[" + layer.name + "] kind=" + layer.kind + "\n";
      } catch(e) {
        layerTree += indent + "[error reading layer]\n";
        return;
      }
      try {
        if (layer.artLayers) {
          for (var j = 0; j < layer.artLayers.length; j++) {
            var al = layer.artLayers[j];
            try {
              layerTree += indent + "  artLayer: " + al.name + " kind=" + al.kind + "\n";
            } catch(e) {}
          }
        }
      } catch(e) {}
      try {
        if (layer.layerSets) {
          layerTree += indent + "  layerSets: ";
          for (var j = 0; j < layer.layerSets.length; j++) {
            if (j > 0) layerTree += ", ";
            layerTree += layer.layerSets[j].name;
          }
          layerTree += "\n";
          for (var j = 0; j < layer.layerSets.length; j++) {
            dumpLayers(layer.layerSets[j], indent + "    ");
          }
        }
      } catch(e) {}
    }
    
    for (var i = 0; i < doc.layers.length; i++) {
      dumpLayers(doc.layers[i], "");
    }
    
    doc.close(SaveOptions.DONOTSAVECHANGES);
    
    return { success: true, layers: layerTree };
  } catch (e: any) {
    return { success: false, error: e.toString() };
  }
};

export const replaceImageInMockup = (
  mockupPath: string,
  designImagePath: string,
  outputPath: string,
  viewName: string,
  colorHex: string
): { success: boolean; error?: string } => {
  try {
    var psdFile: any = null;
    
    if (mockupPath.toLowerCase().indexOf(".psd") !== -1) {
      psdFile = new File(mockupPath);
      if (!psdFile.exists) {
        return { success: false, error: "PSD file not found: " + mockupPath };
      }
    } else {
      var folder = new Folder(mockupPath);
      if (!folder.exists) {
        return { success: false, error: "Mockup folder not found: " + mockupPath };
      }

      var files = folder.getFiles();
      for (var i = 0; i < files.length; i++) {
        var fName = String(files[i].name);
        if (fName.toLowerCase().indexOf(".psd") !== -1) {
          psdFile = files[i];
          break;
        }
      }

      if (!psdFile) {
        return { success: false, error: "No PSD file found in: " + mockupPath };
      }
    }

    var designFile = new File(designImagePath);
    if (!designFile.exists) {
      return { success: false, error: "Design file not found: " + designImagePath };
    }

    var doc = app.open(psdFile);
    var dupDoc = doc.duplicate("Temp_Duplicate");

    var viewLayer = null;
    for (var i = 0; i < dupDoc.layers.length; i++) {
      if (dupDoc.layers[i].name === viewName) {
        viewLayer = dupDoc.layers[i];
        break;
      }
    }

    if (!viewLayer) {
      dupDoc.close(SaveOptions.DONOTSAVECHANGES);
      return { success: false, error: "Layer '" + viewName + "' not found" };
    }

    var targetLayer = null;
    
    // For Front, we don't replace - just export
    if (viewName === "Front") {
      // Front is already correct, just export
    } else {
      // For Back and Side, search for "Design" smart object inside layerSets
      function findDesignSmartObject(layer: any): any {
        try {
          if (layer.layerSets) {
            for (var j = 0; j < layer.layerSets.length; j++) {
              var ls = layer.layerSets[j];
              if (ls.name === "Design") {
                // Found Design layerSet, now find "Design" artLayer inside it
                if (ls.artLayers) {
                  for (var k = 0; k < ls.artLayers.length; k++) {
                    var al = ls.artLayers[k];
                    if (al.name === "Design" && al.kind === LayerKind.SMARTOBJECT) {
                      return al;
                    }
                  }
                }
              }
            }
          }
        } catch(e) {}
        
        return null;
      }
      
      targetLayer = findDesignSmartObject(viewLayer);
    }
    
    // If not found for Back/Side, error
    if (viewName !== "Front" && !targetLayer) {
      dupDoc.close(SaveOptions.DONOTSAVECHANGES);
      return { success: false, error: "Smart object 'Design' not found in view '" + viewName + "'" };
    }

    // Replace the smart object content using executeAction (skip for Front)
    if (targetLayer) {
      try {
        // @ts-ignore
        app.activeDocument = dupDoc;
        // @ts-ignore
        dupDoc.activeLayer = targetLayer;
        
        // @ts-ignore
        var idplacedLayerReplaceContents = stringIDToTypeID("placedLayerReplaceContents");
        // @ts-ignore
        var desc = new ActionDescriptor();
        // @ts-ignore
        desc.putPath(charIDToTypeID("null"), designFile);
        // @ts-ignore
        executeAction(idplacedLayerReplaceContents, desc, DialogModes.NO);
      } catch (e: any) {
        dupDoc.close(SaveOptions.DONOTSAVECHANGES);
        return { success: false, error: "Replace failed: " + e.toString() };
      }
    }
    
    // Change Case Color fill layer
    if (colorHex) {
      try {
        var caseColorLayerSet = null;
        for (var i = 0; i < dupDoc.layers.length; i++) {
          if (dupDoc.layers[i].name === "Case Color") {
            caseColorLayerSet = dupDoc.layers[i];
            break;
          }
        }
        
        if (caseColorLayerSet && caseColorLayerSet.artLayers) {
          for (var j = 0; j < caseColorLayerSet.artLayers.length; j++) {
            var artLayer = caseColorLayerSet.artLayers[j];
            // @ts-ignore
            if (artLayer.kind === LayerKind.SOLIDFILL) {
              // @ts-ignore
              var sColor = new SolidColor();
              sColor.rgb.red = parseInt(colorHex.substr(1, 2), 16);
              sColor.rgb.green = parseInt(colorHex.substr(3, 2), 16);
              sColor.rgb.blue = parseInt(colorHex.substr(5, 2), 16);
              artLayer.textItem.color = sColor;
            }
          }
        }
      } catch (e: any) {
        // Color change is optional, don't fail on error
      }
    }

    // Export as PNG using saveAs
    try {
      var pngFile = new File(outputPath);
      // @ts-ignore
      var pngSaveOptions = new PNGSaveOptions();
      // @ts-ignore
      pngSaveOptions.embedColorProfile = true;
      
      // @ts-ignore
      dupDoc.saveAs(pngFile, pngSaveOptions, true);
    } catch (e: any) {
      dupDoc.close(SaveOptions.DONOTSAVECHANGES);
      return { success: false, error: "Save failed: " + e.toString() };
    }

    dupDoc.close(SaveOptions.DONOTSAVECHANGES);

    return { success: true };
  } catch (e: any) {
    return { success: false, error: "Outer: " + e.toString() };
  }
};

export const copyFileDirect = (
  sourcePath: string,
  outputPath: string
): { success: boolean; error?: string } => {
  try {
    var sourceFile = new File(sourcePath);
    if (!sourceFile.exists) {
      return { success: false, error: "Source file not found: " + sourcePath };
    }
    
    sourceFile.copy(outputPath);
    
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.toString() };
  }
};

export const getSelectedLayerBounds = (): { success: boolean; error?: string; name?: string; width?: number; height?: number; left?: number; top?: number } => {
  try {
    // @ts-ignore
    var doc = app.activeDocument;
    if (!doc) {
      return { success: false, error: "No active document" };
    }
    
    // @ts-ignore
    var activeLayer = doc.activeLayer;
    if (!activeLayer) {
      return { success: false, error: "No active layer selected" };
    }
    
    var bounds = activeLayer.bounds;
    // Extract numeric values from UnitValue objects (e.g., "500 px" -> 500)
    // @ts-ignore
    var left = parseFloat(bounds[0].toString());
    // @ts-ignore
    var top = parseFloat(bounds[1].toString());
    // @ts-ignore
    var right = parseFloat(bounds[2].toString());
    // @ts-ignore
    var bottom = parseFloat(bounds[3].toString());
    
    var width = right - left;
    var height = bottom - top;
    
    return { 
      success: true, 
      name: activeLayer.name, 
      width: width, 
      height: height,
      left: left,
      top: top
    };
  } catch (e: any) {
    return { success: false, error: e.toString() };
  }
};