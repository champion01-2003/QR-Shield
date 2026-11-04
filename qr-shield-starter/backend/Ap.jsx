
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity, AlertTriangle, ArrowDownRight, ArrowRight, ArrowUpRight,
  Bell, Check, CheckCircle2, ChevronDown, ChevronRight, CircleHelp,
  Clock3, Download, ExternalLink, FileImage, FileSearch, FileText,
  Filter, History, LayoutDashboard, Link2, LockKeyhole, LogOut, Menu,
  Moon, MoreHorizontal, Search, Settings, Shield, ShieldAlert,
  ShieldCheck, ScanLine, Server, SlidersHorizontal, Sparkles, Sun,
  Trash2, UploadCloud, UserRound, X, Zap
} from "lucide-react";
import { jsPDF } from "jspdf";
import "./style.css";

const API = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

const NAV = [
  { label: "Overview", icon: LayoutDashboard, group: "WORKSPACE" },
  { label: "QR Inspection", icon: ScanLine, group: "WORKSPACE" },
  { label: "URL Analysis", icon: Link2, group: "WORKSPACE" },
  { label: "Scan History", icon: History, group: "WORKSPACE" },
  { label: "Analytics", icon: Activity, group: "INTELLIGENCE" },
  { label: "Reports", icon: FileText, group: "INTELLIGENCE" },
  { label: "Settings", icon: Settings, group: "SYSTEM" }
];

const readStored = (key, fallback) => {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
};

const dateLabel = value => {
  if (!value) return "Just now";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? String(value)
    : date.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
};

const recordId = item => item?.id ?? item?.scan_id ?? item?.timestamp ?? "";
const recordVerdict = item =>
  String(item?.verdict ?? item?.status ?? item?.classification ?? "Unknown");
const recordScore = item => {
  const raw = Number(item?.risk_score ?? item?.risk ?? item?.score ?? 0);
  return Math.max(0, Math.min(100, raw));
};
const recordPayload = item =>
  item?.payload ?? item?.url ?? item?.decoded_data ?? item?.input ?? "No payload returned";
const recordIsDanger = item =>
  /malicious|danger|unsafe|phishing|high risk|suspicious/i.test(recordVerdict(item));
const recordIsSafe = item =>
  /safe|benign|clean|legitimate/i.test(recordVerdict(item));

