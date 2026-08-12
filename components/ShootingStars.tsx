"use client";

import { useEffect, useState } from "react";

type Star = {
  id: number;
  top: number;
  left: number;
  size: number;
  duration: number;
  delay: number;
};

export default function ShootingStars() {
  const [stars, setStars] = useState<Star[]>([]);

  useEffect(() => {
    let idCounter = 0;
    let spawnTimer: number | null = null;
    const removalTimers = new Set<number>();

    const clearSpawnTimer = () => {
      if (spawnTimer !== null) {
        window.clearTimeout(spawnTimer);
        spawnTimer = null;
      }
    };

    const createStar = () => {
      if (document.hidden) return;

      const newStar: Star = {
        id: idCounter++,
        top: Math.random() * 95,
        left: -20 - Math.random() * 20,
        size: 140 + Math.random() * 140,
        duration: 2.8 + Math.random() * 2.8,
        delay: 0,
      };

      setStars((prev) => [...prev, newStar]);

      const lifeTime = (newStar.duration + 0.2) * 1000;
      const removalTimer = window.setTimeout(() => {
        removalTimers.delete(removalTimer);
        setStars((prev) => prev.filter((star) => star.id !== newStar.id));
      }, lifeTime);

      removalTimers.add(removalTimer);
    };

    const scheduleNext = (delay: number) => {
      clearSpawnTimer();
      if (document.hidden) return;

      spawnTimer = window.setTimeout(() => {
        spawnTimer = null;
        createStar();
        scheduleNext(700 + Math.random() * 1800);
      }, delay);
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        clearSpawnTimer();
        return;
      }

      scheduleNext(250);
    };

    scheduleNext(800);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      clearSpawnTimer();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      removalTimers.forEach((timer) => window.clearTimeout(timer));
      removalTimers.clear();
    };
  }, []);

  return (
    <div className="shooting-stars-layer" aria-hidden="true">
      {stars.map((star) => (
        <span
          key={star.id}
          className="shooting-star-random"
          style={{
            top: `${star.top}%`,
            left: `${star.left}%`,
            width: `${star.size}px`,
            animationDuration: `${star.duration}s`,
            animationDelay: `${star.delay}s`,
          }}
        />
      ))}
    </div>
  );
}
