/* Bridge the existing Fieldtrip React interface to Streamlit's Python APIs.
   Runs inside the SAME original planner iframe; no separate live-planner tab. */
(() => {
  const previousFetch = window.fetch.bind(window);
  const pending = [];
  let active = null;
  let ready = false;
  let sequence = 0;
  const rpcSession = Date.now().toString(36) + "-" + Math.random().toString(36).slice(2);
  function send(type, values) {
    window.parent.postMessage({isStreamlitMessage: true, type, ...values}, "*");
  }
  function pump() {
    if (!ready || active || !pending.length) return;
    active = pending.shift();
    send("streamlit:setComponentValue", {
      value: {id: active.id, path: active.path, method: active.method, body: active.body},
      dataType: "json"
    });
  }
  window.addEventListener("message", (event) => {
    if (event.source !== window.parent || event.data?.type !== "streamlit:render") return;
    ready = true;
    const reply = event.data.args?.reply;
    if (active && reply?.id === active.id) {
      const request = active;
      active = null;
      request.resolve(new Response(JSON.stringify(reply.payload ?? {}), {
        status: reply.status || 200,
        headers: {"Content-Type": "application/json"}
      }));
    }
    pump();
  });
  function apiRequest(path, init = {}) {
    return new Promise((resolve) => {
      pending.push({
        id: "rpc-" + rpcSession + "-" + ++sequence,
        path, method: init?.method || "GET", body: init?.body || "",
        resolve
      });
      pump();
    });
  }
  window.fetch = (url, init) => {
    if (typeof url !== "string" || !url.startsWith("/api/")) return previousFetch(url, init);
    const parsed = new URL(url, "https://fieldtrip.invalid");
    const mode = parsed.searchParams.get("mode");
    const live = (parsed.pathname === "/api/routes" && mode === "live") ||
                 (parsed.pathname === "/api/segment" && mode === "live");
    if (live || parsed.pathname === "/api/drive" || parsed.pathname === "/api/__geocode")
      return apiRequest(parsed.pathname + parsed.search, init);
    return previousFetch(url, init);
  };
  function setMessage(message) {
    const element = document.getElementById("fieldtrip-bridge-status");
    if (element) element.textContent = message;
  }
  function selectOptions(element, entries) {
    element.replaceChildren();
    entries.forEach((place, index) => {
      const option = document.createElement("option");
      option.value = String(index);
      option.textContent = place.label;
      element.appendChild(option);
    });
    element.dataset.places = JSON.stringify(entries);
  }
  async function geo(text) {
    const response = await apiRequest("/api/__geocode?text=" + encodeURIComponent(text));
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Unable to resolve location");
    if (!payload.length) throw new Error("No matching locations found; try a different name or exact latitude,longitude.");
    return payload;
  }
  function savedNames() {
    try { return JSON.parse(localStorage.getItem("fieldtrip-journey") || "{}"); }
    catch { return {}; }
  }
  function startControls() {
    const from = document.getElementById("fieldtrip-origin");
    const to = document.getElementById("fieldtrip-destination");
    const fromSelect = document.getElementById("fieldtrip-origin-matches");
    const toSelect = document.getElementById("fieldtrip-destination-matches");
    const find = document.getElementById("fieldtrip-resolve");
    const apply = document.getElementById("fieldtrip-apply");
    if (!from || !to || !find || !apply) return;
    const saved = savedNames();
    if (saved.liveOrigin) from.value = saved.liveOrigin;
    if (saved.liveDestination) to.value = saved.liveDestination;
    find.onclick = async () => {
      find.disabled = true;
      apply.disabled = true;
      setMessage("Searching for matching starting points and destinations…");
      try {
        const a = await geo(from.value.trim());
        const b = await geo(to.value.trim());
        selectOptions(fromSelect, a);
        selectOptions(toSelect, b);
        apply.disabled = false;
        setMessage("Confirm both locations, then load this route in the planner below.");
      } catch (error) {
        setMessage(error.message);
      } finally { find.disabled = false; }
    };
    apply.onclick = () => {
      const a = JSON.parse(fromSelect.dataset.places || "[]")[Number(fromSelect.value)];
      const b = JSON.parse(toSelect.dataset.places || "[]")[Number(toSelect.value)];
      if (!a || !b) { setMessage("Resolve the two locations first."); return; }
      const old = savedNames();
      localStorage.setItem("fieldtrip-journey", JSON.stringify({
        ...old, destination: "Tirunelveli", mode: "live",
        custom: {from: a.xy.join(","), to: b.xy.join(",")},
        liveOrigin: a.label, liveDestination: b.label
      }));
      window.location.reload();
    };
    const store = savedNames();
    if (store.mode === "live" && store.liveOrigin && store.liveDestination) {
      setMessage("Live route selected: " + store.liveOrigin + " → " + store.liveDestination +
        ". Use the same planner below to search the entire corridor.");
    }
  }
  
  function mountControls() {
    if (document.getElementById("fieldtrip-origin")) return;
    const routeButton = document.querySelector(".load-route");
    if (!routeButton) return;
    const panel = document.createElement("div");
    panel.className = "fieldtrip-live-controls";
    panel.style.cssText = "padding:14px;margin:10px 0;border:1px solid #cbded5;border-radius:12px;background:#f0f7f3;color:#183d30";
    panel.innerHTML = [
      '<strong style="display:block;margin-bottom:8px">Live journey — any starting point and destination</strong>',
      '<div style="display:flex;flex-wrap:wrap;gap:8px">',
      '<label style="flex:1 1 170px">From<input id="fieldtrip-origin" placeholder="e.g. Chennai" style="width:100%;padding:8px" value="Nagercoil"></label>',
      '<label style="flex:1 1 170px">To<input id="fieldtrip-destination" placeholder="e.g. Coimbatore" style="width:100%;padding:8px" value="Tirunelveli"></label>',
      '</div><button type="button" id="fieldtrip-resolve" style="margin:8px 0">Find locations</button>',
      '<div style="display:flex;flex-wrap:wrap;gap:8px">',
      '<label style="flex:1 1 170px">Confirm origin<select id="fieldtrip-origin-matches" style="width:100%" aria-label="Origin match"></select></label>',
      '<label style="flex:1 1 170px">Confirm destination<select id="fieldtrip-destination-matches" style="width:100%" aria-label="Destination match"></select></label>',
      '</div><button id="fieldtrip-apply" type="button" disabled style="margin-top:8px">Use these locations in this planner</button>',
      '<p id="fieldtrip-bridge-status" role="status" style="margin:7px 0;font-size:13px">The original planner and maps remain below.</p>'
    ].join("");
    routeButton.parentElement.insertBefore(panel, routeButton);
    startControls();
  }
  const mountObserver = new MutationObserver(mountControls);
  document.addEventListener("DOMContentLoaded", () => {
    mountControls();
    mountObserver.observe(document.body, {childList: true, subtree: true});
  });
  
  send("streamlit:componentReady", {apiVersion: 1});
  send("streamlit:setFrameHeight", {height: 1000});
})();