function App() {
  const [page, setPage] = useState("Overview");
  const [theme, setTheme] = useState(() => localStorage.getItem("qr-shield-theme") || "dark");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [globalSearch, setGlobalSearch] = useState("");
  const [history, setHistory] = useState([]);
  const [stats, setStats] = useState({});
  const [apiStatus, setApiStatus] = useState("checking");
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState("");
  const [url, setUrl] = useState("");
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [historyQuery, setHistoryQuery] = useState("");
  const [historyFilter, setHistoryFilter] = useState("all");
  const [notifications, setNotifications] = useState(() =>
    readStored("qr-shield-notifications", [])
  );
  const [savedReports, setSavedReports] = useState(() =>
    readStored("qr-shield-reports", [])
  );
  const [profileName, setProfileName] = useState(
    () => localStorage.getItem("qr-shield-name") || "Security Analyst"
  );
  const [profileEmail, setProfileEmail] = useState(
    () => localStorage.getItem("qr-shield-email") || "analyst@local.dev"
  );
  const [noticeText, setNoticeText] = useState("");
  const [settings, setSettings] = useState(() =>
    readStored("qr-shield-settings", {
      scanNotifications: true,
      compactTables: false,
      confirmDelete: true
    })
  );
  const fileRef = useRef(null);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = "dark";
    localStorage.setItem("qr-shield-theme", theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem("qr-shield-notifications", JSON.stringify(notifications));
  }, [notifications]);

  useEffect(() => {
    localStorage.setItem("qr-shield-reports", JSON.stringify(savedReports));
  }, [savedReports]);

  useEffect(() => {
    localStorage.setItem("qr-shield-settings", JSON.stringify(settings));
  }, [settings]);

  const addNotification = useCallback((title, message, severity = "info") => {
    const item = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      title,
      message,
      severity,
      createdAt: new Date().toISOString(),
      read: false
    };
    setNotifications(previous => [item, ...previous].slice(0, 40));
  }, []);

  const loadData = useCallback(async () => {
    try {
      const [statsResponse, historyResponse] = await Promise.all([
        fetch(`${API}/api/stats`),
        fetch(`${API}/api/history?limit=100`)
      ]);

      if (!statsResponse.ok || !historyResponse.ok) {
        throw new Error("Backend request failed");
      }

      const [statsData, historyData] = await Promise.all([
        statsResponse.json(),
        historyResponse.json()
      ]);

      setStats(statsData || {});
      const rows = Array.isArray(historyData)
        ? historyData
        : historyData?.items ?? historyData?.history ?? [];
      setHistory(Array.isArray(rows) ? rows : []);
      setApiStatus("online");
    } catch {
      setApiStatus("offline");
    }
  }, []);

  useEffect(() => {
    loadData();
    const timer = window.setInterval(loadData, 20000);
    return () => window.clearInterval(timer);
  }, [loadData]);

  const unreadCount = notifications.filter(item => !item.read).length;
  const totalScans = Number(
    stats?.total_scans ?? stats?.total ?? stats?.total_inspections ?? history.length
  );
  const dangerousCount = Number(
    stats?.malicious_scans ?? stats?.unsafe_scans ??
    stats?.dangerous ?? history.filter(recordIsDanger).length
  );
  const safeCount = Number(
    stats?.safe_scans ?? stats?.benign_scans ??
    stats?.safe ?? history.filter(recordIsSafe).length
  );

  const visibleHistory = useMemo(() => {
    const query = historyQuery.trim().toLowerCase();
    return history.filter(item => {
      const text = `${recordPayload(item)} ${recordVerdict(item)} ${item?.id ?? ""}`.toLowerCase();
      const matchesText = !query || text.includes(query);
      const matchesFilter =
        historyFilter === "all" ||
        (historyFilter === "safe" && recordIsSafe(item)) ||
        (historyFilter === "danger" && recordIsDanger(item)) ||
        (historyFilter === "review" && !recordIsSafe(item) && !recordIsDanger(item));
      return matchesText && matchesFilter;
    });
  }, [history, historyQuery, historyFilter]);

  const globalMatches = useMemo(() => {
    const query = globalSearch.trim().toLowerCase();
    if (!query) return NAV.slice(0, 4);
    return NAV.filter(item => item.label.toLowerCase().includes(query));
  }, [globalSearch]);

  function navigate(destination) {
    setPage(destination);
    setSidebarOpen(false);
    setProfileOpen(false);
    setNotificationOpen(false);
    setSearchOpen(false);
    setError("");
    setNoticeText("");
  }

  function chooseFile(selected) {
    if (!selected) return;
    if (!["image/png", "image/jpeg", "image/webp", "image/bmp"].includes(selected.type)) {
      setError("Choose a PNG, JPEG, WEBP or BMP image.");
      return;
    }
    if (selected.size > 8 * 1024 * 1024) {
      setError("The image must be smaller than 8 MB.");
      return;
    }
    setFile(selected);
    setPreview(previous => {
      if (previous) URL.revokeObjectURL(previous);
      return URL.createObjectURL(selected);
    });
    setResult(null);
    setError("");
  }

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  async function inspectQR(event) {
    event?.preventDefault();
    if (!file || busy) {
      if (!file) setError("Select a QR image before starting inspection.");
      return;
    }

    setBusy(true);
    setError("");
    setResult(null);

    try {
      const body = new FormData();
      body.append("file", file);
      const response = await fetch(`${API}/api/scan`, {
        method: "POST",
        body
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.detail || data?.error || "QR inspection failed.");

      setResult(data);
      const verdict = recordVerdict(data);
      const risky = recordIsDanger(data);
      addNotification(
        risky ? "Potential threat detected" : "QR inspection completed",
        `${file.name}: ${verdict}. Risk score ${recordScore(data)}/100.`,
        risky ? "danger" : "success"
      );
      await loadData();
      setNoticeText("Inspection completed. Your report is ready to export.");
    } catch (err) {
      setError(err.message || "Unable to inspect this QR image.");
      addNotification("Inspection failed", err.message || "The backend did not complete the request.", "warning");
    } finally {
      setBusy(false);
    }
  }

  async function analyzeURL(event) {
    event?.preventDefault();
    if (!url.trim() || busy) {
      if (!url.trim()) setError("Enter a URL to analyze.");
      return;
    }

    setBusy(true);
    setError("");
    setResult(null);

    try {
      const response = await fetch(`${API}/api/analyze-url`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.detail || data?.error || "URL analysis failed.");

      setResult(data);
      const risky = recordIsDanger(data);
      addNotification(
        risky ? "URL flagged for review" : "URL analysis completed",
        `${url.trim()}: ${recordVerdict(data)}.`,
        risky ? "danger" : "success"
      );
      await loadData();
      setNoticeText("URL analysis completed. Export the report for your records.");
    } catch (err) {
      setError(err.message || "Unable to analyze this URL.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteScan(item) {
    const id = recordId(item);
    if (settings.confirmDelete && !window.confirm("Delete this scan from history?")) return;

    try {
      const response = await fetch(`${API}/api/history/${encodeURIComponent(id)}`, {
        method: "DELETE"
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data?.detail || "Could not delete this record.");
      }
      setHistory(previous => previous.filter(row => String(recordId(row)) !== String(id)));
      addNotification("History record deleted", `Scan ${id} was removed from the backend history.`, "info");
      await loadData();
    } catch (err) {
      setError(err.message || "Could not delete this record.");
    }
  }

  function exportJSON(item = result) {
    if (!item) {
      setError("There is no result to export yet.");
      return;
    }
    downloadBlob(
      JSON.stringify(item, null, 2),
      `qr-shield-result-${Date.now()}.json`,
      "application/json"
    );
  }

  function exportHistory(rows = visibleHistory) {
    downloadBlob(
      JSON.stringify(rows, null, 2),
      `qr-shield-history-${Date.now()}.json`,
      "application/json"
    );
  }

  function downloadBlob(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const objectURL = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = objectURL;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(objectURL);
  }

  function exportPDF(item = result) {
    if (!item) {
      setError("Inspect a QR image or URL before exporting a PDF report.");
      return;
    }

    const doc = new jsPDF({ unit: "mm", format: "a4" });
    const margin = 17;
    const pageWidth = doc.internal.pageSize.getWidth();
    let y = 20;
    const verdict = recordVerdict(item);
    const score = recordScore(item);
    const payload = String(recordPayload(item));

    doc.setFillColor(12, 22, 39);
    doc.rect(0, 0, pageWidth, 43, "F");
    doc.setTextColor(108, 224, 197);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("QR-SHIELD / SECURITY INTELLIGENCE", margin, 15);
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(22);
    doc.text("Inspection Report", margin, 27);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(`Generated ${new Date().toLocaleString()}`, margin, 35);

    y = 55;
    doc.setTextColor(25, 39, 58);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text("Assessment summary", margin, y);
    y += 9;

    doc.setFillColor(239, 244, 249);
    doc.roundedRect(margin, y, pageWidth - margin * 2, 25, 3, 3, "F");
    doc.setFontSize(11);
    doc.text(`Verdict: ${verdict}`, margin + 5, y + 8);
    doc.text(`Risk score: ${score}/100`, margin + 5, y + 17);
    y += 35;

    const sections = [
      ["Inspected payload", payload],
      ["Record ID", String(recordId(item) || "Not provided")],
      ["Inspection timestamp", dateLabel(item?.created_at ?? item?.timestamp ?? item?.scanned_at)],
      ["Detection indicators", (item?.reasons ?? item?.indicators ?? item?.flags ?? []).map?.(x =>
        typeof x === "string" ? x : JSON.stringify(x)
      ).join("\n") || "No detailed indicators were returned by the API."],
      ["URL features", item?.features ? JSON.stringify(item.features, null, 2) : "Not provided"],
      ["Image analysis", item?.image_analysis ? JSON.stringify(item.image_analysis, null, 2) : "Not provided"]
    ];

    sections.forEach(([heading, content]) => {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(35, 53, 74);
      doc.text(heading, margin, y);
      y += 5;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(76, 91, 109);

      const lines = doc.splitTextToSize(String(content || "Not provided"), pageWidth - margin * 2 - 4);
      for (const line of lines) {
        if (y > 270) {
          doc.addPage();
          y = 20;
        }
        doc.text(line, margin + 2, y);
        y += 4.5;
      }
      y += 5;
    });

    if (y > 250) {
      doc.addPage();
      y = 20;
    }
    doc.setDrawColor(218, 226, 235);
    doc.line(margin, y, pageWidth - margin, y);
    y += 7;
    doc.setFontSize(8);
    doc.setTextColor(105, 119, 136);
    doc.text(
      "This report reflects the current QR-Shield analysis response. It is not a guarantee that a URL or QR code is safe.",
      margin,
      y,
      { maxWidth: pageWidth - margin * 2 }
    );

    const filename = `qr-shield-report-${Date.now()}.pdf`;
    doc.save(filename);

    setSavedReports(previous => [
      {
        id: `${Date.now()}`,
        filename,
        verdict,
        score,
        payload,
        createdAt: new Date().toISOString(),
        data: item
      },
      ...previous
    ].slice(0, 50));
    addNotification("PDF report generated", filename, "success");
    setNoticeText("PDF report downloaded and added to your saved reports.");
  }

  function markAllRead() {
    setNotifications(previous => previous.map(item => ({ ...item, read: true })));
  }

  function clearNotifications() {
    setNotifications([]);
    setNotificationOpen(false);
  }

  function downloadSavedReport(report) {
    exportPDF(report.data);
  }

  function saveProfile(event) {
    event.preventDefault();
    localStorage.setItem("qr-shield-name", profileName.trim() || "Security Analyst");
    localStorage.setItem("qr-shield-email", profileEmail.trim() || "analyst@local.dev");
    setNoticeText("Profile preferences saved in this browser.");
    addNotification("Profile settings saved", "Your local profile details were updated.", "info");
  }

  const navGroups = ["WORKSPACE", "INTELLIGENCE", "SYSTEM"];

  return (
    <div className="app-shell">
      {sidebarOpen && <button className="scrim" aria-label="Close navigation" onClick={() => setSidebarOpen(false)} />}

      <aside className={`sidebar ${sidebarOpen ? "open" : ""}`}>
        <div className="brand">
          <div className="brand-icon"><ShieldCheck size={22} /></div>
          <div>
            <b>QR-SHIELD</b>
            <span>SECURITY INTELLIGENCE</span>
          </div>
          <button className="mobile-close" onClick={() => setSidebarOpen(false)} aria-label="Close menu"><X size={19} /></button>
        </div>

        <div className="workspace-switch">
          <div className="workspace-avatar"><Shield size={17} /></div>
          <div><b>Security workspace</b><span>Local environment</span></div>
          <ChevronDown size={15} />
        </div>

        {navGroups.map(group => (
          <div className="nav-group" key={group}>
            <div className="workspace-label">{group}</div>
            <nav>
              {NAV.filter(item => item.group === group).map(item => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.label}
                    className={`nav-item ${page === item.label ? "active" : ""}`}
                    onClick={() => navigate(item.label)}
                  >
                    <Icon size={17} strokeWidth={1.8} />
                    <span>{item.label}</span>
                    {item.label === "Scan History" && history.length > 0 && <span className="nav-count">{history.length}</span>}
                    {item.label === "Reports" && savedReports.length > 0 && <span className="nav-count">{savedReports.length}</span>}
                  </button>
                );
              })}
            </nav>
          </div>
        ))}

        <div className="sidebar-bottom">
          <div className="secure-card">
            <div className="secure-card-top"><LockKeyhole size={17} /><span>LOCAL PROTECTION</span></div>
            <b>{apiStatus === "online" ? "Backend connected" : apiStatus === "offline" ? "Backend unavailable" : "Checking services"}</b>
            <p>Inspection results are provided by the connected QR-Shield analysis service.</p>
            <button className="secure-link" onClick={loadData}>Check connection <ArrowRight size={13} /></button>
          </div>
          <div className="user-row">
            <div className="avatar">{profileName.slice(0, 2).toUpperCase()}</div>
            <div className="user-details"><b>{profileName}</b><span>{profileEmail}</span></div>
            <button className="icon-btn sidebar-settings" aria-label="Settings" onClick={() => navigate("Settings")}><Settings size={16} /></button>
          </div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="topbar-left">
            <button className="mobile-menu" aria-label="Open menu" onClick={() => setSidebarOpen(true)}><Menu size={20} /></button>
            <div className="breadcrumb"><span>Workspace</span><ChevronRight size={14} /><b>{page}</b></div>
          </div>
          <div className="top-actions">
            <div className={`connection ${apiStatus}`}><i />{apiStatus === "online" ? "All systems operational" : apiStatus === "offline" ? "Backend offline" : "Connecting"}</div>
            <button className="top-icon search-trigger" aria-label="Search workspace" onClick={() => setSearchOpen(value => !value)}><Search size={18} /></button>
            <div className="popup-anchor">
              <button className={`top-icon notification-trigger ${unreadCount ? "has-unread" : ""}`} aria-label="Notifications" onClick={() => { setNotificationOpen(value => !value); setProfileOpen(false); }}><Bell size={18} />{unreadCount > 0 && <i>{unreadCount > 9 ? "9+" : unreadCount}</i>}</button>
              {notificationOpen && (
                <div className="popup notification-popup">
                  <div className="popup-heading"><div><b>Notifications</b><span>{unreadCount} unread</span></div><button className="icon-btn" onClick={markAllRead} title="Mark all read"><Check size={15} /></button></div>
                  <div className="notification-list">
                    {notifications.length ? notifications.map(item => (
                      <button key={item.id} className={`notification-item ${item.read ? "read" : ""}`} onClick={() => setNotifications(previous => previous.map(n => n.id === item.id ? { ...n, read: true } : n))}>
                        <span className={`notification-dot ${item.severity}`} />
                        <span className="notification-body"><b>{item.title}</b><small>{item.message}</small><time>{dateLabel(item.createdAt)}</time></span>
                      </button>
                    )) : <div className="popup-empty"><Bell size={23} /><b>You're all caught up</b><span>Inspection events will appear here.</span></div>}
                  </div>
                  {notifications.length > 0 && <button className="popup-footer-btn" onClick={clearNotifications}>Clear notifications</button>}
                </div>
              )}
            </div>
            <div className="popup-anchor">
              <button className="profile-trigger" onClick={() => { setProfileOpen(value => !value); setNotificationOpen(false); }}><div className="top-avatar">{profileName.slice(0, 2).toUpperCase()}</div><ChevronDown size={14} /></button>
              {profileOpen && <div className="popup profile-popup"><div className="profile-popup-person"><div className="top-avatar">{profileName.slice(0, 2).toUpperCase()}</div><span><b>{profileName}</b><small>{profileEmail}</small></span></div><button onClick={() => navigate("Settings")}><Settings size={15} />Profile and preferences</button><button onClick={() => { setTheme(theme === "dark" ? "midnight" : "dark"); setProfileOpen(false); }}><Moon size={15} />Switch accent mode</button></div>}
            </div>
          </div>
        </header>

        {searchOpen && <div className="global-search-panel"><Search size={18} /><input autoFocus placeholder="Search modules..." value={globalSearch} onChange={event => setGlobalSearch(event.target.value)} onKeyDown={event => { if (event.key === "Escape") setSearchOpen(false); if (event.key === "Enter" && globalMatches[0]) navigate(globalMatches[0].label); }} /><span>ENTER</span><button className="icon-btn" onClick={() => setSearchOpen(false)}><X size={15} /></button><div className="global-search-results">{globalMatches.map(item => <button key={item.label} onClick={() => navigate(item.label)}><item.icon size={16} />{item.label}<ArrowUpRight size={14} /></button>)}</div></div>}

        <div className="page-content">
          {error && <div className="global-error"><AlertTriangle size={17} /><span>{error}</span><button onClick={() => setError("")}><X size={15} /></button></div>}
          {noticeText && <div className="global-notice"><CheckCircle2 size={17} /><span>{noticeText}</span><button onClick={() => setNoticeText("")}><X size={15} /></button></div>}

          {page === "Overview" && (
            <>
              <PageHeading eyebrow="SECURITY OPERATIONS / OVERVIEW" title="Security overview" description="Monitor QR inspections, investigate suspicious destinations, and manage reports." action={<button className="primary-btn" onClick={() => navigate("QR Inspection")}><ScanLine size={16} /> New inspection <ArrowRight size={15} /></button>} />
              <section className="hero-panel">
                <div className="hero-copy">
                  <div className="hero-chip"><span className="pulse-dot" /> SECURITY WORKSPACE <span className="chip-divider" /> LIVE STATUS</div>
                  <h2>See what's behind<br />every <em>QR code.</em></h2>
                  <p>Inspect QR payloads, review URL indicators, and keep a traceable record of each analysis from one workspace.</p>
                  <button className="hero-btn" onClick={() => navigate("QR Inspection")}>Start an inspection <ArrowRight size={15} /></button>
                  <div className="hero-foot"><span><CheckCircle2 size={14} /> Image-based inspection</span><span><Activity size={14} /> URL risk analysis</span><span><FileText size={14} /> PDF reporting</span></div>
                </div>
                <div className="hero-art" aria-hidden="true">
                  <div className="hero-grid" /><div className="orbit orbit-one" /><div className="orbit orbit-two" />
                  <div className="scan-illustration"><div className="qr-corner tl" /><div className="qr-corner tr" /><div className="qr-corner bl" /><div className="qr-graphic">{Array.from({ length: 64 }, (_, i) => <span key={i} className={(i * 7 + i % 3) % 5 < 2 ? "filled" : ""} />)}</div><div className="scan-line" /></div>
                  <div className="floating-status"><ShieldCheck size={18} /><span><b>Inspection ready</b><small>Awaiting input</small></span></div>
                  <div className="floating-coordinate">QS / 01 — ANALYSIS</div>
                </div>
              </section>

              <div className="stats-grid">
                <Stat label="Total inspections" value={totalScans} icon={ScanLine} note="Records returned by backend" />
                <Stat label="Flagged for review" value={dangerousCount} icon={ShieldAlert} note="Potentially risky results" tone="danger" />
                <Stat label="Marked safe" value={safeCount} icon={ShieldCheck} note="Classified safe by analyzer" tone="success" />
                <Stat label="Saved reports" value={savedReports.length} icon={FileText} note="PDF reports generated this session" />
              </div>

              <div className="section-heading"><div><span className="section-kicker">ACTIVITY MONITOR</span><h3>Recent inspections</h3><p>The latest records returned by your QR-Shield backend.</p></div><button className="text-btn" onClick={() => navigate("Scan History")}>View all records <ArrowRight size={14} /></button></div>
              <div className="panel table-panel"><HistoryTable rows={history.slice(0, 6)} onOpen={item => { setResult(item); navigate("QR Inspection"); }} onDelete={deleteScan} onExport={exportPDF} compact={settings.compactTables} /></div>
              <div className="system-note"><div className="system-note-icon"><Server size={17} /></div><div><b>Detection transparency</b><p>Results reflect the current backend analyzer. Treat uncertain or suspicious links cautiously; a low risk score does not guarantee safety. Trained ML models should only be represented as active after their model weights are integrated.</p></div><span className={`system-status ${apiStatus}`}>{apiStatus === "online" ? "API CONNECTED" : apiStatus === "offline" ? "API OFFLINE" : "CHECKING API"}</span></div>
            </>
          )}

          {page === "QR Inspection" && (
            <>
              <PageHeading eyebrow="WORKSPACE / IMAGE INSPECTION" title="QR inspection" description="Upload a QR image to decode its payload and review the backend risk assessment." action={<button className="outline-btn" onClick={() => { setFile(null); setPreview(""); setResult(null); setError(""); }}><X size={15} /> Clear workspace</button>} />
              <div className="scan-layout">
                <div className="panel scan-panel">
                  <div className="panel-title"><div className="title-icon"><UploadCloud size={19} /></div><div><h3>Input source</h3><p>Upload a QR code image</p></div><span className="panel-step">01 / INPUT</span></div>
                  <button className={`drop-zone ${file ? "has-file" : ""}`} onClick={() => fileRef.current?.click()} onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); chooseFile(event.dataTransfer.files?.[0]); }}>
                    {preview ? <><img src={preview} className="image-preview" alt="Selected QR code preview" /><b>{file?.name}</b><span>{(file.size / 1024).toFixed(1)} KB · Click to replace image</span></> : <><div className="upload-icon"><UploadCloud size={24} /></div><b>Drop your QR image here</b><span>or <em>browse files</em> from your device</span><small>PNG, JPEG, WEBP or BMP · Maximum 8 MB</small></>}
                  </button>
                  <input ref={fileRef} hidden type="file" accept="image/png,image/jpeg,image/webp,image/bmp" onChange={event => chooseFile(event.target.files?.[0])} />
                  <button className="primary-btn full-btn" disabled={!file || busy} onClick={inspectQR}>{busy ? <><Activity size={16} className="spin" /> Inspecting payload...</> : <><ScanLine size={16} /> Inspect QR code <ArrowRight size={15} /></>}</button>
                  <div className="input-divider"><span />OR ANALYZE A DESTINATION<span /></div>
                  <form className="url-form" onSubmit={analyzeURL}><label htmlFor="inspect-url">Destination URL</label><div className="url-input-wrap"><Link2 size={17} /><input id="inspect-url" value={url} onChange={event => setUrl(event.target.value)} placeholder="https://example.com/path" type="url" /><button disabled={!url.trim() || busy} aria-label="Analyze URL"><ArrowRight size={16} /></button></div><p>Submit a URL directly if you do not have the QR image.</p></form>
                  <div className="privacy-callout"><LockKeyhole size={16} /><div><b>Inspection workflow</b><p>Only submit links you are permitted to analyze. Review flagged URLs before opening them.</p></div></div>
                </div>

                <div className="panel result-panel">
                  <div className="panel-title"><div className="title-icon"><FileSearch size={19} /></div><div><h3>Inspection report</h3><p>Assessment returned by the connected service</p></div><span className="panel-step">02 / REPORT</span></div>
                  {result ? <ResultView result={result} onPDF={() => exportPDF(result)} onJSON={() => exportJSON(result)} /> : <div className="empty-result"><div className="empty-art"><div className="empty-ring"><ShieldCheck size={36} /></div><span className="empty-orbit orbit-a" /><span className="empty-orbit orbit-b" /></div><h3>Ready when you are</h3><p>Upload a QR code or submit a URL. Your inspection summary and downloadable report will appear here.</p><div className="result-steps"><div><span>01</span><b>Submit</b><small>Image or URL</small></div><ChevronRight size={15} /><div><span>02</span><b>Inspect</b><small>Backend analysis</small></div><ChevronRight size={15} /><div><span>03</span><b>Export</b><small>PDF report</small></div></div></div>}
                </div>
              </div>
            </>
          )}

          {page === "URL Analysis" && (
            <>
              <PageHeading eyebrow="WORKSPACE / DESTINATION INTELLIGENCE" title="URL analysis" description="Submit a destination directly and inspect the backend's available risk indicators." />
              <div className="url-analysis-layout">
                <div className="panel url-analysis-card"><div className="panel-title"><div className="title-icon"><Link2 size={19} /></div><div><h3>Analyze destination</h3><p>Enter the full URL, including its protocol</p></div></div><form onSubmit={analyzeURL} className="url-analysis-form"><label htmlFor="url-analysis-input">Target URL</label><input id="url-analysis-input" type="url" value={url} onChange={event => setUrl(event.target.value)} placeholder="https://example.com/login" required /><button className="primary-btn" disabled={busy}>{busy ? "Analyzing..." : <><Activity size={16} /> Analyze URL <ArrowRight size={15} /></>}</button></form><div className="analysis-tip"><AlertTriangle size={17} /><p>Do not open suspicious URLs to test them. This form sends the URL to your configured backend for analysis.</p></div></div>
                <div className="panel result-panel"><div className="panel-title"><div className="title-icon"><FileSearch size={19} /></div><div><h3>Latest assessment</h3><p>Current analysis response</p></div></div>{result ? <ResultView result={result} onPDF={() => exportPDF(result)} onJSON={() => exportJSON(result)} /> : <div className="empty-result compact-empty"><div className="empty-art"><div className="empty-ring"><Link2 size={32} /></div></div><h3>No assessment yet</h3><p>Submit a destination to display the response here.</p></div>}</div>
              </div>
            </>
          )}

          {page === "Scan History" && (
            <>
              <PageHeading eyebrow="INTELLIGENCE / RECORDS" title="Scan history" description="Search, filter, export, and review saved backend inspection records." action={<button className="outline-btn" onClick={() => exportHistory(visibleHistory)}><Download size={15} /> Export JSON</button>} />
              <div className="panel history-panel">
                <div className="history-toolbar"><div className="searchbox"><Search size={16} /><input value={historyQuery} onChange={event => setHistoryQuery(event.target.value)} placeholder="Search payload, verdict or ID..." /></div><div className="filter-select"><Filter size={15} /><select value={historyFilter} onChange={event => setHistoryFilter(event.target.value)}><option value="all">All results</option><option value="safe">Safe</option><option value="danger">Flagged</option><option value="review">Needs review</option></select></div><button className="outline-btn" onClick={loadData}><Activity size={15} /> Refresh</button></div>
                <HistoryTable rows={visibleHistory} onOpen={item => { setResult(item); navigate("QR Inspection"); }} onDelete={deleteScan} onExport={exportPDF} compact={settings.compactTables} />
                <div className="table-footer"><span>Showing {visibleHistory.length} of {history.length} records</span><span>Source: QR-Shield backend API</span></div>
              </div>
            </>
          )}

          {page === "Analytics" && (
            <>
              <PageHeading eyebrow="INTELLIGENCE / TRENDS" title="Analytics" description="A transparent summary of the inspection records currently available." action={<button className="outline-btn" onClick={loadData}><Activity size={15} /> Refresh data</button>} />
              <div className="stats-grid analytics-stats"><Stat label="Total records" value={totalScans} icon={ScanLine} note="Backend-reported total" /><Stat label="Safe classifications" value={safeCount} icon={ShieldCheck} note="Returned as safe or benign" tone="success" /><Stat label="Flagged classifications" value={dangerousCount} icon={ShieldAlert} note="Returned as risky" tone="danger" /><Stat label="Requires review" value={Math.max(0, history.length - history.filter(item => recordIsSafe(item) || recordIsDanger(item)).length)} icon={AlertTriangle} note="Unclassified or ambiguous results" /></div>
              <div className="analytics-grid"><div className="panel analytics-panel"><div className="section-heading"><div><span className="section-kicker">VERDICT DISTRIBUTION</span><h3>Classification overview</h3></div></div><div className="bar-list">{[{label:"Safe / benign",value:safeCount,tone:"success"},{label:"Flagged / risky",value:dangerousCount,tone:"danger"},{label:"Needs review",value:Math.max(0,history.length-safeCount-dangerousCount),tone:"warning"}].map(item => <div className="bar-row" key={item.label}><div><span>{item.label}</span><b>{item.value}</b></div><div className="bar-track"><i className={item.tone} style={{width:`${Math.min(100, (item.value / Math.max(1, history.length))*100)}%`}} /></div></div>)}</div><p className="analytics-footnote">Distribution is calculated from records returned by the backend and is not an independent threat-intelligence feed.</p></div><div className="panel analytics-panel"><div className="section-heading"><div><span className="section-kicker">WORKSPACE STATUS</span><h3>Service health</h3></div></div><div className="health-list"><div><span className={`health-indicator ${apiStatus}`} /><span><b>Analysis API</b><small>{apiStatus === "online" ? "Responding to requests" : apiStatus === "offline" ? "Unable to reach backend" : "Checking connection"}</small></span><strong>{apiStatus.toUpperCase()}</strong></div><div><span className="health-indicator local" /><span><b>Report generation</b><small>Browser-side PDF export</small></span><strong>LOCAL</strong></div><div><span className="health-indicator local" /><span><b>Notifications</b><small>Stored in this browser</small></span><strong>LOCAL</strong></div></div></div></div>
            </>
          )}

          {page === "Reports" && (
            <>
              <PageHeading eyebrow="INTELLIGENCE / DOCUMENTS" title="Saved reports" description="Access PDF reports generated after an inspection in this browser." action={<button className="outline-btn" onClick={() => navigate("QR Inspection")}><ScanLine size={15} /> New inspection</button>} />
              <div className="report-grid">{savedReports.length ? savedReports.map(report => <div className="panel saved-report-card" key={report.id}><div className="saved-report-icon"><FileText size={22} /></div><div className="saved-report-info"><b>{report.filename}</b><span>{dateLabel(report.createdAt)}</span><p>{report.verdict} · Risk score {report.score}/100</p><small title={report.payload}>{report.payload}</small></div><div className="saved-report-actions"><button className="icon-btn" title="Download report again" onClick={() => downloadSavedReport(report)}><Download size={15} /></button><button className="icon-btn delete-btn" title="Remove saved report" onClick={() => setSavedReports(previous => previous.filter(item => item.id !== report.id))}><Trash2 size={15} /></button></div></div>) : <div className="panel reports-empty"><div className="empty-ring"><FileText size={30} /></div><h3>No saved reports</h3><p>Complete a QR inspection or URL analysis, then export its PDF report. Generated reports will be listed here.</p><button className="primary-btn" onClick={() => navigate("QR Inspection")}><ScanLine size={15} /> Start inspection</button></div>}</div>
            </>
          )}

          {page === "Settings" && (
            <>
              <PageHeading eyebrow="SYSTEM / PREFERENCES" title="Workspace settings" description="Manage local profile details, display preferences, and notification behavior." />
              <div className="settings-grid">
                <form className="panel settings-card" onSubmit={saveProfile}><div className="panel-title"><div className="title-icon"><UserRound size={19} /></div><div><h3>Profile details</h3><p>Stored locally in this browser</p></div></div><label htmlFor="profile-name">Display name</label><input id="profile-name" value={profileName} onChange={event => setProfileName(event.target.value)} /><label htmlFor="profile-email">Email label</label><input id="profile-email" type="email" value={profileEmail} onChange={event => setProfileEmail(event.target.value)} /><button className="primary-btn"><Check size={15} /> Save profile</button><p className="settings-footnote">This does not create an account or authenticate you with a server.</p></form>
                <div className="panel settings-card"><div className="panel-title"><div className="title-icon"><SlidersHorizontal size={19} /></div><div><h3>Workspace preferences</h3><p>Personalize this local dashboard</p></div></div><label>Interface theme</label><div className="theme-options"><button className={theme === "dark" ? "selected" : ""} onClick={() => setTheme("dark")}><Moon size={16} /> Midnight</button><button className={theme === "midnight" ? "selected" : ""} onClick={() => setTheme("midnight")}><Sun size={16} /> Deep blue</button></div>{[{key:"scanNotifications",title:"Inspection notifications",desc:"Create a notification when an inspection finishes."},{key:"compactTables",title:"Compact tables",desc:"Reduce row spacing in history and overview."},{key:"confirmDelete",title:"Confirm record deletion",desc:"Ask before deleting a backend history record."}].map(item => <label className="setting-toggle" key={item.key}><span><b>{item.title}</b><small>{item.desc}</small></span><input type="checkbox" checked={settings[item.key]} onChange={event => setSettings(previous => ({...previous,[item.key]:event.target.checked}))} /></label>)}<button className="outline-btn" onClick={() => { setNotifications([]); setSavedReports([]); setNoticeText("Local notifications and saved report references cleared."); }}>Clear local notifications and report list</button></div>
                <div className="panel settings-card settings-wide"><div className="panel-title"><div className="title-icon"><Server size={19} /></div><div><h3>Connected service</h3><p>API endpoint and connection check</p></div></div><div className="endpoint-row"><span>Configured API</span><code>{API}</code></div><div className="endpoint-row"><span>Connection status</span><strong className={`system-status ${apiStatus}`}>{apiStatus.toUpperCase()}</strong></div><button className="outline-btn" onClick={loadData}><Activity size={15} /> Check service connection</button></div>
              </div>
            </>
          )}

          <footer className="footer"><span>QR-SHIELD <b>•</b> SECURITY INTELLIGENCE WORKSPACE</span><span><span className={`footer-dot ${apiStatus}`} /> Local environment <b>•</b> © {new Date().getFullYear()}</span></footer>
        </div>
      </main>
    </div>
  );
}

