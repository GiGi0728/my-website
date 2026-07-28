const data = window.ZX_DATA || {
  updatedAt: "",
  sources: [],
  spotlights: [],
  feeds: [],
  schedules: [[]],
  ranks: [],
};

let spotlightIndex = 0;
let scheduleIndex = 0;
let activeFilter = "all";
let artistImageDataUrl = "";
let generationTimer = 0;

const qs = (selector, scope = document) => scope.querySelector(selector);
const qsa = (selector, scope = document) => [...scope.querySelectorAll(selector)];

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (char) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[char];
  });
}

function renderIcons() {
  if (window.lucide) {
    window.lucide.createIcons();
  }
}

function showToast(message) {
  const toast = qs("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove("show"), 1800);
}

function renderSourceStrip() {
  qs("#updatedAt").textContent = `更新：${data.updatedAt}`;
  qs("#sourceSummary").innerHTML = data.sources
    .map(
      (source) =>
        `<a href="${escapeHtml(source.url)}" target="_blank" rel="noreferrer">${escapeHtml(source.name)}</a>`,
    )
    .join(" / ");
  qs("#heroLiveTitle").textContent = `${data.feeds.length} 条娱乐信息`;
  qs("#heroLiveText").textContent = "含活动、电影、剧集、综艺、明星舆情";
}

function renderSpotlight() {
  const item = data.spotlights[spotlightIndex];
  if (!item) return;

  const image = qs("#spotlightImg");
  qs("#spotlightTag").textContent = item.tag;
  qs("#spotlightTitle").textContent = item.title;
  qs("#spotlightSource").href = item.url;
  qs("#spotlightSource").textContent = `${item.source} · 查看来源`;
  image.src = item.image;
  image.alt = item.alt;
}

function changeSpotlight(step) {
  spotlightIndex = (spotlightIndex + step + data.spotlights.length) % data.spotlights.length;
  renderSpotlight();
}

function cardTemplate(item) {
  return `
    <article class="feed-card" data-category="${escapeHtml(item.category)}" data-title="${escapeHtml(item.title)}">
      <a href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer" aria-label="${escapeHtml(item.title)}">
        <img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.alt)}" loading="lazy" />
        <div class="card-meta">
          <span><i data-lucide="radio"></i> ${escapeHtml(item.metric)}</span>
          <span><i data-lucide="tag"></i> ${escapeHtml(item.channel)}</span>
          <time>${escapeHtml(item.date)}</time>
        </div>
        <h3>${escapeHtml(item.title)}</h3>
        <p><span>${escapeHtml(item.source)}</span> · ${escapeHtml(item.summary)}</p>
      </a>
    </article>
  `;
}

function renderFeed(items = data.feeds) {
  const grid = qs("#feedGrid");
  grid.innerHTML = items.map(cardTemplate).join("");
  renderIcons();
}

function filterFeed() {
  const searchValue = qs("#siteSearch").value.trim().toLowerCase();
  const result = data.feeds.filter((item) => {
    const text = `${item.title} ${item.summary} ${item.category} ${item.channel} ${item.source}`.toLowerCase();
    const matchesFilter = activeFilter === "all" || item.category.includes(activeFilter);
    const matchesSearch = !searchValue || text.includes(searchValue);
    return matchesFilter && matchesSearch;
  });

  renderFeed(result);

  if (!result.length) {
    showToast("暂时没有匹配内容，换个关键词试试");
  }
}

function setActiveFilter(button) {
  qsa("[data-filter]").forEach((item) => item.classList.remove("active"));
  button.classList.add("active");
  activeFilter = button.dataset.filter;
  filterFeed();
}

function shuffleCards() {
  const shuffled = [...data.feeds].sort(() => Math.random() - 0.5);
  renderFeed(shuffled);
  showToast("已刷新首页推荐");
}

function renderSchedule() {
  const list = qs("#scheduleList");
  const group = data.schedules[scheduleIndex] || [];
  list.innerHTML = group
    .map(
      (item) => `
        <li>
          <time>${escapeHtml(item.time)}</time>
          <div>
            <a href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer">
              <strong>${escapeHtml(item.title)}</strong>
              <span>${escapeHtml(item.detail)}</span>
            </a>
          </div>
        </li>
      `,
    )
    .join("");
}

function renderRanks() {
  const rankList = qs("#rankList");
  rankList.innerHTML = data.ranks
    .map(
      (item, index) => `
        <a href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer">
          <b>${index + 1}</b>
          <span>${escapeHtml(item.title)}</span>
          <em>${escapeHtml(item.heat)}</em>
        </a>
      `,
    )
    .join("");
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(reader.result));
    reader.addEventListener("error", () => reject(reader.error));
    reader.readAsDataURL(file);
  });
}

