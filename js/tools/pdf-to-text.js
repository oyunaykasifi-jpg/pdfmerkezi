(function () {
  const utils = window.PDFMerkezi?.utils;

  const dropZone = document.getElementById("dropZone");
  const fileInput = document.getElementById("pdfFile");
  const selectFileBtn = document.getElementById("selectFileBtn");
  const selectedPanel = document.getElementById("selectedPanel");

  const selectedFileName = document.getElementById("selectedFileName");
  const selectedFileMeta = document.getElementById("selectedFileMeta");
  const clearFileBtn = document.getElementById("clearFileBtn");

  const extractBtn = document.getElementById("extractBtn");
  const copyBtn = document.getElementById("copyBtn");
  const downloadBtn = document.getElementById("downloadBtn");

  const progressWrap = document.getElementById("progressWrap");
  const progressBar = document.getElementById("progressBar");
  const progressText = document.getElementById("progressText");

  const toolMessage = document.getElementById("toolMessage");

  const resultPanel = document.getElementById("resultPanel");
  const resultSummary = document.getElementById("resultSummary");
  const textOutput = document.getElementById("textOutput");

  let selectedFile = null;
  let selectedFileBuffer = null;
  let pdfDocument = null;
  let pageCount = 0;
  let currentDownloadUrl = null;
  let extractedText = "";

  if (
    !utils ||
    !dropZone ||
    !fileInput ||
    !selectFileBtn ||
    !selectedPanel ||
    !selectedFileName ||
    !selectedFileMeta ||
    !clearFileBtn ||
    !extractBtn ||
    !copyBtn ||
    !downloadBtn ||
    !resultPanel ||
    !textOutput
  ) {
    console.error("PDF Merkezi: PDF TXT gerekli HTML elemanları bulunamadı.");
    return;
  }

  if (!window.pdfjsLib) {
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
  extractBtn.addEventListener("click", extractTextFromPdf);
  copyBtn.addEventListener("click", copyExtractedText);

  async function handleFile(file) {
    clearMessage();
    resetResult();
    revokeDownloadUrl();

    selectedFile = null;
    selectedFileBuffer = null;
    pdfDocument = null;
    pageCount = 0;
    extractedText = "";

    if (!file) {
      setMessage("Lütfen bir PDF dosyası seç.", "warning");
      return;
    }

    if (!utils.isPdfFile(file)) {
      setMessage("PDF dosyası algılanamadı. Lütfen .pdf uzantılı geçerli bir dosya seç.", "error");
      return;
    }

    selectedFile = file;
    selectedPanel.hidden = false;
    selectedFileName.textContent = file.name;
    selectedFileMeta.textContent = "PDF dosyası okunuyor...";
    extractBtn.disabled = true;
    copyBtn.disabled = true;

    try {
      updateProgress(15, "PDF dosyası okunuyor...");

      selectedFileBuffer = await file.arrayBuffer();

      const loadingTask = window.pdfjsLib.getDocument({
        data: selectedFileBuffer.slice(0)
      });

      pdfDocument = await loadingTask.promise;
      pageCount = pdfDocument.numPages;

      if (!pageCount || pageCount < 1) {
        throw new Error("PDF içinde sayfa bulunamadı.");
      }

      selectedFileMeta.textContent = `${pageCount} sayfa • ${utils.formatBytes(file.size)}`;
      extractBtn.disabled = false;

      updateProgress(100, "PDF hazır.");
      setMessage("PDF hazır. Metni çıkarabilirsin.", "success");

      setTimeout(function () {
        progressWrap.hidden = true;
      }, 700);
    } catch (error) {
      console.error("PDF TXT hazırlama hatası:", error);

      selectedFile = null;
      selectedFileBuffer = null;
      pdfDocument = null;
      pageCount = 0;

      extractBtn.disabled = true;
      copyBtn.disabled = true;
      selectedFileMeta.textContent = "PDF okunamadı.";

      const message = String(error?.message || "").toLowerCase();

      if (message.includes("password") || message.includes("encrypted")) {
        setMessage("Şifreli PDF okunamadı. Lütfen şifresiz bir PDF dosyası dene.", "error");
      } else {
        setMessage("PDF okunamadı. Dosya bozuk, şifreli veya çok büyük olabilir.", "error");
      }

      updateProgress(0, "İşlem başarısız oldu.");
    }
  }

  async function extractTextFromPdf() {
    if (!pdfDocument || !selectedFile) {
      setMessage("Lütfen önce bir PDF dosyası seç.", "warning");
      return;
    }

    resetResult();
    revokeDownloadUrl();

    extractBtn.disabled = true;
    clearFileBtn.disabled = true;
    copyBtn.disabled = true;

    try {
      updateProgress(5, "Metin çıkarma başlıyor...");
      setMessage("PDF metni çıkarılıyor...", "warning");

      const pageTexts = [];

      for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
        updateProgress(
          8 + Math.round(((pageNumber - 1) / pageCount) * 78),
          `${pageNumber}. sayfanın metni çıkarılıyor...`
        );

        const page = await pdfDocument.getPage(pageNumber);
        const textContent = await page.getTextContent();

        const text = normalizeTextItems(textContent.items || []);

        if (text.trim()) {
          pageTexts.push(`--- Sayfa ${pageNumber} ---\n${text.trim()}`);
        } else {
          pageTexts.push(`--- Sayfa ${pageNumber} ---\n`);
        }
      }

      extractedText = pageTexts.join("\n\n").trim();

      updateProgress(90, "TXT dosyası hazırlanıyor...");

      if (!extractedText) {
        textOutput.value = "";
        resultPanel.hidden = false;
        resultSummary.textContent = "PDF içinde çıkarılabilir metin bulunamadı.";
        setMessage("Bu PDF içinde seçilebilir metin bulunamadı. Dosya taranmış/görsel tabanlı olabilir.", "warning");
        updateProgress(100, "Metin bulunamadı.");
        return;
      }

      textOutput.value = extractedText;
      resultPanel.hidden = false;

      const blob = new Blob([extractedText], {
        type: "text/plain;charset=utf-8"
      });

      currentDownloadUrl = URL.createObjectURL(blob);

      downloadBtn.href = currentDownloadUrl;
      downloadBtn.download = buildOutputFileName();
      downloadBtn.hidden = false;
      downloadBtn.classList.remove("is-disabled");
      downloadBtn.setAttribute("aria-disabled", "false");

      copyBtn.disabled = false;

      resultSummary.textContent = `${pageCount} sayfadan metin çıkarıldı.`;
      updateProgress(100, "TXT hazır.");
      setMessage("Hazır! Metni kopyalayabilir veya TXT olarak indirebilirsin.", "success");

      setTimeout(function () {
        progressWrap.hidden = true;
      }, 900);
    } catch (error) {
      console.error("PDF TXT dönüştürme hatası:", error);
      setMessage("PDF metni çıkarılırken bir sorun oluştu. Farklı bir PDF dosyası dene.", "error");
      updateProgress(0, "İşlem başarısız oldu.");
    } finally {
      extractBtn.disabled = false;
      clearFileBtn.disabled = false;
    }
  }

  async function copyExtractedText() {
    if (!extractedText) {
      setMessage("Kopyalanacak metin yok.", "warning");
      return;
    }

    try {
      await navigator.clipboard.writeText(extractedText);
      setMessage("Metin panoya kopyalandı.", "success");
    } catch (error) {
      textOutput.focus();
      textOutput.select();
      document.execCommand("copy");
      setMessage("Metin seçildi ve kopyalanmaya çalışıldı.", "warning");
    }
  }

  function normalizeTextItems(items) {
    const lines = [];
    let currentLine = [];
    let lastY = null;

    items.forEach(function (item) {
      const text = String(item.str || "");

      if (!text.trim()) {
        return;
      }

      const y = item.transform ? Math.round(item.transform[5]) : 0;

      if (lastY === null) {
        lastY = y;
      }

      if (Math.abs(y - lastY) > 5) {
        if (currentLine.length > 0) {
          lines.push(currentLine.join(" ").replace(/\s+/g, " ").trim());
        }

        currentLine = [];
        lastY = y;
      }

      currentLine.push(text);
    });

    if (currentLine.length > 0) {
      lines.push(currentLine.join(" ").replace(/\s+/g, " ").trim());
    }

    return lines.join("\n");
  }

  function resetResult() {
    extractedText = "";
    textOutput.value = "";
    resultPanel.hidden = true;
    resultSummary.textContent = "PDF metni hazırlandı.";

    copyBtn.disabled = true;

    downloadBtn.hidden = true;
    downloadBtn.href = "#";
    downloadBtn.removeAttribute("download");
    downloadBtn.classList.add("is-disabled");
    downloadBtn.setAttribute("aria-disabled", "true");
  }

  function clearFile() {
    revokeDownloadUrl();

    selectedFile = null;
    selectedFileBuffer = null;
    pdfDocument = null;
    pageCount = 0;
    extractedText = "";

    fileInput.value = "";
    selectedPanel.hidden = true;
    selectedFileName.textContent = "PDF seçildi";
    selectedFileMeta.textContent = "Dosya hazırlanıyor.";

    extractBtn.disabled = false;
    copyBtn.disabled = true;
    clearFileBtn.disabled = false;

    resetResult();
    clearMessage();

    if (progressWrap) {
      progressWrap.hidden = true;
    }

    updateProgress(0, "");
  }

  function revokeDownloadUrl() {
    if (currentDownloadUrl) {
      URL.revokeObjectURL(currentDownloadUrl);
      currentDownloadUrl = null;
    }
  }

  function buildOutputFileName() {
    const fileName = utils.sanitizeFileName(selectedFile?.name || "pdf");
    return `${fileName}.txt`;
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