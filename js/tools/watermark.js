(function () {
  const utils = window.PDFMerkezi?.utils;

  const dropZone = document.getElementById("dropZone");
  const fileInput = document.getElementById("pdfFile");
  const selectFileBtn = document.getElementById("selectFileBtn");
  const selectedPanel = document.getElementById("selectedPanel");

  const viewerFileName = document.getElementById("viewerFileName");
  const fileSummary = document.getElementById("fileSummary");
  const clearFileBtn = document.getElementById("clearFileBtn");

  const watermarkTextInput = document.getElementById("watermarkTextInput");
  const fontFamilySelect = document.getElementById("fontFamilySelect");
  const customFontInput = document.getElementById("customFontInput");
  const fontSizeInput = document.getElementById("fontSizeInput");
  const opacityInput = document.getElementById("opacityInput");
  const rotationInput = document.getElementById("rotationInput");
  const placementSelect = document.getElementById("placementSelect");
  const marginInput = document.getElementById("marginInput");
  const boldInput = document.getElementById("boldInput");
  const italicInput = document.getElementById("italicInput");
  const applyAllPagesInput = document.getElementById("applyAllPagesInput");

  const colorDots = document.querySelectorAll(".color-dot[data-color]");
  const customColorBtn = document.getElementById("customColorBtn");
  const customColorInput = document.getElementById("customColorInput");

  const prevPageBtn = document.getElementById("prevPageBtn");
  const nextPageBtn = document.getElementById("nextPageBtn");
  const pageNumberInput = document.getElementById("pageNumberInput");
  const pageCountLabel = document.getElementById("pageCountLabel");
  const fitWidthBtn = document.getElementById("fitWidthBtn");

  const thumbList = document.getElementById("thumbList");
  const previewStage = document.getElementById("previewStage");
  const pagePreview = document.getElementById("pagePreview");
  const previewCanvas = document.getElementById("previewCanvas");
  const watermarkOverlay = document.getElementById("watermarkOverlay");

  const addWatermarkBtn = document.getElementById("addWatermarkBtn");
  const downloadBtn = document.getElementById("downloadBtn");

  const progressWrap = document.getElementById("progressWrap");
  const progressBar = document.getElementById("progressBar");
  const progressText = document.getElementById("progressText");
  const toolMessage = document.getElementById("toolMessage");

  let selectedFile = null;
  let selectedFileBuffer = null;
  let customFontFile = null;
  let pdfDocument = null;
  let pageCount = 0;
  let currentPage = 1;
  let previewScale = 1;
  let selectedColor = "#ef4444";
  let currentDownloadUrl = null;
  let isRendering = false;

  if (
    !dropZone ||
    !fileInput ||
    !selectFileBtn ||
    !selectedPanel ||
    !previewCanvas ||
    !watermarkOverlay ||
    !thumbList
  ) {
    console.error("PDF Merkezi: PDF Filigran HTML elemanları bulunamadı.");
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

  [
    watermarkTextInput,
    fontFamilySelect,
    fontSizeInput,
    opacityInput,
    rotationInput,
    placementSelect,
    marginInput,
    boldInput,
    italicInput,
    applyAllPagesInput
  ].forEach(function (input) {
    input.addEventListener("input", handleSettingsChange);
    input.addEventListener("change", handleSettingsChange);
  });

  customFontInput.addEventListener("change", function (event) {
    customFontFile = event.target.files?.[0] || null;
    resetOutput();

    if (customFontFile) {
      const lowerName = customFontFile.name.toLowerCase();

      if (!lowerName.endsWith(".ttf") && !lowerName.endsWith(".otf")) {
        customFontInput.value = "";
        customFontFile = null;
        setMessage("Özel font için yalnızca .ttf veya .otf dosyası seçmelisin.", "error");
        return;
      }

      setMessage(`${customFontFile.name} özel font olarak seçildi.`, "success");
    }

    updateFontInputState();
    updatePreviewOverlay();
    updateActionState();
  });

  colorDots.forEach(function (dot) {
    dot.addEventListener("click", function () {
      selectColor(dot.dataset.color, dot);
    });
  });

  customColorBtn.addEventListener("click", function () {
    customColorInput.click();
  });

  customColorInput.addEventListener("input", function () {
    selectedColor = customColorInput.value;
    colorDots.forEach(function (dot) {
      dot.classList.remove("is-active");
    });
    customColorBtn.classList.add("is-active");
    customColorBtn.style.setProperty("--dot-color", selectedColor);
    resetOutput();
    updatePreviewOverlay();
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

  addWatermarkBtn.addEventListener("click", addWatermarkToPdf);

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
    addWatermarkBtn.disabled = true;

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
      setMessage("PDF hazır. Filigranı canlı önizlemede ayarlayıp PDF’e işleyebilirsin.", "success");

      updateActionState();

      setTimeout(function () {
        progressWrap.hidden = true;
      }, 800);
    } catch (error) {
      console.error("PDF filigran hazırlama hatası:", error);

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

      updatePreviewOverlay();
      setCurrentPage(currentPage);
      updateToolbarState();

      if (showMessage) {
        setMessage("PDF önizleme genişliğe sığdırıldı.", "success");
      }
    } catch (error) {
      console.error("PDF önizleme render hatası:", error);
      setMessage("PDF önizleme hazırlanırken bir sorun oluştu.", "error");
    } finally {
      isRendering = false;
      updateToolbarState();
    }
  }

  function updatePreviewOverlay() {
    watermarkOverlay.innerHTML = "";

    const settings = getSettings(false);
    if (!settings.valid) return;

    watermarkOverlay.style.width = `${previewCanvas.width}px`;
    watermarkOverlay.style.height = `${previewCanvas.height}px`;

    if (settings.placement === "tile") {
      renderTiledPreview(settings);
    } else {
      renderSinglePreview(settings);
    }
  }

  function renderSinglePreview(settings) {
    const item = createPreviewWatermarkItem(settings);

    const position = getPreviewPosition(settings.placement);

    item.style.left = position.left;
    item.style.top = position.top;
    item.style.right = position.right || "auto";
    item.style.bottom = position.bottom || "auto";
    item.style.transform = `${position.translate || ""} rotate(${settings.rotation}deg)`;

    watermarkOverlay.appendChild(item);
  }

  function renderTiledPreview(settings) {
    const stageWidth = previewCanvas.width;
    const stageHeight = previewCanvas.height;
    const stepX = Math.max(180, settings.fontSize * previewScale * 4);
    const stepY = Math.max(120, settings.fontSize * previewScale * 2.4);

    for (let y = -80; y < stageHeight + 120; y += stepY) {
      for (let x = -80; x < stageWidth + 160; x += stepX) {
        const item = createPreviewWatermarkItem(settings);
        item.style.left = `${x}px`;
        item.style.top = `${y}px`;
        item.style.transform = `rotate(${settings.rotation}deg)`;
        watermarkOverlay.appendChild(item);
      }
    }
  }

  function createPreviewWatermarkItem(settings) {
    const item = document.createElement("span");

    item.className = "watermark-preview-text";
    item.textContent = settings.text;
    item.style.color = settings.color === "transparent" ? "transparent" : settings.color;
    item.style.opacity = String(settings.opacity / 100);
    item.style.fontSize = `${Math.max(10, settings.fontSize * previewScale)}px`;
    item.style.fontWeight = settings.bold ? "900" : "700";
    item.style.fontStyle = settings.italic ? "italic" : "normal";
    item.style.fontFamily = getPreviewFontFamily(settings.fontFamily);
    item.style.pointerEvents = "none";

    return item;
  }

  function getPreviewPosition(placement) {
    const margin = Number(marginInput.value || 42) * previewScale;

    const positions = {
      "center": {
        left: "50%",
        top: "50%",
        translate: "translate(-50%, -50%)"
      },
      "diagonal": {
        left: "50%",
        top: "50%",
        translate: "translate(-50%, -50%)"
      },
      "top-left": {
        left: `${margin}px`,
        top: `${margin}px`
      },
      "top-right": {
        right: `${margin}px`,
        top: `${margin}px`
      },
      "bottom-left": {
        left: `${margin}px`,
        bottom: `${margin}px`
      },
      "bottom-right": {
        right: `${margin}px`,
        bottom: `${margin}px`
      }
    };

    return positions[placement] || positions.diagonal;
  }

  async function addWatermarkToPdf() {
    if (!selectedFile || !selectedFileBuffer || !pageCount) {
      setMessage("Lütfen önce bir PDF dosyası seç.", "warning");
      return;
    }

    const settings = getSettings(true);

    if (!settings.valid) {
      setMessage(settings.message, "error");
      return;
    }

    resetOutput();
    setBusy(true);
    updateProgress(10, "PDF hazırlanıyor...");

    try {
      const { PDFDocument, rgb, degrees } = window.PDFLib;

      const pdfDoc = await PDFDocument.load(selectedFileBuffer.slice(0), {
        ignoreEncryption: false
      });

      const font = await loadSelectedFont(pdfDoc, settings);
      const pages = pdfDoc.getPages();
      const color = settings.color === "transparent"
        ? rgb(0, 0, 0)
        : rgb(settings.rgb.r, settings.rgb.g, settings.rgb.b);

      const targetIndexes = settings.applyAllPages
        ? pages.map(function (_, index) { return index; })
        : [currentPage - 1];

      updateProgress(35, "Filigran PDF’e işleniyor...");

      targetIndexes.forEach(function (pageIndex) {
        const page = pages[pageIndex];
        if (!page) return;

        const pageSize = page.getSize();

        if (settings.placement === "tile") {
          drawTiledWatermark(page, settings, font, color, degrees, pageSize);
        } else {
          drawSingleWatermark(page, settings, font, color, degrees, pageSize);
        }
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

      updateProgress(100, "PDF başarıyla filigranlandı.");
      setMessage("Hazır! Filigran eklenmiş PDF dosyanı indirebilirsin.", "success");
    } catch (error) {
      console.error("Filigran ekleme hatası:", error);

      const errorMessage = String(error?.message || "").toLowerCase();

      if (errorMessage.includes("fontkit") || errorMessage.includes("font")) {
        setMessage("Özel font PDF’e eklenemedi. Farklı bir .ttf veya .otf font dosyası dene.", "error");
      } else if (errorMessage.includes("encrypted") || errorMessage.includes("password")) {
        setMessage("Şifreli PDF dosyası düzenlenemedi. Lütfen şifresiz PDF dosyası dene.", "error");
      } else {
        setMessage("Filigran eklenirken bir sorun oluştu. Dosya bozuk, şifreli veya çok büyük olabilir.", "error");
      }

      updateProgress(0, "İşlem başarısız oldu.");
    } finally {
      setBusy(false);
    }
  }

  function drawSingleWatermark(page, settings, font, color, degrees, pageSize) {
    const textWidth = font.widthOfTextAtSize(settings.text, settings.fontSize);
    const textHeight = settings.fontSize;
    const position = getPdfPosition(
      settings.placement,
      pageSize.width,
      pageSize.height,
      textWidth,
      textHeight,
      settings.margin
    );

    page.drawText(settings.text, {
      x: position.x,
      y: position.y,
      size: settings.fontSize,
      font: font,
      color: color,
      opacity: settings.color === "transparent" ? 0 : settings.opacity / 100,
      rotate: degrees(-settings.rotation)
    });
  }

  function drawTiledWatermark(page, settings, font, color, degrees, pageSize) {
    const textWidth = font.widthOfTextAtSize(settings.text, settings.fontSize);
    const gapX = Math.max(220, textWidth + 120);
    const gapY = Math.max(150, settings.fontSize + 90);

    for (let y = -80; y < pageSize.height + 140; y += gapY) {
      for (let x = -80; x < pageSize.width + 180; x += gapX) {
        page.drawText(settings.text, {
          x: x,
          y: y,
          size: settings.fontSize,
          font: font,
          color: color,
          opacity: settings.color === "transparent" ? 0 : settings.opacity / 100,
          rotate: degrees(-settings.rotation)
        });
      }
    }
  }

  function getPdfPosition(placement, pageWidth, pageHeight, textWidth, textHeight, margin) {
    const center = {
      x: (pageWidth - textWidth) / 2,
      y: (pageHeight - textHeight) / 2
    };

    const positions = {
      "center": center,
      "diagonal": center,
      "top-left": {
        x: margin,
        y: pageHeight - margin - textHeight
      },
      "top-right": {
        x: pageWidth - textWidth - margin,
        y: pageHeight - margin - textHeight
      },
      "bottom-left": {
        x: margin,
        y: margin + textHeight
      },
      "bottom-right": {
        x: pageWidth - textWidth - margin,
        y: margin + textHeight
      }
    };

    return positions[placement] || center;
  }

  async function loadSelectedFont(pdfDoc, settings) {
    const { StandardFonts } = window.PDFLib;

    if (settings.fontFamily === "custom") {
      if (!window.fontkit) {
        throw new Error("fontkit yüklenemedi.");
      }

      if (!customFontFile) {
        throw new Error("Özel font seçilmedi.");
      }

      pdfDoc.registerFontkit(window.fontkit);

      const fontBytes = await customFontFile.arrayBuffer();

      return pdfDoc.embedFont(fontBytes, {
        subset: true
      });
    }

    return pdfDoc.embedFont(getStandardFontName(settings.fontFamily, settings.bold, settings.italic));
  }

  function getStandardFontName(fontFamily, isBold, isItalic) {
    const { StandardFonts } = window.PDFLib;

    if (fontFamily === "times") {
      if (isBold && isItalic) return StandardFonts.TimesRomanBoldItalic;
      if (isBold) return StandardFonts.TimesRomanBold;
      if (isItalic) return StandardFonts.TimesRomanItalic;
      return StandardFonts.TimesRoman;
    }

    if (fontFamily === "courier") {
      if (isBold && isItalic) return StandardFonts.CourierBoldOblique;
      if (isBold) return StandardFonts.CourierBold;
      if (isItalic) return StandardFonts.CourierOblique;
      return StandardFonts.Courier;
    }

    if (isBold && isItalic) return StandardFonts.HelveticaBoldOblique;
    if (isBold) return StandardFonts.HelveticaBold;
    if (isItalic) return StandardFonts.HelveticaOblique;
    return StandardFonts.Helvetica;
  }

  function getSettings(validateCustomFont) {
    const text = String(watermarkTextInput.value || "").trim();
    const fontFamily = fontFamilySelect.value;
    const fontSize = Number(fontSizeInput.value);
    const opacity = Number(opacityInput.value);
    const rotation = Number(rotationInput.value);
    const placement = placementSelect.value;
    const margin = Number(marginInput.value);
    const bold = boldInput.checked;
    const italic = italicInput.checked;
    const applyAllPages = applyAllPagesInput.checked;
    const rgbValue = selectedColor === "transparent" ? null : hexToRgb(selectedColor);

    if (!text) {
      return {
        valid: false,
        message: "Lütfen filigran metni yaz."
      };
    }

    if (!Number.isFinite(fontSize) || fontSize < 10 || fontSize > 180) {
      return {
        valid: false,
        message: "Yazı boyutu 10 ile 180 arasında olmalı."
      };
    }

    if (!Number.isFinite(opacity) || opacity < 5 || opacity > 100) {
      return {
        valid: false,
        message: "Şeffaflık 5 ile 100 arasında olmalı."
      };
    }

    if (!Number.isFinite(rotation) || rotation < -90 || rotation > 90) {
      return {
        valid: false,
        message: "Açı -90 ile 90 arasında olmalı."
      };
    }

    if (!Number.isFinite(margin) || margin < 8 || margin > 180) {
      return {
        valid: false,
        message: "Kenar boşluğu 8 ile 180 arasında olmalı."
      };
    }

    if (validateCustomFont && fontFamily === "custom" && !customFontFile) {
      return {
        valid: false,
        message: "Özel font seçeneği aktif. Lütfen .ttf veya .otf font dosyası seç."
      };
    }

    return {
      valid: true,
      text: fontFamily === "custom" ? text : normalizeTextForStandardPdfFont(text),
      originalText: text,
      fontFamily,
      fontSize,
      opacity,
      rotation,
      placement,
      margin,
      bold: fontFamily === "symbol" || fontFamily === "zapf" ? false : bold,
      italic: fontFamily === "symbol" || fontFamily === "zapf" ? false : italic,
      applyAllPages,
      color: selectedColor,
      rgb: rgbValue || { r: 0, g: 0, b: 0 }
    };
  }

  function handleSettingsChange() {
    resetOutput();
    updateFontInputState();
    updatePreviewOverlay();
    updateActionState();
  }

  function updateFontInputState() {
    const isCustom = fontFamilySelect.value === "custom";
    const isSymbolic = fontFamilySelect.value === "symbol" || fontFamilySelect.value === "zapf";

    customFontInput.disabled = !isCustom;

    if (!isCustom) {
      customFontInput.value = "";
      customFontFile = null;
    }

    boldInput.disabled = isSymbolic;
    italicInput.disabled = isSymbolic;

    if (isSymbolic) {
      boldInput.checked = false;
      italicInput.checked = false;
    }
  }

  function selectColor(color, dot) {
    selectedColor = color;

    colorDots.forEach(function (item) {
      item.classList.remove("is-active");
    });

    customColorBtn.classList.remove("is-active");
    dot.classList.add("is-active");

    resetOutput();
    updatePreviewOverlay();
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
    addWatermarkBtn.disabled = !(selectedFile && selectedFileBuffer && pageCount > 0);
  }

  function setBusy(isBusy) {
    addWatermarkBtn.disabled = isBusy;

    if (!isBusy) {
      updateActionState();
    }

    [
      clearFileBtn,
      selectFileBtn,
      watermarkTextInput,
      fontFamilySelect,
      customFontInput,
      fontSizeInput,
      opacityInput,
      rotationInput,
      placementSelect,
      marginInput,
      boldInput,
      italicInput,
      applyAllPagesInput,
      prevPageBtn,
      nextPageBtn,
      pageNumberInput,
      fitWidthBtn
    ].forEach(function (input) {
      if (!input) return;
      input.disabled = isBusy || (input === customFontInput && fontFamilySelect.value !== "custom");
    });

    colorDots.forEach(function (dot) {
      dot.disabled = isBusy;
    });

    customColorBtn.disabled = isBusy;
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
    watermarkOverlay.innerHTML = "";

    const context = previewCanvas.getContext("2d");
    context.clearRect(0, 0, previewCanvas.width, previewCanvas.height);

    previewCanvas.width = 0;
    previewCanvas.height = 0;

    pagePreview.removeAttribute("style");

    viewerFileName.textContent = "PDF Filigran";
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
    return `${fileName}-filigranli.pdf`;
  }

  function getPreviewFontFamily(fontFamily) {
    if (fontFamily === "times") return "Times New Roman, Times, serif";
    if (fontFamily === "courier") return "Courier New, Courier, monospace";
    if (fontFamily === "symbol") return "serif";
    if (fontFamily === "zapf") return "cursive";
    if (fontFamily === "custom") return "Arial, sans-serif";
    return "Arial, Helvetica, sans-serif";
  }


  function normalizeTextForStandardPdfFont(text) {
    return String(text || "")
      .replaceAll("Ğ", "G")
      .replaceAll("ğ", "g")
      .replaceAll("Ü", "U")
      .replaceAll("ü", "u")
      .replaceAll("Ş", "S")
      .replaceAll("ş", "s")
      .replaceAll("İ", "I")
      .replaceAll("ı", "i")
      .replaceAll("Ö", "O")
      .replaceAll("ö", "o")
      .replaceAll("Ç", "C")
      .replaceAll("ç", "c")
      .replace(/[^\x20-\x7E]/g, "");
  }


  function hexToRgb(hex) {
    const cleanHex = String(hex || "#ef4444").replace("#", "");

    const r = parseInt(cleanHex.substring(0, 2), 16) / 255;
    const g = parseInt(cleanHex.substring(2, 4), 16) / 255;
    const b = parseInt(cleanHex.substring(4, 6), 16) / 255;

    return {
      r: Number.isFinite(r) ? r : 0.94,
      g: Number.isFinite(g) ? g : 0.26,
      b: Number.isFinite(b) ? b : 0.26
    };
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

  updateFontInputState();
  updateToolbarState();
  updateActionState();
})();