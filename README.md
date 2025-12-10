# PDF to Image API

A serverless API that converts PDF pages to images, returning base64 data URLs. Deployed on Vercel.

## API Usage

**Endpoint:** `POST /api/convert`

### Request

```json
{
  "url": "https://example.com/document.pdf",
  "format": "png",
  "quality": 85,
  "scale": 1.5,
  "maxPages": 3
}
```

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `url` | string | required | URL to the PDF file |
| `format` | `"png"` \| `"jpg"` | `"png"` | Output image format |
| `quality` | number | 85 | JPEG quality (1-100), ignored for PNG |
| `scale` | number | 1.5 | Render scale (1.0 = 72 DPI) |
| `maxPages` | number | 3 | Maximum pages to render |

### Response

```json
{
  "success": true,
  "data": {
    "totalPages": 10,
    "renderedPages": 3,
    "pages": [
      {
        "page": 1,
        "dataUrl": "data:image/png;base64,...",
        "width": 1224,
        "height": 918
      }
    ],
    "metadata": {
      "sourceUrl": "https://example.com/document.pdf",
      "format": "png",
      "scale": 1.5,
      "processedAt": "2025-12-10T12:00:00.000Z"
    }
  }
}
```

### Error Response

```json
{
  "success": false,
  "error": {
    "code": "PDF_DOWNLOAD_FAILED",
    "message": "Failed to download PDF: 404"
  }
}
```

## Development

```bash
pnpm install
pnpm dev
```

## Tech Stack

- **Runtime:** Vercel Serverless Functions
- **PDF Rendering:** pdfjs-dist v2.16.105 (legacy build)
- **Canvas:** @napi-rs/canvas
- **Image Processing:** sharp

## Limits (Free Tier)

- Max PDF size: 10MB
- Download timeout: 8 seconds
- Vercel function timeout: 10 seconds
- Use `maxPages` parameter to limit pages for large PDFs

## License

MIT
