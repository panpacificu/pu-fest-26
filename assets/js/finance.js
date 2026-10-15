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
  const onlineReviewDialog = $("onlineReviewDialog");

  let rows = [];
  let onlineOrders = [];
  let archives = [];
  let financeReceiptUrlMap = new Map();
  let onlineProofUrlMap = new Map();
  let refreshTimer = null;
  let selectedOnlineOrder = null;

  const today = new Date();
  const todayString = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,"0")}-${String(today.getDate()).padStart(2,"0")}`;

  function setDefaultDate() { form.payment_date.value = todayString; }

  function bundleCounts(paid) {
    const safePaid = Math.max(1, Math.min(50, Number(paid || 1)));
    const free = Math.floor(safePaid / 10);
    return { paid: safePaid, free, total: safePaid + free };
  }

  function updateTotal() {
    const b = bundleCounts(qty.value);
    qty.value = b.paid;
    expected.value = App.money(b.paid * cfg.ticketPrice);
    $("paidCount").textContent = b.paid;
    $("freeCount").textContent = b.free;
    $("totalCount").textContent = b.total;
    $("bundleSummary").classList.toggle("has-free", b.free > 0);
    if (!form.amount_paid.value) form.amount_paid.value = (b.paid * cfg.ticketPrice).toFixed(2);
  }

  qty.addEventListener("input", () => {
    form.amount_paid.value = "";
    updateTotal();
  });
  setDefaultDate();
  updateTotal();

  function safeFileName(name) {
    const ext = String(name || "").split(".").pop()?.toLowerCase() || "jpg";
    return `receipt-${Date.now()}-${crypto.randomUUID()}.${ext}`.replace(/[^a-zA-Z0-9._-]/g, "-");
  }

  function validateReceipt(file) {
    if (!file) return;
    const allowed = ["image/jpeg","image/png","image/webp"];
    if (!allowed.includes(file.type)) throw new Error("Receipt must be a JPG, PNG, or WebP image.");
    if (file.size > 5 * 1024 * 1024) throw new Error("Receipt photo must be 5 MB or smaller.");
  }

  async function uploadReceipt(registrationId, file) {
    if (!file) return null;
    validateReceipt(file);
    const path = `${registrationId}/${safeFileName(file.name)}`;
    const { error } = await sb.storage.from("payment-receipts").upload(path, file, {
      cacheControl: "3600", upsert: false, contentType: file.type
    });
    if (error) throw error;
    return path;
  }

  async function signedUrlMap(bucket, paths) {
    const map = new Map();
    const unique = [...new Set(paths.filter(Boolean))];
    if (!unique.length) return map;
    const { data, error } = await sb.storage.from(bucket).createSignedUrls(unique, 3600);
    if (error) return map;
    for (const item of data || []) if (item.path && item.signedUrl) map.set(item.path, item.signedUrl);
    return map;
  }

  function emailBadge(status) {
    const s = String(status || "pending").toLowerCase();
    const label = s === "pending" ? "QUEUED" : s === "processing" ? "SENDING" : s.replaceAll("_"," ").toUpperCase();
    return `<span class="status status-${App.escapeHtml(s)}">${App.escapeHtml(label)}</span>`;
  }

  function sourceBadge(source) {
    const s = source === "online" ? "ONLINE" : "FINANCE";
    return `<span class="source-badge source-${source === "online" ? "online" : "finance"}">${s}</span>`;
  }

  async function loadTickets(options = {}) {
    const silent = !!options.silent;
    if (!silent) body.innerHTML = `<tr><td colspan="7" class="empty">Loading…</td></tr>`;

    const { data, error } = await sb.from("tickets")
      .select(`id,ticket_number,holder_name,status,is_free,created_at,registration_id,
        registrations!inner(id,transaction_number,student_number,first_name,middle_name,last_name,email,course,year_level,section,
          or_number,receipt_path,amount_paid,payment_date,payment_method,notes,email_status,email_sent_at,email_error,
          purchase_source,paid_ticket_quantity,free_ticket_quantity,ticket_quantity,archived_at)`)
      .is("registrations.archived_at", null)
      .order("created_at", { ascending:false })
      .limit(2000);

    if (error) {
      body.innerHTML = `<tr><td colspan="7" class="empty error-empty">${App.escapeHtml(error.message)}</td></tr>`;
      $("ticketCountText").textContent = "Unable to load ticket records.";
      return;
    }

    rows = data || [];
    const financePaths = rows.filter(t => t.registrations?.purchase_source !== "online").map(t => t.registrations?.receipt_path);
    const onlinePaths = rows.filter(t => t.registrations?.purchase_source === "online").map(t => t.registrations?.receipt_path);
    [financeReceiptUrlMap, onlineProofUrlMap] = await Promise.all([
      signedUrlMap("payment-receipts", financePaths),
      signedUrlMap("online-payment-proofs", onlinePaths)
    ]);
    renderRows();
    scheduleStatusRefresh();
  }

  function renderRows() {
    const q = $("ticketSearch").value.toLowerCase().trim();
    const emailFilter = $("emailFilter").value;
    const sourceFilter = $("sourceFilter").value;

    const filtered = rows.filter(t => {
      const r = t.registrations || {};
      const haystack = [t.ticket_number,t.holder_name,r.transaction_number,r.student_number,r.first_name,r.middle_name,r.last_name,r.email,r.or_number].filter(Boolean).join(" ").toLowerCase();
      const status = r.email_status || "pending";
      const source = r.purchase_source || "finance";
      return haystack.includes(q)
        && (emailFilter === "all" || status === emailFilter)
        && (sourceFilter === "all" || source === sourceFilter);
    });

    $("ticketCountText").textContent = `${filtered.length} ticket${filtered.length === 1 ? "" : "s"} shown`;
    if (!filtered.length) {
      body.innerHTML = `<tr><td colspan="7" class="empty">No matching tickets.</td></tr>`;
      return;
    }

    const seenRegistrations = new Set();
    body.innerHTML = filtered.map(t => {
      const r = t.registrations || {};
      const source = r.purchase_source || "finance";
      const map = source === "online" ? onlineProofUrlMap : financeReceiptUrlMap;
      const receiptUrl = r.receipt_path ? map.get(r.receipt_path) : null;
      const emailStatus = r.email_status || "pending";
      const busy = ["pending","processing"].includes(emailStatus);
      const isFirstForRegistration = !seenRegistrations.has(r.id);
      seenRegistrations.add(r.id);

      const receiptHtml = receiptUrl
        ? `<button class="receipt-thumb-btn" data-receipt-url="${App.escapeHtml(receiptUrl)}" title="View receipt"><img class="receipt-thumb" src="${App.escapeHtml(receiptUrl)}" alt="Receipt"></button>
           ${source === "finance" ? `<button class="inline-edit payment-edit" data-registration="${r.id}">Change</button>` : ""}`
        : source === "finance" ? `<button class="receipt-empty payment-edit" data-registration="${r.id}">+ Add receipt</button>` : `<span class="muted-dash">—</span>`;

      return `<tr class="${t.is_free ? "free-ticket-row" : ""}">
        <td>
          <strong>${App.escapeHtml(t.ticket_number)}</strong>
          ${t.is_free ? `<span class="bundle-badge">FREE • BARKADA BUNDLE</span>` : ""}
          <span class="student-name">${App.escapeHtml(t.holder_name)}</span>
          <small>${App.escapeHtml(r.email || "")}</small>
        </td>
        <td>${sourceBadge(source)}</td>
        <td>${source === "finance"
          ? `<button class="control-cell payment-edit" data-registration="${r.id}"><strong>${App.escapeHtml(r.or_number || "Not added")}</strong><small>${App.escapeHtml(r.transaction_number || "")}</small></button>`
          : `<strong>${App.escapeHtml(r.or_number || "Online proof")}</strong><small>${App.escapeHtml(r.transaction_number || "")}</small>`}
        </td>
        <td>${receiptHtml}</td>
        <td>${App.badge(t.status)}</td>
        <td>${emailBadge(emailStatus)}${r.email_sent_at ? `<small>${App.formatDateTime(r.email_sent_at)}</small>` : ""}${r.email_error ? `<small class="email-error-text">${App.escapeHtml(r.email_error)}</small>` : ""}</td>
        <td><div class="row-actions">
          ${busy ? `<button class="btn btn-ghost btn-small" disabled>Sending…</button>` : `<button class="btn btn-ghost btn-small resend-ticket" data-registration="${r.id}">${emailStatus === "failed" ? "Retry Email" : "Resend Ticket"}</button>`}
          ${isFirstForRegistration ? `<button class="btn btn-danger-soft btn-small archive-transaction" data-registration="${r.id}" data-transaction="${App.escapeHtml(r.transaction_number || "")}">Archive</button>` : ""}
        </div></td>
      </tr>`;
    }).join("");

    body.querySelectorAll(".resend-ticket").forEach(btn => btn.onclick = () => resendTicket(btn.dataset.registration, btn));
    body.querySelectorAll(".payment-edit").forEach(btn => btn.onclick = () => openPaymentEditor(btn.dataset.registration));
    body.querySelectorAll(".archive-transaction").forEach(btn => btn.onclick = () => archiveTransaction(btn.dataset.registration, btn.dataset.transaction, btn));
    body.querySelectorAll(".receipt-thumb-btn").forEach(btn => btn.onclick = () => showReceipt(btn.dataset.receiptUrl));
  }

  async function resendTicket(registrationId, btn) {
    App.setBusy(btn, true, "Queuing…");
    try {
      const { data, error } = await sb.functions.invoke("resend-ticket", { body:{ registration_id: registrationId } });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.message || "Unable to queue email.");
      App.toast("Ticket email queued again.", "success");
      await loadTickets({ silent:true });
    } catch (err) { App.toast(err.message, "error"); }
    finally { App.setBusy(btn, false); }
  }

  async function archiveTransaction(registrationId, transactionNumber, btn) {
    const reason = prompt(`Archive ${transactionNumber}?\n\nThe transaction will disappear from active lists but remain in the archive for review. All tickets in the archived transaction will be made inactive.\n\nReason:`, "Archived by Finance");
    if (reason === null) return;
    if (!confirm(`Confirm archive of ${transactionNumber}?`)) return;
    App.setBusy(btn, true, "Archiving…");
    try {
      const { data, error } = await sb.functions.invoke("archive-transaction", { body:{ registration_id: registrationId, reason } });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.message || "Unable to archive transaction.");
      App.toast(`${transactionNumber} moved to archive.`, "success");
      await Promise.all([loadTickets(), loadArchives()]);
    } catch (err) { App.toast(err.message, "error"); }
    finally { App.setBusy(btn, false); }
  }

  function openPaymentEditor(registrationId) {
    const ticket = rows.find(t => t.registration_id === registrationId);
    const r = ticket?.registrations;
    if (!r || r.purchase_source === "online") return;
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

  function showReceipt(url) {
    $("receiptFullImage").src = url;
    receiptDialog.showModal();
  }

  function scheduleStatusRefresh() {
    if (refreshTimer) clearTimeout(refreshTimer);
    if (rows.some(t => ["pending","processing"].includes(t.registrations?.email_status))) {
      refreshTimer = setTimeout(() => loadTickets({ silent:true }), 8000);
    }
  }

  async function loadOnlineOrders() {
    const onlineBody = $("onlineBody");
    onlineBody.innerHTML = `<tr><td colspan="6" class="empty">Loading…</td></tr>`;
    const { data, error } = await sb.from("online_orders").select("*").order("created_at", { ascending:false }).limit(500);
    if (error) {
      onlineBody.innerHTML = `<tr><td colspan="6" class="empty error-empty">${App.escapeHtml(error.message)}</td></tr>`;
      return;
    }
    onlineOrders = data || [];
    onlineProofUrlMap = await signedUrlMap("online-payment-proofs", onlineOrders.map(o => o.receipt_path));
    renderOnlineOrders();
  }

  function renderOnlineOrders() {
    const q = $("onlineSearch").value.toLowerCase().trim();
    const statusFilter = $("onlineStatusFilter").value;
    const pendingCount = onlineOrders.filter(o => o.status === "pending").length;
    $("pendingOnlineBadge").textContent = pendingCount;
    $("onlineAlert").hidden = pendingCount === 0;
    $("onlineAlertCount").textContent = `${pendingCount} online request${pendingCount === 1 ? "" : "s"} need${pendingCount === 1 ? "s" : ""} review`;

    const filtered = onlineOrders.filter(o => {
      const haystack = [o.submission_number,o.first_name,o.middle_name,o.last_name,o.email,o.contact_number,o.payment_reference,o.organization].filter(Boolean).join(" ").toLowerCase();
      return haystack.includes(q) && (statusFilter === "all" || o.status === statusFilter);
    });

    $("onlineBody").innerHTML = filtered.length ? filtered.map(o => {
      const proofUrl = onlineProofUrlMap.get(o.receipt_path);
      return `<tr class="${o.status === "pending" ? "pending-review-row" : ""}">
        <td><strong>${App.escapeHtml([o.first_name,o.middle_name,o.last_name].filter(Boolean).join(" "))}</strong><small>${App.escapeHtml(o.email)}</small><small>${App.escapeHtml(o.submission_number)}</small></td>
        <td><strong>${o.paid_ticket_quantity} paid</strong>${o.free_ticket_quantity ? `<span class="bundle-badge">+${o.free_ticket_quantity} FREE</span>` : ""}<small>${o.total_ticket_quantity} total</small></td>
        <td><strong>${App.money(o.expected_total)}</strong><small>${App.escapeHtml(o.payment_method)}</small><small>${App.escapeHtml(o.payment_reference || "No reference")}</small></td>
        <td>${proofUrl ? `<button class="receipt-thumb-btn online-proof" data-url="${App.escapeHtml(proofUrl)}"><img class="receipt-thumb" src="${App.escapeHtml(proofUrl)}" alt="Proof"></button>` : "—"}</td>
        <td>${App.badge(o.status)}</td>
        <td>${o.status === "pending" ? `<button class="btn btn-primary btn-small review-online" data-id="${o.id}">Review</button>` : `<small>${o.reviewed_at ? App.formatDateTime(o.reviewed_at) : "Reviewed"}</small>`}</td>
      </tr>`;
    }).join("") : `<tr><td colspan="6" class="empty">No matching online requests.</td></tr>`;

    document.querySelectorAll(".online-proof").forEach(btn => btn.onclick = () => showReceipt(btn.dataset.url));
    document.querySelectorAll(".review-online").forEach(btn => btn.onclick = () => openOnlineReview(btn.dataset.id));
  }

  function openOnlineReview(orderId) {
    selectedOnlineOrder = onlineOrders.find(o => o.id === orderId);
    if (!selectedOnlineOrder) return;
    const o = selectedOnlineOrder;
    $("reviewBuyerName").textContent = [o.first_name,o.middle_name,o.last_name].filter(Boolean).join(" ");
    $("reviewDetails").innerHTML = `
      <div><small>EMAIL</small><strong>${App.escapeHtml(o.email)}</strong></div>
      <div><small>CONTACT</small><strong>${App.escapeHtml(o.contact_number)}</strong></div>
      <div><small>TICKETS</small><strong>${o.paid_ticket_quantity} paid ${o.free_ticket_quantity ? `+ ${o.free_ticket_quantity} FREE` : ""}</strong></div>
      <div><small>AMOUNT TO VERIFY</small><strong>${App.money(o.expected_total)}</strong></div>
      <div><small>PAYMENT</small><strong>${App.escapeHtml(o.payment_method)} • ${App.escapeHtml(o.payment_reference || "No reference")}</strong></div>
      <div><small>SUBMISSION</small><strong>${App.escapeHtml(o.submission_number)}</strong></div>`;
    $("reviewProofImage").src = onlineProofUrlMap.get(o.receipt_path) || "";
    $("reviewNote").value = "";
    onlineReviewDialog.showModal();
  }

  async function reviewOnline(action, btn) {
    if (!selectedOnlineOrder) return;
    const approve = action === "approve";
    const question = approve
      ? `Confirm payment for ${selectedOnlineOrder.submission_number}? Tickets will be created and automatically emailed to the buyer.`
      : `Reject ${selectedOnlineOrder.submission_number}? No tickets will be created.`;
    if (!confirm(question)) return;
    App.setBusy(btn, true, approve ? "Issuing…" : "Rejecting…");
    try {
      const { data, error } = await sb.functions.invoke("review-online-order", {
        body: { order_id:selectedOnlineOrder.id, action, review_note:$("reviewNote").value.trim() }
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.message || "Unable to review request.");
      onlineReviewDialog.close();
      App.toast(approve ? `Payment confirmed. ${data.ticket_quantity} tickets created and email queued.` : "Online request rejected.", "success");
      selectedOnlineOrder = null;
      await Promise.all([loadOnlineOrders(), loadTickets()]);
    } catch (err) { App.toast(err.message, "error"); }
    finally { App.setBusy(btn, false); }
  }

  async function loadArchives() {
    const archiveBody = $("archiveBody");
    archiveBody.innerHTML = `<tr><td colspan="6" class="empty">Loading…</td></tr>`;
    const { data, error } = await sb.from("transaction_archives").select("*").order("archived_at", { ascending:false }).limit(500);
    if (error) {
      archiveBody.innerHTML = `<tr><td colspan="6" class="empty error-empty">${App.escapeHtml(error.message)}</td></tr>`;
      return;
    }
    archives = data || [];
    archiveBody.innerHTML = archives.length ? archives.map(a => {
      const r = a.registration_snapshot || {};
      const t = Array.isArray(a.tickets_snapshot) ? a.tickets_snapshot : [];
      return `<tr><td><strong>${App.escapeHtml(a.transaction_number)}</strong></td><td>${App.escapeHtml([r.first_name,r.middle_name,r.last_name].filter(Boolean).join(" "))}<small>${App.escapeHtml(r.email || "")}</small></td><td>${t.length}</td><td>${sourceBadge(r.purchase_source || "finance")}</td><td>${App.escapeHtml(a.archive_reason || "—")}</td><td>${App.formatDateTime(a.archived_at)}</td></tr>`;
    }).join("") : `<tr><td colspan="6" class="empty">No archived transactions.</td></tr>`;
  }

  $("newTicketBtn").onclick = () => newTicketDialog.showModal();
  $("closeNewTicketBtn").onclick = () => newTicketDialog.close();
  $("cancelNewTicketBtn").onclick = () => newTicketDialog.close();
  $("closePaymentBtn").onclick = () => paymentDialog.close();
  $("cancelPaymentBtn").onclick = () => paymentDialog.close();
  $("closeReceiptBtn").onclick = () => receiptDialog.close();
  $("closeOnlineReviewBtn").onclick = () => onlineReviewDialog.close();
  $("successDoneBtn").onclick = () => $("successDialog").close();
  $("onlineAlert").onclick = () => $("onlineRequestsPanel").scrollIntoView({ behavior:"smooth", block:"start" });
  $("approveOnlineBtn").onclick = () => reviewOnline("approve", $("approveOnlineBtn"));
  $("rejectOnlineBtn").onclick = () => reviewOnline("reject", $("rejectOnlineBtn"));

  form.addEventListener("submit", async e => {
    e.preventDefault();
    const btn = $("issueBtn");
    App.setBusy(btn, true, "Creating…");
    const fd = new FormData(form);
    const receiptFile = fd.get("receipt");
    const purchaser = {
      student_number: fd.get("student_number")?.trim(), campus:fd.get("campus"), first_name:fd.get("first_name")?.trim(), middle_name:fd.get("middle_name")?.trim(),
      last_name:fd.get("last_name")?.trim(), email:fd.get("email")?.trim(), course:fd.get("course")?.trim(), year_level:fd.get("year_level")?.trim(), section:fd.get("section")?.trim()
    };
    const paidQty = Number(fd.get("paid_ticket_quantity"));
    const b = bundleCounts(paidQty);

    try {
      if (receiptFile instanceof File && receiptFile.size) validateReceipt(receiptFile);
      const { data, error } = await sb.functions.invoke("issue-tickets", { body:{
        event_slug:APP_CONFIG.eventSlug, purchaser,
        payment:{ paid_ticket_quantity:b.paid, amount_paid:Number(fd.get("amount_paid")), or_number:fd.get("or_number")?.trim() || null, payment_date:fd.get("payment_date"), payment_method:fd.get("payment_method"), notes:fd.get("notes")?.trim() || null }
      }});
      if (error) throw error;
      if (!data?.success) throw new Error(data?.message || "Unable to create ticket.");

      let receiptWarning = "";
      if (receiptFile instanceof File && receiptFile.size) {
        try {
          const receiptPath = await uploadReceipt(data.registration_id, receiptFile);
          const { data:updateData, error:updateError } = await sb.functions.invoke("update-registration", { body:{ registration_id:data.registration_id, updates:{ receipt_path:receiptPath } } });
          if (updateError) throw updateError;
          if (!updateData?.success) throw new Error(updateData?.message || "Receipt update failed.");
        } catch (receiptErr) { receiptWarning = ` Receipt upload needs attention: ${receiptErr.message}`; }
      }

      $("successMessage").textContent = `${data.transaction_number} created. Email queued automatically.${data.free_ticket_quantity ? ` Barkada Bundle added ${data.free_ticket_quantity} FREE ticket${data.free_ticket_quantity > 1 ? "s" : ""}.` : ""}${receiptWarning}`;
      $("issuedTickets").innerHTML = (data.tickets || []).map(t => `<div class="${t.is_free ? "free-issued-ticket" : ""}"><strong>${App.escapeHtml(t.ticket_number)}</strong><span>${App.escapeHtml(t.holder_name)} ${t.is_free ? "• FREE" : ""}</span></div>`).join("");
      newTicketDialog.close(); $("successDialog").showModal();
      form.reset(); setDefaultDate(); qty.value = "1"; updateTotal();
      await loadTickets();
    } catch (err) { App.toast(err.message || "Ticket creation failed.", "error"); }
    finally { App.setBusy(btn, false); }
  });

  editForm.addEventListener("submit", async e => {
    e.preventDefault();
    const btn = $("saveEditBtn"); App.setBusy(btn, true, "Saving…");
    const fd = new FormData(editForm); const registrationId = fd.get("registration_id"); const receiptFile = fd.get("receipt");
    try {
      let receiptPath = fd.get("existing_receipt_path") || null;
      if (receiptFile instanceof File && receiptFile.size) receiptPath = await uploadReceipt(registrationId, receiptFile);
      const { data, error } = await sb.functions.invoke("update-registration", { body:{ registration_id:registrationId, updates:{
        or_number:fd.get("or_number")?.trim() || null, receipt_path:receiptPath, amount_paid:Number(fd.get("amount_paid")), payment_date:fd.get("payment_date"), payment_method:fd.get("payment_method")?.trim(), notes:fd.get("notes")?.trim() || null
      }}});
      if (error) throw error; if (!data?.success) throw new Error(data?.message || "Update failed.");
      paymentDialog.close(); App.toast("Payment record updated.", "success"); await loadTickets();
    } catch (err) { App.toast(err.message || "Update failed.", "error"); }
    finally { App.setBusy(btn, false); }
  });

  $("ticketSearch").addEventListener("input", renderRows);
  $("emailFilter").addEventListener("change", renderRows);
  $("sourceFilter").addEventListener("change", renderRows);
  $("onlineSearch").addEventListener("input", renderOnlineOrders);
  $("onlineStatusFilter").addEventListener("change", renderOnlineOrders);
  $("refreshBtn").onclick = () => loadTickets();
  $("refreshOnlineBtn").onclick = () => loadOnlineOrders();
  $("refreshArchiveBtn").onclick = () => loadArchives();

  await Promise.all([loadOnlineOrders(), loadTickets(), loadArchives()]);
  setInterval(() => loadOnlineOrders(), 30000);
})();
