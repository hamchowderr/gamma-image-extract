import { createCanvas } from "@napi-rs/canvas";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const pdfjsLib = require("pdfjs-dist/legacy/build/pdf.js");
import sharp from "sharp";

// Set worker path for serverless - required by pdfjs-dist
import { fileURLToPath } from "url";
import { dirname, join } from "path";
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
pdfjsLib.GlobalWorkerOptions.workerSrc = join(__dirname, "../node_modules/pdfjs-dist/legacy/build/pdf.worker.js");

const MAX_PDF_SIZE = 10 * 1024 * 1024; // 10MB
const DOWNLOAD_TIMEOUT = 8000; // 8 seconds

// Custom canvas factory for @napi-rs/canvas
class NodeCanvasFactory {
  create(width, height) {
    const canvas = createCanvas(width, height);
    const context = canvas.getContext("2d");
    return { canvas, context };
  }

  reset(canvasAndContext, width, height) {
    canvasAndContext.canvas.width = width;
    canvasAndContext.canvas.height = height;
  }

  destroy(canvasAndContext) {
    canvasAndContext.canvas.width = 0;
    canvasAndContext.canvas.height = 0;
    canvasAndContext.canvas = null;
    canvasAndContext.context = null;
  }
}

/**
 * @param {import('@vercel/node').VercelRequest} req
 * @param {import('@vercel/node').VercelResponse} res
 */
export default async function handler(req, res) {
  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      error: { code: "METHOD_NOT_ALLOWED", message: "Only POST allowed" },
    });
  }

  try {
    const { url, format = "png", quality = 85, scale = 2, maxPages } = req.body || {};

    if (!url) {
      return res.status(400).json({
        success: false,
        error: { code: "INVALID_URL", message: "URL is required" },
      });
    }

    // Resolve Gamma URLs
    let pdfUrl = url;
    if (url.includes("gamma.app")) {
      const match = url.match(/gamma\.app\/(?:docs|embed)\/([a-zA-Z0-9]+)/);
      if (match) {
        pdfUrl = `https://gamma.app/docs/${match[1]}/export/pdf`;
      }
    }

    // Download PDF (with redirect following)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT);

    let pdfResponse;
    try {
      pdfResponse = await fetch(pdfUrl, {
        signal: controller.signal,
        redirect: "follow",
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "application/pdf,*/*",
        },
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!pdfResponse.ok) {
      return res.status(502).json({
        success: false,
        error: {
          code: "PDF_DOWNLOAD_FAILED",
          message: `Failed to download PDF: ${pdfResponse.status}`,
        },
      });
    }

    const arrayBuffer = await pdfResponse.arrayBuffer();
    if (arrayBuffer.byteLength > MAX_PDF_SIZE) {
      return res.status(413).json({
        success: false,
        error: {
          code: "PDF_TOO_LARGE",
          message: `PDF exceeds ${MAX_PDF_SIZE / 1024 / 1024}MB limit`,
        },
      });
    }

    const pdfData = new Uint8Array(arrayBuffer);
    const canvasFactory = new NodeCanvasFactory();

    // Load PDF with custom canvas factory (worker disabled for serverless)
    const loadingTask = pdfjsLib.getDocument({
      data: pdfData,
      canvasFactory,
      isEvalSupported: false,
      useSystemFonts: true,
      disableWorker: true,
    });

    const pdf = await loadingTask.promise;
    const numPages = pdf.numPages;
    const pagesToRender = maxPages ? Math.min(numPages, maxPages) : numPages;
    const pages = [];

    for (let pageNum = 1; pageNum <= pagesToRender; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale });

      const { canvas, context } = canvasFactory.create(
        Math.floor(viewport.width),
        Math.floor(viewport.height)
      );

      // Render page to canvas
      await page.render({
        canvasContext: context,
        viewport,
        canvasFactory,
      }).promise;

      // Convert to buffer
      let buffer = canvas.toBuffer("image/png");

      // Convert format if needed
      if (format === "jpg" || format === "jpeg") {
        buffer = await sharp(buffer).jpeg({ quality }).toBuffer();
      }

      // Get dimensions
      const metadata = await sharp(buffer).metadata();

      // Convert to base64 data URL
      const mimeType = format === "jpg" || format === "jpeg" ? "image/jpeg" : "image/png";
      const base64 = buffer.toString("base64");
      const dataUrl = `data:${mimeType};base64,${base64}`;

      pages.push({
        page: pageNum,
        dataUrl,
        width: metadata.width || viewport.width,
        height: metadata.height || viewport.height,
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        totalPages: numPages,
        renderedPages: pagesToRender,
        pages,
        metadata: {
          sourceUrl: url,
          format,
          scale,
          processedAt: new Date().toISOString(),
        },
      },
    });
  } catch (error) {
    console.error("Convert error:", error);
    return res.status(500).json({
      success: false,
      error: {
        code: "RENDER_FAILED",
        message: error.message || "Failed to render PDF",
      },
    });
  }
}
