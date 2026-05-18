(function () {
  const utils = window.PDFMerkezi?.utils;

  const dropZone = document.getElementById("dropZone");
  const fileInput = document.getElementById("pdfFiles");
  const selectFilesBtn = document.getElementById("selectFilesBtn");
  const selectedPanel = document.getElementById("selectedPanel");
  const fileList = document.getElementById("fileList");
  const mergeBtn = document.getElementById("mergeBtn");
  const clearFilesBtn = document.getElementById("clearFilesBtn");
  const downloadBtn = document.getElementById("downloadBtn");
  const progressWrap = document.getElementById("progressWrap");
  const progressBar = document.getElementById("progressBar");
  const progressText = document.getElementById("progressText");
  const toolMessage = document.getElementById("toolMessage");

  let selectedFiles = [];
  let currentDownloadUrl = null;

  if (!dropZone || !fileInput || !selectFilesBtn || !selectedPanel || !fileList || !mergeBtn) {
    console.error("PDF Merkezi: PDF Birleştir HTML elemanları bulunamadı.");
    return;
  }

  selectFilesBtn.addEventListener("click", function () {
    fileInput.click();
  });

  fileInput.addEventListener("change", function (event) {
    const files = Array.from(event.target.files || []);
    handleFiles(files);
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
    handleFiles(files);
  });

  if (clearFilesBtn) {
    clearFilesBtn.addEventListener("click", clearFiles);
  }

  mergeBtn.addEventListener("click", mergePdfFiles);

  function handleFiles(files) {
    resetOutput();

    if (!utils) {
      setMessage("PDF yardımcı sistemi yüklenemedi. Sayfayı yenileyip tekrar dene.", "error");
      return;
    }
    console.log("Seçilen dosyalar:", files);

    const pdfFiles = files.filter(function(file) {
      return utils.isPdfFile(file);
    });

    console.log("PDF kabul edilen dosyalar:", pdfFiles);
    const rejectedCount = files.length - pdfFiles.length;

    if (rejectedCount > 0) {
      setMessage(`${rejectedCount} dosya PDF olmadığı için eklenmedi.`, "warning");
    } else {
      clearMessage();
    }

    if (pdfFiles.length === 0) {
      setMessage("PDF dosyası algılanamadı. Lütfen .pdf uzantılı dosya seçtiğinden emin ol.", "error");
      renderFiles();
      return;
    }

    selectedFiles = selectedFiles.concat(pdfFiles);
    renderFiles();
  }

  function renderFiles() {
    fileList.innerHTML = "";

    selectedFiles.forEach(function (file, index) {
      const item = document.createElement("li");
      item.className = "file-item";

      item.innerHTML = `
        <div class="file-index">${index + 1}</div>
        <div class="file-info">
          <strong>${escapeHtml(file.name)}</strong>
          <span>${utils ? utils.formatBytes(file.size) : file.size + " B"}</span>
        </div>
        <button class="remove-file" type="button" aria-label="${escapeHtml(file.name)} dosyasını kaldır">Kaldır</button>
      `;

      const removeButton = item.querySelector(".remove-file");

      removeButton.addEventListener("click", function () {
        selectedFiles.splice(index, 1);
        resetOutput();
        renderFiles();
      });

      fileList.appendChild(item);
    });

    selectedPanel.hidden = selectedFiles.length === 0;
    mergeBtn.disabled = selectedFiles.length < 2;

    if (selectedFiles.length === 1) {
      setMessage("Birleştirme için en az 2 PDF dosyası seçmelisin.", "warning");
    } else if (selectedFiles.length >= 2) {
      setMessage(`${selectedFiles.length} PDF dosyası birleştirmeye hazır.`, "success");
    } else {
      clearMessage();
    }
  }

  async function mergePdfFiles() {
    const PDFLibGlobal = window.PDFLib;
    const PDFDocument = PDFLibGlobal?.PDFDocument;

    if (!PDFDocument) {
      setMessage("PDF motoru yüklenemedi. İnternet bağlantını kontrol edip sayfayı Ctrl + F5 ile yenile.", "error");
      return;
    }

    if (!utils) {
      setMessage("PDF yardımcı sistemi yüklenemedi. Sayfayı yenileyip tekrar dene.", "error");
      return;
    }

    if (selectedFiles.length < 2) {
      setMessage("Lütfen en az 2 PDF dosyası seç.", "warning");
      return;
    }

    resetOutput();
    setBusy(true);
    updateProgress(5, "PDF dosyaları hazırlanıyor...");

    try {
      const mergedPdf = await PDFDocument.create();

      for (let fileIndex = 0; fileIndex < selectedFiles.length; fileIndex++) {
        const file = selectedFiles[fileIndex];

        updateProgress(
          10 + Math.round((fileIndex / selectedFiles.length) * 70),
          `${file.name} okunuyor...`
        );

        const arrayBuffer = await file.arrayBuffer();

        const sourcePdf = await PDFDocument.load(arrayBuffer, {
          ignoreEncryption: false
        });

        const pageIndices = sourcePdf.getPageIndices();
        const copiedPages = await mergedPdf.copyPages(sourcePdf, pageIndices);

        copiedPages.forEach(function (page) {
          mergedPdf.addPage(page);
        });
      }

      updateProgress(88, "Yeni PDF oluşturuluyor...");

      const mergedBytes = await mergedPdf.save({
        useObjectStreams: true,
        addDefaultPage: false
      });

      currentDownloadUrl = utils.createDownloadUrl(mergedBytes);


      downloadBtn.href = currentDownloadUrl;
      downloadBtn.download = buildOutputFileName();
      downloadBtn.hidden = false;
      downloadBtn.classList.remove("is-disabled");
      downloadBtn.setAttribute("aria-disabled", "false");

      updateProgress(100, "PDF başarıyla birleştirildi.");
      setMessage("Hazır! Birleştirilmiş PDF dosyanı indirebilirsin.", "success");
    } catch (error) {
      console.error("PDF birleştirme hatası:", error);

      const errorMessage = String(error?.message || "").toLowerCase();

      if (errorMessage.includes("encrypted") || errorMessage.includes("password")) {
        setMessage("Şifreli PDF dosyaları birleştirilemedi. Lütfen şifresiz PDF dosyaları dene.", "error");
      } else {
        setMessage("PDF birleştirme sırasında bir sorun oluştu. Dosyaların bozuk, şifreli veya çok büyük olabilir.", "error");
      }

      updateProgress(0, "İşlem başarısız oldu.");
    } finally {
      setBusy(false);
    }
  }

  function buildOutputFileName() {
    if (!utils) return "birlestirilmis-pdf.pdf";

    const firstName = utils.sanitizeFileName(selectedFiles[0]?.name || "pdf");
    return `${firstName}-birlestirilmis.pdf`;
  }

  function clearFiles() {
    selectedFiles = [];
    fileInput.value = "";
    resetOutput();
    renderFiles();
    clearMessage();
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
    mergeBtn.disabled = isBusy || selectedFiles.length < 2;

    if (clearFilesBtn) clearFilesBtn.disabled = isBusy;
    if (selectFilesBtn) selectFilesBtn.disabled = isBusy;
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

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }
})();