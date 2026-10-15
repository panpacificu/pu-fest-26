(async () => {
  const auth = await Auth.requireRole(["admin","finance","event_admin"]);
  document.getElementById("logoutBtn").onclick = Auth.logout;
  if (auth.profile.role === "finance") document.getElementById("adminLink").style.display = "none";

  const cfg = APP_CONFIG.event;
  const $ = id => document.getElementById(id);

  const form = $("financeForm");
  const qty = $("ticketQty");
  const expected = $("expectedTotal");
  const body = $("ticketBody");
  const newTicketDialog = $("newTicketDialog");
  const paymentDialog = $("paymentDialog");
  const editForm = $("editForm");
  const receiptDialog = $("receiptDialog");

  let rows = [];
  let receiptUrlMap = new Map();
  let refreshTimer = null;

  for (let i = 1; i <= cfg.maxTickets; i++) {
    const o = document.createElement("option");
    o.value = i;
    o.textContent = `${i} ticket${i > 1 ? "s" : ""}`;
    qty.appendChild(o);
  }

  const today = new Date();
  const todayString = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,"0")}-${String(today.getDate()).padStart(2,"0")}`;

  function setDefaultDate() {
    form.payment_date.value = todayString;
  }

  function updateTotal() {
    const total = Number(qty.value || 1) * cfg.ticketPrice;
    expected.value = App.money(total);
    if (!form.amount_paid.value) form.amount_paid.value = total.toFixed(2);
    renderHolders();
  }

  function renderHolders() {
    const box = $("holderFields");
    if (!cfg.collectTicketHolderNames) {
      box.innerHTML = "";
      return;
    }

    const n = Number(qty.value || 1);
    box.innerHTML =
      `<div class="form-divider"><span>Ticket Holders</span></div>` +
      Array.from({length:n}, (_,i) => `
        <label>Ticket ${i+1} Holder Name
          <input name="holder_${i}" ${i===0 ? 'placeholder="Leave blank to use purchaser name"' : ""}>
        </label>
      `).join("");
  }

  qty.addEventListener("change", updateTotal);
  setDefaultDate();
  updateTotal();

  function safeFileName(name) {
    const ext = String(name || "").split(".").pop()?.toLowerCase() || "jpg";
    return `receipt-${Date.now()}-${crypto.randomUUID()}.${ext}`.replace(/[^a-zA-Z0-9._-]/g, "-");
  }

  function validateReceipt(file) {
    if (!file) return;
    const allowed = ["image/jpeg","image/png","image/webp"];
    if (!allowed.includes(file.type)) {
      throw new Error("Receipt must be a JPG, PNG, or WebP image.");
    }
    if (file.size > 5 * 1024 * 1024) {
      throw new Error("Receipt photo must be 5 MB or smaller.");
    }
  }

  async function uploadReceipt(registrationId, file) {
    if (!file) return null;
    validateReceipt(file);

    const path = `${registrationId}/${safeFileName(file.name)}`;
    const { error } = await sb.storage
      .from("payment-receipts")
      .upload(path, file, {
        cacheControl: "3600",
        upsert: false,
        contentType: file.type
      });

    if (error) throw error;
    return path;
  }

  async function getReceiptUrls(paths) {
    receiptUrlMap = new Map();
    const unique = [...new Set(paths.filter(Boolean))];
    if (!unique.length) return;

    const { data, error } = await sb.storage
      .from("payment-receipts")
      .createSignedUrls(unique, 3600);

    if (error) {
      console.warn("Unable to create receipt URLs:", error.message);
      return;
    }

    for (const item of data || []) {
      if (item.path && item.signedUrl) receiptUrlMap.set(item.path, item.signedUrl);
    }
  }

  async function loadTickets(options = {}) {
    const silent = !!options.silent;
    if (!silent) body.innerHTML = `<tr><td colspan="6" class="empty">Loading…</td></tr>`;

    const { data, error } = await sb
      .from("tickets")
      .select(`
        id,
        ticket_number,
        holder_name,
        status,
        created_at,
        registration_id,
        registrations (
          id,
          transaction_number,
          student_number,
          first_name,
          middle_name,
          last_name,
          email,
          course,
          year_level,
          section,
          or_number,
          receipt_path,
          amount_paid,
          payment_date,
          payment_method,
          notes,
          email_status,
          email_sent_at,
          email_error
        )
      `)
      .order("created_at", { ascending: false })
      .limit(1000);

    if (error) {
      body.innerHTML = `<tr><td colspan="6" class="empty error-empty">${App.escapeHtml(error.message)}</td></tr>`;
      $("ticketCountText").textContent = "Unable to load ticket records.";
      return;
    }

    rows = data || [];
    await getReceiptUrls(rows.map(r => r.registrations?.receipt_path));
    renderRows();
    scheduleStatusRefresh();
  }

  function statusLabel(value) {
    if (value === "not_sent") return "NOT SENT";
    if (value === "pending") return "QUEUED";
    if (value === "processing") return "SENDING";
    return String(value || "unknown").replaceAll("_"," ").toUpperCase();
  }

  function emailBadge(status) {
    const s = String(status || "not_sent").toLowerCase();
    return `<span class="status status-${App.escapeHtml(s)}">${App.escapeHtml(statusLabel(s))}</span>`;
  }

  function renderRows() {
    const q = $("ticketSearch").value.toLowerCase().trim();
    const filter = $("emailFilter").value;

    const filtered = rows.filter(t => {
      const r = t.registrations || {};
      const haystack = [
        t.ticket_number,
        t.holder_name,
        r.transaction_number,
        r.student_number,
        r.first_name,
        r.middle_name,
        r.last_name,
        r.email,
        r.or_number
      ].filter(Boolean).join(" ").toLowerCase();

      const emailStatus = r.email_status || "not_sent";
      return haystack.includes(q) && (filter === "all" || emailStatus === filter);
    });

    $("ticketCountText").textContent =
      `${filtered.length} ticket${filtered.length === 1 ? "" : "s"} shown`;

    if (!filtered.length) {
      body.innerHTML = `<tr><td colspan="6" class="empty">No matching tickets.</td></tr>`;
      return;
    }

    body.innerHTML = filtered.map(t => {
      const r = t.registrations || {};
      const receiptUrl = r.receipt_path ? receiptUrlMap.get(r.receipt_path) : null;
      const emailStatus = r.email_status || "not_sent";
      const sent = emailStatus === "sent";
      const busy = ["pending","processing"].includes(emailStatus);
      const failed = emailStatus === "failed";

      const receiptHtml = receiptUrl
        ? `<button class="receipt-thumb-btn" data-receipt-url="${App.escapeHtml(receiptUrl)}" title="View receipt">
             <img class="receipt-thumb" src="${App.escapeHtml(receiptUrl)}" alt="Receipt">
           </button>
           <button class="inline-edit payment-edit" data-registration="${r.id}">Change</button>`
        : `<button class="receipt-empty payment-edit" data-registration="${r.id}">+ Add receipt</button>`;

      const actionLabel = sent ? "Resend Ticket" : failed ? "Retry Email" : busy ? "Sending…" : "Resend Ticket";
      const actionClass = sent ? "btn btn-ghost btn-small" : failed ? "btn btn-primary btn-small" : "btn btn-ghost btn-small";
      const disabled = busy ? "disabled" : "";

      return `
        <tr data-registration="${r.id}">
          <td>
            <strong>${App.escapeHtml(t.ticket_number)}</strong>
            <span class="student-name">${App.escapeHtml(t.holder_name)}</span>
            <small>${App.escapeHtml(r.course || "")}${r.year_level ? ` • ${App.escapeHtml(r.year_level)}` : ""}${r.section ? ` • ${App.escapeHtml(r.section)}` : ""}</small>
            <small>${App.escapeHtml(r.email || "")}</small>
          </td>

          <td>
            <button class="control-cell payment-edit" data-registration="${r.id}">
              <strong>${App.escapeHtml(r.or_number || "Not added")}</strong>
              <small>${App.escapeHtml(r.transaction_number || "")}</small>
            </button>
          </td>

          <td>${receiptHtml}</td>

          <td>${App.badge(t.status)}</td>

          <td>
            ${emailBadge(emailStatus)}
            ${r.email_sent_at ? `<small>${App.formatDateTime(r.email_sent_at)}</small>` : ""}
            ${r.email_error ? `<small class="email-error-text">${App.escapeHtml(r.email_error)}</small>` : ""}
          </td>

          <td>
            <button class="${actionClass} send-ticket-btn"
              data-registration="${r.id}"
              data-status="${App.escapeHtml(emailStatus)}"
              ${disabled}>
              ${actionLabel}
            </button>
          </td>
        </tr>`;
    }).join("");

    body.querySelectorAll(".send-ticket-btn").forEach(btn => {
      btn.onclick = () => sendTicketEmail(btn.dataset.registration, btn);
    });

    body.querySelectorAll(".payment-edit").forEach(btn => {
      btn.onclick = () => openPaymentEditor(btn.dataset.registration);
    });

    body.querySelectorAll(".receipt-thumb-btn").forEach(btn => {
      btn.onclick = () => {
        $("receiptFullImage").src = btn.dataset.receiptUrl;
        receiptDialog.showModal();
      };
    });
  }

  async function sendTicketEmail(registrationId, btn) {
    const original = btn.textContent;
    App.setBusy(btn, true, "Queuing…");

    try {
      const { data, error } = await sb.functions.invoke("resend-ticket", {
        body: { registration_id: registrationId }
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.message || "Unable to queue ticket email.");

      const siblingRows = rows.filter(t => t.registration_id === registrationId);
      siblingRows.forEach(t => {
        if (t.registrations) {
          t.registrations.email_status = "pending";
          t.registrations.email_error = null;
        }
      });

      renderRows();
      App.toast("Ticket email queued again. Status will update automatically.", "success");

      setTimeout(() => loadTickets({ silent: true }), 5000);
    } catch (err) {
      App.toast(err.message || "Unable to send ticket email.", "error");
      btn.textContent = original;
      btn.disabled = false;
    }
  }

  function openPaymentEditor(registrationId) {
    const ticket = rows.find(t => t.registration_id === registrationId);
    const r = ticket?.registrations;
    if (!r) return;

    editForm.registration_id.value = r.id;
    editForm.existing_receipt_path.value = r.receipt_path || "";
    editForm.or_number.value = r.or_number || "";
    editForm.amount_paid.value = r.amount_paid ?? "";
    editForm.payment_date.value = r.payment_date || "";
    editForm.payment_method.value = r.payment_method || "";
    editForm.notes.value = r.notes || "";
    editForm.receipt.value = "";
    paymentDialog.showModal();
  }

  function scheduleStatusRefresh() {
    if (refreshTimer) clearTimeout(refreshTimer);

    const hasInFlightEmail = rows.some(t =>
      ["pending","processing"].includes(t.registrations?.email_status)
    );

    if (hasInFlightEmail) {
      refreshTimer = setTimeout(() => loadTickets({ silent: true }), 8000);
    }
  }

  $("newTicketBtn").onclick = () => newTicketDialog.showModal();
  $("closeNewTicketBtn").onclick = () => newTicketDialog.close();
  $("cancelNewTicketBtn").onclick = () => newTicketDialog.close();
  $("closePaymentBtn").onclick = () => paymentDialog.close();
  $("cancelPaymentBtn").onclick = () => paymentDialog.close();
  $("closeReceiptBtn").onclick = () => receiptDialog.close();
  $("successDoneBtn").onclick = () => $("successDialog").close();

  form.addEventListener("submit", async e => {
    e.preventDefault();

    const btn = $("issueBtn");
    App.setBusy(btn, true, "Creating…");

    const fd = new FormData(form);
    const receiptFile = fd.get("receipt");
    const purchaser = {
      student_number: fd.get("student_number")?.trim(),
      campus: fd.get("campus"),
      first_name: fd.get("first_name")?.trim(),
      middle_name: fd.get("middle_name")?.trim(),
      last_name: fd.get("last_name")?.trim(),
      email: fd.get("email")?.trim(),
      course: fd.get("course")?.trim(),
      year_level: fd.get("year_level")?.trim(),
      section: fd.get("section")?.trim()
    };

    const ticket_quantity = Number(fd.get("ticket_quantity"));
    const ticket_holders = Array.from({length:ticket_quantity}, (_,i) =>
      cfg.collectTicketHolderNames
        ? (fd.get(`holder_${i}`)?.trim() || App.fullName(purchaser))
        : App.fullName(purchaser)
    );

    try {
      if (receiptFile instanceof File && receiptFile.size) validateReceipt(receiptFile);

      const { data, error } = await sb.functions.invoke("issue-tickets", {
        body: {
          event_slug: APP_CONFIG.eventSlug,
          purchaser,
          payment: {
            ticket_quantity,
            amount_paid: Number(fd.get("amount_paid")),
            or_number: fd.get("or_number")?.trim() || null,
            payment_date: fd.get("payment_date"),
            payment_method: fd.get("payment_method"),
            notes: fd.get("notes")?.trim() || null
          },
          ticket_holders
        }
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.message || "Unable to create ticket.");

      let receiptPath = null;
      let receiptWarning = "";

      if (receiptFile instanceof File && receiptFile.size) {
        try {
          receiptPath = await uploadReceipt(data.registration_id, receiptFile);

          const { data: updateData, error: updateError } = await sb.functions.invoke("update-registration", {
            body: {
              registration_id: data.registration_id,
              updates: { receipt_path: receiptPath }
            }
          });

          if (updateError) throw updateError;
          if (!updateData?.success) throw new Error(updateData?.message || "Receipt record update failed.");
        } catch (receiptErr) {
          receiptWarning = ` Receipt upload needs attention: ${receiptErr.message}`;
        }
      }

      $("successMessage").textContent =
        `${data.transaction_number} created. Ticket email has been queued automatically.${receiptWarning}`;

      $("issuedTickets").innerHTML = (data.tickets || []).map(t =>
        `<div><strong>${App.escapeHtml(t.ticket_number)}</strong><span>${App.escapeHtml(t.holder_name)}</span></div>`
      ).join("");

      newTicketDialog.close();
      $("successDialog").showModal();

      form.reset();
      setDefaultDate();
      qty.value = "1";
      updateTotal();

      await loadTickets();
    } catch (err) {
      App.toast(err.message || "Ticket creation failed.", "error");
    } finally {
      App.setBusy(btn, false);
    }
  });

  editForm.addEventListener("submit", async e => {
    e.preventDefault();

    const btn = $("saveEditBtn");
    App.setBusy(btn, true, "Saving…");
    const fd = new FormData(editForm);
    const registrationId = fd.get("registration_id");
    const receiptFile = fd.get("receipt");

    try {
      let receiptPath = fd.get("existing_receipt_path") || null;

      if (receiptFile instanceof File && receiptFile.size) {
        receiptPath = await uploadReceipt(registrationId, receiptFile);
      }

      const { data, error } = await sb.functions.invoke("update-registration", {
        body: {
          registration_id: registrationId,
          updates: {
            or_number: fd.get("or_number")?.trim() || null,
            receipt_path: receiptPath,
            amount_paid: Number(fd.get("amount_paid")),
            payment_date: fd.get("payment_date"),
            payment_method: fd.get("payment_method")?.trim(),
            notes: fd.get("notes")?.trim() || null
          }
        }
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.message || "Update failed.");

      paymentDialog.close();
      App.toast("Payment record updated.", "success");
      await loadTickets();
    } catch (err) {
      App.toast(err.message || "Update failed.", "error");
    } finally {
      App.setBusy(btn, false);
    }
  });

  $("ticketSearch").addEventListener("input", renderRows);
  $("emailFilter").addEventListener("change", renderRows);
  $("refreshBtn").onclick = () => loadTickets();

  await loadTickets();
})();
