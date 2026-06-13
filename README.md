# Photoshop Phone Cases Automation

A Photoshop CEP (Common Extensibility Platform) extension that automates phone case production workflows for e-commerce businesses. It handles batch printing documents and generating product mockup images.

## Features

### 🎨 Printing
- **Batch Document Generation**: Creates A4-sized documents from order data
- **Smart Design Placement**: Automatically scales and positions designs with proper aspect ratio handling
- **Auto-Audit**: Validates orders against dimensions and design files
- **Auto-Print**: Optional automatic printing with configurable close behavior

### 📸 Generate Images
- **Mockup Generation**: Replaces designs in PSD mockup templates
- **Multi-View Support**: Generates Front, Back, and Side views
- **Cloudflare R2 Upload**: Automatically uploads images to cloud storage
- **CSV Export**: Exports order data with generated image URLs

### 📁 Batch Generate
- **Bulk Processing**: Process multiple CSV files at once
- **Same Workflow**: Full mockup generation for batch operations
- **Progress Reporting**: Real-time logs and summary statistics

## Tech Stack

- **Adobe Photoshop CEP** - Extension framework
- **React 19** - UI framework
- **TypeScript** - Type safety
- **Vite** - Build tooling
- **Cloudflare R2** - Image storage (S3-compatible)
- **XLSX** - Spreadsheet parsing

## Installation

### Prerequisites
- Adobe Photoshop (CC 2019 or later)
- Node.js 18+
- npm or yarn

### Setup

1. Clone the repository:
```bash
git clone <repository-url>
cd Photoshop-New
```

2. Install dependencies:
```bash
npm install
# or
yarn install
```

3. Configure environment variables (optional):
```bash
cp .env .env.local
# Edit .env.local with your R2 credentials
```

4. Build the extension:
```bash
npm run build
```

5. Install the extension:
```bash
npm run symlink
```

## Usage

### Printing Workflow

1. Select the **Printing** tab
2. Configure paths:
   - **Orders CSV**: Your order export file
   - **Dimensions CSV**: Product dimension data
   - **Designs Folder**: Source design images
3. (Optional) Enable **Auto-Print** to print immediately
4. (Optional) Enable **Close after Print** to close documents after printing
5. Click **Generate Production Batch**

### Generate Images Workflow

1. Select the **Generate Images** tab
2. Configure paths:
   - **Orders CSV**: Your order export file
   - **Master File**: Product master data (SKU, variants, views)
   - **Mockups Folder**: PSD mockup templates
   - **Designs Folder**: Source design images
   - **Output Folder**: Where to save generated images
3. Use **Test One** to process a single order first
4. Use **Debug Layers** to inspect PSD layer structure
5. Click **Generate Images** to process all orders

### Batch Generate Workflow

1. Select the **Batch Generate** tab
2. Configure paths (same as Generate Images, plus):
   - **Batch Folder**: Folder containing multiple CSV files
3. Use **Test Batch** to test one file from each
4. Click **Generate All** to process all files

## Configuration

### Environment Variables

Create a `.env` or `.env.production` file:

```env
# Cloudflare R2 Configuration
R2_ENDPOINT=https://your-account.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=your-access-key
R2_SECRET_ACCESS_KEY=your-secret-key
R2_BUCKET_NAME=images
R2_PUBLIC_URL_BASE=https://your-public-url.dev
```

### Shop Mappings

Configure shop prefixes and colors in the Settings panel:

| Prefix | Shop | Folder | Color |
|--------|------|--------|-------|
| TS-INV | MT | MT | #0078d4 |
| INV | Casimoda | Casimoda | #ff9900 |
| LT-INV | LT | LT | #f1641e |

### Color Mappings

Default color name mappings:

| Name | Hex | Name | Hex |
|------|-----|------|-----|
| zwart/black | #000000 | blauw/blue | #0000FF |
| bruin/brown | #8B4513 | groen/green | #008000 |
| beige | #F5F5DC | geel/yellow | #FFFF00 |
| rood/red | #FF0000 | | |

## Project Structure

```
Photoshop-New/
├── src/
│   ├── js/                    # React frontend
│   │   ├── main/              # Main app entry
│   │   │   └── main.tsx       # App component
│   │   ├── features/          # Feature modules
│   │   │   ├── printing/       # Printing feature
│   │   │   │   ├── printingAuditor.ts
│   │   │   │   └── printingService.ts
│   │   │   └── generateImages/ # Image generation
│   │   │       ├── generateImagesAuditor.ts
│   │   │       ├── generateImagesService.ts
│   │   │       └── cloudflareUploader.ts
│   │   ├── lib/               # Utilities
│   │   │   ├── cep/           # CEP utilities
│   │   │   └── utils/         # Helper functions
│   │   └── index.scss         # Global styles
│   ├── jsx/                   # ExtendScript (Photoshop scripting)
│   │   └── features/
│   │       ├── printing/
│   │       │   └── printing.tsx    # Document generation
│   │       └── generateImages/
│   │           └── generateImages.tsx  # Mockup generation
│   └── shared/                # Shared types
│       ├── shared.ts
│       └── generateImages.ts
├── dist/                      # Build output
├── cep.config.ts             # CEP configuration
├── vite.config.ts           # Vite configuration
└── package.json
```

## Development Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Build for production |
| `npm run zxp` | Build as ZXP package |
| `npm run zip` | Build as ZIP package |
| `npm run serve` | Preview production build |
| `npm run symlink` | Symlink to Adobe extensions |

## CSV Formats

### Orders CSV (Printing)
```
Order,Brand,Title,Variant
INV-001,MT,Samsung Galaxy S21 - Floral,Clear
INV-002,Casimoda,iPhone 14 Pro - Geometric,Black
```

### Orders CSV (Generate Images)
```
Internal_ID,SKU,NL_Variant,NL_Title_Long
1,SG-S21-001,Solid,Samsung Galaxy S21 - Floral Print - Zwart
2,IP-14P-001,Clear,iPhone 14 Pro Max - Geometric - Transparant
```

### Dimensions CSV
```
Model,Variant,Width,Length
Samsung Galaxy S21,Clear,155,75
iPhone 14 Pro,Black,150,75
```

### Master File CSV
```
SKU,NL_Category_1,NL_Category_2,NL_Variant,Variant_Cord,Brand,Image 1,Image 2
SG-S21-001,Samsung,Samsung Galaxy S21,Solid,Zwart,Samsung,Front,Back
```

## Data Flow

### Printing
```
Orders CSV → Auditor → Validated Orders → Photoshop Batch Generation → A4 Documents → Print
```

### Image Generation
```
Orders CSV + Master File → Auditor → Mockups + Designs → Photoshop Processing → PNG/JPG
                                                      ↓
                                              Cloudflare R2 Upload
                                                      ↓
                                              CSV with URLs Export
```

## Troubleshooting

### Extension Not Loading
1. Ensure Adobe Photoshop is closed
2. Run `npm run symlink`
3. Restart Photoshop
4. Check the Extensions panel

### Mockup Generation Fails
1. Use **Debug Layers** to inspect PSD structure
2. Ensure mockup paths match master file configuration
3. Check that "Design" layer exists as a smart object

### R2 Upload Fails
1. Verify R2 credentials in `.env`
2. Check bucket permissions
3. Ensure public URL base is configured

## License

MIT
