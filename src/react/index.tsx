"use client";

import { forwardRef, useEffect, useRef, type CanvasHTMLAttributes } from "react";
import { LogoAnimator, type AnimatorState } from "../animator.js";
import type { Settings } from "../core/animation.js";
import type { LogoSource } from "../source.js";

export type LogoAnimatorCanvasProps = Omit<CanvasHTMLAttributes<HTMLCanvasElement>, "onError"> & {
  source: LogoSource;
  settings?: Partial<Settings>;
  autoPlay?: boolean;
  loop?: boolean;
  onReady?: (animator: LogoAnimator) => void;
  onLoaded?: (animator: LogoAnimator) => void;
  onStateChange?: (state: AnimatorState) => void;
  onError?: (error: Error) => void;
};

/** React 18/19 adapter. Owns controller cleanup and responsive sizing; exports no global CSS. */
export const LogoAnimatorCanvas = forwardRef<HTMLCanvasElement, LogoAnimatorCanvasProps>(function LogoAnimatorCanvas({
  source, settings, autoPlay = false, loop = false, onReady, onLoaded, onStateChange, onError,
  style, width = 960, height = 540, ...canvasProps
}, forwardedRef) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animatorRef = useRef<LogoAnimator | null>(null);
  const latest = useRef({ settings, autoPlay, loop, onReady, onLoaded, onStateChange, onError });
  latest.current = { settings, autoPlay, loop, onReady, onLoaded, onStateChange, onError };
  const settingsKey = JSON.stringify(settings ?? {});
  const report = (error: unknown) => {
    if (error instanceof Error && error.name === "AbortError") return;
    const value = error instanceof Error ? error : new Error(String(error));
    if (latest.current.onError) latest.current.onError(value);
    else console.error(value);
  };

  useEffect(() => {
    if (!canvasRef.current) return;
    let animator: LogoAnimator | undefined;
    try {
      animator = new LogoAnimator(canvasRef.current, { settings: latest.current.settings });
      animatorRef.current = animator;
      animator.on("change", state => latest.current.onStateChange?.(state));
      animator.on("error", report);
      if (canvasRef.current.parentElement) animator.observeResize(canvasRef.current.parentElement);
      latest.current.onReady?.(animator);
    } catch (error) { report(error); }
    return () => { animator?.dispose(); if (animatorRef.current === animator) animatorRef.current = null; };
  }, []);

  useEffect(() => {
    try { animatorRef.current?.updateSettings(latest.current.settings ?? {}); }
    catch (error) { report(error); }
  }, [settingsKey]);

  useEffect(() => {
    const animator = animatorRef.current;
    if (!animator) return;
    let active = true;
    animator.setLogo(source).then(() => {
      if (!active) return;
      latest.current.onLoaded?.(animator);
      if (latest.current.autoPlay) animator.play({ from: 0, loop: latest.current.loop });
    }).catch(error => { if (active) report(error); });
    return () => { active = false; };
  }, [source]);

  useEffect(() => {
    const animator = animatorRef.current;
    if (!animator?.state.loaded || animator.state.loading) return;
    try { if (autoPlay) animator.play({ loop }); else animator.pause(); }
    catch (error) { report(error); }
  }, [autoPlay, loop]);

  return <canvas {...canvasProps} width={width} height={height} aria-label={canvasProps["aria-label"] ?? "3D logo animation"}
    style={{ display: "block", width: "100%", height: "auto", aspectRatio: "16 / 9", ...style }}
    ref={canvas => {
      canvasRef.current = canvas;
      if (typeof forwardedRef === "function") forwardedRef(canvas);
      else if (forwardedRef) forwardedRef.current = canvas;
    }} />;
});
