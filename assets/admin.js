(() => {
  const { $, safeText, fmtKST, toast, openModal, wireModalBasics, copyToClipboard, groupCount, Store } = window.App;

  wireModalBasics();

  const els = {
    connDot: $("#connDot"),
    connText: $("#connText"),
    btnHelp: $("#btnHelp"),
    btnNew: $("#btnNew"),
    btnCreateDo: $("#btnCreateDo"),
    btnRefresh: $("#btnRefresh"),
    btnExport: $("#btnExport"),
    btnClearSession: $("#btnClearSession"),
    btnCopyLink: $("#btnCopyLink"),
    btnOpenCheck: $("#btnOpenCheck"),
    sessionSelect: $("#sessionSelect"),
    sessTbody: $("#sessTbody"),
    attTbody: $("#attTbody"),
    inDate: $("#inDate"),
    inTitle: $("#inTitle"),
    kpiSession: $("#kpiSession"),
    kpiTotal: $("#kpiTotal"),
    kpiLast: $("#kpiLast"),
    chartTag: $("#chartTag"),
    qrStatus: $("#qrStatus"),
    qrLink: $("#qrLink"),
    qrcode: $("#qrcode"),
    deptChart: $("#deptChart"),
  };

  let selectedSessionId = "";
  let selectedSessionRow = null;
  let attendanceRows = [];
  let qr = null;
  let chart = null;
  let pollT = null;

  function setConn(ok, msg) {
    els.connDot.classList.toggle("ok", !!ok);
    els.connText.textContent = msg;
  }

  function getCheckUrl(sessionId) {
    const base = new URL(window.location.href);
    base.pathname = base.pathname.replace(/index\.html?$/i, "qrcheck.html");
    if (base.pathname.endsWith("/")) base.pathname += "qrcheck.html";
    base.search = "";
    base.hash = "";
    base.searchParams.set("s", sessionId);
    return base.toString();
  }

  function renderQr(sessionId) {
    els.qrcode.innerHTML = "";
    qr = null;
    if (!sessionId) {
      els.qrStatus.textContent = "세션을 선택하세요";
      els.qrStatus.className = "tag warn";
      els.qrLink.textContent = "-";
      return;
    }
    const url = getCheckUrl(sessionId);
    els.qrStatus.textContent = "QR 준비 완료";
    els.qrStatus.className = "tag ok";
    els.qrLink.textContent = url;
    qr = new QRCode(els.qrcode, {
      text: url,
      width: 200,
      height: 200,
      correctLevel: QRCode.CorrectLevel.M,
      colorDark: "#111318",
      colorLight: "#ffffff",
    });
  }

  function setSelected(sessionId, sessionRow) {
    selectedSessionId = sessionId || "";
    selectedSessionRow = sessionRow || null;
    els.sessionSelect.value = selectedSessionId;
    els.kpiSession.textContent = selectedSessionRow ? `${selectedSessionRow.title}` : "-";
    renderQr(selectedSessionId);
    setupRealtimeLike();
    loadAttendance();
  }

  function renderSessionsTable(sessions) {
    if (!sessions.length) {
      els.sessTbody.innerHTML = `<tr><td colspan="3" class="hint">세션이 아직 없습니다. 먼저 생성해 주세요.</td></tr>`;
      return;
    }
    els.sessTbody.innerHTML = sessions
      .slice(0, 8)
      .map((s) => {
        const date = safeText(s.session_date ?? "-");
        const title = safeText(s.title ?? "-");
        return `
          <tr>
            <td>${date}</td>
            <td>${title}</td>
            <td>
              <button class="btn small" data-pick="${s.id}">선택</button>
            </td>
          </tr>
        `;
      })
      .join("");
    els.sessTbody.querySelectorAll("[data-pick]").forEach((b) => {
      b.addEventListener("click", async () => {
        const id = b.getAttribute("data-pick");
        const row = await fetchSession(id);
        setSelected(id, row);
        toast("세션 선택", "선택한 세션으로 출석 현황을 불러왔어요.", "ok");
      });
    });
  }

  function renderSessionSelect(sessions) {
    const opts = sessions
      .map((s) => `<option value="${s.id}">${safeText(s.session_date)} · ${safeText(s.title)}</option>`)
      .join("");
    els.sessionSelect.innerHTML = `<option value="">세션 선택…</option>${opts}`;
  }

  function renderAttendanceTable(rows) {
    if (!selectedSessionId) {
      els.attTbody.innerHTML = `<tr><td colspan="3" class="hint">세션을 선택하면 출석이 표시됩니다.</td></tr>`;
      return;
    }
    if (!rows.length) {
      els.attTbody.innerHTML = `<tr><td colspan="3" class="hint">아직 출석 데이터가 없습니다.</td></tr>`;
      return;
    }
    els.attTbody.innerHTML = rows
      .slice()
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .map((r) => {
        return `
          <tr>
            <td class="mono">${safeText(fmtKST(r.created_at))}</td>
            <td>${safeText(r.name)}</td>
            <td>${safeText(r.department)}</td>
          </tr>
        `;
      })
      .join("");
  }

  function updateKpis() {
    els.kpiTotal.textContent = String(attendanceRows.length);
    const last = attendanceRows.slice().sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
    els.kpiLast.textContent = last ? safeText(fmtKST(last.created_at)) : "-";
    els.chartTag.textContent = selectedSessionRow ? safeText(selectedSessionRow.session_date) : "-";
  }

  function updateChart() {
    const pairs = groupCount(attendanceRows, (r) => (r.department || "").trim() || "미입력");
    const labels = pairs.map(([k]) => k);
    const data = pairs.map(([, v]) => v);
    const ctx = els.deptChart.getContext("2d");
    if (chart) chart.destroy();
    chart = new Chart(ctx, {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            label: "출석 인원",
            data,
            backgroundColor: "rgba(211,47,47,.65)",
            borderColor: "rgba(211,47,47,1)",
            borderWidth: 1,
            borderRadius: 10,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { ticks: { color: "rgba(233,236,241,.85)" }, grid: { color: "rgba(255,255,255,.06)" } },
          y: { ticks: { color: "rgba(233,236,241,.85)", precision: 0 }, grid: { color: "rgba(255,255,255,.06)" } },
        },
        plugins: {
          legend: { labels: { color: "rgba(233,236,241,.85)" } },
          tooltip: { enabled: true },
        },
      },
    });
  }

  async function fetchSessions() {
    return Store.listSessions().slice(0, 50);
  }

  async function fetchSession(id) {
    return Store.getSession(id);
  }

  async function loadSessions() {
    const sessions = await fetchSessions();
    renderSessionSelect(sessions);
    renderSessionsTable(sessions);
    // auto-select most recent
    if (!selectedSessionId && sessions[0]) {
      setSelected(sessions[0].id, sessions[0]);
      els.sessionSelect.value = sessions[0].id;
    }
  }

  async function loadAttendance() {
    if (!selectedSessionId) {
      attendanceRows = [];
      renderAttendanceTable(attendanceRows);
      updateKpis();
      updateChart();
      return;
    }
    attendanceRows = Store.listEntriesBySession(selectedSessionId).slice(0, 500);
    renderAttendanceTable(attendanceRows);
    updateKpis();
    updateChart();
  }

  function setupRealtimeLike() {
    if (pollT) {
      window.clearInterval(pollT);
      pollT = null;
    }
    if (!selectedSessionId) return;

    // Cross-tab realtime-ish updates
    Store.onChange(["dogeon.attendance.entries.v1"], async () => {
      await loadAttendance();
    });

    // Same-tab / same-page: very light polling for freshness
    pollT = window.setInterval(() => {
      loadAttendance();
    }, 1500);
    toast("실시간", "출석 데이터가 자동 갱신됩니다.", "ok", 1800);
  }

  function downloadCsv(filename, rows) {
    const header = ["created_at", "name", "department"].join(",");
    const lines = rows
      .slice()
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
      .map((r) => {
        const cols = [fmtKST(r.created_at), r.name ?? "", r.department ?? ""].map((v) => {
          const s = String(v ?? "");
          const escaped = s.replace(/"/g, '""');
          return `"${escaped}"`;
        });
        return cols.join(",");
      });
    const csv = [header, ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
  }

  async function createSession(session_date, title) {
    return Store.createSession({ session_date, title });
  }

  async function deleteSession(sessionId) {
    Store.deleteSession(sessionId);
  }

  function bindUi() {
    els.btnHelp.addEventListener("click", () => openModal("mHelp"));
    els.btnNew.addEventListener("click", () => {
      // default date to today
      const today = new Date();
      const y = today.getFullYear();
      const m = String(today.getMonth() + 1).padStart(2, "0");
      const d = String(today.getDate()).padStart(2, "0");
      els.inDate.value = `${y}-${m}-${d}`;
      els.inTitle.value = "";
      openModal("mCreate");
    });
    els.btnCreateDo.addEventListener("click", async () => {
      const session_date = els.inDate.value;
      const title = els.inTitle.value.trim();
      if (!session_date) return toast("입력 필요", "날짜를 선택해주세요.", "warn");
      if (!title) return toast("입력 필요", "교육명을 입력해주세요.", "warn");
      try {
        const row = await createSession(session_date, title);
        toast("세션 생성 완료", "QR이 생성되었어요. 바로 공유하세요.", "ok");
        window.App.closeModal("mCreate");
        await loadSessions();
        setSelected(row.id, row);
      } catch (e) {
        toast("생성 실패", e.message ?? String(e), "warn");
      }
    });

    els.btnRefresh.addEventListener("click", async () => {
      try {
        await loadSessions();
        await loadAttendance();
        toast("갱신 완료", "데이터를 다시 불러왔어요.", "ok", 1800);
      } catch (e) {
        toast("갱신 실패", e.message ?? String(e), "warn");
      }
    });

    els.sessionSelect.addEventListener("change", async () => {
      const id = els.sessionSelect.value;
      if (!id) return setSelected("", null);
      const row = await fetchSession(id);
      setSelected(id, row);
    });

    els.btnCopyLink.addEventListener("click", async () => {
      if (!selectedSessionId) return toast("세션 필요", "먼저 세션을 선택하세요.", "warn");
      await copyToClipboard(getCheckUrl(selectedSessionId));
    });

    els.btnOpenCheck.addEventListener("click", () => {
      if (!selectedSessionId) return toast("세션 필요", "먼저 세션을 선택하세요.", "warn");
      window.open(getCheckUrl(selectedSessionId), "_blank", "noopener,noreferrer");
    });

    els.btnExport.addEventListener("click", () => {
      if (!selectedSessionId || !selectedSessionRow) return toast("세션 필요", "먼저 세션을 선택하세요.", "warn");
      const name = `${selectedSessionRow.session_date}_${selectedSessionRow.title}_attendance.csv`.replace(/[\\/:*?"<>|]/g, "_");
      downloadCsv(name, attendanceRows);
    });

    els.btnClearSession.addEventListener("click", async () => {
      if (!selectedSessionId || !selectedSessionRow) return toast("세션 필요", "먼저 세션을 선택하세요.", "warn");
      const ok = window.confirm(`정말 삭제할까요?\n\n세션: ${selectedSessionRow.session_date} · ${selectedSessionRow.title}\n출석 데이터도 함께 삭제됩니다.`);
      if (!ok) return;
      try {
        await deleteSession(selectedSessionId);
        toast("삭제 완료", "세션과 출석 데이터가 삭제되었습니다.", "ok");
        selectedSessionId = "";
        selectedSessionRow = null;
        attendanceRows = [];
        renderQr("");
        await loadSessions();
        await loadAttendance();
      } catch (e) {
        toast("삭제 실패", e.message ?? String(e), "warn");
      }
    });
  }

  async function init() {
    setConn(true, "로컬 저장소 모드");

    bindUi();
    try {
      await loadSessions();
      await loadAttendance();
    } catch (e) {
      toast("불러오기 실패", e.message ?? String(e), "warn");
    }
  }

  init();
})();

