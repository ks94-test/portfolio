if (window.location.hash) {
  const cleanUrl = window.location.href.split("#")[0];
  window.history.replaceState(null, "", cleanUrl);
  window.history.scrollRestoration = "manual";
  document.documentElement.style.scrollBehavior = "auto";
  window.requestAnimationFrame(() => {
    window.scrollTo(0, 0);
    window.requestAnimationFrame(() => document.documentElement.style.removeProperty("scroll-behavior"));
  });
}

const heroTypewriter = document.querySelector("#hero-typewriter");
const heroStatement = heroTypewriter?.dataset.text;
if (heroTypewriter && heroStatement) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    heroTypewriter.textContent = heroStatement;
  } else {
    let typedCharacters = 0;
    const typeTimer = window.setInterval(() => {
      typedCharacters += 1;
      heroTypewriter.textContent = heroStatement.slice(0, typedCharacters);
      if (typedCharacters >= heroStatement.length) window.clearInterval(typeTimer);
    }, 36);
  }
}

const liveClock = document.querySelector("#live-clock");
function updateLiveClock() {
  if (!liveClock) return;
  liveClock.textContent = `${new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).format(new Date())} IST`;
}
updateLiveClock();
window.setInterval(updateLiveClock, 1000);

const sections = [...document.querySelectorAll("[data-guide]")];
const guide = document.querySelector(".guide");
const guideMessage = document.querySelector("#guide-message");
const guideToggle = document.querySelector("#guide-toggle");
const guideStop = document.querySelector("#guide-stop");
const guideSearch = document.querySelector("#guide-search");
const guideQuery = document.querySelector("#guide-query");
const guideMic = document.querySelector("#guide-mic");
const botEyes = [...document.querySelectorAll(".bot-eye")];
const botPupils = [...document.querySelectorAll(".bot-pupil")];
const tourLines = sections.map((section) => section.dataset.guide);
let activeSection = sections[0];
let tourRunning = false;
let tourIndex = 0;
let utterance;
let tourTimer;
let directMessageTimer = null;
let directingVisitor = false;
let speechRecognition;
let guideDrag;
let guideManuallyMoved = false;
let ignoreGuideClick = false;

function beginGuideDrag(event) {
  if (event.pointerType === "mouse" && event.button !== 0) return;
  guideDrag = {
    pointerId: event.pointerId,
    startY: event.clientY,
    initialTop: guide.getBoundingClientRect().top,
    moved: false
  };
  event.currentTarget.setPointerCapture(event.pointerId);
}

function moveGuideDrag(event) {
  if (!guideDrag || event.pointerId !== guideDrag.pointerId) return;
  const delta = event.clientY - guideDrag.startY;
  if (!guideDrag.moved && Math.abs(delta) < 6) return;
  guideDrag.moved = true;
  guideManuallyMoved = true;
  guide.classList.add("is-dragging");
  const maxTop = Math.max(12, window.innerHeight - guide.offsetHeight - 12);
  const top = Math.max(12, Math.min(maxTop, guideDrag.initialTop + delta));
  guide.style.top = `${top}px`;
  guide.style.bottom = "auto";
}

function endGuideDrag(event) {
  if (!guideDrag || event.pointerId !== guideDrag.pointerId) return;
  const wasDragged = guideDrag.moved;
  guideDrag = null;
  guide.classList.remove("is-dragging");
  if (wasDragged) {
    ignoreGuideClick = true;
    window.setTimeout(() => { ignoreGuideClick = false; }, 180);
  }
}

function moveBotEyes(event) {
  moveGuideDrag(event);
  if (event.pointerType === "touch") return;
  botEyes.forEach((eye, index) => {
    const bounds = eye.getBoundingClientRect();
    const dx = event.clientX - (bounds.left + bounds.width / 2);
    const dy = event.clientY - (bounds.top + bounds.height / 2);
    const distance = Math.max(1, Math.hypot(dx, dy));
    const strength = Math.min(1, distance / 120);
    const pupil = botPupils[index];
    pupil.style.setProperty("--gaze-x", `${(dx / distance) * 2.5 * strength}px`);
    pupil.style.setProperty("--gaze-y", `${(dy / distance) * 2 * strength}px`);
  });
}

