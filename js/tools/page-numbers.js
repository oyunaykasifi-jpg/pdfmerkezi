(function () {
  const utils = window.PDFMerkezi?.utils;

  const dropZone = document.getElementById("dropZone");
  const fileInput = document.getElementById("pdfFile");
  const selectFileBtn = document.getElementById("selectFileBtn");
  const selectedPanel = document.getElementById("selectedPanel");
  const fileSummary = document.getElementById("fileSummary");
  const clearFileBtn = document.getElementById("clearFileBtn");

  const positionSelect = document.getElementById("positionSelect");
  const startNumberInput = document.getElementById("startNumberInput");
  const fontSizeInput = document.getElementById("fontSizeInput");
  const marginInput = document.getElementById("marginInput");
  const fontFamilySelect = document.getElementById("fontFamilySelect");
  const customFontInput = document.getElementById("customFontInput");
  const colorInput = document.getElementById("colorInput");
  const opacityInput = document.getElementById("opacityInput");
  const boldInput = document.getElementById("boldInput");
  const italicInput = document.getElementById("italicInput");
  const formatInput = document.getElementById("formatInput");
  const previewText = document.getElementById("previewText");

  const addNumbersBtn = document.getElementById("addNumbersBtn");
  const downloadBtn = document.getElementById("downloadBtn");

  const progressWrap = document.getElementById("progressWrap");
  const progressBar = document.getElementById("progressBar");
  const progressText = document.getElementById("progressText");
  const toolMessage = document.getElementById("toolMessage");

  let selectedFile = null;
  let selectedFileBuffer = null;
  let customFontFile = null;
  let pageCount = 0;
  let currentDownloadUrl = null;

  if (
    !dropZone ||
    !fileInput ||
    !selectFileBtn ||
    !selectedPanel ||
    !addNumbersBtn ||
    !downloadBtn
  ) {
    console.error("PDF Merkezi: PDF Sayfa Numarası HTML elemanları bulunamadı.");
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
    positionSelect,
    startNumberInput,
    fontSizeInput,
    marginInput,
    fontFamilySelect,
    colorInput,
    opacityInput,
    boldInput,
    italicInput,
    formatInput
  ].forEach(function (input) {
    input.addEventListener("input", function () {
      resetOutput();
      updateFontInputState();
      updatePreview();
      updateActionState();
    });

    input.addEventListener("change", function () {
      resetOutput();
      updateFontInputState();
      updatePreview();
      updateActionState();
    });
  });

  customFontInput.addEventListener("change", function (event) {
    customFontFile = event.target.files?.[0] || null;
    resetOutput();
    updatePreview();
    updateActionState();

    if (customFontFile) {
      const fileName = customFontFile.name.toLowerCase();

      if (!fileName.endsWith(".ttf") && !fileName.endsWith(".otf")) {
        setMessage("Özel font için yalnızca .ttf veya .otf dosyası seçmelisin.", "error");
        customFontInput.value = "";
        customFontFile = null;
        return;
      }

      setMessage(`${customFontFile.name} özel font olarak seçildi.`, "success");
    }
  });

  addNumbersBtn.addEventListener("click", addPageNumbers);

  async function handleFile(file) {
    resetOutput();
    clearMessage();

    selectedFile = null;
    selectedFileBuffer = null;
    pageCount = 0;

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

    if (!window.PDFLib?.PDFDocument) {
      setMessage("PDF işlem motoru yüklenemedi. İnternet bağlantını kontrol edip Ctrl + F5 ile yenile.", "error");
      return;
    }

    selectedFile = file;
    selectedPanel.hidden = false;
    fileSummary.textContent = `${file.name} seçildi. Sayfa sayısı okunuyor...`;
    addNumbersBtn.disabled = true;

    try {
      updateProgress(20, "PDF sayfa sayısı okunuyor...");

      selectedFileBuffer = await file.arrayBuffer();

      const sourcePdf = await window.PDFLib.PDFDocument.load(selectedFileBuffer.slice(0), {
        ignoreEncryption: false
      });

      pageCount = sourcePdf.getPageCount();

      if (pageCount < 1) {
        throw new Error("PDF içinde sayfa bulunamadı.");
      }

      fileSummary.textContent = `${file.name} seçildi. Toplam ${pageCount} sayfa bulundu.`;
      updateProgress(100, "PDF hazır.");

      setMessage("PDF hazır. Sayfa numarası ayarlarını seçip işlemi başlatabilirsin.", "success");
      updatePreview();
      updateActionState();

      setTimeout(function () {
        progressWrap.hidden = true;
      }, 700);
    } catch (error) {
      console.error("PDF okuma hatası:", error);

      selectedFile = null;
      selectedFileBuffer = null;
      pageCount = 0;
      addNumbersBtn.disabled = true;

      const errorMessage = String(error?.message || "").toLowerCase();

      if (errorMessage.includes("encrypted") || errorMessage.includes("password")) {
        setMessage("Şifreli PDF dosyası okunamadı. Lütfen şifresiz PDF dosyası dene.", "error");
      } else {
        setMessage("PDF okunamadı. Dosya bozuk, şifreli veya çok büyük olabilir.", "error");
      }

      updateProgress(0, "İşlem başarısız oldu.");
    }
  }

  async function addPageNumbers() {
    if (!selectedFile || !selectedFileBuffer || !pageCount) {
      setMessage("Lütfen önce bir PDF dosyası seç.", "warning");
      return;
    }

    const settings = getSettings();

    if (!settings.valid) {
      setMessage(settings.message, "error");
      return;
    }

    resetOutput();
    setBusy(true);
    updateProgress(10, "PDF hazırlanıyor...");

    try {
      const {
        PDFDocument,
        rgb
      } = window.PDFLib;

      const pdfDoc = await PDFDocument.load(selectedFileBuffer.slice(0), {
        ignoreEncryption: false
      });

      const font = await loadSelectedFont(pdfDoc, settings);

      const pages = pdfDoc.getPages();
      const total = pages.length;
      const color = hexToRgb(settings.color);
      const opacity = settings.opacity / 100;

      updateProgress(35, "Sayfa numaraları ekleniyor...");

      pages.forEach(function (page, index) {
        const pageNumber = settings.startNumber + index;

        const text = settings.format
          .replaceAll("{n}", String(pageNumber))
          .replaceAll("{total}", String(total));

        const finalText = settings.syntheticBold && !settings.usesCustomFont
          ? text
          : text;

        const pageSize = page.getSize();
        const textWidth = font.widthOfTextAtSize(finalText, settings.fontSize);
        const textHeight = settings.fontSize;

        const position = calculatePosition(
          settings.position,
          pageSize.width,
          pageSize.height,
          textWidth,
          textHeight,
          settings.margin
        );

        drawStyledText(page, finalText, {
          x: position.x,
          y: position.y,
          size: settings.fontSize,
          font: font,
          color: rgb(color.r, color.g, color.b),
          opacity: opacity,
          syntheticBold: settings.syntheticBold,
          syntheticItalic: settings.syntheticItalic
        });
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

      updateProgress(100, "PDF başarıyla numaralandırıldı.");
      setMessage("Hazır! Sayfa numarası eklenmiş PDF dosyanı indirebilirsin.", "success");
    } catch (error) {
      console.error("Sayfa numarası ekleme hatası:", error);

      const errorMessage = String(error?.message || "").toLowerCase();

      if (errorMessage.includes("fontkit") || errorMessage.includes("font")) {
        setMessage("Özel font PDF’e eklenemedi. Farklı bir .ttf veya .otf font dosyası dene.", "error");
      } else if (errorMessage.includes("encrypted") || errorMessage.includes("password")) {
        setMessage("Şifreli PDF dosyası düzenlenemedi. Lütfen şifresiz PDF dosyası dene.", "error");
      } else {
        setMessage("Sayfa numarası eklenirken bir sorun oluştu. Dosya bozuk, şifreli veya çok büyük olabilir.", "error");
      }

      updateProgress(0, "İşlem başarısız oldu.");
    } finally {
      setBusy(false);
    }
  }

  async function loadSelectedFont(pdfDoc, settings) {
    const {
      StandardFonts
    } = window.PDFLib;

    if (settings.usesCustomFont) {
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

    const fontName = getStandardFontName(settings.fontFamily, settings.bold, settings.italic);

    return pdfDoc.embedFont(fontName);
  }

  function getStandardFontName(fontFamily, isBold, isItalic) {
    const {
      StandardFonts
    } = window.PDFLib;

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

  function drawStyledText(page, text, options) {
    const baseOptions = {
      x: options.x,
      y: options.y,
      size: options.size,
      font: options.font,
      color: options.color,
      opacity: options.opacity
    };

    if (options.syntheticItalic) {
      page.drawText(text, {
        ...baseOptions,
        skew: {
          x: degreesSafe(10),
          y: degreesSafe(0)
        }
      });
    } else {
      page.drawText(text, baseOptions);
    }

    if (options.syntheticBold) {
      page.drawText(text, {
        ...baseOptions,
        x: options.x + 0.45
      });
    }
  }

  function degreesSafe(value) {
    if (window.PDFLib?.degrees) {
      return window.PDFLib.degrees(value);
    }

    return value;
  }

  function getSettings() {
    const position = positionSelect.value;
    const startNumber = Number(startNumberInput.value);
    const fontSize = Number(fontSizeInput.value);
    const margin = Number(marginInput.value);
    const fontFamily = fontFamilySelect.value;
    const color = colorInput.value;
    const opacity = Number(opacityInput.value);
    const bold = boldInput.checked;
    const italic = italicInput.checked;
    const format = String(formatInput.value || "").trim();
    const usesCustomFont = fontFamily === "custom";

    if (!Number.isInteger(startNumber) || startNumber < 0) {
      return {
        valid: false,
        message: "Başlangıç numarası 0 veya daha büyük bir tam sayı olmalı."
      };
    }

    if (!Number.isFinite(fontSize) || fontSize < 8 || fontSize > 96) {
      return {
        valid: false,
        message: "Yazı boyutu 8 ile 96 arasında olmalı."
      };
    }

    if (!Number.isFinite(margin) || margin < 8 || margin > 160) {
      return {
        valid: false,
        message: "Kenar boşluğu 8 ile 160 arasında olmalı."
      };
    }

    if (!Number.isFinite(opacity) || opacity < 10 || opacity > 100) {
      return {
        valid: false,
        message: "Opaklık 10 ile 100 arasında olmalı."
      };
    }

    if (!format || !format.includes("{n}")) {
      return {
        valid: false,
        message: "Numara biçimi en az {n} ifadesini içermeli."
      };
    }

    if (usesCustomFont && !customFontFile) {
      return {
        valid: false,
        message: "Özel font seçeneği aktif. Lütfen .ttf veya .otf font dosyası seç."
      };
    }

    return {
      valid: true,
      position,
      startNumber,
      fontSize,
      margin,
      fontFamily,
      color,
      opacity,
      bold,
      italic,
      format,
      usesCustomFont,
      syntheticBold: usesCustomFont && bold,
      syntheticItalic: usesCustomFont && italic
    };
  }

  function calculatePosition(position, pageWidth, pageHeight, textWidth, textHeight, margin) {
    const verticalOffset = Math.max(margin, textHeight + 8);

    const positions = {
      "bottom-left": {
        x: margin,
        y: verticalOffset
      },
      "bottom-center": {
        x: (pageWidth - textWidth) / 2,
        y: verticalOffset
      },
      "bottom-right": {
        x: pageWidth - textWidth - margin,
        y: verticalOffset
      },
      "top-left": {
        x: margin,
        y: pageHeight - margin - textHeight
      },
      "top-center": {
        x: (pageWidth - textWidth) / 2,
        y: pageHeight - margin - textHeight
      },
      "top-right": {
        x: pageWidth - textWidth - margin,
        y: pageHeight - margin - textHeight
      }
    };

    return positions[position] || positions["bottom-center"];
  }

  function updateFontInputState() {
    const usesCustomFont = fontFamilySelect.value === "custom";

    customFontInput.disabled = !usesCustomFont;

    if (!usesCustomFont) {
      customFontInput.value = "";
      customFontFile = null;
    }
  }

  function updatePreview() {
    const startNumber = Number(startNumberInput.value);
    const total = pageCount || 10;
    const format = String(formatInput.value || "{n}");
    const previewNumber = Number.isFinite(startNumber) ? startNumber : 1;

    previewText.textContent = format
      .replaceAll("{n}", String(previewNumber))
      .replaceAll("{total}", String(total));

    previewText.style.color = colorInput.value;
    previewText.style.opacity = String(Number(opacityInput.value || 100) / 100);
    previewText.style.fontWeight = boldInput.checked ? "900" : "700";
    previewText.style.fontStyle = italicInput.checked ? "italic" : "normal";
    previewText.style.fontSize = `${Math.min(28, Math.max(12, Number(fontSizeInput.value || 12)))}px`;

    const family = fontFamilySelect.value;

    if (family === "times") {
      previewText.style.fontFamily = "Times New Roman, serif";
    } else if (family === "courier") {
      previewText.style.fontFamily = "Courier New, monospace";
    } else {
      previewText.style.fontFamily = "Arial, sans-serif";
    }
  }

  function updateActionState() {
    addNumbersBtn.disabled = !(selectedFile && selectedFileBuffer && pageCount > 0);
  }

  function buildOutputFileName() {
    const fileName = utils.sanitizeFileName(selectedFile?.name || "pdf");
    return `${fileName}-sayfa-numarali.pdf`;
  }

  function clearFile() {
    selectedFile = null;
    selectedFileBuffer = null;
    pageCount = 0;

    fileInput.value = "";
    selectedPanel.hidden = true;
    fileSummary.textContent = "Seçilen PDF dosyası hazırlanıyor.";

    resetOutput();
    clearMessage();
    updateActionState();
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

  function setBusy(isBusy) {
    addNumbersBtn.disabled = isBusy;

    if (!isBusy) {
      updateActionState();
    }

    clearFileBtn.disabled = isBusy;
    selectFileBtn.disabled = isBusy;

    [
      positionSelect,
      startNumberInput,
      fontSizeInput,
      marginInput,
      fontFamilySelect,
      customFontInput,
      colorInput,
      opacityInput,
      boldInput,
      italicInput,
      formatInput
    ].forEach(function (input) {
      input.disabled = isBusy || (input === customFontInput && fontFamilySelect.value !== "custom");
    });
  }

  function hexToRgb(hex) {
    const cleanHex = String(hex || "#1f2937").replace("#", "");

    const r = parseInt(cleanHex.substring(0, 2), 16) / 255;
    const g = parseInt(cleanHex.substring(2, 4), 16) / 255;
    const b = parseInt(cleanHex.substring(4, 6), 16) / 255;

    return {
      r: Number.isFinite(r) ? r : 0.12,
      g: Number.isFinite(g) ? g : 0.16,
      b: Number.isFinite(b) ? b : 0.23
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

  updateFontInputState();
  updatePreview();
  updateActionState();
})();