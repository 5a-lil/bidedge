// ChromeWindow — port React/TS de browser-window.jsx.
// Fenêtre de navigateur Chrome/macOS sombre : traffic lights, barre d'onglets,
// barre d'URL, zone de contenu blanche. Mockup — styles inline assumés.
import type { CSSProperties, ReactNode } from "react";

const CHROME_C = {
  barBg: "#202124",
  tabBg: "#35363a",
  text: "#e8eaed",
  dim: "#9aa0a6",
  urlBg: "#282a2d",
};

type Tab = { title: string };

function ChromeTrafficLights() {
  return (
    <div style={{ display: "flex", gap: 8, padding: "0 14px" }}>
      <div style={{ width: 12, height: 12, borderRadius: "50%", background: "#ff5f57" }} />
      <div style={{ width: 12, height: 12, borderRadius: "50%", background: "#febc2e" }} />
      <div style={{ width: 12, height: 12, borderRadius: "50%", background: "#28c840" }} />
    </div>
  );
}

// Onglet unique (l'onglet actif a des courbes de raccord)
function ChromeTab({ title = "New Tab", active = false }: { title?: string; active?: boolean }) {
  const curve = (flip: boolean) => (
    <svg
      width="8"
      height="10"
      viewBox="0 0 8 10"
      style={{
        position: "absolute",
        bottom: 0,
        transform: flip ? "scaleX(-1)" : "none",
        ...(flip ? { right: -8 } : { left: -8 }),
      }}
    >
      <path d="M0 10C2 9 6 8 8 0V10H0Z" fill={CHROME_C.tabBg} />
    </svg>
  );
  return (
    <div
      style={{
        position: "relative",
        height: 34,
        alignSelf: "flex-end",
        padding: "0 12px",
        display: "flex",
        alignItems: "center",
        gap: 8,
        background: active ? CHROME_C.tabBg : "transparent",
        borderRadius: "8px 8px 0 0",
        minWidth: 120,
        maxWidth: 220,
        fontFamily: "system-ui, sans-serif",
        fontSize: 12,
        color: active ? CHROME_C.text : CHROME_C.dim,
      }}
    >
      {active && curve(false)}
      {active && curve(true)}
      <div style={{ width: 14, height: 14, borderRadius: "50%", background: "#5f6368", flexShrink: 0 }} />
      <span style={{ flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{title}</span>
    </div>
  );
}

function ChromeTabBar({ tabs, activeIndex }: { tabs: Tab[]; activeIndex: number }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        height: 44,
        background: CHROME_C.barBg,
        paddingRight: 8,
      }}
    >
      <ChromeTrafficLights />
      <div style={{ display: "flex", alignItems: "flex-end", height: "100%", paddingLeft: 4, flex: 1 }}>
        {tabs.map((t, i) => (
          <ChromeTab key={i} title={t.title} active={i === activeIndex} />
        ))}
      </div>
    </div>
  );
}

function ChromeToolbar({ url }: { url: string }) {
  const iconDot = (
    <div style={{ width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ width: 16, height: 16, borderRadius: "50%", background: CHROME_C.dim, opacity: 0.4 }} />
    </div>
  );
  return (
    <div
      style={{
        height: 40,
        background: CHROME_C.tabBg,
        display: "flex",
        alignItems: "center",
        gap: 4,
        padding: "0 8px",
      }}
    >
      {iconDot}
      {/* barre d'URL */}
      <div
        style={{
          flex: 1,
          height: 30,
          borderRadius: 15,
          background: CHROME_C.urlBg,
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "0 14px",
          margin: "0 6px",
        }}
      >
        <div style={{ width: 12, height: 12, borderRadius: "50%", background: CHROME_C.dim, opacity: 0.4 }} />
        <span style={{ flex: 1, color: CHROME_C.text, fontSize: 13, fontFamily: "system-ui, sans-serif" }}>
          {url}
        </span>
      </div>
      {iconDot}
    </div>
  );
}

export type ChromeWindowProps = {
  url?: string;
  width?: number | string;
  height?: number | string;
  tabs?: Tab[];
  activeIndex?: number;
  children?: ReactNode;
};

export default function ChromeWindow({
  url = "example.com",
  width = 900,
  height = 600,
  tabs = [{ title: "BidEdge · Radar" }],
  activeIndex = 0,
  children,
}: ChromeWindowProps) {
  const shell: CSSProperties = {
    width,
    height,
    borderRadius: 10,
    overflow: "hidden",
    boxShadow: "0 24px 80px rgba(0,0,0,0.35), 0 0 0 1px rgba(0,0,0,0.1)",
    display: "flex",
    flexDirection: "column",
    background: CHROME_C.tabBg,
  };
  return (
    <div style={shell}>
      <ChromeTabBar tabs={tabs} activeIndex={activeIndex} />
      <ChromeToolbar url={url} />
      <div style={{ flex: 1, background: "#fff", overflow: "auto" }}>{children}</div>
    </div>
  );
}