function PageHeading({ eyebrow, title, description, action }) {
  return <div className="page-heading"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{description}</p></div>{action && <div className="heading-action">{action}</div>}</div>;
}

function Stat({ label, value, icon: Icon, note, tone = "blue" }) {
  return <div className="stat-card"><div className="stat-top"><span>{label}</span><div className={`stat-icon ${tone}`}><Icon size={18} /></div></div><strong>{value}</strong><small>{note}</small></div>;
}

function ResultView({ result, onPDF, onJSON }) {
  const verdict = recordVerdict(result);
  const safe = recordIsSafe(result);
  const danger = recordIsDanger(result);
  const tone = danger ? "danger" : safe ? "success" : "warning";
  const reasons = result?.reasons ?? result?.indicators ?? result?.flags ?? [];
  const reasonList = Array.isArray(reasons) ? reasons : [String(reasons)];
  const features = result?.features && typeof result.features === "object" ? Object.entries(result.features).slice(0, 12) : [];

  return <div className="report-content">
    <div className={`verdict-card ${tone}`}><div className="verdict-symbol">{danger ? <ShieldAlert size={24} /> : safe ? <ShieldCheck size={24} /> : <AlertTriangle size={24} />}</div><div className="verdict-copy"><span>ASSESSMENT VERDICT</span><h2>{verdict}</h2><p>{danger ? "This result was flagged by the current analyzer. Avoid opening the destination until verified." : safe ? "The current analyzer classified this result as safe. Continue to use normal caution." : "The analyzer did not return a definitive classification. Review the indicators before proceeding."}</p></div><div className="risk-number"><strong>{recordScore(result)}</strong><span>RISK / 100</span></div></div>
    <div className="report-section"><div className="section-title"><h4>Decoded payload</h4><span className="mini-tag">OUTPUT</span></div><div className="payload-box">{String(recordPayload(result))}</div></div>
    <div className="report-section"><div className="section-title"><h4>Detection indicators</h4><span className="indicator-count">{reasonList.length} ITEMS</span></div>{reasonList.length ? <div className="reason-list">{reasonList.map((reason, index) => <div className="reason-item" key={index}><span className={`reason-dot ${tone}`} /><p>{typeof reason === "string" ? reason : JSON.stringify(reason)}</p></div>)}</div> : <div className="payload-box">No detailed indicators were returned by the backend.</div>}</div>
    {features.length > 0 && <div className="report-section"><div className="section-title"><h4>URL feature summary</h4><span className="mini-tag">BACKEND DATA</span></div><div className="feature-grid">{features.map(([key, value]) => <div className="feature" key={key}><span>{key.replaceAll("_", " ")}</span><b>{typeof value === "object" ? JSON.stringify(value) : String(value)}</b></div>)}</div></div>}
    {result?.image_analysis && <div className="image-note"><FileImage size={18} /><div><b>Image analysis data</b><p>{JSON.stringify(result.image_analysis)}</p></div></div>}
    <div className="report-warning"><AlertTriangle size={16} /><p>This result reflects the current backend response, not a guarantee of safety. Verify suspicious destinations independently.</p></div>
    <div className="report-meta"><span><Clock3 size={13} /> {dateLabel(result?.created_at ?? result?.timestamp ?? result?.scanned_at)}</span><span>Record ID: {String(recordId(result) || "N/A")}</span></div>
    <div className="report-actions"><button className="primary-btn" onClick={onPDF}><Download size={15} /> Download PDF report</button><button className="outline-btn" onClick={onJSON}><Download size={15} /> Export JSON</button></div>
  </div>;
}

