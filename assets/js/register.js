(() => {
  const $ = id => document.getElementById(id);
  const form = $("onlineOrderForm");
  const qty = $("onlineQty");
  const price = APP_CONFIG.event.ticketPrice;

  function counts() {
    const paid = Math.max(1, Math.min(50, Number(qty.value || 1)));
    const free = Math.floor(paid / 10);
    return { paid, free, total:paid + free };
  }

  function updateSummary() {
    const c = counts();
    qty.value = c.paid;
    $("onlinePaidCount").textContent = c.paid;
    $("onlineFreeCount").textContent = c.free;
    $("onlineTotalCount").textContent = c.total;
    $("onlineExpectedTotal").value = App.money(c.paid * price);
    $("onlineBundleSummary").classList.toggle("has-free", c.free > 0);
  }

  qty.addEventListener("input", updateSummary);
  updateSummary();

  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(",")[1]);
      reader.onerror = () => reject(new Error("Unable to read proof of payment."));
      reader.readAsDataURL(file);
    });
  }


  document.querySelectorAll(".copy-account-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      const account = btn.dataset.account || "";
      const original = btn.textContent;

      try {
        await navigator.clipboard.writeText(account);
        btn.textContent = "Copied";
        btn.classList.add("copied");
      } catch {
        const temp = document.createElement("textarea");
        temp.value = account;
        temp.setAttribute("readonly", "");
        temp.style.position = "fixed";
        temp.style.opacity = "0";
        document.body.appendChild(temp);
        temp.select();
        document.execCommand("copy");
        temp.remove();
        btn.textContent = "Copied";
        btn.classList.add("copied");
      }

      setTimeout(() => {
        btn.textContent = original;
        btn.classList.remove("copied");
      }, 1400);
    });
  });

  form.addEventListener("submit", async e => {
    e.preventDefault();
    const btn = $("onlineSubmitBtn");
    const errorBox = $("onlineOrderError");
    errorBox.hidden = true;
    const fd = new FormData(form);
    const proof = fd.get("proof");
    const allowed = ["image/jpeg","image/png","image/webp"];

    try {
      if (!(proof instanceof File) || !proof.size) throw new Error("Please attach your proof of payment.");
      if (!allowed.includes(proof.type)) throw new Error("Proof must be a JPG, PNG, or WebP image.");
      if (proof.size > 5 * 1024 * 1024) throw new Error("Proof of payment must be 5 MB or smaller.");

      App.setBusy(btn, true, "Submitting…");
      const c = counts();
      const proofData = await fileToBase64(proof);

      const { data, error } = await sb.functions.invoke("online-order-submit", { body:{
        event_slug:APP_CONFIG.eventSlug, website:fd.get("website")?.trim(),
        first_name:fd.get("first_name")?.trim(), middle_name:fd.get("middle_name")?.trim(), last_name:fd.get("last_name")?.trim(),
        email:fd.get("email")?.trim(), contact_number:fd.get("contact_number")?.trim(), organization:fd.get("organization")?.trim(),
        paid_ticket_quantity:c.paid, payment_method:fd.get("payment_method"), payment_reference:fd.get("payment_reference")?.trim(), notes:fd.get("notes")?.trim(),
        proof:{ name:proof.name, type:proof.type, data:proofData }
      }});
      if (error) throw error;
      if (!data?.success) throw new Error(data?.message || "Unable to submit online ticket request.");

      $("onlineSubmissionNumber").textContent = data.submission_number;
      $("onlineSuccessBundle").innerHTML = `${data.paid_ticket_quantity} paid ticket${data.paid_ticket_quantity === 1 ? "" : "s"}${data.free_ticket_quantity ? ` + <strong>${data.free_ticket_quantity} FREE</strong>` : ""} • ${data.total_ticket_quantity} total`;
      $("onlineSuccessDialog").showModal();
      form.reset(); qty.value = "1"; updateSummary();
    } catch (err) {
      errorBox.textContent = err.message || "Unable to submit request.";
      errorBox.hidden = false;
    } finally { App.setBusy(btn, false); }
  });

  $("onlineSuccessDoneBtn").onclick = () => $("onlineSuccessDialog").close();
})();
