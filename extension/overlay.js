(() => {
  if (window !== window.top) return; // never show inside iframes

  let showing = false;

  const MODES = {
    nudge: { title: "Time for a pause", wait: 10, stay: "Continue anyway" },
    block: { title: "Done for today", wait: 30, stay: "Give me 10 more minutes" },
  }

  async function check() {
    if (showing || document.hidden) return;
    let status;
    try {
      status = await chrome.runtime.sendMessage({ type: "status", host: location.hostname });
    } catch {
      return; // worker asleep or extension reloaded
    }
    if (!status?.tracked) return;
    if (status.block) show(status, "block");
    else if (status.nudge) show (status, "nudge")
  }

  function show(status, mode) {
    showing = true;
    const cfg = MODES[mode];
    if (mode === "nudge") {
    chrome.runtime
      .sendMessage({ type: "nudged", host: location.hostname, bucket: status.bucket })
      .catch(() => {});
    }

    const host = document.createElement("div");
    host.style.cssText = "all:initial;position:fixed;inset:0;z-index:2147483647;";
    const root = host.attachShadow({ mode: "open" }); // isolates our CSS from the site's

    root.innerHTML = `
      <style>
        .wrap { position:fixed; inset:0; display:flex; align-items:center; justify-content:center;
                background:rgba(15,23,20,.94); font-family:system-ui,sans-serif; color:#eaf3ee; }
        .card { text-align:center; max-width:360px; padding:32px; }
        h1 { font-size:22px; margin:0 0 8px; font-weight:600; }
        p { margin:0 0 24px; color:#a9bfb3; line-height:1.5; }
        .circle { width:110px; height:110px; margin:0 auto 12px; border-radius:50%;
                  background:#4caf7d; opacity:.85; animation:breathe 8s ease-in-out infinite; }
        .label { height:24px; margin-bottom:24px; color:#a9bfb3; }
        .row { display:flex; gap:12px; justify-content:center; }
        button { font:inherit; padding:10px 18px; border-radius:8px; border:1px solid #4caf7d;
                 cursor:pointer; }
        #leave { background:#4caf7d; color:#0f1714; }
        #stay { background:transparent; color:#eaf3ee; }
        #stay:disabled { opacity:.4; cursor:not-allowed; }
        @keyframes breathe { 0%,100% { transform:scale(.7) } 50% { transform:scale(1.25) } }
      </style>
      <div class="wrap"><div class="card">
        <h1>Time for a pause</h1>
        <p id="msg"></p>
        <div class="circle"></div>
        <div class="label" id="label">Breathe in…</div>
        <div class="row">
          <button id="leave">Leave</button>
          <button id="stay" disabled></button>
        </div>
      </div></div>`;

      root.getElementById("title").textContent =
      root.getElementById("msg").textContent =
      `You've spent about ${status.minutes} minutes on ${status.domain} today. ` +
      `Your daily limit is ${status.limitMin} minutes.`;

    // Freeze the page underneath
    const prevOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    const stop = (e) => e.preventDefault();
    host.addEventListener("wheel", stop, { passive: false });
    host.addEventListener("touchmove", stop, { passive: false });

    // Breathing label, switches with the 4s half-cycles of the animation
    let inhale = true;
    const label = root.getElementById("label");
    const breathTimer = setInterval(() => {
      inhale = !inhale;
      label.textContent = inhale ? "Breathe in…" : "Breathe out…";
    }, 4000);

    // 10-second friction before "Continue anyway" unlocks
    const stay = root.getElementById("stay");
    let left = 10;
    stay.textContent = `Continue anyway (${left})`;
    const countdown = setInterval(() => {
      left--;
      if (left > 0) {
        stay.textContent = `Continue anyway (${left})`;
      } else {
        clearInterval(countdown);
        stay.textContent = "Continue anyway";
        stay.disabled = false;
      }
    }, 1000);

    const close = () => {
      clearInterval(breathTimer);
      clearInterval(countdown);
      document.documentElement.style.overflow = prevOverflow;
      host.remove();
      showing = false;
    };

    stay.addEventListener("click", close);
    root.getElementById("leave").addEventListener("click", () => {
      chrome.runtime.sendMessage({ type: "leave" }).catch(() => {});
      close();
    });

    document.documentElement.appendChild(host);
  }

  setInterval(check, 15000);
  setTimeout(check, 2000);
})();