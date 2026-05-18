(function () {
  const disabledTools = document.querySelectorAll(".disabled-tool");

  disabledTools.forEach((tool) => {
    tool.addEventListener("click", function (event) {
      event.preventDefault();

      const toolName = tool.querySelector("strong")?.textContent || "Bu araç";

      showToast(`${toolName} yakında aktif olacak.`);
    });
  });

  function showToast(message) {
    const oldToast = document.querySelector(".pdfm-toast");
    if (oldToast) oldToast.remove();

    const toast = document.createElement("div");
    toast.className = "pdfm-toast";
    toast.textContent = message;

    Object.assign(toast.style, {
      position: "fixed",
      left: "50%",
      bottom: "24px",
      transform: "translateX(-50%)",
      zIndex: "9999",
      padding: "13px 18px",
      borderRadius: "999px",
      background: "#0f172a",
      color: "#ffffff",
      fontWeight: "800",
      boxShadow: "0 16px 40px rgba(15, 23, 42, 0.22)",
      maxWidth: "calc(100% - 32px)",
      textAlign: "center",
      fontSize: "14px"
    });

    document.body.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transition = "opacity 0.25s ease";
      setTimeout(() => toast.remove(), 260);
    }, 2200);
  }
})();