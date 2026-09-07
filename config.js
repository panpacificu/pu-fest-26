window.App = (() => {
  const money = (value) =>
    new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(Number(value || 0));

  const escapeHtml = (value = "") =>
    String(value).replace(/[&<>"']/g, ch => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
    })[ch]);

  const toast = (message, type = "info") => {
    const el = document.createElement("div");
    el.className = `toast toast-${type}`;
    el.textContent = message;
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add("show"));
    setTimeout(() => {
      el.classList.remove("show");
      setTimeout(() => el.remove(), 250);
    }, 3200);
  };

  const setBusy = (button, busy, label = "Processing...") => {
    if (!button) return;
    if (busy) {
      button.dataset.originalText = button.textContent;
      button.disabled = true;
      button.textContent = label;
    } else {
      button.disabled = false;
      button.textContent = button.dataset.originalText || button.textContent;
    }
  };

  const formatDateTime = (value) => {
    if (!value) return "—";
    return new Date(value).toLocaleString("en-PH", {
      year: "numeric", month: "short", day: "numeric",
      hour: "numeric", minute: "2-digit"
    });
  };

  const fullName = (obj) =>
    [obj.first_name, obj.middle_name, obj.last_name].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();

  const badge = (status) => {
    const s = String(status || "").toLowerCase();
    return `<span class="status status-${escapeHtml(s)}">${escapeHtml(String(status || "unknown").toUpperCase())}</span>`;
  };

  return { money, escapeHtml, toast, setBusy, formatDateTime, fullName, badge };
})();
