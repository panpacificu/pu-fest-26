(async () => {
  const result = document.getElementById("resultCard");
  const scanNext = document.getElementById("scanNextBtn");
  const accessForm = document.getElementById("scannerAccessForm");
  const lockScreen = document.getElementById("scannerLockScreen");
  const scannerApp = document.getElementById("scannerApp");
  let scanner;
  let locked = false;
  let manualTicketNo = null;
  let scannerPassword = sessionStorage.getItem("pufest_scanner_password") || "";

  function tokenFromScan(text) {
    try {
      const u = new URL(text);
      return u.searchParams.get("t") || text;
    } catch { return text.trim(); }
  }

  async function verifyPassword(password) {
    const { data, error } = await sb.functions.invoke("scanner-access", {
      body: { password }
    });
    if (error) throw error;
    if (!data?.success) throw new Error(data?.message || "Incorrect scanner password.");
    return true;
  }

  async function unlock(password) {
    await verifyPassword(password);
    scannerPassword = password;
    sessionStorage.setItem("pufest_scanner_password", password);
    document.body.classList.remove("scanner-locked");
    lockScreen.hidden = true;
    scannerApp.hidden = false;
    await startScanner();
  }

  async function lockScanner() {
    sessionStorage.removeItem("pufest_scanner_password");
    scannerPassword = "";
    try {
      if (scanner?.getState && scanner.getState() !== 1) await scanner.stop();
    } catch {}
    scannerApp.hidden = true;
    lockScreen.hidden = false;
    document.body.classList.add("scanner-locked");
    document.getElementById("scannerPassword").value = "";
    document.getElementById("scannerPassword").focus();
  }

  accessForm.addEventListener("submit", async e => {
    e.preventDefault();
    const btn = document.getElementById("unlockScannerBtn");
    const errorBox = document.getElementById("scannerAccessError");
    errorBox.hidden = true;
    App.setBusy(btn, true, "Checking…");
    try {
      await unlock(document.getElementById("scannerPassword").value);
    } catch (err) {
      errorBox.textContent = err.message || "Unable to unlock scanner.";
      errorBox.hidden = false;
    } finally {
      App.setBusy(btn, false);
    }
  });

  document.getElementById("lockScannerBtn").onclick = lockScanner;

  function showResult(data) {
    const state = data.result || "invalid";
    result.className = `scan-result ${state}`;
    const map = {
      success:["✓","TICKET VALID"],
      used:["!","ALREADY USED"],
      void:["×","VOID / INACTIVE"],
      invalid:["×","INVALID TICKET"]
    };
    document.getElementById("resultSymbol").textContent = map[state]?.[0] || "×";
    document.getElementById("resultLabel").textContent = map[state]?.[1] || "INVALID";
    document.getElementById("resultName").textContent = data.holder_name || data.purchaser_name || "Ticket not found";
    const bits = [data.course, data.year_level, data.section].filter(Boolean);
    document.getElementById("resultDetails").textContent =
      state === "used" && data.checked_in_at
        ? `Previously admitted ${App.formatDateTime(data.checked_in_at)}${data.checked_in_gate ? ` • ${data.checked_in_gate}` : ""}`
        : bits.join(" • ") || data.message || "";
    document.getElementById("resultTicket").textContent = data.ticket_number || "";
    document.getElementById("resultBundle").innerHTML = data.is_free
      ? `<span class="bundle-badge">FREE • BARKADA BUNDLE</span>` : "";
    scanNext.style.display = "inline-flex";
  }

  async function redeem(token, ticketNumber=null, method="qr") {
    if (locked) return;
    locked = true;
    try {
      const { data, error } = await sb.functions.invoke("check-in", {
        body: {
          scanner_password: scannerPassword,
          token: token || null,
          ticket_number: ticketNumber || null,
          gate: document.getElementById("gate").value.trim() || "Main Entrance",
          method
        }
      });
      if (error) throw error;
      if (data?.auth_error) { await lockScanner(); return; }
      showResult(data || {result:"invalid"});
      if (scanner?.getState && scanner.getState() === 2) await scanner.pause(true);
    } catch (err) {
      if (String(err.message || "").toLowerCase().includes("unauthorized")) {
        await lockScanner();
        return;
      }
      showResult({result:"invalid",message:err.message});
    }
  }

  async function startScanner() {
    if (!scannerPassword) return;
    locked = false;
    result.className = "scan-result idle";
    document.getElementById("resultSymbol").textContent = "⌁";
    document.getElementById("resultLabel").textContent = "READY TO SCAN";
    document.getElementById("resultName").textContent = "PU Fest 2026";
    document.getElementById("resultDetails").textContent = "Waiting for a ticket.";
    document.getElementById("resultTicket").textContent = "";
    document.getElementById("resultBundle").innerHTML = "";
    scanNext.style.display = "none";

    if (!scanner) scanner = new Html5Qrcode("reader");
    try {
      if (scanner.getState && scanner.getState() === 3) {
        await scanner.resume();
        return;
      }
      if (!scanner.getState || scanner.getState() === 1) {
        await scanner.start(
          { facingMode:"environment" },
          { fps:10, qrbox:{width:250,height:250}, aspectRatio:1.0 },
          decoded => redeem(tokenFromScan(decoded), null, "qr"),
          () => {}
        );
      }
    } catch (e) {
      App.toast("Camera unavailable. Use manual ticket lookup.","error");
    }
  }

  scanNext.onclick = startScanner;

  document.getElementById("lookupBtn").onclick = async () => {
    const ticket = document.getElementById("manualTicket").value.trim().toUpperCase();
    if (!ticket) return;
    try {
      const { data, error } = await sb.functions.invoke("ticket-lookup", {
        body: { scanner_password: scannerPassword, ticket_number: ticket }
      });
      if (error) throw error;
      if (data?.auth_error) { await lockScanner(); return; }
      if (!data?.found) throw new Error(data?.message || "Ticket not found.");
      manualTicketNo = data.ticket_number;
      document.getElementById("lookupTitle").textContent = data.ticket_number;
      document.getElementById("lookupContent").innerHTML = `
        <div class="lookup-person"><strong>${App.escapeHtml(data.holder_name || data.purchaser_name)}</strong>
        <span>${App.escapeHtml([data.course,data.year_level,data.section].filter(Boolean).join(" • "))}</span></div>
        <div class="lookup-status-row">${App.badge(data.status)}${data.is_free ? `<span class="bundle-badge">FREE • BARKADA BUNDLE</span>` : ""}</div>`;
      document.getElementById("manualCheckinBtn").disabled = data.status !== "unused";
      document.getElementById("lookupDialog").showModal();
    } catch(err) {
      if (String(err.message || "").toLowerCase().includes("unauthorized")) await lockScanner();
      else App.toast(err.message,"error");
    }
  };

  document.getElementById("manualCheckinBtn").onclick = async () => {
    document.getElementById("lookupDialog").close();
    locked = false;
    await redeem(null, manualTicketNo, "manual");
  };

  if (scannerPassword) {
    try { await unlock(scannerPassword); }
    catch { await lockScanner(); }
  }
})();
