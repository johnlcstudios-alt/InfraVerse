import { Canvas, useFrame, useMaterial, useTransform } from '@rea/renderer';
import { Mesh, Box, Cylinder, Plane } from '@rea/primitives';
import { useState, useEffect } from 'react';

const SolarPanel = () => (
  <Plane geometry={{ width: 2, height: 1.5 }} color="#1d476f" />
);

const Battery = () => (
  <Box geometry={{ width: 2, height: 1, depth: 1 }} color="#0a2038" />
);

const Inverter = () => (
  <Cylinder geometry={{ radius: 0.5, height: 1 }} color="#3d7bb8" />
);

const EnergyFlow = () => {
  const [solarGeneration, setSolarGeneration] = useState(0);
  const [batteryCharge, setBatteryCharge] = useState(0);
  const [loadDemand, setLoadDemand] = useState(0);
  const [gridImport, setGridImport] = useState(0);
  
  // Simulate energy flow
  useEffect(() => {
    const interval = setInterval(() => {
      // Solar generation varies from 0 to 4.2 kW
      setSolarGeneration(Math.random() * 4.2);
      
      // Battery charge/discharge logic
      const netFlow = setSolarGeneration() - setLoadDemand();
      if (netFlow > 0) {
        // Charging
        setBatteryCharge(Math.min(9.6, setBatteryCharge() + netFlow * 0.1));
      } else {
        // Discharging
        setBatteryCharge(Math.max(0, setBatteryCharge() - Math.abs(netFlow) * 0.1));
      }
      
      // Grid import
      setGridImport(Math.max(0, setLoadDemand() - setSolarGeneration()));
      
      setLoadDemand(Math.random() * 2.5);
    }, 5000);
    return () => clearInterval(interval);
  }, []);
  
  return (
    <Canvas>
      {/* Solar panels */}
      <Mesh position={[0, 1, 0]}>
        <SolarPanel />
      </Mesh>
      
      {/* Battery bank */}
      <Mesh position={[5, 1, 0]}>
        <Battery />
      </Mesh>
      
      {/* Inverter */}
      <Mesh position={[10, 1, 0]}>
        <Inverter />
      </Mesh>
      
      {/* Energy flow indicators */}
      <div style={{ position: 'absolute', top: 10, left: 10, color: 'white', fontSize: 14 }}>
        Solar: {solarGeneration.toFixed(1)} kW | Battery: {batteryCharge.toFixed(1)} kWh | Load: {loadDemand.toFixed(1)} kW | Grid: {gridImport.toFixed(1)} kW
      </div>
    </Canvas>
  );
};

export default EnergyFlow;