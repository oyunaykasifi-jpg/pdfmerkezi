(function () {
  const utils = window.PDFMerkezi?.utils;

  const dropZone = document.getElementById("dropZone");
  const fileInput = document.getElementById("pdfFile");
  const selectFileBtn = document.getElementById("selectFileBtn");
  const selectedPanel = document.getElementById("selectedPanel");
  const fileSummary = document.getElementById("fileSummary");
  const clearFileBtn = document.getElementById("clearFileBtn");
  const resetOrderBtn = document.getElementById("resetOrderBtn");
  const createPdfBtn = document.getElementById("createPdfBtn");
  const downloadBtn = document.getElementById("downloadBtn");
  const progressWrap = document.getElementById("progressWrap");
  const progressBar = document.getElementById("progressBar");
  const progressText = document.getElementById("progressText");
  const toolMessage = document.getElementById("toolMessage");

  const pageThumbnailGrid = document.getElementById("pageThumbnailGrid");
  const orderSummary = document.getElementById("orderSummary");

  let selectedFile = null;
  let selectedFileBuffer = null;
  let pageCount = 0;
  let currentDownloadUrl = null;
  let sortableInstance = null;
  let hasOrderChanged = false;

  if (
    !dropZone ||
    !fileInput ||
    !selectFileBtn ||
    !selectedPanel ||
    !createPdfBtn ||
    !pageThumbnailGrid ||
    !orderSummary
  ) {
    console.error("PDF Merkezi: PDF Sayfa Sırala HTML elemanları bulunamadı.");
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

  if (resetOrderBtn) {
    resetOrderBtn.addEventListener("click", resetOrder);
  }

  createPdfBtn.addEventListener("click", createReorderedPdf);

  async function handleFile(file) {
    resetOutput();
    clearMessage();
    clearThumbnails();
    destroySortable();

    selectedFile = null;
    selectedFileBuffer = null;
    pageCount = 0;
    hasOrderChanged = false;

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
    createPdfBtn.disabled = true;

    try {
      selectedFileBuffer = await file.arrayBuffer();

      await readPageCount();
      await renderThumbnails();
      initSortable();

      fileSummary.textContent = `${file.name} seçildi. Toplam ${pageCount} sayfa bulundu.`;
      setMessage("PDF hazır. Sayfaları sürükle bırak yöntemiyle yeniden sıralayabilirsin.", "success");
      updateOrderSummary();
    } catch (error) {
      console.error("PDF hazırlama hatası:", error);

      selectedFile = null;
      selectedFileBuffer = null;
      pageCount = 0;
      hasOrderChanged = false;

      clearThumbnails();
      destroySortable();
      createPdfBtn.disabled = true;

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

      const card = document.createElement("div");
      card.className = "page-thumb sortable-page-thumb";
      card.dataset.page = String(pageNumber);
      card.dataset.originalIndex = String(pageNumber - 1);

      const canvasWrap = document.createElement("div");
      canvasWrap.className = "page-thumb-canvas";
      canvasWrap.appendChild(canvas);

      const number = document.createElement("span");
      number.className = "page-thumb-number";
      number.textContent = `Sayfa ${pageNumber}`;

      const orderBadge = document.createElement("span");
      orderBadge.className = "page-order-badge";
      orderBadge.textContent = String(pageNumber);

      const dragHint = document.createElement("span");
      dragHint.className = "page-drag-hint";
      dragHint.textContent = "Sürükle";

      card.appendChild(canvasWrap);
      card.appendChild(number);
      card.appendChild(orderBadge);
      card.appendChild(dragHint);

      pageThumbnailGrid.appendChild(card);
    }

    updateProgress(100, "Sayfa önizlemeleri hazır.");

    setTimeout(function () {
      progressWrap.hidden = true;
    }, 700);
  }

  function initSortable() {
    if (!window.Sortable) {
      setMessage("Sıralama motoru yüklenemedi. İnternet bağlantını kontrol edip sayfayı yenile.", "error");
      return;
    }

    destroySortable();

    sortableInstance = new Sortable(pageThumbnailGrid, {
      animation: 180,
      ghostClass: "sortable-ghost",
      chosenClass: "sortable-chosen",
      dragClass: "sortable-drag",
      forceFallback: false,
      onEnd: function () {
        resetOutput();
        hasOrderChanged = checkOrderChanged();
        updateOrderBadges();
        updateOrderSummary();
      }
    });
  }

  function checkOrderChanged() {
    const cards = Array.from(pageThumbnailGrid.querySelectorAll(".sortable-page-thumb"));

    return cards.some(function (card, index) {
      return Number(card.dataset.originalIndex) !== index;
    });
  }

  function updateOrderBadges() {
    const cards = Array.from(pageThumbnailGrid.querySelectorAll(".sortable-page-thumb"));

    cards.forEach(function (card, index) {
      const badge = card.querySelector(".page-order-badge");
      if (badge) {
        badge.textContent = String(index + 1);
      }
    });
  }

  function updateOrderSummary() {
    if (!pageCount) {
      orderSummary.textContent = "PDF yüklendikten sonra sayfaları sürükle bırak yöntemiyle sıralayabilirsin.";
      createPdfBtn.disabled = true;
      return;
    }

    if (!hasOrderChanged) {
      orderSummary.textContent = "Sayfa sırası henüz değiştirilmedi.";
      createPdfBtn.disabled = true;
      return;
    }

    orderSummary.textContent = "Sayfa sırası değiştirildi. Yeni PDF’i hazırlayabilirsin.";
    createPdfBtn.disabled = false;
  }

  async function createReorderedPdf() {
    const PDFDocument = window.PDFLib?.PDFDocument;

    if (!PDFDocument) {
      setMessage("PDF motoru yüklenemedi. İnternet bağlantını kontrol edip sayfayı Ctrl + F5 ile yenile.", "error");
      return;
    }

    if (!selectedFile || !selectedFileBuffer) {
      setMessage("Lütfen önce bir PDF dosyası seç.", "warning");
      return;
    }

    if (!hasOrderChanged) {
      setMessage("Sayfa sırası değişmedi. Önce en az bir sayfayı taşımalısın.", "warning");
      return;
    }

    resetOutput();
    setBusy(true);
    updateProgress(8, "PDF sıralama işlemi başlıyor...");

    try {
      updateProgress(22, "Kaynak PDF okunuyor...");

      const sourcePdf = await PDFDocument.load(selectedFileBuffer.slice(0), {
        ignoreEncryption: false
      });

      const newPdf = await PDFDocument.create();

      const cards = Array.from(pageThumbnailGrid.querySelectorAll(".sortable-page-thumb"));
      const orderedIndexes = cards.map(function (card) {
        return Number(card.dataset.originalIndex);
      });

      updateProgress(48, "Yeni sayfa sırası uygulanıyor...");

      const copiedPages = await newPdf.copyPages(sourcePdf, orderedIndexes);

      copiedPages.forEach(function (page) {
        newPdf.addPage(page);
      });

      updateProgress(82, "Yeni PDF oluşturuluyor...");

      const reorderedBytes = await newPdf.save({
        useObjectStreams: true,
        addDefaultPage: false
      });

      currentDownloadUrl = utils.createDownloadUrl(reorderedBytes);

      downloadBtn.href = currentDownloadUrl;
      downloadBtn.download = buildOutputFileName();
      downloadBtn.hidden = false;
      downloadBtn.classList.remove("is-disabled");
      downloadBtn.setAttribute("aria-disabled", "false");

      updateProgress(100, "PDF başarıyla hazırlandı.");
      setMessage("Hazır! Sıralanmış PDF dosyanı indirebilirsin.", "success");
    } catch (error) {
      console.error("PDF sayfa sıralama hatası:", error);

      const errorMessage = String(error?.message || "").toLowerCase();

      if (errorMessage.includes("encrypted") || errorMessage.includes("password")) {
        setMessage("Şifreli PDF dosyası düzenlenemedi. Lütfen şifresiz PDF dosyası dene.", "error");
      } else {
        setMessage("PDF sayfa sıralama sırasında bir sorun oluştu. Dosya bozuk, şifreli veya çok büyük olabilir.", "error");
      }

      updateProgress(0, "İşlem başarısız oldu.");
    } finally {
      setBusy(false);
    }
  }

  function resetOrder() {
    if (!pageCount) {
      setMessage("Lütfen önce bir PDF dosyası seç.", "warning");
      return;
    }

    resetOutput();

    const cards = Array.from(pageThumbnailGrid.querySelectorAll(".sortable-page-thumb"));

    cards
      .sort(function (a, b) {
        return Number(a.dataset.originalIndex) - Number(b.dataset.originalIndex);
      })
      .forEach(function (card) {
        pageThumbnailGrid.appendChild(card);
      });

    hasOrderChanged = false;
    updateOrderBadges();
    updateOrderSummary();
    setMessage("Sayfa sırası ilk haline döndürüldü.", "success");
  }

  function buildOutputFileName() {
    if (!utils) return "siralanmis-pdf.pdf";

    const fileName = utils.sanitizeFileName(selectedFile?.name || "pdf");
    return `${fileName}-siralandı.pdf`;
  }

  function clearFile() {
    selectedFile = null;
    selectedFileBuffer = null;
    pageCount = 0;
    hasOrderChanged = false;

    fileInput.value = "";
    selectedPanel.hidden = true;

    clearThumbnails();
    destroySortable();
    resetOutput();
    clearMessage();
  }

  function clearThumbnails() {
    pageThumbnailGrid.innerHTML = "";
    orderSummary.textContent = "PDF yüklendikten sonra sayfaları sürükle bırak yöntemiyle sıralayabilirsin.";
  }

  function destroySortable() {
    if (sortableInstance) {
      sortableInstance.destroy();
      sortableInstance = null;
    }
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
    createPdfBtn.disabled = isBusy || !hasOrderChanged;

    if (clearFileBtn) clearFileBtn.disabled = isBusy;
    if (selectFileBtn) selectFileBtn.disabled = isBusy;
    if (resetOrderBtn) resetOrderBtn.disabled = isBusy;

    if (sortableInstance) {
      sortableInstance.option("disabled", isBusy);
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
})();