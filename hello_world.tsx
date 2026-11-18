import { Stage, Text3D } from 'rea';

export default function HelloWorld() {
  return (
    <Stage camera={{ position: [0, 0, 5], lookAt: [0, 0, 0] }}>
      <Text3D text="Hello World" fontSize={5} color="yellow" position={[0, 0, 0]} />
    </Stage>
  );
}