(function () {
  const utils = window.PDFMerkezi?.utils;

  const dropZone = document.getElementById("dropZone");
  const fileInput = document.getElementById("pdfFile");
  const selectFileBtn = document.getElementById("selectFileBtn");
  const selectedPanel = document.getElementById("selectedPanel");

  const viewerFileName = document.getElementById("viewerFileName");
  const fileSummary = document.getElementById("fileSummary");
  const clearFileBtn = document.getElementById("clearFileBtn");

  const topInput = document.getElementById("topInput");
  const bottomInput = document.getElementById("bottomInput");
  const leftInput = document.getElementById("leftInput");
  const rightInput = document.getElementById("rightInput");
  const applyAllPagesInput = document.getElementById("applyAllPagesInput");
  const resetCropBtn = document.getElementById("resetCropBtn");

  const prevPageBtn = document.getElementById("prevPageBtn");
  const nextPageBtn = document.getElementById("nextPageBtn");
  const pageNumberInput = document.getElementById("pageNumberInput");
  const pageCountLabel = document.getElementById("pageCountLabel");
  const fitWidthBtn = document.getElementById("fitWidthBtn");

  const thumbList = document.getElementById("thumbList");
  const previewStage = document.getElementById("previewStage");
  const pagePreview = document.getElementById("pagePreview");
  const previewCanvas = document.getElementById("previewCanvas");
  const cropMask = document.getElementById("cropMask");
  const cropSafeArea = document.getElementById("cropSafeArea");

  const cropBtn = document.getElementById("cropBtn");
  const downloadBtn = document.getElementById("downloadBtn");

  const progressWrap = document.getElementById("progressWrap");
  const progressBar = document.getElementById("progressBar");
  const progressText = document.getElementById("progressText");
  const toolMessage = document.getElementById("toolMessage");

  let selectedFile = null;
  let selectedFileBuffer = null;
  let pdfDocument = null;
  let pageCount = 0;
  let currentPage = 1;
  let previewScale = 1;
  let currentDownloadUrl = null;
  let isRendering = false;

  if (
    !dropZone ||
    !fileInput ||
    !selectFileBtn ||
    !selectedPanel ||
    !previewCanvas ||
    !cropSafeArea ||
    !cropBtn ||
    !downloadBtn
  ) {
    console.error("PDF Merkezi: PDF Kırp HTML elemanları bulunamadı.");
    return;
  }

  selectFileBtn.addEventListener("click", function () {
    fileInput.click();
  });

  fileInput.addEventListener("change", function (event) {
    const files = Array.from(event.target.files || []);
    handleFile(files[0]);
    fileInput.value = "";
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
    handleFile(files[0]);
  });

  clearFileBtn.addEventListener("click", clearFile);

  [topInput, bottomInput, leftInput, rightInput, applyAllPagesInput].forEach(function (input) {
    input.addEventListener("input", handleCropSettingsChange);
    input.addEventListener("change", handleCropSettingsChange);
  });

  resetCropBtn.addEventListener("click", function () {
    topInput.value = "0";
    bottomInput.value = "0";
    leftInput.value = "0";
    rightInput.value = "0";
    handleCropSettingsChange();
    setMessage("Kırpma değerleri sıfırlandı.", "success");
  });

  prevPageBtn.addEventListener("click", function () {
    goToPage(currentPage - 1);
  });

  nextPageBtn.addEventListener("click", function () {
    goToPage(currentPage + 1);
  });

  pageNumberInput.addEventListener("change", function () {
    goToPage(Number(pageNumberInput.value));
  });

  pageNumberInput.addEventListener("keydown", function (event) {
    if (event.key === "Enter") {
      goToPage(Number(pageNumberInput.value));
    }
  });

  fitWidthBtn.addEventListener("click", function () {
    renderCurrentPage(true);
  });

  cropBtn.addEventListener("click", cropPdf);

  window.addEventListener("resize", debounce(function () {
    if (pdfDocument) {
      renderCurrentPage(false);
    }
  }, 250));

  async function handleFile(file) {
    resetOutput();
    clearMessage();
    resetViewerOnly();

    if (!file) {
      setMessage("Lütfen bir PDF dosyası seç.", "warning");
      return;
    }

    if (!utils) {
      setMessage("PDF yardımcı sistemi yüklenemedi. Sayfayı yenileyip tekrar dene.", "error");
      return;
    }

    if (!utils.isPdfFile(file)) {
      setMessage("PDF dosyası algılanamadı. Lütfen .pdf uzantılı geçerli bir dosya seç.", "error");
      return;
    }

    if (!window.PDFLib?.PDFDocument || !window.pdfjsLib) {
      setMessage("PDF motoru yüklenemedi. İnternet bağlantını kontrol edip Ctrl + F5 ile yenile.", "error");
      return;
    }

    selectedFile = file;
    selectedPanel.hidden = false;
    viewerFileName.textContent = file.name;
    fileSummary.textContent = "PDF hazırlanıyor...";
    cropBtn.disabled = true;

    try {
      updateProgress(10, "PDF dosyası okunuyor...");

      selectedFileBuffer = await file.arrayBuffer();

      const pdfLibDoc = await window.PDFLib.PDFDocument.load(selectedFileBuffer.slice(0), {
        ignoreEncryption: false
      });

      pageCount = pdfLibDoc.getPageCount();

      if (pageCount < 1) {
        throw new Error("PDF içinde sayfa bulunamadı.");
      }

      updateProgress(30, "PDF önizleme hazırlanıyor...");

      const loadingTask = window.pdfjsLib.getDocument({
        data: selectedFileBuffer.slice(0)
      });

      pdfDocument = await loadingTask.promise;
      currentPage = 1;

      pageNumberInput.value = "1";
      pageNumberInput.max = String(pageCount);
      pageCountLabel.textContent = `/ ${pageCount}`;

      fileSummary.textContent = `${pageCount} sayfa • ${utils.formatBytes(file.size)}`;

      await renderThumbnails();
      await renderCurrentPage(false);

      updateProgress(100, "PDF hazır.");
      setMessage("PDF hazır. Kırpma alanını ayarlayıp PDF’e işleyebilirsin.", "success");

      updateActionState();

      setTimeout(function () {
        progressWrap.hidden = true;
      }, 800);
    } catch (error) {
      console.error("PDF kırpma hazırlama hatası:", error);

      const errorMessage = String(error?.message || "").toLowerCase();

      resetViewerOnly();

      if (errorMessage.includes("encrypted") || errorMessage.includes("password")) {
        setMessage("Şifreli PDF dosyası okunamadı. Lütfen şifresiz PDF dosyası dene.", "error");
      } else {
        setMessage("PDF okunamadı. Dosya bozuk, şifreli veya çok büyük olabilir.", "error");
      }

      updateProgress(0, "İşlem başarısız oldu.");
    }
  }

  async function renderThumbnails() {
    thumbList.innerHTML = "";

    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber++) {
      updateProgress(
        30 + Math.round((pageNumber / pageCount) * 22),
        `${pageNumber}. sayfa küçük önizlemesi hazırlanıyor...`
      );

      const page = await pdfDocument.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 0.16 });

      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d", { alpha: false });

      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);

      await page.render({
        canvasContext: context,
        viewport: viewport
      }).promise;

      const thumb = document.createElement("button");
      thumb.className = "pdf-thumb-item";
      thumb.type = "button";
      thumb.dataset.page = String(pageNumber);

      const number = document.createElement("span");
      number.className = "pdf-thumb-number";
      number.textContent = String(pageNumber);

      thumb.appendChild(canvas);
      thumb.appendChild(number);

      thumb.addEventListener("click", function () {
        goToPage(pageNumber);
      });

      thumbList.appendChild(thumb);
    }
  }

  async function renderCurrentPage(showMessage) {
    if (!pdfDocument || isRendering) return;

    isRendering = true;

    try {
      updateToolbarState();

      const page = await pdfDocument.getPage(currentPage);
      const baseViewport = page.getViewport({ scale: 1 });
      const availableWidth = Math.max(320, previewStage.clientWidth - 72);

      previewScale = Math.min(2.2, Math.max(0.35, availableWidth / baseViewport.width));

      const viewport = page.getViewport({ scale: previewScale });
      const context = previewCanvas.getContext("2d", { alpha: false });

      previewCanvas.width = Math.floor(viewport.width);
      previewCanvas.height = Math.floor(viewport.height);
      previewCanvas.style.width = `${Math.floor(viewport.width)}px`;
      previewCanvas.style.height = `${Math.floor(viewport.height)}px`;

      pagePreview.style.width = `${Math.floor(viewport.width)}px`;
      pagePreview.style.height = `${Math.floor(viewport.height)}px`;

      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, previewCanvas.width, previewCanvas.height);

      await page.render({
        canvasContext: context,
        viewport: viewport
      }).promise;

      updateCropPreview();
      setCurrentPage(currentPage);
      updateToolbarState();

      if (showMessage) {
        setMessage("PDF önizleme genişliğe sığdırıldı.", "success");
      }
    } catch (error) {
      console.error("PDF kırpma önizleme hatası:", error);
      setMessage("PDF önizleme hazırlanırken bir sorun oluştu.", "error");
    } finally {
      isRendering = false;
      updateToolbarState();
    }
  }

  function updateCropPreview() {
    const values = getCropValues(false);

    if (!values.valid || !previewCanvas.width || !previewCanvas.height) {
      cropMask.hidden = true;
      return;
    }

    cropMask.hidden = false;

    const top = values.top * previewScale;
    const bottom = values.bottom * previewScale;
    const left = values.left * previewScale;
    const right = values.right * previewScale;

    const safeWidth = Math.max(20, previewCanvas.width - left - right);
    const safeHeight = Math.max(20, previewCanvas.height - top - bottom);

    cropSafeArea.style.left = `${left}px`;
    cropSafeArea.style.top = `${top}px`;
    cropSafeArea.style.width = `${safeWidth}px`;
    cropSafeArea.style.height = `${safeHeight}px`;
  }

  async function cropPdf() {
    if (!selectedFile || !selectedFileBuffer || !pageCount) {
      setMessage("Lütfen önce bir PDF dosyası seç.", "warning");
      return;
    }

    const values = getCropValues(true);

    if (!values.valid) {
      setMessage(values.message, "error");
      return;
    }

    resetOutput();
    setBusy(true);
    updateProgress(10, "PDF kırpma işlemi başlıyor...");

    try {
      const pdfDoc = await window.PDFLib.PDFDocument.load(selectedFileBuffer.slice(0), {
        ignoreEncryption: false
      });

      const pages = pdfDoc.getPages();
      const targetIndexes = values.applyAllPages
        ? pages.map(function (_, index) { return index; })
        : [currentPage - 1];

      updateProgress(42, "Sayfa kırpma alanları uygulanıyor...");

      targetIndexes.forEach(function (pageIndex) {
        const page = pages[pageIndex];
        if (!page) return;

        const size = page.getSize();
        const rotation = getPageRotationDegrees(page);
        const mappedValues = mapCropValuesByRotation(values, rotation);

        const maxHorizontal = Math.max(0, size.width - 20);
        const maxVertical = Math.max(0, size.height - 20);

        const left = Math.min(mappedValues.left, maxHorizontal);
        const right = Math.min(mappedValues.right, Math.max(0, maxHorizontal - left));
        const bottom = Math.min(mappedValues.bottom, maxVertical);
        const top = Math.min(mappedValues.top, Math.max(0, maxVertical - bottom));

        const cropX = left;
        const cropY = bottom;
        const cropWidth = Math.max(20, size.width - left - right);
        const cropHeight = Math.max(20, size.height - top - bottom);

        page.setCropBox(cropX, cropY, cropWidth, cropHeight);
      });

      updateProgress(82, "Yeni PDF oluşturuluyor...");

      const bytes = await pdfDoc.save({
        useObjectStreams: true,
        addDefaultPage: false
      });

      currentDownloadUrl = utils.createDownloadUrl(bytes);

      downloadBtn.href = currentDownloadUrl;
      downloadBtn.download = buildOutputFileName();
      downloadBtn.hidden = false;
      downloadBtn.classList.remove("is-disabled");
      downloadBtn.setAttribute("aria-disabled", "false");

      updateProgress(100, "PDF başarıyla kırpıldı.");
      setMessage("Hazır! Kırpılmış PDF dosyanı indirebilirsin.", "success");
    } catch (error) {
      console.error("PDF kırpma hatası:", error);

      const errorMessage = String(error?.message || "").toLowerCase();

      if (errorMessage.includes("encrypted") || errorMessage.includes("password")) {
        setMessage("Şifreli PDF dosyası düzenlenemedi. Lütfen şifresiz PDF dosyası dene.", "error");
      } else {
        setMessage("PDF kırpılırken bir sorun oluştu. Dosya bozuk, şifreli veya çok büyük olabilir.", "error");
      }

      updateProgress(0, "İşlem başarısız oldu.");
    } finally {
      setBusy(false);
    }
  }

  function getCropValues(validate) {
    const top = Number(topInput.value);
    const bottom = Number(bottomInput.value);
    const left = Number(leftInput.value);
    const right = Number(rightInput.value);
    const applyAllPages = applyAllPagesInput.checked;

    const values = {
      top,
      bottom,
      left,
      right
    };

    for (const value of Object.values(values)) {
      if (!Number.isFinite(value) || value < 0) {
        return {
          valid: false,
          message: "Kırpma değerleri 0 veya daha büyük sayı olmalı."
        };
      }
    }

    return {
      valid: true,
      top,
      bottom,
      left,
      right,
      applyAllPages
    };
  }

  function getPageRotationDegrees(page) {
    try {
      const rotation = page.getRotation();

      if (typeof rotation?.angle === "number") {
        return normalizeRotation(rotation.angle);
      }

      if (typeof rotation === "number") {
        return normalizeRotation(rotation);
      }

      return 0;
    } catch (error) {
      return 0;
    }
  }

  function normalizeRotation(rotation) {
    return ((rotation % 360) + 360) % 360;
  }

  function mapCropValuesByRotation(values, rotation) {
    const normalizedRotation = normalizeRotation(rotation);

    const visualTop = values.top;
    const visualBottom = values.bottom;
    const visualLeft = values.left;
    const visualRight = values.right;

    if (normalizedRotation === 90) {
      return {
        top: visualRight,
        bottom: visualLeft,
        left: visualTop,
        right: visualBottom
      };
    }

    if (normalizedRotation === 180) {
      return {
        top: visualBottom,
        bottom: visualTop,
        left: visualRight,
        right: visualLeft
      };
    }

    if (normalizedRotation === 270) {
      return {
        top: visualLeft,
        bottom: visualRight,
        left: visualBottom,
        right: visualTop
      };
    }

    return {
      top: visualTop,
      bottom: visualBottom,
      left: visualLeft,
      right: visualRight
    };
  }

  function handleCropSettingsChange() {
    resetOutput();
    updateCropPreview();
    updateActionState();
  }

  function goToPage(pageNumber) {
    if (!pdfDocument) return;

    if (!Number.isInteger(pageNumber)) {
      pageNumberInput.value = String(currentPage);
      return;
    }

    if (pageNumber < 1 || pageNumber > pageCount) {
      pageNumberInput.value = String(currentPage);
      setMessage(`Sayfa numarası 1 ile ${pageCount} arasında olmalı.`, "warning");
      return;
    }

    currentPage = pageNumber;
    pageNumberInput.value = String(currentPage);
    renderCurrentPage(false);
    clearMessage();
  }

  function setCurrentPage(pageNumber) {
    currentPage = pageNumber;
    pageNumberInput.value = String(currentPage);

    document.querySelectorAll(".pdf-thumb-item").forEach(function (thumb) {
      thumb.classList.toggle("is-active", Number(thumb.dataset.page) === currentPage);
    });
  }

  function updateToolbarState() {
    const hasPdf = Boolean(pdfDocument);

    prevPageBtn.disabled = !hasPdf || currentPage <= 1;
    nextPageBtn.disabled = !hasPdf || currentPage >= pageCount;
    pageNumberInput.disabled = !hasPdf;
    fitWidthBtn.disabled = !hasPdf || isRendering;
  }

  function updateActionState() {
    cropBtn.disabled = !(selectedFile && selectedFileBuffer && pageCount > 0);
  }

  function setBusy(isBusy) {
    cropBtn.disabled = isBusy;

    if (!isBusy) {
      updateActionState();
    }

    [
      clearFileBtn,
      selectFileBtn,
      topInput,
      bottomInput,
      leftInput,
      rightInput,
      applyAllPagesInput,
      resetCropBtn,
      prevPageBtn,
      nextPageBtn,
      pageNumberInput,
      fitWidthBtn
    ].forEach(function (input) {
      if (input) input.disabled = isBusy;
    });
  }

  function clearFile() {
    fileInput.value = "";
    selectedPanel.hidden = true;

    resetViewerOnly();
    resetOutput();
    clearMessage();
    updateActionState();
  }

  function resetViewerOnly() {
    selectedFile = null;
    selectedFileBuffer = null;
    pdfDocument = null;
    pageCount = 0;
    currentPage = 1;
    previewScale = 1;
    isRendering = false;

    thumbList.innerHTML = "";
    cropMask.hidden = true;

    const context = previewCanvas.getContext("2d");
    context.clearRect(0, 0, previewCanvas.width, previewCanvas.height);

    previewCanvas.width = 0;
    previewCanvas.height = 0;

    pagePreview.removeAttribute("style");

    viewerFileName.textContent = "PDF Kırp";
    fileSummary.textContent = "Seçilen PDF dosyası hazırlanıyor.";
    pageNumberInput.value = "1";
    pageNumberInput.removeAttribute("max");
    pageCountLabel.textContent = "/ 0";

    updateToolbarState();
  }

  function resetOutput() {
    if (currentDownloadUrl && utils) {
      utils.revokeDownloadUrl(currentDownloadUrl);
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
  }

  function buildOutputFileName() {
    const fileName = utils.sanitizeFileName(selectedFile?.name || "pdf");
    return `${fileName}-kirpilmis.pdf`;
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

  function debounce(callback, delay) {
    let timeoutId;

    return function () {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(callback, delay);
    };
  }

  updateToolbarState();
  updateActionState();
})();