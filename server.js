const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const ROOT = __dirname;

function loadDotEnv() {
  const file = path.join(ROOT, ".env");
  if (!fs.existsSync(file)) return;

  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^["']|["']$/g, "");
    if (key && !process.env[key]) {
      process.env[key] = value;
    }
  }
}

loadDotEnv();

const PORT = Number(process.env.PORT || 5178);
const API_URL = process.env.XIAOJI_IMAGE_API_URL || "https://xiaoji.baziapi.site/v1/images/generations";
const API_KEY = process.env.XIAOJI_API_KEY;
const MODEL = process.env.XIAOJI_IMAGE_MODEL || "gpt-image-1";

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
};

function sendJson(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  });
  res.end(JSON.stringify(body));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 18 * 1024 * 1024) {
        reject(new Error("请求体过大，请上传 10MB 以内的图片。"));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error("请求格式不是有效 JSON。"));
      }
    });
    req.on("error", reject);
  });
}

function buildPrompt(input) {
  const referenceLine = input.referenceImage
    ? "Use the uploaded artist photo only as a face, hairstyle, mood, and styling reference. Keep the design celebratory and respectful."
    : "No reference image was uploaded; create an original idol support design without copying any real person's likeness.";

  return [
    `Create a polished Chinese fan support design for ${input.artistName}.`,
    `Material type: ${input.materialTypeLabel}.`,
    `Fan slogan text, verbatim: "${input.slogan}".`,
    `Visual style: ${input.visualStyle}.`,
    `Primary color: ${input.mainColor}.`,
    referenceLine,
    "Include clean Chinese typography, stage light accents, stars, glow sticks, cheering ribbons, and space for fan club branding.",
    "The final image must look like a real fan support banner/material/flag, production-ready, high contrast, no watermark, no QR code, no messy text.",
  ].join("\n");
}

function buildBackgroundPrompt(input) {
  return [
    "Create a high quality fan support design background only.",
    `Material type: ${input.materialTypeLabel}.`,
    `Visual style: ${input.visualStyle}.`,
    `Primary color: ${input.mainColor}.`,
    "No people, no faces, no bodies, no portraits, no real person, no celebrity likeness.",
    "No text, no letters, no Chinese characters, no numbers, no logo, no watermark, no QR code.",
    "Use stage lights, glow sticks, cheering ribbons, star particles, soft gradients, concert atmosphere, and clean blank space for later typography.",
    "The image should be production-ready as a background layer for fan support banners and flags.",
  ].join("\n");
}

function generationPayload(input, includeReferenceImage) {
  const body = {
    model: MODEL,
    prompt: buildPrompt(input),
    n: 1,
    size: input.size || "1536x1024",
    response_format: "b64_json",
  };

  return body;
}

function backgroundPayload(input) {
  return {
    model: MODEL,
    prompt: buildBackgroundPrompt(input),
    n: 1,
    size: input.size || "1024x1024",
    response_format: "b64_json",
  };
}

async function callImageApi(input) {
  const body = input.backgroundOnly ? backgroundPayload(input) : generationPayload(input, false);
  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const text = await response.text();
  let json = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { error: text };
  }

  if (response.ok) {
    return json;
  }

  const errorMessage = json.error?.message || json.error || text || `图片接口返回 ${response.status}`;
  throw new Error(errorMessage);
}

function normalizeImageResult(result) {
  const first = result?.data?.[0];
  if (!first) {
    throw new Error("图片接口没有返回图片数据。");
  }
  if (first.b64_json) {
    return `data:image/png;base64,${first.b64_json}`;
  }
  if (first.url) {
    return first.url;
  }
  throw new Error("图片接口返回格式无法识别。");
}

function saveBase64Image(dataUrl) {
  if (!dataUrl.startsWith("data:image/")) return "";

  const [, meta, content] = dataUrl.match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,(.+)$/) || [];
  if (!meta || !content) return "";

  const ext = meta.includes("jpeg") ? ".jpg" : ".png";
  const dir = path.join(ROOT, "generated");
  fs.mkdirSync(dir, { recursive: true });
  const filename = `support-${Date.now()}-${crypto.randomBytes(4).toString("hex")}${ext}`;
  const filepath = path.join(dir, filename);
  fs.writeFileSync(filepath, Buffer.from(content, "base64"));
  return `generated/${filename}`;
}

async function handleGenerate(req, res) {
  if (!API_KEY) {
    sendJson(res, 500, {
      error: "本地后端未配置 XIAOJI_API_KEY。请在启动服务前设置环境变量。",
    });
    return;
  }

  try {
    const input = await readJson(req);
    if (!input.artistName || !input.slogan) {
      sendJson(res, 400, { error: "缺少艺人名或应援口号。" });
      return;
    }

    const apiResult = await callImageApi(input);
    const image = normalizeImageResult(apiResult);
    const savedPath = saveBase64Image(image);
    const host = req.headers.host || `localhost:${PORT}`;
    const absoluteSavedPath = savedPath ? `http://${host}/${savedPath}` : "";
    sendJson(res, 200, { image: absoluteSavedPath || image, savedPath: absoluteSavedPath || image });
  } catch (error) {
    sendJson(res, 500, { error: error.message || "生成失败。" });
  }
}

async function handleBackgroundGenerate(req, res) {
  if (!API_KEY) {
    sendJson(res, 500, {
      error: "本地后端未配置 XIAOJI_API_KEY。请在启动服务前设置环境变量。",
    });
    return;
  }

  try {
    const input = await readJson(req);
    input.backgroundOnly = true;
    const apiResult = await callImageApi(input);
    const image = normalizeImageResult(apiResult);
    const savedPath = saveBase64Image(image);
    const host = req.headers.host || `localhost:${PORT}`;
    const absoluteSavedPath = savedPath ? `http://${host}/${savedPath}` : "";
    sendJson(res, 200, { image: absoluteSavedPath || image, savedPath: absoluteSavedPath || image });
  } catch (error) {
    sendJson(res, 500, { error: error.message || "AI 背景生成失败。" });
  }
}

function serveStatic(req, res) {
  const urlPath = decodeURIComponent(new URL(req.url, `http://localhost:${PORT}`).pathname);
  const requested = urlPath === "/" ? "/index.html" : urlPath;
  const filePath = path.normalize(path.join(ROOT, requested));

  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    const type = MIME_TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": type });
    res.end(content);
  });
}

const server = http.createServer((req, res) => {
  if (req.method === "OPTIONS") {
    sendJson(res, 204, {});
    return;
  }

  if (req.url?.startsWith("/api/support-material")) {
    if (req.method !== "POST") {
      sendJson(res, 405, { error: "Method not allowed" });
      return;
    }
    handleGenerate(req, res);
    return;
  }

  if (req.url?.startsWith("/api/support-background")) {
    if (req.method !== "POST") {
      sendJson(res, 405, { error: "Method not allowed" });
      return;
    }
    handleBackgroundGenerate(req, res);
    return;
  }

  serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log(`追星网本地服务已启动：http://localhost:${PORT}`);
});
