/* ============================================================
   Geburtstagswochenende — Interaktion
   Alle Zeit-Konstanten nur hier (SSOT)
   ============================================================ */

// NEW — zentrale Termin-Konstanten, existieren sonst nirgends im Projekt
const EVENT_START = new Date("2026-09-25T00:00:00");
const EVENT_END = new Date("2026-09-28T00:00:00"); // exklusiv: Nacht nach dem 27.
const MS = { SEC: 1000, MIN: 60_000, HOUR: 3_600_000, DAY: 86_400_000 };

const REDUCED_MOTION = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ---------- Countdown ---------- */

const cd = {
  days: document.getElementById("cdDays"),
  hours: document.getElementById("cdHours"),
  mins: document.getElementById("cdMins"),
  secs: document.getElementById("cdSecs"),
  box: document.getElementById("countdown"),
  done: document.getElementById("countdownDone"),
  nav: document.getElementById("navCountdown"),
};

const pad2 = (n) => String(n).padStart(2, "0");

function tickCountdown() {
  const now = Date.now();
  const diff = EVENT_START - now;

  if (diff <= 0) {
    cd.box.hidden = true;
    cd.done.hidden = false;
    const running = now < EVENT_END;
    cd.done.textContent = running
      ? "Es ist so weit — das Wochenende läuft!"
      : "Das war's — bis zum nächsten Mal!";
    cd.nav.textContent = running ? "Jetzt live" : "Vorbei";
    return;
  }

  const days = Math.floor(diff / MS.DAY);
  const hours = Math.floor((diff % MS.DAY) / MS.HOUR);
  const mins = Math.floor((diff % MS.HOUR) / MS.MIN);
  const secs = Math.floor((diff % MS.MIN) / MS.SEC);

  cd.days.textContent = days;
  cd.hours.textContent = pad2(hours);
  cd.mins.textContent = pad2(mins);
  cd.secs.textContent = pad2(secs);
  cd.nav.textContent = `Noch ${days} ${days === 1 ? "Tag" : "Tage"}`;

  setTimeout(tickCountdown, MS.SEC);
}

tickCountdown();

/* ---------- Reveal beim Scrollen ---------- */

const revealObserver = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-in");
        revealObserver.unobserve(entry.target);
      }
    }
  },
  { threshold: 0.15, rootMargin: "0px 0px -8% 0px" }
);

document.querySelectorAll(".reveal").forEach((el) => revealObserver.observe(el));

/* ---------- Akzentfarbe folgt der sichtbaren Sektion ---------- */

const themeObserver = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        document.body.dataset.theme = entry.target.dataset.dayTheme;
      }
    }
  },
  { threshold: 0.45 }
);

document.querySelectorAll("[data-day-theme]").forEach((el) => themeObserver.observe(el));

/* ---------- Scroll-Progress + Parallax (ein rAF-Loop) ---------- */

const progressBar = document.getElementById("progressBar");
const parallaxEls = REDUCED_MOTION
  ? []
  : [...document.querySelectorAll("[data-speed]")];

let rafPending = false;

function onScrollFrame() {
  rafPending = false;

  const doc = document.documentElement;
  const max = doc.scrollHeight - window.innerHeight;
  progressBar.style.width = `${max > 0 ? (window.scrollY / max) * 100 : 0}%`;

  const mid = window.innerHeight / 2;
  for (const el of parallaxEls) {
    const rect = el.getBoundingClientRect();
    const offset = (rect.top + rect.height / 2 - mid) * Number(el.dataset.speed);
    // Reveal-Transform nicht überschreiben, solange das Element noch einblendet
    if (el.classList.contains("is-in")) {
      el.style.transform = `translateY(${-offset}px)`;
    }
  }
}

function requestScrollFrame() {
  if (!rafPending) {
    rafPending = true;
    requestAnimationFrame(onScrollFrame);
  }
}

window.addEventListener("scroll", requestScrollFrame, { passive: true });
window.addEventListener("resize", requestScrollFrame, { passive: true });
requestScrollFrame();
