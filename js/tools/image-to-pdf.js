(function () {
  const utils = window.PDFMerkezi?.utils;

  const inputFormat = getInputFormat();
  const inputLabel = getInputLabel(inputFormat);

  const dropZone = document.getElementById("dropZone");
  const fileInput = document.getElementById("imageFile");
  const selectFileBtn = document.getElementById("selectFileBtn");
  const selectedPanel = document.getElementById("selectedPanel");

  const selectedFileName = document.getElementById("selectedFileName");
  const selectedFileMeta = document.getElementById("selectedFileMeta");
  const clearFileBtn = document.getElementById("clearFileBtn");

  const pageSizeSelect = document.getElementById("pageSizeSelect");
  const marginSelect = document.getElementById("marginSelect");
  const previewGrid = document.getElementById("previewGrid");

  const convertBtn = document.getElementById("convertBtn");
  const downloadBtn = document.getElementById("downloadBtn");

  const progressWrap = document.getElementById("progressWrap");
  const progressBar = document.getElementById("progressBar");
  const progressText = document.getElementById("progressText");
  const toolMessage = document.getElementById("toolMessage");

  let selectedFiles = [];
  let previewUrls = [];
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
    !pageSizeSelect ||
    !marginSelect ||
    !previewGrid ||
    !convertBtn ||
    !downloadBtn
  ) {
    console.error(`PDF Merkezi: ${inputLabel} PDF gerekli HTML elemanları bulunamadı.`);
    return;
  }

  if (!window.PDFLib?.PDFDocument) {
    setMessage("PDF motoru yüklenemedi. Sayfayı yenileyip tekrar dene.", "error");
    return;
  }

  selectFileBtn.addEventListener("click", function () {
    fileInput.click();
  });

  fileInput.addEventListener("change", function (event) {
    const files = Array.from(event.target.files || []);
    fileInput.value = "";
    handleFiles(files);
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

    const files = Array.from(event.dataTransfer.files || []);
    handleFiles(files);
  });

  clearFileBtn.addEventListener("click", clearFiles);
  convertBtn.addEventListener("click", convertImagesToPdf);

  pageSizeSelect.addEventListener("change", resetOutput);
  marginSelect.addEventListener("change", resetOutput);

  function handleFiles(files) {
    clearMessage();
    resetOutput();
    revokePreviewUrls();

    const validFiles = files.filter(function (file) {
      return isSupportedImageFile(file);
    });

    if (validFiles.length === 0) {
      setMessage(`Lütfen ${inputLabel} dosyası seç.`, "warning");
      return;
    }

    selectedFiles = validFiles;
    selectedPanel.hidden = false;

    const totalSize = selectedFiles.reduce(function (sum, file) {
      return sum + file.size;
    }, 0);

    selectedFileName.textContent = `${selectedFiles.length} ${inputLabel} görsel seçildi`;
    selectedFileMeta.textContent = `${utils.formatBytes(totalSize)} • PDF’e dönüştürmeye hazır`;

    renderPreviewGrid();
    setMessage(`${inputLabel} görseller hazır. PDF dosyasını oluşturabilirsin.`, "success");
  }

  function renderPreviewGrid() {
    previewGrid.innerHTML = "";

    selectedFiles.forEach(function (file, index) {
      const url = URL.createObjectURL(file);
      previewUrls.push(url);

      const card = document.createElement("article");
      card.className = "image-result-card";

      const previewWrap = document.createElement("div");
      previewWrap.className = "image-result-preview";

      const image = document.createElement("img");
      image.src = url;
      image.alt = `${index + 1}. ${inputLabel} önizleme`;
      image.loading = "lazy";

      previewWrap.appendChild(image);

      const body = document.createElement("div");
      body.className = "image-result-body";

      const title = document.createElement("strong");
      title.textContent = `${index + 1}. Görsel`;

      const meta = document.createElement("span");
      meta.textContent = `${file.name} • ${utils.formatBytes(file.size)}`;

      body.appendChild(title);
      body.appendChild(meta);

      card.appendChild(previewWrap);
      card.appendChild(body);

      previewGrid.appendChild(card);
    });
  }

  async function convertImagesToPdf() {
    if (selectedFiles.length === 0) {
      setMessage(`Lütfen önce ${inputLabel} dosyası seç.`, "warning");
      return;
    }

    resetOutput();

    convertBtn.disabled = true;
    clearFileBtn.disabled = true;
    pageSizeSelect.disabled = true;
    marginSelect.disabled = true;

    try {
      updateProgress(5, "PDF oluşturuluyor...");

      const { PDFDocument } = window.PDFLib;
      const pdfDoc = await PDFDocument.create();

      const pageMode = pageSizeSelect.value;
      const margin = Number(marginSelect.value) || 0;

      for (let index = 0; index < selectedFiles.length; index += 1) {
        const file = selectedFiles[index];

        updateProgress(
          8 + Math.round((index / selectedFiles.length) * 78),
          `${index + 1}. görsel PDF’e ekleniyor...`
        );

        const bytes = await file.arrayBuffer();
        const embeddedImage = await embedImage(pdfDoc, file, bytes);

        const imageWidth = embeddedImage.width;
        const imageHeight = embeddedImage.height;

        let pageWidth = imageWidth;
        let pageHeight = imageHeight;

        if (pageMode === "a4") {
          pageWidth = 595.28;
          pageHeight = 841.89;
        }

        const page = pdfDoc.addPage([pageWidth, pageHeight]);

        const availableWidth = Math.max(1, pageWidth - margin * 2);
        const availableHeight = Math.max(1, pageHeight - margin * 2);

        const scale = Math.min(
          availableWidth / imageWidth,
          availableHeight / imageHeight
        );

        const drawWidth = imageWidth * scale;
        const drawHeight = imageHeight * scale;
        const x = (pageWidth - drawWidth) / 2;
        const y = (pageHeight - drawHeight) / 2;

        page.drawImage(embeddedImage, {
          x,
          y,
          width: drawWidth,
          height: drawHeight
        });
      }

      updateProgress(90, "PDF kaydediliyor...");

      const pdfBytes = await pdfDoc.save({
        useObjectStreams: true,
        addDefaultPage: false
      });

      currentDownloadUrl = utils.createDownloadUrl(pdfBytes);

      downloadBtn.href = currentDownloadUrl;
      downloadBtn.download = buildOutputFileName();
      downloadBtn.hidden = false;
      downloadBtn.classList.remove("is-disabled");
      downloadBtn.setAttribute("aria-disabled", "false");

      updateProgress(100, "PDF hazır.");
      setMessage(`Hazır! ${inputLabel} görsellerinden oluşturulan PDF dosyanı indirebilirsin.`, "success");

      setTimeout(function () {
        progressWrap.hidden = true;
      }, 900);
    } catch (error) {
      console.error(`${inputLabel} PDF dönüştürme hatası:`, error);
      setMessage(`${inputLabel} görseller PDF’e dönüştürülürken bir sorun oluştu. Farklı bir dosya dene.`, "error");
      updateProgress(0, "İşlem başarısız oldu.");
    } finally {
      convertBtn.disabled = false;
      clearFileBtn.disabled = false;
      pageSizeSelect.disabled = false;
      marginSelect.disabled = false;
    }
  }

  async function embedImage(pdfDoc, file, bytes) {
    const name = String(file.name || "").toLowerCase();
    const type = String(file.type || "").toLowerCase();

    if (type === "image/png" || name.endsWith(".png")) {
      return pdfDoc.embedPng(bytes);
    }

    return pdfDoc.embedJpg(bytes);
  }

  function isSupportedImageFile(file) {
    const name = String(file.name || "").toLowerCase();
    const type = String(file.type || "").toLowerCase();

    if (inputFormat === "png") {
      return type === "image/png" || name.endsWith(".png");
    }

    if (inputFormat === "jpeg") {
      return (
        type === "image/jpeg" ||
        name.endsWith(".jpeg") ||
        name.endsWith(".jpg")
      );
    }

    return (
      type === "image/jpeg" ||
      name.endsWith(".jpg") ||
      name.endsWith(".jpeg")
    );
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

  function clearFiles() {
    selectedFiles = [];
    fileInput.value = "";
    selectedPanel.hidden = true;
    selectedFileName.textContent = `${inputLabel} görselleri seçildi`;
    selectedFileMeta.textContent = "Dosyalar hazırlanıyor.";
    previewGrid.innerHTML = "";

    resetOutput();
    revokePreviewUrls();
    clearMessage();
  }

  function revokePreviewUrls() {
    previewUrls.forEach(function (url) {
      URL.revokeObjectURL(url);
    });

    previewUrls = [];
  }

  function buildOutputFileName() {
    if (selectedFiles.length === 1) {
      return `${utils.sanitizeFileName(selectedFiles[0].name)}.pdf`;
    }

    return `${inputFormat}-gorseller-pdf.pdf`;
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

  function getInputFormat() {
    const bodyFormat = document.body?.dataset?.inputFormat;

    if (bodyFormat) {
      return bodyFormat.toLowerCase();
    }

    const path = window.location.pathname.toLowerCase();

    if (path.includes("png-pdf")) return "png";
    if (path.includes("jpeg-pdf")) return "jpeg";

    return "jpg";
  }

  function getInputLabel(format) {
    if (format === "png") return "PNG";
    if (format === "jpeg") return "JPEG";
    return "JPG";
  }
})();