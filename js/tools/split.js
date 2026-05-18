(function () {
  const utils = window.PDFMerkezi?.utils;

  const dropZone = document.getElementById("dropZone");
  const fileInput = document.getElementById("pdfFile");
  const selectFileBtn = document.getElementById("selectFileBtn");
  const selectedPanel = document.getElementById("selectedPanel");
  const fileSummary = document.getElementById("fileSummary");
  const clearFileBtn = document.getElementById("clearFileBtn");

  const modeTabs = document.querySelectorAll(".split-mode-tab");
  const rangePanel = document.getElementById("rangePanel");
  const selectPanel = document.getElementById("selectPanel");
  const allPanel = document.getElementById("allPanel");
  const pageRangeInput = document.getElementById("pageRange");

  const pageThumbnailGrid = document.getElementById("pageThumbnailGrid");
  const selectionSummary = document.getElementById("selectionSummary");
  const selectAllBtn = document.getElementById("selectAllBtn");
  const clearSelectionBtn = document.getElementById("clearSelectionBtn");

  const splitBtn = document.getElementById("splitBtn");
  const downloadBtn = document.getElementById("downloadBtn");

  const progressWrap = document.getElementById("progressWrap");
  const progressBar = document.getElementById("progressBar");
  const progressText = document.getElementById("progressText");
  const toolMessage = document.getElementById("toolMessage");

  let selectedFile = null;
  let selectedFileBuffer = null;
  let pageCount = 0;
  let selectedPages = new Set();
  let pageApproxSizes = new Map();
  let currentMode = "range";
  let currentDownloadUrl = null;

  if (
    !dropZone ||
    !fileInput ||
    !selectFileBtn ||
    !selectedPanel ||
    !pageThumbnailGrid ||
    !splitBtn ||
    !downloadBtn
  ) {
    console.error("PDF Merkezi: PDF Böl HTML elemanları bulunamadı.");
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

  if (pageRangeInput) {
    pageRangeInput.addEventListener("input", function () {
      resetOutput();
      updateActionState();
    });
  }

  if (selectAllBtn) {
    selectAllBtn.addEventListener("click", selectAllPages);
  }

  if (clearSelectionBtn) {
    clearSelectionBtn.addEventListener("click", clearSelectedPages);
  }

  modeTabs.forEach(function (tab) {
    tab.addEventListener("click", function () {
      setMode(tab.dataset.mode);
    });
  });

  splitBtn.addEventListener("click", runSplitAction);

  async function handleFile(file) {
    resetOutput();
    clearMessage();
    clearThumbnails();

    selectedFile = null;
    selectedFileBuffer = null;
    pageCount = 0;
    selectedPages = new Set();
    pageApproxSizes = new Map();

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

    if (!window.pdfjsLib) {
      setMessage("PDF önizleme motoru yüklenemedi. İnternet bağlantını kontrol edip Ctrl + F5 ile yenile.", "error");
      return;
    }

    selectedFile = file;
    selectedPanel.hidden = false;
    fileSummary.textContent = `${file.name} seçildi. Sayfalar hazırlanıyor...`;
    splitBtn.disabled = true;

    try {
      updateProgress(8, "PDF dosyası okunuyor...");

      selectedFileBuffer = await file.arrayBuffer();

      await readPageCount();
      await renderThumbnails();
      await calculateApproxPageSizes();

      fileSummary.textContent = `${file.name} seçildi. Toplam ${pageCount} sayfa bulundu.`;
      setMessage("PDF hazır. Bölme yöntemini seçip işlemi başlatabilirsin.", "success");

      updateSelectionSummary();
      updateActionState();

      setTimeout(function () {
        progressWrap.hidden = true;
      }, 700);
    } catch (error) {
      console.error("PDF Böl hazırlama hatası:", error);

      selectedFile = null;
      selectedFileBuffer = null;
      pageCount = 0;
      selectedPages = new Set();
      pageApproxSizes = new Map();

      clearThumbnails();
      splitBtn.disabled = true;

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
    const { PDFDocument } = window.PDFLib;

    updateProgress(16, "PDF sayfa sayısı okunuyor...");

    const sourcePdf = await PDFDocument.load(selectedFileBuffer.slice(0), {
      ignoreEncryption: false
    });

    pageCount = sourcePdf.getPageCount();

    if (pageCount < 1) {
      throw new Error("PDF içinde sayfa bulunamadı.");
    }

    updateProgress(24, `${pageCount} sayfa bulundu.`);
  }

  async function renderThumbnails() {
    updateProgress(30, "Sayfa önizlemeleri hazırlanıyor...");

    const loadingTask = window.pdfjsLib.getDocument({
      data: selectedFileBuffer.slice(0)
    });

    const pdf = await loadingTask.promise;

    pageThumbnailGrid.innerHTML = "";

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      updateProgress(
        30 + Math.round((pageNumber / pdf.numPages) * 38),
        `${pageNumber}. sayfa önizleniyor...`
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
      card.className = "page-thumb split-page-thumb";
      card.type = "button";
      card.dataset.page = String(pageNumber);
      card.setAttribute("aria-pressed", "false");
      card.setAttribute("aria-label", `${pageNumber}. sayfayı seç`);

      const canvasWrap = document.createElement("div");
      canvasWrap.className = "page-thumb-canvas";
      canvasWrap.appendChild(canvas);

      const number = document.createElement("span");
      number.className = "page-thumb-number";
      number.textContent = `Sayfa ${pageNumber}`;

      const size = document.createElement("span");
      size.className = "page-size-label";
      size.dataset.sizeFor = String(pageNumber);
      size.textContent = "Boyut hesaplanıyor...";

      const badge = document.createElement("span");
      badge.className = "page-thumb-badge";
      badge.textContent = "Seçildi";

      card.appendChild(canvasWrap);
      card.appendChild(number);
      card.appendChild(size);
      card.appendChild(badge);

      card.addEventListener("click", function () {
        if (currentMode !== "select") {
          setMessage("Sayfa seçmek için önce “Seçili sayfaları ayıkla” modunu seç.", "warning");
          return;
        }

        togglePageSelection(pageNumber, card);
      });

      pageThumbnailGrid.appendChild(card);
    }

    updateProgress(70, "Sayfa önizlemeleri hazır.");
  }

  async function calculateApproxPageSizes() {
    const { PDFDocument } = window.PDFLib;

    updateProgress(72, "Yaklaşık sayfa boyutları hesaplanıyor...");

    try {
      const sourcePdf = await PDFDocument.load(selectedFileBuffer.slice(0), {
        ignoreEncryption: false
      });

      for (let pageNumber = 1; pageNumber <= pageCount; pageNumber++) {
        const singlePdf = await PDFDocument.create();
        const [copiedPage] = await singlePdf.copyPages(sourcePdf, [pageNumber - 1]);

        singlePdf.addPage(copiedPage);

        const bytes = await singlePdf.save({
          useObjectStreams: true,
          addDefaultPage: false
        });

        pageApproxSizes.set(pageNumber, bytes.length);

        const sizeLabel = pageThumbnailGrid.querySelector(`[data-size-for="${pageNumber}"]`);

        if (sizeLabel) {
          sizeLabel.textContent = `Yaklaşık ${utils.formatBytes(bytes.length)}`;
        }

        updateProgress(
          72 + Math.round((pageNumber / pageCount) * 24),
          `${pageNumber}. sayfa boyutu hesaplanıyor...`
        );
      }

      updateProgress(100, "PDF hazır.");
    } catch (error) {
      console.warn("Yaklaşık sayfa boyutu hesaplanamadı:", error);

      document.querySelectorAll(".page-size-label").forEach(function (label) {
        label.textContent = "Boyut hesaplanamadı";
      });
    }
  }

  function setMode(mode) {
    if (!["range", "select", "all"].includes(mode)) return;

    currentMode = mode;
    resetOutput();

    modeTabs.forEach(function (tab) {
      tab.classList.toggle("is-active", tab.dataset.mode === mode);
    });

    rangePanel.hidden = mode !== "range";
    selectPanel.hidden = mode !== "select";
    allPanel.hidden = mode !== "all";

    rangePanel.classList.toggle("is-active", mode === "range");
    selectPanel.classList.toggle("is-active", mode === "select");
    allPanel.classList.toggle("is-active", mode === "all");

    pageThumbnailGrid.classList.toggle("is-selection-mode", mode === "select");

    if (mode !== "select") {
      clearSelectedPages(false);
    }

    updateSelectionSummary();
    updateActionState();
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
    updateActionState();
  }

  function selectAllPages() {
    if (!pageCount) {
      setMessage("Lütfen önce bir PDF dosyası seç.", "warning");
      return;
    }

    if (currentMode !== "select") {
      setMode("select");
    }

    resetOutput();

    selectedPages = new Set();

    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber++) {
      selectedPages.add(pageNumber);
    }

    document.querySelectorAll(".split-page-thumb").forEach(function (thumb) {
      thumb.classList.add("is-selected");
      thumb.setAttribute("aria-pressed", "true");
    });

    updateSelectionSummary();
    updateActionState();
  }

  function clearSelectedPages(showMessage = true) {
    resetOutput();

    selectedPages = new Set();

    document.querySelectorAll(".split-page-thumb").forEach(function (thumb) {
      thumb.classList.remove("is-selected");
      thumb.setAttribute("aria-pressed", "false");
    });

    if (showMessage) {
      setMessage("Sayfa seçimi temizlendi.", "success");
    }

    updateSelectionSummary();
    updateActionState();
  }

  async function runSplitAction() {
    if (!selectedFile || !selectedFileBuffer || !pageCount) {
      setMessage("Lütfen önce bir PDF dosyası seç.", "warning");
      return;
    }

    if (currentMode === "range") {
      await extractByRange();
      return;
    }

    if (currentMode === "select") {
      await extractSelectedPages();
      return;
    }

    if (currentMode === "all") {
      await splitEveryPageToZip();
      return;
    }
  }

  async function extractByRange() {
    const rangeText = pageRangeInput.value.trim();

    let pages;

    try {
      pages = parsePageRange(rangeText, pageCount);
    } catch (error) {
      setMessage(error.message, "error");
      return;
    }

    if (pages.length === 0) {
      setMessage("Lütfen en az bir sayfa seç.", "warning");
      return;
    }

    await createSinglePdfFromPages(pages, "aralik");
  }

  async function extractSelectedPages() {
    const pages = Array.from(selectedPages).sort(function (a, b) {
      return a - b;
    });

    if (pages.length === 0) {
      setMessage("Lütfen ayıklamak istediğin en az bir sayfayı seç.", "warning");
      return;
    }

    await createSinglePdfFromPages(pages, "secili-sayfalar");
  }

  async function createSinglePdfFromPages(pages, suffix) {
    const { PDFDocument } = window.PDFLib;

    resetOutput();
    setBusy(true);
    updateProgress(8, "PDF ayıklama işlemi başlıyor...");

    try {
      const sourcePdf = await PDFDocument.load(selectedFileBuffer.slice(0), {
        ignoreEncryption: false
      });

      const newPdf = await PDFDocument.create();

      updateProgress(34, "Seçilen sayfalar hazırlanıyor...");

      const zeroBasedIndexes = pages.map(function (pageNumber) {
        return pageNumber - 1;
      });

      const copiedPages = await newPdf.copyPages(sourcePdf, zeroBasedIndexes);

      copiedPages.forEach(function (page) {
        newPdf.addPage(page);
      });

      updateProgress(76, "Yeni PDF oluşturuluyor...");

      const bytes = await newPdf.save({
        useObjectStreams: true,
        addDefaultPage: false
      });

      currentDownloadUrl = utils.createDownloadUrl(bytes);

      downloadBtn.href = currentDownloadUrl;
      downloadBtn.download = buildPdfFileName(suffix);
      downloadBtn.hidden = false;
      downloadBtn.classList.remove("is-disabled");
      downloadBtn.setAttribute("aria-disabled", "false");

      updateProgress(100, "PDF başarıyla hazırlandı.");
      setMessage("Hazır! Ayıklanan sayfalardan oluşan PDF dosyanı indirebilirsin.", "success");
    } catch (error) {
      console.error("PDF ayıklama hatası:", error);
      handleProcessError(error, "PDF ayıklama sırasında bir sorun oluştu.");
    } finally {
      setBusy(false);
    }
  }

  async function splitEveryPageToZip() {
    if (!window.JSZip) {
      setMessage("ZIP motoru yüklenemedi. İnternet bağlantını kontrol edip Ctrl + F5 ile yenile.", "error");
      return;
    }

    const { PDFDocument } = window.PDFLib;

    resetOutput();
    setBusy(true);
    updateProgress(6, "Her sayfa ayrı PDF olarak hazırlanıyor...");

    try {
      const zip = new window.JSZip();

      const sourcePdf = await PDFDocument.load(selectedFileBuffer.slice(0), {
        ignoreEncryption: false
      });

      const baseFileName = utils.sanitizeFileName(selectedFile?.name || "pdf");

      for (let pageNumber = 1; pageNumber <= pageCount; pageNumber++) {
        updateProgress(
          8 + Math.round((pageNumber / pageCount) * 74),
          `${pageNumber}. sayfa ayrı PDF yapılıyor...`
        );

        const singlePdf = await PDFDocument.create();
        const [copiedPage] = await singlePdf.copyPages(sourcePdf, [pageNumber - 1]);

        singlePdf.addPage(copiedPage);

        const bytes = await singlePdf.save({
          useObjectStreams: true,
          addDefaultPage: false
        });

        zip.file(`${baseFileName}-sayfa-${pageNumber}.pdf`, bytes);
      }

      updateProgress(88, "ZIP dosyası oluşturuluyor...");

      const zipBlob = await zip.generateAsync({
        type: "blob",
        compression: "DEFLATE",
        compressionOptions: {
          level: 6
        }
      });

      currentDownloadUrl = URL.createObjectURL(zipBlob);

      downloadBtn.href = currentDownloadUrl;
      downloadBtn.download = `${baseFileName}-sayfalara-ayrildi.zip`;
      downloadBtn.hidden = false;
      downloadBtn.classList.remove("is-disabled");
      downloadBtn.setAttribute("aria-disabled", "false");

      updateProgress(100, "ZIP dosyası hazır.");
      setMessage("Hazır! Her sayfa ayrı PDF olarak ZIP dosyasına eklendi.", "success");
    } catch (error) {
      console.error("PDF sayfa sayfa bölme hatası:", error);
      handleProcessError(error, "Her sayfayı ayrı PDF yaparken bir sorun oluştu.");
    } finally {
      setBusy(false);
    }
  }

  function parsePageRange(value, totalPages) {
    if (!value) {
      throw new Error("Lütfen sayfa aralığı yaz. Örnek: 1-3 veya 2,4,6");
    }

    const cleanValue = value.replace(/\s+/g, "");
    const parts = cleanValue.split(",");
    const pages = [];

    for (const part of parts) {
      if (!part) {
        throw new Error("Sayfa aralığı formatı hatalı. Örnek: 1-3,5,8-10");
      }

      if (part.includes("-")) {
        const rangeParts = part.split("-");

        if (rangeParts.length !== 2) {
          throw new Error("Sayfa aralığı formatı hatalı. Örnek: 1-3");
        }

        const start = Number(rangeParts[0]);
        const end = Number(rangeParts[1]);

        if (!Number.isInteger(start) || !Number.isInteger(end)) {
          throw new Error("Sayfa aralığında sadece sayı kullanmalısın.");
        }

        if (start < 1 || end < 1) {
          throw new Error("Sayfa numaraları 1’den küçük olamaz.");
        }

        if (start > end) {
          throw new Error("Sayfa aralığında başlangıç, bitişten büyük olamaz.");
        }

        if (end > totalPages) {
          throw new Error(`Bu PDF toplam ${totalPages} sayfa. ${end}. sayfa bulunmuyor.`);
        }

        for (let page = start; page <= end; page++) {
          pages.push(page);
        }
      } else {
        const page = Number(part);

        if (!Number.isInteger(page)) {
          throw new Error("Sayfa aralığında sadece sayı kullanmalısın.");
        }

        if (page < 1) {
          throw new Error("Sayfa numarası 1’den küçük olamaz.");
        }

        if (page > totalPages) {
          throw new Error(`Bu PDF toplam ${totalPages} sayfa. ${page}. sayfa bulunmuyor.`);
        }

        pages.push(page);
      }
    }

    return Array.from(new Set(pages)).sort(function (a, b) {
      return a - b;
    });
  }

  function updateSelectionSummary() {
    if (!pageCount) {
      selectionSummary.textContent = "PDF yüklendikten sonra sayfalar burada görünecek.";
      return;
    }

    if (currentMode === "range") {
      selectionSummary.textContent = `${pageCount} sayfa hazır. Aralık yazarak ayıklama yapabilirsin.`;
      return;
    }

    if (currentMode === "all") {
      selectionSummary.textContent = `${pageCount} sayfa hazır. Her sayfa ayrı PDF yapılıp ZIP olarak indirilecek.`;
      return;
    }

    const count = selectedPages.size;

    if (count === 0) {
      selectionSummary.textContent = "Henüz sayfa seçilmedi. Ayıklamak istediğin sayfalara tıkla.";
      return;
    }

    const selectedList = Array.from(selectedPages).sort(function (a, b) {
      return a - b;
    });

    const approxTotal = selectedList.reduce(function (total, pageNumber) {
      return total + (pageApproxSizes.get(pageNumber) || 0);
    }, 0);

    const sizeText = approxTotal > 0 ? ` • Yaklaşık toplam ${utils.formatBytes(approxTotal)}` : "";

    selectionSummary.textContent = `${count} sayfa ayıklanacak: ${selectedList.join(", ")}${sizeText}`;
  }

  function updateActionState() {
    if (!selectedFile || !selectedFileBuffer || !pageCount) {
      splitBtn.disabled = true;
      return;
    }

    if (currentMode === "range") {
      splitBtn.textContent = "Aralıkla Ayıkla";
      splitBtn.disabled = pageRangeInput.value.trim().length === 0;
      return;
    }

    if (currentMode === "select") {
      splitBtn.textContent = "Seçili Sayfaları Ayıkla";
      splitBtn.disabled = selectedPages.size === 0;
      return;
    }

    if (currentMode === "all") {
      splitBtn.textContent = "Her Sayfayı Ayrı PDF Yap";
      splitBtn.disabled = false;
      return;
    }

    splitBtn.disabled = true;
  }

  function buildPdfFileName(suffix) {
    const fileName = utils.sanitizeFileName(selectedFile?.name || "pdf");
    return `${fileName}-${suffix}.pdf`;
  }

  function clearFile() {
    selectedFile = null;
    selectedFileBuffer = null;
    pageCount = 0;
    selectedPages = new Set();
    pageApproxSizes = new Map();

    fileInput.value = "";
    pageRangeInput.value = "";
    selectedPanel.hidden = true;

    clearThumbnails();
    resetOutput();
    clearMessage();
    updateActionState();
  }

  function clearThumbnails() {
    pageThumbnailGrid.innerHTML = "";
    selectionSummary.textContent = "PDF yüklendikten sonra sayfalar burada görünecek.";
  }

  function resetOutput() {
    if (currentDownloadUrl) {
      if (utils && typeof utils.revokeDownloadUrl === "function") {
        utils.revokeDownloadUrl(currentDownloadUrl);
      } else if (currentDownloadUrl.startsWith("blob:")) {
        URL.revokeObjectURL(currentDownloadUrl);
      }

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
    splitBtn.disabled = isBusy;

    if (!isBusy) {
      updateActionState();
    }

    if (clearFileBtn) clearFileBtn.disabled = isBusy;
    if (selectFileBtn) selectFileBtn.disabled = isBusy;
    if (pageRangeInput) pageRangeInput.disabled = isBusy;
    if (selectAllBtn) selectAllBtn.disabled = isBusy;
    if (clearSelectionBtn) clearSelectionBtn.disabled = isBusy;

    modeTabs.forEach(function (tab) {
      tab.disabled = isBusy;
    });
  }

  function handleProcessError(error, fallbackMessage) {
    const errorMessage = String(error?.message || "").toLowerCase();

    if (errorMessage.includes("encrypted") || errorMessage.includes("password")) {
      setMessage("Şifreli PDF dosyası işlenemedi. Lütfen şifresiz PDF dosyası dene.", "error");
    } else {
      setMessage(`${fallbackMessage} Dosya bozuk, şifreli veya çok büyük olabilir.`, "error");
    }

    updateProgress(0, "İşlem başarısız oldu.");
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

  updateActionState();
})();