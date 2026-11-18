import * as raea from 'raea';

function SmartWaterTankScene({ frame }) {
  // Simulation parameters
  const time = frame * 0.03; // seconds per frame approx
  const waterLevel = 0.5 + 0.2 * Math.sin(time); // sinusoidal level between 0.5 and 0.7
  const pumpSpeed = 0.8 + 0.3 * Math.sin(time * 2); // variable speed
  const valveOpen = Math.abs(Math.sin(time * 1.5)) > 0.5; // toggles

  // Compute flow based on level and pump speed
  const flowRate = waterLevel * pumpSpeed * 10; // arbitrary units

  return (
    <rea.scene>
      {/* Transparent elevated reservoir */}
      <rea.cylinder
        position={[0, 0.5, 0]}
        radius={1.5}
        height={1}
        rotation={[0, Math.PI / 2, 0]}
        material={{
          color: [0.6, 0.8, 1, 0.4], // light blue with transparency
          transparent: true,
        }}
      />
      {/* Water surface */}
      <rea.plane
        position={[0, waterLevel, 0]}
        rotation={[0, 0, 0]}
        width={3}
        height={3}
        material={{
          color: [0.2, 0.6, 1, 0.6],
          transparent: true,
        }}
      />
      {/* Inlet pump (simple representation) */}
      <rea.cylinder
        position={[1.5, 0.5, 0]}
        radius={0.3}
        height={0.5}
        rotation={[0, 0, 0]}
        material={{ color: [0.9, 0.2, 0.2, 1] }}
      />
      {/* Motorised valve */}
      <rea.cylinder
        position={[-1.5, 0.5, 0]}
        radius={0.2}
        height={0.5}
        rotation={[0, 0, 0]}
        material={{ color: [0.2, 0.9, 0.2, 1] }}
        transform={{
          translateX: valveOpen ? 0 : 0.5,
        }}
      />
      {/* Flow monitoring gauge */}
      <rea.text
        position={[0, waterLevel + 0.7, 0]}
        content={`Level: ${waterLevel.toFixed(2)} m`}
        style={{ color: '#fff', fontSize: 0.2 }}
      />
      <rea.text
        position={[0, waterLevel + 0.5, 0]}
        content={`Pump Speed: ${pumpSpeed.toFixed(2)}`}
        style={{ color: '#fff', fontSize: 0.2 }}
      />
      <rea.text
        position={[0, waterLevel + 0.3, 0]}
        content={`Flow: ${flowRate.toFixed(2)} L/s`}
        style={{ color: '#fff', fontSize: 0.2 }}
      />
    </rea.scene>
  );
}

// Export as a function that raea can render per frame
export default SmartWaterTankScene;