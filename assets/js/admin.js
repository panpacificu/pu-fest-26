(async () => {
  const auth = await Auth.requireRole(["admin", "event_admin", "viewer"]);

  const $ = id => document.getElementById(id);
  const isViewer = auth.profile.role === "viewer";
  const canManage = ["admin", "event_admin"].includes(auth.profile.role);

  $("logoutBtn").onclick = Auth.logout;
  if (auth.profile.role !== "admin") $("addUserBtn").style.display = "none";

  if (isViewer) {
    $("financeLink").style.display = "none";
    $("scannerLink").style.display = "none";
  }

  let registrations = [];
  let tickets = [];
  let checkins = [];

  function panelError(target, message, colspan = null) {
    const safe = App.escapeHtml(message || "Unable to load.");
    if (colspan) {
      target.innerHTML = `<tr><td colspan="${colspan}" class="empty error-empty">Unable to load: ${safe}</td></tr>`;
    } else {
      target.innerHTML = `<div class="empty-card error-empty">Unable to load: ${safe}</div>`;
    }
  }

  async function loadStats() {
    try {
      const [r, t, used, unused, salesResult] = await Promise.all([
        sb.from("registrations").select("*", { count: "exact", head: true }),
        sb.from("tickets").select("*", { count: "exact", head: true }),
        sb.from("tickets").select("*", { count: "exact", head: true }).eq("status", "used"),
        sb.from("tickets").select("*", { count: "exact", head: true }).eq("status", "unused"),
        sb.from("registrations").select("amount_paid")
      ]);

      const firstError = [r, t, used, unused, salesResult].find(x => x.error)?.error;
      if (firstError) throw firstError;

      const totalTickets = t.count || 0;
      const usedCount = used.count || 0;
      const attendance = totalTickets ? Math.round((usedCount / totalTickets) * 100) : 0;
      const sales = (salesResult.data || []).reduce((sum, row) => sum + Number(row.amount_paid || 0), 0);

      $("statTransactions").textContent = r.count ?? "0";
      $("statTickets").textContent = totalTickets;
      $("statUsed").textContent = usedCount;
      $("statUnused").textContent = unused.count ?? "0";
      $("statAttendance").textContent = `${attendance}%`;
      $("statSales").textContent = App.money(sales);
    } catch (err) {
      ["statTransactions", "statTickets", "statUsed", "statUnused", "statAttendance", "statSales"]
        .forEach(id => $(id).textContent = "—");
      App.toast(`Dashboard stats: ${err.message}`, "error");
    }
  }

  async function loadRegistrations() {
    const body = $("registrationBody");
    body.innerHTML = `<tr><td colspan="9" class="empty">Loading…</td></tr>`;

    try {
      const { data, error } = await sb
        .from("registrations")
        .select([
          "id", "transaction_number", "student_number", "first_name", "middle_name", "last_name",
          "email", "course", "year_level", "section", "ticket_quantity", "amount_paid",
          "or_number", "sheet_sync_status", "sheet_sync_error", "email_status", "email_error",
          "created_at"
        ].join(","))
        .order("created_at", { ascending: false })
        .limit(500);

      if (error) throw error;
      registrations = data || [];
      renderRegistrations();
    } catch (err) {
      panelError(body, err.message, 9);
    }
  }

  function deliveryMatch(r, filter) {
    if (filter === "all") return true;
    if (filter === "needs_attention") {
      return ["failed"].includes(r.sheet_sync_status) || ["failed"].includes(r.email_status);
    }
    if (filter === "sent_synced") {
      return r.sheet_sync_status === "synced" && r.email_status === "sent";
    }
    if (filter === "email_pending") return ["pending", "processing"].includes(r.email_status);
    if (filter === "backup_pending") return ["pending", "processing"].includes(r.sheet_sync_status);
    return true;
  }

  function renderRegistrations() {
    const q = $("registrationSearch").value.toLowerCase().trim();
    const filter = $("deliveryFilter").value;

    const rows = registrations.filter(r => {
      const haystack = [
        r.transaction_number, r.student_number, r.first_name, r.middle_name, r.last_name,
        r.email, r.course, r.section, r.or_number
      ].filter(Boolean).join(" ").toLowerCase();

      return haystack.includes(q) && deliveryMatch(r, filter);
    });

    $("registrationBody").innerHTML = rows.length ? rows.map(r => {
      const sheetTitle = r.sheet_sync_error ? ` title="${App.escapeHtml(r.sheet_sync_error)}"` : "";
      const emailTitle = r.email_error ? ` title="${App.escapeHtml(r.email_error)}"` : "";

      return `
        <tr>
          <td>
            <strong>${App.escapeHtml(r.transaction_number)}</strong>
            <small>${App.formatDateTime(r.created_at)}</small>
          </td>
          <td>
            <strong>${App.escapeHtml(App.fullName(r))}</strong>
            <small>${App.escapeHtml(r.student_number)}</small>
          </td>
          <td>
            ${App.escapeHtml(r.course)}
            <small>${App.escapeHtml(`${r.year_level} • ${r.section}`)}</small>
          </td>
          <td>${r.ticket_quantity}</td>
          <td>${App.money(r.amount_paid)}</td>
          <td>${App.escapeHtml(r.or_number || "Pending")}</td>
          <td${sheetTitle}>${App.badge(r.sheet_sync_status || "pending")}</td>
          <td${emailTitle}>${App.badge(r.email_status || "pending")}</td>
          <td>
            ${isViewer ? "" : `
              <div class="row-actions">
                <button class="btn btn-ghost btn-small resend-email" data-id="${r.id}">Resend Email</button>
                <button class="btn btn-ghost btn-small retry-sync" data-id="${r.id}">Retry Backup</button>
              </div>
            `}
          </td>
        </tr>`;
    }).join("") : `<tr><td colspan="9" class="empty">No matching registrations.</td></tr>`;

    if (!isViewer) {
      document.querySelectorAll(".resend-email").forEach(btn => {
        btn.onclick = () => queueResend(btn.dataset.id, btn);
      });
      document.querySelectorAll(".retry-sync").forEach(btn => {
        btn.onclick = () => queueSync(btn.dataset.id, btn);
      });
    }
  }

  async function queueResend(id, btn) {
    App.setBusy(btn, true, "Queued…");
    try {
      const { data, error } = await sb.functions.invoke("resend-ticket", {
        body: { registration_id: id }
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.message || "Unable to queue email.");
      App.toast("Ticket email queued. Worker will send it shortly.", "success");
      await loadRegistrations();
    } catch (err) {
      App.toast(err.message, "error");
    } finally {
      App.setBusy(btn, false);
    }
  }

  async function queueSync(id, btn) {
    App.setBusy(btn, true, "Queued…");
    try {
      const { data, error } = await sb.functions.invoke("retry-sync", {
        body: { registration_id: id }
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.message || "Unable to queue backup.");
      App.toast("Backup refresh queued.", "success");
      await loadRegistrations();
    } catch (err) {
      App.toast(err.message, "error");
    } finally {
      App.setBusy(btn, false);
    }
  }

  async function loadTickets() {
    const body = $("ticketBody");
    body.innerHTML = `<tr><td colspan="6" class="empty">Loading…</td></tr>`;

    try {
      const { data, error } = await sb
        .from("tickets")
        .select("id,ticket_number,holder_name,status,checked_in_at,checked_in_gate,registration_id,created_at,registrations(transaction_number)")
        .order("created_at", { ascending: false })
        .limit(800);

      if (error) throw error;
      tickets = data || [];
      renderTickets();
    } catch (err) {
      panelError(body, err.message, 6);
    }
  }

  function renderTickets() {
    const q = $("ticketSearch").value.toLowerCase().trim();
    const status = $("ticketStatusFilter").value;

    const rows = tickets.filter(t => {
      const haystack = [
        t.ticket_number, t.holder_name, t.registrations?.transaction_number
      ].filter(Boolean).join(" ").toLowerCase();

      return haystack.includes(q) && (status === "all" || t.status === status);
    });

    $("ticketBody").innerHTML = rows.length ? rows.map(t => `
      <tr>
        <td><strong>${App.escapeHtml(t.ticket_number)}</strong></td>
        <td>${App.escapeHtml(t.holder_name)}</td>
        <td>${App.escapeHtml(t.registrations?.transaction_number || "—")}</td>
        <td>${App.badge(t.status)}</td>
        <td>
          ${t.checked_in_at
            ? `${App.formatDateTime(t.checked_in_at)}${t.checked_in_gate ? `<small>${App.escapeHtml(t.checked_in_gate)}</small>` : ""}`
            : "—"}
        </td>
        <td>
          ${canManage && t.status === "unused"
            ? `<button class="btn btn-danger-soft btn-small void-ticket" data-id="${t.id}" data-number="${App.escapeHtml(t.ticket_number)}">Void</button>`
            : ""}
        </td>
      </tr>
    `).join("") : `<tr><td colspan="6" class="empty">No matching tickets.</td></tr>`;

    if (canManage) {
      document.querySelectorAll(".void-ticket").forEach(btn => {
        btn.onclick = async () => {
          if (!confirm(`Void ${btn.dataset.number}? This QR will no longer be accepted.`)) return;

          App.setBusy(btn, true, "Voiding…");
          try {
            const { data, error } = await sb.functions.invoke("void-ticket", {
              body: { ticket_id: btn.dataset.id }
            });

            if (error) throw error;
            if (!data?.success) throw new Error(data?.message || "Unable to void ticket.");

            App.toast("Ticket voided. Backup refresh queued.", "success");
            await Promise.all([loadTickets(), loadStats(), loadRegistrations(), loadActivity()]);
          } catch (err) {
            App.toast(err.message, "error");
          } finally {
            App.setBusy(btn, false);
          }
        };
      });
    }
  }

  async function loadCheckins() {
    const body = $("checkinBody");
    body.innerHTML = `<tr><td colspan="4" class="empty">Loading…</td></tr>`;

    try {
      const { data, error } = await sb
        .from("checkin_logs")
        .select("id,ticket_number,result,gate,scanned_at")
        .order("scanned_at", { ascending: false })
        .limit(250);

      if (error) throw error;
      checkins = data || [];

      body.innerHTML = checkins.length ? checkins.slice(0, 50).map(c => `
        <tr>
          <td><strong>${App.escapeHtml(c.ticket_number || "Unknown")}</strong></td>
          <td>${App.badge(c.result)}</td>
          <td>${App.escapeHtml(c.gate || "—")}</td>
          <td>${App.formatDateTime(c.scanned_at)}</td>
        </tr>
      `).join("") : `<tr><td colspan="4" class="empty">No scans yet.</td></tr>`;

      renderGateStats();
    } catch (err) {
      panelError(body, err.message, 4);
      panelError($("gateStats"), err.message);
    }
  }

  function renderGateStats() {
    const totals = {};
    checkins
      .filter(c => c.result === "success")
      .forEach(c => {
        const gate = c.gate || "Unspecified";
        totals[gate] = (totals[gate] || 0) + 1;
      });

    const sorted = Object.entries(totals).sort((a, b) => b[1] - a[1]);

    $("gateStats").innerHTML = sorted.length ? sorted.map(([gate, count]) => `
      <div class="gate-row">
        <div><strong>${App.escapeHtml(gate)}</strong><small>successful check-ins</small></div>
        <span>${count}</span>
      </div>
    `).join("") : `<div class="empty-card">No successful check-ins yet.</div>`;
  }

  async function loadActivity() {
    const box = $("activityList");

    try {
      const { data, error } = await sb
        .from("audit_logs")
        .select("id,action,entity_type,entity_id,created_at")
        .order("created_at", { ascending: false })
        .limit(30);

      if (error) throw error;

      box.innerHTML = data?.length ? data.map(item => `
        <div class="activity-row">
          <div class="activity-dot"></div>
          <div>
            <strong>${App.escapeHtml(item.action.replaceAll("_", " "))}</strong>
            <span>${App.escapeHtml(item.entity_type)}${item.entity_id ? ` • ${App.escapeHtml(item.entity_id.slice(0, 12))}` : ""}</span>
          </div>
          <time>${App.formatDateTime(item.created_at)}</time>
        </div>
      `).join("") : `<div class="empty-card">No activity yet.</div>`;
    } catch (err) {
      // Viewer may not have audit permission; don't freeze the dashboard.
      box.innerHTML = isViewer
        ? `<div class="empty-card">Activity log is available to Admin/Event Admin.</div>`
        : `<div class="empty-card error-empty">Unable to load: ${App.escapeHtml(err.message)}</div>`;
    }
  }

  async function loadStaff() {
    const box = $("staffList");

    try {
      const { data, error } = await sb
        .from("profiles")
        .select("id,full_name,email,role,active")
        .order("full_name");

      if (error) throw error;

      box.innerHTML = (data || []).map(p => `
        <div class="staff-row">
          <div>
            <strong>${App.escapeHtml(p.full_name || p.email)}</strong>
            <small>${App.escapeHtml(p.email || "")}</small>
          </div>
          <div>
            <span class="role">${App.escapeHtml(p.role.replace("_", " ").toUpperCase())}</span>
            ${p.active ? "" : "<span class='status status-void'>INACTIVE</span>"}
          </div>
        </div>
      `).join("") || `<div class="empty-card">No staff accounts.</div>`;
    } catch (err) {
      box.innerHTML = `<div class="empty-card error-empty">Unable to load: ${App.escapeHtml(err.message)}</div>`;
    }
  }

  function csvEscape(value) {
    const text = String(value ?? "");
    return `"${text.replaceAll('"', '""')}"`;
  }

  function exportRegistrations() {
    if (!registrations.length) {
      App.toast("No registration data to export.", "error");
      return;
    }

    const headers = [
      "Transaction", "Student Number", "Full Name", "Email", "Course", "Year Level",
      "Section", "Ticket Quantity", "Amount Paid", "OR Number", "Backup Status",
      "Email Status", "Created At"
    ];

    const rows = registrations.map(r => [
      r.transaction_number, r.student_number, App.fullName(r), r.email, r.course, r.year_level,
      r.section, r.ticket_quantity, r.amount_paid, r.or_number || "",
      r.sheet_sync_status, r.email_status, r.created_at
    ]);

    const csv = [headers, ...rows].map(row => row.map(csvEscape).join(",")).join("\r\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `PU-Fest-2026-Registrations-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  $("registrationSearch").addEventListener("input", renderRegistrations);
  $("deliveryFilter").addEventListener("change", renderRegistrations);
  $("ticketSearch").addEventListener("input", renderTickets);
  $("ticketStatusFilter").addEventListener("change", renderTickets);

  $("refreshRegistrationsBtn").onclick = loadRegistrations;
  $("refreshTicketsBtn").onclick = loadTickets;
  $("exportBtn").onclick = exportRegistrations;

  $("addUserBtn").onclick = () => $("userDialog").showModal();

  $("userForm").addEventListener("submit", async e => {
    e.preventDefault();

    const btn = $("createUserBtn");
    App.setBusy(btn, true, "Creating…");
    const fd = new FormData(e.currentTarget);

    try {
      const { data, error } = await sb.functions.invoke("admin-create-user", {
        body: Object.fromEntries(fd.entries())
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.message || "Unable to create user.");

      $("userDialog").close();
      e.currentTarget.reset();
      App.toast("Staff account created.", "success");
      await Promise.all([loadStaff(), loadActivity()]);
    } catch (err) {
      App.toast(err.message, "error");
    } finally {
      App.setBusy(btn, false);
    }
  });

  // Each panel handles its own errors, so one failed query cannot freeze the page.
  await Promise.allSettled([
    loadStats(),
    loadRegistrations(),
    loadTickets(),
    loadCheckins(),
    loadActivity(),
    loadStaff()
  ]);
})();
