(function () {
  const utils = window.PDFMerkezi?.utils;
  const mode = document.body?.dataset?.securityMode || "encrypt";

  const isEncryptMode = mode === "encrypt";
  const isDecryptMode = mode === "decrypt";

  const dropZone = document.getElementById("dropZone");
  const fileInput = document.getElementById("pdfFile");
  const selectFileBtn = document.getElementById("selectFileBtn");
  const selectedPanel = document.getElementById("selectedPanel");

  const selectedFileName = document.getElementById("selectedFileName");
  const selectedFileMeta = document.getElementById("selectedFileMeta");
  const clearFileBtn = document.getElementById("clearFileBtn");

  const passwordInput = document.getElementById("passwordInput");
  const passwordRepeatInput = document.getElementById("passwordRepeatInput");

  const processBtn = document.getElementById("processBtn");
  const downloadBtn = document.getElementById("downloadBtn");

  const progressWrap = document.getElementById("progressWrap");
  const progressBar = document.getElementById("progressBar");
  const progressText = document.getElementById("progressText");
  const toolMessage = document.getElementById("toolMessage");

  let qpdf = null;
  let qpdfLoadingPromise = null;

  let selectedFile = null;
  let outputUrl = null;
  let outputFileName = "";

  if (
    !utils ||
    !dropZone ||
    !fileInput ||
    !selectFileBtn ||
    !selectedPanel ||
    !selectedFileName ||
    !selectedFileMeta ||
    !clearFileBtn ||
    !passwordInput ||
    !processBtn ||
    !downloadBtn
  ) {
    console.error("PDF Merkezi: PDF güvenlik gerekli HTML elemanları bulunamadı.");
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
  processBtn.addEventListener("click", processPdf);

  downloadBtn.addEventListener("click", function () {
    if (!outputUrl) return;
    forceDownload(outputUrl, outputFileName || "pdf-merkezi.pdf");
  });

  [passwordInput, passwordRepeatInput].forEach(function (input) {
    if (!input) return;

    input.addEventListener("input", function () {
      resetOutput();
      clearMessage();
    });
  });

  function handleFile(file) {
    clearMessage();
    resetOutput();

    selectedFile = null;

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
    selectedFileMeta.textContent = `${utils.formatBytes(file.size)} • İşleme hazır`;

    setMessage(isEncryptMode ? "PDF hazır. Parola yazarak şifreleyebilirsin." : "PDF hazır. Parola biliyorsan yazabilir veya kısıt kaldırmayı deneyebilirsin.", "success");
  }

  async function processPdf() {
    if (!selectedFile) {
      setMessage("Lütfen önce bir PDF dosyası seç.", "warning");
      return;
    }

    resetOutput();

    const password = String(passwordInput.value || "").trim();
    const passwordRepeat = passwordRepeatInput ? String(passwordRepeatInput.value || "").trim() : "";

    if (isEncryptMode) {
      if (!password) {
        setMessage("PDF şifrelemek için parola yazmalısın.", "warning");
        return;
      }

      if (password.length < 4) {
        setMessage("Lütfen en az 4 karakterli bir parola yaz.", "warning");
        return;
      }

      if (passwordRepeatInput && password !== passwordRepeat) {
        setMessage("Parola tekrar alanı aynı değil.", "warning");
        return;
      }
    }

    setBusy(true);

    try {
      updateProgress(5, "QPDF motoru hazırlanıyor...");
      await loadQpdf();

      updateProgress(20, "PDF dosyası okunuyor...");

      if (isEncryptMode) {
        await encryptPdf(password);
      } else if (isDecryptMode) {
        await decryptPdf(password);
      }
    } catch (error) {
      console.error("PDF güvenlik işlemi hatası:", error);

      if (isEncryptMode) {
        setMessage("PDF şifrelenirken bir sorun oluştu. Farklı bir PDF dosyası dene.", "error");
      } else {
        setMessage("PDF şifresi veya kısıtı kaldırılamadı. Parola yanlış olabilir ya da PDF desteklenmiyor olabilir.", "error");
      }

      updateProgress(0, "İşlem başarısız oldu.");
    } finally {
      setBusy(false);
    }
  }

  async function loadQpdf() {
    if (qpdf) return qpdf;

    if (qpdfLoadingPromise) {
      return qpdfLoadingPromise;
    }

    if (typeof window.Module !== "function") {
      throw new Error("QPDF motoru yüklenemedi. qpdf.js bulunamadı.");
    }

    qpdfLoadingPromise = window.Module({
      locateFile: function (path) {
        if (path.endsWith(".wasm")) {
          return "https://cdn.jsdelivr.net/npm/@neslinesli93/qpdf-wasm@0.3.0/dist/qpdf.wasm";
        }

        return path;
      },
      noInitialRun: true
    }).then(function (instance) {
      qpdf = instance;
      return qpdf;
    });

    return qpdfLoadingPromise;
  }

  async function encryptPdf(password) {
    const inputPath = "/input-encrypt.pdf";
    const outputPath = "/output-encrypt.pdf";

    cleanupFile(inputPath);
    cleanupFile(outputPath);

    updateProgress(35, "PDF sanal dosya sistemine alınıyor...");

    const bytes = new Uint8Array(await selectedFile.arrayBuffer());
    qpdf.FS.writeFile(inputPath, bytes);

    updateProgress(55, "PDF açılış parolası ekleniyor...");

    const args = [
      "--encrypt",
      password,
      password,
      "256",
      "--",
      inputPath,
      outputPath
    ];

    const exitCode = qpdf.callMain(args);

    if (exitCode !== 0 && exitCode !== 3) {
      throw new Error("QPDF şifreleme komutu başarısız oldu. Çıkış kodu: " + exitCode);
    }

    updateProgress(80, "Şifreli PDF hazırlanıyor...");

    const outputBytes = qpdf.FS.readFile(outputPath);

    outputUrl = URL.createObjectURL(
      new Blob([outputBytes], {
        type: "application/pdf"
      })
    );

    outputFileName = addSuffix(selectedFile.name, "sifreli");

    downloadBtn.disabled = false;

    selectedFileMeta.textContent = `${utils.formatBytes(selectedFile.size)} → ${utils.formatBytes(outputBytes.length)}`;

    updateProgress(100, "Şifreli PDF hazır.");
    setMessage("Hazır! Şifreli PDF dosyanı indirebilirsin. Dosyayı açarken parola istemelidir.", "success");

    setTimeout(function () {
      progressWrap.hidden = true;
    }, 900);
  }

  async function decryptPdf(password) {
    const inputPath = "/input-decrypt.pdf";
    const outputPath = "/output-decrypt.pdf";

    cleanupFile(inputPath);
    cleanupFile(outputPath);

    updateProgress(35, "PDF sanal dosya sistemine alınıyor...");

    const bytes = new Uint8Array(await selectedFile.arrayBuffer());
    qpdf.FS.writeFile(inputPath, bytes);

    updateProgress(55, password ? "Parola ile PDF şifresi kaldırılıyor..." : "PDF kısıtları kaldırılmaya deneniyor...");

    const args = password
      ? [
          "--password=" + password,
          "--decrypt",
          inputPath,
          outputPath
        ]
      : [
          "--decrypt",
          inputPath,
          outputPath
        ];

    const exitCode = qpdf.callMain(args);

    if (exitCode !== 0 && exitCode !== 3) {
      throw new Error("QPDF şifre kaldırma komutu başarısız oldu. Çıkış kodu: " + exitCode);
    }

    updateProgress(80, "Çıktı PDF hazırlanıyor...");

    const outputBytes = qpdf.FS.readFile(outputPath);

    outputUrl = URL.createObjectURL(
      new Blob([outputBytes], {
        type: "application/pdf"
      })
    );

    outputFileName = addSuffix(selectedFile.name, "sifresiz");

    downloadBtn.disabled = false;

    selectedFileMeta.textContent = `${utils.formatBytes(selectedFile.size)} → ${utils.formatBytes(outputBytes.length)}`;

    updateProgress(100, "PDF hazır.");

    if (password) {
      setMessage("Hazır! Parolası kaldırılmış PDF dosyanı indirebilirsin.", "success");
    } else {
      setMessage("Hazır! PDF açılıyorsa ama kısıtlıysa kısıtlar kaldırılmış olabilir. Çıktıyı indirip kontrol et.", "success");
    }

    setTimeout(function () {
      progressWrap.hidden = true;
    }, 900);
  }

  function cleanupFile(path) {
    if (!qpdf) return;

    try {
      qpdf.FS.unlink(path);
    } catch (error) {
      // Dosya yoksa sorun değil.
    }
  }

  function clearFile() {
    selectedFile = null;
    fileInput.value = "";
    selectedPanel.hidden = true;

    selectedFileName.textContent = "PDF seçildi";
    selectedFileMeta.textContent = "Dosya hazırlanıyor.";

    if (passwordInput) {
      passwordInput.value = "";
    }

    if (passwordRepeatInput) {
      passwordRepeatInput.value = "";
    }

    resetOutput();
    clearMessage();

    if (progressWrap) {
      progressWrap.hidden = true;
    }

    updateProgress(0, "");
  }

  function resetOutput() {
    if (outputUrl) {
      URL.revokeObjectURL(outputUrl);
      outputUrl = null;
    }

    outputFileName = "";
    downloadBtn.disabled = true;

    if (progressWrap) {
      progressWrap.hidden = true;
    }

    updateProgress(0, "");
  }

  function setBusy(isBusy) {
    processBtn.disabled = isBusy;
    clearFileBtn.disabled = isBusy;
    selectFileBtn.disabled = isBusy;
    fileInput.disabled = isBusy;
    passwordInput.disabled = isBusy;

    if (passwordRepeatInput) {
      passwordRepeatInput.disabled = isBusy;
    }
  }

  function addSuffix(fileName, suffix) {
    const clean = String(fileName || "pdf").replace(/\.pdf$/i, "");
    return clean + "-" + suffix + ".pdf";
  }

  function forceDownload(url, fileName) {
    const link = document.createElement("a");

    link.href = url;
    link.download = fileName;
    link.style.display = "none";

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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