function materialTypeLabel(value) {
  const labels = {
    support_banner: "应援横幅",
    support_pack: "应援物料套装",
    support_flag: "应援大旗",
    light_board: "灯牌手幅",
  };
  return labels[value] || "应援物料";
}

function getApiBase() {
  if (location.protocol === "file:") {
    return "http://localhost:5178";
  }
  return "";
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.addEventListener("load", () => resolve(image));
    image.addEventListener("error", () => reject(new Error("图片读取失败")));
    image.src = src;
  });
}

async function createLocalMaterial(payload) {
  return createComposedMaterial(payload);
}

async function createComposedMaterial(payload, backgroundSrc = "") {
  const [width, height] = payload.size.split("x").map(Number);
  const canvas = document.createElement("canvas");
  canvas.width = width || 1024;
  canvas.height = height || 1024;
  const ctx = canvas.getContext("2d");
  const accent = payload.mainColor || "#ff6b91";

  if (backgroundSrc) {
    try {
      const bg = await loadImage(backgroundSrc);
      const bgScale = Math.max(canvas.width / bg.width, canvas.height / bg.height);
      const bgWidth = bg.width * bgScale;
      const bgHeight = bg.height * bgScale;
      ctx.drawImage(bg, (canvas.width - bgWidth) / 2, (canvas.height - bgHeight) / 2, bgWidth, bgHeight);
      ctx.fillStyle = "rgba(8, 13, 24, 0.16)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    } catch {
      backgroundSrc = "";
    }
  }

  if (!backgroundSrc) {
    const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    gradient.addColorStop(0, "#fff7fb");
    gradient.addColorStop(0.42, accent);
    gradient.addColorStop(1, "#18a8d8");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  ctx.globalAlpha = 0.16;
  for (let i = 0; i < 80; i += 1) {
    ctx.beginPath();
    ctx.arc(Math.random() * canvas.width, Math.random() * canvas.height, 2 + Math.random() * 8, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  const margin = Math.round(canvas.width * 0.055);
  const isVertical = canvas.height > canvas.width;
  const isBanner = payload.materialType === "support_banner" || payload.materialType === "support_flag";
  const photoWidth = isVertical ? Math.round(canvas.width * 0.72) : Math.round(canvas.width * (isBanner ? 0.36 : 0.38));
  const photoHeight = isVertical ? Math.round(canvas.height * 0.48) : Math.round(canvas.height * 0.72);
  const photoX = isVertical ? Math.round((canvas.width - photoWidth) / 2) : margin;
  const photoY = isVertical ? Math.round(canvas.height * 0.08) : Math.round(canvas.height * 0.14);

  ctx.fillStyle = "rgba(255,255,255,0.86)";
  ctx.roundRect(photoX - 12, photoY - 12, photoWidth + 24, photoHeight + 24, 28);
  ctx.fill();

  if (payload.referenceImage) {
    const image = await loadImage(payload.referenceImage);
    const scale = Math.max(photoWidth / image.width, photoHeight / image.height);
    const drawWidth = image.width * scale;
    const drawHeight = image.height * scale;
    ctx.save();
    ctx.roundRect(photoX, photoY, photoWidth, photoHeight, 22);
    ctx.clip();
    ctx.drawImage(image, photoX + (photoWidth - drawWidth) / 2, photoY + (photoHeight - drawHeight) / 2, drawWidth, drawHeight);
    ctx.restore();
  } else {
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.roundRect(photoX, photoY, photoWidth, photoHeight, 22);
    ctx.fill();
    ctx.fillStyle = accent;
    ctx.font = `900 ${Math.round(canvas.width * 0.11)}px "Microsoft YaHei", sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText(payload.artistName.slice(0, 2), photoX + photoWidth / 2, photoY + photoHeight / 2);
  }

  const textX = isVertical ? margin : photoX + photoWidth + Math.round(canvas.width * 0.07);
  const textTop = isVertical ? Math.round(canvas.height * 0.64) : Math.round(canvas.height * 0.28);
  const textWidth = isVertical ? canvas.width - margin * 2 : canvas.width - textX - margin;
  ctx.textAlign = "left";
  ctx.fillStyle = "#ffffff";
  ctx.shadowColor = "rgba(0,0,0,0.34)";
  ctx.shadowBlur = 16;
  ctx.font = `900 ${Math.round(canvas.width * (isVertical ? 0.09 : 0.068))}px "Microsoft YaHei", sans-serif`;
  ctx.fillText(payload.artistName, textX, textTop, textWidth);

  ctx.font = `900 ${Math.round(canvas.width * (isVertical ? 0.066 : 0.055))}px "Microsoft YaHei", sans-serif`;
  const sloganLines = payload.slogan.match(/.{1,9}/g) || [payload.slogan];
  sloganLines.slice(0, 3).forEach((line, index) => {
    ctx.fillText(line, textX, textTop + Math.round(canvas.width * 0.12) + index * Math.round(canvas.width * 0.07), textWidth);
  });
  ctx.shadowBlur = 0;

  ctx.fillStyle = "rgba(255,255,255,0.92)";
  const badgeY = isVertical ? Math.round(canvas.height * 0.87) : Math.round(canvas.height * 0.7);
  ctx.roundRect(textX, badgeY, textWidth, Math.round(canvas.height * 0.12), 22);
  ctx.fill();
  ctx.fillStyle = accent;
  ctx.font = `900 ${Math.round(canvas.width * 0.034)}px "Microsoft YaHei", sans-serif`;
  ctx.fillText(`${payload.materialTypeLabel} · 追星网 AI 应援工坊`, textX + 24, badgeY + Math.round(canvas.height * 0.075), textWidth - 48);

  return canvas.toDataURL("image/png");
}

async function requestAiBackground(payload) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 180000);
  try {
    const response = await fetch(`${getApiBase()}/api/support-background`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const body = await response.json();
    if (!response.ok) {
      throw new Error(body.error || "AI 背景生成失败");
    }
    return body.image;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

async function handleArtistImageChange(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  if (!file.type.startsWith("image/")) {
    showToast("请上传图片文件");
    return;
  }

  artistImageDataUrl = await readFileAsDataUrl(file);
  const preview = qs("#artistPreview");
  preview.src = artistImageDataUrl;
  preview.alt = "已上传的艺人参考图";
  qs(".upload-box").classList.add("has-image");
  qs("#uploadHint").innerHTML = '<i data-lucide="refresh-cw"></i> 更换艺人图片';
  renderIcons();
}

async function handleMaterialSubmit(event) {
  event.preventDefault();

  const status = qs("#generationStatus");
  const result = qs("#materialResult");
  const submitButton = qs(".generate-btn");
  const payload = {
    artistName: qs("#artistName").value.trim(),
    slogan: qs("#slogan").value.trim(),
    materialType: qs("#materialType").value,
    materialTypeLabel: materialTypeLabel(qs("#materialType").value),
    visualStyle: qs("#visualStyle").value,
    generationMode: qs("#generationMode").value,
    mainColor: qs("#mainColor").value,
    size: qs("#materialSize").value,
    referenceImage: artistImageDataUrl,
  };

  if (!payload.artistName || !payload.slogan) {
    showToast("请填写艺人名和应援口号");
    return;
  }

  submitButton.disabled = true;
  let waitedSeconds = 0;
  status.textContent =
    payload.generationMode === "ai_background"
      ? "正在生成 AI 背景，已等待 0 秒..."
      : "正在快速合成，人物使用上传原图，文字由网页排版...";
  window.clearInterval(generationTimer);
  generationTimer = window.setInterval(() => {
    waitedSeconds += 1;
    if (payload.generationMode === "ai_background") {
      status.textContent = `正在生成 AI 背景，已等待 ${waitedSeconds} 秒...`;
    }
  }, 1000);
  result.innerHTML = `
    <div class="result-empty">
      <i data-lucide="loader-circle"></i>
      <span>${payload.generationMode === "ai_background" ? "AI 正在生成无文字背景" : "正在精准排版生成"}</span>
    </div>
  `;
  renderIcons();

  try {
    const aiBackground = payload.generationMode === "ai_background" ? await requestAiBackground(payload) : "";
    const finalImage = await createComposedMaterial(payload, aiBackground);
    window.clearInterval(generationTimer);
    status.textContent =
      payload.generationMode === "ai_background"
        ? "AI 背景生成完成，已叠加真人图和准确文字。"
        : "快速生成完成，可下载保存。";
    result.innerHTML = `
      <img src="${finalImage}" alt="${escapeHtml(payload.artistName)}${escapeHtml(payload.materialTypeLabel)}生成图" />
      <div class="result-actions">
        <a href="${finalImage}" download="${escapeHtml(payload.artistName)}-${escapeHtml(payload.materialTypeLabel)}.png">
          <i data-lucide="download"></i>
          下载图片
        </a>
        <a href="#materialForm">
          <i data-lucide="rotate-cw"></i>
          继续调整
        </a>
      </div>
    `;
    renderIcons();
  } catch (error) {
    window.clearInterval(generationTimer);
    try {
      const fallbackImage = await createLocalMaterial(payload);
      status.textContent = "外部接口暂不可用，已生成本地预览图。";
      result.innerHTML = `
        <img src="${fallbackImage}" alt="${escapeHtml(payload.artistName)}${escapeHtml(payload.materialTypeLabel)}本地预览图" />
        <div class="result-actions">
          <a href="${fallbackImage}" download="${escapeHtml(payload.artistName)}-${escapeHtml(payload.materialTypeLabel)}-preview.png">
            <i data-lucide="download"></i>
            下载预览
          </a>
          <a href="#materialForm">
            <i data-lucide="rotate-cw"></i>
            重新生成
          </a>
        </div>
      `;
    } catch (fallbackError) {
      status.textContent = "生成失败，请检查本地后端和密钥配置。";
      result.innerHTML = `
        <div class="result-empty error">
          <i data-lucide="circle-alert"></i>
          <span>${escapeHtml(error.message || fallbackError.message)}</span>
        </div>
      `;
    }
    renderIcons();
  } finally {
    submitButton.disabled = false;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  renderSourceStrip();
  renderSpotlight();
  renderFeed();
  renderSchedule();
  renderRanks();
  renderIcons();

  qs("#prevSpotlight").addEventListener("click", () => changeSpotlight(-1));
  qs("#nextSpotlight").addEventListener("click", () => changeSpotlight(1));
  qs("#shuffleBtn").addEventListener("click", shuffleCards);
  qs("#topBtn").addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));

  qsa("[data-filter]").forEach((button) => {
    button.addEventListener("click", () => setActiveFilter(button));
  });

  qs("#siteSearch").addEventListener("input", filterFeed);

  qs(".search").addEventListener("submit", (event) => {
    event.preventDefault();
    filterFeed();
    showToast("搜索结果已更新");
  });

  qs("#refreshSchedule").addEventListener("click", () => {
    scheduleIndex = (scheduleIndex + 1) % data.schedules.length;
    renderSchedule();
    showToast("近期活动已更新");
  });

  qs("#artistImage").addEventListener("change", handleArtistImageChange);
  qs("#materialForm").addEventListener("submit", handleMaterialSubmit);

  qsa(".login-btn, .publish-btn, .icon-btn").forEach((button) => {
    button.addEventListener("click", () => showToast("入口已预留，后续可接登录和发布系统"));
  });
});
