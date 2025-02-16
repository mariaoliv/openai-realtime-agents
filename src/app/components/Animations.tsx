import { useEffect, useRef, useState } from "react";

export default function LiveVoiceVisualizer() {
  const audioRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isBlinking, setIsBlinking] = useState(false);

  useEffect(() => {
    const startMicrophone = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const analyser = audioCtx.createAnalyser();
        const source = audioCtx.createMediaStreamSource(stream);

        source.connect(analyser);
        analyser.fftSize = 64;
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
          ctx.fillStyle = "#0af";

          const barWidth = canvas.width / bufferLength;
          dataArray.forEach((value, i) => {
            const barHeight = value / 2;
            ctx.fillRect(i * barWidth, canvas.height - barHeight, barWidth - 2, barHeight);
          });
        }

        draw();
      } catch (error) {
        console.error("Error accessing microphone:", error);
      }
    };

    startMicrophone();

    return () => {
      if (audioRef.current) {
        audioRef.current.disconnect();
      }
    };
  }, []);

  // Randomized Blinking Effect
  useEffect(() => {
    const blinkInterval = setInterval(() => {
      setIsBlinking(true);
      setTimeout(() => setIsBlinking(false), 150);
    }, Math.random() * 4000 + 2000);

    return () => clearInterval(blinkInterval);
  }, []);

  return (
    <div className="flex flex-col items-center gap-2">
      {/* Eyes */}
      <div className="flex gap-4">
        <div className={`w-6 h-3 bg-black rounded-full transition-all ${isBlinking ? "h-1" : ""}`} />
        <div className={`w-6 h-3 bg-black rounded-full transition-all ${isBlinking ? "h-1" : ""}`} />
      </div>

      {/* Voice Visualization */}
      <canvas ref={canvasRef} width={300} height={100} className="bg-gray-800 rounded-md" />
    </div>
  );
}