function HistoryTable({ rows, onOpen, onDelete, onExport, compact }) {
  if (!rows.length) return <div className="table-empty"><div><FileSearch size={22} /></div><b>No inspection records found</b><span>Records will appear here after a scan completes.</span></div>;

  return <div className={`table-wrap ${compact ? "compact-table" : ""}`}><table><thead><tr><th>INSPECTION</th><th>VERDICT</th><th>RISK SCORE</th><th>DATE</th><th className="align-right">ACTIONS</th></tr></thead><tbody>{rows.map((item, index) => {
    const danger = recordIsDanger(item);
    const safe = recordIsSafe(item);
    const tone = danger ? "danger" : safe ? "success" : "warning";
    return <tr key={String(recordId(item) || index)}><td><button className="record-link" onClick={() => onOpen(item)}><span className="record-icon"><ScanLine size={16} /></span><span><b>{String(recordPayload(item))}</b><small>Record #{String(recordId(item) || index + 1)}</small></span></button></td><td><span className={`status-pill ${tone}`}><i />{recordVerdict(item)}</span></td><td><div className="score-cell"><b>{recordScore(item)}</b><div className="score-track"><i className={tone} style={{width:`${recordScore(item)}%`}} /></div></div></td><td><span className="date-cell">{dateLabel(item?.created_at ?? item?.timestamp ?? item?.scanned_at)}</span></td><td><div className="row-actions"><button className="icon-btn" title="Open result" onClick={() => onOpen(item)}><ExternalLink size={14} /></button><button className="icon-btn" title="Export PDF" onClick={() => onExport(item)}><Download size={14} /></button><button className="icon-btn delete-btn" title="Delete record" onClick={() => onDelete(item)}><Trash2 size={14} /></button></div></td></tr>;
  })}</tbody></table></div>;
}

export default App;
