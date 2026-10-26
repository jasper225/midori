const server = "http://localhost:4000";
const $ = (id) => document.getElementById(id);

const pad = (n) => String(n).padStart(2, "0");
const localDate = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

async function render() {
  const { token, email } = await chrome.storage.local.get(["token", "email"]);
  $("login").hidden = !!token;
  $("main").hidden = !token;
  if (!token) return;

  $("who").textContent = email;
  try {
    const res = await fetch(`${server}/usage/today?date=${localDate()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status === 401) {
      await chrome.storage.local.remove(["token", "email"]);
      return render();
    }
    const data = await res.json();
    $("total").textContent = `Today: ${Math.round(data.totalSeconds / 60)} min tracked`;
  } catch {
    $("total").textContent = "Can't reach the server.";
  }
}

$("loginBtn").addEventListener("click", async () => {
  $("err").textContent = "";
  try {
    const res = await fetch(`${server}/auth/extension-login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: $("email").value, password: $("password").value }),
    });
    const data = await res.json();
    if (!res.ok) {
      $("err").textContent = typeof data.error === "string" ? data.error : "Check your details.";
      return;
    }
    await chrome.storage.local.set({ 
      token: data.token, 
      email: data.user.email,
      userLimitMin: data.user.dailyLimitMin, });
    chrome.runtime.sendMessage({ type: "sync" });
    render();
  } catch {
    $("err").textContent = "Can't reach the server.";
  }
});

$("logoutBtn").addEventListener("click", async () => {
  await chrome.storage.local.remove(["token", "email", "sites", "pending", "current"]);
  render();
});

render();