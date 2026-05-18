(function () {
  const utils = window.PDFMerkezi?.utils;

  const dropZone = document.getElementById("dropZone");
  const fileInput = document.getElementById("txtFile");
  const selectFileBtn = document.getElementById("selectFileBtn");
  const selectedPanel = document.getElementById("selectedPanel");

  const selectedFileName = document.getElementById("selectedFileName");
  const selectedFileMeta = document.getElementById("selectedFileMeta");
  const clearFileBtn = document.getElementById("clearFileBtn");

  const pageSizeSelect = document.getElementById("pageSizeSelect");
  const fontSizeSelect = document.getElementById("fontSizeSelect");
  const marginSelect = document.getElementById("marginSelect");

  const textInput = document.getElementById("textInput");
  const textSummary = document.getElementById("textSummary");

  const convertBtn = document.getElementById("convertBtn");
  const downloadBtn = document.getElementById("downloadBtn");

  const progressWrap = document.getElementById("progressWrap");
  const progressBar = document.getElementById("progressBar");
  const progressText = document.getElementById("progressText");
  const toolMessage = document.getElementById("toolMessage");

  let selectedFile = null;
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
    !fontSizeSelect ||
    !marginSelect ||
    !textInput ||
    !textSummary ||
    !convertBtn ||
    !downloadBtn
  ) {
    console.error("PDF Merkezi: TXT PDF gerekli HTML elemanları bulunamadı.");
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
  convertBtn.addEventListener("click", convertTextToPdf);

  [pageSizeSelect, fontSizeSelect, marginSelect, textInput].forEach(function (input) {
    input.addEventListener("input", function () {
      resetOutput();
      updateTextSummary();
    });

    input.addEventListener("change", function () {
      resetOutput();
      updateTextSummary();
    });
  });

  async function handleFile(file) {
    clearMessage();
    resetOutput();

    selectedFile = null;

    if (!file) {
      setMessage("Lütfen bir TXT dosyası seç.", "warning");
      return;
    }

    if (!isTxtFile(file)) {
      setMessage("TXT dosyası algılanamadı. Lütfen .txt uzantılı geçerli bir dosya seç.", "error");
      return;
    }

    selectedFile = file;
    selectedPanel.hidden = false;
    selectedFileName.textContent = file.name;
    selectedFileMeta.textContent = "TXT dosyası okunuyor...";

    try {
      updateProgress(20, "TXT dosyası okunuyor...");

      const text = await readFileAsText(file);

      textInput.value = text;
      selectedFileMeta.textContent = `${utils.formatBytes(file.size)} • PDF’e dönüştürmeye hazır`;

      updateTextSummary();
      updateProgress(100, "TXT hazır.");
      setMessage("TXT dosyası hazır. PDF dosyasını oluşturabilirsin.", "success");

      setTimeout(function () {
        progressWrap.hidden = true;
      }, 700);
    } catch (error) {
      console.error("TXT okuma hatası:", error);
      selectedFile = null;
      selectedFileMeta.textContent = "TXT okunamadı.";
      setMessage("TXT dosyası okunamadı. Farklı bir metin dosyası dene.", "error");
      updateProgress(0, "İşlem başarısız oldu.");
    }
  }

  async function convertTextToPdf() {
    const rawText = textInput.value || "";

    if (!rawText.trim()) {
      setMessage("PDF oluşturmak için metin alanı boş olmamalı.", "warning");
      return;
    }

    resetOutput();

    convertBtn.disabled = true;
    clearFileBtn.disabled = true;
    pageSizeSelect.disabled = true;
    fontSizeSelect.disabled = true;
    marginSelect.disabled = true;
    textInput.disabled = true;

    try {
      updateProgress(10, "PDF oluşturuluyor...");

      const { PDFDocument, StandardFonts, rgb } = window.PDFLib;
      const pdfDoc = await PDFDocument.create();
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

      const pageSize = getPageSize();
      const fontSize = Number(fontSizeSelect.value) || 12;
      const margin = Number(marginSelect.value) || 54;
      const lineHeight = fontSize * 1.45;
      const maxWidth = pageSize.width - margin * 2;

      const normalizedText = normalizeForStandardPdfFont(rawText);
      const paragraphs = normalizedText.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");

      let page = pdfDoc.addPage([pageSize.width, pageSize.height]);
      let cursorY = pageSize.height - margin;

      const drawLine = function (line) {
        if (cursorY - lineHeight < margin) {
          page = pdfDoc.addPage([pageSize.width, pageSize.height]);
          cursorY = pageSize.height - margin;
        }

        page.drawText(line || " ", {
          x: margin,
          y: cursorY - fontSize,
          size: fontSize,
          font,
          color: rgb(0.08, 0.12, 0.2)
        });

        cursorY -= lineHeight;
      };

      paragraphs.forEach(function (paragraph, index) {
        updateProgress(
          10 + Math.round((index / Math.max(1, paragraphs.length)) * 70),
          "Metin PDF sayfalarına yerleştiriliyor..."
        );

        if (!paragraph.trim()) {
          drawLine("");
          return;
        }

        const wrappedLines = wrapText(paragraph, font, fontSize, maxWidth);

        wrappedLines.forEach(function (line) {
          drawLine(line);
        });
      });

      updateProgress(88, "PDF kaydediliyor...");

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
      setMessage("Hazır! TXT dosyandan oluşturulan PDF’i indirebilirsin.", "success");

      setTimeout(function () {
        progressWrap.hidden = true;
      }, 900);
    } catch (error) {
      console.error("TXT PDF dönüştürme hatası:", error);
      setMessage("TXT PDF dönüştürme sırasında bir sorun oluştu. Metni sadeleştirip tekrar dene.", "error");
      updateProgress(0, "İşlem başarısız oldu.");
    } finally {
      convertBtn.disabled = false;
      clearFileBtn.disabled = false;
      pageSizeSelect.disabled = false;
      fontSizeSelect.disabled = false;
      marginSelect.disabled = false;
      textInput.disabled = false;
    }
  }

  function wrapText(text, font, fontSize, maxWidth) {
    const words = String(text || "").split(/\s+/);
    const lines = [];
    let currentLine = "";

    words.forEach(function (word) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      const testWidth = font.widthOfTextAtSize(testLine, fontSize);

      if (testWidth <= maxWidth) {
        currentLine = testLine;
        return;
      }

      if (currentLine) {
        lines.push(currentLine);
      }

      if (font.widthOfTextAtSize(word, fontSize) > maxWidth) {
        const broken = breakLongWord(word, font, fontSize, maxWidth);

        if (broken.length > 0) {
          lines.push(...broken.slice(0, -1));
          currentLine = broken[broken.length - 1];
        } else {
          currentLine = word;
        }

        return;
      }

      currentLine = word;
    });

    if (currentLine) {
      lines.push(currentLine);
    }

    return lines;
  }

  function breakLongWord(word, font, fontSize, maxWidth) {
    const parts = [];
    let current = "";

    Array.from(word).forEach(function (char) {
      const test = current + char;

      if (font.widthOfTextAtSize(test, fontSize) <= maxWidth) {
        current = test;
        return;
      }

      if (current) {
        parts.push(current);
      }

      current = char;
    });

    if (current) {
      parts.push(current);
    }

    return parts;
  }

  function normalizeForStandardPdfFont(text) {
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
      .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, "");
  }

  function getPageSize() {
    const value = pageSizeSelect.value;

    if (value === "letter") {
      return {
        width: 612,
        height: 792
      };
    }

    return {
      width: 595.28,
      height: 841.89
    };
  }

  function updateTextSummary() {
    const text = textInput.value || "";
    const characterCount = text.length;
    const lineCount = text ? text.split(/\r\n|\r|\n/).length : 0;

    textSummary.textContent = `${characterCount} karakter • ${lineCount} satır`;
  }

  function readFileAsText(file) {
    return new Promise(function (resolve, reject) {
      const reader = new FileReader();

      reader.onload = function () {
        resolve(String(reader.result || ""));
      };

      reader.onerror = function () {
        reject(reader.error);
      };

      reader.readAsText(file, "utf-8");
    });
  }

  function isTxtFile(file) {
    const name = String(file.name || "").toLowerCase();
    const type = String(file.type || "").toLowerCase();

    return (
      type === "text/plain" ||
      name.endsWith(".txt")
    );
  }

  function clearFile() {
    selectedFile = null;
    fileInput.value = "";
    selectedPanel.hidden = true;
    selectedFileName.textContent = "TXT dosyası seçildi";
    selectedFileMeta.textContent = "Dosya hazırlanıyor.";
    textInput.value = "";
    textSummary.textContent = "TXT içeriği burada görünecek.";

    resetOutput();
    clearMessage();

    if (progressWrap) {
      progressWrap.hidden = true;
    }

    updateProgress(0, "");
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

  function buildOutputFileName() {
    if (selectedFile) {
      return `${utils.sanitizeFileName(selectedFile.name)}.pdf`;
    }

    return "txt-pdf.pdf";
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
})();