import { useEffect, useRef, useState } from "react";

interface LiveVoiceVisualizerProps {
  audioElementRef: React.RefObject<HTMLAudioElement>;
}

export default function LiveVoiceVisualizer({ audioElementRef }: LiveVoiceVisualizerProps) {
  const audioRef = useRef<MediaElementAudioSourceNode | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isBlinking, setIsBlinking] = useState(false);

  useEffect(() => {
    if (!audioElementRef.current) return;

    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 64;

    const source = audioCtx.createMediaElementSource(audioElementRef.current);
    source.connect(analyser);
    analyser.connect(audioCtx.destination);
    audioRef.current = source;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    function draw() {
      requestAnimationFrame(draw);
      analyser.getByteFrequencyData(dataArray);

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const gradient = ctx.createLinearGradient(0, 0, canvas.width, 0);
      gradient.addColorStop(0, "#ff0000");
      gradient.addColorStop(0.5, "#00ff00");
      gradient.addColorStop(1, "#0000ff");
      ctx.fillStyle = gradient;

      const barWidth = canvas.width / (bufferLength * 2);
      const centerX = canvas.width / 2;
      const maxBarHeight = canvas.height / 2;
      const linearScalingFactor = 0.8;
      const nonLinearFactor = 0.5;

      dataArray.forEach((value, i) => {
        const linearScaledValue = value * linearScalingFactor;
        const nonLinearScaledValue = Math.pow(value / 255, nonLinearFactor) * 255;
        const combinedValue = (linearScaledValue + nonLinearScaledValue) / 2;
        const barHeight = (combinedValue / 255) * maxBarHeight;

        ctx.fillRect(centerX - (i * barWidth), canvas.height / 2 - barHeight, barWidth - 1, barHeight);
        ctx.fillRect(centerX - (i * barWidth), canvas.height / 2, barWidth - 1, barHeight);

        ctx.fillRect(centerX + (i * barWidth), canvas.height / 2 - barHeight, barWidth - 1, barHeight);
        ctx.fillRect(centerX + (i * barWidth), canvas.height / 2, barWidth - 1, barHeight);
      });

      const maxAmplitude = Math.max(...dataArray);
      if (maxAmplitude > 128) {
        setIsBlinking(true);
        setTimeout(() => setIsBlinking(false), 150);
      }
    }

    draw();

    return () => {
      source.disconnect();
      analyser.disconnect();
    };
  }, [audioElementRef]);

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="flex gap-4">
        <div className={`eye ${isBlinking ? "blink" : ""}`} />
        <div className={`eye ${isBlinking ? "blink" : ""}`} />
      </div>

      <canvas ref={canvasRef} width={300} height={100} className="bg-gray-800 rounded-md" />

      <style jsx>{`
        .eye {
          width: 20px;
          height: 20px;
          background-color: #000;
          border-radius: 50%;
          border: 2px solid #fff;
          transition: height 0.1s ease;
        }
        .blink {
          height: 4px;
        }
      `}</style>
    </div>
  );
}