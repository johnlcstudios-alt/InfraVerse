import { Canvas, useFrame, useMaterial, useTransform } from '@rea/renderer';
import { Mesh, Box, Sphere } from '@rea/primitives';
import { useState, useEffect } from 'react';

const Zone = ({ position, color, temperature }) => (
  <Box 
    position={[...position]} 
    geometry={{ width: 4, height: 4, depth: 4 }}
    color={color}
  />
);

const ColdStorage = () => {
  const [zones, setZones] = useState([
    { id: 'A', position: [0, 0, 0], color: '#3b6e8e', temperature: 2.5 },
    { id: 'B', position: [5, 0, 0], color: '#9fb4bf', temperature: 4.0 },
    { id: 'C', position: [0, 5, 0], color: '#63b6ff', temperature: -18.0 },
    { id: 'D', position: [5, 5, 0], color: '#2f5f70', temperature: 1.0 }
  ]);
  
  const [compressorRunning, setCompressorRunning] = useState(false);
  const [doorStatus, setDoorStatus] = useState({ A: 'locked', B: 'unlocked' });
  
  // Simulate temperature changes
  useEffect(() => {
    const interval = setInterval(() => {
      setZones(prev => prev.map(zone => {
        let newTemp = zone.temperature;
        
        // Temperature changes based on zone and system status
        if (zone.id === 'A' && compressorRunning) {
          newTemp = Math.max(2.0, newTemp - 0.1);
        } else if (zone.id === 'B' && !compressorRunning) {
          newTemp = Math.min(4.5, newTemp + 0.2);
        }
        
        return { ...zone, temperature: newTemp };
      }));
      
      setZones(prev => prev);
    }, 5000);
    return () => clearInterval(interval);
  }, [compressorRunning]);
  
  return (
    <Canvas>
      {/* Zones */}
      {zones.map(zone => (
        <Zone 
          key={zone.id} 
          position={zone.position} 
          color={zone.color} 
          temperature={zone.temperature}
        />
      ))}
      
      {/* Compressor */}
      <Mesh position={[2, 4, 0]}>
        <Sphere geometry={{ radius: 0.5 }} color="#ff6f61" />
      </Mesh>
      
      {/* Door status */}
      <div style={{ position: 'absolute', top: 10, left: 10, color: 'white', fontSize: 12 }}>
        Zone A: {coldStorage.temperature.toFixed(1)}°C {closed ? '(Door Locked)' : '(Door Open)'} | 
        Zone B: {zones[1].temperature.toFixed(1)}°C {doorStatus.B === 'locked' ? '(Door Locked)' : '(Door Open)'}
      </div>
    </Canvas>
  );
};

export default ColdStorage;