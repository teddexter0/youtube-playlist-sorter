"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { guideArrow } from "@/lib/guide-geometry";
const steps = [
  { target: "#main-navigation", title: "Your map", text: "Settings, Activity and Connection help are always here. Your station brings you back to your viewing controls." },
  { target: "#connect-google", title: "Your own account", text: "Connect Google to start your own session. Your interests, destinations and feedback belong to your account." },
  { target: "#autopilot-toggle", title: "Keep it automatic", text: "This button enables or pauses automatic hunts. Run status shows your schedule and latest outcome, including a held queue or an error." },
  { target: "#build-mix > button", title: "Make a mix now", text: "Build fills your private TV playlist now. Open it in YouTube or play it here. Save taste edits before building." },
  { target: "#taste-tuning > summary", title: "Your taste", text: "Open Optional fine-tuning to describe what you enjoy. A simple sentence works; each detailed line also stays a whole interest." },
  { target: "#sports-tuning legend", title: "Sports", text: "Choose the sports you want to add to your searches. Your existing interests remain intact." },
  { target: "#league-options > summary", title: "Football, your way", text: "Select leagues and competitions, or type an unlisted league or team. These choices drive real searches." },
  { target: "#publisher-picker > summary", title: "Your publishers", text: "Type a studio, streaming service, publisher or YouTube handle. Search, inspect the returned channel, then choose it for your account." },
  { target: "#channel-manager > summary", title: "Your channel lineup", text: "Give your playlists names and explicit subjects. New accounts begin with generic empty slots, not someone else's presets." },
  { target: "#reference-tools > summary", title: "Optional imports", text: "IMDb names guide people recommendations. Takeout history avoids previously seen videos; it does not provide continuous native watch tracking." },
  { target: "#account-controls > summary", title: "Account controls", text: "Switch accounts, sign out or disconnect here. A different account gets its own preferences and playlists." }
];
export default function QuickGuide() {
  const pathname = usePathname();
  const [index, setIndex] = useState(-1);
  const [available, setAvailable] = useState<typeof steps>([]);
  const [arrow, setArrow] = useState<ReturnType<typeof guideArrow>>(null);
  const [offscreen, setOffscreen] = useState(false);
  const card = useRef<HTMLElement>(null);
  const targetRef = useRef<HTMLElement | null>(null);
  const close = useCallback(() => { setIndex(-1); setArrow(null); }, []);
  const reveal = useCallback(() => {
    const target = targetRef.current;
    if (!target) return;
    const height = window.visualViewport?.height ?? innerHeight;
    const occupied = card.current?.getBoundingClientRect().height ?? 230;
    const rect = target.getBoundingClientRect();
    const desired = Math.max(95, (height - occupied - 40) * .45);
    window.scrollTo({ top: Math.max(0, window.scrollY + rect.top - desired), behavior: "instant" });
  }, []);
  useEffect(close, [pathname, close]);
  useEffect(() => {
    if (index < 0) return;
    const target = document.querySelector<HTMLElement>(available[index]?.target);
    if (!target) return;
    targetRef.current = target;
    let parent = target.parentElement;
    while (parent) { if (parent instanceof HTMLDetailsElement) parent.open = true; parent = parent.parentElement; }
    target.classList.add("guide-highlight");
    let frame = 0;
    const measure = () => {
      frame = 0;
      if (!card.current) return;
      const viewport = window.visualViewport;
      const width = viewport?.width ?? innerWidth, height = viewport?.height ?? innerHeight;
      const result = guideArrow(target.getBoundingClientRect(), card.current.getBoundingClientRect(), width, height);
      setArrow(result); setOffscreen(!result);
    };
    const update = () => { if (!frame) frame = requestAnimationFrame(measure); };
    const observer = new ResizeObserver(update); observer.observe(target);
    if (card.current) observer.observe(card.current);
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };
    window.addEventListener("scroll", update, { passive: true, capture: true }); window.addEventListener("resize", update);
    window.visualViewport?.addEventListener("resize", update); window.visualViewport?.addEventListener("scroll", update);
    window.addEventListener("keydown", escape);
    reveal(); update();
    return () => { cancelAnimationFrame(frame); observer.disconnect(); target.classList.remove("guide-highlight"); window.removeEventListener("scroll", update, true); window.removeEventListener("resize", update); window.visualViewport?.removeEventListener("resize", update); window.visualViewport?.removeEventListener("scroll", update); window.removeEventListener("keydown", escape); targetRef.current = null; };
  }, [index, available, close, reveal]);
  return <>
    <button className="guide-launch" aria-expanded={index >= 0} onClick={() => { if (index >= 0) close(); else { setAvailable(steps.filter(step => document.querySelector(step.target))); setIndex(0); } }}>↗ Show me around</button>
    {index >= 0 && available[index] ? <>
      {arrow ? <svg className="guide-pointer" aria-hidden="true" data-target={available[index].target}><defs><marker id="guide-arrow" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto"><path d="M0,0 L0,6 L9,3 z" fill="#ff6b35" /></marker></defs><path d={arrow.path} fill="none" stroke="#ff6b35" strokeWidth="4" markerEnd="url(#guide-arrow)" /></svg> : null}
      <aside className="guide-card" ref={card} role="region" aria-label="Guided tour" aria-live="polite"><div className="guide-topline"><span>{index + 1} / {available.length}</span><button className="text-button" onClick={close} aria-label="Close guided tour">Close ×</button></div><h3>{available[index].title}</h3><p>{available[index].text}</p>{offscreen ? <button className="text-button" onClick={reveal}>↑ Bring this control into view</button> : null}<div className="toolbar"><button className="secondary" disabled={index === 0} onClick={() => setIndex(i => i - 1)}>Back</button><button onClick={() => index === available.length - 1 ? close() : setIndex(i => i + 1)}>{index === available.length - 1 ? "Got it" : "Next →"}</button></div></aside>
    </> : null}
  </>;
}
