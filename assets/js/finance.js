(async () => {
  const auth = await Auth.requireRole(["admin","finance","event_admin"]);
  document.getElementById("logoutBtn").onclick = Auth.logout;
  if (auth.profile.role === "finance") document.getElementById("adminLink").style.display = "none";

  const cfg = APP_CONFIG.event;
  const form = document.getElementById("financeForm");
  const qty = document.getElementById("ticketQty");
  const expected = document.getElementById("expectedTotal");
  const recentBody = document.getElementById("recentBody");
  const editDialog = document.getElementById("editDialog");
  const editForm = document.getElementById("editForm");

  for (let i=1; i<=cfg.maxTickets; i++) {
    const o = document.createElement("option");
    o.value = i; o.textContent = `${i} ticket${i>1?"s":""}`;
    qty.appendChild(o);
  }

  const today = new Date();
  form.payment_date.value = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,"0")}-${String(today.getDate()).padStart(2,"0")}`;

  function updateTotal() {
    const total = Number(qty.value || 1) * cfg.ticketPrice;
    expected.value = App.money(total);
    if (!form.amount_paid.value) form.amount_paid.value = total.toFixed(2);
    renderHolders();
  }

  function renderHolders() {
    const box = document.getElementById("holderFields");
    if (!cfg.collectTicketHolderNames) { box.innerHTML = ""; return; }
    const n = Number(qty.value || 1);
    box.innerHTML = `<div class="form-divider"><span>Ticket Holders</span></div>` +
      Array.from({length:n},(_,i)=>`
        <label>Ticket ${i+1} Holder Name
          <input name="holder_${i}" ${i===0?'placeholder="Leave blank to use purchaser name"':''}>
        </label>`).join("");
  }

  qty.addEventListener("change", updateTotal);
  updateTotal();

  async function loadRecent() {
    recentBody.innerHTML = `<tr><td colspan="5" class="empty">Loading…</td></tr>`;
    const { data, error } = await sb.from("registrations")
      .select("id,transaction_number,first_name,middle_name,last_name,ticket_quantity,or_number,amount_paid,payment_date,payment_method,notes,email_status,created_at")
      .order("created_at", { ascending:false }).limit(30);
    if (error) {
      recentBody.innerHTML = `<tr><td colspan="5" class="empty">${App.escapeHtml(error.message)}</td></tr>`;
      return;
    }
    if (!data?.length) {
      recentBody.innerHTML = `<tr><td colspan="5" class="empty">No transactions yet.</td></tr>`;
      return;
    }
    recentBody.innerHTML = data.map(r => `
      <tr>
        <td><strong>${App.escapeHtml(r.transaction_number)}</strong><small>${App.formatDateTime(r.created_at)}</small></td>
        <td>${App.escapeHtml(App.fullName(r))}</td>
        <td>${r.ticket_quantity}</td>
        <td>${App.escapeHtml(r.or_number || "Pending")}</td>
        <td><div style="display:flex;gap:6px"><button class="btn btn-ghost btn-small resend-row" data-id="${r.id}">Resend</button><button class="btn btn-ghost btn-small edit-row" data-id="${r.id}">Edit</button></div></td>
      </tr>`).join("");
    recentBody.querySelectorAll(".resend-row").forEach(btn => {
      btn.onclick = async () => {
        App.setBusy(btn,true,"Sending…");
        try {
          const {data,error} = await sb.functions.invoke("resend-ticket",{body:{registration_id:btn.dataset.id}});
          if (error) throw error;
          if (!data?.success) throw new Error(data?.message || "Unable to resend email.");
          App.toast("Ticket email resent.","success");
          await loadRecent();
        } catch(err) { App.toast(err.message || "Unable to resend email.","error"); }
        finally { App.setBusy(btn,false); }
      };
    });

    recentBody.querySelectorAll(".edit-row").forEach(btn => {
      btn.onclick = () => {
        const r = data.find(x => x.id === btn.dataset.id);
        editForm.registration_id.value = r.id;
        editForm.or_number.value = r.or_number || "";
        editForm.amount_paid.value = r.amount_paid ?? "";
        editForm.payment_date.value = r.payment_date || "";
        editForm.payment_method.value = r.payment_method || "";
        editForm.notes.value = r.notes || "";
        editDialog.showModal();
      };
    });
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = document.getElementById("issueBtn");
    App.setBusy(btn, true, "Issuing tickets…");
    const fd = new FormData(form);
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
      cfg.collectTicketHolderNames ? (fd.get(`holder_${i}`)?.trim() || App.fullName(purchaser)) : App.fullName(purchaser)
    );
    const payload = {
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
    };
    try {
      const { data, error } = await sb.functions.invoke("issue-tickets", { body: payload });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.message || "Unable to issue tickets.");
      document.getElementById("successMessage").textContent =
        `${data.transaction_number} created. ${data.email_sent ? "Confirmation email sent." : "Tickets created, but email delivery needs attention."}`;
      document.getElementById("issuedTickets").innerHTML = data.tickets.map(t =>
        `<div><strong>${App.escapeHtml(t.ticket_number)}</strong><span>${App.escapeHtml(t.holder_name)}</span></div>`
      ).join("");
      document.getElementById("successDialog").showModal();
      form.reset();
      form.payment_date.value = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,"0")}-${String(today.getDate()).padStart(2,"0")}`;
      qty.value = "1"; updateTotal();
      await loadRecent();
    } catch (err) {
      App.toast(err.message || "Ticket issuance failed.", "error");
    } finally {
      App.setBusy(btn, false);
    }
  });

  editForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = document.getElementById("saveEditBtn");
    App.setBusy(btn, true, "Saving…");
    const fd = new FormData(editForm);
    try {
      const { data, error } = await sb.functions.invoke("update-registration", {
        body: {
          registration_id: fd.get("registration_id"),
          updates: {
            or_number: fd.get("or_number")?.trim() || null,
            amount_paid: Number(fd.get("amount_paid")),
            payment_date: fd.get("payment_date"),
            payment_method: fd.get("payment_method")?.trim(),
            notes: fd.get("notes")?.trim() || null
          }
        }
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.message || "Update failed.");
      editDialog.close();
      App.toast("Payment details updated.", "success");
      await loadRecent();
    } catch (err) {
      App.toast(err.message || "Update failed.", "error");
    } finally { App.setBusy(btn, false); }
  });

  document.getElementById("refreshBtn").onclick = loadRecent;
  await loadRecent();
})();