function resetBotGaze() {
  botPupils.forEach((pupil) => {
    pupil.style.setProperty("--gaze-x", "0px");
    pupil.style.setProperty("--gaze-y", "0px");
  });
}

function scheduleBotBlink() {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  window.setTimeout(() => {
    guide.classList.add("is-blinking");
    window.setTimeout(() => guide.classList.remove("is-blinking"), 140);
    scheduleBotBlink();
  }, 2200 + Math.random() * 3600);
}

window.addEventListener("pointermove", moveBotEyes, { passive: true });
window.addEventListener("blur", resetBotGaze);
guideToggle.addEventListener("pointerdown", beginGuideDrag);
window.addEventListener("pointerup", endGuideDrag);
window.addEventListener("pointercancel", endGuideDrag);
scheduleBotBlink();

function setGuideMessage(message) {
  guideMessage.textContent = message;
  guideToggle.setAttribute("aria-label", tourRunning ? "Stop the guided tour" : "Start the guided tour or drag to reposition");
}

function positionGuide(section) {
  if (!section) return;
  guide.classList.remove("guide-left");
  if (guideManuallyMoved && !tourRunning && !directingVisitor) return;
  if (window.scrollY <= 1 && !tourRunning && !directingVisitor) {
    guide.style.removeProperty("top");
    guide.style.removeProperty("bottom");
    return;
  }
  const isMobile = window.matchMedia("(max-width: 620px)").matches;
  if (isMobile) {
    guide.style.removeProperty("top");
    guide.style.removeProperty("bottom");
    return;
  }
  const bounds = section.getBoundingClientRect();
  const top = Math.max(100, Math.min(window.innerHeight - 145, bounds.top + Math.min(bounds.height / 2, 190)));
  guide.style.top = `${top}px`;
  guide.style.bottom = "auto";
}

function preferredVoice() {
  const voices = window.speechSynthesis?.getVoices() || [];
  return voices.find((voice) => /^en-IN$/i.test(voice.lang))
    || voices.find((voice) => /^en-IN/i.test(voice.lang))
    || voices.find((voice) => /^en-GB/i.test(voice.lang))
    || voices.find((voice) => /^en/i.test(voice.lang));
}

