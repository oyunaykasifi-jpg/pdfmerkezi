(function () {
  const utils = window.PDFMerkezi?.utils;

  const dropZone = document.getElementById("dropZone");
  const fileInput = document.getElementById("pdfFile");
  const selectFileBtn = document.getElementById("selectFileBtn");
  const selectedPanel = document.getElementById("selectedPanel");
  const fileSummary = document.getElementById("fileSummary");
  const deleteBtn = document.getElementById("deleteBtn");
  const clearFileBtn = document.getElementById("clearFileBtn");
  const downloadBtn = document.getElementById("downloadBtn");
  const progressWrap = document.getElementById("progressWrap");
  const progressBar = document.getElementById("progressBar");
  const progressText = document.getElementById("progressText");
  const toolMessage = document.getElementById("toolMessage");

  const pageThumbnailGrid = document.getElementById("pageThumbnailGrid");
  const selectionSummary = document.getElementById("selectionSummary");
  const selectAllBtn = document.getElementById("selectAllBtn");
  const clearSelectionBtn = document.getElementById("clearSelectionBtn");

  let selectedFile = null;
  let selectedFileBuffer = null;
  let pageCount = 0;
  let selectedPages = new Set();
  let currentDownloadUrl = null;

  if (
    !dropZone ||
    !fileInput ||
    !selectFileBtn ||
    !selectedPanel ||
    !deleteBtn ||
    !pageThumbnailGrid ||
    !selectionSummary
  ) {
    console.error("PDF Merkezi: PDF Sayfa Sil HTML elemanları bulunamadı.");
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

  if (clearFileBtn) {
    clearFileBtn.addEventListener("click", clearFile);
  }

  if (selectAllBtn) {
    selectAllBtn.addEventListener("click", selectAllPages);
  }

  if (clearSelectionBtn) {
    clearSelectionBtn.addEventListener("click", clearSelectedPages);
  }

  deleteBtn.addEventListener("click", deletePdfPages);

  async function handleFile(file) {
    resetOutput();
    clearMessage();
    clearThumbnails();

    selectedFile = null;
    selectedFileBuffer = null;
    pageCount = 0;
    selectedPages = new Set();

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

    selectedFile = file;
    selectedPanel.hidden = false;
    fileSummary.textContent = `${file.name} seçildi. Sayfalar hazırlanıyor...`;
    deleteBtn.disabled = true;

    try {
      selectedFileBuffer = await file.arrayBuffer();

      await readPageCount();
      await renderThumbnails();

      fileSummary.textContent = `${file.name} seçildi. Toplam ${pageCount} sayfa bulundu.`;
      setMessage("PDF hazır. Silmek istediğin sayfaları önizlemelerden seçebilirsin.", "success");
      updateSelectionSummary();
    } catch (error) {
      console.error("PDF hazırlama hatası:", error);

      selectedFile = null;
      selectedFileBuffer = null;
      pageCount = 0;
      selectedPages = new Set();

      clearThumbnails();
      deleteBtn.disabled = true;

      const errorMessage = String(error?.message || "").toLowerCase();

      if (errorMessage.includes("encrypted") || errorMessage.includes("password")) {
        setMessage("Şifreli PDF dosyası okunamadı. Lütfen şifresiz PDF dosyası dene.", "error");
      } else {
        setMessage("PDF okunamadı. Dosya bozuk, şifreli veya çok büyük olabilir.", "error");
      }

      updateProgress(0, "İşlem başarısız oldu.");
    }
  }

  async function readPageCount() {
    const PDFDocument = window.PDFLib?.PDFDocument;

    if (!PDFDocument) {
      throw new Error("PDF motoru yüklenemedi.");
    }

    updateProgress(15, "PDF sayfa sayısı okunuyor...");

    const sourcePdf = await PDFDocument.load(selectedFileBuffer.slice(0), {
      ignoreEncryption: false
    });

    pageCount = sourcePdf.getPageCount();

    if (pageCount < 1) {
      throw new Error("PDF içinde sayfa bulunamadı.");
    }

    updateProgress(30, `${pageCount} sayfa bulundu.`);
  }

  async function renderThumbnails() {
    if (!window.pdfjsLib) {
      throw new Error("PDF önizleme motoru yüklenemedi.");
    }

    updateProgress(40, "Sayfa önizlemeleri hazırlanıyor...");

    const loadingTask = window.pdfjsLib.getDocument({
      data: selectedFileBuffer.slice(0)
    });

    const pdf = await loadingTask.promise;

    pageThumbnailGrid.innerHTML = "";

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      updateProgress(
        40 + Math.round((pageNumber / pdf.numPages) * 50),
        `${pageNumber}. sayfa hazırlanıyor...`
      );

      const page = await pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 0.34 });

      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d", { alpha: false });

      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);

      await page.render({
        canvasContext: context,
        viewport: viewport
      }).promise;

      const card = document.createElement("button");
      card.className = "page-thumb";
      card.type = "button";
      card.dataset.page = String(pageNumber);
      card.setAttribute("aria-pressed", "false");
      card.setAttribute("aria-label", `${pageNumber}. sayfayı silmek için seç`);

      const canvasWrap = document.createElement("div");
      canvasWrap.className = "page-thumb-canvas";
      canvasWrap.appendChild(canvas);

      const number = document.createElement("span");
      number.className = "page-thumb-number";
      number.textContent = `Sayfa ${pageNumber}`;

      const badge = document.createElement("span");
      badge.className = "page-thumb-badge";
      badge.textContent = "Silinecek";

      card.appendChild(canvasWrap);
      card.appendChild(number);
      card.appendChild(badge);

      card.addEventListener("click", function () {
        togglePageSelection(pageNumber, card);
      });

      pageThumbnailGrid.appendChild(card);
    }

    updateProgress(100, "Sayfa önizlemeleri hazır.");

    setTimeout(function () {
      progressWrap.hidden = true;
    }, 700);
  }

  function togglePageSelection(pageNumber, card) {
    resetOutput();

    if (selectedPages.has(pageNumber)) {
      selectedPages.delete(pageNumber);
      card.classList.remove("is-selected");
      card.setAttribute("aria-pressed", "false");
    } else {
      selectedPages.add(pageNumber);
      card.classList.add("is-selected");
      card.setAttribute("aria-pressed", "true");
    }

    updateSelectionSummary();
  }

  function selectAllPages() {
    resetOutput();

    selectedPages = new Set();

    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber++) {
      selectedPages.add(pageNumber);
    }

    document.querySelectorAll(".page-thumb").forEach(function (thumb) {
      thumb.classList.add("is-selected");
      thumb.setAttribute("aria-pressed", "true");
    });

    updateSelectionSummary();
  }

  function clearSelectedPages() {
    resetOutput();

    selectedPages = new Set();

    document.querySelectorAll(".page-thumb").forEach(function (thumb) {
      thumb.classList.remove("is-selected");
      thumb.setAttribute("aria-pressed", "false");
    });

    updateSelectionSummary();
  }

  async function deletePdfPages() {
    const PDFDocument = window.PDFLib?.PDFDocument;

    if (!PDFDocument) {
      setMessage("PDF motoru yüklenemedi. İnternet bağlantını kontrol edip sayfayı Ctrl + F5 ile yenile.", "error");
      return;
    }

    if (!selectedFile || !selectedFileBuffer) {
      setMessage("Lütfen önce bir PDF dosyası seç.", "warning");
      return;
    }

    if (!pageCount) {
      setMessage("PDF sayfa sayısı okunamadı. Lütfen dosyayı tekrar seç.", "error");
      return;
    }

    const pagesToDelete = Array.from(selectedPages).sort(function (a, b) {
      return a - b;
    });

    if (pagesToDelete.length === 0) {
      setMessage("Lütfen silmek istediğin en az bir sayfayı seç.", "warning");
      return;
    }

    if (pagesToDelete.length >= pageCount) {
      setMessage("Tüm sayfalar silinemez. PDF içinde en az bir sayfa kalmalı.", "error");
      return;
    }

    resetOutput();
    setBusy(true);
    updateProgress(8, "PDF sayfa silme işlemi başlıyor...");

    try {
      updateProgress(22, "Kaynak PDF okunuyor...");

      const sourcePdf = await PDFDocument.load(selectedFileBuffer.slice(0), {
        ignoreEncryption: false
      });

      const newPdf = await PDFDocument.create();

      const pagesToDeleteSet = new Set(pagesToDelete);
      const pagesToKeep = [];

      for (let pageNumber = 1; pageNumber <= pageCount; pageNumber++) {
        if (!pagesToDeleteSet.has(pageNumber)) {
          pagesToKeep.push(pageNumber);
        }
      }

      updateProgress(42, "Kalan sayfalar hazırlanıyor...");

      const zeroBasedIndexes = pagesToKeep.map(function (pageNumber) {
        return pageNumber - 1;
      });

      const copiedPages = await newPdf.copyPages(sourcePdf, zeroBasedIndexes);

      copiedPages.forEach(function (page) {
        newPdf.addPage(page);
      });

      updateProgress(78, "Yeni PDF oluşturuluyor...");

      const newPdfBytes = await newPdf.save({
        useObjectStreams: true,
        addDefaultPage: false
      });

      currentDownloadUrl = utils.createDownloadUrl(newPdfBytes);

      downloadBtn.href = currentDownloadUrl;
      downloadBtn.download = buildOutputFileName();
      downloadBtn.hidden = false;
      downloadBtn.classList.remove("is-disabled");
      downloadBtn.setAttribute("aria-disabled", "false");

      updateProgress(100, "PDF başarıyla hazırlandı.");
      setMessage("Hazır! Seçili sayfalar silindi, yeni PDF dosyanı indirebilirsin.", "success");
    } catch (error) {
      console.error("PDF sayfa silme hatası:", error);

      const errorMessage = String(error?.message || "").toLowerCase();

      if (errorMessage.includes("encrypted") || errorMessage.includes("password")) {
        setMessage("Şifreli PDF dosyası düzenlenemedi. Lütfen şifresiz PDF dosyası dene.", "error");
      } else {
        setMessage("PDF sayfa silme sırasında bir sorun oluştu. Dosya bozuk, şifreli veya çok büyük olabilir.", "error");
      }

      updateProgress(0, "İşlem başarısız oldu.");
    } finally {
      setBusy(false);
    }
  }

  function updateSelectionSummary() {
    const count = selectedPages.size;

    if (count === 0) {
      selectionSummary.textContent = "Henüz sayfa seçilmedi.";
      deleteBtn.disabled = true;
      return;
    }

    if (count >= pageCount) {
      selectionSummary.textContent = `${count} sayfa seçildi. Tüm sayfalar silinemez, en az bir sayfa kalmalı.`;
      deleteBtn.disabled = true;
      return;
    }

    const selectedList = Array.from(selectedPages).sort(function (a, b) {
      return a - b;
    });

    selectionSummary.textContent = `${count} sayfa silinecek: ${selectedList.join(", ")}`;
    deleteBtn.disabled = false;
  }

  function buildOutputFileName() {
    if (!utils) return "sayfalari-silinmis-pdf.pdf";

    const fileName = utils.sanitizeFileName(selectedFile?.name || "pdf");
    return `${fileName}-sayfalari-silindi.pdf`;
  }

  function clearFile() {
    selectedFile = null;
    selectedFileBuffer = null;
    pageCount = 0;
    selectedPages = new Set();

    fileInput.value = "";
    selectedPanel.hidden = true;

    clearThumbnails();
    resetOutput();
    clearMessage();
  }

  function clearThumbnails() {
    pageThumbnailGrid.innerHTML = "";
    selectionSummary.textContent = "Henüz sayfa seçilmedi.";
  }

  function resetOutput() {
    if (currentDownloadUrl && utils) {
      utils.revokeDownloadUrl(currentDownloadUrl);
      currentDownloadUrl = null;
    }

    if (downloadBtn) {
      downloadBtn.hidden = true;
      downloadBtn.href = "#";
      downloadBtn.removeAttribute("download");
      downloadBtn.classList.add("is-disabled");
      downloadBtn.setAttribute("aria-disabled", "true");
    }

    if (progressWrap) {
      progressWrap.hidden = true;
    }

    updateProgress(0, "");
  }

  function setBusy(isBusy) {
    deleteBtn.disabled = isBusy || selectedPages.size === 0 || selectedPages.size >= pageCount;

    if (clearFileBtn) clearFileBtn.disabled = isBusy;
    if (selectFileBtn) selectFileBtn.disabled = isBusy;
    if (selectAllBtn) selectAllBtn.disabled = isBusy;
    if (clearSelectionBtn) clearSelectionBtn.disabled = isBusy;
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