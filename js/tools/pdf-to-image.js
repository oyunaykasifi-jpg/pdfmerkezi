(function () {
  const utils = window.PDFMerkezi?.utils;

  const outputFormat = getOutputFormat();
  const outputLabel = outputFormat.toUpperCase();
  const outputMime = outputFormat === "png" ? "image/png" : "image/jpeg";

  const dropZone = document.getElementById("dropZone");
  const fileInput = document.getElementById("pdfFile");
  const selectFileBtn = document.getElementById("selectFileBtn");
  const selectedPanel = document.getElementById("selectedPanel");

  const selectedFileName = document.getElementById("selectedFileName");
  const selectedFileMeta = document.getElementById("selectedFileMeta");
  const clearFileBtn = document.getElementById("clearFileBtn");

  const qualitySelect = document.getElementById("qualitySelect");
  const scaleSelect = document.getElementById("scaleSelect");

  const convertBtn = document.getElementById("convertBtn");

  const progressWrap = document.getElementById("progressWrap");
  const progressBar = document.getElementById("progressBar");
  const progressText = document.getElementById("progressText");

  const toolMessage = document.getElementById("toolMessage");

  const resultPanel = document.getElementById("resultPanel");
  const resultSummary = document.getElementById("resultSummary");
  const resultGrid = document.getElementById("resultGrid");

  let selectedFile = null;
  let selectedFileBuffer = null;
  let pdfDocument = null;
  let pageCount = 0;
  let generatedUrls = [];

  if (
    !utils ||
    !dropZone ||
    !fileInput ||
    !selectFileBtn ||
    !selectedPanel ||
    !selectedFileName ||
    !selectedFileMeta ||
    !clearFileBtn ||
    !scaleSelect ||
    !convertBtn ||
    !resultPanel ||
    !resultGrid
  ) {
    console.error("PDF Merkezi: PDF görsel dönüştürme gerekli HTML elemanları bulunamadı.");
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

  convertBtn.addEventListener("click", convertPdfToImages);

  if (qualitySelect) {
    qualitySelect.addEventListener("change", resetResults);
  }

  scaleSelect.addEventListener("change", resetResults);

  async function handleFile(file) {
    clearMessage();
    resetResults();
    revokeGeneratedUrls();

    selectedFile = null;
    selectedFileBuffer = null;
    pdfDocument = null;
    pageCount = 0;

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
    convertBtn.disabled = true;

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
      convertBtn.disabled = false;

      updateProgress(100, "PDF hazır.");
      setMessage(`PDF hazır. ${outputLabel} görselleri hazırlayabilirsin.`, "success");

      setTimeout(function () {
        progressWrap.hidden = true;
      }, 700);
    } catch (error) {
      console.error(`PDF ${outputLabel} hazırlama hatası:`, error);

      selectedFile = null;
      selectedFileBuffer = null;
      pdfDocument = null;
      pageCount = 0;
      convertBtn.disabled = true;

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

  async function convertPdfToImages() {
    if (!pdfDocument || !selectedFile) {
      setMessage("Lütfen önce bir PDF dosyası seç.", "warning");
      return;
    }

    resetResults();
    revokeGeneratedUrls();

    const quality = qualitySelect ? Number(qualitySelect.value) || 0.92 : undefined;
    const scale = Number(scaleSelect.value) || 2;

    convertBtn.disabled = true;
    clearFileBtn.disabled = true;
    scaleSelect.disabled = true;

    if (qualitySelect) {
      qualitySelect.disabled = true;
    }

    try {
      updateProgress(3, `${outputLabel} dönüştürme başlıyor...`);
      setMessage(`PDF sayfaları ${outputLabel} olarak hazırlanıyor...`, "warning");

      const safeBaseName = utils.sanitizeFileName(selectedFile.name || "pdf");
      const resultItems = [];

      for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
        updateProgress(
          Math.round(((pageNumber - 1) / pageCount) * 80) + 5,
          `${pageNumber}. sayfa ${outputLabel} olarak hazırlanıyor...`
        );

        const page = await pdfDocument.getPage(pageNumber);
        const viewport = page.getViewport({ scale });

        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d", { alpha: outputFormat === "png" });

        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);

        if (outputFormat !== "png") {
          context.fillStyle = "#ffffff";
          context.fillRect(0, 0, canvas.width, canvas.height);
        } else {
          context.clearRect(0, 0, canvas.width, canvas.height);
        }

        await page.render({
          canvasContext: context,
          viewport
        }).promise;

        const blob = await canvasToBlob(canvas, outputMime, quality);

        if (!blob) {
          throw new Error(`${pageNumber}. sayfa ${outputLabel} olarak oluşturulamadı.`);
        }

        const url = URL.createObjectURL(blob);
        generatedUrls.push(url);

        const filename = `${safeBaseName}-sayfa-${String(pageNumber).padStart(2, "0")}.${outputFormat}`;

        resultItems.push({
          pageNumber,
          url,
          filename,
          size: blob.size,
          width: canvas.width,
          height: canvas.height
        });
      }

      updateProgress(90, "Sonuçlar hazırlanıyor...");

      renderResults(resultItems);

      updateProgress(100, `${outputLabel} dosyaları hazır.`);
      setMessage(`Hazır! PDF sayfalarını ${outputLabel} olarak indirebilirsin.`, "success");

      resultPanel.hidden = false;
      resultSummary.textContent = `${resultItems.length} ${outputLabel} dosyası hazırlandı.`;

      setTimeout(function () {
        progressWrap.hidden = true;
      }, 900);
    } catch (error) {
      console.error(`PDF ${outputLabel} dönüştürme hatası:`, error);
      setMessage(`PDF ${outputLabel} dönüştürme sırasında bir sorun oluştu. Farklı çözünürlük seçerek tekrar dene.`, "error");
      updateProgress(0, "İşlem başarısız oldu.");
    } finally {
      convertBtn.disabled = false;
      clearFileBtn.disabled = false;
      scaleSelect.disabled = false;

      if (qualitySelect) {
        qualitySelect.disabled = false;
      }
    }
  }

  function renderResults(items) {
    resultGrid.innerHTML = "";

    items.forEach(function (item) {
      const card = document.createElement("article");
      card.className = "image-result-card";

      const previewWrap = document.createElement("div");
      previewWrap.className = "image-result-preview";

      const img = document.createElement("img");
      img.src = item.url;
      img.alt = `${item.pageNumber}. sayfa ${outputLabel} önizlemesi`;
      img.loading = "lazy";

      previewWrap.appendChild(img);

      const body = document.createElement("div");
      body.className = "image-result-body";

      const title = document.createElement("strong");
      title.textContent = `${item.pageNumber}. Sayfa`;

      const meta = document.createElement("span");
      meta.textContent = `${item.width} × ${item.height}px • ${utils.formatBytes(item.size)}`;

      const download = document.createElement("a");
      download.className = "btn btn-secondary";
      download.href = item.url;
      download.download = item.filename;
      download.textContent = `${outputLabel} İndir`;

      body.appendChild(title);
      body.appendChild(meta);
      body.appendChild(download);

      card.appendChild(previewWrap);
      card.appendChild(body);

      resultGrid.appendChild(card);
    });
  }

  function canvasToBlob(canvas, type, quality) {
    return new Promise(function (resolve) {
      if (type === "image/png") {
        canvas.toBlob(function (blob) {
          resolve(blob);
        }, type);
        return;
      }

      canvas.toBlob(function (blob) {
        resolve(blob);
      }, type, quality);
    });
  }

  function resetResults() {
    resultPanel.hidden = true;
    resultGrid.innerHTML = "";
    resultSummary.textContent = `Sayfalar ${outputLabel} olarak hazırlandı.`;
    clearMessage();
  }

  function clearFile() {
    revokeGeneratedUrls();

    selectedFile = null;
    selectedFileBuffer = null;
    pdfDocument = null;
    pageCount = 0;

    fileInput.value = "";
    selectedPanel.hidden = true;
    selectedFileName.textContent = "PDF seçildi";
    selectedFileMeta.textContent = "Dosya hazırlanıyor.";

    convertBtn.disabled = false;
    clearFileBtn.disabled = false;
    scaleSelect.disabled = false;

    if (qualitySelect) {
      qualitySelect.disabled = false;
    }

    resetResults();
    clearMessage();

    if (progressWrap) {
      progressWrap.hidden = true;
    }

    updateProgress(0, "");
  }

  function revokeGeneratedUrls() {
    generatedUrls.forEach(function (url) {
      URL.revokeObjectURL(url);
    });

    generatedUrls = [];
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

  function getOutputFormat() {
    const bodyFormat = document.body?.dataset?.outputFormat;

    if (bodyFormat) {
      return bodyFormat.toLowerCase();
    }

    const path = window.location.pathname.toLowerCase();

    if (path.includes("pdf-png")) return "png";
    if (path.includes("pdf-jpeg")) return "jpeg";

    return "jpg";
  }
})();