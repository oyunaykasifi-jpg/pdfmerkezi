(function () {
  const utils = window.PDFMerkezi?.utils;

  const dropZone = document.getElementById("dropZone");
  const fileInput = document.getElementById("pdfFile");
  const imageFileInput = document.getElementById("imageFileInput");
  const selectFileBtn = document.getElementById("selectFileBtn");
  const selectedPanel = document.getElementById("selectedPanel");

  const viewerFileName = document.getElementById("viewerFileName");
  const fileSummary = document.getElementById("fileSummary");
  const clearFileBtn = document.getElementById("clearFileBtn");

  const toolButtons = document.querySelectorAll(".fabric-editor-tool");
  const fontFamilySelect = document.getElementById("fontFamilySelect");
  const fontSizeInput = document.getElementById("fontSizeInput");
  const strokeWidthInput = document.getElementById("strokeWidthInput");
  const opacityInput = document.getElementById("opacityInput");
  const boldInput = document.getElementById("boldInput");
  const italicInput = document.getElementById("italicInput");

  const colorDots = document.querySelectorAll(".fabric-editor-colors .color-dot[data-color]");
  const customColorBtn = document.getElementById("customColorBtn");
  const customColorInput = document.getElementById("customColorInput");

  const deleteSelectedBtn = document.getElementById("deleteSelectedBtn");
  const undoBtn = document.getElementById("undoBtn");
  const redoBtn = document.getElementById("redoBtn");
  const clearPageBtn = document.getElementById("clearPageBtn");

  const prevPageBtn = document.getElementById("prevPageBtn");
  const nextPageBtn = document.getElementById("nextPageBtn");
  const pageNumberInput = document.getElementById("pageNumberInput");
  const pageCountLabel = document.getElementById("pageCountLabel");
  const fitWidthBtn = document.getElementById("fitWidthBtn");

  const previewStage = document.getElementById("previewStage");
  const fabricCanvasElement = document.getElementById("fabricCanvas");
  const editorHelpText = document.getElementById("editorHelpText");

  const exportPdfBtn = document.getElementById("exportPdfBtn");
  const downloadBtn = document.getElementById("downloadBtn");

  const progressWrap = document.getElementById("progressWrap");
  const progressBar = document.getElementById("progressBar");
  const progressText = document.getElementById("progressText");
  const toolMessage = document.getElementById("toolMessage");

  let selectedFile = null;
  let selectedFileBuffer = null;
  let pdfDocument = null;
  let pageCount = 0;
  let currentPage = 1;
  let currentTool = "select";
  let selectedColor = "#2563eb";
  let currentDownloadUrl = null;
  let isRendering = false;

  let canvas = null;
  let pageStates = new Map();
  let undoStackByPage = new Map();
  let redoStackByPage = new Map();
  let isRestoringState = false;

  if (
    !utils ||
    !dropZone ||
    !fileInput ||
    !imageFileInput ||
    !selectFileBtn ||
    !selectedPanel ||
    !fabricCanvasElement ||
    !exportPdfBtn ||
    !downloadBtn
  ) {
    console.error("PDF Merkezi: PDF Düzenle gerekli elemanları bulamadı.");
    return;
  }

  if (!window.fabric) {
    setMessage("Fabric editör motoru yüklenemedi. Sayfayı yenileyip tekrar dene.", "error");
    return;
  }

  initFabricCanvas();
  bindEvents();
  updateToolbarState();
  updateActionState();

  function bindEvents() {
    selectFileBtn.addEventListener("click", function () {
      fileInput.click();
    });

    fileInput.addEventListener("change", function (event) {
      const file = event.target.files?.[0] || null;
      fileInput.value = "";
      handlePdfFile(file);
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
      handlePdfFile(event.dataTransfer.files?.[0] || null);
    });

    clearFileBtn.addEventListener("click", clearFile);

    toolButtons.forEach(function (button) {
      button.addEventListener("click", function () {
        const tool = button.dataset.tool;

        if (tool === "image") {
          imageFileInput.click();
          return;
        }

        setTool(tool);
      });
    });

    imageFileInput.addEventListener("change", function (event) {
      const file = event.target.files?.[0] || null;
      imageFileInput.value = "";

      if (!file) return;

      if (!file.type.includes("png") && !file.type.includes("jpeg") && !file.type.includes("jpg")) {
        setMessage("Lütfen PNG veya JPG görsel seç.", "error");
        return;
      }

      const reader = new FileReader();

      reader.onload = function () {
        addImageToCanvas(reader.result);
      };

      reader.onerror = function () {
        setMessage("Görsel okunamadı. Farklı bir dosya dene.", "error");
      };

      reader.readAsDataURL(file);
    });

    colorDots.forEach(function (dot) {
      dot.addEventListener("click", function () {
        selectedColor = dot.dataset.color;

        colorDots.forEach(function (item) {
          item.classList.remove("is-active");
        });

        customColorBtn.classList.remove("is-active");
        dot.classList.add("is-active");

        applyStyleToSelected();
      });
    });

    customColorBtn.addEventListener("click", function () {
      customColorInput.click();
    });

    customColorInput.addEventListener("input", function () {
      selectedColor = customColorInput.value;

      colorDots.forEach(function (item) {
        item.classList.remove("is-active");
      });

      customColorBtn.classList.add("is-active");
      customColorBtn.style.setProperty("--dot-color", selectedColor);

      applyStyleToSelected();
    });

    [fontFamilySelect, fontSizeInput, strokeWidthInput, opacityInput, boldInput, italicInput].forEach(function (input) {
      input.addEventListener("input", applyStyleToSelected);
      input.addEventListener("change", applyStyleToSelected);
    });

    deleteSelectedBtn.addEventListener("click", deleteSelectedObject);
    undoBtn.addEventListener("click", undoLastAction);

    if (redoBtn) {
      redoBtn.addEventListener("click", redoLastAction);
    }

    clearPageBtn.addEventListener("click", clearCurrentPageEdits);

    prevPageBtn.addEventListener("click", function () {
      goToPage(currentPage - 1);
    });

    nextPageBtn.addEventListener("click", function () {
      goToPage(currentPage + 1);
    });

    pageNumberInput.addEventListener("change", function () {
      goToPage(Number(pageNumberInput.value));
    });

    pageNumberInput.addEventListener("keydown", function (event) {
      if (event.key === "Enter") {
        goToPage(Number(pageNumberInput.value));
      }
    });

    fitWidthBtn.addEventListener("click", function () {
      if (pdfDocument) {
        renderCurrentPage();
        setMessage("Sayfa çalışma alanına sığdırıldı.", "success");
      }
    });

    exportPdfBtn.addEventListener("click", exportEditedPdf);

    document.addEventListener("keydown", function (event) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        undoLastAction();
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") {
        event.preventDefault();
        redoLastAction();
      }

      if ((event.key === "Delete" || event.key === "Backspace") && canvas?.getActiveObject()) {
        event.preventDefault();
        deleteSelectedObject();
      }
    });

    window.addEventListener("resize", debounce(function () {
      if (pdfDocument) {
        renderCurrentPage();
      }
    }, 250));
  }

  function initFabricCanvas() {
    canvas = new window.fabric.Canvas("fabricCanvas", {
      preserveObjectStacking: true,
      selection: true,
      backgroundColor: "#ffffff"
    });

    canvas.setWidth(800);
    canvas.setHeight(600);

    canvas.on("object:added", function (event) {
      if (event.target && !isRestoringState) {
        markObjectAsEditable(event.target);
        saveCurrentPageState();
        resetOutput();
        updateActionState();
      }
    });

    canvas.on("path:created", function (event) {
      if (event.path) {
        markObjectAsEditable(event.path);
      }

      saveCurrentPageState();
      resetOutput();
      updateActionState();
    });

    canvas.on("object:modified", function () {
      if (isRestoringState) return;

      saveCurrentPageState();
      resetOutput();
      updateActionState();
    });

    canvas.on("object:removed", function () {
      if (isRestoringState) return;

      saveCurrentPageState();
      resetOutput();
      updateActionState();
    });

    canvas.on("selection:created", syncControlsFromSelection);
    canvas.on("selection:updated", syncControlsFromSelection);

    canvas.on("mouse:down", function (event) {
      if (!pdfDocument) return;

      if (currentTool === "draw") {
        pushUndoState();
        return;
      }

      if (currentTool === "select") return;

      const pointer = canvas.getPointer(event.e);

      if (currentTool === "text") {
        addTextToCanvas(pointer.x, pointer.y);
        setTool("select");
        return;
      }

      if (currentTool === "rect") {
        addRectangleToCanvas(pointer.x, pointer.y);
        setTool("select");
        return;
      }

      if (currentTool === "circle") {
        addCircleToCanvas(pointer.x, pointer.y);
        setTool("select");
        return;
      }

      if (currentTool === "line") {
        addLineToCanvas(pointer.x, pointer.y);
        setTool("select");
        return;
      }

      if (currentTool === "highlight") {
        addHighlightToCanvas(pointer.x, pointer.y);
        setTool("select");
        return;
      }

      if (currentTool === "whiteout") {
        addWhiteoutToCanvas(pointer.x, pointer.y);
        setTool("select");
      }
    });
  }

  async function handlePdfFile(file) {
    resetAllState();
    resetOutput();
    clearMessage();

    if (!file) {
      setMessage("Lütfen bir PDF dosyası seç.", "warning");
      return;
    }

    if (!utils.isPdfFile(file)) {
      setMessage("PDF dosyası algılanamadı. Lütfen geçerli bir .pdf dosyası seç.", "error");
      return;
    }

    if (!window.pdfjsLib || !window.PDFLib?.PDFDocument) {
      setMessage("PDF motoru yüklenemedi. Sayfayı Ctrl + F5 ile yenileyip tekrar dene.", "error");
      return;
    }

    selectedFile = file;
    selectedPanel.hidden = false;
    viewerFileName.textContent = file.name;
    fileSummary.textContent = "PDF hazırlanıyor...";

    try {
      updateProgress(12, "PDF dosyası okunuyor...");
      selectedFileBuffer = await file.arrayBuffer();

      const pdfLibDoc = await window.PDFLib.PDFDocument.load(selectedFileBuffer.slice(0), {
        ignoreEncryption: false
      });

      pageCount = pdfLibDoc.getPageCount();

      if (pageCount < 1) {
        throw new Error("PDF içinde sayfa bulunamadı.");
      }

      updateProgress(36, "PDF önizleme hazırlanıyor...");

      const loadingTask = window.pdfjsLib.getDocument({
        data: selectedFileBuffer.slice(0)
      });

      pdfDocument = await loadingTask.promise;

      currentPage = 1;
      pageNumberInput.value = "1";
      pageNumberInput.max = String(pageCount);
      pageCountLabel.textContent = `/ ${pageCount}`;
      fileSummary.textContent = `${pageCount} sayfa • ${utils.formatBytes(file.size)}`;

      await renderCurrentPage();

      updateProgress(100, "PDF hazır.");
      setMessage("PDF hazır. Metin, çizim, görsel, vurgu veya kapatma alanı ekleyebilirsin.", "success");

      updateToolbarState();
      updateActionState();

      setTimeout(function () {
        progressWrap.hidden = true;
      }, 700);
    } catch (error) {
      console.error("PDF düzenleme hazırlama hatası:", error);

      const message = String(error?.message || "").toLowerCase();

      if (message.includes("encrypted") || message.includes("password")) {
        setMessage("Şifreli PDF okunamadı. Lütfen şifresiz bir PDF dosyası dene.", "error");
      } else {
        setMessage("PDF okunamadı. Dosya bozuk, şifreli veya çok büyük olabilir.", "error");
      }

      resetAllState();
      updateProgress(0, "İşlem başarısız oldu.");
    }
  }

  async function renderCurrentPage() {
    if (!pdfDocument || isRendering) return;

    isRendering = true;

    try {
      saveCurrentPageState();
      updateToolbarState();

      const page = await pdfDocument.getPage(currentPage);
      const baseViewport = page.getViewport({ scale: 1 });
      const availableWidth = Math.max(320, previewStage.clientWidth - 80);
      const scale = Math.max(0.35, Math.min(2.5, availableWidth / baseViewport.width));
      const viewport = page.getViewport({ scale });
      const pixelRatio = window.devicePixelRatio || 1;

      const renderCanvas = document.createElement("canvas");
      const renderContext = renderCanvas.getContext("2d", { alpha: false });

      renderCanvas.width = Math.floor(viewport.width * pixelRatio);
      renderCanvas.height = Math.floor(viewport.height * pixelRatio);

      renderContext.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      renderContext.fillStyle = "#ffffff";
      renderContext.fillRect(0, 0, viewport.width, viewport.height);

      await page.render({
        canvasContext: renderContext,
        viewport
      }).promise;

      const backgroundDataUrl = renderCanvas.toDataURL("image/png");

      isRestoringState = true;
      canvas.clear();
      canvas.setWidth(Math.floor(viewport.width));
      canvas.setHeight(Math.floor(viewport.height));
      canvas.backgroundColor = "#ffffff";

      await setPdfBackground(backgroundDataUrl, canvas.width, canvas.height);
      await loadPageState(currentPage);

      isRestoringState = false;

      canvas.discardActiveObject();
      canvas.requestRenderAll();
      updateToolbarState();
    } catch (error) {
      isRestoringState = false;
      console.error("PDF sayfası render edilemedi:", error);
      setMessage("PDF önizleme hazırlanırken bir sorun oluştu.", "error");
    } finally {
      isRendering = false;
      updateToolbarState();
    }
  }

  function setPdfBackground(dataUrl, width, height) {
    return new Promise(function (resolve) {
      window.fabric.Image.fromURL(dataUrl, function (image) {
        image.set({
          left: 0,
          top: 0,
          selectable: false,
          evented: false,
          hoverCursor: "default"
        });

        image.scaleToWidth(width);
        image.scaleToHeight(height);

        canvas.setBackgroundImage(image, function () {
          canvas.requestRenderAll();
          resolve();
        });
      }, { crossOrigin: "anonymous" });
    });
  }

  async function loadPageState(pageNumber) {
    const state = pageStates.get(pageNumber);

    if (!state) return;

    return new Promise(function (resolve) {
      window.fabric.util.enlivenObjects(state.json.objects || [], function (objects) {
        objects.forEach(function (object) {
          markObjectAsEditable(object);
          canvas.add(object);
        });

        canvas.requestRenderAll();
        resolve();
      });
    });
  }

  function saveCurrentPageState() {
    if (!canvas || !pdfDocument || !currentPage || isRestoringState) return;

    const json = getEditableCanvasJson();

    if (!json.objects || json.objects.length === 0) {
      pageStates.delete(currentPage);
      return;
    }

    pageStates.set(currentPage, {
      json,
      width: canvas.width,
      height: canvas.height
    });
  }

  function getEditableCanvasJson() {
    if (!canvas) {
      return {
        version: "5.3.0",
        objects: []
      };
    }

    const editableObjects = canvas.getObjects().filter(function (object) {
      return !object.isPdfBackground;
    });

    return {
      version: "5.3.0",
      objects: editableObjects.map(function (object) {
        return object.toObject(["isPdfBackground"]);
      })
    };
  }

  function applyEditableCanvasJson(json, callback) {
    if (!canvas) return;

    isRestoringState = true;

    canvas.getObjects().forEach(function (object) {
      canvas.remove(object);
    });

    canvas.discardActiveObject();

    if (!json || !Array.isArray(json.objects) || json.objects.length === 0) {
      isRestoringState = false;
      canvas.requestRenderAll();

      if (callback) {
        callback();
      }

      return;
    }

    window.fabric.util.enlivenObjects(json.objects, function (objects) {
      objects.forEach(function (object) {
        markObjectAsEditable(object);
        canvas.add(object);
      });

      isRestoringState = false;
      canvas.discardActiveObject();
      canvas.requestRenderAll();

      if (callback) {
        callback();
      }
    });
  }

  function pushUndoState() {
    if (!canvas || !pdfDocument) return;

    const stack = undoStackByPage.get(currentPage) || [];
    stack.push(getEditableCanvasJson());

    if (stack.length > 30) {
      stack.shift();
    }

    undoStackByPage.set(currentPage, stack);
    redoStackByPage.set(currentPage, []);
  }

  function addTextToCanvas(x, y) {
    pushUndoState();

    const text = new window.fabric.IText("Metin", {
      left: x,
      top: y,
      fontSize: getNumber(fontSizeInput.value, 24),
      fill: selectedColor,
      fontFamily: getFabricFontFamily(),
      fontWeight: boldInput.checked ? "bold" : "normal",
      fontStyle: italicInput.checked ? "italic" : "normal",
      opacity: getOpacity(),
      editable: true
    });

    markObjectAsEditable(text);
    canvas.add(text);
    canvas.setActiveObject(text);
    canvas.requestRenderAll();
    saveCurrentPageState();
    updateActionState();

    setMessage("Metin eklendi. Çift tıklayarak yazıyı değiştirebilirsin.", "success");
  }

  function addRectangleToCanvas(x, y) {
    pushUndoState();

    const rect = new window.fabric.Rect({
      left: x,
      top: y,
      width: 180,
      height: 90,
      fill: "rgba(255,255,255,0)",
      stroke: selectedColor,
      strokeWidth: getNumber(strokeWidthInput.value, 3),
      opacity: getOpacity()
    });

    markObjectAsEditable(rect);
    canvas.add(rect);
    canvas.setActiveObject(rect);
    canvas.requestRenderAll();
    saveCurrentPageState();
    updateActionState();

    setMessage("Dikdörtgen eklendi. Taşıyabilir ve boyutlandırabilirsin.", "success");
  }

  function addCircleToCanvas(x, y) {
    pushUndoState();

    const circle = new window.fabric.Circle({
      left: x,
      top: y,
      radius: 55,
      fill: "rgba(255,255,255,0)",
      stroke: selectedColor,
      strokeWidth: getNumber(strokeWidthInput.value, 3),
      opacity: getOpacity()
    });

    markObjectAsEditable(circle);
    canvas.add(circle);
    canvas.setActiveObject(circle);
    canvas.requestRenderAll();
    saveCurrentPageState();
    updateActionState();

    setMessage("Daire eklendi. Taşıyabilir ve boyutlandırabilirsin.", "success");
  }

  function addLineToCanvas(x, y) {
    pushUndoState();

    const line = new window.fabric.Line([x, y, x + 180, y], {
      stroke: selectedColor,
      strokeWidth: getNumber(strokeWidthInput.value, 3),
      opacity: getOpacity()
    });

    markObjectAsEditable(line);
    canvas.add(line);
    canvas.setActiveObject(line);
    canvas.requestRenderAll();
    saveCurrentPageState();
    updateActionState();

    setMessage("Çizgi eklendi. Taşıyabilir, döndürebilir ve boyutlandırabilirsin.", "success");
  }

  function addHighlightToCanvas(x, y) {
    pushUndoState();

    const rect = new window.fabric.Rect({
      left: x,
      top: y,
      width: 220,
      height: 42,
      fill: selectedColor,
      stroke: selectedColor,
      strokeWidth: 1,
      opacity: Math.min(getOpacity(), 0.35)
    });

    markObjectAsEditable(rect);
    canvas.add(rect);
    canvas.setActiveObject(rect);
    canvas.requestRenderAll();
    saveCurrentPageState();
    updateActionState();

    setMessage("Vurgu eklendi. Taşıyabilir ve boyutlandırabilirsin.", "success");
  }

  function addWhiteoutToCanvas(x, y) {
    pushUndoState();

    const rect = new window.fabric.Rect({
      left: x,
      top: y,
      width: 220,
      height: 70,
      fill: "#ffffff",
      stroke: "#e5e7eb",
      strokeWidth: 1,
      opacity: 1
    });

    markObjectAsEditable(rect);
    canvas.add(rect);
    canvas.setActiveObject(rect);
    canvas.requestRenderAll();
    saveCurrentPageState();
    updateActionState();

    setMessage("Kapatma alanı eklendi. Taşıyabilir ve boyutlandırabilirsin.", "success");
  }

  function addImageToCanvas(dataUrl) {
    if (!canvas || !pdfDocument) {
      setMessage("Önce bir PDF dosyası seç.", "warning");
      return;
    }

    pushUndoState();

    window.fabric.Image.fromURL(dataUrl, function (image) {
      const maxWidth = Math.min(220, canvas.width * 0.35);
      image.scaleToWidth(maxWidth);

      image.set({
        left: canvas.width / 2 - image.getScaledWidth() / 2,
        top: canvas.height / 2 - image.getScaledHeight() / 2,
        opacity: getOpacity()
      });

      markObjectAsEditable(image);
      canvas.add(image);
      canvas.setActiveObject(image);
      canvas.requestRenderAll();
      saveCurrentPageState();
      updateActionState();

      setTool("select");
      setMessage("Görsel eklendi. Taşıyabilir ve boyutlandırabilirsin.", "success");
    });
  }

  function markObjectAsEditable(object) {
    object.isPdfBackground = false;
    object.excludeFromExport = false;

    object.set({
      selectable: true,
      evented: true,
      hasControls: true,
      hasBorders: true
    });
  }

  function setTool(tool) {
    currentTool = tool;

    toolButtons.forEach(function (button) {
      button.classList.toggle("is-active", button.dataset.tool === tool);
    });

    if (tool === "draw") {
      canvas.isDrawingMode = true;
      canvas.freeDrawingBrush.color = selectedColor;
      canvas.freeDrawingBrush.width = getNumber(strokeWidthInput.value, 3);
    } else {
      canvas.isDrawingMode = false;
    }

    updateHelpText();
  }

  function updateHelpText() {
    const messages = {
      select: "Seç aracı aktif. Öğeleri taşıyabilir, büyütebilir veya silebilirsin.",
      text: "Metin aracı aktif. PDF üzerinde metin eklemek istediğin yere tıkla.",
      draw: "Çiz / İmza aracı aktif. PDF üzerinde serbest çizim yap.",
      rect: "Dikdörtgen aracı aktif. Sayfaya dikdörtgen eklemek için tıkla.",
      circle: "Daire aracı aktif. Sayfaya daire eklemek için tıkla.",
      line: "Çizgi aracı aktif. Sayfaya çizgi eklemek için tıkla.",
      highlight: "Vurgu aracı aktif. Sayfaya yarı saydam vurgu alanı eklemek için tıkla.",
      whiteout: "Kapat aracı aktif. Beyaz kapatma alanı eklemek için tıkla.",
      image: "Görsel eklemek için PNG veya JPG seç."
    };

    editorHelpText.textContent = messages[currentTool] || messages.select;
  }

  function applyStyleToSelected() {
    if (!canvas) return;

    if (canvas.isDrawingMode) {
      canvas.freeDrawingBrush.color = selectedColor;
      canvas.freeDrawingBrush.width = getNumber(strokeWidthInput.value, 3);
    }

    const active = canvas.getActiveObject();

    if (!active) {
      resetOutput();
      return;
    }

    pushUndoState();

    if (active.type === "i-text" || active.type === "textbox" || active.type === "text") {
      active.set({
        fill: selectedColor,
        fontSize: getNumber(fontSizeInput.value, 24),
        fontFamily: getFabricFontFamily(),
        fontWeight: boldInput.checked ? "bold" : "normal",
        fontStyle: italicInput.checked ? "italic" : "normal",
        opacity: getOpacity()
      });
    } else if (active.type === "rect" || active.type === "circle") {
      if (active.fill === "#ffffff") {
        active.set({
          opacity: 1
        });
      } else if (active.opacity < 0.5) {
        active.set({
          fill: selectedColor,
          stroke: selectedColor,
          opacity: Math.min(getOpacity(), 0.35)
        });
      } else {
        active.set({
          stroke: selectedColor,
          strokeWidth: getNumber(strokeWidthInput.value, 3),
          opacity: getOpacity()
        });
      }
    } else if (active.type === "line" || active.type === "path") {
      active.set({
        stroke: selectedColor,
        strokeWidth: getNumber(strokeWidthInput.value, 3),
        opacity: getOpacity()
      });
    } else {
      active.set({
        opacity: getOpacity()
      });
    }

    canvas.requestRenderAll();
    saveCurrentPageState();
    resetOutput();
    updateActionState();
  }

  function syncControlsFromSelection() {
    const active = canvas.getActiveObject();

    if (!active) return;

    if (typeof active.opacity === "number") {
      opacityInput.value = String(Math.round(active.opacity * 100));
    }

    if (active.type === "i-text" || active.type === "textbox" || active.type === "text") {
      fontSizeInput.value = String(Math.round(active.fontSize || 24));
      boldInput.checked = active.fontWeight === "bold";
      italicInput.checked = active.fontStyle === "italic";
    }
  }

  function deleteSelectedObject() {
    if (!canvas) return;

    const active = canvas.getActiveObject();

    if (!active) {
      setMessage("Silmek için önce bir öğe seç.", "warning");
      return;
    }

    pushUndoState();

    if (active.type === "activeSelection") {
      active.forEachObject(function (object) {
        canvas.remove(object);
      });
    } else {
      canvas.remove(active);
    }

    canvas.discardActiveObject();
    canvas.requestRenderAll();
    saveCurrentPageState();
    resetOutput();
    updateActionState();

    setMessage("Seçili öğe silindi.", "success");
  }

  function undoLastAction() {
    const undoStack = undoStackByPage.get(currentPage) || [];

    if (undoStack.length === 0) {
      setMessage("Geri alınacak işlem yok.", "warning");
      return;
    }

    const currentState = getEditableCanvasJson();
    const previousState = undoStack.pop();
    const redoStack = redoStackByPage.get(currentPage) || [];

    redoStack.push(currentState);
    undoStackByPage.set(currentPage, undoStack);
    redoStackByPage.set(currentPage, redoStack);

    applyEditableCanvasJson(previousState, function () {
      saveCurrentPageState();
      resetOutput();
      updateActionState();
      setMessage("Son işlem geri alındı.", "success");
    });
  }

  function redoLastAction() {
    const redoStack = redoStackByPage.get(currentPage) || [];

    if (redoStack.length === 0) {
      setMessage("İleri alınacak işlem yok.", "warning");
      return;
    }

    const currentState = getEditableCanvasJson();
    const nextState = redoStack.pop();
    const undoStack = undoStackByPage.get(currentPage) || [];

    undoStack.push(currentState);
    undoStackByPage.set(currentPage, undoStack);
    redoStackByPage.set(currentPage, redoStack);

    applyEditableCanvasJson(nextState, function () {
      saveCurrentPageState();
      resetOutput();
      updateActionState();
      setMessage("İşlem ileri alındı.", "success");
    });
  }

  function clearCurrentPageEdits() {
    if (!canvas) return;

    const editableObjects = canvas.getObjects();

    if (editableObjects.length === 0) {
      setMessage("Bu sayfada temizlenecek düzenleme yok.", "warning");
      return;
    }

    pushUndoState();

    editableObjects.forEach(function (object) {
      canvas.remove(object);
    });

    canvas.discardActiveObject();
    canvas.requestRenderAll();
    saveCurrentPageState();
    resetOutput();
    updateActionState();

    setMessage("Bu sayfadaki düzenlemeler temizlendi.", "success");
  }

  async function goToPage(pageNumber) {
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

    saveCurrentPageState();
    currentPage = pageNumber;
    pageNumberInput.value = String(currentPage);

    await renderCurrentPage();
    clearMessage();
  }

  async function exportEditedPdf() {
    if (!selectedFile || !selectedFileBuffer || !pdfDocument) {
      setMessage("Lütfen önce bir PDF dosyası seç.", "warning");
      return;
    }

    saveCurrentPageState();

    if (pageStates.size === 0) {
      setMessage("PDF’e işlenecek düzenleme yok. Önce bir düzenleme ekle.", "warning");
      return;
    }

    resetOutput();
    setBusy(true);
    updateProgress(10, "PDF düzenlemeleri hazırlanıyor...");

    try {
      const { PDFDocument } = window.PDFLib;

      const pdfDoc = await PDFDocument.load(selectedFileBuffer.slice(0), {
        ignoreEncryption: false
      });

      const pages = pdfDoc.getPages();
      let processed = 0;

      for (const [pageNumber, state] of pageStates.entries()) {
        const page = pages[pageNumber - 1];

        if (!page) continue;

        const overlayDataUrl = await createOverlayImageFromState(state);
        const overlayBytes = dataUrlToUint8Array(overlayDataUrl);
        const overlayImage = await pdfDoc.embedPng(overlayBytes);
        const pageSize = page.getSize();

        page.drawImage(overlayImage, {
          x: 0,
          y: 0,
          width: pageSize.width,
          height: pageSize.height
        });

        processed += 1;

        updateProgress(
          20 + Math.round((processed / pageStates.size) * 65),
          `${pageNumber}. sayfa PDF’e işleniyor...`
        );
      }

      updateProgress(90, "Yeni PDF oluşturuluyor...");

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

      updateProgress(100, "PDF başarıyla düzenlendi.");
      setMessage("Hazır! Düzenlenmiş PDF dosyanı indirebilirsin.", "success");
    } catch (error) {
      console.error("PDF dışa aktarma hatası:", error);

      const message = String(error?.message || "").toLowerCase();

      if (message.includes("encrypted") || message.includes("password")) {
        setMessage("Şifreli PDF düzenlenemedi. Lütfen şifresiz PDF dosyası dene.", "error");
      } else {
        setMessage("PDF düzenlenirken bir sorun oluştu. Dosya bozuk, şifreli veya çok büyük olabilir.", "error");
      }

      updateProgress(0, "İşlem başarısız oldu.");
    } finally {
      setBusy(false);
    }
  }

  function createOverlayImageFromState(state) {
    return new Promise(function (resolve) {
      const overlayCanvas = new window.fabric.StaticCanvas(null, {
        width: state.width,
        height: state.height,
        backgroundColor: "rgba(255,255,255,0)"
      });

      overlayCanvas.loadFromJSON(state.json, function () {
        overlayCanvas.setBackgroundImage(null, function () {
          overlayCanvas.backgroundColor = "rgba(255,255,255,0)";
          overlayCanvas.renderAll();

          const dataUrl = overlayCanvas.toDataURL({
            format: "png",
            enableRetinaScaling: false
          });

          overlayCanvas.dispose();
          resolve(dataUrl);
        });
      });
    });
  }

  function getFabricFontFamily() {
    const value = fontFamilySelect.value;

    if (value === "Times-Roman") return "Times New Roman";
    if (value === "Courier") return "Courier New";

    return "Arial";
  }

  function getOpacity() {
    return Math.max(0.05, Math.min(1, getNumber(opacityInput.value, 100) / 100));
  }

  function getNumber(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function updateToolbarState() {
    const hasPdf = Boolean(pdfDocument);

    prevPageBtn.disabled = !hasPdf || currentPage <= 1;
    nextPageBtn.disabled = !hasPdf || currentPage >= pageCount;
    pageNumberInput.disabled = !hasPdf;
    fitWidthBtn.disabled = !hasPdf || isRendering;
  }

  function updateActionState() {
    saveCurrentPageState();
    exportPdfBtn.disabled = !(selectedFile && selectedFileBuffer && pageStates.size > 0);
  }

  function setBusy(isBusy) {
    exportPdfBtn.disabled = isBusy;

    if (!isBusy) {
      updateActionState();
    }

    [
      clearFileBtn,
      selectFileBtn,
      fontFamilySelect,
      fontSizeInput,
      strokeWidthInput,
      opacityInput,
      boldInput,
      italicInput,
      deleteSelectedBtn,
      undoBtn,
      redoBtn,
      clearPageBtn,
      prevPageBtn,
      nextPageBtn,
      pageNumberInput,
      fitWidthBtn
    ].forEach(function (element) {
      if (element) element.disabled = isBusy;
    });

    toolButtons.forEach(function (button) {
      button.disabled = isBusy;
    });

    colorDots.forEach(function (dot) {
      dot.disabled = isBusy;
    });

    customColorBtn.disabled = isBusy;
  }

  function clearFile() {
    fileInput.value = "";
    imageFileInput.value = "";
    selectedPanel.hidden = true;

    resetAllState();
    resetOutput();
    clearMessage();
  }

  function resetAllState() {
    selectedFile = null;
    selectedFileBuffer = null;
    pdfDocument = null;
    pageCount = 0;
    currentPage = 1;
    currentTool = "select";
    currentDownloadUrl = null;
    pageStates = new Map();
    undoStackByPage = new Map();
    redoStackByPage = new Map();
    isRendering = false;
    isRestoringState = false;

    if (canvas) {
      isRestoringState = true;

      canvas.clear();

      canvas.setBackgroundImage(null, function () {
        canvas.setWidth(800);
        canvas.setHeight(600);
        canvas.backgroundColor = "#ffffff";
        canvas.requestRenderAll();
        isRestoringState = false;
      });
    }

    viewerFileName.textContent = "PDF Düzenle";
    fileSummary.textContent = "Seçilen PDF dosyası hazırlanıyor.";
    pageNumberInput.value = "1";
    pageNumberInput.removeAttribute("max");
    pageCountLabel.textContent = "/ 0";

    setTool("select");
    updateToolbarState();
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

  function buildOutputFileName() {
    const fileName = utils.sanitizeFileName(selectedFile?.name || "pdf");
    return `${fileName}-duzenlenmis.pdf`;
  }

  function dataUrlToUint8Array(dataUrl) {
    const base64 = dataUrl.split(",")[1];
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);

    for (let i = 0; i < binaryString.length; i += 1) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    return bytes;
  }

  function debounce(callback, delay) {
    let timeoutId;

    return function () {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(callback, delay);
    };
  }
})();