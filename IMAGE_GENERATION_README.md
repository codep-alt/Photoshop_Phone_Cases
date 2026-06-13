Image Generation Tool - User Manual

This tool automates the creation of product mockup images for phone cases by combining design artwork with PSD mockup templates. The system processes batches of orders, replaces artwork in Photoshop templates, and uploads the resulting images to Cloudflare R2 storage.


PREREQUISITES

Adobe Photoshop (CC 2020 or later)
Node.js (v16+)
Access to Cloudflare R2 storage (for image uploads)


FILE STRUCTURE

src/
  js/
    features/
      generateImages/
        generateImagesService.ts    Service layer (bridge to Photoshop)
        generateImagesAuditor.ts     Business logic and batch processing
        cloudflareUploader.ts       R2 storage integration
  jsx/
    features/
      generateImages/
        generateImages.tsx           Photoshop scripting functions
  shared/
    generateImages.ts                   TypeScript interfaces


INPUT FILES

1. Master File (CSV/XLSX)

Contains the product catalog with mockup mappings. Required columns:

Column | Description
SKU | Unique product identifier
NL_Variant | Variant code (e.g., "iPhone15_Black")
NL_Category_1 | Brand name
NL_Category_2 | Model name (e.g., "iPhone 15")
Brand | Brand name (matches folder structure)
Variant_Cord | Color name
Image 1 - Image 10 | View names for mockups

Example:

SKU | NL_Variant | NL_Category_1 | NL_Category_2 | Brand | Variant_Cord | Image 1 | Image 2 | Image 3
SKU001 | iPhone15_Black | Apple | iPhone 15 | Apple | Black | Front | Back | Side
SKU002 | iPhone15_Clear | Apple | iPhone 15 | Apple | Clear | Front | Back


2. Batch Order File (CSV/XLSX)

Contains orders to process. Required columns:

Column | Description
Internal_ID | Unique order identifier
SKU | Product SKU
NL_Variant | Variant code
NL_Title_Long | Full product title (used to extract design name)

Title Parsing:
The design name is extracted from the last part of the title after " - ":

Example: "Apple iPhone 15 Case - Marble Blue" becomes Design: "Marble Blue"


MOCKUP TEMPLATE REQUIREMENTS

PSD Structure

Mockup PSD files must follow a specific layer structure:

Document
  Front                    Layer group for front view
  Back                     Layer group for back view
  Side                     Layer group for side view
  Case Color               Layer group containing solid fill layer

Design Smart Object

Inside each view layer group, include a "Design" layer set:

View (e.g., Back)
  Design                   Layer set
    Design               Smart object art layer (must be named "Design")

The tool replaces the content of this smart object with the design image.

Case Color Layer

The "Case Color" layer group should contain a solid fill layer. Its color will be changed to match the Variant_Cord value from the master file.

Folder Structure:

mockups/
  Apple/
    iPhone 15/
      Black/
        Front.psd
        Back.psd
        Side.psd
      Clear/
        Front.psd
        Back.psd


WORKFLOW

Step 1: Prepare Design Images

Design images should be PNG or JPG files named exactly to match the design name extracted from product titles.

Folder Structure:

designs/
  Apple/
    Marble Blue.png
    Solid Black.png
    Floral Pattern.jpg

Step 2: Process Batch Orders

1. Load the extension in Photoshop
2. Select batch folder containing CSV/XLSX order files
3. Click "Process" to begin

The system will:
1. Load and validate each order against the master file
2. For each valid order:
   - Open the mockup PSD
   - Replace the Design smart object with the artwork
   - Change the case color fill layer
   - Export as PNG
3. Upload images to Cloudflare R2
4. Generate a results CSV with image URLs

Step 3: Review Results

The tool generates an orders_with_urls.csv file containing:
- All original columns
- New "Image URL" column with comma-separated URLs


CONFIGURATION

Environment Variables

Create .env or .env.production file:

R2_ENDPOINT=https://d7c94b29a462315ba2a012685c9c5b28.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=your_access_key
R2_SECRET_ACCESS_KEY=your_secret_key
R2_BUCKET_NAME=images
R2_PUBLIC_URL_BASE=https://pub-624c1856794d494b96d7182115490cb3.r2.dev


TROUBLESHOOTING

"PSD file not found"

Verify the mockup folder structure matches: mockups/{Brand}/{Variant}/{Model}/{View}.psd
Check case sensitivity - the tool searches case-insensitively for color folders

"Layer 'Design' not found"

Ensure the smart object is named exactly "Design" (case-sensitive)
Use the Debug Layer Tree feature to inspect the actual layer structure

"Smart object 'Design' not found in view"

For the Front view, no replacement is needed - the front template should already have the design
For Back/Side views, verify the nested layer structure matches the expected pattern

"Design image not found"

Check that the design file exists in designs/{Brand}/{DesignName}.png
The filename is matched case-insensitively, but extension must match exactly

Debug Layer Tree

Use the debug function to inspect any PSD layer structure:

1. Open Photoshop with the mockup PSD
2. Run the debug function
3. Review the layer hierarchy output to ensure structure matches requirements


API REFERENCE

Core Functions

Function | Description
auditGenerateImagesOrders() | Validates orders and builds processing queue
replaceImageInMockup() | Replaces design in PSD and exports PNG
copyFileDirect() | Copies JPG mockups directly (no Photoshop needed)
uploadToR2() | Uploads image to Cloudflare R2
clearR2Prefix() | Deletes all files with a prefix
debugLayerTree() | Dumps PSD layer hierarchy for debugging

Data Structures

GenerateImagesOrder {
  orderId: string
  brand: string
  model: string
  color: string
  design: string
  designPath: string
  mockupPaths: Array of { view, path, url, isDirectCopy }
}

GenerateImagesStats {
  total: number
  valid: number
  skips: Array of { orderId, reason, details }
}


SUPPORT

For issues or questions, review the source code in /src/js/features/generateImages/ or contact the development team.
