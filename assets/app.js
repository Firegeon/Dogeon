// Shared tiny helpers (no framework)
window.App = (() => {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const STORAGE_KEYS = {
    sessions: "dogeon.attendance.sessions.v1",
    entries: "dogeon.attendance.entries.v1",
  };

  function fmtKST(isoOrDate) {
    const d = isoOrDate instanceof Date ? isoOrDate : new Date(isoOrDate);
    if (Number.isNaN(d.getTime())) return "-";
    // Display in local time (Windows set to KST in many orgs). Keep simple.
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `${y}-${m}-${day} ${hh}:${mm}`;
  }

  function toast(title, msg, tone = "red", timeoutMs = 3200) {
    const el = $("#toast");
    if (!el) return;
    $(".title", el).textContent = title;
    $(".msg", el).textContent = msg ?? "";
    const dot = $(".tone", el);
    dot.style.background = tone === "ok" ? "var(--ok)" : tone === "warn" ? "var(--warn)" : "var(--red)";
    el.classList.add("show");
    window.clearTimeout(el._t);
    el._t = window.setTimeout(() => el.classList.remove("show"), timeoutMs);
  }

  function openModal(id) {
    const m = document.getElementById(id);
    if (!m) return;
    m.classList.add("open");
  }

  function closeModal(id) {
    const m = document.getElementById(id);
    if (!m) return;
    m.classList.remove("open");
  }

  function closeAllModals() {
    $$(".modal.open").forEach((m) => m.classList.remove("open"));
  }

  function wireModalBasics() {
    // close on background click, close buttons, Esc
    document.addEventListener("click", (e) => {
      const bg = e.target.closest?.(".modal.open");
      if (!bg) return;
      if (e.target.classList.contains("modal")) bg.classList.remove("open");
      const x = e.target.closest?.("[data-close-modal]");
      if (x) {
        const id = x.getAttribute("data-close-modal");
        if (id) closeModal(id);
        else closeAllModals();
      }
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeAllModals();
    });
  }

  async function copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      toast("복사 완료", "클립보드에 복사했어요.", "ok");
      return true;
    } catch {
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        ta.remove();
        toast("복사 완료", "클립보드에 복사했어요.", "ok");
        return true;
      } catch {
        toast("복사 실패", "브라우저 설정을 확인해주세요.", "warn");
        return false;
      }
    }
  }

  function readJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw);
      return parsed ?? fallback;
    } catch {
      return fallback;
    }
  }

  function writeJson(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function makeId(prefix = "id") {
    // good enough for local-only storage
    const r = Math.random().toString(16).slice(2);
    const t = Date.now().toString(16);
    return `${prefix}_${t}_${r}`;
  }

  function normalizeHuman(s) {
    return (s ?? "").toString().trim().replace(/\s+/g, " ");
  }

  const Store = {
    getSessions() {
      return readJson(STORAGE_KEYS.sessions, []);
    },
    saveSessions(list) {
      writeJson(STORAGE_KEYS.sessions, list);
    },
    getEntries() {
      return readJson(STORAGE_KEYS.entries, []);
    },
    saveEntries(list) {
      writeJson(STORAGE_KEYS.entries, list);
    },
    createSession({ session_date, title }) {
      const sessions = Store.getSessions();
      const row = { id: makeId("sess"), session_date, title, created_at: nowIso() };
      sessions.push(row);
      Store.saveSessions(sessions);
      // touch for cross-tab listeners
      writeJson(`${STORAGE_KEYS.sessions}.touch`, { t: Date.now() });
      return row;
    },
    deleteSession(sessionId) {
      const sessions = Store.getSessions().filter((s) => s.id !== sessionId);
      Store.saveSessions(sessions);
      const entries = Store.getEntries().filter((e) => e.session_id !== sessionId);
      Store.saveEntries(entries);
      writeJson(`${STORAGE_KEYS.sessions}.touch`, { t: Date.now() });
      writeJson(`${STORAGE_KEYS.entries}.touch`, { t: Date.now() });
    },
    getSession(sessionId) {
      return Store.getSessions().find((s) => s.id === sessionId) ?? null;
    },
    listSessions() {
      return Store.getSessions()
        .slice()
        .sort((a, b) => {
          if ((a.session_date ?? "") !== (b.session_date ?? "")) return (b.session_date ?? "").localeCompare(a.session_date ?? "");
          return new Date(b.created_at) - new Date(a.created_at);
        });
    },
    listEntriesBySession(sessionId) {
      return Store.getEntries()
        .filter((e) => e.session_id === sessionId)
        .slice()
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    },
    insertEntry({ session_id, name, department }) {
      const entries = Store.getEntries();
      const n = normalizeHuman(name);
      const d = normalizeHuman(department);
      const dup = entries.some((e) => e.session_id === session_id && normalizeHuman(e.name) === n && normalizeHuman(e.department) === d);
      if (dup) {
        const err = new Error("DUPLICATE");
        err.code = "DUPLICATE";
        throw err;
      }
      const row = { id: makeId("att"), session_id, name: n, department: d, created_at: nowIso() };
      entries.push(row);
      Store.saveEntries(entries);
      writeJson(`${STORAGE_KEYS.entries}.touch`, { t: Date.now() });
      return row;
    },
    onChange(keys, handler) {
      // Cross-tab: only fires for other documents (not same tab)
      const set = new Set(keys);
      window.addEventListener("storage", (e) => {
        if (!e.key) return;
        if ([...set].some((k) => e.key === k || e.key === `${k}.touch`)) handler(e);
      });
    },
  };

  function safeText(s) {
    return (s ?? "").toString().replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]));
  }

  function groupCount(items, keyFn) {
    const m = new Map();
    for (const it of items) {
      const k = keyFn(it) ?? "미분류";
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }

  return {
    $,
    $$,
    fmtKST,
    toast,
    openModal,
    closeModal,
    wireModalBasics,
    copyToClipboard,
    safeText,
    groupCount,
    Store,
    normalizeHuman,
  };
})();

