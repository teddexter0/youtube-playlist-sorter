"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

const scenes = [
  { title: "Somewhere you've never been.", tag: "THE WANDER CHANNEL", image: "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=1200&q=80", credit: "https://unsplash.com", type: "photo" },
  { title: "A little space to be curious.", tag: "THE LITTLE WONDERS CHANNEL", image: "https://images.unsplash.com/photo-1519608487953-e999c86e7455?w=1200&q=80", credit: "https://unsplash.com", type: "photo" },
  { title: "Take the scenic route.", tag: "THE SLOW EVENING CHANNEL", image: "https://images.pexels.com/videos/11009171/at-the-beach-beach-sunset-beautiful-sunset-bird-flying-11009171.jpeg?auto=compress&w=1000", credit: "https://www.pexels.com/video/waves-in-sea-at-sunset-11009171/", type: "video" },
  { title: "Big ideas. Little rabbit holes.", tag: "THE TOMORROW CHANNEL", image: "", credit: "", type: "orbit" },
  { title: "A whole world beyond your bubble.", tag: "THE WILD CARD CHANNEL", image: "", credit: "", type: "pitch" }
];

export default function BroadcastStage({ connected = false }: { connected?: boolean }) {
  const root = useRef<HTMLElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [scene, setScene] = useState(0);
  const [motion, setMotion] = useState(false);
  const [mediaFailed, setMediaFailed] = useState(false);
  const bag = useRef<number[]>([]);
  const last = useRef(0);

  const nextScene = useCallback(() => {
    bag.current = bag.current.filter((i) => i !== last.current);
    if (!bag.current.length) {
      bag.current = scenes.map((_, i) => i).filter((i) => i !== last.current);
      for (let i = bag.current.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [bag.current[i], bag.current[j]] = [bag.current[j], bag.current[i]];
      }
    }
    const next = bag.current.shift()!;
    last.current = next; setScene(next); setMediaFailed(false);
  }, []);

  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const saved = localStorage.getItem("personal-tv-motion");
    setMotion(saved === "off" ? false : !preference.matches);
    const onPreference = () => setMotion(!preference.matches && localStorage.getItem("personal-tv-motion") !== "off");
    preference.addEventListener("change", onPreference);
    return () => preference.removeEventListener("change", onPreference);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.motion = motion ? "on" : "off";
    if (!motion) return;
    const interval = window.setInterval(() => { if (!document.hidden) nextScene(); }, 10000);
    return () => window.clearInterval(interval);
  }, [motion, nextScene]);

  useEffect(() => {
    const host = root.current, surface = canvas.current;
    const ctx = surface?.getContext("2d");
    if (!host || !surface || !ctx) return;
    let frame = 0, width = 1, height = 1, visible = true;
    let x = 0, y = 0, vx = 0, vy = 0, targetX = 0, targetY = 0;
    const resize = new ResizeObserver(() => {
      const rect = host.getBoundingClientRect(); width = rect.width; height = rect.height;
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      surface.width = width * dpr; surface.height = height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    });
    resize.observe(host);
    const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; });
    observer.observe(host);
    const pointer = (event: PointerEvent) => {
      const rect = host.getBoundingClientRect();
      targetX = (event.clientX - rect.left) / rect.width - .5;
      targetY = (event.clientY - rect.top) / rect.height - .5;
    };
    const leave = () => { targetX = 0; targetY = 0; };
    host.addEventListener("pointermove", pointer); host.addEventListener("pointerleave", leave);
    const draw = (time: number) => {
      if (visible && !document.hidden) {
        vx = (vx + (targetX - x) * .07) * .8; vy = (vy + (targetY - y) * .07) * .8;
        x += vx; y += vy;
        host.style.setProperty("--look-x", `${motion ? x * 12 : 0}px`);
        host.style.setProperty("--look-y", `${motion ? y * 10 : 0}px`);
        host.style.setProperty("--tilt-x", `${motion ? -y * 5 : 0}deg`);
        host.style.setProperty("--tilt-y", `${motion ? x * 7 : 0}deg`);
        host.style.setProperty("--drift", `${motion ? Math.max(-45, Math.min(45, -host.getBoundingClientRect().top * .075)) : 0}px`);
        ctx.clearRect(0, 0, width, height);
        const t = motion ? time * .00022 : .4;
        // A perspective projection gives the flat canvas real front/back depth.
        for (let ring = 0; ring < 3; ring++) {
          ctx.beginPath();
          for (let i = 0; i <= 90; i++) {
            const a = i / 90 * Math.PI * 2;
            const r = Math.min(width, height) * (.22 + ring * .065);
            const px = Math.cos(a) * r, py = Math.sin(a) * r;
            const z = Math.sin(a + t + ring) * r * .8;
            const perspective = 440 / (440 + z);
            const sx = width * .74 + (px * Math.cos(t + ring * .5) - py * Math.sin(t) * .25 + x * 25) * perspective;
            const sy = height * .48 + (py * .48 + Math.sin(t) * px * .35 + y * 22) * perspective;
            if (i === 0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy);
          }
          ctx.strokeStyle = ring === 1 ? "rgba(24,22,23,.24)" : "rgba(255,107,53,.42)";
          ctx.lineWidth = ring === 1 ? 1 : 2; ctx.stroke();
        }
        for (let i = 0; i < 13; i++) {
          const a = t * (.3 + i * .015) + i * 2.4;
          const radius = Math.min(width, height) * (.2 + (i % 4) * .065);
          ctx.beginPath(); ctx.arc(width * .74 + Math.cos(a) * radius, height * .48 + Math.sin(a) * radius * .63, i % 3 + 2, 0, Math.PI * 2);
          ctx.fillStyle = i % 2 ? "#181617" : "#ff6b35"; ctx.fill();
        }
      }
      if (motion) frame = requestAnimationFrame(draw);
    };
    draw(0);
    return () => { cancelAnimationFrame(frame); resize.disconnect(); observer.disconnect(); host.removeEventListener("pointermove", pointer); host.removeEventListener("pointerleave", leave); };
  }, [motion]);

  const current = scenes[scene];
  return <section className={`station-hero ${motion ? "motion-on" : "motion-off"}`} ref={root}>
    <canvas className="orbit-canvas" aria-hidden="true" ref={canvas} />
    <div className="hero-copy">
      <p className="eyebrow"><span className="broadcast-dot" /> GOOD EVENINGS, BACK ON THE AIR.</p>
      <h1>Less scroll.<br /><span className="hero-round">More <em>oh,</em><br />that&apos;s good.</span></h1>
      <p className="hero-description">A little match day. A little movie magic. Something you didn&apos;t know you&apos;d love. Your own YouTube lineup, without the endless hunt.</p>
      <div className="hero-actions"><Link className="button playful" href={connected ? "#your-station" : "/api/auth/google/start"}>{connected ? "Make tonight's mix" : "Make yourself at home"}<span aria-hidden="true">↗</span></Link><span className="handwritten">stay curious.</span></div>
      <p className="hero-fine">Your account. Your taste. Room for a surprise.</p>
    </div>
    <div className="television-wrap">
      <div className="sticker sticker-top">GOOD STUFF<br />IS STILL ON.</div>
      <div className="television">
        <div className={`scenery scene-${current.type}`} key={scene}>
          {current.image && !mediaFailed ? <Image src={current.image} fill unoptimized priority={scene === 0} sizes="(max-width: 800px) 90vw, 50vw" alt="" onError={() => setMediaFailed(true)} /> : <div className="vector-scenery" aria-hidden="true"><span className="vector-sun" /><span className="vector-grid" /><span className="vector-orbit" /><span className="vector-star">✦</span></div>}
          {current.type === "video" && motion && !mediaFailed ? <video autoPlay loop muted playsInline preload="none" poster={current.image} onError={() => setMediaFailed(true)} src="https://videos.pexels.com/video-files/11009171/11009171-hd_3840_2160_30fps.mp4" aria-hidden="true" /> : null}
          <div className="scene-tint" /><div className="scanlines" />
          <div className="screen-top"><span>PTV / 0{scene + 1}</span><span>YOUR WORLD, WIDER.</span></div>
          <div className="screen-title"><span>{current.tag}</span><h2>{current.title}</h2></div>
        </div>
        <div className="tv-chin"><span className="checker-logo" aria-label="Personal TV"><b>P</b><b>TV</b></span><div className="scene-dots" aria-label="Scenery slides">{scenes.map((_, i) => <button key={i} aria-label={`Scenery ${i + 1}`} aria-pressed={scene === i} onClick={() => { setScene(i); last.current = i; setMediaFailed(false); }} />)}</div><button className="channel-knob" onClick={nextScene} aria-label="Shuffle scenery">↻</button></div>
      </div>
      <div className="station-buddy" aria-hidden="true"><div className="buddy-eyes"><span><i /></span><span><i /></span></div><span className="buddy-smile" /><span className="buddy-leg left" /><span className="buddy-leg right" /></div>
      <div className="stage-controls"><button className="text-button" onClick={() => { setMotion(!motion); localStorage.setItem("personal-tv-motion", motion ? "off" : "on"); }}>{motion ? "Ⅱ Pause the motion" : "▶ Turn on the motion"}</button>{current.credit ? <a href={current.credit} target="_blank" rel="noreferrer">Scenery credit ↗</a> : <span>Made of little shapes &amp; curiosity.</span>}</div>
    </div>
  </section>;
}
