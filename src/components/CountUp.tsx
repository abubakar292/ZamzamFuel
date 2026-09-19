import { useEffect, useState } from 'react';
import { formatAmount } from '../utils/calculations';

interface CountUpProps {
  end: number;
  duration?: number;
  isCurrency?: boolean;
}

export default function CountUp({ end, duration = 800, isCurrency = false }: CountUpProps) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let startTime: number | null = null;
    let animationFrameId: number;

    const targetValue = Number(end) || 0;
    const easeOutQuart = (t: number) => 1 - Math.pow(1 - t, 4);

    const animate = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const progress = timestamp - startTime;
      const percentage = Math.min(progress / duration, 1);
      
      const currentCount = easeOutQuart(percentage) * targetValue;
      setCount(currentCount);

      if (percentage < 1) {
        animationFrameId = requestAnimationFrame(animate);
      } else {
        setCount(targetValue); // Ensure it reaches exactly the end value
      }
    };

    animationFrameId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [end, duration]);

  return <span>{isCurrency ? formatAmount(count) : count.toFixed(2)}</span>;
}
