export default function Spark({ size = 36, color = "#ffc220" }) {
  return (
    <svg width={size} height={size} viewBox="-20 -20 40 40" aria-hidden="true">
      {[0, 60, 120, 180, 240, 300].map((angle) => (
        <rect key={angle} x="-2.9" y="-18.5" width="5.8" height="14" rx="2.9" fill={color} transform={`rotate(${angle})`} />
      ))}
    </svg>
  );
}
