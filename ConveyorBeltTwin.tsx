import { Canvas, useFrame, useMaterial, useTransform } from '@rea/renderer';
import { Mesh, Box, Cylinder } from '@rea/primitives';
import { useState, useEffect } from 'react';

const Carton = () => (
  <Box geometry={{ width: 0.2, height: 0.2, depth: 0.2 }} color="#4A90E2" />
);

const Conveyor = () => {
  const [cartons, setCartons] = useState([]);
  const [motorTemp, setMotorTemp] = useState(0);
  const [jam, setJam] = useState(false);
  const [stats, setStats] = useState({ sorted: 0, temperature: 0 });

  // Generate cartons entering the loop
  useEffect(() => {
    const interval = setInterval(() => {
      if (!jam) {
        setCartons(prev => [...prev, <Carton />]);
        setStats(s => ({ ...s, sorted: s.sorted + 1 }));
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [jam]);

  // Motor thermal model
  useFrame(() => {
    if (!jam) {
      setMotorTemp(prev => prev + 0.01);
      if (motorTemp > 80) setJam(true);
    } else {
      setMotorTemp(prev => prev - 0.1);
      if (motorTemp < 30) setJam(false);
    }
  });

  // Rule-based diverter: heavy cartons (simulated weight >5kg) go left
  const Diverter = () => (
    <Cylinder geometry={{ radius: 0.1, height: 0.5 }} color="#FF6F61" />
  );

  return (
    <Canvas>
      <Mesh position={[0, 0, 0]}>
        {/* U-shaped track */}
        <Box geometry={{ width: 2, height: 0.2, depth: 10 }} color="#555" />
        {/* Motor */}
        <Cylinder geometry={{ radius: 0.3, height: 0.5 }} position={[0, 0.5, 0]} color="#8B4513" />
        {/* Cartons */}
        {cartons.map((c, i) => (
          <Box key={i} geometry={{ width: 0.2, height: 0.2, depth: 0.2 }} color="#4A90E2" />
        ))}
        {/* Diverter logic (simplified) */}
        <Diverter />
      </Mesh>
      {/* Digital Twin Monitoring Mode overlay */}
      <div style={{ position: 'absolute', top: 10, left: 10, color: 'white', fontSize: 14 }}>
        Temp: {motorTemp.toFixed(1)}°C {jam ? '(JAM)' : ''} | Sorted: {stats.sorted}
      </div>
    </Canvas>
  );
};

export default Conveyor;