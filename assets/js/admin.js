(async () => {
  const auth = await Auth.requireRole(["admin","event_admin","viewer"]);
  document.getElementById("logoutBtn").onclick = Auth.logout;
  const addUserBtn = document.getElementById("addUserBtn");
  if (auth.profile.role !== "admin") addUserBtn.style.display = "none";
  if (auth.profile.role === "viewer") {
    document.getElementById("financeLink").style.display = "none";
    document.getElementById("scannerLink").style.display = "none";
  }

  let registrations = [];

  async function loadStats() {
    const [r, t, used, unused] = await Promise.all([
      sb.from("registrations").select("*", {count:"exact", head:true}),
      sb.from("tickets").select("*", {count:"exact", head:true}),
      sb.from("tickets").select("*", {count:"exact", head:true}).eq("status","used"),
      sb.from("tickets").select("*", {count:"exact", head:true}).eq("status","unused")
    ]);
    document.getElementById("statTransactions").textContent = r.count ?? "—";
    document.getElementById("statTickets").textContent = t.count ?? "—";
    document.getElementById("statUsed").textContent = used.count ?? "—";
    document.getElementById("statUnused").textContent = unused.count ?? "—";
    const { data } = await sb.from("registrations").select("amount_paid");
    const sales = (data || []).reduce((a,b)=>a+Number(b.amount_paid||0),0);
    document.getElementById("statSales").textContent = App.money(sales);
  }

  async function loadRegistrations() {
    const { data, error } = await sb.from("registrations")
      .select("id,transaction_number,student_number,first_name,middle_name,last_name,email,course,year_level,section,ticket_quantity,amount_paid,or_number,sheet_sync_status,email_status,created_at")
      .order("created_at",{ascending:false}).limit(300);
    if (error) { App.toast(error.message,"error"); return; }
    registrations = data || [];
    renderRegistrations();
  }

  function renderRegistrations() {
    const q = document.getElementById("search").value.toLowerCase().trim();
    const rows = registrations.filter(r => [
      r.transaction_number,r.student_number,r.first_name,r.middle_name,r.last_name,r.or_number
    ].filter(Boolean).join(" ").toLowerCase().includes(q));
    document.getElementById("registrationBody").innerHTML = rows.length ? rows.map(r=>`
      <tr>
        <td><strong>${App.escapeHtml(r.transaction_number)}</strong><small>${App.formatDateTime(r.created_at)}</small></td>
        <td><strong>${App.escapeHtml(App.fullName(r))}</strong><small>${App.escapeHtml(r.student_number)}</small></td>
        <td>${App.escapeHtml(r.course)}<small>${App.escapeHtml(`${r.year_level} • ${r.section}`)}</small></td>
        <td>${r.ticket_quantity}</td>
        <td>${App.money(r.amount_paid)}</td>
        <td>${App.escapeHtml(r.or_number || "Pending")}</td>
        <td>${App.badge(r.sheet_sync_status || "pending")}</td>
        <td>${App.badge(r.email_status || "pending")}</td>
      </tr>`).join("") : `<tr><td colspan="8" class="empty">No matching registrations.</td></tr>`;
  }


  async function loadTickets() {
    const {data,error} = await sb.from("tickets")
      .select("id,ticket_number,holder_name,status,checked_in_at,checked_in_gate,registration_id,registrations(transaction_number)")
      .order("created_at",{ascending:false}).limit(300);
    const body = document.getElementById("ticketBody");
    if (error) { body.innerHTML=`<tr><td colspan="6" class="empty">${App.escapeHtml(error.message)}</td></tr>`; return; }
    body.innerHTML = data?.length ? data.map(t=>`
      <tr>
        <td><strong>${App.escapeHtml(t.ticket_number)}</strong></td>
        <td>${App.escapeHtml(t.holder_name)}</td>
        <td>${App.escapeHtml(t.registrations?.transaction_number || "—")}</td>
        <td>${App.badge(t.status)}</td>
        <td>${t.checked_in_at ? App.formatDateTime(t.checked_in_at) + (t.checked_in_gate ? `<small>${App.escapeHtml(t.checked_in_gate)}</small>` : "") : "—"}</td>
        <td>${auth.profile.role !== "viewer" && t.status === "unused" ? `<button class="btn btn-ghost btn-small void-ticket" data-id="${t.id}" data-number="${App.escapeHtml(t.ticket_number)}">Void</button>` : ""}</td>
      </tr>`).join("") : `<tr><td colspan="6" class="empty">No tickets yet.</td></tr>`;
    body.querySelectorAll(".void-ticket").forEach(btn => {
      btn.onclick = async () => {
        if (!confirm(`Void ${btn.dataset.number}? This QR will no longer be accepted.`)) return;
        App.setBusy(btn,true,"Voiding…");
        try {
          const {data,error} = await sb.functions.invoke("void-ticket",{body:{ticket_id:btn.dataset.id}});
          if (error) throw error;
          if (!data?.success) throw new Error(data?.message || "Unable to void ticket.");
          App.toast("Ticket voided.","success");
          await Promise.all([loadTickets(),loadStats()]);
        } catch(err) { App.toast(err.message,"error"); }
        finally { App.setBusy(btn,false); }
      };
    });
  }

  async function loadCheckins() {
    const { data, error } = await sb.from("checkin_logs")
      .select("id,ticket_number,result,gate,scanned_at")
      .order("scanned_at",{ascending:false}).limit(40);
    const body = document.getElementById("checkinBody");
    if (error) { body.innerHTML=`<tr><td colspan="4" class="empty">${App.escapeHtml(error.message)}</td></tr>`; return; }
    body.innerHTML = data?.length ? data.map(c=>`
      <tr><td><strong>${App.escapeHtml(c.ticket_number || "Unknown")}</strong></td><td>${App.badge(c.result)}</td><td>${App.escapeHtml(c.gate || "—")}</td><td>${App.formatDateTime(c.scanned_at)}</td></tr>
    `).join("") : `<tr><td colspan="4" class="empty">No scans yet.</td></tr>`;
  }

  async function loadStaff() {
    const { data, error } = await sb.from("profiles").select("id,full_name,email,role,active").order("full_name");
    const box = document.getElementById("staffList");
    if (error) { box.textContent=error.message; return; }
    box.innerHTML = (data||[]).map(p=>`
      <div class="staff-row"><div><strong>${App.escapeHtml(p.full_name || p.email)}</strong><small>${App.escapeHtml(p.email || "")}</small></div>
      <div><span class="role">${App.escapeHtml(p.role.replace("_"," ").toUpperCase())}</span>${p.active?"":"<span class='status status-void'>INACTIVE</span>"}</div></div>
    `).join("") || "No staff accounts.";
  }

  document.getElementById("search").addEventListener("input", renderRegistrations);
  addUserBtn.onclick = () => document.getElementById("userDialog").showModal();

  document.getElementById("userForm").addEventListener("submit", async e => {
    e.preventDefault();
    const btn = document.getElementById("createUserBtn");
    App.setBusy(btn,true,"Creating…");
    const fd = new FormData(e.currentTarget);
    try {
      const { data, error } = await sb.functions.invoke("admin-create-user", {body:Object.fromEntries(fd.entries())});
      if (error) throw error;
      if (!data?.success) throw new Error(data?.message || "Unable to create user.");
      document.getElementById("userDialog").close();
      e.currentTarget.reset();
      App.toast("Staff account created.","success");
      loadStaff();
    } catch(err) { App.toast(err.message,"error"); }
    finally { App.setBusy(btn,false); }
  });

  document.getElementById("refreshTicketsBtn").onclick = loadTickets;
  await Promise.all([loadStats(),loadRegistrations(),loadTickets(),loadCheckins(),loadStaff()]);
})();