function speakMessage(message, onEnd) {
  if (!("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  guide.classList.remove("is-talking");
  utterance = new SpeechSynthesisUtterance(message);
  utterance.lang = "en-IN";
  utterance.rate = 0.94;
  utterance.pitch = 1;
  const voice = preferredVoice();
  if (voice) utterance.voice = voice;
  utterance.onstart = () => guide.classList.add("is-talking");
  utterance.onend = () => {
    guide.classList.remove("is-talking");
    if (onEnd) onEnd();
  };
  utterance.onerror = () => guide.classList.remove("is-talking");
  window.speechSynthesis.speak(utterance);
}

function speakLine(index) {
  if (!tourRunning || !window.speechSynthesis) return;
  tourIndex = index % tourLines.length;
  const section = sections[tourIndex];
  section.scrollIntoView({ behavior: "smooth", block: "center" });
  setGuideMessage(tourLines[tourIndex]);
  speakMessage(tourLines[tourIndex], () => {
    if (tourRunning) tourTimer = window.setTimeout(() => speakLine(tourIndex + 1), 1500);
  });
}

function stopGuide() {
  tourRunning = false;
  directingVisitor = false;
  window.clearTimeout(tourTimer);
  window.clearTimeout(directMessageTimer);
  directMessageTimer = null;
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  if (speechRecognition && guide.classList.contains("is-listening")) speechRecognition.stop();
  guide.classList.remove("is-speaking", "is-talking", "is-listening");
  guideToggle.setAttribute("aria-label", "Start the guided tour");
  setGuideMessage(activeSection?.dataset.guide || "Tap me when you’re ready for a quick tour.");
}

guideToggle.addEventListener("click", () => {
  if (ignoreGuideClick) {
    ignoreGuideClick = false;
    return;
  }
  if (!("speechSynthesis" in window)) {
    setGuideMessage("Your browser does not support voice playback, but you can still explore each section.");
    return;
  }
  if (tourRunning) {
    stopGuide();
    return;
  }
  window.speechSynthesis.cancel();
  guide.classList.remove("is-talking");
  guideManuallyMoved = false;
  positionGuide(activeSection);
  tourRunning = true;
  guide.classList.add("is-speaking");
  speakLine(0);
});
guideStop.addEventListener("click", stopGuide);

function directVisitor(message, targetSelector) {
  stopGuide();
  const target = document.querySelector(targetSelector);
  if (!target) {
    setGuideMessage("I couldn’t find that section. Try projects, skills, experience, or contact.");
    return;
  }
  activeSection = target.closest("[data-guide]") || target;
  guideManuallyMoved = false;
  directingVisitor = true;
  positionGuide(activeSection);
  setGuideMessage(message);
  target.scrollIntoView({ behavior: "smooth", block: "center" });
  window.clearTimeout(directMessageTimer);
  directMessageTimer = window.setTimeout(() => {
    directMessageTimer = null;
    directingVisitor = false;
    if (!tourRunning && activeSection?.dataset.guide) setGuideMessage(activeSection.dataset.guide);
  }, 8000);
  speakMessage(message);
}

function routeRequest(rawQuery) {
  const query = rawQuery.trim().toLowerCase();
  if (!query) {
    setGuideMessage("Tell me what you’re looking for, like projects, skills, experience, or contact.");
    guideQuery.focus();
    return;
  }
  const routes = [
    { keywords: /\b(project|projects|work|solution|solutions|portfolio|agent|techcompass|print iq|process pilot|symptom|asset management|trainer call)\b/, target: "#work", reply: "Here are the featured projects and solutions." },
    { keywords: /\b(skill|skills|tool|tools|technology|technologies|capabilit|training|enablement|automation|ai)\b/, target: "#skills", reply: "Here are the key capabilities and tools." },
    { keywords: /\b(experience|career|journey|history|hp)\b/, target: "#experience", reply: "Here’s the experience timeline." },
    { keywords: /\b(about|who|profile|introduction)\b/, target: "#about", reply: "Here’s a little about Karthikeyan." },
    { keywords: /\b(initiative|initiatives|innovation|event|events|symposium|roadshow|rr|csat|hvp)\b/, target: "#initiatives", reply: "Here are the innovation initiatives, including the RR Improvement Program, CSAT, and HVP Reduction." },
    { keywords: /\b(impact|operations|performance|insights)\b/, target: "#impact", reply: "Here’s how the work supports operational performance." },
    { keywords: /\b(award|awards|recognition|recognitions)\b/, target: "#contact", reply: "Here are the recognitions, near the contact details." },
    { keywords: /\b(contact|email|linkedin|connect|message)\b/, target: "#contact", reply: "Here are the contact details." },
    { keywords: /\b(cv|resume|résumé|download)\b/, target: "#contact", reply: "I’ve taken you to the contact section. You’ll find the Download CV button there." }
  ];
  const route = routes.find((item) => item.keywords.test(query));
  if (route) {
    directVisitor(route.reply, route.target);
    return;
  }
  stopGuide();
  const fallback = "I’m not sure where that is yet. Try projects, skills, experience, initiatives, awards, or contact.";
  setGuideMessage(fallback);
  speakMessage(fallback);
}

guideSearch.addEventListener("submit", (event) => {
  event.preventDefault();
  routeRequest(guideQuery.value);
});

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
guideMic.addEventListener("click", () => {
  if (!SpeechRecognition) {
    setGuideMessage("Voice search isn’t supported in this browser. Type what you’re looking for instead.");
    return;
  }
  stopGuide();
  speechRecognition = new SpeechRecognition();
  speechRecognition.lang = "en-IN";
  speechRecognition.interimResults = false;
  speechRecognition.maxAlternatives = 1;
  speechRecognition.onstart = () => {
    guide.classList.add("is-listening");
    setGuideMessage("I’m listening. Tell me what you’d like to find.");
  };
  speechRecognition.onresult = (event) => {
    const request = event.results[0][0].transcript;
    guideQuery.value = request;
    guide.classList.remove("is-listening");
    routeRequest(request);
  };
  speechRecognition.onerror = (event) => {
    guide.classList.remove("is-listening");
    const message = event.error === "not-allowed"
      ? "Microphone access was blocked. Allow microphone access or type your request."
      : "I didn’t catch that. Try again, or type what you’re looking for.";
    setGuideMessage(message);
  };
  speechRecognition.onend = () => guide.classList.remove("is-listening");
  try {
    speechRecognition.start();
  } catch (error) {
    guide.classList.remove("is-listening");
    setGuideMessage("Voice search couldn’t start. Please type what you’re looking for.");
  }
});

const sectionObserver = new IntersectionObserver((entries) => {
  const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
  if (!visible) return;
  if (window.scrollY <= 1 && !tourRunning && !directingVisitor) {
    activeSection = sections[0];
    positionGuide(activeSection);
    setGuideMessage(activeSection.dataset.guide);
    return;
  }
  if (!directingVisitor) activeSection = visible.target;
  positionGuide(directingVisitor ? activeSection : visible.target);
  if (!tourRunning && !directingVisitor) setGuideMessage(activeSection.dataset.guide);
}, { threshold: [0.2, 0.45, 0.7] });
sections.forEach((section) => sectionObserver.observe(section));
window.addEventListener("scroll", () => {
  if (window.scrollY <= 1 && !tourRunning && !directingVisitor) {
    activeSection = sections[0];
    setGuideMessage(activeSection.dataset.guide);
  }
  positionGuide(activeSection);
}, { passive: true });
window.addEventListener("resize", () => positionGuide(activeSection));

const navigation = document.querySelector(".main-nav");
const menuToggle = document.querySelector(".menu-toggle");
menuToggle.addEventListener("click", () => {
  const isOpen = navigation.classList.toggle("open");
  menuToggle.setAttribute("aria-expanded", String(isOpen));
  menuToggle.setAttribute("aria-label", isOpen ? "Close navigation" : "Open navigation");
});
navigation.addEventListener("click", (event) => {
  if (event.target.closest("a")) {
    navigation.classList.remove("open");
    menuToggle.setAttribute("aria-expanded", "false");
  }
});

document.querySelectorAll(".detail-button").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelector("#dialog-title").textContent = button.dataset.title;
    document.querySelector("#dialog-description").textContent = button.dataset.description;
    document.querySelector(".project-dialog").showModal();
  });
});
const projectDialog = document.querySelector(".project-dialog");
document.querySelector(".dialog-close").addEventListener("click", () => projectDialog.close());
document.querySelector(".dialog-done").addEventListener("click", () => projectDialog.close());
projectDialog.addEventListener("click", (event) => {
  if (event.target === projectDialog) projectDialog.close();
});

const storyDialog = document.querySelector(".story-dialog");
document.querySelector("#story-open").addEventListener("click", () => storyDialog.showModal());
document.querySelector(".story-close").addEventListener("click", () => storyDialog.close());
storyDialog.addEventListener("click", (event) => {
  if (event.target === storyDialog) storyDialog.close();
});

const initiativeTrack = document.querySelector(".initiative-track");
document.querySelector(".carousel-arrow.prev").addEventListener("click", () => initiativeTrack.scrollBy({ left: -150, behavior: "smooth" }));
document.querySelector(".carousel-arrow.next").addEventListener("click", () => initiativeTrack.scrollBy({ left: 150, behavior: "smooth" }));
