import { Canvas, useFrame, useMaterial, useTransform } from '@rea/renderer';
import { Mesh, Box, Cylinder } from '@rea/primitives';
import { useState, useEffect } from 'react';

const Bay = () => (
  <Box geometry={{ width: 8, height: 4, depth: 4 }} color="#46a9ff" />
);

const ParkingLot = () => {
  const [occupancy, setOccupancy] = useState(new Array(18).fill(false));
  const [vehiclePositions, setVehiclePositions] = useState([]);
  const [overstayAlerts, setOverstayAlerts] = useState([]);

  // Simulate vehicle movements
  useEffect(() => {
    const interval = setInterval(() => {
      // Update occupancy
      const newOccupancy = [...occupancy];
      // Randomly change some bays
      if (Math.random() > 0.8) {
        const randomBay = Math.floor(Math.random() * 18);
        newOccupancy[randomBay] = !newOccupancy[randomBay];
      }
      
      // Update vehicle positions
      const newPositions = [...vehiclePositions];
      // Add/remove vehicles
      if (Math.random() > 0.7) {
        const action = Math.random() > 0.5 ? 'enter' : 'exit';
        if (action === 'enter' && !newOccupancy[Math.floor(Math.random() * 18)]) {
          newPositions.push({ bay: Math.floor(Math.random() * 18), time: Date.now() });
        } else if (action === 'exit' && newOccupancy[Math.floor(Math.random() * 18)]) {
          const index = Math.floor(Math.random() * newPositions.length);
          newPositions.splice(index, 1);
        }
      }
      
      // Check for overstays
      const newAlerts = [];
      newPositions.forEach(vehicle => {
        const age = (Date.now() - vehicle.time) / 1000; // seconds
        if (age > 60) { // 60 second overstay limit
          newAlerts.push({ bay: vehicle.bay, time: vehicle.time });
        }
      });
      
      setOccupancy(newOccupancy);
      setVehiclePositions(newPositions);
      setOverstayAlerts(newAlerts);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <Canvas>
      {/* Parking lot bays */}
      {Array.from({length: 18}).map((_, i) => (
        <Bay key={i} />
      ))}
      
      {/* Vehicles */}
      {vehiclePositions.map((vehicle, i) => (
        <Box 
          key={i} 
          geometry={{ width: 1, height: 0.5, depth: 2 }}
          color="#ff6f61"
          position={[vehicle.bay * 12, 0.5, 0]}
          rotation={[0, 0, vehicle.bay * 0.2]}
        />
      ))}
      
      {/* Overstay alerts */}
      <div style={{ position: 'absolute', top: 10, left: 10, color: 'red', fontSize: 12 }}>
        {overstayAlerts.map((alert, i) => (
          <div key={i}>Bay {alert.bay} - Overstay at {Math.floor((Date.now() - alert.time)/60000)} min</div>
        ))}
      </div>
    </Canvas>
  );
};

export default ParkingLot;