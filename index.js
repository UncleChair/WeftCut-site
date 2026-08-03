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

  /* ---------- prompt card typing ---------- */
  const promptList = document.querySelector(".prompt-list");
  if (promptList && !reduced && "IntersectionObserver" in window) {
    const promptItems = [...promptList.querySelectorAll("li")];
    const fullTexts = promptItems.map((li) => li.textContent.trim());

    promptList.classList.add("armed");
    promptItems.forEach((li, i) => {
      const span = document.createElement("span");
      span.className = "prompt-text";
      li.textContent = "";
      li.appendChild(span);
      li.setAttribute("aria-label", fullTexts[i]);
    });

    const typeLine = (index) => {
      if (index >= promptItems.length) return;
      const li = promptItems[index];
      const span = li.querySelector(".prompt-text");
      const text = fullTexts[index];
      li.classList.add("typing");
      let i = 0;
      // Fresh prompt line first, a beat, then typing — like hitting enter.
      setTimeout(function step() {
        i += 1;
        span.textContent = text.slice(0, i);
        if (i < text.length) setTimeout(step, 22);
        else {
          li.classList.replace("typing", "typed");
          setTimeout(() => typeLine(index + 1), 220);
        }
      }, 400);
    };

    const pio = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            pio.disconnect();
            typeLine(0);
          }
        }
      },
      { threshold: 0.4 }
    );
    pio.observe(promptList);
  }

  /* ---------- platform-aware download ---------- */
  const downloadButton = document.getElementById("downloadButton");
  const downloadPlatformIcon = document.getElementById("downloadPlatformIcon");
  const downloadButtonLabel = document.getElementById("downloadButtonLabel");
  if (downloadButton && downloadPlatformIcon && downloadButtonLabel) {
    const hintedPlatform = navigator.userAgentData && navigator.userAgentData.platform;
    const platformSource = [hintedPlatform, navigator.platform, navigator.userAgent]
      .filter(Boolean)
      .join(" ");
    const isUnsupportedMobile = /Android|iPhone|iPad|iPod|CrOS/i.test(platformSource);

    let platform = { key: "generic", name: "" };
    if (!isUnsupportedMobile && /Windows|Win32|Win64/i.test(platformSource)) {
      platform = { key: "windows", name: "Windows" };
    } else if (!isUnsupportedMobile && /macOS|Macintosh|MacIntel|MacPPC|Mac68K/i.test(platformSource)) {
      platform = { key: "macos", name: "macOS" };
    } else if (!isUnsupportedMobile && /Linux|X11/i.test(platformSource)) {
      platform = { key: "linux", name: "Linux" };
    }

    const platformIcons = {
      generic: '<svg viewBox="0 0 24 24" focusable="false"><path fill="currentColor" d="M11 3h2v10.17l3.59-3.58L18 11l-6 6-6-6 1.41-1.41L11 13.17V3ZM5 19h14v2H5v-2Z"/></svg>',
      windows: '<svg viewBox="0 0 24 24" focusable="false"><path fill="currentColor" d="M3 5.1 10.3 4v7H3V5.1Zm8.3-1.25L21 2.4V11h-9.7V3.85ZM3 12h7.3v7L3 17.9V12Zm8.3 0H21v8.6l-9.7-1.45V12Z"/></svg>',
      macos: '<svg viewBox="0 0 24 24" focusable="false"><path fill="currentColor" d="M16.6 12.5c0-2.2 1.8-3.3 1.9-3.4-1-1.5-2.7-1.7-3.3-1.7-1.4-.1-2.7.8-3.4.8-.7 0-1.8-.8-3-.8-1.5 0-2.9.9-3.7 2.2-1.6 2.8-.4 7 1.1 9.3.8 1.1 1.7 2.4 2.9 2.3 1.2 0 1.6-.7 3.1-.7 1.4 0 1.9.7 3.1.7 1.3 0 2.1-1.1 2.8-2.2.9-1.3 1.3-2.6 1.3-2.7-.1 0-2.8-1.1-2.8-4.1ZM14.3 5.9c.6-.8 1.1-2 1-3.1-1 .1-2.2.7-2.9 1.5-.6.7-1.1 1.9-1 3 1.1.1 2.2-.6 2.9-1.4Z"/></svg>',
      linux: '<svg viewBox="0 0 24 24" focusable="false"><path fill="currentColor" d="M3 4h18v16H3V4Zm2 2v12h14V6H5Zm1.5 2.2L9.3 11l-2.8 2.8 1.4 1.4 4.2-4.2-4.2-4.2-1.4 1.4ZM12 14h5v2h-5v-2Z"/></svg>',
    };

    downloadPlatformIcon.innerHTML = platformIcons[platform.key];
    downloadButton.dataset.platform = platform.key;
    if (platform.name) {
      downloadButtonLabel.textContent = `Download for ${platform.name}`;
      downloadButton.setAttribute("aria-label", `Download WeftCut for ${platform.name} from GitHub Releases`);
    }
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
    const timelineRail = pageTimeline.querySelector(".timeline-rail");
    const timelinePlayhead = pageTimeline.querySelector(".timeline-playhead");
    const siteNav = document.querySelector(".nav");
    const markerEls = [...pageTimeline.querySelectorAll("[data-timeline-marker]")];

    let timelineEnd = 1;
    let markerStops = [];
    let timelineFrame = 0;
    let measureFrame = 0;
    let isDocked = false;
    let dragPointerId = null;
    let dragProgress = null;

    const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
    const documentY = (el) => el.getBoundingClientRect().top + window.scrollY;

    function setPlayheadProgress(progress) {
      const width = timelineRail ? timelineRail.clientWidth : 0;
      const inset = 5;
      const handleWidth = 20;
      const center = width > inset * 2 ? inset + progress * (width - inset * 2) : inset;
      if (timelinePlayhead) {
        timelinePlayhead.style.setProperty("--playhead-x", `${(center - handleWidth / 2).toFixed(2)}px`);
      }
    }

    function updateTimeline() {
      timelineFrame = 0;

      const timelineHeight = pageTimeline.offsetHeight;
      const progress = clamp(window.scrollY / timelineEnd, 0, 1);
      const displayedProgress = dragProgress === null ? progress : dragProgress;
      const percent = Math.round(displayedProgress * 100);

      setPlayheadProgress(displayedProgress);

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

      if (timelinePlayhead) {
        const activeStop = markerStops[activeIndex];
        const chapter = activeStop && activeStop.link ? activeStop.link.getAttribute("aria-label") : "";
        timelinePlayhead.setAttribute("aria-valuenow", String(percent));
        timelinePlayhead.setAttribute("aria-valuetext", chapter ? `${percent}% — ${chapter}` : `${percent}%`);
      }

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

    function scrubToRatio(ratio) {
      const nextProgress = clamp(ratio, 0, 1);
      if (dragPointerId !== null) dragProgress = nextProgress;
      setPlayheadProgress(nextProgress);
      window.scrollTo({ top: nextProgress * timelineEnd, behavior: "instant" });
      requestTimelineUpdate();
    }

    function scrubToPointer(clientX) {
      if (!timelineRail) return;
      const rect = timelineRail.getBoundingClientRect();
      const inset = 5;
      const usableWidth = Math.max(1, rect.width - inset * 2);
      scrubToRatio((clientX - rect.left - inset) / usableWidth);
    }

    if (timelinePlayhead) {
      timelinePlayhead.addEventListener("pointerdown", (event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        dragPointerId = event.pointerId;
        dragProgress = clamp(window.scrollY / timelineEnd, 0, 1);
        timelinePlayhead.classList.add("is-dragging");
        document.documentElement.classList.add("is-scrubbing");
        timelinePlayhead.setPointerCapture(event.pointerId);
        scrubToPointer(event.clientX);
      });

      timelinePlayhead.addEventListener("pointermove", (event) => {
        if (event.pointerId !== dragPointerId) return;
        scrubToPointer(event.clientX);
      });

      const finishDrag = (event) => {
        if (event.pointerId !== dragPointerId) return;
        if (event.type === "pointerup") scrubToPointer(event.clientX);
        dragPointerId = null;
        dragProgress = null;
        timelinePlayhead.classList.remove("is-dragging");
        document.documentElement.classList.remove("is-scrubbing");
        if (timelinePlayhead.hasPointerCapture(event.pointerId)) {
          timelinePlayhead.releasePointerCapture(event.pointerId);
        }
        requestTimelineUpdate();
      };

      timelinePlayhead.addEventListener("pointerup", finishDrag);
      timelinePlayhead.addEventListener("pointercancel", finishDrag);
      timelinePlayhead.addEventListener("lostpointercapture", (event) => {
        if (event.pointerId !== dragPointerId) return;
        dragPointerId = null;
        dragProgress = null;
        timelinePlayhead.classList.remove("is-dragging");
        document.documentElement.classList.remove("is-scrubbing");
        requestTimelineUpdate();
      });

      timelinePlayhead.addEventListener("keydown", (event) => {
        const current = clamp(window.scrollY / timelineEnd, 0, 1);
        const fineStep = event.shiftKey ? 0.05 : 0.01;
        const keys = {
          ArrowLeft: current - fineStep,
          ArrowDown: current - fineStep,
          ArrowRight: current + fineStep,
          ArrowUp: current + fineStep,
          PageDown: current + 0.1,
          PageUp: current - 0.1,
          Home: 0,
          End: 1,
        };
        if (!(event.key in keys)) return;
        event.preventDefault();
        scrubToRatio(keys[event.key]);
      });
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

  /* ---------- one-shot Motif export playback ---------- */
  const motifExportVideo = document.getElementById("motifExportVideo");
  if (motifExportVideo) {
    motifExportVideo.pause();
    motifExportVideo.currentTime = 0;

    if (!reduced) {
      let motifHasPlayed = false;
      const playMotifOnce = () => {
        if (motifHasPlayed) return;
        motifHasPlayed = true;
        motifExportVideo.play().catch(() => {
          // A transient autoplay rejection should not permanently consume the run.
          motifHasPlayed = false;
        });
      };

      if ("IntersectionObserver" in window) {
        const motifVideoObserver = new IntersectionObserver(
          (entries) => {
            if (!entries.some((entry) => entry.isIntersecting)) return;
            motifVideoObserver.disconnect();
            playMotifOnce();
          },
          { threshold: 0.45 }
        );
        motifVideoObserver.observe(motifExportVideo);
      } else {
        playMotifOnce();
      }

      motifExportVideo.addEventListener(
        "ended",
        () => motifExportVideo.classList.add("motif-export-video-played"),
        { once: true }
      );
    }
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
