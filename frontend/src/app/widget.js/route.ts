// The website chat loader: <script src="https://<chatdesk>/widget.js" data-agent="pk_..." async></script>
// It only places an iframe (the chat itself lives at /ai-chat/<key>), so the host page's CSS and
// scripts can't break the chat and the chat can't touch the host page.

const LOADER = `(function () {
  if (window.__chatdeskAi) return;
  var script = document.currentScript || document.querySelector("script[data-agent]");
  var key = script && script.getAttribute("data-agent");
  if (!key) return;
  window.__chatdeskAi = true;
  var base = new URL(script.src, location.href).origin;
  var frame = document.createElement("iframe");
  var state = { open: false, position: "right", launcher: 64 };
  frame.title = "Chat";
  frame.allow = "clipboard-write";
  frame.setAttribute("aria-label", "Chat with us");
  frame.src = base + "/ai-chat/" + encodeURIComponent(key) + "?embed=1&host=" + encodeURIComponent(location.host) +
    "&page=" + encodeURIComponent(location.href.slice(0, 480));
  var s = frame.style;
  s.position = "fixed"; s.bottom = "0"; s.border = "0"; s.zIndex = "2147483000"; s.background = "transparent";
  s.colorScheme = "normal"; s.maxWidth = "100vw"; s.maxHeight = "100dvh"; s.width = "0"; s.height = "0";
  function layout() {
    var small = window.innerWidth < 480;
    s.left = state.position === "left" ? "0" : "auto";
    s.right = state.position === "left" ? "auto" : "0";
    if (state.open) {
      s.width = small ? "100vw" : "420px";
      s.height = small ? "100dvh" : Math.min(720, window.innerHeight) + "px";
    } else {
      s.width = state.launcher + 40 + "px";
      s.height = "112px";
    }
    send("layout", { full: small });
  }
  window.addEventListener("message", function (e) {
    if (e.origin !== base || !e.data || e.data.source !== "chatdesk-ai") return;
    if (e.data.type === "hide") { s.display = "none"; return; }
    s.display = "block";
    state.open = !!e.data.open;
    if (e.data.position) state.position = e.data.position;
    if (e.data.launcher) state.launcher = e.data.launcher;
    layout();
  });
  window.addEventListener("resize", layout);
  function send(type, extra) {
    var msg = { source: "chatdesk-host", type: type };
    for (var k in extra || {}) msg[k] = extra[k];
    frame.contentWindow && frame.contentWindow.postMessage(msg, base);
  }
  window.ChatDeskAI = { open: function () { send("open"); }, close: function () { send("close"); } };
  (document.body || document.documentElement).appendChild(frame);
})();
`;

export function GET() {
  return new Response(LOADER, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=600, stale-while-revalidate=86400",
      "Access-Control-Allow-Origin": "*",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
