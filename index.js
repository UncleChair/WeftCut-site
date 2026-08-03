/* WeftCut — "Cinematic Timeline" */
(() => {
  "use strict";

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- scroll reveals ---------- */
  const rvEls = document.querySelectorAll(".rv");
  if (reduced || !("IntersectionObserver" in window)) {
    rvEls.forEach((el) => el.classList.add("in"));
  } else {
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add("in");
            io.unobserve(e.target);
          }
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -6% 0px" }
    );
    rvEls.forEach((el) => io.observe(el));
  }

  /* ---------- SMPTE helpers ---------- */
  const pad = (n) => String(n).padStart(2, "0");
  function smpte(t, fps) {
    const f = Math.floor((t % 1) * fps);
    const s = Math.floor(t) % 60;
    const m = Math.floor(t / 60) % 60;
    const h = Math.floor(t / 3600);
    return `${pad(h)}:${pad(m)}:${pad(s)}:${pad(f)}`;
  }

  /* ---------- page scroll timeline ---------- */
  const timelineDock = document.getElementById("timelineDock");
  const pageTimeline = document.getElementById("pageTimeline");
  if (timelineDock && pageTimeline) {
    const timelineMeter = document.getElementById("timelineMeter");
    const siteNav = document.querySelector(".nav");
    const markerEls = [...pageTimeline.querySelectorAll("[data-timeline-marker]")];

    let timelineEnd = 1;
    let markerStops = [];
    let timelineFrame = 0;
    let measureFrame = 0;
    let isDocked = false;

    const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
    const documentY = (el) => el.getBoundingClientRect().top + window.scrollY;

    function updateTimeline() {
      timelineFrame = 0;

      const timelineHeight = pageTimeline.offsetHeight;
      const progress = clamp(window.scrollY / timelineEnd, 0, 1);
      const percent = Math.round(progress * 100);
      const progressCss = `${(progress * 100).toFixed(3)}%`;

      pageTimeline.style.setProperty("--timeline-progress", progressCss);
      if (timelineMeter) timelineMeter.setAttribute("aria-valuenow", String(percent));

      let activeIndex = 0;
      for (let i = 0; i < markerStops.length; i++) {
        if (window.scrollY + 2 >= markerStops[i].scrollY) activeIndex = i;
      }

      markerStops.forEach((stop, index) => {
        const active = index === activeIndex;
        stop.marker.classList.toggle("is-active", active);
        if (active) stop.link.setAttribute("aria-current", "location");
        else stop.link.removeAttribute("aria-current");
      });

      const shouldDock = timelineDock.getBoundingClientRect().top <= window.innerHeight - timelineHeight + 0.5;
      if (shouldDock !== isDocked) {
        isDocked = shouldDock;
        timelineDock.classList.toggle("is-docked", isDocked);
      }
    }

    function requestTimelineUpdate() {
      if (!timelineFrame) timelineFrame = requestAnimationFrame(updateTimeline);
    }

    function measureTimeline() {
      measureFrame = 0;
      const navHeight = siteNav ? siteNav.offsetHeight : 0;
      const timelineHeight = pageTimeline.offsetHeight;
      const dockTop = documentY(timelineDock);
      timelineEnd = Math.max(1, dockTop - window.innerHeight + timelineHeight);

      markerStops = markerEls.map((marker, index) => {
        const link = marker.querySelector("a");
        const target = link ? document.querySelector(link.hash) : null;
        const rawTargetY = index === 0 || !target ? 0 : documentY(target) - navHeight - 16;
        const scrollY = clamp(rawTargetY, 0, timelineEnd);
        const ratio = scrollY / timelineEnd;

        marker.style.setProperty("--marker-position", `${(ratio * 100).toFixed(3)}%`);

        return { marker, link, scrollY, ratio };
      });

      updateTimeline();
    }

    function requestTimelineMeasure() {
      if (!measureFrame) measureFrame = requestAnimationFrame(measureTimeline);
    }

    window.addEventListener("scroll", requestTimelineUpdate, { passive: true });
    window.addEventListener("resize", requestTimelineMeasure, { passive: true });
    window.addEventListener("load", requestTimelineMeasure, { once: true });
    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", requestTimelineMeasure, { passive: true });
    }
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(requestTimelineMeasure);
    }
    if ("ResizeObserver" in window) {
      const timelineResizeObserver = new ResizeObserver(requestTimelineMeasure);
      timelineResizeObserver.observe(document.querySelector("main"));
    }

    measureTimeline();
  }

  /* ---------- hero program-monitor timecode ---------- */
  const heroVideo = document.getElementById("heroVideo");
  const heroTc = document.getElementById("heroTc");
  if (heroVideo && heroTc) {
    if (reduced) {
      heroVideo.pause();
      heroVideo.removeAttribute("autoplay");
    }
    let ticking = false;
    const tick = () => {
      heroTc.textContent = "TC " + smpte(heroVideo.currentTime, 30);
      if (!heroVideo.paused && !heroVideo.ended) {
        requestAnimationFrame(tick);
      } else {
        ticking = false;
      }
    };
    const start = () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(tick);
      }
    };
    heroVideo.addEventListener("play", start);
    heroVideo.addEventListener("playing", start);
    if (!heroVideo.paused) start();
  }

  /* ---------- synced MCP tool-call replay ---------- */
  const demoVideo = document.getElementById("demoVideo");
  const logBody = document.getElementById("logBody");
  const logStat = document.getElementById("logStat");
  if (!demoVideo || !logBody) return;

  // The demo sits below the fold, where autoplay doesn't always engage —
  // start/stop it on visibility instead. Also saves a decoder offscreen.
  if ("IntersectionObserver" in window) {
    const vio = new IntersectionObserver(
      (es) => {
        for (const e of es) {
          if (e.isIntersecting) demoVideo.play().catch(() => {});
          else demoVideo.pause();
        }
      },
      { threshold: 0.15 }
    );
    vio.observe(demoVideo);
  } else {
    demoVideo.play().catch(() => {});
  }

  // The mocked prompt that precedes the real trace.
  const userLine = document.createElement("div");
  userLine.className = "tl tl-user";
  userLine.innerHTML =
    '<span class="tl-tc">PROMPT</span>' +
    '<span class="tl-body"><span class="tl-args">“Cut a 15s brand teaser from these clips — tighten it, add a lower third, captions, and a fade on the B-roll.”</span></span>' +
    '<span class="tl-ms"></span>';
  logBody.appendChild(userLine);

  let entries = [];
  let lastCur = -2;

  function buildLines(calls) {
    for (const el of logBody.querySelectorAll(".tl:not(.tl-user)")) el.remove();
    entries = calls.map((c) => {
      const el = document.createElement("div");
      el.className = "tl";

      const tc = document.createElement("span");
      tc.className = "tl-tc";
      tc.textContent = smpte(c.t, 30).slice(3); // MM:SS:FF

      const body = document.createElement("span");
      body.className = "tl-body";
      const name = document.createElement("span");
      name.className = "tl-name";
      name.textContent = c.label || c.name;
      body.appendChild(name);

      const ms = document.createElement("span");
      ms.className = "tl-ms";
      ms.textContent = `✓ ${c.ms}ms`;

      el.append(tc, body, ms);
      el.tabIndex = 0;
      el.setAttribute("role", "button");
      el.setAttribute("aria-label", `${c.label || c.name} — seek video`);
      const seek = () => {
        demoVideo.currentTime = c.t + 0.01;
        demoVideo.play().catch(() => {});
      };
      el.addEventListener("click", seek);
      el.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter" || ev.key === " ") {
          ev.preventDefault();
          seek();
        }
      });
      logBody.appendChild(el);
      return { t: c.t, el };
    });
    lastCur = -2;
    if (logStat) logStat.textContent = `${calls.length} REAL MOVES · IN SYNC`;
  }

  function sync() {
    const ct = demoVideo.currentTime;
    let cur = -1;
    for (let i = 0; i < entries.length; i++) {
      const on = entries[i].t <= ct;
      entries[i].el.classList.toggle("on", on);
      if (on) cur = i;
    }
    if (cur === lastCur) return;
    for (const e of entries) e.el.classList.remove("cur");
    if (cur >= 0) {
      const el = entries[cur].el;
      el.classList.add("cur");
      const target = Math.max(0, el.offsetTop - logBody.clientHeight * 0.35);
      logBody.scrollTo({ top: target, behavior: reduced ? "auto" : "smooth" });
    } else {
      logBody.scrollTo({ top: 0, behavior: "auto" });
    }
    if (logStat && entries.length) {
      logStat.textContent =
        cur >= 0
          ? `MOVE ${cur + 1}/${entries.length} · T+${smpte(ct, 30).slice(3)}`
          : `${entries.length} REAL MOVES · IN SYNC`;
    }
    lastCur = cur;
  }

  fetch("/assets/agent-log.json")
    .then((r) => {
      if (!r.ok) throw new Error(String(r.status));
      return r.json();
    })
    .then((calls) => {
      buildLines(calls);
      sync();
      demoVideo.addEventListener("timeupdate", sync);
      demoVideo.addEventListener("seeked", sync);
      demoVideo.addEventListener("play", sync);
    })
    .catch(() => {
      const p = document.createElement("p");
      p.className = "log-empty";
      p.textContent = "call trace unavailable — see /assets/agent-log.json";
      logBody.appendChild(p);
    });
})();
