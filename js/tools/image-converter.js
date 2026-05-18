(function () {
  const utils = window.PDFMerkezi?.utils;

  const inputFormat = getDatasetValue("inputFormat", "jpg");
  const inputLabel = getDatasetValue("inputLabel", "JPG");
  const outputFormat = getDatasetValue("outputFormat", "jpeg");
  const outputLabel = getDatasetValue("outputLabel", "JPEG");
  const outputMime = getOutputMime(outputFormat);

  const dropZone = document.getElementById("dropZone");
  const fileInput = document.getElementById("imageFile");
  const selectFileBtn = document.getElementById("selectFileBtn");
  const selectedPanel = document.getElementById("selectedPanel");

  const selectedFileName = document.getElementById("selectedFileName");
  const selectedFileMeta = document.getElementById("selectedFileMeta");
  const clearFileBtn = document.getElementById("clearFileBtn");

  const qualitySelect = document.getElementById("qualitySelect");
  const previewGrid = document.getElementById("previewGrid");

  const convertBtn = document.getElementById("convertBtn");
  const downloadBtn = document.getElementById("downloadBtn");

  const progressWrap = document.getElementById("progressWrap");
  const progressBar = document.getElementById("progressBar");
  const progressText = document.getElementById("progressText");
  const toolMessage = document.getElementById("toolMessage");

  let selectedFile = null;
  let previewUrl = null;
  let currentDownloadUrl = null;

  if (
    !utils ||
    !dropZone ||
    !fileInput ||
    !selectFileBtn ||
    !selectedPanel ||
    !selectedFileName ||
    !selectedFileMeta ||
    !clearFileBtn ||
    !previewGrid ||
    !convertBtn ||
    !downloadBtn
  ) {
    console.error("PDF Merkezi: Görsel dönüştürücü gerekli HTML elemanları bulunamadı.");
    return;
  }

  selectFileBtn.addEventListener("click", function () {
    fileInput.click();
  });

  fileInput.addEventListener("change", function (event) {
    const file = event.target.files?.[0] || null;
    fileInput.value = "";
    handleFile(file);
  });

  dropZone.addEventListener("dragover", function (event) {
    event.preventDefault();
    dropZone.classList.add("is-dragging");
  });

  dropZone.addEventListener("dragleave", function () {
    dropZone.classList.remove("is-dragging");
  });

  dropZone.addEventListener("drop", function (event) {
    event.preventDefault();
    dropZone.classList.remove("is-dragging");

    const file = event.dataTransfer.files?.[0] || null;
    handleFile(file);
  });

  clearFileBtn.addEventListener("click", clearFile);
  convertBtn.addEventListener("click", convertImage);

  if (qualitySelect) {
    qualitySelect.addEventListener("change", resetOutput);
  }

  function handleFile(file) {
    clearMessage();
    resetOutput();
    revokePreviewUrl();

    selectedFile = null;

    if (!file) {
      setMessage(`Lütfen bir ${inputLabel} dosyası seç.`, "warning");
      return;
    }

    if (!isValidInputFile(file)) {
      setMessage(`Lütfen geçerli bir ${inputLabel} dosyası seç.`, "error");
      return;
    }

    selectedFile = file;
    selectedPanel.hidden = false;

    selectedFileName.textContent = file.name;
    selectedFileMeta.textContent = `${utils.formatBytes(file.size)} • ${outputLabel} formatına dönüştürmeye hazır`;

    renderPreview(file);

    setMessage(`${inputLabel} görsel hazır. ${outputLabel} dosyasını oluşturabilirsin.`, "success");
  }

  function renderPreview(file) {
    previewGrid.innerHTML = "";

    previewUrl = URL.createObjectURL(file);

    const card = document.createElement("article");
    card.className = "image-result-card";

    const previewWrap = document.createElement("div");
    previewWrap.className = "image-result-preview";

    const image = document.createElement("img");
    image.src = previewUrl;
    image.alt = `${inputLabel} önizleme`;
    image.loading = "lazy";

    previewWrap.appendChild(image);

    const body = document.createElement("div");
    body.className = "image-result-body";

    const title = document.createElement("strong");
    title.textContent = "Seçilen Görsel";

    const meta = document.createElement("span");
    meta.textContent = `${file.name} • ${utils.formatBytes(file.size)}`;

    body.appendChild(title);
    body.appendChild(meta);

    card.appendChild(previewWrap);
    card.appendChild(body);

    previewGrid.appendChild(card);
  }

  async function convertImage() {
    if (!selectedFile) {
      setMessage(`Lütfen önce bir ${inputLabel} dosyası seç.`, "warning");
      return;
    }

    resetOutput();

    convertBtn.disabled = true;
    clearFileBtn.disabled = true;

    if (qualitySelect) {
      qualitySelect.disabled = true;
    }

    try {
      updateProgress(15, "Görsel okunuyor...");

      const image = await loadImageFromFile(selectedFile);

      updateProgress(45, `${outputLabel} çıktısı hazırlanıyor...`);

      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d", {
        alpha: outputFormat === "png"
      });

      canvas.width = image.naturalWidth || image.width;
      canvas.height = image.naturalHeight || image.height;

      if (outputFormat !== "png") {
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, canvas.width, canvas.height);
      } else {
        context.clearRect(0, 0, canvas.width, canvas.height);
      }

      context.drawImage(image, 0, 0, canvas.width, canvas.height);

      const quality = qualitySelect ? Number(qualitySelect.value) || 0.92 : undefined;
      const blob = await canvasToBlob(canvas, outputMime, quality);

      if (!blob) {
        throw new Error("Görsel çıktısı oluşturulamadı.");
      }

      currentDownloadUrl = URL.createObjectURL(blob);

      downloadBtn.href = currentDownloadUrl;
      downloadBtn.download = buildOutputFileName(selectedFile.name);
      downloadBtn.hidden = false;
      downloadBtn.classList.remove("is-disabled");
      downloadBtn.setAttribute("aria-disabled", "false");

      selectedFileMeta.textContent = `${utils.formatBytes(selectedFile.size)} → ${utils.formatBytes(blob.size)}`;

      updateProgress(100, `${outputLabel} dosyası hazır.`);
      setMessage(`Hazır! ${outputLabel} dosyanı indirebilirsin.`, "success");

      setTimeout(function () {
        progressWrap.hidden = true;
      }, 800);
    } catch (error) {
      console.error("Görsel dönüştürme hatası:", error);
      setMessage("Görsel dönüştürülürken bir sorun oluştu. Farklı bir dosya dene.", "error");
      updateProgress(0, "İşlem başarısız oldu.");
    } finally {
      convertBtn.disabled = false;
      clearFileBtn.disabled = false;

      if (qualitySelect) {
        qualitySelect.disabled = false;
      }
    }
  }

  function loadImageFromFile(file) {
    return new Promise(function (resolve, reject) {
      const url = URL.createObjectURL(file);
      const image = new Image();

      image.onload = function () {
        URL.revokeObjectURL(url);
        resolve(image);
      };

      image.onerror = function () {
        URL.revokeObjectURL(url);
        reject(new Error("Görsel yüklenemedi."));
      };

      image.src = url;
    });
  }

  function canvasToBlob(canvas, type, quality) {
    return new Promise(function (resolve) {
      if (type === "image/png") {
        canvas.toBlob(function (blob) {
          resolve(blob);
        }, type);
        return;
      }

      canvas.toBlob(function (blob) {
        resolve(blob);
      }, type, quality);
    });
  }

  function isValidInputFile(file) {
    const name = String(file.name || "").toLowerCase();
    const type = String(file.type || "").toLowerCase();

    if (inputFormat === "png") {
      return type === "image/png" || name.endsWith(".png");
    }

    return (
      type === "image/jpeg" ||
      name.endsWith(".jpg") ||
      name.endsWith(".jpeg")
    );
  }

  function buildOutputFileName(fileName) {
    const cleanName = utils.sanitizeFileName(fileName || "gorsel");
    return `${cleanName}.${outputFormat}`;
  }

  function resetOutput() {
    if (currentDownloadUrl) {
      URL.revokeObjectURL(currentDownloadUrl);
      currentDownloadUrl = null;
    }

    downloadBtn.hidden = true;
    downloadBtn.href = "#";
    downloadBtn.removeAttribute("download");
    downloadBtn.classList.add("is-disabled");
    downloadBtn.setAttribute("aria-disabled", "true");

    if (progressWrap) {
      progressWrap.hidden = true;
    }

    updateProgress(0, "");
    clearMessage();
  }

  function clearFile() {
    selectedFile = null;
    fileInput.value = "";
    selectedPanel.hidden = true;
    selectedFileName.textContent = `${inputLabel} görseli seçildi`;
    selectedFileMeta.textContent = "Dosya hazırlanıyor.";

    previewGrid.innerHTML = "";

    resetOutput();
    revokePreviewUrl();
    clearMessage();
  }

  function revokePreviewUrl() {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      previewUrl = null;
    }
  }

  function updateProgress(percent, text) {
    if (!progressWrap || !progressBar || !progressText) return;

    progressWrap.hidden = false;
    progressBar.style.width = `${Math.max(0, Math.min(100, percent))}%`;
    progressText.textContent = text || "";
  }

  function setMessage(message, type) {
    if (!toolMessage) return;

    toolMessage.textContent = message || "";
    toolMessage.className = `tool-message ${type ? `is-${type}` : ""}`;
  }

  function clearMessage() {
    if (!toolMessage) return;

    toolMessage.textContent = "";
    toolMessage.className = "tool-message";
  }

  function getDatasetValue(key, fallback) {
    return document.body?.dataset?.[key] || fallback;
  }

  function getOutputMime(format) {
    if (format === "png") {
      return "image/png";
    }

    return "image/jpeg";
  }
})();