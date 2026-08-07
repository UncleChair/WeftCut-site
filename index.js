/* WeftCut — "Cinematic Timeline" */
(() => {
  "use strict";

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- localizable UI strings ----------
     Baked into each page as static JSON (see #ui-strings in the head), so this
     file carries no English of its own and the zh build localizes with it. */
  const STRINGS = (() => {
    const el = document.getElementById("ui-strings");
    if (!el) return {};
    try {
      return JSON.parse(el.textContent);
    } catch {
      return {};
    }
  })();

  // Falls back to the key rather than an empty string — a missing entry should
  // be visible in review, not silently blank a label or an aria-label.
  const t = (key, vars) => {
    const template = key in STRINGS ? STRINGS[key] : key;
    if (!vars) return template;
    return template.replace(/\{(\w+)\}/g, (whole, name) =>
      name in vars ? String(vars[name]) : whole
    );
  };

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
      // A hidden ghost of the full line holds its final size, so typing never
      // reflows the page (anchor jumps below this section rely on that).
      const line = document.createElement("span");
      line.className = "prompt-line";
      const ghost = document.createElement("span");
      ghost.className = "prompt-ghost";
      ghost.textContent = fullTexts[i];
      ghost.setAttribute("aria-hidden", "true");
      const span = document.createElement("span");
      span.className = "prompt-text";
      line.append(ghost, span);
      li.textContent = "";
      li.appendChild(line);
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

  /* ---------- platform-aware download ----------
     Dormant while the hero shows "Coming soon": the three ids below aren't in
     the markup right now, so the guard below makes this a no-op. Restoring the
     download button in index.html re-arms it with no change here. */
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
      downloadButtonLabel.textContent = t("downloadFor", { platform: platform.name });
      downloadButton.setAttribute("aria-label", t("downloadAria", { platform: platform.name }));
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
    // Half the first label's width, measured in measureTimeline(). The film's
    // 0%–100% runs inset from the rail ends by this much, so every marker —
    // the first included — centers on its stop; the ruler running past both
    // ends is the film's deliberate leader and trailer.
    let timelineInset = 0;
    const playheadWidth = 20;

    function progressToRailX(progress, width = timelineRail ? timelineRail.clientWidth : 0) {
      return width > timelineInset * 2
        ? timelineInset + progress * (width - timelineInset * 2)
        : timelineInset;
    }

    function setPlayheadProgress(progress) {
      const width = timelineRail ? timelineRail.clientWidth : 0;
      const center = progressToRailX(progress, width);
      if (timelinePlayhead) {
        timelinePlayhead.style.setProperty("--playhead-x", `${(center - playheadWidth / 2).toFixed(2)}px`);
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
      const rootStyles = getComputedStyle(document.documentElement);
      const measuredScrollPaddingTop = Number.parseFloat(rootStyles.scrollPaddingTop);
      const scrollPaddingTop = Number.isFinite(measuredScrollPaddingTop)
        ? measuredScrollPaddingTop
        : navHeight;
      const timelineHeight = pageTimeline.offsetHeight;
      const dockTop = documentY(timelineDock);
      const railWidth = timelineRail ? timelineRail.clientWidth : 0;
      const firstLink = markerEls.length ? markerEls[0].querySelector("a") : null;
      timelineInset = firstLink ? firstLink.offsetWidth / 2 : 0;
      const railLeft = timelineRail ? timelineRail.offsetLeft : 0;
      pageTimeline.style.setProperty("--ruler-phase", `${(railLeft + timelineInset).toFixed(2)}px`);
      timelineEnd = Math.max(1, dockTop - window.innerHeight + timelineHeight);

      markerStops = markerEls.map((marker, index) => {
        const link = marker.querySelector("a");
        const target = link ? document.querySelector(link.hash) : null;
        const measuredScrollMarginTop = target
          ? Number.parseFloat(getComputedStyle(target).scrollMarginTop)
          : 0;
        const scrollMarginTop = Number.isFinite(measuredScrollMarginTop)
          ? measuredScrollMarginTop
          : 0;
        const rawTargetY = index === 0 || !target
          ? 0
          : documentY(target) - scrollPaddingTop - scrollMarginTop;
        const scrollY = clamp(rawTargetY, 0, timelineEnd);
        const ratio = scrollY / timelineEnd;
        const markerX = progressToRailX(ratio, railWidth);

        marker.style.setProperty("--marker-position", `${(ratio * 100).toFixed(3)}%`);
        marker.style.setProperty("--marker-x", `${markerX.toFixed(2)}px`);

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
      const usableWidth = Math.max(1, rect.width - timelineInset * 2);
      scrubToRatio((clientX - rect.left - timelineInset) / usableWidth);
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

  /* ---------- one-shot Motif autoplay with manual replay ---------- */
  const motifExportVideo = document.getElementById("motifExportVideo");
  const motifReplayButton = document.getElementById("motifReplayButton");
  if (motifExportVideo) {
    motifExportVideo.pause();
    motifExportVideo.currentTime = 0;

    motifExportVideo.addEventListener("ended", () => {
      motifExportVideo.classList.add("motif-export-video-played");
    });

    if (motifReplayButton) {
      motifReplayButton.addEventListener("click", () => {
        motifExportVideo.pause();
        motifExportVideo.currentTime = 0;
        motifExportVideo.classList.remove("motif-export-video-played");
        motifExportVideo.play().catch(() => {});
      });
    }

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

    }
  }

  /* ---------- synced MCP tool-call replay ---------- */
  const demoVideo = document.getElementById("demoVideo");
  const logBody = document.getElementById("logBody");
  const logStat = document.getElementById("logStat");
  const logMeta = document.getElementById("logMeta");
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

  // The agent's prose arrives as markdown. Render the two inline forms the
  // terminal itself renders — bold and code — as nodes, never as innerHTML.
  function mdInline(text) {
    const frag = document.createDocumentFragment();
    const re = /\*\*([^*]+)\*\*|`([^`]+)`/g;
    let last = 0;
    let m;
    while ((m = re.exec(text))) {
      if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));
      const node = document.createElement(m[1] ? "strong" : "code");
      node.textContent = m[1] || m[2];
      frag.appendChild(node);
      last = re.lastIndex;
    }
    if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
    return frag;
  }

  // One transcript row: the ⏺/> gutter mark plus everything to the right of it.
  function tuiRow(cls, mark) {
    const el = document.createElement("div");
    el.className = "tui " + cls;
    const gutter = document.createElement("span");
    gutter.className = "tui-mark";
    gutter.textContent = mark;
    gutter.setAttribute("aria-hidden", "true");
    const body = document.createElement("div");
    body.className = "tui-text";
    el.append(gutter, body);
    return { el, body };
  }

  // The ⎿ block under a call: the result as the terminal prints it, clipped to
  // the first few lines with a "+N lines" tail.
  function tuiResult(ev) {
    const out = document.createElement("div");
    out.className = "tui-out";
    const elbow = document.createElement("span");
    elbow.className = "tui-elbow";
    elbow.textContent = "⎿";
    elbow.setAttribute("aria-hidden", "true");
    const lines = document.createElement("div");
    lines.className = "tui-lines";
    for (const l of ev.out) {
      const s = document.createElement("span");
      s.className = "tui-outline";
      s.textContent = l;
      lines.appendChild(s);
    }
    if (ev.more) {
      const s = document.createElement("span");
      s.className = "tui-more";
      s.textContent = t("moreLines", { n: ev.more });
      lines.appendChild(s);
    }
    out.append(elbow, lines);
    return out;
  }

  function makeSeekable(el, t) {
    el.tabIndex = 0;
    el.setAttribute("role", "button");
    const seek = () => {
      demoVideo.currentTime = t + 0.01;
      demoVideo.play().catch(() => {});
    };
    el.addEventListener("click", seek);
    el.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter" || ev.key === " ") {
        ev.preventDefault();
        seek();
      }
    });
  }

  let entries = []; // every timed line — calls and narration alike
  let callCount = 0;
  let lastCur = -2;

  function buildLines(session) {
    for (const el of logBody.querySelectorAll(".tui, .log-empty")) el.remove();
    entries = [];
    callCount = 0;

    if (session.prompt) {
      const { el, body } = tuiRow("tui-user", ">");
      body.textContent = session.prompt;
      el.setAttribute("aria-label", t("briefAria"));
      makeSeekable(el, 0);
      logBody.appendChild(el);
    }

    for (const ev of session.events) {
      let row;
      if (ev.kind === "call") {
        row = tuiRow("tui-call" + (ev.aux ? " tui-aux" : "") + (ev.error ? " tui-err" : ""), "⏺");
        const head = document.createElement("div");
        head.className = "tui-head";
        const tool = document.createElement("span");
        tool.className = "tui-tool";
        tool.textContent = ev.display;
        const params = document.createElement("span");
        params.className = "tui-params";
        params.textContent = `(${ev.params})`;
        head.append(tool, params);
        row.body.appendChild(head);
        if (ev.out && ev.out.length) row.body.appendChild(tuiResult(ev));
        row.el.title = t("callTitle", {
          tool: ev.display,
          params: ev.params,
          status: t(ev.error ? "callRejected" : "callOk"),
          ms: ev.ms,
        });
        row.el.setAttribute("aria-label", t("callAria", { tool: ev.display }));
        if (!ev.aux) callCount++;
      } else {
        row = tuiRow(ev.kind === "final" ? "tui-say tui-final" : "tui-say", "⏺");
        row.body.appendChild(mdInline(ev.text));
        row.el.setAttribute("aria-label", t("messageAria"));
      }
      makeSeekable(row.el, ev.t);
      logBody.appendChild(row.el);
      entries.push({ t: ev.t, el: row.el, call: ev.kind === "call" && !ev.aux });
    }

    lastCur = -2;
    if (logStat) logStat.textContent = t("logStatIdle", { count: callCount });
    if (logMeta) {
      const lat = session.events.filter((e) => e.kind === "call" && !e.aux).map((e) => e.ms).sort((a, b) => a - b);
      const median = lat.length ? lat[lat.length >> 1] : null;
      logMeta.textContent =
        median !== null
          ? t("logMetaMedian", { count: callCount, median })
          : t("logMeta", { count: callCount });
    }
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
      // Short rows sit a third of the way down; a block taller than that (the
      // closing summary) goes to the top instead, so its tail stays on screen.
      const lead = el.offsetHeight > logBody.clientHeight * 0.45 ? 10 : logBody.clientHeight * 0.35;
      const target = Math.max(0, el.offsetTop - lead);
      logBody.scrollTo({ top: target, behavior: reduced ? "auto" : "smooth" });
    } else {
      logBody.scrollTo({ top: 0, behavior: "auto" });
    }
    if (logStat && entries.length) {
      let moveNo = 0;
      for (let i = 0; i <= cur; i++) if (entries[i].call) moveNo++;
      logStat.textContent =
        cur >= 0
          ? t("logStatProgress", { done: moveNo, count: callCount, time: smpte(ct, 30).slice(3) })
          : t("logStatIdle", { count: callCount });
    }
    lastCur = cur;
  }

  fetch("/assets/agent-session.json")
    .then((r) => {
      if (!r.ok) throw new Error(String(r.status));
      return r.json();
    })
    .then((session) => {
      buildLines(session);
      sync();
      demoVideo.addEventListener("timeupdate", sync);
      demoVideo.addEventListener("seeked", sync);
      demoVideo.addEventListener("play", sync);
    })
    .catch(() => {
      const p = document.createElement("p");
      p.className = "log-empty";
      p.textContent = t("traceUnavailable");
      logBody.appendChild(p);
    });

  /* ---------- WebMCP tool surface ----------
     A page whose argument is "your agent should be able to drive this" ought to
     be drivable itself. Every tool below reads something the page already
     publishes — its JSON-LD, its own section markup, its Markdown twin, its
     server card — rather than restating it, so an agent and a human can never
     be told two different things. Nothing here mutates anything: this is a
     marketing page, and the only honest verbs it has are read verbs. */
  if (navigator.modelContext && typeof navigator.modelContext.provideContext === "function") {
    const clean = (el) => (el ? el.textContent.replace(/\s+/g, " ").trim() : "");

    const linkedData = (type) => {
      for (const el of document.querySelectorAll('script[type="application/ld+json"]')) {
        try {
          const data = JSON.parse(el.textContent);
          if (data && data["@type"] === type) return data;
        } catch {
          /* a malformed block shouldn't take the others down with it */
        }
      }
      return null;
    };

    const reply = (value) => ({
      content: [
        {
          type: "text",
          text: typeof value === "string" ? value : JSON.stringify(value, null, 2),
        },
      ],
    });

    const readFile = async (path) => {
      const res = await fetch(path, { headers: { accept: "*/*" } });
      if (!res.ok) return reply(t("mcpFetchFailed", { path, status: res.status }));
      return reply(await res.text());
    };

    const noInput = { type: "object", properties: {}, additionalProperties: false };

    const productSummary = () => {
      const app = linkedData("SoftwareApplication") || {};
      const canonical = document.querySelector('link[rel="canonical"]');
      return {
        name: app.name || "WeftCut",
        summary: app.description || "",
        operatingSystem: app.operatingSystem || "",
        license: app.license || "",
        price: app.offers ? `${app.offers.price} ${app.offers.priceCurrency}` : "",
        repository: app.url || "",
        // Read off the page rather than hard-coded: the hero CTA is a disabled
        // span until there's something to download, so its presence is the
        // most current release signal this page has.
        availability: document.querySelector(".btn-pending") ? "unreleased" : "released",
        pageLanguage: document.documentElement.lang || "",
        pageUrl: canonical ? canonical.href : location.href,
      };
    };

    const capabilities = () =>
      [...document.querySelectorAll("main section[id]")].map((section) => {
        const points = [];
        // h3s title the editor and FAQ cards; .cue-tag titles the agent grid.
        // Both sit next to the paragraph that explains them.
        for (const label of section.querySelectorAll("h3, .cue-tag")) {
          const name = clean(label);
          if (!name) continue;
          const parent = label.parentElement;
          points.push({ name, detail: clean(parent && parent.querySelector("p")) });
        }
        return {
          id: section.id,
          heading: clean(section.querySelector("h2")),
          lede: clean(section.querySelector(".lede")),
          points,
        };
      });

    const faq = () => {
      const page = linkedData("FAQPage");
      if (!page || !Array.isArray(page.mainEntity)) return [];
      return page.mainEntity.map((entry) => ({
        question: entry.name,
        answer: entry.acceptedAnswer ? entry.acceptedAnswer.text : "",
      }));
    };

    const markdownHref = () => {
      const link = document.querySelector('link[rel="alternate"][type="text/markdown"]');
      return link ? link.getAttribute("href") : "/index.md";
    };

    navigator.modelContext.provideContext({
      tools: [
        {
          name: "get_product_summary",
          description: t("mcpProductTool"),
          inputSchema: noInput,
          execute: async () => reply(productSummary()),
        },
        {
          name: "list_capabilities",
          description: t("mcpCapabilitiesTool"),
          inputSchema: {
            type: "object",
            properties: {
              section: {
                type: "string",
                description: "Limit to one section id, e.g. agent, editor, motifs, oss, faq.",
              },
            },
            additionalProperties: false,
          },
          execute: async (args) => {
            const all = capabilities();
            const wanted = args && args.section;
            return reply(wanted ? all.filter((s) => s.id === wanted) : all);
          },
        },
        {
          name: "get_faq",
          description: t("mcpFaqTool"),
          inputSchema: noInput,
          execute: async () => reply(faq()),
        },
        {
          name: "get_mcp_server_card",
          description: t("mcpServerCardTool"),
          inputSchema: noInput,
          execute: async () => readFile("/.well-known/mcp/server-card.json"),
        },
        {
          name: "read_page_as_markdown",
          description: t("mcpMarkdownTool"),
          inputSchema: noInput,
          execute: async () => readFile(markdownHref()),
        },
      ],
    });
  }
})();
