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

    const createStar = () => {
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

      setTimeout(() => {
        setStars((prev) => prev.filter((star) => star.id !== newStar.id));
      }, lifeTime);
    };

    const spawnLoop = () => {
      createStar();

      const nextSpawn = 700 + Math.random() * 1800;
      timeout = window.setTimeout(spawnLoop, nextSpawn);
    };

    let timeout = window.setTimeout(spawnLoop, 800);

    return () => {
      window.clearTimeout(timeout);
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