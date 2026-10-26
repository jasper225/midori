console.log("[midori] content script loaded");

let lastY = window.scrollY;
let accumulated = 0;

window.addEventListener(
  "scroll",
  () => {
    const y = window.scrollY;
    accumulated += Math.abs(y - lastY);
    lastY = y;
  },
  { passive: true }
);

// Flush every 5 seconds, only if there's something to report
setInterval(() => {
  if (accumulated < 1 || document.hidden) return;
  const px = Math.round(accumulated);
  accumulated = 0;
  chrome.runtime
    .sendMessage({ type: "scroll", px, host: location.hostname })
    .catch(() => {}); // extension reloaded or worker asleep: ignore
}, 5000);