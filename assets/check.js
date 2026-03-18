(() => {
  const { $, toast, openModal, wireModalBasics, safeText, Store } = window.App;
  wireModalBasics();

  const els = {
    sessText: $("#sessText"),
    sessTag: $("#sessTag"),
    sid: $("#sid"),
    stitle: $("#stitle"),
    sdate: $("#sdate"),
    pill: $("#sessPill"),
    title: $("#title"),
    subtitle: $("#subtitle"),
    name: $("#name"),
    dept: $("#dept"),
    btnCheck: $("#btnCheck"),
    btnWhat: $("#btnWhat"),
  };

  let sessionId = "";
  let sessionRow = null;

  function setSessionUi(ok, text) {
    els.sessText.textContent = text;
    const dot = els.pill.querySelector(".dot");
    dot.classList.toggle("ok", !!ok);
    dot.style.background = ok ? "var(--ok)" : "var(--bad)";
  }

  function parseSessionId() {
    const url = new URL(window.location.href);
    return (url.searchParams.get("s") || "").trim();
  }

  async function fetchSession(id) {
    return Store.getSession(id);
  }

  function renderSession(row) {
    sessionRow = row;
    els.sid.textContent = row ? row.id : "-";
    els.stitle.textContent = row ? safeText(row.title) : "-";
    els.sdate.textContent = row ? safeText(row.session_date) : "-";
    els.sessTag.textContent = row ? "유효" : "오류";
    els.sessTag.className = row ? "tag ok" : "tag bad";

    if (row) {
      els.title.textContent = `${row.title}`;
      els.subtitle.textContent = `${row.session_date} · 이름/부서 입력 후 출석 확인을 눌러주세요.`;
    } else {
      els.title.textContent = "세션을 찾을 수 없습니다";
      els.subtitle.textContent = "QR이 만료되었거나 잘못된 링크일 수 있어요.";
    }
  }

  async function submitAttendance() {
    const name = els.name.value.trim();
    const department = els.dept.value.trim();
    if (!sessionId || !sessionRow) return toast("세션 오류", "유효한 QR로 다시 접속해주세요.", "warn");
    if (!name) return toast("입력 필요", "이름을 입력해주세요.", "warn");
    if (!department) return toast("입력 필요", "부서를 입력해주세요.", "warn");

    els.btnCheck.disabled = true;
    els.btnCheck.textContent = "처리중…";
    try {
      Store.insertEntry({ session_id: sessionId, name, department });
      toast("출석 완료", "출석이 정상 처리되었습니다.", "ok", 5200);
      els.btnCheck.textContent = "출석 완료";
      els.btnCheck.classList.add("primary");
      els.btnCheck.disabled = true;
      els.name.disabled = true;
      els.dept.disabled = true;
    } catch (e) {
      if ((e.code || "").toString() === "DUPLICATE" || (e.message || "") === "DUPLICATE") {
        toast("이미 출석 처리됨", "동일 정보로 이미 출석 처리되어 있습니다.", "warn", 5200);
      } else {
        toast("출석 실패", e.message ?? String(e), "warn", 6000);
      }
    } finally {
      if (!els.name.disabled) {
        els.btnCheck.disabled = false;
        els.btnCheck.textContent = "출석 확인";
      }
    }
  }

  async function init() {
    els.btnWhat.addEventListener("click", () => openModal("mWhat"));
    els.btnCheck.addEventListener("click", submitAttendance);
    els.dept.addEventListener("keydown", (e) => {
      if (e.key === "Enter") submitAttendance();
    });
    els.name.addEventListener("keydown", (e) => {
      if (e.key === "Enter") els.dept.focus();
    });

    sessionId = parseSessionId();
    if (!sessionId) {
      setSessionUi(false, "세션 파라미터 없음");
      toast("QR 오류", "세션 정보가 없습니다. QR로 다시 접속해주세요.", "warn", 6500);
      renderSession(null);
      return;
    }

    try {
      const row = await fetchSession(sessionId);
      if (!row) {
        setSessionUi(false, "세션 없음");
        renderSession(null);
        return;
      }
      setSessionUi(true, "세션 확인됨 (로컬)");
      renderSession(row);
    } catch (e) {
      setSessionUi(false, "세션 조회 실패");
      toast("세션 조회 실패", e.message ?? String(e), "warn", 6500);
      renderSession(null);
    }
  }

  init();
})();

