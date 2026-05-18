(function () {
  const utils = window.PDFMerkezi?.utils;

  const dropZone = document.getElementById("dropZone");
  const fileInput = document.getElementById("pdfFile");
  const selectFileBtn = document.getElementById("selectFileBtn");

  const readerPanel = document.getElementById("readerPanel");
  const viewerFileName = document.getElementById("viewerFileName");
  const fileSummary = document.getElementById("fileSummary");
  const clearFileBtn = document.getElementById("clearFileBtn");

  const prevPageBtn = document.getElementById("prevPageBtn");
  const nextPageBtn = document.getElementById("nextPageBtn");
  const pageNumberInput = document.getElementById("pageNumberInput");
  const pageCountLabel = document.getElementById("pageCountLabel");

  const zoomOutBtn = document.getElementById("zoomOutBtn");
  const zoomInBtn = document.getElementById("zoomInBtn");
  const fitWidthBtn = document.getElementById("fitWidthBtn");
  const zoomLabel = document.getElementById("zoomLabel");

  const readerStage = document.getElementById("readerStage");
  const pdfPages = document.getElementById("pdfPages");
  const thumbList = document.getElementById("thumbList");


  const progressWrap = document.getElementById("progressWrap");
  const progressBar = document.getElementById("progressBar");
  const progressText = document.getElementById("progressText");
  const toolMessage = document.getElementById("toolMessage");

  let pdfDocument = null;
  let selectedFile = null;
  let selectedFileBuffer = null;
  let pageCount = 0;
  let currentPage = 1;
  let scale = 1;
  let isRendering = false;

  if (
    !dropZone ||
    !fileInput ||
    !selectFileBtn ||
    !readerPanel ||
    !readerStage ||
    !pdfPages ||
    !thumbList
  ) {
    console.error("PDF Merkezi: PDF Okuyucu HTML elemanları bulunamadı.");
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

  prevPageBtn.addEventListener("click", function () {
    goToPage(currentPage - 1, true);
  });

  nextPageBtn.addEventListener("click", function () {
    goToPage(currentPage + 1, true);
  });

  pageNumberInput.addEventListener("change", function () {
    goToPage(Number(pageNumberInput.value), true);
  });

  pageNumberInput.addEventListener("keydown", function (event) {
    if (event.key === "Enter") {
      goToPage(Number(pageNumberInput.value), true);
    }
  });

  zoomOutBtn.addEventListener("click", function () {
    setZoom(scale - 0.15);
  });

  zoomInBtn.addEventListener("click", function () {
    setZoom(scale + 0.15);
  });

  fitWidthBtn.addEventListener("click", function () {
    fitWidth(true);
  });

  readerStage.addEventListener("scroll", debounce(updateCurrentPageFromScroll, 80));

  window.addEventListener("resize", debounce(function () {
    if (pdfDocument) {
      fitWidth(false);
    }
  }, 250));

  async function handleFile(file) {
    clearMessage();
    resetReader();

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

    if (!window.pdfjsLib) {
      setMessage("PDF görüntüleme motoru yüklenemedi. İnternet bağlantını kontrol edip sayfayı yenile.", "error");
      return;
    }

    selectedFile = file;
    viewerFileName.textContent = file.name;
    fileSummary.textContent = "PDF hazırlanıyor...";
    readerPanel.hidden = false;

    try {
      updateProgress(10, "PDF dosyası okunuyor...");

      selectedFileBuffer = await file.arrayBuffer();

      updateProgress(25, "PDF görüntüleme motoru hazırlanıyor...");

      const loadingTask = window.pdfjsLib.getDocument({
        data: selectedFileBuffer.slice(0)
      });

      pdfDocument = await loadingTask.promise;
      pageCount = pdfDocument.numPages;
      currentPage = 1;

      pageNumberInput.min = "1";
      pageNumberInput.max = String(pageCount);
      pageNumberInput.value = "1";
      pageCountLabel.textContent = `/ ${pageCount}`;

      fileSummary.textContent = `${pageCount} sayfa`;

      await renderThumbnails();
      await fitWidth(false);

      updateProgress(100, "PDF hazır.");
      setMessage("PDF hazır.", "success");

      setTimeout(function () {
        progressWrap.hidden = true;
      }, 900);
    } catch (error) {
      console.error("PDF okuyucu hatası:", error);

      const errorMessage = String(error?.message || "").toLowerCase();

      resetReader();

      if (errorMessage.includes("encrypted") || errorMessage.includes("password")) {
        setMessage("Şifreli PDF dosyası görüntülenemedi. Lütfen şifresiz PDF dosyası dene.", "error");
      } else {
        setMessage("PDF görüntülenemedi. Dosya bozuk, şifreli veya çok büyük olabilir.", "error");
      }

      updateProgress(0, "İşlem başarısız oldu.");
    }
  }

  async function renderThumbnails() {
    thumbList.innerHTML = "";

    updateProgress(35, "Küçük sayfa önizlemeleri hazırlanıyor...");

    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber++) {
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

      const thumbButton = document.createElement("button");
      thumbButton.className = "pdf-thumb-item";
      thumbButton.type = "button";
      thumbButton.dataset.page = String(pageNumber);

      const thumbNumber = document.createElement("span");
      thumbNumber.className = "pdf-thumb-number";
      thumbNumber.textContent = String(pageNumber);

      thumbButton.appendChild(canvas);
      thumbButton.appendChild(thumbNumber);

      thumbButton.addEventListener("click", function () {
        goToPage(pageNumber, true);
      });

      thumbList.appendChild(thumbButton);

      updateProgress(
        35 + Math.round((pageNumber / pageCount) * 20),
        `${pageNumber}. küçük önizleme hazırlanıyor...`
      );
    }
  }

  async function renderAllPages() {
    if (!pdfDocument || isRendering) return;

    isRendering = true;
    pdfPages.innerHTML = "";

    updateProgress(58, "PDF sayfaları hazırlanıyor...");

    try {
      for (let pageNumber = 1; pageNumber <= pageCount; pageNumber++) {
        const pageWrap = document.createElement("article");
        pageWrap.className = "pdf-page-wrap";
        pageWrap.dataset.page = String(pageNumber);

        const pageLabel = document.createElement("div");
        pageLabel.className = "pdf-page-label";
        pageLabel.textContent = `Sayfa ${pageNumber}`;

        const canvas = document.createElement("canvas");
        canvas.className = "pdf-reader-page";

        pageWrap.appendChild(pageLabel);
        pageWrap.appendChild(canvas);
        pdfPages.appendChild(pageWrap);

        const page = await pdfDocument.getPage(pageNumber);
        const viewport = page.getViewport({ scale: scale });
        const context = canvas.getContext("2d", { alpha: false });

        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;

        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, canvas.width, canvas.height);

        await page.render({
          canvasContext: context,
          viewport: viewport
        }).promise;

        updateProgress(
          58 + Math.round((pageNumber / pageCount) * 36),
          `${pageNumber}. sayfa görüntüleniyor...`
        );
      }

      updateToolbarState();
      updateZoomLabel();
      updateCurrentPageFromScroll();
    } finally {
      isRendering = false;
    }
  }

  function goToPage(pageNumber, smooth) {
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

    const pageElement = pdfPages.querySelector(`[data-page="${pageNumber}"]`);

    if (!pageElement) return;

    pageElement.scrollIntoView({
      behavior: smooth ? "smooth" : "auto",
      block: "start"
    });

    setCurrentPage(pageNumber);
    clearMessage();
  }

  function updateCurrentPageFromScroll() {
    if (!pdfDocument) return;

    const pages = Array.from(pdfPages.querySelectorAll(".pdf-page-wrap"));
    const stageRect = readerStage.getBoundingClientRect();
    const anchorY = stageRect.top + 120;

    let closestPage = currentPage;
    let closestDistance = Infinity;

    pages.forEach(function (pageElement) {
      const rect = pageElement.getBoundingClientRect();
      const distance = Math.abs(rect.top - anchorY);

      if (distance < closestDistance) {
        closestDistance = distance;
        closestPage = Number(pageElement.dataset.page);
      }
    });

    setCurrentPage(closestPage);
  }

  function setCurrentPage(pageNumber) {
    currentPage = pageNumber;
    pageNumberInput.value = String(currentPage);

    document.querySelectorAll(".pdf-thumb-item").forEach(function (thumb) {
      thumb.classList.toggle("is-active", Number(thumb.dataset.page) === currentPage);
    });

    updateToolbarState();
  }

  async function setZoom(nextScale) {
    if (!pdfDocument || isRendering) return;

    const oldPage = currentPage;
    const oldScrollTop = readerStage.scrollTop;
    const oldScrollHeight = readerStage.scrollHeight;
    const oldScale = scale;

    scale = Math.min(3, Math.max(0.45, nextScale));

    if (scale === oldScale) return;

    resetOutputOnly();
    await renderAllPages();

    const newScrollHeight = readerStage.scrollHeight;

    if (oldScrollHeight > 0) {
      const ratio = oldScrollTop / oldScrollHeight;
      readerStage.scrollTop = ratio * newScrollHeight;
    }

    const pageElement = pdfPages.querySelector(`[data-page="${oldPage}"]`);

    if (pageElement) {
      const stageRect = readerStage.getBoundingClientRect();
      const pageRect = pageElement.getBoundingClientRect();
      const offset = pageRect.top - stageRect.top;

      readerStage.scrollTop += offset - 90;
    }

    setCurrentPage(oldPage);
  }

 
  async function fitWidth(showMessage) {
    if (!pdfDocument || isRendering) return;

    const oldPage = currentPage;

    const firstPage = await pdfDocument.getPage(1);
    const viewport = firstPage.getViewport({ scale: 1 });

    const availableWidth = Math.max(320, readerStage.clientWidth - 72);
    const nextScale = Math.min(2.4, Math.max(0.45, availableWidth / viewport.width));

    if (nextScale === scale && pdfPages.children.length > 0) return;

    scale = nextScale;

    resetOutputOnly();
    await renderAllPages();

    const pageElement = pdfPages.querySelector(`[data-page="${oldPage}"]`);

    if (pageElement) {
      const stageRect = readerStage.getBoundingClientRect();
      const pageRect = pageElement.getBoundingClientRect();
      const offset = pageRect.top - stageRect.top;

      readerStage.scrollTop += offset - 90;
    }

    setCurrentPage(oldPage);

    if (showMessage) {
      setMessage("PDF çalışma alanı.", "success");
    }
  }

  function updateToolbarState() {
    const hasPdf = Boolean(pdfDocument);

    prevPageBtn.disabled = !hasPdf || currentPage <= 1;
    nextPageBtn.disabled = !hasPdf || currentPage >= pageCount;
    pageNumberInput.disabled = !hasPdf;
    zoomOutBtn.disabled = !hasPdf || scale <= 0.45 || isRendering;
    zoomInBtn.disabled = !hasPdf || scale >= 3 || isRendering;
    fitWidthBtn.disabled = !hasPdf || isRendering;
  }

  function updateZoomLabel() {
    zoomLabel.textContent = `%${Math.round(scale * 100)}`;
  }

  function resetReader() {
    pdfDocument = null;
    selectedFile = null;
    selectedFileBuffer = null;
    pageCount = 0;
    currentPage = 1;
    scale = 1;
    isRendering = false;

    pdfPages.innerHTML = "";
    thumbList.innerHTML = "";

    pageNumberInput.value = "1";
    pageNumberInput.removeAttribute("max");
    pageCountLabel.textContent = "/ 0";
    zoomLabel.textContent = "%100";

    viewerFileName.textContent = "PDF Okuyucu";
    fileSummary.textContent = "Seçilen PDF dosyası hazırlanıyor.";


    progressWrap.hidden = true;
    updateProgress(0, "");
    updateToolbarState();
  }

  function clearFile() {
    fileInput.value = "";
    readerPanel.hidden = true;
    resetReader();
    clearMessage();
  }

  function resetOutputOnly() {
    progressWrap.hidden = true;
    updateProgress(0, "");
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
})();