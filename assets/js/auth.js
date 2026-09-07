window.Auth = (() => {
  async function session() {
    const { data, error } = await sb.auth.getSession();
    if (error) throw error;
    return data.session;
  }

  async function profile() {
    const s = await session();
    if (!s) return null;
    const { data, error } = await sb
      .from("profiles")
      .select("id,full_name,role,active,email")
      .eq("id", s.user.id)
      .single();
    if (error) throw error;
    return data;
  }

  async function requireRole(allowed) {
    const s = await session();
    if (!s) {
      location.href = "index.html";
      throw new Error("Not signed in");
    }
    const p = await profile();
    if (!p?.active || !allowed.includes(p.role)) {
      await sb.auth.signOut();
      location.href = "index.html?denied=1";
      throw new Error("Account not authorized");
    }
    return { session: s, profile: p };
  }

  async function login(email, password) {
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) throw error;
    const p = await profile();
    if (!p?.active) {
      await sb.auth.signOut();
      throw new Error("This staff account is inactive.");
    }
    routeByRole(p.role);
  }

  function routeByRole(role) {
    if (role === "finance") location.href = "finance.html";
    else if (role === "scanner") location.href = "scanner.html";
    else if (["admin", "event_admin", "viewer"].includes(role)) location.href = "admin.html";
    else location.href = "index.html";
  }

  async function logout() {
    await sb.auth.signOut();
    location.href = "index.html";
  }

  return { session, profile, requireRole, login, logout, routeByRole };
})();
